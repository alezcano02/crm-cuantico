/**
 * Carga los prospectos desde el Excel del equipo.
 *
 *   npx tsx scripts/importar-prospectos.ts "<archivo.xlsx>"            (ensayo)
 *   npx tsx scripts/importar-prospectos.ts "<archivo.xlsx>" --aplicar
 *
 * Columnas: COPROPIEDADES · FECHA DE INICIO · ADMINISTRADOR · COMPAÑÍA · ESTADO
 *
 * La columna COMPAÑÍA mezcla la aseguradora con un estado: hay filas que dicen
 * «PENDIENTE» ahí en vez de un nombre. Cuando pasa, se deja la compañía vacía y
 * el dato se respeta en el estado, que es donde significa algo.
 */
import { prisma } from "../lib/prisma";
import { libroATexto } from "../lib/debitos";
import { situacionDeTexto } from "../lib/prospectos";

const args = process.argv.slice(2);
const APLICAR = args.includes("--aplicar");
const RUTA = args.find((a) => !a.startsWith("--"));

/** «5/7/26» o «18-May». El año de dos cifras es 20xx. */
function fecha(s: string): Date | null {
  const t = (s ?? "").trim();
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const a = Number(m[3]);
    return new Date(Date.UTC(a < 100 ? 2000 + a : a, Number(m[1]) - 1, Number(m[2])));
  }
  // «18-May»: sin año. Se descarta antes que inventarlo — una fecha inventada
  // pondría el prospecto en el sitio equivocado de la lista, que va ordenada
  // justamente por esa fecha.
  return null;
}

const NO_ES_COMPANIA = /^(pendiente|no aplica|n\/?a)$/i;

async function main() {
  if (!RUTA) { console.error("Falta la ruta del archivo."); process.exit(1); }
  const lineas = libroATexto(RUTA).split(/\r?\n/);
  const i = lineas.findIndex((l) => /^COPROPIEDADES\t/i.test(l));
  if (i < 0) { console.error("No se encontró la fila de encabezados."); process.exit(1); }

  const filas = lineas.slice(i + 1).map((l) => l.split("\t")).filter((c) => (c[0] ?? "").trim());
  const prospectos = filas.map((c) => {
    const compania = (c[3] ?? "").trim();
    const estado = (c[4] ?? "").trim() || null;
    return {
      nombre: c[0].trim(),
      fechaInicio: fecha(c[1]),
      administrador: (c[2] ?? "").trim() || null,
      compania: compania && !NO_ES_COMPANIA.test(compania) ? compania : null,
      estado,
      situacion: situacionDeTexto(estado),
    };
  });

  const porSit = new Map<string, number>();
  for (const p of prospectos) porSit.set(p.situacion, (porSit.get(p.situacion) ?? 0) + 1);
  console.log(`Leídos ${prospectos.length} prospectos:`);
  for (const [s, n] of porSit) console.log(`  ${s.padEnd(12)} ${n}`);
  const sinFecha = prospectos.filter((p) => !p.fechaInicio);
  if (sinFecha.length) console.log(`\n  sin fecha legible: ${sinFecha.map((p) => p.nombre).join(", ")}`);

  console.log("\nDetalle:");
  for (const p of prospectos)
    console.log(`  ${p.nombre.slice(0, 32).padEnd(34)} ${p.fechaInicio?.toISOString().slice(0, 10) ?? "sin fecha "} ${p.situacion.padEnd(10)} ${(p.compania ?? "-").padEnd(20)} ${(p.estado ?? "").slice(0, 40)}`);

  if (!APLICAR) { console.log("\nEnsayo: no se escribió nada."); await prisma.$disconnect(); return; }

  let creados = 0, existentes = 0;
  for (const p of prospectos) {
    const ya = await prisma.prospecto.findFirst({ where: { nombre: p.nombre } });
    if (ya) { existentes++; continue; }
    await prisma.prospecto.create({ data: p });
    creados++;
  }
  console.log(`\nCreados ${creados} · ya existían ${existentes}. Total: ${await prisma.prospecto.count()}`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
