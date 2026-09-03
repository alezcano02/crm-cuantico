/**
 * Carga la relación de cumplimiento y responsabilidad civil.
 *
 *   npx tsx scripts/importar-cumplimiento.ts "<archivo.xlsx>"              (ensayo)
 *   npx tsx scripts/importar-cumplimiento.ts "<archivo.xlsx>" --aplicar
 *
 * Estas pólizas no viven en el informe de producción: la agencia las lleva en
 * su propia relación porque no siguen el ciclo anual —una de cumplimiento se
 * emite por obra y muere con ella—. Entran a la cartera marcadas como MANUAL,
 * así que la reimportación del informe no se las lleva por delante, y salen en
 * la pestaña «Otras pólizas» de vencimientos.
 *
 * UNA FILA POR NEGOCIO, NO POR PÓLIZA
 *
 * Cumplimiento y RC se emiten juntas y se gestionan como una sola cosa, así
 * que van en una sola póliza del CRM con RAMO = «CUMPLIMIENTO/RC». El número
 * que manda es el de cumplimiento; el de RC no cabe en `numero` y se guarda en
 * la observación, que es donde queda buscable.
 *
 * Se lee la hoja RELACION_POLIZAS, que ya viene emparejada. La otra hoja del
 * libro, DETALLE_POLIZAS, lleva una fila por póliza con su vigencia propia:
 * sirve para consultar, no para cargar.
 *
 * POR QUÉ BORRA ANTES DE CARGAR
 *
 * La relación se rehace entera cada vez que llega un extracto nuevo, y los
 * números de fila no son estables: al unificar, dos pólizas pasan a ser una.
 * Actualizar en sitio dejaría huérfanas las filas que dejaron de existir. Se
 * borra solo lo que cargó este mismo script —manual, de estos ramos y sin
 * tocar dentro de la aplicación— y se vuelve a insertar.
 */
import { prisma } from "../lib/prisma";
import { libroATexto } from "../lib/debitos";

const args = process.argv.slice(2);
const APLICAR = args.includes("--aplicar");
const RUTA = args.find((a) => !a.startsWith("--"));
const cop = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

/** Ramos que gestiona esta relación. */
const RAMOS = ["CUMPLIMIENTO/RC", "CUMPLIMIENTO", "RESPONSABILIDAD CIVIL"];

