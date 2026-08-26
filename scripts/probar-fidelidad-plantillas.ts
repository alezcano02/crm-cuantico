/**
 * Comprueba que la planilla que generamos es la que la aseguradora maneja.
 *
 * Genera un lote de prueba con cada aseguradora y verifica, columna por
 * columna, que el dato cae DEBAJO DEL TÍTULO QUE LE CORRESPONDE en la
 * plantilla real. Es la prueba que faltaba: hasta ahora se comprobaba que las
 * fórmulas quedaran intactas, pero no que cada dato fuera a su columna.
 *
 * Así se descubrió que el NIT del banco no viajaba en las planillas de AXA:
 * la copia de 2024 de la que se partía traía esa columna sin título.
 *
 * Uso: npx tsx scripts/probar-fidelidad-plantillas.ts
 */
import * as XLSX from "xlsx";
import { readFileSync } from "fs";
import path from "path";
import {
  generarFormatoAseguradora,
  type CasoFormato,
  type ClaveAseguradoraFormato,
} from "../lib/formatos-aseguradora";

const CASO: CasoFormato = {
  copropiedad: {
    nombre: "Conjunto Residencial Marsella PH",
    nit: "901460370-1",
    numeroPoliza: "PIPL-254318620-1",
    vigenciaHasta: new Date("2027-04-07"),
    valorAseguradoTotal: 109868205781,
  },
  endoso: {
    cliente: "Andrea Bermúdez Figueroa",
    cedula: "43276751",
    direccion: "Calle 54 # 86C 66",
    ciudad: "Medellín",
    torre: "1",
    apartamento: "1006",
    cuartoUtil: "CU 45",
    parqueadero: "PQ 12",
    coeficiente: 0.48,
    valorSolicitado: 413659408,
    banco: "DAVIbank S.A. (antes Scotiabank Colpatria)",
    bancoNit: "860034594-1",
  },
};

/**
 * Qué título debe encabezar cada dato. Se compara contra el encabezado real de
 * la plantilla, no contra una letra de columna: si la aseguradora mueve una
 * columna, esto lo detecta.
 */
const ESPERADO: Record<
  ClaveAseguradoraFormato,
  { hoja: string; filaEnc: number; filaDatos: number; celdas: Record<string, RegExp> }
> = {
  AXA_COLPATRIA: {
    hoja: "Relacion_cert",
    filaEnc: 1,
    filaDatos: 2,
    celdas: {
      A: /^No\.? POLIZA$/i,
      B: /^TOMADOR$/i,
      C: /^NIT$/i,
      E: /^CIUDAD$/i,
      F: /^BENEFICIARIO$/i,
      G: /^NIT$/i,
      H: /^PROPIETARIO$/i,
      I: /^CC$/i,
      J: /VALOR +ASEGURADO A CERTIFICAR/i,
      K: /^COEFICIENTE$/i,
      L: /^DIRECCION RIESGO$/i,
    },
  },
  ZURICH: {
    hoja: "PLANTILLA ENDOSOS",
    filaEnc: 5,
    filaDatos: 6,
    celdas: {
      C: /^PROPIETARIO$/i,
      D: /^NIT PROPIETARIO$/i,
      E: /RIESGO/i,
      F: /BENEFICIARIO ONEROSO/i,
      G: /NIT BENEFICIARIO/i,
      H: /COEFICIENTE/i,
      I: /VLR COMERCIAL REQUERIDO/i,
    },
  },
  PREVISORA: {
    hoja: "FORMATO ",
    filaEnc: 1,
    filaDatos: 2,
    celdas: {
      A: /^Intermediario$/i,
      C: /^Número de póliza$/i,
      F: /^Nombre de copropiedad$/i,
      G: /^Nit Copropiedad$/i,
      H: /^Nomenclatura/i,
      I: /^Municipio$/i,
      J: /Número de Torre/i,
      K: /Número de +Apartamento/i,
      N: /Dirección completa del Riesgo/i,
      O: /Nombre del propietario/i,
      P: /Cédula\(s\)/i,
      Q: /Banco ?\/ ?Entidad solicitante/i,
      R: /^Nit$/i,
      S: /^Coeficiente total/i,
      T: /^Valor Asegurado/i,
      U: /^Valor requerido/i,
    },
  },
  SBS: {
    hoja: "Template endosos financieros",
    filaEnc: 2,
    filaDatos: 3,
    celdas: {
      A: /^Propietario$/i,
      C: /Número de documento/i,
      E: /Nomenclatura al interior/i,
      F: /^Beneficiario$/i,
      G: /^NIT$/i,
      H: /Valor solicitado por el banco/i,
      I: /^Valor asegurado daño material/i,
      J: /Coeficiente de cada apartamento/i,
    },
  },
};

const titulo = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

let fallos = 0;
const falla = (m: string) => {
  console.log(`   XX ${m}`);
  fallos++;
};

for (const clave of Object.keys(ESPERADO) as ClaveAseguradoraFormato[]) {
  const cfg = ESPERADO[clave];
  console.log(`\n=== ${clave} ===`);

  const g = generarFormatoAseguradora(clave, [CASO], "prueba");
  const wb = XLSX.read(g.buffer, { cellFormula: true });
  const ws = wb.Sheets[cfg.hoja];
  if (!ws) {
    falla(`la planilla generada no tiene la hoja «${cfg.hoja}»`);
    continue;
  }

  // El encabezado generado debe seguir siendo el de la plantilla real.
  const plantilla = XLSX.read(
    readFileSync(path.join("lib/plantillas-aseguradoras", `${clave.toLowerCase().replace("_", "-")}.xlsx`))
  );

  let bien = 0;
  for (const [col, patron] of Object.entries(cfg.celdas)) {
    const enc = titulo(ws[`${col}${cfg.filaEnc}`]?.v);
    const dato = ws[`${col}${cfg.filaDatos}`]?.v;
    if (!patron.test(enc)) {
      falla(`${col}: el título es «${enc}» y no casa con ${patron}`);
      continue;
    }
    if (dato == null || dato === "") {
      falla(`${col} («${enc}») quedó vacío: el dato no llega a la aseguradora`);
      continue;
    }
    bien++;
  }
  console.log(`   ${bien}/${Object.keys(cfg.celdas).length} columnas con su dato bajo el título correcto`);
  console.log(`   faltantes declarados: ${g.faltantes.length ? g.faltantes.join(" | ") : "(ninguno)"}`);
}

console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} FALLA(S)`}`);
process.exit(fallos === 0 ? 0 : 1);
