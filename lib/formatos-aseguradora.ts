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
import { CASOS_POR_ARCHIVO, claveFormatoPorAseguradora, type ClaveAseguradoraFormato } from "@/lib/endosos";

export { CASOS_POR_ARCHIVO, claveFormatoPorAseguradora, type ClaveAseguradoraFormato };

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
  /** La calle del edificio. Las planillas de AXA y Zurich la piden aparte. */
  direccion?: string | null;
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

/**
 * Lo que el generador sabe de la plantilla mientras la llena.
 *
 * Hace falta porque algunas plantillas traen sus propias listas y hay que
 * escribir EXACTAMENTE lo que ellas esperan, no lo que nosotros llamamos a esa
 * entidad.
 */
interface Contexto {
  /**
   * El nombre del banco tal como lo escribe la aseguradora en su lista.
   *
   * Zurich no pide el NIT del beneficiario: lo calcula con un VLOOKUP contra
   * su hoja «NIT BANCOS» a partir del nombre. Si le mandamos «BANCOLOMBIA
   * S.A.» y su lista dice «BANCOLOMBIA S.A» (sin punto), el VLOOKUP falla y la
   * planilla llega a la aseguradora con un #N/A donde va el NIT. Solo 6 de
   * nuestros 21 bancos coincidían al pie de la letra.
   *
   * Se cruza por NIT, que es lo único inequívoco, y se devuelve su grafía.
   */
  nombreBancoDeLaLista(banco: string | null | undefined, nit: string | null | undefined): string | null;
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
  /** Un caso, en su fila. `ctx` da acceso a las listas de la propia plantilla. */
  fila: (e: DatosEndosoFormato, c: DatosCopropiedadFormato | null, ctx: Contexto) => Celda[];
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
      { col: "D", valor: c?.direccion ?? null, falta: "dirección de la copropiedad (ficha del edificio)" },
      { col: "E", valor: e.ciudad ?? null, falta: "ciudad" },
      { col: "F", valor: e.banco ?? null, falta: "banco beneficiario" },
      // La columna G es el NIT del beneficiario. La plantilla de la que se
      // partía —una copia de 2024— la traía sin título y se saltaba, así que
      // el NIT del banco no viajaba en ninguna planilla de AXA.
      { col: "G", valor: e.bancoNit ?? null, falta: "NIT del banco" },
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
        { col: "E", valor: c?.direccion ?? null, falta: "dirección de la copropiedad (ficha del edificio)" },
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
    // Zurich rellena sola dos columnas y no hay que tocarlas: la A (N°) con
    // ROW()-5 y la G (NIT BENEFICIARIO) con un VLOOKUP sobre el nombre del
    // banco. Escribir encima de cualquiera de las dos borraría su fórmula.
    fila: (e, _c, ctx) => [
      { col: "C", valor: propietarios(e), falta: "nombre del propietario" },
      { col: "D", valor: cedulas(e), falta: "cédula del propietario" },
      { col: "E", valor: nomenclaturaInterior(e), falta: "torre/apartamento" },
      {
        col: "F",
        valor: ctx.nombreBancoDeLaLista(e.banco, e.bancoNit),
        falta: e.banco
          ? `«${e.banco}» no está en la lista de bancos de Zurich: el NIT saldrá como #N/A y hay que escribirlo a mano`
          : "banco beneficiario",
      },
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


/**
 * Lee las listas que la propia plantilla trae, para poder escribir lo que ella
 * espera y no lo que nosotros llamamos a cada entidad.
 *
 * Hoy solo importa la de Zurich («NIT BANCOS»): su columna del NIT es un
 * VLOOKUP sobre el nombre del banco, así que un nombre que no esté en su lista
 * al pie de la letra deja un #N/A en la planilla que recibe la aseguradora.
 * El cruce se hace por NIT, que es lo único inequívoco —los nombres varían en
 * puntos, tildes y sufijos— y admite el NIT con y sin dígito de verificación.
 */
function contextoDe(wb: XLSX.WorkBook): Contexto {
  const porNit = new Map<string, string>();
  const hoja = wb.Sheets["NIT BANCOS"];
  if (hoja) {
    const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, defval: "", raw: true });
    for (const f of filas.slice(1)) {
      const nombre = String(f[1] ?? "").trim();
      const nit = String(f[2] ?? "").replace(/\D/g, "");
      if (!nombre || !nit || nit === "0") continue;
      porNit.set(nit, nombre);
      // Sin el dígito de verificación, para poder cruzar «860034594-1» con
      // «860034594» y al revés.
      if (nit.length > 9) porNit.set(nit.slice(0, -1), nombre);
    }
  }

  return {
    nombreBancoDeLaLista(banco, nit) {
      if (!banco?.trim()) return null;
      const digitos = (nit ?? "").replace(/\D/g, "");
      if (!porNit.size) return banco; // plantilla sin lista: se manda tal cual
      const encontrado =
        porNit.get(digitos) ??
        (digitos.length > 9 ? porNit.get(digitos.slice(0, -1)) : undefined) ??
        porNit.get(digitos + "0") ??
        undefined;
      // Si no está en su lista se devuelve null para que el generador lo
      // cuente como faltante y avise, en vez de mandar algo que dará #N/A.
      return encontrado ?? null;
    },
  };
}

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

  const ctx = contextoDe(wb);
  if (c.cabecera) escribir(c.cabecera.celdas(casos[0].copropiedad), c.cabecera.fila);
  casos.forEach((caso, i) => {
    escribir(c.fila(caso.endoso, caso.copropiedad, ctx), c.filaDatos + i);
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