/** «30/04/2026» -> Date en UTC. Devuelve null si no cuadra. */
function fecha(s: string): Date | null {
  const m = (s ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
}

/** «86,747.73» -> 86747.73. El archivo usa coma de miles y punto decimal. */
function numero(s: string): number {
  const n = Number((s ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const MESES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

/** Se queda con las líneas de una hoja concreta del volcado. */
function hoja(lineas: string[], nombre: string): string[] {
  const i = lineas.findIndex((l) => new RegExp(`^## Sheet: ${nombre}\\b`).test(l));
  if (i < 0) return lineas;
  const fin = lineas.findIndex((l, j) => j > i && /^## Sheet: /.test(l));
  return lineas.slice(i, fin < 0 ? undefined : fin);
}

async function main() {
  if (!RUTA) {
    console.error("Falta la ruta del archivo.");
    process.exit(1);
  }

  const lineas = hoja(libroATexto(RUTA).split(/\r?\n/), "RELACION_POLIZAS");
  const inicio = lineas.findIndex((l) => /^ASEGURADORA\t/.test(l));
  if (inicio < 0) {
    console.error("No se encontró la fila de encabezados (ASEGURADORA…).");
    process.exit(1);
  }

  const filas = lineas
    .slice(inicio + 1)
    .map((l) => l.split("\t"))
    .filter((c) => ((c[2] ?? "").trim() || (c[3] ?? "").trim()) && (c[4] ?? "").trim());

  const polizas = filas.map((c) => {
    const numCum = (c[2] ?? "").trim();
    const numRc = (c[3] ?? "").trim();
    const vto = fecha(c[6]) ?? fecha(c[5]);
    const obs = (c[13] ?? "").trim();
    /*
     * Fecha de producción: la de EXPEDICIÓN, no la de vencimiento.
     *
     * Estas pólizas no siguen el ciclo anual —se emiten por obra y vencen
     * cuando la obra acaba—, así que deducir la venta del vencimiento las
     * mandaba a años equivocados. Ver Policy.expedidaEn.
     *
     * De dónde sale, por orden: la carátula la trae; el extracto de la
     * compañía solo da el recaudo, que es unos días posterior; y las de
     * liquidación no traen ninguna de las dos, así que se usa la fecha del
     * movimiento, que es con la que el propio libro les asigna el mes.
     */
    const expedida = fecha((obs.match(/Expedida (\d{2}\/\d{2}\/\d{4})/) ?? [])[1] ?? "") ?? fecha(c[5]);
    // El de cumplimiento manda; si el negocio es solo de RC, manda el de RC.
    const principal = numCum || numRc;
    const otro = numCum && numRc ? numRc : "";
    return {
      numero: principal,
      // El ramo se guarda tal como viene: es lo que hace que la pestaña «Otras
      // pólizas» las reconozca (ver RAMOS_OTRAS en lib/calculos.ts).
      ramo: (c[1] ?? "").trim().toUpperCase(),
      asegurado: (c[4] ?? "").trim(),
      aseguradora: (c[0] ?? "").trim().toUpperCase() || null,
      primaNeta: numero(c[12]),
      primaTotal: numero(c[12]),
      vencimiento: vto,
      expedidaEn: expedida,
      mesVencimiento: vto ? MESES[vto.getUTCMonth()] : null,
      observacion: [otro && `Póliza de RC: ${otro}`, obs].filter(Boolean).join(" | ") || null,
      tipoNegocio: "NUEVO",
      manual: true,
    };
  });

  const porRamo = new Map<string, { n: number; prima: number }>();
  for (const p of polizas) {
    const a = porRamo.get(p.ramo) ?? { n: 0, prima: 0 };
    a.n++;
    a.prima += p.primaNeta;
    porRamo.set(p.ramo, a);
  }
  console.log(`Leídos ${polizas.length} negocios:\n`);
  for (const [r, a] of porRamo) console.log(`  ${r.padEnd(24)} ${String(a.n).padStart(4)} · ${cop(a.prima)}`);

  const desconocido = polizas.filter((p) => !RAMOS.includes(p.ramo));
  if (desconocido.length) {
    console.error(`\nRamo no reconocido en ${desconocido.length} filas: ${[...new Set(desconocido.map((p) => p.ramo))].join(", ")}`);
    process.exit(1);
  }
  // Producción por mes de expedición: es lo que va a mostrar Seguimiento.
  const porMes = new Map<string, number>();
  for (const p of polizas) {
    if (!p.expedidaEn) continue;
    const k = `${p.expedidaEn.getUTCFullYear()}-${String(p.expedidaEn.getUTCMonth() + 1).padStart(2, "0")}`;
    porMes.set(k, (porMes.get(k) ?? 0) + p.primaNeta);
  }
  console.log("\nProducción por mes de expedición:");
  for (const k of [...porMes.keys()].sort()) console.log(`  ${k}  ${cop(porMes.get(k)!)}`);

  const sinExpedir = polizas.filter((p) => !p.expedidaEn).length;
  if (sinExpedir) console.log(`\n  ${sinExpedir} sin fecha de expedición: no cuentan en producción.`);
  const sinPrima = polizas.filter((p) => !p.primaNeta).length;
  const sinFecha = polizas.filter((p) => !p.vencimiento).length;
  if (sinPrima) console.log(`\n  ${sinPrima} sin prima en el archivo: entran en $0 y hay que completarlas.`);
  if (sinFecha) console.log(`  ${sinFecha} sin fecha legible: no saldrán en ninguna vista por año.`);

  // Qué se va a retirar: solo lo que cargó este script y nadie ha tocado en la
  // aplicación. Si algo tiene endosos o gestión, se deja y se avisa.
  const previas = await prisma.policy.findMany({
    where: { manual: true, ramo: { in: RAMOS } },
    select: {
      id: true, numero: true, ramo: true, gestionada: true, cobranzaEditadaEn: true,
      renovadaEn: true, notaCartera: true, _count: { select: { endosos: true } },
    },
  });
  const intocadas = previas.filter(
    (p) => !p.gestionada && !p.cobranzaEditadaEn && !p.renovadaEn && !p.notaCartera && p._count.endosos === 0
  );
  const conservar = previas.length - intocadas.length;
  console.log(`\n  en la cartera ahora:  ${previas.length}`);
  console.log(`  se retiran y recargan: ${intocadas.length}`);
  if (conservar) console.log(`  se CONSERVAN (tienen endosos o gestión hecha en la app): ${conservar}`);
  console.log(`  quedan al terminar:   ${conservar + polizas.length} · ${cop(polizas.reduce((s, p) => s + p.primaNeta, 0))}`);

  if (!APLICAR) {
    console.log("\nEnsayo: no se escribió nada. Vuelva a correrlo con --aplicar.");
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction([
    prisma.policy.deleteMany({ where: { id: { in: intocadas.map((p) => p.id) } } }),
    ...polizas.map((p) => prisma.policy.create({ data: p })),
  ]);
  console.log(`\nRetiradas ${intocadas.length}, creadas ${polizas.length}. Cartera: ${await prisma.policy.count()}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
