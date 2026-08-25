/**
 * Crea las fichas de copropiedad a partir de la cartera que ya está en el CRM.
 *
 * La ficha del edificio necesita saber hasta cuándo va su póliza de áreas
 * comunes, y ese dato no está en el Excel de endosos: está en la cartera, que
 * es de donde sale el informe de producción. Cruzando el nombre de la
 * urbanización de cada endoso con el asegurado de la cartera se puede rellenar
 * aseguradora, número de póliza y vigencia sin teclear ni inventar nada.
 *
 * Es lo que enciende el aviso de «a estos les toca renovar»: sin vigencia no
 * hay fecha contra la que avisar.
 *
 * Lo que NO se rellena es el valor asegurado del edificio ni el paz y salvo:
 * el informe de cartera no los trae, y ponerlos a ojo daría por buena una
 * revisión que en realidad no se hizo. Eso lo completa Juan a mano por
 * copropiedad, una sola vez.
 *
 * Uso:
 *   npx tsx scripts/vincular-copropiedades.ts
 *   npx tsx scripts/vincular-copropiedades.ts --aplicar
 */
import { prisma } from "../lib/prisma";
import { normalizar } from "../lib/endosos";

const APLICAR = process.argv.includes("--aplicar");

/** Ruido que sobra al comparar nombres de copropiedades. */
const RELLENO = [
  "conjunto residencial",
  "unidad residencial",
  "urbanizacion",
  "conjunto",
  "edificio",
  "propiedad horizontal",
  "p h",
  "ph",
  "etapa",
  "torres",
  "torre",
];

/**
 * Deja el nombre en su parte distintiva.
 *
 * «CONJUNTO RESIDENCIAL MARSELLA P.H.» y «Marsella» son el mismo sitio; el
 * informe de cartera usa la razón social completa y el Excel de endosos el
 * nombre corto con el que lo llama todo el mundo.
 */
function nucleo(nombre: string): string {
  let n = normalizar(nombre);
  for (const r of RELLENO) n = n.replace(new RegExp(`\\b${r}\\b`, "g"), " ");
  return n.replace(/\s+/g, " ").trim();
}

