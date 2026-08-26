/**
 * Unifica copropiedades que están dos veces con el nombre escrito distinto, y
 * rellena la fecha de entrega al cliente de los casos históricos.
 *
 * POR QUÉ HACEN FALTA LAS DOS COSAS
 *
 * En los desplegables de filtro «MOSAICO» y «Mosaico Propiedad Horizontal»
 * salían como dos edificios, y quien filtraba por uno perdía los casos del
 * otro. Lo mismo con Contree, Quintas del Sol, Lalik, Amatista, Canta Piedra y
 * Alaia Mantra.
 *
 * CÓMO SE DECIDE QUE SON EL MISMO
 *
 * No por el parecido del nombre —eso ya salió caro con Sendero Verde— sino
 * porque su ficha tiene el MISMO NIT y el MISMO número de póliza. Dos edificios
 * distintos no comparten póliza. Los pares que no cumplen eso NO se tocan:
 *
 *  · «CONJUNTO RESIDENCIAL SENDERO VERDE PH» (NIT 901.222.290-0, Seguros del
 *    Estado) y «Conjunto Residencial Sendero Verde» (NIT 9009836294, Zurich)
 *    tienen NIT y aseguradora distintos: son dos edificios de verdad.
 *  · «SENDERO VERDE ITAGUI» y «Sendero Verde» no tienen ficha, así que no hay
 *    con qué comprobarlo.
 *
 * Uso:
 *   npx tsx scripts/unificar-copropiedades-duplicadas.ts            (simulación)
 *   npx tsx scripts/unificar-copropiedades-duplicadas.ts --aplicar
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APLICAR = process.argv.includes("--aplicar");

/** Deja el nombre comparable: sin tildes, sin mayúsculas y sin espacios. */
const clave = (s: string | null) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/**
 * Edificios que NUNCA se fusionan, por mucho que sus fichas se parezcan.
 *
 * Sendero Verde son dos edificios distintos —lo confirmó la agencia: el
 * «Edificio» está en Seguros del Estado y el «Conjunto Residencial» en
 * Zurich—, pero sus dos fichas quedaron con el mismo NIT y la misma póliza.
 * O sea que la comprobación de «mismo NIT, mismo edificio» aquí no vale: lo
 * que está mal es la ficha, no el nombre. Fusionarlos borraría una distinción
 * real y volvería a mezclar los endosos de los dos.
 */
const NUNCA_FUSIONAR = ["sendero verde"];

const esIntocable = (nombre: string) =>
  NUNCA_FUSIONAR.some((n) => clave(nombre).includes(clave(n)));

const sinEspaciosDobles = (n: string) => n.replace(/\s+/g, " ").trim();

/**
 * Cuando los nombres tienen PALABRAS distintas —«Contree» y «CONTREE
 * PALMAS»— gana el que más se usa. Es el nombre con el que la gente conoce el
 * edificio, y el corto suele ser una abreviatura de una vez.
 */
function nombreMasUsado(nombres: string[], usos: Map<string, number>): string {
  return sinEspaciosDobles(
    [...nombres].sort(
      (a, b) => (usos.get(b) ?? 0) - (usos.get(a) ?? 0) || b.length - a.length
    )[0]
  );
}

/**
 * Cuando son LAS MISMAS LETRAS escritas distinto —«Alaia mantra» y «Alaia
 * Mantra»— gana la mejor escrita, aunque se use menos: es la que se va a ver
 * en el desplegable. Se prefiere Cada Palabra En Mayúscula y se penaliza el
 * TODO MAYÚSCULAS y el todo minúsculas.
 */
function nombreMejorEscrito(nombres: string[], usos: Map<string, number>): string {
  const puntos = (n: string) => {
    const palabras = n.trim().split(/\s+/);
    if (n === n.toUpperCase() && /[A-Z]/.test(n)) return 0;
    if (n === n.toLowerCase() && /[a-z]/.test(n)) return 0;
    // Cada palabra larga que empieza en mayúscula suma.
    return palabras.filter((p) => p.length > 2 && p[0] === p[0].toUpperCase()).length;
  };
  return sinEspaciosDobles(
    [...nombres].sort(
      (a, b) => puntos(b) - puntos(a) || (usos.get(b) ?? 0) - (usos.get(a) ?? 0)
    )[0]
  );
}

