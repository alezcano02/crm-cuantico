/**
 * Prueba de humo del generador de formatos por aseguradora
 * (lib/formatos-aseguradora.ts): genera un archivo por cada una con datos
 * sintéticos realistas y confirma que:
 *
 *  1. Las celdas de entrada quedaron con el valor esperado.
 *  2. NINGUNA celda con fórmula (tasa, prima, IVA, filtros de coeficiente)
 *     fue tocada ni perdida — se compara contra la plantilla real.
 *
 * No toca la base de datos. Uso: npx tsx scripts/probar-formatos-aseguradora.ts
 */
import * as XLSX from "xlsx";
import { writeFileSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import {
  generarFormatoAseguradora,
  type ClaveAseguradoraFormato,
  type DatosEndosoFormato,
  type DatosCopropiedadFormato,
} from "../lib/formatos-aseguradora";

const OUT = mkdtempSync(path.join(tmpdir(), "formatos-aseguradora-"));

const endoso: DatosEndosoFormato = {
  cliente: "Nicole Forbes Gómez",
  cedula: "1039450612",
  direccion: "CL 54 Nº86C - 66",
  ciudad: "Medellín",
  torre: "1",
  apartamento: "1808",
  cuartoUtil: "GJ 01099",
  parqueadero: "DP 01037",
  coeficiente: 0.42,
  valorSolicitado: 285415540,
  banco: "DAVIbank S.A. (antes Scotiabank Colpatria)",
  bancoNit: "860034594-1",
};

const copropiedad: DatosCopropiedadFormato = {
  nombre: "Marsella",
  nit: "900123456-1",
  numeroPoliza: "3001234567",
  vigenciaHasta: new Date("2027-03-15"),
  valorAseguradoTotal: 45000000000,
};

const PLANTILLAS: Record<ClaveAseguradoraFormato, { archivo: string; hoja: string }> = {
  AXA_COLPATRIA: { archivo: "axa-colpatria.xlsx", hoja: "Relacion_cert" },
  ZURICH: { archivo: "zurich.xlsx", hoja: "PLANTILLA ENDOSOS" },
  PREVISORA: { archivo: "previsora.xlsx", hoja: "FORMATO " },
  SBS: { archivo: "sbs.xlsx", hoja: "Template endosos financieros" },
};

let fallos = 0;

for (const clave of Object.keys(PLANTILLAS) as ClaveAseguradoraFormato[]) {
  console.log(`\n=== ${clave} ===`);
  const { buffer, nombreArchivo, faltantes } = generarFormatoAseguradora(clave, endoso, copropiedad, endoso.cliente!);
  const rutaOut = path.join(OUT, nombreArchivo);
  writeFileSync(rutaOut, buffer);
  console.log(`faltantes: ${faltantes.length ? faltantes.join(" | ") : "(ninguno)"}`);

  const { hoja, archivo } = PLANTILLAS[clave];
  const wbOriginal = XLSX.readFile(path.join("lib/plantillas-aseguradoras", archivo), { cellFormula: true });
  const wsOriginal = wbOriginal.Sheets[hoja];
  const formulasOriginales = Object.keys(wsOriginal).filter((k) => !k.startsWith("!") && wsOriginal[k].f);

  const wbGenerado = XLSX.readFile(rutaOut, { cellFormula: true });
  const wsGenerado = wbGenerado.Sheets[hoja];

  let ok = true;
  for (const addr of formulasOriginales) {
    const celda = wsGenerado[addr];
    if (!celda || !celda.f) {
      console.log(`  XX se perdió la fórmula en ${addr} (era: ${wsOriginal[addr].f})`);
      ok = false;
    } else if (celda.f !== wsOriginal[addr].f) {
      console.log(`  XX la fórmula de ${addr} cambió: "${wsOriginal[addr].f}" → "${celda.f}"`);
      ok = false;
    }
  }
  console.log(`  fórmulas verificadas intactas: ${formulasOriginales.length} · ${ok ? "OK" : "FALLÓ"}`);
  if (!ok) fallos++;
}

console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} FALLA(S)`}`);
process.exit(fallos === 0 ? 0 : 1);
