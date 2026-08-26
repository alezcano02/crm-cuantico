/**
 * Sube a la ficha del edificio los datos que hoy están repetidos caso por caso
 * —la nomenclatura y la ciudad— y deja el coeficiente de cada apartamento
 * disponible para la próxima vez que ese mismo apartamento pida endoso.
 *
 * POR QUÉ
 *
 * Los cien apartamentos de Marsella comparten calle y ciudad. Escribirlas en
 * cada endoso es teclear cien veces lo mismo, y de ahí salen las variantes
 * —«Calle 54 # 86C 66» y «CL 54 Nº86C - 66»— que hacen que el banco mire dos
 * veces una dirección que debería ser idéntica a la del crédito.
 *
 * CÓMO SE ELIGE EL VALOR
 *
 * Gana el que más se repite entre los endosos de ese edificio, después de
 * quitarle la parte del apartamento a la dirección. Si un edificio tiene dos
 * nomenclaturas de verdad distintas (no variantes de escritura), se deja sin
 * poner y se avisa: puede ser una urbanización con varias torres en calles
 * distintas, y eso no lo resuelve un script.
 *
 * Uso:
 *   npx tsx scripts/subir-datos-a-la-ficha.ts            (simulación)
 *   npx tsx scripts/subir-datos-a-la-ficha.ts --aplicar
 */
import { PrismaClient } from "@prisma/client";
import { normalizar } from "../lib/endosos";

const prisma = new PrismaClient();
const APLICAR = process.argv.includes("--aplicar");

/** Quita del texto la parte que identifica al apartamento, no al edificio. */
function soloLaCalle(v: string): string {
  return v
    .replace(/[,(]?\s*\b(apto|apartamento|aptos|ap)\b\.?\s*(n[oº°]\.?\s*)?\d+.*/i, "")
    .replace(/[,(]?\s*\b(torre|t)\b\.?\s*\d+.*/i, "")
    .replace(/[,(]?\s*\b(parqueadero|parq|pq|garaje|gj)\b\.?\s*[\w-]+.*/i, "")
    .replace(/[,(]?\s*\b(cuarto\s*[uú]til|c\.?\s*util|cu|dp)\b\.?\s*[\w-]+.*/i, "")
    .replace(/[\s,.-]+$/, "")
    .trim();
}

/** El valor más repetido de una lista, con su recuento. */
function masFrecuente(valores: string[]): { valor: string; n: number; distintos: number } | null {
  const cuenta = new Map<string, { texto: string; n: number }>();
  for (const v of valores) {
    const limpio = v.trim().replace(/\s+/g, " ");
    if (!limpio) continue;
    const k = normalizar(limpio);
    if (!k) continue;
    if (!cuenta.has(k)) cuenta.set(k, { texto: limpio, n: 0 });
    cuenta.get(k)!.n++;
  }
  if (!cuenta.size) return null;
  const orden = [...cuenta.values()].sort((a, b) => b.n - a.n);
  return { valor: orden[0].texto, n: orden[0].n, distintos: cuenta.size };
}

async function main() {
  const fichas = await prisma.copropiedad.findMany({
    select: { id: true, nombre: true, direccion: true, ciudad: true },
  });
  const endosos = await prisma.endoso.findMany({
    select: { copropiedadId: true, urbanizacion: true, direccion: true, ciudad: true },
  });

  const porFicha = new Map<number, { dir: string[]; ciu: string[] }>();
  for (const e of endosos) {
    if (e.copropiedadId == null) continue;
    if (!porFicha.has(e.copropiedadId)) porFicha.set(e.copropiedadId, { dir: [], ciu: [] });
    const g = porFicha.get(e.copropiedadId)!;
    if (e.direccion) {
      const calle = soloLaCalle(e.direccion);
      if (calle.length >= 6) g.dir.push(calle);
    }
    if (e.ciudad) g.ciu.push(e.ciudad);
  }

  const cambios: { id: number; datos: Record<string, string>; etiqueta: string }[] = [];
  const ambiguas: string[] = [];

  for (const f of fichas) {
    const g = porFicha.get(f.id);
    if (!g) continue;
    const datos: Record<string, string> = {};

    if (!f.direccion) {
      const d = masFrecuente(g.dir);
      if (d) {
        /*
         * Si la grafía mayoritaria no llega a la mitad de los casos, es que hay
         * direcciones de verdad distintas y no variantes de escritura: puede
         * ser una urbanización con torres en calles diferentes. No se pone.
         */
        if (d.n * 2 >= g.dir.length) datos.direccion = d.valor;
        else ambiguas.push(`${f.nombre}: ${d.distintos} nomenclaturas distintas, ninguna mayoritaria`);
      }
    }
    if (!f.ciudad) {
      const c = masFrecuente(g.ciu);
      if (c && c.n * 2 >= g.ciu.length) datos.ciudad = c.valor;
    }

    if (Object.keys(datos).length) {
      cambios.push({
        id: f.id,
        datos,
        etiqueta: `${f.nombre} → ${Object.entries(datos).map(([k, v]) => `${k}: ${v}`).join(" · ")}`,
      });
    }
  }

  console.log(`Fichas: ${fichas.length} · se pueden completar: ${cambios.length}`);
  console.log(`  con dirección: ${cambios.filter((c) => c.datos.direccion).length}`);
  console.log(`  con ciudad: ${cambios.filter((c) => c.datos.ciudad).length}`);
  console.log("\nEjemplos:");
  for (const c of cambios.slice(0, 12)) console.log(`   ${c.etiqueta}`);
  if (ambiguas.length) {
    console.log(`\nSin poner por tener varias direcciones reales (${ambiguas.length}):`);
    for (const a of ambiguas.slice(0, 8)) console.log(`   · ${a}`);
  }

  if (!APLICAR) {
    console.log("\nSimulación. Añade --aplicar para escribirlo de verdad.");
    await prisma.$disconnect();
    return;
  }
  for (const c of cambios) {
    await prisma.copropiedad.update({ where: { id: c.id }, data: c.datos });
  }
  console.log(`\nActualizadas ${cambios.length} fichas.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
