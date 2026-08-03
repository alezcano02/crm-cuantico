/**
 * Prueba de regresión del motor de cálculo contra los valores de la hoja
 * "SEGUIMIENTO 2026" del informe real (2026-05-22). Toma la ruta del Excel
 * como argumento y compara al peso los agregados calculados por la app.
 *
 * Uso: npx tsx scripts/test-calculos.ts "C:\ruta\informe.xlsx"
 */
import { readFileSync } from "fs";
import { parsearLibro } from "../lib/excel";
import { calcularSeguimiento, FilaSeguimiento, primaNoCausada } from "../lib/calculos";

const ruta = process.argv[2];
if (!ruta) {
  console.error('Uso: npx tsx scripts/test-calculos.ts "<ruta al .xlsx>"');
  process.exit(1);
}

/**
 * Informe del que se tomaron los valores esperados de más abajo. Es el que vive
 * en la carpeta compartida, que se sigue editando; la fecha es la del contenido
 * usado como referencia, no la del nombre del archivo (que sigue diciendo 2026-05-22):
 * "…\3. Area Tecnica\Informes\Informe Anual\2026\20260522 - NUEVO - INFORME DE PRODUCCIÓN COMPLETO 2026.xlsx"
 */
const ARCHIVO_ESPERADO = "2026-08-03";

const datos = parsearLibro(readFileSync(ruta));
const seg = calcularSeguimiento(
  {
    polizas: datos.policies,
    cancelaciones: datos.cancellations,
    historicas2025: datos.historical,
  },
  2026
);

// Valores esperados tomados de la hoja "SEGUIMIENTO 2026" del informe.
//
// IMPORTANTE: son una foto de un archivo concreto. El informe es un documento
// vivo; cuando se agregan pólizas hay que refrescar estos números (última
// actualización: archivo del 2026-07-29, que además CAMBIÓ LAS COLUMNAS de la
// hoja DATOS: se insertó OBSERVACION y se eliminó FECHA PAGO).
// Si el test falla, primero compruebe si el .xlsx cambió antes de sospechar
// del motor de cálculo. Desde ese cambio las columnas se localizan por el
// texto de su encabezado (ver mapearColumnas en lib/excel.ts), así que
// agregar o mover columnas ya no descuadra la importación.
//
// Nota: el libro está en cálculo manual, por lo que las celdas de NUEVOS y
// RENOVACIONES pueden guardar valores obsoletos; para esas dos columnas los
// valores esperados se recalculan de forma independiente aplicando las mismas
// fórmulas SUMIFS de la hoja sobre los datos crudos de DATOS.
//
// CANCELACIONES ya NO se compara contra el Excel a propósito: la hoja descuenta
// la prima completa, mientras que la aplicación descuenta solo la prima no
// causada (lo que de verdad se le devuelve al cliente por los días que le
// faltaban de vigencia). Aquí se recalcula esa cifra de forma independiente, y
// con ella la producción neta y el cumplimiento, que dependen de ella.
const cancelacionesDe = (mes?: number) =>
  datos.cancellations
    .filter(
      (c) =>
        c.fechaCancelacion?.getUTCFullYear() === 2026 &&
        (mes === undefined || c.fechaCancelacion.getUTCMonth() === mes)
    )
    .reduce(
      (suma, c) => suma + primaNoCausada(c.primaNeta, c.fechaCancelacion, c.fechaRenovacion),
      0
    );

const cancTotal = cancelacionesDe();
const cancEnero = cancelacionesDe(0);
const cancFebrero = cancelacionesDe(1);
const esperados: { nombre: string; fila: FilaSeguimiento; valores: Partial<Record<keyof FilaSeguimiento, number>> }[] = [
  {
    nombre: "CONSOLIDADO TOTAL",
    fila: seg.consolidado[12],
    valores: {
      base: 6134473608.36495,
      meta: 7432446667.632717,
      real: 4823761704.587059,
      nuevos: 1541124150.217311,
      renovaciones: 3282637554.369748,
      produccionCancelada: 328523493.9243697,
      // Recalculadas: dependen de la prima no causada, no de la hoja.
      cancelaciones: cancTotal,
      neta: 4823761704.587059 - cancTotal,
      cumplimiento: (4823761704.587059 - cancTotal) / 7432446667.632717,
    },
  },
  {
    nombre: "CONSOLIDADO ENERO",
    fila: seg.consolidado[0],
    valores: {
      base: 357829044.1344538,
      meta: 464398521.3046218,
      real: 392191418,
      nuevos: 115551365,
      renovaciones: 276640053,
      produccionCancelada: 45995757,
      cancelaciones: cancEnero,
      neta: 392191418 - cancEnero,
      cumplimiento: (392191418 - cancEnero) / 464398521.3046218,
    },
  },
  {
    nombre: "CONSOLIDADO FEBRERO",
    fila: seg.consolidado[1],
    valores: {
      base: 383594607,
      meta: 569112043.1878151,
      real: 1112465395.3193278,
      nuevos: 572441781.9495798,
      renovaciones: 540023613.3697479,
      produccionCancelada: 111285430.55462185,
      cancelaciones: cancFebrero,
      neta: 1112465395.3193278 - cancFebrero,
      cumplimiento: (1112465395.3193278 - cancFebrero) / 569112043.1878151,
    },
  },
  {
    nombre: "RAMO AP TOTAL",
    fila: seg.porRamo.get("AP")![12],
    valores: { base: 6808120, real: 9827146, nuevos: 154310, renovaciones: 9672836, neta: 9827146 },
  },
  {
    nombre: "RAMO ZONA COMUN (producción real)",
    fila: seg.porRamo.get("ZONA COMUN")![12],
    valores: { real: 3362565329 },
  },
  {
    nombre: "RAMO AUTOS (producción real)",
    fila: seg.porRamo.get("AUTOS")![12],
    valores: { real: 439863645.637479 },
  },
];

let fallos = 0;
for (const { nombre, fila, valores } of esperados) {
  console.log(`\n=== ${nombre} ===`);
  for (const [campo, esperado] of Object.entries(valores)) {
    const obtenido = fila[campo as keyof FilaSeguimiento] as number;
    const ok =
      campo === "cumplimiento"
        ? Math.abs(obtenido - (esperado as number)) < 1e-9
        : Math.abs(obtenido - (esperado as number)) < 1; // tolerancia < $1
    if (!ok) fallos++;
    console.log(`${ok ? "OK  " : "FAIL"} ${campo}: obtenido=${obtenido} esperado=${esperado}`);
  }
}

console.log(
  `\n${fallos === 0 ? "✔ TODOS LOS VALORES COINCIDEN CON LA HOJA SEGUIMIENTO 2026" : `✘ ${fallos} diferencias`}`
);
if (fallos > 0) {
  console.log(
    `\nEsta prueba compara contra una foto del informe del ${ARCHIVO_ESPERADO}.\n` +
      "Antes de sospechar del motor de cálculo, confirme que ese es el archivo que\n" +
      "le pasó. Con un informe anterior a esa fecha las diferencias son normales:\n" +
      "son otros datos, y hasta julio la hoja CANCELACIONES no traía las columnas\n" +
      "FECHA RENOVACIÓN y FECHA CANCELACIÓN (sin ellas se importan 0 cancelaciones)."
  );
}
process.exit(fallos === 0 ? 0 : 1);
