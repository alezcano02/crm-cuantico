/**
 * Completa las fichas de copropiedad que el cruce automático no pudo resolver,
 * y corrige dos cosas que ese cruce hizo mal.
 *
 * A diferencia de `vincular-copropiedades.ts`, aquí NO hay heurística: cada
 * decisión de este archivo se tomó mirando la cartera una por una. Un nombre
 * parecido no basta —«Laureles Campestre» y «Torre Campestre» son edificios
 * distintos— y equivocarse significa ponerle a un edificio la fecha de
 * renovación de otro.
 *
 * Uso:
 *   npx tsx scripts/completar-copropiedades.ts
 *   npx tsx scripts/completar-copropiedades.ts --aplicar
 */
import { prisma } from "../lib/prisma";

const APLICAR = process.argv.includes("--aplicar");

/**
 * Copropiedades que SÍ están en la cartera, con el nombre exacto del asegurado.
 *
 * El nombre de la izquierda es como lo escribe el Excel de endosos; el de la
 * derecha, como aparece en el informe de producción.
 */
const CON_CARTERA: { urbanizacion: string; asegurado: string; porque: string }[] = [
  {
    urbanizacion: "Faro Verde",
    asegurado: "URBANIZACION FAROVERDE",
    porque: "mismo nombre, escrito junto en la cartera",
  },
  {
    urbanizacion: "Mont Clare",
    asegurado: "CONJUNTO RESIDENCIAL URBANIZACION MONT CLAIRE P.H",
    porque: "variante de escritura de «Mont Claire»",
  },
  {
    urbanizacion: "ZU4121",
    asegurado: "CONJUNTO RESIDENCIAL ZU 4121 PROPIEDAD HORIZONTAL",
    porque: "mismo código, con espacio en la cartera",
  },
  {
    urbanizacion: "Parque de San Pablo",
    asegurado: "CIUDADELA PARQUES DE SAN PABLO PH",
    porque: "singular en endosos, plural en la cartera",
  },
  {
    urbanizacion: "Portal de Norte",
    asegurado: "CONJUNTO RESIDENCIAL PORTAL DEL NORTE",
    porque: "falta el «del» en el Excel",
  },
];

/**
 * Nombres que son OTRA FORMA DE ESCRIBIR una copropiedad que ya tiene ficha.
 *
 * No se crea ficha nueva: se enganchan sus endosos a la que ya existe, para que
 * el edificio no quede partido en dos y el aviso de renovación los cuente
 * todos.
 */
const ALIAS: { urbanizacion: string; fichaExistente: string; porque: string }[] = [
  {
    urbanizacion: "Portal de la Hacienda",
    fichaExistente: "Portón de la Hacienda",
    porque: "«Portal» por «Portón»: no hay ninguna «Portal de la Hacienda» en la cartera",
  },
  {
    urbanizacion: "Conjunto Multifamiliar La Abadía",
    fichaExistente: "Guaduales de la Abadía",
    porque: "la cartera solo tiene una Abadía: GUADUALES DE LA ABADIA",
  },
  {
    urbanizacion: "Cantapiedra",
    fichaExistente: "Canta Piedra",
    porque: "el mismo nombre pegado",
  },
];

/**
 * Copropiedades con endosos que NO aparecen en la cartera actual.
 *
 * Existen —tienen entre 1 y 50 endosos tramitados— pero su póliza no está en el
 * informe de producción: o se perdió la cuenta, o está a nombre de otra cosa.
 * Se les crea ficha igual para que sus endosos no queden sueltos, pero SIN
 * vigencia inventada: sin fecha no hay aviso de renovación, y eso es preferible
 * a un aviso equivocado. La revisión avisará de que falta el dato.
 */
const SIN_CARTERA: { urbanizacion: string; aseguradora: string }[] = [
  { urbanizacion: "Perlato", aseguradora: "Axa Colpatria" },
  { urbanizacion: "Nuevo Milenio", aseguradora: "Axa Colpatria" },
  { urbanizacion: "Montecarmelo", aseguradora: "Axa Colpatria" },
  { urbanizacion: "Urbanización Q", aseguradora: "Previsora" },
  { urbanizacion: "Canta Piedra", aseguradora: "Axa Colpatria" },
  { urbanizacion: "Laureles Campestre", aseguradora: "Previsora" },
  { urbanizacion: "DUQUESA", aseguradora: "Axa Colpatria" },
  { urbanizacion: "Villa Central", aseguradora: "Mapfre" },
];

/**
 * SENDERO VERDE: son DOS edificios distintos, no uno.
 *
 *   · EDIFICIO Sendero Verde            → hoy en Seguros del Estado
 *   · CONJUNTO RESIDENCIAL Sendero Verde → hoy en Zurich
 *
 * El Excel llama «Sendero Verde» a los dos, así que sus 102 endosos venían
 * revueltos en un solo montón y el cruce automático los mandó enteros al de
 * Seguros del Estado.
 *
 * Se separan por la aseguradora que quedó anotada en cada endoso. Las fechas
 * confirman que son dos edificios y no uno que cambió de compañía: los de
 * Zurich van de octubre de 2025 a agosto de 2026 y los de SBS de agosto de 2025
 * a abril de 2026, o sea que se solapan medio año. Los de SBS son del Edificio,
 * que estaba en SBS antes de pasarse a Seguros del Estado.
 *
 * Los dos endosos de Previsora no encajan en ninguno de los dos y se dejan sin
 * ficha a propósito, para que alguien los mire.
 */