async function main() {
  const copropiedades = await prisma.copropiedad.findMany();
  const conteos = await prisma.endoso.groupBy({ by: ["urbanizacion"], _count: { id: true } });
  const usos = new Map(conteos.map((c) => [c.urbanizacion, c._count.id]));

  /*
   * Se agrupan por NIT + número de póliza. Solo se consideran duplicadas las
   * fichas que coinciden en ambos: es lo que prueba que es el mismo edificio.
   */
  const porPoliza = new Map<string, typeof copropiedades>();
  for (const c of copropiedades) {
    if (!c.nit || !c.numeroPoliza) continue;
    const k = `${clave(c.nit)}|${clave(c.numeroPoliza)}`;
    if (!porPoliza.has(k)) porPoliza.set(k, []);
    porPoliza.get(k)!.push(c);
  }

  // Además, las que solo difieren en mayúsculas/espacios aunque falte la ficha.
  const porNombre = new Map<string, string[]>();
  for (const u of usos.keys()) {
    const k = clave(u);
    if (!porNombre.has(k)) porNombre.set(k, []);
    porNombre.get(k)!.push(u);
  }

  interface Fusion {
    sobrevive: string;
    absorbe: string[];
    fichaSobrevive: number | null;
    fichasAbsorbidas: number[];
    motivo: string;
  }
  const fusiones: Fusion[] = [];

  const fichaDe = new Map(copropiedades.map((c) => [c.nombre, c.id]));

  for (const [, grupo] of porPoliza) {
    if (grupo.length < 2) continue;
    if (grupo.some((c) => esIntocable(c.nombre))) {
      console.log(
        `  (se deja como está: ${grupo.map((c) => `«${c.nombre}»`).join(" y ")} — ver NUNCA_FUSIONAR)\n`
      );
      continue;
    }
    const sobrevive = nombreMasUsado(grupo.map((c) => c.nombre), usos);
    const resto = grupo.filter((c) => sinEspaciosDobles(c.nombre) !== sobrevive);
    fusiones.push({
      sobrevive,
      absorbe: resto.map((c) => c.nombre),
      fichaSobrevive: grupo.find((c) => sinEspaciosDobles(c.nombre) === sobrevive)?.id ?? null,
      fichasAbsorbidas: resto.map((c) => c.id),
      motivo: `mismo NIT y misma póliza (${grupo[0].nit} · ${grupo[0].numeroPoliza})`,
    });
  }

  for (const [k, nombres] of porNombre) {
    if (nombres.length < 2) continue;
    if (nombres.some(esIntocable)) continue;
    if (fusiones.some((f) => clave(f.sobrevive) === k || f.absorbe.some((a) => clave(a) === k)))
      continue;
    const sobrevive = nombreMejorEscrito(nombres, usos);
    const resto = nombres.filter((n) => sinEspaciosDobles(n) !== sobrevive);
    fusiones.push({
      sobrevive,
      absorbe: resto,
      fichaSobrevive: fichaDe.get(sobrevive) ?? null,
      fichasAbsorbidas: resto.map((n) => fichaDe.get(n)).filter((v): v is number => v != null),
      motivo: "el mismo nombre escrito distinto (mayúsculas o espacios)",
    });
  }

  console.log(`Fusiones detectadas: ${fusiones.length}\n`);
  for (const f of fusiones) {
    const n = f.absorbe.reduce((a, b) => a + (usos.get(b) ?? 0), 0);
    console.log(`  «${f.sobrevive}» (${usos.get(f.sobrevive) ?? 0} casos)`);
    console.log(`     absorbe: ${f.absorbe.map((a) => `«${a}» (${usos.get(a) ?? 0})`).join(", ")}`);
    console.log(`     motivo: ${f.motivo}  → se mueven ${n} casos\n`);
  }

  // --- Fecha de entrega al cliente en los casos históricos -----------------
  const sinFecha = await prisma.endoso.count({
    where: { estado: "ENVIADO_CLIENTE", fechaEnvioCliente: null, fechaEnvioAseguradora: { not: null } },
  });
  console.log(
    `Casos entregados sin fecha de entrega: ${sinFecha} (se toma la fecha de gestión del Excel original)`
  );

  if (!APLICAR) {
    console.log("\nSimulación. Añade --aplicar para escribirlo de verdad.");
    await prisma.$disconnect();
    return;
  }

  for (const f of fusiones) {
    for (const viejo of f.absorbe) {
      await prisma.endoso.updateMany({
        where: { urbanizacion: viejo },
        data: { urbanizacion: f.sobrevive, copropiedadId: f.fichaSobrevive },
      });
    }
    /*
     * El nombre que sobrevive puede haber perdido un espacio doble al
     * normalizarse («LALIK  PH» → «LALIK PH»). Si no se renombran también SUS
     * casos, los que ya lo tenían se quedan con la grafía vieja y acabamos con
     * el duplicado que veníamos a quitar.
     */
    await prisma.endoso.updateMany({
      where: { urbanizacion: { not: f.sobrevive }, copropiedadId: f.fichaSobrevive },
      data: { urbanizacion: f.sobrevive },
    });
    if (f.fichaSobrevive != null) {
      await prisma.copropiedad.update({
        where: { id: f.fichaSobrevive },
        data: { nombre: f.sobrevive },
      });
    }
    /*
     * Antes de borrar la ficha absorbida se le pasa a la que sobrevive todo
     * dato que ella no tenga: la duplicada puede ser la que llevaba el paz y
     * salvo o el valor asegurado al día.
     */
    for (const id of f.fichasAbsorbidas) {
      const vieja = await prisma.copropiedad.findUnique({ where: { id } });
      if (!vieja || f.fichaSobrevive == null) continue;
      const nueva = await prisma.copropiedad.findUnique({ where: { id: f.fichaSobrevive } });
      if (!nueva) continue;
      const rellenar: Record<string, unknown> = {};
      for (const campo of [
        "nit",
        "aseguradora",
        "numeroPoliza",
        "vigenciaHasta",
        "valorAseguradoTotal",
        "pazSalvoVigenteHasta",
        "pazSalvoEstado",
      ] as const) {
        if (nueva[campo] == null && vieja[campo] != null) rellenar[campo] = vieja[campo];
      }
      if (Object.keys(rellenar).length)
        await prisma.copropiedad.update({ where: { id: f.fichaSobrevive }, data: rellenar });
      await prisma.endoso.updateMany({
        where: { copropiedadId: id },
        data: { copropiedadId: f.fichaSobrevive },
      });
      await prisma.copropiedad.delete({ where: { id } });
    }
  }
  console.log(`\nUnificadas ${fusiones.length} copropiedades.`);

  const r = await prisma.$executeRaw`
    UPDATE "Endoso"
       SET "fechaEnvioCliente" = "fechaEnvioAseguradora"
     WHERE "estado" = 'ENVIADO_CLIENTE'
       AND "fechaEnvioCliente" IS NULL
       AND "fechaEnvioAseguradora" IS NOT NULL`;
  console.log(`Fecha de entrega rellenada en ${r} casos.`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
