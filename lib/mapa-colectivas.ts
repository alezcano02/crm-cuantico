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

  return {
    madresRenombradas,
    recibosMarcados,
    recibosLimpiados,
    recibosSinPoliza,
    madresSinPoliza,
    primaAbsorbida,
  };
}
