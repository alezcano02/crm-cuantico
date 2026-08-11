/**
 * Aplica a la cartera el mapa de colectivas.
 *
 * EL PROBLEMA
 *
 * El informe de producción no distingue una póliza colectiva de las
 * inclusiones que cuelgan de ella. Cada inclusión llega como su propia fila,
 * con su número y su prima, y termina apareciendo en vencimientos como si
 * hubiera que renovarla una a una. No hay que renovarla: se renueva la
 * colectiva. Y todas caen bajo el mismo ramo —COLECTIVA, VIDA GRUPO o SALUD—,
 * así que en el dashboard no se pueden separar las de autos de las de vida.
 *
 * LA SOLUCIÓN
 *
 * Dos tablas mandan sobre lo que diga el Excel:
 *
 *  · `ColectivaMadre`  — qué pólizas son colectivas y con qué nombre de ramo
 *                        aparecen en toda la aplicación.
 *  · `ReciboColectiva` — qué filas del informe son recibos de una colectiva y
 *                        deben absorberse en ella.
 *
 * `aplicarMapaColectivas` reescribe la cartera con esas dos tablas: pone el
 * ramo nuevo en las madres y marca `colectivaDe` en los recibos. A partir de
 * ahí, TODA la aplicación ve los datos ya corregidos sin que cada pantalla
 * tenga que acordarse de nada.
 *
 * POR QUÉ SE ESCRIBE EN LA PÓLIZA Y NO SE CALCULA AL VUELO
 *
 * Porque las pólizas se leen desde una docena de sitios —dashboard, seguimiento,
 * vencimientos, cartera, comisiones, búsqueda, cumpleaños— y cualquiera que se
 * olvidara de aplicar el mapa mostraría cifras distintas de las de al lado. Un
 * solo punto de escritura es más fácil de mantener correcto que doce puntos de
 * lectura.
 *
 * Se vuelve a aplicar después de cada importación del informe (que borra y
 * recrea la cartera) y cada vez que se cambia el mapa desde la pantalla de
 * colectivas.
 */
import { prisma } from "./prisma";

/**
 * Compara números de póliza sin que estorben los ceros de la izquierda.
 *
 * El informe escribe «091000812843» y las hojas de la operación
 * «91000812843»: es la misma póliza. Comparar como texto las separaba.
 */
export function normalizarNumero(numero: string): string {
  return numero.trim().replace(/^0+/, "").toUpperCase();
}

/** Placa normalizada, o cadena vacía. Ver el modelo `ReciboColectiva`. */
export function normalizarPlaca(placa: string | null | undefined): string {
  return (placa ?? "").trim().toUpperCase();
}

/**
 * Busca la póliza previa a la que corresponde una fila del informe.
 *
 * La reimportación casa por NÚMERO + RAMO para no confundir dos pólizas que
 * comparten número y son cosas distintas (83001205694 existe como VIDA GRUPO y
 * como VIDA). Pero a las colectivas se les cambia el ramo en el CRM —el informe
 * dice COLECTIVA y aquí ponemos «Colectiva Autos»—, así que esa comparación
 * dejaba de casar justo en ellas y su cobranza se perdía en cada importación.
 *
 * Para las pólizas declaradas como colectivas se casa solo por número, que en
 * ellas sí es identificador suficiente: el mapa declara una madre por número.
 */
export function buscadorDePrevias<T extends { numero: string; ramo: string }>(
  previas: T[],
  numerosColectivos: Set<string>
): (numero: string, ramo: string) => T | undefined {
  const porNumeroYRamo = new Map(previas.map((p) => [`${p.numero}|${p.ramo}`, p]));
  const porNumero = new Map(
    previas
      .filter((p) => numerosColectivos.has(normalizarNumero(p.numero)))
      .map((p) => [normalizarNumero(p.numero), p])
  );
  return (numero, ramo) =>
    porNumeroYRamo.get(`${numero}|${ramo}`) ?? porNumero.get(normalizarNumero(numero));
}

