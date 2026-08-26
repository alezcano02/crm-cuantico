/**
 * Genera el formato de solicitud de endoso de cada aseguradora, listo para
 * enviar por correo, a partir de los datos que ya están en el CRM.
 *
 * Va por LOTES a propósito: un envío real no es un caso suelto, es «todos los
 * de Marsella que están listos hoy» en un mismo archivo. Cada plantilla trae
 * sitio para sesenta casos, que es muchísimo más de lo que se manda de una vez.
 *
 * Parte de una copia real de cada plantilla (lib/plantillas-aseguradoras/, sin
 * datos de clientes; ver scripts/preparar-plantillas-aseguradora.ts) y solo
 * escribe en las celdas de ENTRADA. Previsora, SBS y Zurich traen fórmulas
 * propias que calculan tasa, prima, IVA y los filtros de coeficiente — esas
 * celdas NUNCA se tocan: se dejan intactas para que Excel las recalcule al
 * abrir el archivo. AXA no tiene fórmulas: es un mapeo de datos puro.
 *
 * Cuando falta un dato que el CRM no guarda (p. ej. la tasa negociada con la
 * aseguradora), la celda se deja en blanco y se reporta en `faltantes` — nunca
 * se inventa ni se adivina.
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

/** Un caso del lote: el endoso y la ficha del edificio al que pertenece. */
export interface CasoFormato {
  endoso: DatosEndosoFormato;
  copropiedad: DatosCopropiedadFormato | null;
}

const PLANTILLAS_DIR = path.join(process.cwd(), "lib", "plantillas-aseguradoras");

// ---------------------------------------------------------------------------
// Utilidades de presentación
// ---------------------------------------------------------------------------

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
  const util = (v: string | null | undefined) =>
    v?.trim() && v.trim().toLowerCase() !== "no aplica" ? v.trim() : null;
  if (util(e.torre)) partes.push(`Torre ${util(e.torre)}`);
  if (util(e.apartamento)) partes.push(`Apto ${util(e.apartamento)}`);
  if (util(e.cuartoUtil)) partes.push(`Cuarto útil ${util(e.cuartoUtil)}`);
  if (util(e.parqueadero)) partes.push(`Parqueadero ${util(e.parqueadero)}`);
  return partes.join(", ");
}

/**
 * Dirección completa del riesgo: calle + torre/apto/cuarto útil/parqueadero.
 *
 * No repite lo que la dirección ya diga. Varias planillas guardan el riesgo en
 * una sola frase —«Carrera 67 Nro 52 sur-72 Apto 504»— y al añadirle detrás el
 * apartamento otra vez saldría «… Apto 504, Apto 504», que es justo el tipo de
 * detalle raro que hace que en el banco lo miren dos veces.
 */
