import * as XLSX from "xlsx";

/**
 * Lectura de los archivos de siniestros de la agencia.
 *
 * Había dos archivos y ninguno servía para ver el panorama:
 *  · "SEGUIMIENTO SINIESTROS.xlsx" tiene UNA HOJA POR CLIENTE (46 hojas con
 *    1–4 casos cada una), con el detalle: fechas, radicado, observaciones.
 *  · "SINIESTROS.xlsx" es un resumen de una sola hoja con el responsable y
 *    las cifras (pretensión, deducible, a indemnizar).
 *
 * Aquí se leen los dos y se cruzan por cliente + cobertura, de modo que quede
 * una sola lista. El estado se normaliza porque en el original es texto libre
 * con decenas de variantes y erratas.
 */

type Celda = string | number | boolean | Date | null;
type Fila = Celda[];

export interface SiniestroInput {
  asegurado: string;
  nit: string | null;
  firmaAdministracion: string | null;
  administrador: string | null;
  celular: string | null;
  email: string | null;
  aseguradora: string | null;
  poliza: string | null;
  vigenciaPoliza: Date | null;
  cobertura: string | null;
  resumen: string | null;
  fechaOcurrencia: Date | null;
  fechaAvisoAsesor: Date | null;
  fechaAvisoCompania: Date | null;
  radicado: string | null;
  estadoTexto: string | null;
  estado: EstadoSiniestro;
  observaciones: string | null;
  valorSiniestro: number | null;
  valorLiquidar: number | null;
  valorPagado: number | null;
  deducible: number | null;
  fechaPago: Date | null;
  otrosDatos: string | null;
  empleadoCompania: string | null;
  telefonoCompania: string | null;
  correoCompania: string | null;
  responsable: string | null;
  fechaUltimoSeguimiento: Date | null;
  origen: string | null;
}

export interface ResumenSiniestros {
  archivo: string;
  hojas: number;
  leidos: number;
  importables: number;
  fusionados: number;
  omitidos: number;
  avisos: string[];
}

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------

export type EstadoSiniestro =
  | "PENDIENTE_CLIENTE"
  | "PENDIENTE_COMPANIA"
  | "PENDIENTE_CUANTICO"
  | "EN_PAGO"
  | "PAGADO"
  | "OBJETADO"
  | "CERRADO"
  | "SIN_ESTADO";

export const ETIQUETA_ESTADO: Record<EstadoSiniestro, string> = {
  PENDIENTE_CLIENTE: "Pendiente del cliente",
  PENDIENTE_COMPANIA: "Pendiente de la aseguradora",
  PENDIENTE_CUANTICO: "Pendiente de Cuántico",
  EN_PAGO: "En trámite de pago",
  PAGADO: "Pagado",
  OBJETADO: "Objetado",
  CERRADO: "Cerrado",
  SIN_ESTADO: "Sin estado",
};

/** Estados que siguen requiriendo gestión. */
export const ESTADOS_ABIERTOS: EstadoSiniestro[] = [
  "PENDIENTE_CLIENTE",
  "PENDIENTE_COMPANIA",
  "PENDIENTE_CUANTICO",
  "EN_PAGO",
  "SIN_ESTADO",
];

/**
 * Traduce el texto libre del Excel a una categoría.
 *
 * El orden importa: primero lo que cierra el caso (pagado, objetado) y luego
 * de quién se está esperando. Así "EN LA COMPAÑÍA PARA PAGO" cae en pago y no
 * en pendiente de la aseguradora.
 */
export function normalizarEstado(texto: string | null): EstadoSiniestro {
  if (!texto) return "SIN_ESTADO";
  const t = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();

  // Erratas incluidas a propósito: así vienen en el archivo original.
  if (/\bPAGAD[OA]\b|\bOK PAGO\b|\bPAGOSO\b|\bPAGODO\b|\bLIQUIDADO\b/.test(t)) return "PAGADO";
  if (/OBJETAD/.test(t)) return "OBJETADO";
  if (/FINALIZADO|CERRADO/.test(t)) return "CERRADO";
  if (/EN PAGO|PARA PAGO|AVISO DE PAGO|EN LIQUIDACION/.test(t)) return "EN_PAGO";
  if (/CUANTICO/.test(t)) return "PENDIENTE_CUANTICO";
  if (/COPROPIEDAD|COPROPEIDAD|CLIENTE|ADMON|ADMINISTRACION/.test(t))
    return "PENDIENTE_CLIENTE";
  if (/COMPANIA|COMPAÑIA|COMPAÑAIA|ASEGURADORA|PREVISORA|AXA|SBS|ZURICH|HDI|ESTADO|SOLIDARIA/.test(t))
    return "PENDIENTE_COMPANIA";
  if (/DOCUMENTO/.test(t)) return "PENDIENTE_CLIENTE";
  return "SIN_ESTADO";
}

