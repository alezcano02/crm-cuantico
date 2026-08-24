/**
 * Carga el mapa de colectivas desde «Cambios en colectivas.xlsx» y lo aplica.
 *
 *   npx tsx scripts/cargar-mapa-colectivas.ts "<archivo.xlsx>"            (ensayo)
 *   npx tsx scripts/cargar-mapa-colectivas.ts "<archivo.xlsx>" --aplicar
 *
 * El libro trae dos hojas:
 *
 *  · MOVER DE VENCIMIENTOS A COLECTIVAS — qué filas del informe son recibos de
 *    una colectiva. Columnas: póliza a ingresar, razón social, # colectiva.
 *    Cuando el número se repite entre madre e inclusión, la primera columna
 *    trae «número - PLACA» para desempatar.
 *
 *  · CAMBIAR NOMBRE DE RAMO — con qué nombre aparece cada colectiva en toda la
 *    aplicación. Columnas: número de póliza colectiva, nombre nuevo.
 *
 * Después de escribir el mapa, reaplica `aplicarMapaColectivas`, así que la
 * cartera queda corregida en la misma pasada.
 */
import { prisma } from "../lib/prisma";
import { libroATexto } from "../lib/debitos";
import { ramoCanonico } from "../lib/colectivas";
import { aplicarMapaColectivas, normalizarNumero } from "../lib/mapa-colectivas";

const args = process.argv.slice(2);
const APLICAR = args.includes("--aplicar");
const RUTA = args.find((a) => !a.startsWith("--"));

const cop = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

/** Hojas del libro, cada una como lista de filas ya partidas por columnas. */
function hojas(texto: string): Map<string, string[][]> {
  const salida = new Map<string, string[][]>();
  let actual: string[][] | null = null;
  for (const linea of texto.split(/\r?\n/)) {
    const cab = linea.match(/^## Sheet:\s*(.+?)\s+—/);
    if (cab) {
      actual = [];
      salida.set(cab[1].trim().toUpperCase(), actual);
      continue;
    }
    if (actual) actual.push(linea.split("\t").map((c) => c.trim()));
  }
  return salida;
}

function buscarHoja(mapa: Map<string, string[][]>, fragmento: string): string[][] {
  for (const [nombre, filas] of mapa) if (nombre.includes(fragmento)) return filas;
  return [];
}

async function main() {
  if (!RUTA) {
    console.error("Falta la ruta del archivo de cambios.");
    process.exit(1);
  }

  const libro = hojas(libroATexto(RUTA));
  const hojaRecibos = buscarHoja(libro, "MOVER DE VENCIMIENTOS");
  const hojaRamos = buscarHoja(libro, "CAMBIAR NOMBRE");

  // --- Hoja de nombres de ramo -------------------------------------------
  const madres: { numero: string; ramo: string }[] = [];
  for (const f of hojaRamos.slice(1)) {
    const [numero, nombre] = f;
    if (!numero || !nombre || /^n[uú]mero/i.test(numero)) continue;
    madres.push({ numero: numero.trim(), ramo: ramoCanonico(nombre) });
  }

  // --- Hoja de recibos ----------------------------------------------------
  const recibos: { numero: string; placa: string; colectiva: string }[] = [];
  for (const f of hojaRecibos.slice(1)) {
    const [poliza, , colectiva] = f;
    if (!poliza || !colectiva || /^p[oó]liza/i.test(poliza)) continue;
    // «2000691934 - PWY867»: el número y la placa que lo desempata.
    const m = poliza.match(/^(\S+)\s*-\s*([A-Z0-9]+)$/i);
    recibos.push({
      numero: (m ? m[1] : poliza).trim(),
      placa: m ? m[2].trim().toUpperCase() : "",
      colectiva: colectiva.trim(),
    });
  }

  console.log(`Leído: ${madres.length} colectivas con nombre nuevo, ${recibos.length} recibos.\n`);

  // Toda colectiva citada como madre de un recibo debe existir en la tabla de
  // madres; si no, el recibo quedaría colgando de nada.
  const numerosMadre = new Set(madres.map((m) => normalizarNumero(m.numero)));
  const huerfanos = recibos.filter((r) => !numerosMadre.has(normalizarNumero(r.colectiva)));
  if (huerfanos.length) {
    console.log("Recibos que apuntan a una colectiva no declarada en la hoja de ramos:");
    for (const h of huerfanos) console.log(`  ${h.numero} -> ${h.colectiva}`);
    console.log();
  }

  console.log("Colectivas y sus recibos:");
  for (const m of madres) {
    const suyos = recibos.filter((r) => normalizarNumero(r.colectiva) === normalizarNumero(m.numero));
    console.log(`  ${m.numero.padEnd(14)} ${m.ramo.padEnd(18)} ${suyos.length} recibos`);
  }

  if (!APLICAR) {
    console.log("\nEnsayo: no se escribió nada. Vuelva a correrlo con --aplicar.");
    await prisma.$disconnect();
    return;
  }

  /*
   * Por defecto se FUNDE con lo que ya hay, no se reemplaza.
   *
   * El Excel no siempre es la declaración completa: hay colectivas que se
   * añaden desde la aplicación o a mano, y borrar todo antes de cargar las
   * hacía desaparecer en silencio la siguiente vez que alguien recargaba el
   * archivo. Con --reemplazar se vacía primero, para cuando el Excel sí sea la
   * verdad entera.
   */
  if (args.includes("--reemplazar")) {
    await prisma.$transaction([
      prisma.reciboColectiva.deleteMany(),
      prisma.colectivaMadre.deleteMany(),
    ]);
    console.log("\nMapa anterior borrado (--reemplazar).");
  }

  for (const m of madres) {
    await prisma.colectivaMadre.upsert({
      where: { numero: m.numero },
      update: { ramo: m.ramo },
      create: { numero: m.numero, ramo: m.ramo },
    });
  }
  for (const r of recibos) {
    const declarada =
      numerosMadre.has(normalizarNumero(r.colectiva)) ||
      (await prisma.colectivaMadre.findUnique({ where: { numero: r.colectiva } })) != null;
    if (!declarada) continue;
    await prisma.reciboColectiva.upsert({
      where: { numero_placa: { numero: r.numero, placa: r.placa } },
      update: { colectivaNumero: r.colectiva },
      create: { numero: r.numero, placa: r.placa, colectivaNumero: r.colectiva },
    });
  }

  const res = await aplicarMapaColectivas();
  console.log(`\nMadres renombradas:  ${res.madresRenombradas}`);
  console.log(`Recibos absorbidos:  ${res.recibosMarcados}`);
  console.log(`Recibos liberados:   ${res.recibosLimpiados}`);
  console.log(`Prima absorbida:     ${cop(res.primaAbsorbida)}`);
  if (res.recibosSinPoliza.length)
    console.log(`\nRecibos declarados que no están en la cartera:\n  ${res.recibosSinPoliza.join("\n  ")}`);
  if (res.madresSinPoliza.length)
    console.log(`\nColectivas declaradas que no están en la cartera:\n  ${res.madresSinPoliza.join("\n  ")}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