async function main() {
  const urbanizaciones = await prisma.endoso.groupBy({
    by: ["urbanizacion"],
    _count: { _all: true },
    orderBy: { _count: { urbanizacion: "desc" } },
  });

  /*
   * Solo se miran pólizas de incendio/terremoto de copropiedades. Un cliente
   * persona natural con el mismo apellido que un edificio no debe cruzar.
   */
  const polizas = await prisma.policy.findMany({
    where: { vencimiento: { not: null } },
    select: {
      id: true,
      numero: true,
      asegurado: true,
      ccNit: true,
      aseguradora: true,
      ramo: true,
      vencimiento: true,
    },
  });

  const indice = polizas.map((p) => ({ ...p, clave: nucleo(p.asegurado) }));

  const fichasExistentes = await prisma.copropiedad.findMany({ select: { nombre: true } });
  const yaHay = new Set(fichasExistentes.map((c) => normalizar(c.nombre)));

  const encontradas: {
    urbanizacion: string;
    endosos: number;
    poliza: (typeof indice)[number];
    /** true si el nombre coincidió entero; false si solo uno contiene al otro. */
    exacta: boolean;
  }[] = [];
  const sinCruce: { urbanizacion: string; endosos: number }[] = [];

  for (const u of urbanizaciones) {
    if (yaHay.has(normalizar(u.urbanizacion))) continue;
    const clave = nucleo(u.urbanizacion);
    if (!clave) continue;

    /*
     * Primero se busca la coincidencia exacta del núcleo. Si no la hay, se
     * admite que el nombre de la póliza contenga al de la urbanización, pero
     * exigiendo que estén TODAS sus palabras.
     *
     * Sin esa exigencia basta con que una palabra genérica coincida, y
     * «Laureles Campestre» acababa cruzando con «URBANIZACION TORRE CAMPESTRE»
     * —dos edificios distintos, con dos vigencias distintas— solo porque los
     * dos son «campestre». Un cruce así no se nota: simplemente el aviso de
     * renovación empieza a mentir.
     */
    const exacta = indice.filter((p) => p.clave === clave);
    const palabras = clave.split(" ").filter((w) => w.length > 1);
    const parcial =
      exacta.length > 0
        ? exacta
        : clave.length >= 5 && palabras.length
          ? indice.filter((p) => {
              const suyas = new Set(p.clave.split(" "));
              return palabras.every((w) => suyas.has(w));
            })
          : [];

    if (!parcial.length) {
      sinCruce.push({ urbanizacion: u.urbanizacion, endosos: u._count._all });
      continue;
    }
    // De las que cruzan, la de vencimiento más lejano: es la vigencia viva.
    const mejor = parcial.sort(
      (a, b) => (b.vencimiento?.getTime() ?? 0) - (a.vencimiento?.getTime() ?? 0)
    )[0];
    encontradas.push({
      urbanizacion: u.urbanizacion,
      endosos: u._count._all,
      poliza: mejor,
      exacta: exacta.length > 0,
    });
  }

  const conEndosos = (l: { endosos: number }[]) => l.reduce((s, x) => s + x.endosos, 0);

  console.log(`Copropiedades distintas en los endosos: ${urbanizaciones.length}`);
  console.log(
    `Cruzan con la cartera: ${encontradas.length} (cubren ${conEndosos(encontradas)} endosos)`
  );
  console.log(
    `Sin cruce: ${sinCruce.length} (cubren ${conEndosos(sinCruce)} endosos)`
  );

  /*
   * Las coincidencias PARCIALES son las que hay que mirar con lupa: el nombre
   * no cuadró entero, solo uno contenía al otro. Un cruce equivocado le pondría
   * a un edificio la vigencia de otro, y con eso el aviso de renovación
   * mentiría. Se listan todas, no una muestra.
   */
  const parciales = encontradas.filter((e) => !e.exacta);
  console.log(
    `\nCoincidencias EXACTAS: ${encontradas.length - parciales.length} · PARCIALES (revisar): ${parciales.length}`
  );

  const linea = (e: (typeof encontradas)[number]) => {
    const v = e.poliza.vencimiento;
    return `  ${String(e.endosos).padStart(4)}  ${e.urbanizacion}  →  ${e.poliza.asegurado} · ${
      e.poliza.aseguradora ?? "sin aseguradora"
    } · pól. ${e.poliza.numero} · vence ${v ? v.toISOString().slice(0, 10) : "—"}`;
  };

  console.log("\nPARCIALES — todas, para revisarlas una a una:");
  for (const e of parciales.sort((a, b) => b.endosos - a.endosos)) console.log(linea(e));

  console.log("\nEXACTAS (las 12 con más endosos):");
  for (const e of encontradas.filter((x) => x.exacta).slice(0, 12)) console.log(linea(e));

  console.log("\nSin cruce (los 15 con más endosos, habrá que crearlas a mano):");
  for (const s of sinCruce.slice(0, 15)) {
    console.log(`  ${String(s.endosos).padStart(4)}  ${s.urbanizacion}`);
  }

  if (!APLICAR) {
    console.log("\nSimulación. Añade --aplicar para crear las fichas.");
    await prisma.$disconnect();
    return;
  }

  let creadas = 0;
  let enganchados = 0;
  for (const e of encontradas) {
    const ficha = await prisma.copropiedad.create({
      data: {
        nombre: e.urbanizacion,
        nit: e.poliza.ccNit,
        aseguradora: e.poliza.aseguradora,
        numeroPoliza: e.poliza.numero,
        vigenciaHasta: e.poliza.vencimiento,
        // El valor asegurado y el paz y salvo NO salen de la cartera: los pone
        // Juan cuando los tenga. Hasta entonces la revisión avisa de que falta.
        //
        // En los cruces parciales se deja dicho, porque el nombre no coincidió
        // entero y conviene que alguien lo confirme antes de fiarse de la
        // vigencia.
        nota:
          `Ficha creada desde la cartera (${e.poliza.asegurado}).` +
          (e.exacta ? "" : " CRUCE PARCIAL POR NOMBRE: confirmar que la póliza es la de este edificio.") +
          " Falta poner el valor asegurado del edificio y el paz y salvo.",
      },
    });
    creadas++;
    const r = await prisma.endoso.updateMany({
      where: { copropiedadId: null, urbanizacion: e.urbanizacion },
      data: { copropiedadId: ficha.id },
    });
    enganchados += r.count;
  }

  console.log(`\nCreadas ${creadas} fichas. Enganchados ${enganchados} endosos.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
