/**
 * Utilidad de verificación: parsea un informe de producción (.xlsx) con el
 * mismo parser de la app y ejecuta el motor de cálculo, imprimiendo el
 * seguimiento consolidado del año indicado. Permite contrastar los resultados
 * de la app contra la hoja "SEGUIMIENTO" del Excel sin tocar la base de datos.
 *
 * Uso: npx tsx scripts/verificar-excel.ts "C:\ruta\informe.xlsx" [año]
 */
import { readFileSync } from "fs";
import { parsearLibro } from "../lib/excel";
import { calcularSeguimiento } from "../lib/calculos";

const [, , ruta, anioArg] = process.argv;
if (!ruta) {
  console.error('Uso: npx tsx scripts/verificar-excel.ts "<ruta al .xlsx>" [año]');
  process.exit(1);
}
const anio = Number(anioArg) || 2026;

const datos = parsearLibro(readFileSync(ruta));

console.log("=== Resumen de importación ===");
for (const r of datos.resumen) {
  console.log(
    `${r.hoja}: leídos=${r.leidos} importables=${r.importables} duplicados=${r.duplicados} errores=${r.errores.length} advertencias=${r.advertencias.length}`
  );
  for (const e of r.errores.slice(0, 5)) console.log("   ERROR:", e);
}

const seg = calcularSeguimiento(
  {
    polizas: datos.policies,
    cancelaciones: datos.cancellations,
    historicas2025: datos.historical,
  },
  anio
);

console.log(`\n=== Seguimiento consolidado ${anio} ===`);
console.table(
  seg.consolidado.map((f) => ({
    mes: f.mes,
    base: Math.round(f.base),
    meta: Math.round(f.meta),
    real: Math.round(f.real),
    nuevos: Math.round(f.nuevos),
    renovaciones: Math.round(f.renovaciones),
    prodCancelada: Math.round(f.produccionCancelada),
    cancelaciones: Math.round(f.cancelaciones),
    neta: Math.round(f.neta),
    cumpl: f.cumplimiento == null ? "—" : (f.cumplimiento * 100).toFixed(1) + "%",
  }))
);
