/**
 * Revisión integral del sistema: invariantes que deben cumplirse siempre.
 *
 *   npx tsx scripts/revisar-sistema.ts
 *
 * No es una suite de tests unitarios: es una lista de comprobaciones sobre los
 * DATOS REALES y sobre cómo encajan los módulos entre sí. Sirve para correrla
 * antes de un despliegue y ver de un vistazo si algo dejó de cuadrar.
 *
 * Cada comprobación imprime OK o FALLA con la cifra concreta, y algunas
 * imprimen AVISO: cosas que no son errores del sistema sino datos que alguien
 * debería mirar (pólizas sin vencimiento, ramos sin tarifa…).
 */
import { prisma } from "../lib/prisma";
import {
  PRIMER_ANIO,
  calcularSeguimiento,
  hoyUTC,
  unRecibopPorColectiva,
} from "../lib/calculos";
import { aniosDisponibles, datosSeguimiento } from "../lib/queries";
import {
  cronogramaComision,
  cuotasDeFormaPago,
  inicioVigencia,
  porcentajeComision,
} from "../lib/comisiones";
import { esRamoColectivo } from "../lib/colectivas";
import { normalizarNumero } from "../lib/mapa-colectivas";

const cop = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
let fallas = 0;
let avisos = 0;

function ok(titulo: string, detalle: string) {
  console.log(`  OK    ${titulo.padEnd(52)} ${detalle}`);
}
function falla(titulo: string, detalle: string) {
  fallas++;
  console.log(`  FALLA ${titulo.padEnd(52)} ${detalle}`);
}
function aviso(titulo: string, detalle: string) {
  avisos++;
  console.log(`  AVISO ${titulo.padEnd(52)} ${detalle}`);
}
function comprobar(cond: boolean, titulo: string, detalle: string) {
  cond ? ok(titulo, detalle) : falla(titulo, detalle);
}
function seccion(t: string) {
  console.log(`\n== ${t} ${"=".repeat(Math.max(0, 66 - t.length))}`);
}

