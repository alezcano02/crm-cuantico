/**
 * Puebla las colectivas con los amparados del listado de débitos de Sura.
 *
 *   npx tsx scripts/importar-colectivas.ts <archivo.txt>              (ensayo)
 *   npx tsx scripts/importar-colectivas.ts <archivo.txt> --aplicar
 *   npx tsx scripts/importar-colectivas.ts <archivo.txt> --mes "Marzo 2026"
 *
 * El archivo es el volcado de texto del libro «Debitos Cristica & EM», tal
 * como lo devuelve el conector de SharePoint. Ver lib/debitos.ts para el
 * formato.
 *
 * SE TOMA UN SOLO MES: el más reciente del archivo, salvo que se indique otro
 * con --mes. El listado de un mes ES la nómina asegurada de ese mes, así que
 * mezclar meses metería como activa a gente que ya se retiró.
 *
 * ES IDEMPOTENTE: se apoya en la llave única (póliza, empleado, amparado), así
 * que volver a correrlo con un mes más nuevo actualiza en vez de duplicar.
 * Quien estaba y ya no aparece se marca RETIRADO, no se borra: un amparado
 * borrado se lleva por delante su historia de novedades.
 */
import { prisma } from "../lib/prisma";
import {
  leerDebitos,
  leerListadoLibre,
  leerListadoPlacas,
  libroATexto,
  ordenDeMes,
  type AmparadoLeido,
} from "../lib/debitos";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const APLICAR = args.includes("--aplicar");
const RUTA = args.find((a) => !a.startsWith("--"));
const MES_PEDIDO = args.includes("--mes") ? args[args.indexOf("--mes") + 1] : null;

/**
 * Cómo se llama cada empresa en el archivo de Sura y cómo en el CRM.
 *
 * Sura escribe «ESPUMAS MEDELLIN S.A.» y la lista de empresas del CRM dice
 * «ESPUMAS MEDELLIN». Sin este puente los amparados quedarían colgando de una
 * empresa que no existe.
 */
const EMPRESAS: [RegExp, string][] = [
  [/espumas\s+medell/i, "ESPUMAS MEDELLIN"],
  [/cristica/i, "CRISTICA S.A.S"],
  [/log[ií]stica\s+terrestre/i, "LOGISTICA TERRESTRE LIMITADA"],
  // Las dos grafías del informe («JYM O SAS» y «JYMO») son la misma empresa.
  [/inversiones\s+jym/i, "INVERSIONES JYMO S.A.S"],
  [/munera\s+sierra/i, "TRANSPORTES MUNERA SIERRA"],
  [/carrillos/i, "CARRILLOS S.A.S"],
  // Espumados del Litoral NO tiene entrada propia a propósito: sus pólizas son
  // de Cristica. Como «CRISTICA S.A.S/ ESPUMADOS DEL LITORAL» contiene las dos
  // razones sociales, al no declararla cae en la regla de Cristica de arriba,
  // que es donde debe estar.
];

function empresaCRM(nombreSura: string): string | null {
  for (const [re, nombre] of EMPRESAS) if (re.test(nombreSura)) return nombre;
  return null;
}

/**
 * Fecha efectiva del movimiento: el primer día del mes del listado.
 *
 * Un listado libre no trae mes en el nombre de la hoja («Listado» a secas), y
 * entonces vale hoy: lo que dice ese archivo es quién está cubierto ahora. Sin
 * esta salida, `ordenDeMes` devolvía −1 y salía la fecha del año −2.
 */
function fechaDelMes(nombreMes: string): Date {
  const n = ordenDeMes(nombreMes);
  if (n < 0) {
    const h = new Date();
    return new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), 1));
  }
  return new Date(Date.UTC(Math.floor(n / 100), (n % 100) - 1, 1));
}