// ---------------------------------------------------------------------------
// Utilidades de lectura
// ---------------------------------------------------------------------------

function texto(c: Celda): string | null {
  if (c == null) return null;
  const s = String(c).replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

function numero(c: Celda): number | null {
  if (c == null || c === "") return null;
  if (typeof c === "number") return isFinite(c) ? c : null;
  const n = Number(String(c).replace(/[$.\s]/g, "").replace(",", "."));
  return isFinite(n) && n !== 0 ? n : null;
}

/** Descarta fechas imposibles para un siniestro (basura o mal interpretadas). */
function plausible(d: Date | null): Date | null {
  if (!d || isNaN(d.getTime())) return null;
  const a = d.getUTCFullYear();
  return a >= 1990 && a <= 2100 ? d : null;
}

function fecha(c: Celda): Date | null {
  if (c == null || c === "") return null;
  if (c instanceof Date) {
    if (isNaN(c.getTime())) return null;
    return plausible(new Date(Date.UTC(c.getFullYear(), c.getMonth(), c.getDate())));
  }
  if (typeof c === "number") {
    // En varias hojas escribieron SOLO EL AÑO ("2024") en una columna de fecha.
    // Como número de serie de Excel, 2024 sería julio de 1905 y el caso
    // aparecería con 44.000 días sin movimiento. Se toma como 1 de enero de
    // ese año, que es lo que quisieron decir.
    if (c >= 1990 && c <= 2100 && Number.isInteger(c)) {
      return new Date(Date.UTC(c, 0, 1));
    }
    const p = XLSX.SSF.parse_date_code(c);
    if (!p) return null;
    return plausible(new Date(Date.UTC(p.y, p.m - 1, p.d)));
  }
  const s = String(c).trim();
  // Solo el año, escrito como texto
  if (/^(19|20)\d{2}$/.test(s)) return new Date(Date.UTC(Number(s), 0, 1));
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (m) {
    const anio = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return plausible(new Date(Date.UTC(anio, Number(m[2]) - 1, Number(m[1]))));
  }
  return null;
}

function clave(s: string | null): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Índice de columnas por nombre de encabezado, con alias. */
function mapear(encabezado: Fila, defs: Record<string, string[]>): Record<string, number> {
  const porClave = new Map<string, number>();
  encabezado.forEach((c, i) => {
    const k = clave(texto(c));
    if (k && !porClave.has(k)) porClave.set(k, i);
  });
  const salida: Record<string, number> = {};
  for (const [campo, alias] of Object.entries(defs)) {
    for (const a of alias) {
      const i = porClave.get(clave(a));
      if (i !== undefined) {
        salida[campo] = i;
        break;
      }
    }
  }
  return salida;
}

// Alias de cada columna: los nombres cambian de una hoja a otra.
const COLUMNAS_DETALLE: Record<string, string[]> = {
  asegurado: ["ASEGURADO"],
  nit: ["NIT"],
  firmaAdministracion: ["FIRMA DE ADMINISTRACION", "ADMINISTRACION O NOMBRE EMPRESA"],
  administrador: ["ADMINISTRADOR", "ADMINISTRACION DELEGADA ENCARGADA"],
  celular: ["CELULAR"],
  email: ["EMAIL"],
  // "COMPAÑÍA" a secas es como se llama en la hoja del histórico 2025.
  aseguradora: ["ASEGURADORA", "COMPAÑÍA DE SEGUROS", "COMPANIA DE SEGUROS", "COMPAÑÍA"],
  poliza: ["POLIZA", "NUMERO DE POLIZA"],
  vigenciaPoliza: ["VIGENCIA POLIZA"],
  cobertura: [
    "EVENTO AVISADO COBERTURA",
    "EVENTO AVISADO O COBERTURA",
    "COBERTURA",
    "EVENTO",
  ],
  resumen: ["RESUMEN"],
  fechaOcurrencia: ["FECHA DE OCURRENCIA DEL EVENTO"],
  fechaAvisoAsesor: ["FECHA DE AVISO A ASESOR"],
  fechaAvisoCompania: ["FECHA AVISO COMPAÑÍA", "FECHA AVISO COMPANIA"],
  radicado: ["NUMERO DE SINIESTRO O RADICADO"],
  estadoTexto: ["ESTADO PENDIENTE POR", "ESTADO PENDIENTE", "ESTADO"],
  observaciones: ["OBSERVACIONES"],
  valorSiniestro: ["VALOR SINIESTRO", "PRETENCION", "VALOR SOLICITADO A RECLAMAR"],
  valorLiquidar: ["VALOR A LIQUIDAR POR LA ASEGURADORA", "ESTABLESIDO", "ESTABLECIDO"],
  valorPagado: ["VALOR PAGADO POR LA ASEGURADORA", "PAGADO"],
  deducible: ["DEDUCIBLE"],
  fechaPago: ["FECHA DE PAGO"],
  otrosDatos: ["OTROS DATOS"],
  empleadoCompania: ["EMPLEADO COMPAÑÍA", "EMPLEADO COMPANIA"],
  telefonoCompania: ["TELEFONO"],
  correoCompania: ["CORREO"],
  fechaUltimoSeguimiento: ["FECHA ACTUALIZACION", "FECHA DE ULTIMO SEGUIMIENTO"],
};

const COLUMNAS_RESUMEN: Record<string, string[]> = {
  asegurado: ["COPROPIEDAD", "ASEGURADO"],
  cobertura: ["DAÑO O COBERTURA", "COBERTURA", "EVENTO"],
  responsable: ["RESPONSABLE"],
  fechaUltimoSeguimiento: ["FECHA DE ULTIMO SEGUIMIENTO", "FECHA ACTUALIZACION"],
  estadoTexto: ["ESTADO", "ESTADO PENDIENTE"],
  valorSiniestro: ["PRETENCIONES", "PRETENCION", "VALOR SOLICITADO A RECLAMAR"],
  valorLiquidar: ["ESTABLECIDO", "ESTABLESIDO", "VALOR A LIQUIDAR POR LA ASEGURADORA"],
  deducible: ["DEDUCIBLE"],
  valorPagado: ["INDEMNIZAR", "VALOR PAGADO POR LA ASEGURADORA"],
  fechaPago: ["FECHA DE PAGO"],
  aseguradora: ["COMPAÑÍA", "ASEGURADORA"],
  observaciones: ["OBSERVACIONES"],
};

function vacio(): SiniestroInput {
  return {
    asegurado: "",
    nit: null,
    firmaAdministracion: null,
    administrador: null,
    celular: null,
    email: null,
    aseguradora: null,
    poliza: null,
    vigenciaPoliza: null,
    cobertura: null,
    resumen: null,
    fechaOcurrencia: null,
    fechaAvisoAsesor: null,
    fechaAvisoCompania: null,
    radicado: null,
    estadoTexto: null,
    estado: "SIN_ESTADO",
    observaciones: null,
    valorSiniestro: null,
    valorLiquidar: null,
    valorPagado: null,
    deducible: null,
    fechaPago: null,
    otrosDatos: null,
    empleadoCompania: null,
    telefonoCompania: null,
    correoCompania: null,
    responsable: null,
    fechaUltimoSeguimiento: null,
    origen: null,
  };
}

// ---------------------------------------------------------------------------
// Archivo de seguimiento (una hoja por cliente)
// ---------------------------------------------------------------------------

export function parsearSeguimiento(
  buffer: ArrayBuffer | Buffer
): { siniestros: SiniestroInput[]; resumen: ResumenSiniestros } {
  const wb = XLSX.read(buffer, { cellDates: true });
  const res: ResumenSiniestros = {
    archivo: "SEGUIMIENTO SINIESTROS",
    hojas: 0,
    leidos: 0,
    importables: 0,
    fusionados: 0,
    omitidos: 0,
    avisos: [],
  };
  const salida: SiniestroInput[] = [];

  for (const nombreHoja of wb.SheetNames) {
    const ws = wb.Sheets[nombreHoja];
    if (!ws) continue;
    const filas = XLSX.utils.sheet_to_json<Fila>(ws, {
      header: 1,
      defval: null,
      blankrows: false,
    });
    if (filas.length === 0) continue;

    // Algunas hojas traen un título antes del encabezado.
    let iEnc = 0;
    if (!clave(texto(filas[0]?.[0])).includes("ASEGURADO")) iEnc = 1;
    const encabezado = filas[iEnc];
    if (!encabezado || !clave(texto(encabezado[0])).includes("ASEGURADO")) {
      // La hoja "2025" tiene otra estructura; se avisa y se omite.
      res.avisos.push(`Hoja "${nombreHoja}": no tiene el formato de siniestros; se omitió.`);
      continue;
    }

    res.hojas++;
    const col = mapear(encabezado, COLUMNAS_DETALLE);
    const v = (f: Fila, campo: string): Celda => {
      const i = col[campo];
      return i === undefined ? null : (f[i] ?? null);
    };

    for (const f of filas.slice(iEnc + 1)) {
      const asegurado = texto(v(f, "asegurado"));
      if (!asegurado) continue;
      res.leidos++;
      const estadoTexto = texto(v(f, "estadoTexto"));
      // Filas de relleno: el archivo usa "NO TIENEN SINIESTROS" como marcador.
      if (/NO TIENEN? SINIESTROS?/i.test(estadoTexto ?? "")) {
        res.omitidos++;
        res.avisos.push(`Hoja "${nombreHoja}": "${asegurado}" marcado sin siniestros; se omitió.`);
        continue;
      }
      salida.push({
        ...vacio(),
        asegurado,
        nit: texto(v(f, "nit")),
        firmaAdministracion: texto(v(f, "firmaAdministracion")),
        administrador: texto(v(f, "administrador")),
        celular: texto(v(f, "celular")),
        email: texto(v(f, "email")),
        aseguradora: texto(v(f, "aseguradora"))?.toUpperCase() ?? null,
        poliza: texto(v(f, "poliza")),
        vigenciaPoliza: fecha(v(f, "vigenciaPoliza")),
        cobertura: texto(v(f, "cobertura")),
        resumen: texto(v(f, "resumen")),
        fechaOcurrencia: fecha(v(f, "fechaOcurrencia")),
        fechaAvisoAsesor: fecha(v(f, "fechaAvisoAsesor")),
        fechaAvisoCompania: fecha(v(f, "fechaAvisoCompania")),
        radicado: texto(v(f, "radicado")),
        estadoTexto,
        estado: normalizarEstado(estadoTexto),
        observaciones: texto(v(f, "observaciones")),
        valorSiniestro: numero(v(f, "valorSiniestro")),
        valorLiquidar: numero(v(f, "valorLiquidar")),
        valorPagado: numero(v(f, "valorPagado")),
        deducible: numero(v(f, "deducible")),
        fechaPago: fecha(v(f, "fechaPago")),
        otrosDatos: texto(v(f, "otrosDatos")),
        empleadoCompania: texto(v(f, "empleadoCompania")),
        telefonoCompania: texto(v(f, "telefonoCompania")),
        correoCompania: texto(v(f, "correoCompania")),
        fechaUltimoSeguimiento: fecha(v(f, "fechaUltimoSeguimiento")),
        origen: `SEGUIMIENTO / ${nombreHoja}`,
      });
      res.importables++;
    }
  }
  return { siniestros: salida, resumen: res };
}

// ---------------------------------------------------------------------------
// Archivo resumen (una sola hoja)
// ---------------------------------------------------------------------------

/**
 * Lee el resumen y lo cruza con lo que ya se tenga del detalle.
 *
 * Solo se fusiona cuando coinciden cliente Y cobertura; si no, el caso se
 * agrega aparte. Es deliberado: cruzar por nombre parecido mezclaría casos de
 * clientes distintos, y un siniestro atribuido al cliente equivocado es peor
 * que un registro repetido, que se ve y se corrige.
 */
export function parsearResumen(
  buffer: ArrayBuffer | Buffer,
  yaImportados: SiniestroInput[]
): { siniestros: SiniestroInput[]; resumen: ResumenSiniestros } {
  const wb = XLSX.read(buffer, { cellDates: true });
  const res: ResumenSiniestros = {
    archivo: "SINIESTROS (resumen)",
    hojas: 0,
    leidos: 0,
    importables: 0,
    fusionados: 0,
    omitidos: 0,
    avisos: [],
  };
  const nuevos: SiniestroInput[] = [];

  for (const nombreHoja of wb.SheetNames) {
    const ws = wb.Sheets[nombreHoja];
    if (!ws) continue;
    const filas = XLSX.utils.sheet_to_json<Fila>(ws, {
      header: 1,
      defval: null,
      blankrows: false,
    });
    if (filas.length === 0) continue;
    let iEnc = 0;
    const tieneEnc = (f: Fila | undefined) =>
      !!f && /COPROPIEDAD|ASEGURADO/.test(clave(texto(f[0])));
    if (!tieneEnc(filas[0])) iEnc = 1;
    if (!tieneEnc(filas[iEnc])) {
      res.avisos.push(`Hoja "${nombreHoja}": sin encabezado reconocible; se omitió.`);
      continue;
    }
    res.hojas++;
    const col = mapear(filas[iEnc], COLUMNAS_RESUMEN);
    const v = (f: Fila, campo: string): Celda => {
      const i = col[campo];
      return i === undefined ? null : (f[i] ?? null);
    };

    for (const f of filas.slice(iEnc + 1)) {
      const asegurado = texto(v(f, "asegurado"));
      if (!asegurado) continue;
      res.leidos++;
      const estadoTexto = texto(v(f, "estadoTexto"));
      if (/NO TIENEN? SINIESTROS?/i.test(estadoTexto ?? "")) {
        res.omitidos++;
        continue;
      }
      const cobertura = texto(v(f, "cobertura"));
      const responsable = texto(v(f, "responsable"));
      const ultimo = fecha(v(f, "fechaUltimoSeguimiento"));
      const kc = clave(asegurado);
      const kb = clave(cobertura);

      // ¿Ya existe este caso en el detalle?
      const encontrado = yaImportados.find((d) => {
        const kd = clave(d.asegurado);
        const mismoCliente =
          kd === kc || kd.includes(kc) || kc.includes(kd) ||
          clave(d.origen?.split("/").pop() ?? "") === kc;
        if (!mismoCliente) return false;
        const kdb = clave(d.cobertura);
        return kdb === kb || (!!kb && (kdb.includes(kb) || kb.includes(kdb)));
      });

      if (encontrado) {
        // Se completa lo que el detalle no trae; no se sobreescribe lo que ya hay.
        encontrado.responsable ??= responsable;
        encontrado.fechaUltimoSeguimiento ??= ultimo;
        encontrado.valorSiniestro ??= numero(v(f, "valorSiniestro"));
        encontrado.valorLiquidar ??= numero(v(f, "valorLiquidar"));
        encontrado.deducible ??= numero(v(f, "deducible"));
        encontrado.valorPagado ??= numero(v(f, "valorPagado"));
        encontrado.fechaPago ??= fecha(v(f, "fechaPago"));
        if (!encontrado.estadoTexto) {
          encontrado.estadoTexto = estadoTexto;
          encontrado.estado = normalizarEstado(estadoTexto);
        }
        res.fusionados++;
        continue;
      }

      nuevos.push({
        ...vacio(),
        asegurado,
        cobertura,
        aseguradora: texto(v(f, "aseguradora"))?.toUpperCase() ?? null,
        responsable,
        fechaUltimoSeguimiento: ultimo,
        estadoTexto,
        estado: normalizarEstado(estadoTexto),
        observaciones: texto(v(f, "observaciones")),
        valorSiniestro: numero(v(f, "valorSiniestro")),
        valorLiquidar: numero(v(f, "valorLiquidar")),
        deducible: numero(v(f, "deducible")),
        valorPagado: numero(v(f, "valorPagado")),
        fechaPago: fecha(v(f, "fechaPago")),
        origen: `RESUMEN / ${nombreHoja}`,
      });
      res.importables++;
    }
  }
  return { siniestros: nuevos, resumen: res };
}

/** Días desde el último movimiento conocido del caso. */
export function diasSinMovimiento(s: {
  fechaUltimoSeguimiento: Date | null;
  fechaAvisoCompania: Date | null;
  fechaAvisoAsesor: Date | null;
  fechaOcurrencia: Date | null;
}, hoy: Date): number | null {
  const ref =
    s.fechaUltimoSeguimiento ??
    s.fechaAvisoCompania ??
    s.fechaAvisoAsesor ??
    s.fechaOcurrencia;
  if (!ref) return null;
  return Math.max(0, Math.round((hoy.getTime() - ref.getTime()) / 86400000));
}