async function main() {
  const hoy = hoyUTC();
  console.log(`Revisión del CRM · corte ${hoy.toISOString().slice(0, 10)}`);

  // ---------------------------------------------------------------- CRONOGRAMA
  seccion("Comisiones: cronograma de cuotas");
  {
    const v = new Date(Date.UTC(2027, 2, 15)); // vigencia 2026-03-15
    const casos: [string, number, string, string][] = [
      // forma de pago, cuotas, primer mes de comisión, último
      ["CONTADO", 1, "2026-04", "2026-04"],
      ["FINESA", 1, "2026-04", "2026-04"],
      ["SERVICREDITO", 1, "2026-04", "2026-04"],
      ["ACUERDO DE PAGO", 3, "2026-05", "2026-07"],
      ["MENSUAL", 12, "2026-05", "2027-04"],
    ];
    for (const [fp, n, primero, ultimo] of casos) {
      const c = cronogramaComision(v, fp, 1200);
      const bien =
        c.length === n && c[0].mes === primero && c[c.length - 1].mes === ultimo;
      comprobar(bien, `${fp} → ${n} cuotas`, `${c[0]?.mes}…${c[c.length - 1]?.mes}`);
    }
    // El reparto no puede crear ni perder plata.
    const suma = cronogramaComision(v, "MENSUAL", 1200).reduce((s, c) => s + c.valor, 0);
    comprobar(Math.abs(suma - 1200) < 1e-9, "El reparto conserva el total", `${suma} de 1200`);
    // Diciembre tiene que saltar de año.
    const dic = cronogramaComision(new Date(Date.UTC(2027, 11, 20)), "CONTADO", 100);
    comprobar(dic[0].mes === "2027-01", "Diciembre salta a enero", dic[0].mes);
    // Sin vencimiento no se inventa nada.
    comprobar(
      cronogramaComision(null, "CONTADO", 100).length === 0,
      "Sin vencimiento no hay cronograma",
      "vacío"
    );
    comprobar(
      inicioVigencia(new Date(Date.UTC(2027, 2, 15)))!.toISOString().slice(0, 10) === "2026-03-15",
      "La vigencia es el vencimiento menos un año",
      "2026-03-15"
    );
  }

  // ------------------------------------------------------------------ CARTERA
  seccion("Cartera y comisiones sobre datos reales");
  const polizas = await prisma.policy.findMany();
  {
    const sinVto = polizas.filter((p) => !p.vencimiento).length;
    sinVto === 0
      ? ok("Todas las pólizas tienen vencimiento", "0 sin fecha")
      : aviso("Pólizas sin vencimiento", `${sinVto} quedan fuera de todo cálculo por año`);

    const sinTarifa = polizas.filter((p) => porcentajeComision(p.ramo) == null);
    sinTarifa.length === 0
      ? ok("Todos los ramos tienen tarifa de comisión", "0 sin tarifa")
      : aviso("Ramos sin tarifa", [...new Set(sinTarifa.map((p) => p.ramo))].join(", "));

    // La comisión total repartida debe coincidir con la comisión de la póliza.
    let descuadre = 0;
    for (const p of polizas) {
      const pct = porcentajeComision(p.ramo);
      if (pct == null) continue;
      const total = (p.primaNeta * pct) / 100;
      const repartido = cronogramaComision(p.vencimiento, p.formaPago, total).reduce(
        (s, c) => s + c.valor,
        0
      );
      if (p.vencimiento) descuadre += Math.abs(total - repartido);
    }
    comprobar(descuadre < 1, "El cronograma no pierde comisión en la cartera", `desvío ${cop(descuadre)}`);

    const conCuotas = polizas.filter((p) => cuotasDeFormaPago(p.formaPago) > 1).length;
    ok("Pólizas fraccionadas", `${conCuotas} de ${polizas.length} (mensual o acuerdo de pago)`);
  }

  // --------------------------------------------------------------- COLECTIVAS
  seccion("Colectivas: un recibo por póliza");
  {
    const col = polizas.filter((p) => esRamoColectivo(p.ramo));
    const filtradas = unRecibopPorColectiva(
      polizas.map((p) => ({
        numero: p.numero,
        ramo: p.ramo,
        tipoNegocio: p.tipoNegocio,
        primaNeta: p.primaNeta,
        vencimiento: p.vencimiento,
      }))
    );
    const colFiltradas = filtradas.filter((p) => esRamoColectivo(p.ramo));
    const numerosUnicos = new Set(col.map((p) => `${p.numero}|${p.ramo.toUpperCase()}`)).size;
    comprobar(
      colFiltradas.length === numerosUnicos,
      "Una fila por póliza colectiva",
      `${colFiltradas.length} filas para ${numerosUnicos} pólizas (antes ${col.length})`
    );
    // Lo no colectivo no se toca.
    const noColAntes = polizas.length - col.length;
    const noColDespues = filtradas.length - colFiltradas.length;
    comprobar(
      noColAntes === noColDespues,
      "No toca las pólizas que no son colectivas",
      `${noColDespues} intactas`
    );
    const primaFuera =
      col.reduce((s, p) => s + p.primaNeta, 0) - colFiltradas.reduce((s, p) => s + p.primaNeta, 0);
    if (primaFuera > 0)
      aviso("Prima de recibos de inclusión excluida", `${cop(primaFuera)} pasa al módulo de colectivas`);

    // --- Mapa de colectivas ---------------------------------------------
    const madres = await prisma.colectivaMadre.findMany();
    const recibos = await prisma.reciboColectiva.findMany();
    const marcadas = polizas.filter((p) => p.colectivaDe);
    ok("Colectivas declaradas", `${madres.length} madres · ${recibos.length} recibos`);
    comprobar(
      marcadas.length >= recibos.length,
      "Todo recibo declarado está marcado en la cartera",
      `${marcadas.length} filas marcadas para ${recibos.length} recibos`
    );

    // Ningún recibo puede colgar de una colectiva que no existe.
    const numerosMadre = new Set(madres.map((m) => normalizarNumero(m.numero)));
    const colgando = recibos.filter((r) => !numerosMadre.has(normalizarNumero(r.colectivaNumero)));
    comprobar(colgando.length === 0, "Ningún recibo cuelga de una colectiva inexistente", `${colgando.length}`);

    // Una madre nunca puede estar marcada como recibo de otra: sería un ciclo
    // y su prima desaparecería de la producción.
    const madresMarcadas = marcadas.filter(
      (p) => numerosMadre.has(normalizarNumero(p.numero)) && !recibos.some(
        (r) => normalizarNumero(r.numero) === normalizarNumero(p.numero) &&
               (r.placa ?? "") === (p.placa ?? "")
      )
    );
    comprobar(madresMarcadas.length === 0, "Ninguna colectiva madre quedó absorbida", `${madresMarcadas.length}`);

    // El ramo de cada madre debe ser el declarado, en toda la cartera.
    const ramoDe = new Map(madres.map((m) => [normalizarNumero(m.numero), m.ramo]));
    const malRamo = polizas.filter((p) => {
      const r = ramoDe.get(normalizarNumero(p.numero));
      return r && !p.colectivaDe && p.ramo !== r;
    });
    comprobar(malRamo.length === 0, "Las colectivas llevan su nombre de ramo", `${malRamo.length} sin renombrar`);

    // Lo absorbido no puede aparecer en vencimientos.
    const enVencimientos = await prisma.policy.count({
      where: { colectivaDe: { not: null }, vencimiento: { not: null } },
    });
    const salenEnVencimientos = await prisma.policy.count({
      where: { colectivaDe: null, vencimiento: { not: null } },
    });
    ok(
      "Recibos fuera de vencimientos",
      `${enVencimientos} absorbidos · ${salenEnVencimientos} pólizas siguen listándose`
    );

    /*
     * Toda colectiva declarada tiene que existir en la cartera, o no cuenta en
     * producción por mucho que tenga amparados. Es la comprobación que ata el
     * módulo de colectivas con el informe.
     */
    const numeros = new Set(polizas.map((p) => normalizarNumero(p.numero)));
    const sinPoliza = madres.filter((m) => !numeros.has(normalizarNumero(m.numero)));
    comprobar(
      sinPoliza.length === 0,
      "Toda colectiva existe también en la cartera",
      sinPoliza.length ? sinPoliza.map((m) => m.numero).join(", ") : `${madres.length} de ${madres.length}`
    );

    const manuales = polizas.filter((p) => p.manual);
    ok(
      "Pólizas creadas en el CRM",
      `${manuales.length} sobreviven a la importación del informe`
    );

    const amparados = await prisma.amparadoColectiva.count({ where: { estado: { not: "RETIRADO" } } });
    const empresas = await prisma.empresaColectiva.count();
    const sinAmparados = await prisma.empresaColectiva.count({ where: { amparados: { none: {} } } });
    ok("Amparados activos", `${amparados} en ${empresas - sinAmparados} de ${empresas} empresas`);
    if (sinAmparados)
      aviso("Empresas sin amparados cargados", `${sinAmparados} de ${empresas}`);
  }

  // ------------------------------------------------------------------- AÑOS
  seccion("Producción por año");
  const datos = await datosSeguimiento();
  const anios = await aniosDisponibles();
  {
    comprobar(anios[0] === PRIMER_ANIO, "El selector arranca en PRIMER_ANIO", String(anios[0]));
    const contiguos = anios.every((a, i) => i === 0 || a === anios[i - 1] + 1);
    comprobar(contiguos, "Los años del selector no tienen huecos", anios.join(", "));
    comprobar(
      anios.includes(hoy.getUTCFullYear()),
      "El año en curso está en el selector",
      String(hoy.getUTCFullYear())
    );

    for (const a of anios) {
      const s = calcularSeguimiento(datos, a);
      const t = s.consolidado.at(-1)!;
      // El TOTAL debe ser la suma de los doce meses.
      const suma12 = s.consolidado.slice(0, 12).reduce((x, f) => x + f.real, 0);
      comprobar(
        Math.abs(suma12 - t.real) < 1,
        `${a}: el TOTAL cuadra con los 12 meses`,
        `${cop(t.real)}`
      );
      // Neta = real − cancelaciones, siempre.
      comprobar(
        Math.abs(t.neta - (t.real - t.cancelaciones)) < 1,
        `${a}: neta = real − cancelaciones`,
        `${cop(t.neta)}`
      );
      // Consolidado = suma de todos los ramos.
      const porRamo = [...s.porRamo.values()].reduce((x, filas) => x + filas.at(-1)!.real, 0);
      comprobar(
        Math.abs(porRamo - t.real) < 1,
        `${a}: el consolidado cuadra con los ramos`,
        `${s.ramos.length} ramos`
      );
      // Meta = (base + producción cancelada) × 1,15.
      const esperada = (t.base + t.produccionCancelada) * 1.15;
      comprobar(
        Math.abs(esperada - t.meta) < 1,
        `${a}: meta = (base + prod. cancelada) × 1,15`,
        `${cop(t.meta)}`
      );
    }

    // Un año futuro sin datos no puede reventar ni inventar un 0%.
    const futuro = calcularSeguimiento(datos, Math.max(...anios) + 3).consolidado.at(-1)!;
    comprobar(
      futuro.real === 0 && futuro.cumplimiento === null,
      "Un año sin datos da 0 y cumplimiento «—»",
      `real ${futuro.real}, cumpl ${futuro.cumplimiento}`
    );

    // La base de un año es la producción del anterior.
    for (const a of anios.filter((x) => x > PRIMER_ANIO)) {
      const base = calcularSeguimiento(datos, a).consolidado.at(-1)!.base;
      const previo = calcularSeguimiento(datos, a - 1).consolidado.at(-1)!.real;
      comprobar(
        Math.abs(base - previo) < 1,
        `${a}: la base es la producción de ${a - 1}`,
        cop(base)
      );
    }
  }

  // ------------------------------------------------------------------- FOTOS
  seccion("Fotos anuales");
  {
    const fotos = await prisma.fotoPoliza.groupBy({
      by: ["anioProduccion"],
      _count: true,
      _sum: { primaNeta: true },
    });
    if (!fotos.length) aviso("No hay fotos tomadas", "los años cerrados se erosionarán");
    for (const f of fotos) {
      ok(
        `Foto ${f.anioProduccion}`,
        `${f._count} pólizas · ${cop(f._sum.primaNeta ?? 0)}`
      );
      // La foto tiene que ser mayor que lo que queda vivo en la cartera.
      const vivas = polizas.filter(
        (p) => p.vencimiento?.getUTCFullYear() === f.anioProduccion + 1
      );
      const primaViva = vivas.reduce((s, p) => s + p.primaNeta, 0);
      if ((f._sum.primaNeta ?? 0) < primaViva)
        falla(
          `Foto ${f.anioProduccion} más pequeña que la cartera viva`,
          `${cop(f._sum.primaNeta ?? 0)} < ${cop(primaViva)}`
        );
      else
        ok(
          `Foto ${f.anioProduccion} conserva lo ya renovado`,
          `+${cop((f._sum.primaNeta ?? 0) - primaViva)} sobre la cartera viva`
        );
    }
    // El año en curso no debería tener foto todavía.
    if (fotos.some((f) => f.anioProduccion >= hoy.getUTCFullYear()))
      aviso(
        "Hay foto de un año no cerrado",
        "se congeló producción incompleta; retómela en enero"
      );
  }

  // ---------------------------------------------------------------- INTEGRIDAD
  seccion("Integridad entre módulos");
  {
    const cancel = await prisma.cancellation.findMany();
    const sinFechaCanc = cancel.filter((c) => !c.fechaCancelacion).length;
    if (sinFechaCanc)
      aviso(
        "Cancelaciones sin fecha de cancelación",
        `${sinFechaCanc} de ${cancel.length}: no aparecen en la columna mensual`
      );

    // Amparados colgando de una póliza que ya no está en la cartera.
    /*
     * Se exige coincidencia EXACTA, no normalizada, a propósito: normalizar
     * aquí escondería justo lo que hay que detectar. Si un amparado guarda el
     * número con otra grafía que la cartera, `sincronizarAmparados` debió
     * haberlo reescrito; que aparezca aquí significa que no corrió o que la
     * póliza no existe.
     */
    const numeros = new Set(polizas.map((p) => p.numero));
    const amp = await prisma.amparadoColectiva.findMany({
      select: { polizaNumero: true, ramo: true },
    });
    const huerfanos = [...new Set(amp.map((a) => a.polizaNumero).filter((n) => !numeros.has(n)))];
    comprobar(
      huerfanos.length === 0,
      "Los amparados apuntan a pólizas de la cartera",
      huerfanos.length ? huerfanos.join(", ") : `${amp.length} amparados`
    );

    // Y con el mismo ramo, o el módulo y el informe dirían cosas distintas de
    // la misma póliza. Se compara contra la MADRE: los recibos de inclusión
    // comparten número y conservan el ramo del informe, así que tomarlos daría
    // un falso desajuste.
    const ramoDePoliza = new Map(
      polizas.filter((p) => p.colectivaDe == null).map((p) => [p.numero, p.ramo])
    );
    const desalineados = amp.filter((a) => {
      const r = ramoDePoliza.get(a.polizaNumero);
      return r && r !== a.ramo;
    });
    comprobar(
      desalineados.length === 0,
      "El ramo del amparado coincide con el de su póliza",
      desalineados.length ? `${desalineados.length} desalineados` : "todos"
    );

    // Empresas de colectivas sin póliza colectiva en la cartera.
    const empresas = await prisma.empresaColectiva.findMany({ select: { nombre: true } });
    const asegurados = polizas
      .filter((p) => esRamoColectivo(p.ramo))
      .map((p) => p.asegurado.toUpperCase());
    const sinPoliza = empresas.filter(
      (e) => !asegurados.some((a) => a.includes(e.nombre.split(" ")[0].toUpperCase()))
    );
    if (sinPoliza.length)
      aviso(
        "Empresas colectivas sin póliza en la cartera",
        sinPoliza.map((e) => e.nombre).join(", ")
      );
  }

  console.log(
    `\n${fallas === 0 ? "Sin fallas." : `${fallas} FALLAS.`} ${avisos} avisos (datos por revisar, no errores).`
  );
  await prisma.$disconnect();
  process.exit(fallas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
