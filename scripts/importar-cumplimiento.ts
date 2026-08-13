/**
 * Carga las pólizas de cumplimiento y responsabilidad civil.
 *
 *   npx tsx scripts/importar-cumplimiento.ts "<archivo.xlsx>"            (ensayo)
 *   npx tsx scripts/importar-cumplimiento.ts "<archivo.xlsx>" --aplicar
 *
 * Estas pólizas no viven en el informe de producción: la agencia las lleva en
 * su propia relación porque no siguen el ciclo anual —una de cumplimiento se
 * emite por obra y muere con ella—. Entran a la cartera marcadas como MANUAL,
 * así que la reimportación del informe no se las lleva por delante, y salen en
 * la pestaña «Otras pólizas» de vencimientos.
 *
 * COLUMNAS DEL ARCHIVO
 *   ASEGURADORA · No. POLIZA · RAMO · ASEGURADO/TOMADOR · FECHA MIN. ·
 *   FECHA MAX. · No. MOVIMIENTOS · FACTURA · FUENTE · OBSERVACIONES · PRIMA NETA
 *
 * FECHA MIN es el inicio de la vigencia y FECHA MAX el fin, así que el
 * vencimiento del CRM es FECHA MAX. Cuando las dos coinciden —pasa en las de
 * un solo movimiento— no hay vigencia que derivar y se toma esa fecha igual:
 * es la única que consta.
 */
import { prisma } from "../lib/prisma";
import { libroATexto } from "../lib/debitos";

const args = process.argv.slice(2);
const APLICAR = args.includes("--aplicar");
const RUTA = args.find((a) => !a.startsWith("--"));
const cop = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

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

async function main() {
  if (!RUTA) {
    console.error("Falta la ruta del archivo.");
    process.exit(1);
  }

  const lineas = libroATexto(RUTA).split(/\r?\n/);
  const inicio = lineas.findIndex((l) => /^ASEGURADORA\t/.test(l));
  if (inicio < 0) {
    console.error("No se encontró la fila de encabezados (ASEGURADORA…).");
    process.exit(1);
  }

  const filas = lineas
    .slice(inicio + 1)
    .map((l) => l.split("\t"))
    .filter((c) => (c[1] ?? "").trim() && (c[3] ?? "").trim());

  const polizas = filas.map((c) => {
    const vto = fecha(c[5]) ?? fecha(c[4]);
    return {
      numero: c[1].trim(),
      // El ramo se guarda tal como viene: es lo que hace que la pestaña «Otras
      // pólizas» las reconozca (ver RAMOS_OTRAS en lib/calculos.ts).
      ramo: c[2].trim().toUpperCase(),
      asegurado: c[3].trim(),
      aseguradora: c[0].trim().toUpperCase() || null,
      primaNeta: numero(c[10]),
      primaTotal: numero(c[10]),
      vencimiento: vto,
      mesVencimiento: vto ? MESES[vto.getUTCMonth()] : null,
      observacion: (c[9] ?? "").trim() || null,
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
  console.log(`Leídas ${polizas.length} pólizas:\n`);
  for (const [r, a] of porRamo) console.log(`  ${r.padEnd(24)} ${String(a.n).padStart(4)} · ${cop(a.prima)}`);

  const sinPrima = polizas.filter((p) => !p.primaNeta).length;
  const sinFecha = polizas.filter((p) => !p.vencimiento).length;
  if (sinPrima) console.log(`\n  ${sinPrima} sin prima en el archivo: entran en $0 y hay que completarlas.`);
  if (sinFecha) console.log(`  ${sinFecha} sin fecha legible: no saldrán en ninguna vista por año.`);

  // Duplicados dentro del propio archivo y contra la cartera.
  const vistos = new Set<string>();
  const repetidas = polizas.filter((p) => {
    const k = `${p.numero}|${p.ramo}`;
    if (vistos.has(k)) return true;
    vistos.add(k);
    return false;
  });
  if (repetidas.length) console.log(`  ${repetidas.length} repetidas dentro del archivo (se carga una).`);

  const yaEnCartera = await prisma.policy.findMany({
    where: { numero: { in: polizas.map((p) => p.numero) } },
    select: { numero: true, ramo: true },
  });
  const enCartera = new Set(yaEnCartera.map((p) => `${p.numero}|${p.ramo.toUpperCase()}`));
  const nuevas = polizas.filter(
    (p, i) => polizas.findIndex((q) => q.numero === p.numero && q.ramo === p.ramo) === i
  );
  const aInsertar = nuevas.filter((p) => !enCartera.has(`${p.numero}|${p.ramo}`));
  console.log(`\n  ya estaban en la cartera: ${nuevas.length - aInsertar.length}`);
  console.log(`  entran nuevas:            ${aInsertar.length} · ${cop(aInsertar.reduce((s, p) => s + p.primaNeta, 0))}`);

  if (!APLICAR) {
    console.log("\nEnsayo: no se escribió nada. Vuelva a correrlo con --aplicar.");
    await prisma.$disconnect();
    return;
  }

  for (const p of aInsertar) await prisma.policy.create({ data: p });
  console.log(`\nCreadas ${aInsertar.length}. Cartera: ${await prisma.policy.count()}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