const SENDERO_VERDE = {
  aliasEnElExcel: ["Sendero Verde", "SENDERO VERDE ITAGUI"],
  edificios: [
    {
      nombre: "Conjunto Residencial Sendero Verde",
      asegurado: "CONJUNTO RESIDENCIAL SENDERO VERDE PH",
      aseguradorasEnEndosos: ["Zurich"],
    },
    {
      nombre: "Edificio Sendero Verde",
      asegurado: "EDIFICIO SENDERO VERDE P.H",
      aseguradorasEnEndosos: ["SBS", "Seguros del Estado", "Escritorio Virtual SBS"],
    },
  ],
};

/**
 * Elige la póliza que corresponde: la de ZONA COMÚN.
 *
 * Un mismo edificio suele tener dos pólizas, la de zona común (incendio y
 * terremoto) y la de responsabilidad civil. El endoso va contra la primera. El
 * cruce automático se quedaba con la de vencimiento más lejano sin mirar el
 * ramo, y en 35 fichas guardó el número de la de RC.
 */
async function polizaDe(asegurado: string) {
  const todas = await prisma.policy.findMany({
    where: { asegurado, vencimiento: { not: null } },
    select: { numero: true, ccNit: true, aseguradora: true, ramo: true, vencimiento: true },
  });
  if (!todas.length) return null;
  const zc = todas.filter((p) => /^ZONA/i.test(p.ramo));
  const lista = zc.length ? zc : todas;
  return lista.sort((a, b) => (b.vencimiento?.getTime() ?? 0) - (a.vencimiento?.getTime() ?? 0))[0];
}

const f = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "—");

