/**
 * Crea las empresas del módulo de colectivas a partir de la cartera.
 *
 *   npx tsx scripts/sembrar-colectivas.ts          (ensayo: no escribe)
 *   npx tsx scripts/sembrar-colectivas.ts --aplicar
 *
 * Las empresas salen de las pólizas COLECTIVA y VIDA GRUPO del informe. El
 * campo `asegurado` mezcla la empresa con la persona («BRAYAN ANTELIZ
 * GARCIA/CRISTICA»), así que se parte por la barra y se agrupa por el trozo
 * que se repite: una empresa aparece en muchas filas, una persona en una.
 *
 * No inventa el listado de personas. Ese detalle no está en el informe —vive
 * en los Excel de cada carpeta del SharePoint— y meterlo aquí a medias sería
 * peor que dejarlo vacío: el módulo diría que una empresa tiene tres
 * amparados cuando tiene sesenta.
 */
import { prisma } from "../lib/prisma";
import { RAMOS_COLECTIVOS, empresaExcluida } from "../lib/colectivas";

const APLICAR = process.argv.includes("--aplicar");

/**
 * Empresas conocidas, con las variantes con que aparecen en el informe.
 *
 * La lista NO se deduce del informe. Se intentó —agrupando por los trozos que
 * se repiten en el campo `asegurado`— y salió mal de cuatro maneras a la vez:
 * «CRISTICA» y «CRISTICA S.A.S» quedaban como dos empresas, la palabra
 * «COLECTIVA» pasaba por empresa porque aparece en varias filas, una persona
 * con dos pólizas también, y «INVERSIONES JYM O SAS» / «INVERSIONES JYMO» no
 * se juntaban entre sí.
 *
 * Así que la fuente es la carpeta 4. Asesores/Oficina del SharePoint, que es
 * donde el negocio tiene de verdad una carpeta por empresa, cruzada a mano con
 * los nombres del informe. Es una lista corta y estable; adivinarla salía más
 * caro que escribirla.
 */
const EMPRESAS: { nombre: string; alias: RegExp; carpeta?: string }[] = [
  // ORDEN IMPORTANTE: gana la primera que casa, así que las filiales van antes
  // que la matriz.
  //
  // Espumados del Litoral se quitó de esta lista: sus pólizas son de Cristica y
  // se gestionan allí. Como «CRISTICA S.A.S/ ESPUMADOS DEL LITORAL» contiene
  // las dos razones sociales, al no declararla cae en la regla de Cristica, que
  // es lo que se quiere. No volver a añadirla.
  {
    nombre: "ESPUMAS MEDELLIN",
    alias: /espumas\s+medell/i,
    carpeta: "4. Asesores/Oficina/CRISTICA/ESPUMAS MEDELLIN",
  },
  // Sin anclar al inicio: el informe escribe tanto «CRISTICA S.A.S» como
  // «BRAYAN ANTELIZ GARCIA/CRISTICA», y las dos son de la misma empresa.
  {
    nombre: "CRISTICA S.A.S",
    alias: /\bcristica\b/i,
    carpeta: "4. Asesores/Oficina/CRISTICA",
  },
  { nombre: "LOGISTICA TERRESTRE LIMITADA", alias: /log[ií]stica\s+terrestre/i },
  // Las dos grafías del informe («JYM O SAS» y «JYMO») son la misma empresa.
  { nombre: "INVERSIONES JYMO S.A.S", alias: /inversiones\s+jym/i },
  { nombre: "TRANSPORTES MUNERA SIERRA", alias: /transportes\s+munera/i },
  { nombre: "CARRILLOS S.A.S", alias: /\bcarrillos\b/i },
];

async function main() {
  const polizas = await prisma.policy.findMany({
    where: { ramo: { in: RAMOS_COLECTIVOS } },
    select: { numero: true, ramo: true, asegurado: true, primaNeta: true },
  });

  const asignadas = new Map<string, { polizas: Set<string>; prima: number }>();
  const sueltas: typeof polizas = [];

  for (const p of polizas) {
    if (empresaExcluida(p.asegurado)) continue;
    const emp = EMPRESAS.find((e) => e.alias.test(p.asegurado));
    if (!emp) {
      sueltas.push(p);
      continue;
    }
    const acc = asignadas.get(emp.nombre) ?? { polizas: new Set<string>(), prima: 0 };
    acc.polizas.add(p.numero);
    acc.prima += p.primaNeta;
    asignadas.set(emp.nombre, acc);
  }

  console.log("Empresas y sus pólizas colectivas:\n");
  for (const e of EMPRESAS) {
    const a = asignadas.get(e.nombre);
    const n = a ? a.polizas.size : 0;
    const prima = a ? Math.round(a.prima).toLocaleString("es-CO") : "0";
    console.log(
      `  ${e.nombre.padEnd(30)} ${String(n).padStart(3)} pólizas  $${prima.padStart(14)}  ${e.carpeta ?? ""}`
    );
  }

  const excluidas = polizas.filter((p) => empresaExcluida(p.asegurado));
  if (excluidas.length) {
    console.log(`\nExcluidas a propósito (Financrea): ${excluidas.length} pólizas`);
  }

  if (sueltas.length) {
    console.log(`\nSin empresa reconocida (${sueltas.length}):`);
    for (const p of sueltas) console.log(`  ${p.numero.padEnd(16)} ${p.asegurado}`);
    console.log(
      "  -> colectivas a nombre de una persona, o una empresa que falta en la\n" +
      "     lista de arriba. Créelas desde la pantalla si hay que gestionarlas."
    );
  }

  if (!APLICAR) {
    console.log("\nEnsayo: no se escribió nada. Vuelva a correrlo con --aplicar.");
    await prisma.$disconnect();
    return;
  }

  let creadas = 0;
  let existentes = 0;
  for (const e of EMPRESAS) {
    const ya = await prisma.empresaColectiva.findUnique({ where: { nombre: e.nombre } });
    if (ya) {
      existentes++;
      continue;
    }
    await prisma.empresaColectiva.create({
      data: { nombre: e.nombre, carpeta: e.carpeta ?? null },
    });
    creadas++;
  }
  console.log(`\nCreadas ${creadas}, ya existían ${existentes}.`);
  console.log(`Total de empresas: ${await prisma.empresaColectiva.count()}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
