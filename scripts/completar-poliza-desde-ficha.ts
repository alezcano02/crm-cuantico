/**
 * Rellena la aseguradora y el número de póliza de los endosos a partir de la
 * ficha de su copropiedad.
 *
 * No son datos del caso sino del edificio: todos los endosos de Marsella van a
 * Zurich con la misma póliza. Copiarlos a mano en cada caso es de donde salen
 * las variantes de escritura y las planillas generadas sin número de póliza —y
 * una planilla sin póliza es una que la aseguradora devuelve.
 *
 * DOS LÍMITES, y los dos importan:
 *
 * 1. Solo toca los casos ABIERTOS. La ficha guarda la póliza VIGENTE, y un
 *    edificio cambia de aseguradora al renovar: hay 73 casos de Ciudadela del
 *    Parque hechos con Previsora cuando su ficha ya dice AXA, y 68 de Puerto
 *    Nuevo con Zurich cuando la ficha dice Mapfre. Estampar la póliza de hoy
 *    sobre un caso de hace un año sería inventarle un número que nunca tuvo.
 *
 * 2. Solo copia la póliza cuando la aseguradora del caso coincide con la de la
 *    ficha. Si no coinciden, ese número es de otra compañía y meterlo haría
 *    que la planilla saliera con una póliza que no existe en esa aseguradora.
 *
 * Y nunca pisa lo que ya esté puesto.
 *
 * Uso:
 *   npx tsx scripts/completar-poliza-desde-ficha.ts            (simulación)
 *   npx tsx scripts/completar-poliza-desde-ficha.ts --aplicar
 */
import { PrismaClient } from "@prisma/client";
import { ESTADOS_ABIERTOS, normalizar, normalizarAseguradora } from "../lib/endosos";

const prisma = new PrismaClient();
const APLICAR = process.argv.includes("--aplicar");

async function main() {
  const fichas = await prisma.copropiedad.findMany({
    select: { id: true, nombre: true, aseguradora: true, numeroPoliza: true },
  });
  const porId = new Map(fichas.map((f) => [f.id, f]));

  const endosos = await prisma.endoso.findMany({
    where: { estado: { in: [...ESTADOS_ABIERTOS] } },
    select: {
      id: true,
      urbanizacion: true,
      copropiedadId: true,
      estado: true,
      aseguradora: true,
      numeroPoliza: true,
    },
  });

  const buscarPorNombre = (nombre: string) => {
    const objetivo = normalizar(nombre);
    return (
      fichas.find((c) => normalizar(c.nombre) === objetivo) ??
      fichas.find(
        (c) => normalizar(c.nombre).includes(objetivo) || objetivo.includes(normalizar(c.nombre))
      ) ??
      null
    );
  };

  /*
   * Qué aseguradora usan de verdad los casos de cada edificio.
   *
   * Hace falta porque hay fichas mal diligenciadas y no se puede confiar en
   * ellas a ciegas: la de Ciudadela del Parque dice AXA COLPATRIA pero lleva
   * la póliza 1007181, que por su numeración es de Previsora —AXA usa números
   * cortos (2721, 2941) y Previsora los 100xxxx—, y sus 73 casos dicen
   * Previsora. Copiar de esa ficha habría marcado casos como AXA con una
   * póliza que en AXA no existe.
   */
  const casosPorEdificio = await prisma.endoso.groupBy({
    by: ["urbanizacion", "aseguradora"],
    where: { aseguradora: { not: null } },
    _count: { id: true },
  });
  const aseguradoraReal = new Map<string, string>();
  const mejor = new Map<string, number>();
  for (const c of casosPorEdificio) {
    const k = normalizar(c.urbanizacion);
    if ((mejor.get(k) ?? 0) < c._count.id) {
      mejor.set(k, c._count.id);
      aseguradoraReal.set(k, c.aseguradora!);
    }
  }

  const cambios: { id: number; datos: Record<string, string>; etiqueta: string }[] = [];
  const fichasDudosas = new Set<string>();
  let sinFicha = 0;
  let yaCompletos = 0;
  let saltadosPorDuda = 0;
  const conteo = { aseguradora: 0, numeroPoliza: 0 };

  for (const e of endosos) {
    const ficha =
      (e.copropiedadId != null ? porId.get(e.copropiedadId) : undefined) ??
      buscarPorNombre(e.urbanizacion);
    if (!ficha) {
      sinFicha++;
      continue;
    }

    /*
     * Si la ficha dice una aseguradora y los casos del edificio dicen otra, no
     * se toca nada: uno de los dos está mal y no es cosa de adivinarlo aquí.
     * Se anota para que alguien lo revise.
     */
    const real = aseguradoraReal.get(normalizar(e.urbanizacion));
    if (
      real &&
      ficha.aseguradora &&
      !normalizar(real).includes(normalizar(ficha.aseguradora)) &&
      !normalizar(ficha.aseguradora).includes(normalizar(real))
    ) {
      fichasDudosas.add(
        `${ficha.nombre}: la ficha dice «${ficha.aseguradora}» (póliza ${ficha.numeroPoliza}) y sus casos dicen «${real}»`
      );
      saltadosPorDuda++;
      continue;
    }

    const datos: Record<string, string> = {};
    if (!e.aseguradora && ficha.aseguradora) {
      const n = normalizarAseguradora(ficha.aseguradora);
      if (n) {
        datos.aseguradora = n;
        conteo.aseguradora++;
      }
    }
    /*
     * La póliza solo se copia si el caso va por la misma aseguradora que la
     * ficha. Si el edificio ya renovó con otra compañía, ese número no existe
     * para la aseguradora de este caso.
     */
    const asegDelCaso = e.aseguradora ?? datos.aseguradora ?? null;
    const mismaAseguradora =
      !!asegDelCaso &&
      !!ficha.aseguradora &&
      (normalizar(asegDelCaso).includes(normalizar(ficha.aseguradora)) ||
        normalizar(ficha.aseguradora).includes(normalizar(asegDelCaso)));
    if (!e.numeroPoliza && ficha.numeroPoliza && mismaAseguradora) {
      datos.numeroPoliza = ficha.numeroPoliza;
      conteo.numeroPoliza++;
    }
    if (!Object.keys(datos).length) {
      yaCompletos++;
      continue;
    }
    cambios.push({
      id: e.id,
      datos,
      etiqueta: `${e.urbanizacion} → ${Object.entries(datos)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")}`,
    });
  }

  console.log(`Endosos abiertos: ${endosos.length}`);
  console.log(`  sin ficha de copropiedad que los cubra: ${sinFicha}`);
  console.log(`  ya tenían los dos datos: ${yaCompletos}`);
  console.log(`  saltados porque la ficha y los casos no coinciden: ${saltadosPorDuda}`);
  console.log(`  se pueden completar: ${cambios.length}`);
  console.log(`     aseguradora: ${conteo.aseguradora} · número de póliza: ${conteo.numeroPoliza}`);
  console.log("\nEjemplos:");
  for (const c of cambios.slice(0, 10)) console.log(`   ${c.etiqueta}`);

  if (fichasDudosas.size) {
    console.log(`\nFICHAS QUE HAY QUE REVISAR A MANO (${fichasDudosas.size}):`);
    for (const f of fichasDudosas) console.log(`   · ${f}`);
  }

  if (!APLICAR) {
    console.log("\nSimulación. Añade --aplicar para escribirlo de verdad.");
    await prisma.$disconnect();
    return;
  }
  for (const c of cambios) {
    await prisma.endoso.update({ where: { id: c.id }, data: c.datos });
  }
  console.log(`\nActualizados ${cambios.length} endosos.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
