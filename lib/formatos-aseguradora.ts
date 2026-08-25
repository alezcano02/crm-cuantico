/**
 * Genera el formato de solicitud de endoso de cada aseguradora, listo para
 * enviar por correo, a partir de los datos que ya están en el CRM.
 *
 * Parte de la plantilla REAL de cada aseguradora (una copia sin datos de
 * cliente en lib/plantillas-aseguradoras/), y solo escribe en las celdas de
 * ENTRADA. Previsora, SBS y Zurich traen fórmulas propias que calculan tasa,
 * prima, IVA y los filtros de coeficiente — esas celdas NUNCA se tocan ni se
 * recalculan aquí; se dejan intactas para que Excel las recalcule solo al
 * abrir el archivo (fullCalcOnLoad). AXA no tiene fórmulas: es un mapeo de
 * datos puro.
 *
 * Cuando falta un dato que el CRM no guarda (p. ej. la dirección de la
 * copropiedad, o la tasa negociada con la aseguradora), la celda se deja en
 * blanco y se reporta en `faltantes` — nunca se inventa ni se adivina.
 */
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { claveFormatoPorAseguradora, type ClaveAseguradoraFormato } from "@/lib/endosos";

export { claveFormatoPorAseguradora, type ClaveAseguradoraFormato };

export interface DatosEndosoFormato {
  cliente?: string | null;
  cliente2?: string | null;
  cedula?: string | null;
  cedula2?: string | null;
  direccion?: string | null;
  ciudad?: string | null;
  torre?: string | null;
  apartamento?: string | null;
  cuartoUtil?: string | null;
  parqueadero?: string | null;
  coeficiente?: number | null;
  valorSolicitado?: number | null;
  banco?: string | null;
  bancoNit?: string | null;
}

export interface DatosCopropiedadFormato {
  nombre?: string | null;
  nit?: string | null;
  numeroPoliza?: string | null;
  vigenciaHasta?: Date | string | null;
  valorAseguradoTotal?: number | null;
}

const PLANTILLAS_DIR = path.join(process.cwd(), "lib", "plantillas-aseguradoras");

