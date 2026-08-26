/**
 * Llena la tabla de coeficientes por apartamento con lo que ya se sabe de los
 * endosos históricos.
 *
 * El coeficiente es el dato que más cuesta conseguir —hay que sacarlo del
 * reglamento de propiedad horizontal— y el que nunca cambia. Estaba disperso
 * en los endosos: cada vez que un apartamento volvía a pedir endoso había que
 * buscarlo otra vez, aunque ya se hubiera averiguado el año anterior.
 *
 * Se comprobó que el dato es estable: de los apartamentos con coeficiente
 * conocido, NINGUNO tiene dos valores distintos entre sus endosos. Aun así el
 * script vuelve a comprobarlo y deja fuera cualquier apartamento que se
 * contradiga, en vez de elegir por su cuenta.
 *
 * Uso:
 *   npx tsx scripts/sembrar-coeficientes.ts            (simulación)
 *   npx tsx scripts/sembrar-coeficientes.ts --aplicar
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APLICAR = process.argv.includes("--aplicar");

async function main() {
  const endosos = await prisma.endoso.findMany({
    where: { copropiedadId: { not: null }, apartamento: { not: null }, coeficiente: { not: null } },
    select: { copropiedadId: true, apartamento: true, coeficiente: true, creadoEn: true },
    orderBy: { creadoEn: "asc" },
  });

  const porApto = new Map<
    string,
    { copropiedadId: number; apartamento: string; valores: Set<number>; ultimo: number }
  >();
  for (const e of endosos) {
    const apto = e.apartamento!.trim();
    if (!apto) continue;
    const k = `${e.copropiedadId}|${apto}`;
    if (!porApto.has(k)) {
      porApto.set(k, {
        copropiedadId: e.copropiedadId!,
        apartamento: apto,
        valores: new Set(),
        ultimo: e.coeficiente!,
      });
    }
    const g = porApto.get(k)!;
    g.valores.add(Number(e.coeficiente!.toFixed(6)));
    g.ultimo = e.coeficiente!; // van en orden ascendente: queda el más reciente
  }

  const limpios = [...porApto.values()].filter((g) => g.valores.size === 1);
  const contradictorios = [...porApto.values()].filter((g) => g.valores.size > 1);

  const yaHay = await prisma.coeficienteApartamento.count();
  console.log(`Endosos con coeficiente: ${endosos.length}`);
  console.log(`Apartamentos distintos: ${porApto.size}`);
  console.log(`  con un solo valor (se siembran): ${limpios.length}`);
  console.log(`  con valores contradictorios (se dejan fuera): ${contradictorios.length}`);
  console.log(`Ya había en la tabla: ${yaHay}`);

  for (const c of contradictorios.slice(0, 5)) {
    console.log(`   contradictorio: ficha ${c.copropiedadId} apto ${c.apartamento} → ${[...c.valores].join(" / ")}`);
  }

  // Cuántos endosos SIN coeficiente quedarían cubiertos por esta tabla.
  const sinCoef = await prisma.endoso.findMany({
    where: { coeficiente: null, copropiedadId: { not: null }, apartamento: { not: null } },
    select: { copropiedadId: true, apartamento: true },
  });
  const cubiertos = sinCoef.filter((e) =>
    porApto.has(`${e.copropiedadId}|${e.apartamento!.trim()}`)
  ).length;
  console.log(`\nEndosos sin coeficiente: ${sinCoef.length} · de ellos, la tabla ya cubre ${cubiertos}`);

  if (!APLICAR) {
    console.log("\nSimulación. Añade --aplicar para escribirlo de verdad.");
    await prisma.$disconnect();
    return;
  }

  let n = 0;
  for (const g of limpios) {
    await prisma.coeficienteApartamento.upsert({
      where: {
        copropiedadId_apartamento: { copropiedadId: g.copropiedadId, apartamento: g.apartamento },
      },
      create: {
        copropiedadId: g.copropiedadId,
        apartamento: g.apartamento,
        coeficiente: g.ultimo,
      },
      update: { coeficiente: g.ultimo },
    });
    n++;
  }
  console.log(`\nSembrados ${n} coeficientes.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