function direccionRiesgo(e: DatosEndosoFormato): string {
  const calle = e.direccion?.trim() ?? "";
  const yaEsta = (v: string | null | undefined) =>
    !!v?.trim() && new RegExp(`\\b${v.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(calle);

  const interior = nomenclaturaInterior({
    ...e,
    torre: yaEsta(e.torre) ? null : e.torre,
    apartamento: yaEsta(e.apartamento) ? null : e.apartamento,
    cuartoUtil: yaEsta(e.cuartoUtil) ? null : e.cuartoUtil,
    parqueadero: yaEsta(e.parqueadero) ? null : e.parqueadero,
  });
  return [calle, interior].filter(Boolean).join(", ");
}

// ---------------------------------------------------------------------------
// Qué va en cada celda
// ---------------------------------------------------------------------------

interface Celda {
  /** Columna en letras: la fila la pone el generador según el caso. */
  col: string;
  valor: string | number | null;
  /** Qué falta, si no hay valor. Se le muestra a Juan antes de enviar. */
  falta?: string;
}

interface Constructor {
  archivo: string;
  hoja: string;
  /** Primera fila (1-based) donde van los casos. */
  filaDatos: number;
  /**
   * Datos que en esta plantilla van una sola vez, arriba, porque describen la
   * copropiedad y no el caso. Solo Zurich lo usa.
   */
  cabecera?: { fila: number; celdas: (c: DatosCopropiedadFormato | null) => Celda[] };
  /** Un caso, en su fila. `n` es el número de orden dentro del lote. */
  fila: (e: DatosEndosoFormato, c: DatosCopropiedadFormato | null, n: number) => Celda[];
  /** Si el archivo describe una sola copropiedad, no admite mezclar edificios. */
  unaCopropiedadPorArchivo?: boolean;
}

const CONSTRUCTORES: Record<ClaveAseguradoraFormato, Constructor> = {
  AXA_COLPATRIA: {
    archivo: "axa-colpatria.xlsx",
    hoja: "Relacion_cert",
    filaDatos: 2,
    fila: (e, c) => [
      { col: "A", valor: c?.numeroPoliza ?? null, falta: "número de póliza de la copropiedad" },
      { col: "B", valor: c?.nombre ?? null, falta: "tomador (nombre de la copropiedad)" },
      { col: "C", valor: c?.nit ?? null, falta: "NIT de la copropiedad" },
      // La dirección del edificio no se guarda en el CRM todavía; se avisa en
      // vez de dejar la columna vacía en silencio.
      { col: "D", valor: null, falta: "dirección de la copropiedad" },
      { col: "E", valor: e.ciudad ?? null, falta: "ciudad" },
      { col: "F", valor: e.banco ?? null, falta: "banco beneficiario" },
      { col: "H", valor: propietarios(e), falta: "nombre del propietario" },
      { col: "I", valor: cedulas(e), falta: "cédula del propietario" },
      { col: "J", valor: e.valorSolicitado ?? null, falta: "valor asegurado a certificar" },
      { col: "K", valor: e.coeficiente ?? null, falta: "coeficiente" },
      { col: "L", valor: direccionRiesgo(e), falta: "dirección de riesgo" },
    ],
  },

  ZURICH: {
    archivo: "zurich.xlsx",
    hoja: "PLANTILLA ENDOSOS",
    filaDatos: 6,
    unaCopropiedadPorArchivo: true,
    cabecera: {
      fila: 2,
      celdas: (c) => [
        { col: "B", valor: c?.numeroPoliza ?? null, falta: "número de póliza de la copropiedad" },
        { col: "C", valor: c?.nombre ?? null, falta: "tomador (nombre de la copropiedad)" },
        { col: "D", valor: c?.nit ?? null, falta: "NIT de la copropiedad" },
        { col: "E", valor: null, falta: "dirección de la copropiedad" },
        { col: "F", valor: fechaCorta(new Date()) },
        // De la vigencia solo se guarda el «hasta»; el «desde» hay que ponerlo.
        { col: "G", valor: null, falta: "vigencia desde" },
        {
          col: "H",
          valor: fechaCorta(c?.vigenciaHasta),
          falta: "vigencia hasta (ficha de la copropiedad)",
        },
        {
          col: "I",
          valor: c?.valorAseguradoTotal ?? null,
          falta: "valor asegurado del edificio (ficha de la copropiedad)",
        },
        { col: "J", valor: null, falta: "tasa (la negocia Juan con la aseguradora)" },
        { col: "K", valor: null, falta: "% índice variable" },
      ],
    },
    fila: (e, _c, n) => [
      { col: "A", valor: n },
      { col: "C", valor: propietarios(e), falta: "nombre del propietario" },
      { col: "D", valor: cedulas(e), falta: "cédula del propietario" },
      { col: "E", valor: nomenclaturaInterior(e), falta: "torre/apartamento" },
      { col: "F", valor: e.banco ?? null, falta: "banco beneficiario" },
      { col: "G", valor: e.bancoNit ?? null, falta: "NIT del banco" },
      { col: "H", valor: e.coeficiente ?? null, falta: "coeficiente" },
      { col: "I", valor: e.valorSolicitado ?? null, falta: "valor comercial requerido" },
    ],
  },

  PREVISORA: {
    archivo: "previsora.xlsx",
    hoja: "FORMATO ",
    filaDatos: 2,
    fila: (e, c) => [
      { col: "A", valor: "CUANTICO SEGUROS" },
      { col: "B", valor: null, falta: "tipo de endoso (Comercial / Reconstrucción)" },
      { col: "C", valor: c?.numeroPoliza ?? null, falta: "número de póliza de la copropiedad" },
      { col: "D", valor: fechaCorta(new Date()) },
      {
        col: "E",
        valor: fechaCorta(c?.vigenciaHasta),
        falta: "fecha fin de vigencia (ficha de la copropiedad)",
      },
      { col: "F", valor: c?.nombre ?? null, falta: "nombre de la copropiedad" },
      { col: "G", valor: c?.nit ?? null, falta: "NIT de la copropiedad" },
      { col: "H", valor: e.direccion ?? null, falta: "nomenclatura" },
      { col: "I", valor: e.ciudad ?? null, falta: "municipio" },
      { col: "J", valor: e.torre ?? null },
      { col: "K", valor: e.apartamento ?? null, falta: "número de apartamento" },
      { col: "L", valor: e.cuartoUtil ?? null },
      { col: "M", valor: e.parqueadero ?? null },
      { col: "N", valor: direccionRiesgo(e), falta: "dirección completa del riesgo" },
      { col: "O", valor: propietarios(e), falta: "nombre del propietario" },
      { col: "P", valor: cedulas(e), falta: "cédula del propietario" },
      { col: "Q", valor: e.banco ?? null, falta: "banco/entidad solicitante" },
      { col: "R", valor: e.bancoNit ?? null, falta: "NIT del banco" },
      { col: "S", valor: e.coeficiente ?? null, falta: "coeficiente total" },
      {
        col: "T",
        valor: c?.valorAseguradoTotal ?? null,
        falta: "valor asegurado del edificio (ficha de la copropiedad)",
      },
      { col: "U", valor: e.valorSolicitado ?? null, falta: "valor requerido" },
      { col: "V", valor: null, falta: "tasa Across (la negocia Juan con la aseguradora)" },
    ],
  },

  SBS: {
    archivo: "sbs.xlsx",
    hoja: "Template endosos financieros",
    filaDatos: 3,
    fila: (e, c) => [
      { col: "A", valor: propietarios(e), falta: "nombre del propietario" },
      { col: "B", valor: null, falta: "tipo de documento (CC/CE/NIT)" },
      { col: "C", valor: cedulas(e), falta: "número de documento" },
      { col: "D", valor: null, falta: "tipo de propiedad (apartamento/casa/local)" },
      { col: "E", valor: nomenclaturaInterior(e), falta: "torre/apartamento" },
      { col: "F", valor: e.banco ?? null, falta: "beneficiario" },
      { col: "G", valor: e.bancoNit ?? null, falta: "NIT del beneficiario" },
      { col: "H", valor: e.valorSolicitado ?? null, falta: "valor solicitado por el banco" },
      {
        col: "I",
        valor: c?.valorAseguradoTotal ?? null,
        falta: "valor asegurado (ficha de la copropiedad)",
      },
      { col: "J", valor: e.coeficiente ?? null, falta: "coeficiente del apartamento" },
    ],
  },
};

/** Cuántos casos caben en un archivo (las plantillas se preparan con 60). */
export const CASOS_POR_ARCHIVO = 60;

export interface FormatoGenerado {
  buffer: Buffer;
  nombreArchivo: string;
  /** Datos que el CRM no tenía. Hay que llenarlos a mano antes de enviar. */
  faltantes: string[];
  casos: number;
}

function nombreLimpio(v: string): string {
  return (
    v
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "endosos"
  );
}

/**
 * Genera el archivo de solicitud para una aseguradora con todos los casos del
 * lote. Solo llena celdas de entrada; ninguna fórmula se toca.
 */
export function generarFormatoAseguradora(
  clave: ClaveAseguradoraFormato,
  casos: CasoFormato[],
  etiqueta: string
): FormatoGenerado {
  if (casos.length === 0) throw new Error("El lote no tiene ningún caso.");
  const c = CONSTRUCTORES[clave];
  if (casos.length > CASOS_POR_ARCHIVO) {
    throw new Error(
      `La plantilla de ${clave} admite ${CASOS_POR_ARCHIVO} casos por archivo y se pidieron ${casos.length}.`
    );
  }

  const ruta = path.join(PLANTILLAS_DIR, c.archivo);
  // XLSX.readFile (lectura directa de disco de SheetJS) no funciona dentro del
  // bundle de Next: se lee con fs y se pasa el buffer, como el resto del CRM.
  const wb = XLSX.read(fs.readFileSync(ruta), { cellFormula: true, cellDates: true });
  const ws = wb.Sheets[c.hoja];
  if (!ws) throw new Error(`La plantilla ${c.archivo} no tiene la hoja "${c.hoja}".`);

  const faltantes = new Set<string>();

  const escribir = (celdas: Celda[], fila: number) => {
    for (const celda of celdas) {
      const dir = `${celda.col}${fila}`;
      if (celda.valor == null || celda.valor === "") {
        if (celda.falta) faltantes.add(celda.falta);
        continue;
      }
      // Si la celda de destino tiene fórmula, no se escribe: el cálculo es de
      // la aseguradora. No debería pasar —los mapeos apuntan a entradas—, pero
      // más vale que salte aquí que en un archivo enviado con dinero de por medio.
      if (ws[dir]?.f) {
        throw new Error(`${c.archivo}: ${dir} tiene una fórmula y el mapeo intentó sobrescribirla.`);
      }
      ws[dir] = { t: typeof celda.valor === "number" ? "n" : "s", v: celda.valor };
    }
  };

  if (c.cabecera) escribir(c.cabecera.celdas(casos[0].copropiedad), c.cabecera.fila);
  casos.forEach((caso, i) => {
    escribir(c.fila(caso.endoso, caso.copropiedad, i + 1), c.filaDatos + i);
  });

  /*
   * No hace falta pedir el recálculo explícitamente (SheetJS 0.18.5 ignora
   * wb.Workbook.CalcPr al escribir). Como el archivo no lleva calcChain.xml,
   * Excel lo trata como no calculado y recalcula todas las fórmulas al abrirlo.
   */
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return {
    buffer,
    nombreArchivo: `endosos-${nombreLimpio(etiqueta)}-${c.archivo}`,
    faltantes: [...faltantes],
    casos: casos.length,
  };
}