async function main() {
  console.log(APLICAR ? "APLICANDO\n" : "SIMULACIÓN (añade --aplicar para escribir)\n");

  // --- 1. Corregir el ramo de las fichas ya creadas -----------------------
  console.log("1. Fichas existentes: usar la póliza de zona común y no la de RC");
  const fichas = await prisma.copropiedad.findMany();
  let corregidas = 0;
  for (const ficha of fichas) {
    if (!ficha.numeroPoliza) continue;
    const actual = await prisma.policy.findFirst({
      where: { numero: ficha.numeroPoliza },
      select: { asegurado: true, ramo: true },
    });
    if (!actual || /^ZONA/i.test(actual.ramo)) continue;
    const buena = await polizaDe(actual.asegurado);
    if (!buena || buena.numero === ficha.numeroPoliza) continue;
    const cambiaVigencia =
      buena.vencimiento?.getTime() !== ficha.vigenciaHasta?.getTime();
    if (corregidas < 6 || cambiaVigencia) {
      console.log(
        `   ${ficha.nombre}: pól. ${ficha.numeroPoliza} (${actual.ramo}) → ${buena.numero} (${buena.ramo})` +
          (cambiaVigencia ? `  ·  VIGENCIA ${f(ficha.vigenciaHasta)} → ${f(buena.vencimiento)}` : "")
      );
    }
    corregidas++;
    if (APLICAR) {
      await prisma.copropiedad.update({
        where: { id: ficha.id },
        data: {
          numeroPoliza: buena.numero,
          aseguradora: buena.aseguradora,
          vigenciaHasta: buena.vencimiento,
        },
      });
    }
  }
  console.log(`   → ${corregidas} fichas corregidas\n`);

  // --- 2. Separar los dos Sendero Verde ----------------------------------
  console.log("2. Sendero Verde: separar los dos edificios que el Excel llamaba igual");
  for (const ed of SENDERO_VERDE.edificios) {
    const pol = await polizaDe(ed.asegurado);
    if (!pol) {
      console.log(`   ${ed.nombre}: NO encontré "${ed.asegurado}" en la cartera`);
      continue;
    }
    const n = await prisma.endoso.count({
      where: {
        urbanizacion: { in: SENDERO_VERDE.aliasEnElExcel },
        aseguradora: { in: ed.aseguradorasEnEndosos },
      },
    });
    console.log(
      `   ${ed.nombre}: ${n} endosos (${ed.aseguradorasEnEndosos.join("/")}) → ${pol.aseguradora} · pól. ${pol.numero} · vence ${f(pol.vencimiento)}`
    );
    if (APLICAR) {
      const ficha = await prisma.copropiedad.upsert({
        where: { nombre: ed.nombre },
        create: {
          nombre: ed.nombre,
          nit: pol.ccNit,
          aseguradora: pol.aseguradora,
          numeroPoliza: pol.numero,
          vigenciaHasta: pol.vencimiento,
          nota:
            "El Excel llamaba «Sendero Verde» a este edificio y al otro; sus endosos se " +
            `separaron por la aseguradora anotada (${ed.aseguradorasEnEndosos.join(", ")}). ` +
            "Falta poner el valor asegurado del edificio y el paz y salvo.",
        },
        update: {
          aseguradora: pol.aseguradora,
          numeroPoliza: pol.numero,
          vigenciaHasta: pol.vencimiento,
        },
      });
      await prisma.endoso.updateMany({
        where: {
          urbanizacion: { in: SENDERO_VERDE.aliasEnElExcel },
          aseguradora: { in: ed.aseguradorasEnEndosos },
        },
        data: { copropiedadId: ficha.id },
      });
    }
  }
  // La ficha genérica que creó el cruce automático ya no tiene sentido.
  const genericos = await prisma.endoso.count({
    where: {
      urbanizacion: { in: SENDERO_VERDE.aliasEnElExcel },
      aseguradora: {
        notIn: SENDERO_VERDE.edificios.flatMap((e) => e.aseguradorasEnEndosos),
      },
    },
  });
  console.log(
    `   quedan ${genericos} endosos de otra aseguradora: se dejan SIN ficha, para revisarlos a mano`
  );
  if (APLICAR) {
    await prisma.endoso.updateMany({
      where: {
        urbanizacion: { in: SENDERO_VERDE.aliasEnElExcel },
        aseguradora: {
          notIn: SENDERO_VERDE.edificios.flatMap((e) => e.aseguradorasEnEndosos),
        },
      },
      data: { copropiedadId: null },
    });
    await prisma.copropiedad.deleteMany({ where: { nombre: "Sendero Verde" } });
    console.log('   ficha genérica "Sendero Verde" eliminada');
  }
  console.log("");

  // --- 3. Fichas nuevas con póliza en la cartera --------------------------
  console.log("3. Fichas nuevas con póliza en la cartera");
  for (const c of CON_CARTERA) {
    const n = await prisma.endoso.count({ where: { urbanizacion: c.urbanizacion } });
    const pol = await polizaDe(c.asegurado);
    if (!pol) {
      console.log(`   ${c.urbanizacion}: NO encontré "${c.asegurado}" en la cartera`);
      continue;
    }
    console.log(
      `   ${c.urbanizacion} (${n} endosos) → ${c.asegurado} · ${pol.aseguradora} · pól. ${pol.numero} · vence ${f(pol.vencimiento)}`
    );
    if (APLICAR) {
      const ficha = await prisma.copropiedad.upsert({
        where: { nombre: c.urbanizacion },
        create: {
          nombre: c.urbanizacion,
          nit: pol.ccNit,
          aseguradora: pol.aseguradora,
          numeroPoliza: pol.numero,
          vigenciaHasta: pol.vencimiento,
          nota: `Ficha creada desde la cartera (${c.asegurado}): ${c.porque}. Falta poner el valor asegurado del edificio y el paz y salvo.`,
        },
        update: {},
      });
      await prisma.endoso.updateMany({
        where: { urbanizacion: c.urbanizacion, copropiedadId: null },
        data: { copropiedadId: ficha.id },
      });
    }
  }
  console.log("");

  // --- 4. Fichas nuevas sin póliza en la cartera --------------------------
  console.log("4. Fichas nuevas SIN póliza en la cartera (quedan sin vigencia, a completar)");
  for (const c of SIN_CARTERA) {
    const n = await prisma.endoso.count({ where: { urbanizacion: c.urbanizacion } });
    console.log(`   ${c.urbanizacion} (${n} endosos) · ${c.aseguradora} · sin póliza en cartera`);
    if (APLICAR) {
      const ficha = await prisma.copropiedad.upsert({
        where: { nombre: c.urbanizacion },
        create: {
          nombre: c.urbanizacion,
          aseguradora: c.aseguradora,
          nota:
            "Esta copropiedad NO aparece en la cartera del CRM, así que no se pudo traer su póliza " +
            "ni su vigencia. Hasta que se completen a mano, sus endosos no entran en el aviso de renovación.",
        },
        update: {},
      });
      await prisma.endoso.updateMany({
        where: { urbanizacion: c.urbanizacion, copropiedadId: null },
        data: { copropiedadId: ficha.id },
      });
    }
  }
  console.log("");

  // --- 5. Alias: enganchar a una ficha que ya existe ----------------------
  console.log("5. Otra forma de escribir un edificio que ya tiene ficha");
  for (const a of ALIAS) {
    const n = await prisma.endoso.count({ where: { urbanizacion: a.urbanizacion } });
    const ficha = await prisma.copropiedad.findFirst({ where: { nombre: a.fichaExistente } });
    console.log(
      `   ${a.urbanizacion} (${n} endosos) → ficha "${a.fichaExistente}"${ficha ? "" : "  [AÚN NO EXISTE]"} — ${a.porque}`
    );
    if (APLICAR && ficha) {
      await prisma.endoso.updateMany({
        where: { urbanizacion: a.urbanizacion, copropiedadId: null },
        data: { copropiedadId: ficha.id },
      });
    }
  }

  const sueltos = await prisma.endoso.count({ where: { copropiedadId: null } });
  const fichasTotal = await prisma.copropiedad.count();
  console.log(`\nEndosos sin ficha: ${sueltos} · Fichas totales: ${fichasTotal}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