function fechaCorta(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  const d = typeof v === "string" ? new Date(v) : v;
  if (isNaN(d.getTime())) return null;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function propietarios(e: DatosEndosoFormato): string {
  return [e.cliente, e.cliente2].filter((v) => v?.trim()).join(" y ");
}

function cedulas(e: DatosEndosoFormato): string {
  return [e.cedula, e.cedula2].filter((v) => v?.trim()).join(" y ");
}

/** Torre/apto/cuarto útil/parqueadero, sin la nomenclatura de la calle. */
function nomenclaturaInterior(e: DatosEndosoFormato): string {
  const partes: string[] = [];
  if (e.torre?.trim()) partes.push(`Torre ${e.torre.trim()}`);
  if (e.apartamento?.trim()) partes.push(`Apto ${e.apartamento.trim()}`);
  if (e.cuartoUtil?.trim()) partes.push(`Cuarto útil ${e.cuartoUtil.trim()}`);
  if (e.parqueadero?.trim()) partes.push(`Parqueadero ${e.parqueadero.trim()}`);
  return partes.join(", ");
}

/** Dirección completa del riesgo: calle + torre/apto/cuarto útil/parqueadero. */
function direccionRiesgo(e: DatosEndosoFormato): string {
  const interior = nomenclaturaInterior(e);
  return [e.direccion?.trim(), interior].filter(Boolean).join(", ");
}

interface Celda {
  addr: string;
  valor: string | number | null;
  /** Si no hay valor, qué le falta a este campo — para mostrarlo a Juan. */
  etiquetaFaltante?: string;
}

interface Resultado {
  celdas: Record<string, string | number>;
  faltantes: string[];
}

function empaquetar(celdas: Celda[]): Resultado {
  const out: Record<string, string | number> = {};
  const faltantes: string[] = [];
  for (const c of celdas) {
    if (c.valor != null && c.valor !== "") out[c.addr] = c.valor;
    else if (c.etiquetaFaltante) faltantes.push(c.etiquetaFaltante);
  }
  return { celdas: out, faltantes };
}

function construirAxa(e: DatosEndosoFormato, cop: DatosCopropiedadFormato | null): Resultado {
  return empaquetar([
    { addr: "A2", valor: cop?.numeroPoliza ?? null, etiquetaFaltante: "número de póliza (ficha de la copropiedad)" },
    { addr: "B2", valor: cop?.nombre ?? null, etiquetaFaltante: "tomador (nombre de la copropiedad)" },
    { addr: "C2", valor: cop?.nit ?? null, etiquetaFaltante: "NIT de la copropiedad" },
    { addr: "D2", valor: null, etiquetaFaltante: "dirección de la copropiedad (no se guarda en el CRM todavía)" },
    { addr: "E2", valor: e.ciudad ?? null, etiquetaFaltante: "ciudad" },
    { addr: "F2", valor: e.banco ?? null, etiquetaFaltante: "banco beneficiario" },
    { addr: "H2", valor: propietarios(e), etiquetaFaltante: "nombre del propietario" },
    { addr: "I2", valor: cedulas(e), etiquetaFaltante: "cédula del propietario" },
    { addr: "J2", valor: e.valorSolicitado ?? null, etiquetaFaltante: "valor asegurado a certificar" },
    { addr: "K2", valor: e.coeficiente ?? null, etiquetaFaltante: "coeficiente" },
    { addr: "L2", valor: direccionRiesgo(e), etiquetaFaltante: "dirección de riesgo" },
  ]);
}

function construirZurich(e: DatosEndosoFormato, cop: DatosCopropiedadFormato | null): Resultado {
  return empaquetar([
    { addr: "B2", valor: cop?.numeroPoliza ?? null, etiquetaFaltante: "número de póliza (ficha de la copropiedad)" },
    { addr: "C2", valor: cop?.nombre ?? null, etiquetaFaltante: "tomador (nombre de la copropiedad)" },
    { addr: "D2", valor: cop?.nit ?? null, etiquetaFaltante: "NIT de la copropiedad" },
    { addr: "E2", valor: null, etiquetaFaltante: "dirección de la copropiedad (no se guarda en el CRM todavía)" },
    { addr: "F2", valor: fechaCorta(new Date()) },
    { addr: "G2", valor: null, etiquetaFaltante: "vigencia desde (solo se guarda el 'hasta' en la ficha de la copropiedad)" },
    { addr: "H2", valor: fechaCorta(cop?.vigenciaHasta), etiquetaFaltante: "vigencia hasta (ficha de la copropiedad)" },
    { addr: "I2", valor: cop?.valorAseguradoTotal ?? null, etiquetaFaltante: "valor asegurado del edificio (ficha de la copropiedad)" },
    { addr: "J2", valor: null, etiquetaFaltante: "tasa (la negocia Juan con la aseguradora; llenar a mano)" },
    { addr: "K2", valor: null, etiquetaFaltante: "% índice variable (llenar a mano)" },
    { addr: "A6", valor: 1 },
    { addr: "C6", valor: propietarios(e), etiquetaFaltante: "nombre del propietario" },
    { addr: "D6", valor: cedulas(e), etiquetaFaltante: "cédula del propietario" },
    { addr: "E6", valor: nomenclaturaInterior(e), etiquetaFaltante: "torre/apartamento/cuarto útil/parqueadero" },
    { addr: "F6", valor: e.banco ?? null, etiquetaFaltante: "banco beneficiario" },
    { addr: "G6", valor: e.bancoNit ?? null, etiquetaFaltante: "NIT del banco" },
    { addr: "H6", valor: e.coeficiente ?? null, etiquetaFaltante: "coeficiente" },
    { addr: "I6", valor: e.valorSolicitado ?? null, etiquetaFaltante: "valor comercial requerido" },
  ]);
}

function construirPrevisora(e: DatosEndosoFormato, cop: DatosCopropiedadFormato | null): Resultado {
  return empaquetar([
    { addr: "A2", valor: "Cuántico Seguros" },
    { addr: "B2", valor: null, etiquetaFaltante: "tipo de endoso (Comercial / Reconstrucción)" },
    { addr: "C2", valor: cop?.numeroPoliza ?? null, etiquetaFaltante: "número de póliza (ficha de la copropiedad)" },
    { addr: "D2", valor: fechaCorta(new Date()) },
    { addr: "E2", valor: fechaCorta(cop?.vigenciaHasta), etiquetaFaltante: "fecha fin de vigencia (ficha de la copropiedad)" },
    { addr: "F2", valor: cop?.nombre ?? null, etiquetaFaltante: "nombre de la copropiedad" },
    { addr: "G2", valor: cop?.nit ?? null, etiquetaFaltante: "NIT de la copropiedad" },
    { addr: "H2", valor: e.direccion ?? null, etiquetaFaltante: "nomenclatura" },
    { addr: "I2", valor: e.ciudad ?? null, etiquetaFaltante: "municipio" },
    { addr: "J2", valor: e.torre ?? null },
    { addr: "K2", valor: e.apartamento ?? null, etiquetaFaltante: "número de apartamento" },
    { addr: "L2", valor: e.cuartoUtil ?? null },
    { addr: "M2", valor: e.parqueadero ?? null },
    { addr: "N2", valor: direccionRiesgo(e), etiquetaFaltante: "dirección completa del riesgo" },
    { addr: "O2", valor: propietarios(e), etiquetaFaltante: "nombre del propietario" },
    { addr: "P2", valor: cedulas(e), etiquetaFaltante: "cédula del propietario" },
    { addr: "Q2", valor: e.banco ?? null, etiquetaFaltante: "banco/entidad solicitante" },
    { addr: "R2", valor: e.bancoNit ?? null, etiquetaFaltante: "NIT del banco" },
    { addr: "S2", valor: e.coeficiente ?? null, etiquetaFaltante: "coeficiente total" },
    { addr: "T2", valor: cop?.valorAseguradoTotal ?? null, etiquetaFaltante: "valor asegurado del edificio (ficha de la copropiedad)" },
    { addr: "U2", valor: e.valorSolicitado ?? null, etiquetaFaltante: "valor requerido" },
    { addr: "V2", valor: null, etiquetaFaltante: "tasa Across (la negocia Juan con la aseguradora; llenar a mano)" },
  ]);
}

function construirSbs(e: DatosEndosoFormato, cop: DatosCopropiedadFormato | null): Resultado {
  return empaquetar([
    { addr: "A3", valor: propietarios(e), etiquetaFaltante: "nombre del propietario" },
    { addr: "B3", valor: null, etiquetaFaltante: "tipo de documento (CC/CE/NIT)" },
    { addr: "C3", valor: cedulas(e), etiquetaFaltante: "número de documento" },
    { addr: "D3", valor: null, etiquetaFaltante: "tipo de propiedad (apartamento/casa/local)" },
    { addr: "E3", valor: nomenclaturaInterior(e), etiquetaFaltante: "torre/apartamento/cuarto útil/parqueadero" },
    { addr: "F3", valor: e.banco ?? null, etiquetaFaltante: "beneficiario" },
    { addr: "G3", valor: e.bancoNit ?? null, etiquetaFaltante: "NIT del beneficiario" },
    { addr: "H3", valor: e.valorSolicitado ?? null, etiquetaFaltante: "valor solicitado por el banco" },
    { addr: "I3", valor: cop?.valorAseguradoTotal ?? null, etiquetaFaltante: "valor asegurado (ficha de la copropiedad)" },
    { addr: "J3", valor: e.coeficiente ?? null, etiquetaFaltante: "coeficiente del apartamento" },
  ]);
}

const PLANTILLAS: Record<ClaveAseguradoraFormato, { archivo: string; hoja: string; construir: typeof construirAxa }> = {
  AXA_COLPATRIA: { archivo: "axa-colpatria.xlsx", hoja: "Relacion_cert", construir: construirAxa },
  ZURICH: { archivo: "zurich.xlsx", hoja: "PLANTILLA ENDOSOS", construir: construirZurich },
  PREVISORA: { archivo: "previsora.xlsx", hoja: "FORMATO ", construir: construirPrevisora },
  SBS: { archivo: "sbs.xlsx", hoja: "Template endosos financieros", construir: construirSbs },
};

export interface FormatoGenerado {
  buffer: Buffer;
  nombreArchivo: string;
  /** Datos que el CRM no tenía y quedaron en blanco: hay que llenarlos a mano antes de enviar. */
  faltantes: string[];
}

/**
 * Genera el archivo de solicitud de endoso para una aseguradora, a partir de
 * su plantilla real. Solo llena celdas de entrada; ninguna fórmula se toca.
 */
export function generarFormatoAseguradora(
  clave: ClaveAseguradoraFormato,
  endoso: DatosEndosoFormato,
  copropiedad: DatosCopropiedadFormato | null,
  nombreCaso: string
): FormatoGenerado {
  const plantilla = PLANTILLAS[clave];
  const ruta = path.join(PLANTILLAS_DIR, plantilla.archivo);
  // XLSX.readFile (lectura directa de disco de SheetJS) no funciona dentro
  // del bundle de Next: se lee el archivo con fs y se le pasa el buffer, como
  // ya hace el resto del CRM (lib/excel.ts, lib/siniestros.ts) con Excel que
  // llega por upload en vez de por disco.
  const plantillaBuf = fs.readFileSync(ruta);
  const wb = XLSX.read(plantillaBuf, { cellFormula: true, cellDates: true });
  const ws = wb.Sheets[plantilla.hoja];
  if (!ws) throw new Error(`La plantilla ${plantilla.archivo} no tiene la hoja "${plantilla.hoja}".`);

  const { celdas, faltantes } = plantilla.construir(endoso, copropiedad);
  for (const [addr, valor] of Object.entries(celdas)) {
    ws[addr] = { t: typeof valor === "number" ? "n" : "s", v: valor };
  }

  /*
   * No hace falta pedir explícitamente el recálculo (SheetJS 0.18.5 tampoco
   * lo permite: ignora wb.Workbook.CalcPr al escribir). Como el archivo no
   * trae calcChain.xml —SheetJS nunca lo genera—, Excel lo trata como no
   * calculado por una sesión propia y recalcula todas las fórmulas al
   * abrirlo, así que las celdas de fórmula reemplazan solo por eso el 0/""
   * de relleno que dejaron las plantillas por el cálculo real.
   */
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const slug = nombreCaso.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return { buffer, nombreArchivo: `endoso-${slug}-${plantilla.archivo}`, faltantes };
}