async function main() {
  if (!RUTA) {
    console.error("Falta la ruta del archivo de débitos.");
    process.exit(1);
  }

  // El .xlsx de la carpeta sincronizada es la fuente buena: el volcado de
  // texto del conector viene cortado en los libros grandes.
  const texto = /\.xlsx?$/i.test(RUTA) ? libroATexto(RUTA) : readFileSync(RUTA, "utf8");
  // Dos formatos de origen distintos: los débitos mensuales de Sura (personas)
  // y el listado de flota de una colectiva de autos (placas).
  const opcion = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
  const meses = args.includes("--placas")
    ? [leerListadoPlacas(texto)]
    : args.includes("--listado")
      ? [
          leerListadoLibre(
            texto,
            opcion("--empresa") ?? "",
            opcion("--poliza") ?? "",
            opcion("--plan") ?? "COLECTIVA"
          ),
        ]
      : leerDebitos(texto);
  if (!meses.length) {
    console.error("No se reconoció ninguna hoja mensual en el archivo.");
    process.exit(1);
  }

  console.log("Hojas encontradas:");
  for (const m of meses) console.log(`  ${m.nombre.padEnd(16)} ${m.amparados.length} amparados`);

  /*
   * Solo se consideran hojas con gente. Una hoja vacía no significa que la
   * empresa se quedó sin empleados: significa que el archivo venía cortado
   * —el volcado de SharePoint trunca los libros grandes— y tomarla como
   * nómina del mes marcaría RETIRADO a toda la empresa de una sentada.
   */
  const conDatos = meses.filter((m) => m.amparados.length > 0);
  const vacias = meses.filter((m) => m.amparados.length === 0);
  if (vacias.length) {
    console.log(
      `\nHojas sin filas (archivo cortado, se ignoran): ${vacias.map((m) => m.nombre).join(", ")}`
    );
  }
  if (!conDatos.length) {
    console.error("Ninguna hoja trae amparados. Revise que el archivo esté completo.");
    process.exit(1);
  }

  const mes = MES_PEDIDO
    ? conDatos.find((m) => m.nombre.toLowerCase() === MES_PEDIDO.toLowerCase())
    : conDatos.reduce((a, b) => (ordenDeMes(b.nombre) > ordenDeMes(a.nombre) ? b : a));
  if (!mes) {
    console.error(`No existe la hoja «${MES_PEDIDO}» o viene vacía.`);
    process.exit(1);
  }

  /*
   * Segundo cortafuegos: una caída fuerte contra el mes anterior casi siempre
   * es una sección que el lector no supo leer, no una ola de retiros. Se avisa
   * y se exige confirmación explícita antes de escribir.
   */
  const previo = conDatos
    .filter((m) => ordenDeMes(m.nombre) < ordenDeMes(mes.nombre))
    .reduce<typeof mes | null>((a, b) => (!a || ordenDeMes(b.nombre) > ordenDeMes(a.nombre) ? b : a), null);
  if (previo && mes.amparados.length < previo.amparados.length * 0.8) {
    console.log(
      `\n! ${mes.nombre} trae ${mes.amparados.length} amparados frente a ` +
        `${previo.amparados.length} de ${previo.nombre}: una caída de más del 20%.` +
        `\n  Confirme que el archivo está completo antes de aplicar.`
    );
    if (APLICAR && !args.includes("--forzar")) {
      console.error("  Abortado. Añada --forzar si la caída es real.");
      process.exit(1);
    }
  }
  console.log(`\nSe usa: ${mes.nombre} (${mes.amparados.length} amparados)\n`);

  // Agrupar por empresa del CRM, avisando de lo que no cruza.
  const porEmpresa = new Map<string, AmparadoLeido[]>();
  const sinEmpresa = new Set<string>();
  for (const a of mes.amparados) {
    const nombre = empresaCRM(a.empresa);
    if (!nombre) {
      sinEmpresa.add(a.empresa);
      continue;
    }
    const lista = porEmpresa.get(nombre) ?? [];
    lista.push(a);
    porEmpresa.set(nombre, lista);
  }
  if (sinEmpresa.size) {
    console.log("Empresas del archivo sin equivalencia en el CRM:");
    for (const e of sinEmpresa) console.log(`  ${e}`);
    console.log();
  }

  for (const [nombre, lista] of porEmpresa) {
    const personas = lista.filter((a) => a.parentesco !== "VE");
    const titulares = new Set(personas.filter((a) => a.parentesco === "AF").map((a) => a.docEmpleado));
    const vehiculos = lista.filter((a) => a.parentesco === "VE");
    const polizas = new Set(lista.map((a) => a.polizaNumero));
    console.log(
      `${nombre.padEnd(20)} ${String(titulares.size).padStart(3)} empleados · ` +
        `${String(personas.length - titulares.size).padStart(3)} beneficiarios · ` +
        `${String(vehiculos.length).padStart(3)} vehículos · ${polizas.size} pólizas`
    );
  }

  if (!APLICAR) {
    console.log("\nEnsayo: no se escribió nada. Vuelva a correrlo con --aplicar.");
    await prisma.$disconnect();
    return;
  }

  const fecha = fechaDelMes(mes.nombre);
  let creados = 0;
  let actualizados = 0;
  let retirados = 0;

  for (const [nombre, lista] of porEmpresa) {
    const empresa = await prisma.empresaColectiva.findUnique({ where: { nombre } });
    if (!empresa) {
      console.log(`  ! La empresa «${nombre}» no existe en el CRM; se omite.`);
      continue;
    }

    const vistos = new Set<string>();
    for (const a of lista) {
      const llave = { polizaNumero: a.polizaNumero, docEmpleado: a.docEmpleado, nombreAmparado: a.nombreAmparado };
      vistos.add(`${a.polizaNumero}|${a.docEmpleado}|${a.nombreAmparado}`);

      const previo = await prisma.amparadoColectiva.findUnique({
        where: { polizaNumero_docEmpleado_nombreAmparado: llave },
      });

      const datos = {
        empresaId: empresa.id,
        ramo: a.parentesco === "VE" ? "COLECTIVA" : a.plan.startsWith("VIDA") ? "VIDA GRUPO" : "SALUD",
        plan: a.plan,
        nombreEmpleado: a.nombreEmpleado,
        docAmparado: a.docAmparado,
        parentesco: a.parentesco,
        placa: a.placa,
        estado: "EXPEDIDO", // si Sura lo está cobrando, está expedido
        fechaRetiro: null,
      };

      if (previo) {
        await prisma.amparadoColectiva.update({ where: { id: previo.id }, data: datos });
        actualizados++;
      } else {
        await prisma.amparadoColectiva.create({
          data: { ...datos, ...llave, fechaIngreso: fecha },
        });
        await prisma.novedadColectiva.create({
          data: {
            empresaId: empresa.id,
            tipo: "INCLUSION",
            fecha,
            estado: "CONFIRMADA", // viene de un recibo ya cobrado
            nombreAmparado: a.nombreAmparado,
            docAmparado: a.docAmparado || a.docEmpleado,
            nota: `Listado de débitos ${mes.nombre} · póliza ${a.polizaNumero}`,
          },
        });
        creados++;
      }
    }

    // Quien estaba activo y no aparece en el listado del mes ya no está cubierto.
    const activos = await prisma.amparadoColectiva.findMany({
      where: { empresaId: empresa.id, estado: { not: "RETIRADO" } },
    });
    for (const v of activos) {
      if (vistos.has(`${v.polizaNumero}|${v.docEmpleado}|${v.nombreAmparado}`)) continue;
      await prisma.amparadoColectiva.update({
        where: { id: v.id },
        data: { estado: "RETIRADO", fechaRetiro: fecha },
      });
      await prisma.novedadColectiva.create({
        data: {
          empresaId: empresa.id,
          amparadoId: v.id,
          tipo: "RETIRO",
          fecha,
          estado: "CONFIRMADA",
          nombreAmparado: v.nombreAmparado,
          docAmparado: v.docAmparado || v.docEmpleado,
          nota: `No aparece en el listado de débitos ${mes.nombre}`,
        },
      });
      retirados++;
    }
  }

  console.log(`\nIncluidos ${creados} · actualizados ${actualizados} · retirados ${retirados}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