/** Números declarados como colectiva madre, ya normalizados. */
export async function numerosColectivos(): Promise<Set<string>> {
  const madres = await prisma.colectivaMadre.findMany({ select: { numero: true } });
  return new Set(madres.map((m) => normalizarNumero(m.numero)));
}

/**
 * Ata cada amparado a la póliza del informe que le corresponde.
 *
 * EL PROBLEMA
 *
 * Los listados de la aseguradora escriben la póliza con ceros a la izquierda
 * («091000812843») y el informe de producción sin ellos («91000812843»). Es la
 * misma póliza, pero como texto no coinciden, así que los 280 amparados de las
 * colectivas de salud y vida de Cristica y Espumas quedaban colgando de una
 * póliza que, para el CRM, no existía: no había forma de saltar del amparado a
 * su póliza ni de sumar la cobertura contra la prima.
 *
 * Y el ramo iba por su cuenta: el amparado decía «SALUD» o «VIDA GRUPO» —lo
 * que traía el listado— mientras la cartera ya mostraba «Colectiva Salud».
 *
 * LA SOLUCIÓN
 *
 * Se busca la póliza comparando sin ceros y, cuando aparece, se copia su
 * número y su ramo TAL COMO ESTÁN en la cartera. A partir de ahí las dos
 * tablas hablan igual.
 *
 * Corre dentro de `aplicarMapaColectivas`, que se ejecuta después de cada
 * importación, así que el cruce se rehace solo y no puede volver a desviarse
 * aunque el informe cambie la grafía de un número.
 */
async function sincronizarAmparados(): Promise<{ renumerados: number; reramados: number }> {
  const [amparados, polizas] = await Promise.all([
    prisma.amparadoColectiva.findMany({ select: { id: true, polizaNumero: true, ramo: true } }),
    prisma.policy.findMany({ select: { numero: true, ramo: true, colectivaDe: true } }),
  ]);

  /*
   * Índice por número normalizado.
   *
   * Un mismo número puede tener varias filas: la colectiva madre y sus recibos
   * de inclusión. Gana SIEMPRE la madre, que es de la que cuelgan los
   * amparados y la única que lleva el nombre de ramo bueno —los recibos se
   * absorben antes de renombrar, así que conservan el «COLECTIVA» del informe
   * y copiarlo dejaría al amparado peor de lo que estaba.
   */
  const canonica = new Map<string, { numero: string; ramo: string; madre: boolean }>();
  for (const p of polizas) {
    const k = normalizarNumero(p.numero);
    const esMadre = p.colectivaDe == null;
    const previa = canonica.get(k);
    if (!previa || (esMadre && !previa.madre)) {
      canonica.set(k, { numero: p.numero, ramo: p.ramo, madre: esMadre });
    }
  }

  let renumerados = 0;
  let reramados = 0;
  for (const a of amparados) {
    const real = canonica.get(normalizarNumero(a.polizaNumero));
    if (!real) continue;
    const data: { polizaNumero?: string; ramo?: string } = {};
    if (a.polizaNumero !== real.numero) data.polizaNumero = real.numero;
    if (a.ramo !== real.ramo) data.ramo = real.ramo;
    if (!Object.keys(data).length) continue;
    try {
      await prisma.amparadoColectiva.update({ where: { id: a.id }, data });
      if (data.polizaNumero) renumerados++;
      if (data.ramo) reramados++;
    } catch {
      // Choca contra (póliza, empleado, amparado) porque la misma persona ya
      // existe con la grafía buena: es un duplicado de las dos formas del
      // número y se deja como está en vez de tumbar la importación entera.
    }
  }
  return { renumerados, reramados };
}

export interface ResultadoMapa {
  madresRenombradas: number;
  recibosMarcados: number;
  recibosLimpiados: number;
  /** Recibos declarados que no existen en la cartera. */
  recibosSinPoliza: string[];
  /** Colectivas declaradas que no existen en la cartera. */
  madresSinPoliza: string[];
  /** Prima que deja de contar aparte por absorberse en su colectiva. */
  primaAbsorbida: number;
  /** Amparados cuyo número de póliza se reescribió al del informe. */
  amparadosRenumerados: number;
  /** Amparados cuyo ramo se alineó con el de la cartera. */
  amparadosReramados: number;
}

