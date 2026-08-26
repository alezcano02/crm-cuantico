/**
 * Prueba del generador de planillas por aseguradora
 * (lib/formatos-aseguradora.ts). Genera un archivo por cada una con un LOTE de
 * casos sintéticos y confirma que:
 *
 *  1. Cada caso quedó en su propia fila, con los datos en las celdas correctas.
 *  2. NINGUNA celda con fórmula (tasa, prima, IVA, filtros de coeficiente) se
 *     perdió ni se alteró — se compara contra la plantilla real.
 *  3. Las fórmulas de la última fila del lote existen, que es lo que permite
 *     mandar varios casos en un mismo archivo.
 *
 * No toca la base de datos. Uso: npx tsx scripts/probar-formatos-aseguradora.ts
 */
import * as XLSX from "xlsx";
import { writeFileSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import {
  generarFormatoAseguradora,
  type CasoFormato,
  type ClaveAseguradoraFormato,
  type DatosCopropiedadFormato,
} from "../lib/formatos-aseguradora";

const OUT = mkdtempSync(path.join(tmpdir(), "formatos-aseguradora-"));

const COPROPIEDAD: DatosCopropiedadFormato = {
  nombre: "Marsella",
  nit: "900123456-1",
  numeroPoliza: "3001234567",
  vigenciaHasta: new Date("2027-03-15"),
  valorAseguradoTotal: 45000000000,
};

/** Tres casos del mismo edificio, que es como se manda de verdad. */
const CASOS: CasoFormato[] = [
  {
    copropiedad: COPROPIEDAD,
    endoso: {
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
    },
  },
  {
    copropiedad: COPROPIEDAD,
    endoso: {
      cliente: "Andrea Bermúdez Figueroa",
      cedula: "43276751",
      direccion: "CL 54 Nº86C - 66",
      ciudad: "Medellín",
      torre: "1",
      apartamento: "1006",
      cuartoUtil: "No aplica",
      parqueadero: "No aplica",
      coeficiente: 0.48,
      valorSolicitado: 413659408,
      banco: "BANCOLOMBIA S.A.",
      bancoNit: "890903938-8",
    },
  },
  {
    copropiedad: COPROPIEDAD,
    endoso: {
      cliente: "Guillermo Rodríguez Agudelo",
      cliente2: "María Paula Ruiz",
      cedula: "1040321626",
      cedula2: "43555111",
      direccion: "CL 54 Nº86C - 66",
      ciudad: "Medellín",
      torre: "2",
      apartamento: "1604",
      coeficiente: 0.39,
      valorSolicitado: 320000000,
      banco: "BBVA COLOMBIA S.A.",
      bancoNit: "860003020-1",
    },
  },
];

const PLANTILLAS: Record<
  ClaveAseguradoraFormato,
  { archivo: string; hoja: string; filaDatos: number; colNombre: string }
> = {
  AXA_COLPATRIA: {
    archivo: "axa-colpatria.xlsx",
    hoja: "Relacion_cert",
    filaDatos: 2,
    colNombre: "H",
  },
  ZURICH: {
    archivo: "zurich.xlsx",
    hoja: "PLANTILLA ENDOSOS",
    filaDatos: 6,
    colNombre: "C",
  },
  PREVISORA: { archivo: "previsora.xlsx", hoja: "FORMATO ", filaDatos: 2, colNombre: "O" },
  SBS: {
    archivo: "sbs.xlsx",
    hoja: "Template endosos financieros",
    filaDatos: 3,
    colNombre: "A",
  },
};

let fallos = 0;
const falla = (m: string) => {
  console.log(`  XX ${m}`);
  fallos++;
};

for (const clave of Object.keys(PLANTILLAS) as ClaveAseguradoraFormato[]) {
  console.log(`\n=== ${clave} ===`);
  const { archivo, hoja, filaDatos, colNombre } = PLANTILLAS[clave];
  const generado = generarFormatoAseguradora(clave, CASOS, "Marsella");
  const rutaOut = path.join(OUT, generado.nombreArchivo);
  writeFileSync(rutaOut, generado.buffer);
  console.log(`  ${generado.casos} casos · ${generado.nombreArchivo}`);
  console.log(
    `  faltantes: ${generado.faltantes.length ? generado.faltantes.join(" | ") : "(ninguno)"}`
  );

  const original = XLSX.read(
    require("fs").readFileSync(path.join("lib/plantillas-aseguradoras", archivo)),
    { cellFormula: true }
  );
  const wsOriginal = original.Sheets[hoja];
  const formulasOriginales = Object.keys(wsOriginal).filter(
    (k) => !k.startsWith("!") && wsOriginal[k].f
  );

  const wbGenerado = XLSX.read(require("fs").readFileSync(rutaOut), { cellFormula: true });
  const wsGenerado = wbGenerado.Sheets[hoja];

  // 1) Cada caso en su fila.
  CASOS.forEach((caso, i) => {
    const dir = `${colNombre}${filaDatos + i}`;
    const celda = wsGenerado[dir];
    const esperado = caso.endoso.cliente!.split(" ")[0];
    if (!celda || !String(celda.v).includes(esperado)) {
      falla(`el caso ${i + 1} no quedó en ${dir} (se leyó ${JSON.stringify(celda?.v ?? null)})`);
    }
  });

  // 2) Ninguna fórmula perdida ni cambiada.
  let intactas = 0;
  for (const dir of formulasOriginales) {
    const celda = wsGenerado[dir];
    if (!celda?.f) falla(`se perdió la fórmula de ${dir} (era ${wsOriginal[dir].f})`);
    else if (celda.f !== wsOriginal[dir].f)
      falla(`la fórmula de ${dir} cambió: "${wsOriginal[dir].f}" → "${celda.f}"`);
    else intactas++;
  }
  console.log(`  fórmulas intactas: ${intactas}/${formulasOriginales.length}`);

  // 3) La última fila del lote conserva sus fórmulas: es lo que hace posible
  //    mandar varios casos en un archivo en vez de uno por archivo.
  if (clave !== "AXA_COLPATRIA") {
    const ultima = filaDatos + CASOS.length - 1;
    const conFormula = Object.keys(wsGenerado).filter(
      (k) => wsGenerado[k].f && k.replace(/[A-Z]+/g, "") === String(ultima)
    );
    if (conFormula.length === 0) falla(`la fila ${ultima} del lote se quedó sin fórmulas`);
    else console.log(`  fila ${ultima} (último caso): ${conFormula.length} fórmulas`);
  }
}

console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} FALLA(S)`}`);
process.exit(fallos === 0 ? 0 : 1);