/**
 * Reescribe la cartera según el mapa. Idempotente: correrla dos veces seguidas
 * deja exactamente el mismo resultado.
 */
export async function aplicarMapaColectivas(): Promise<ResultadoMapa> {
  const [madres, recibos, polizas] = await Promise.all([
    prisma.colectivaMadre.findMany(),
    prisma.reciboColectiva.findMany(),
    prisma.policy.findMany({
      select: { id: true, numero: true, placa: true, ramo: true, primaNeta: true, colectivaDe: true },
    }),
  ]);

  const ramoDe = new Map(madres.map((m) => [normalizarNumero(m.numero), m.ramo]));

  /*
   * Índice de recibos por (número, placa) y por número a secas.
   *
   * Los dos niveles hacen falta: casi todos los recibos se identifican solo por
   * el número, pero cuando ese número también es el de la colectiva madre
   * —2000691934 aparece como madre y como inclusión del vehículo PWY867— la
   * placa es lo único que los separa. Manda siempre la coincidencia con placa.
   */
  const porNumeroYPlaca = new Map<string, string>();
  const porNumero = new Map<string, string>();
  for (const r of recibos) {
    const n = normalizarNumero(r.numero);
    const p = normalizarPlaca(r.placa);
    if (p) porNumeroYPlaca.set(`${n}|${p}`, r.colectivaNumero);
    else porNumero.set(n, r.colectivaNumero);
  }

  const vistosRecibo = new Set<string>();
  const vistasMadre = new Set<string>();
  let madresRenombradas = 0;
  let recibosMarcados = 0;
  let recibosLimpiados = 0;
  let primaAbsorbida = 0;

  for (const p of polizas) {
    const n = normalizarNumero(p.numero);
    const placa = normalizarPlaca(p.placa);

    const conPlaca = porNumeroYPlaca.get(`${n}|${placa}`);
    const soloNumero = porNumero.get(n);
    const madre = conPlaca ?? soloNumero ?? null;

    if (madre) {
      vistosRecibo.add(conPlaca ? `${n}|${placa}` : n);
      primaAbsorbida += p.primaNeta;
      if (p.colectivaDe !== madre) {
        await prisma.policy.update({ where: { id: p.id }, data: { colectivaDe: madre } });
        recibosMarcados++;
      }
      continue;
    }

    // Dejó de estar declarada como recibo: vuelve a ser una póliza normal.
    if (p.colectivaDe) {
      await prisma.policy.update({ where: { id: p.id }, data: { colectivaDe: null } });
      recibosLimpiados++;
    }

    const ramoNuevo = ramoDe.get(n);
    if (ramoNuevo) {
      vistasMadre.add(n);
      if (p.ramo !== ramoNuevo) {
        await prisma.policy.update({ where: { id: p.id }, data: { ramo: ramoNuevo } });
        madresRenombradas++;
      }
    }
  }

  const recibosSinPoliza = recibos
    .filter((r) => {
      const n = normalizarNumero(r.numero);
      const p = normalizarPlaca(r.placa);
      return !vistosRecibo.has(p ? `${n}|${p}` : n);
    })
    .map((r) => (r.placa ? `${r.numero} (${r.placa})` : r.numero));

  const madresSinPoliza = madres
    .filter((m) => !vistasMadre.has(normalizarNumero(m.numero)))
    .map((m) => m.numero);

  // Va al final, cuando la cartera ya tiene sus nombres de ramo definitivos:
  // así los amparados copian el ramo bueno y no el que había antes.
  const { renumerados, reramados } = await sincronizarAmparados();

  return {
    madresRenombradas,
    recibosMarcados,
    recibosLimpiados,
    recibosSinPoliza,
    madresSinPoliza,
    primaAbsorbida,
    amparadosRenumerados: renumerados,
    amparadosReramados: reramados,
  };
}
