import * as XLSX from "xlsx";
import { mesDeFecha } from "./calculos";
import { TipoLista } from "./constants";

// ---------------------------------------------------------------------------
// Parser del informe de producción de Cuántico.
//
// Estructura real del archivo (verificada contra el informe 2026):
//  - DATOS: título en fila 1, encabezados en FILA 2, datos desde fila 3.
//    El encabezado de la columna ASEGURADORA (columna G) viene EN BLANCO en el
//    archivo real, por lo que el mapeo es POSICIONAL, no por nombre.
//  - OTRAS PÓLIZAS: encabezados en FILA 2, datos desde fila 3.
//  - CANCELACIONES: encabezados en FILA 2, datos desde fila 3.
//  - BASE 2025: encabezados en FILA 1, datos desde fila 2.
//  - LISTAS: encabezados en FILA 1 (RAMO, TIPO_NEGOCIO, ESTADO_PAGO,
//    FORMA_PAGO, ASEGURADORA, ASESOR, MES_ORDEN).
// ---------------------------------------------------------------------------

type Celda = string | number | boolean | Date | null;
type Fila = Celda[];

export interface ResumenHoja {
  hoja: string;
  leidos: number;
  importables: number;
  duplicados: number;
  errores: string[];
  advertencias: string[];
}

export interface DatosImportados {
  policies: PolicyInput[];
  otherPolicies: OtherPolicyInput[];
  cancellations: CancellationInput[];
  historical: HistoricalInput[];
  listas: { tipo: TipoLista; valor: string }[];
  resumen: ResumenHoja[];
}

export interface PolicyInput {
  numero: string;
  ramo: string;
  asegurado: string;
  ccNit: string | null;
  placa: string | null;
  aseguradora: string | null;
  tipoNegocio: string | null;
  /** Columna OBSERVACION, añadida al informe en julio de 2026. */
  observacion: string | null;
  asesor1: string | null;
  asesor2: string | null;
  primaNeta: number;
  primaTotal: number;
  formaPago: string | null;
  fechaPago: Date | null;
  fechaMaxPago: Date | null;
  estadoPago: string | null;
  vencimiento: Date | null;
  mesVencimiento: string | null;
  fechaNacimiento: Date | null;
  correo: string | null;
  celular: string | null;
  mensajeResumen: string | null;
  vtoSoat: Date | null;
}

export interface OtherPolicyInput {
  numero: string;
  ramo: string;
  asegurado: string;
  ccNit: string | null;
  tipoNegocio: string | null;
  asesor1: string | null;
  asesor2: string | null;
  primaNeta: number;
  primaTotal: number;
  formaPago: string | null;
  fechaPago: Date | null;
  fechaMaxPago: Date | null;
  estadoPago: string | null;
  vencimiento: Date | null;
  fechaNacimiento: Date | null;
  correo: string | null;
  celular: string | null;
}

export interface CancellationInput {
  numero: string;
  ramo: string;
  fechaRenovacion: Date | null;
  fechaCancelacion: Date | null;
  tipoNegocio: string | null;
  asegurado: string | null;
  ccNit: string | null;
  placa: string | null;
  asesor: string | null;
  aseguradora: string | null;
  primaNeta: number;
  primaTotal: number;
}

export interface HistoricalInput {
  numero: string;
  ramo: string;
  vencimiento: Date | null;
  mes: string | null;
  tipoNegocio: string | null;
  asegurado: string | null;
  primaNeta: number;
  primaTotal: number;
}

// --------------------------- coerciones básicas ----------------------------

function texto(c: Celda): string | null {
  if (c == null) return null;
  const s = String(c).trim();
  return s === "" ? null : s;
}

function numero(c: Celda): number {
  if (c == null || c === "") return 0;
  if (typeof c === "number") return isFinite(c) ? c : 0;
  const n = Number(String(c).replace(/[$.\s]/g, "").replace(",", "."));
  return isFinite(n) ? n : 0;
}

/** Normaliza cualquier representación de fecha del Excel a medianoche UTC. */
function fecha(c: Celda): Date | null {
  if (c == null || c === "") return null;
  if (c instanceof Date) {
    if (isNaN(c.getTime())) return null;
    // xlsx entrega la fecha con un desfase horario del libro: nos quedamos con
    // el día calendario y lo fijamos a medianoche UTC.
    return new Date(Date.UTC(c.getFullYear(), c.getMonth(), c.getDate()));
  }
  if (typeof c === "number") {
    // Serial de Excel (sistema 1900)
    const parsed = XLSX.SSF.parse_date_code(c);
    if (!parsed) return null;
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  }
  const s = String(c).trim();
  // dd/mm/yyyy o dd-mm-yyyy
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (m) {
    const anio = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(Date.UTC(anio, Number(m[2]) - 1, Number(m[1])));
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }
  return null;
}

// ------------------------------- validación --------------------------------

class Validador {
  listas: Map<TipoLista, Set<string>>;
  constructor(listas: { tipo: TipoLista; valor: string }[]) {
    this.listas = new Map();
    for (const { tipo, valor } of listas) {
      if (!this.listas.has(tipo)) this.listas.set(tipo, new Set());
      this.listas.get(tipo)!.add(valor.toUpperCase());
    }
  }
  /** Devuelve una advertencia si el valor existe pero no está en LISTAS. */
  advertir(tipo: TipoLista, valor: string | null, contexto: string): string | null {
    if (!valor) return null;
    const set = this.listas.get(tipo);
    if (!set || set.size === 0) return null;
    if (set.has(valor.toUpperCase())) return null;
    return `${contexto}: ${tipo} "${valor}" no está en la hoja LISTAS`;
  }
}

function filasDesde(ws: XLSX.WorkSheet, filaInicio: number): Fila[] {
  return XLSX.utils.sheet_to_json<Fila>(ws, {
    header: 1,
    range: filaInicio - 1,
    defval: null,
    blankrows: false,
  });
}

// ---------------------------------------------------------------------------
// Mapeo de columnas POR NOMBRE
//
// Antes se leían las columnas por su posición, pero el informe es un documento
// vivo: en julio de 2026 se insertó "OBSERVACION" y se eliminó "FECHA PAGO",
// con lo que todo lo que venía después quedó corrido y la importación habría
// leído la prima neta de la columna del asesor (producción = $0).
//
// Ahora cada campo se busca por el texto de su encabezado, con alias para las
// variantes que ha tenido, y solo se cae a una posición fija cuando el
// encabezado viene vacío (así era la columna de la aseguradora en las
// versiones viejas). Añadir o mover columnas ya no rompe nada.
// ---------------------------------------------------------------------------

/** Normaliza un encabezado para compararlo: sin tildes, espacios ni signos. */
function claveEncabezado(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export interface DefColumna {
  /** Nombre lógico del campo, para los mensajes de error. */
  campo: string;
  /** Encabezados aceptados (se comparan normalizados). */
  alias: string[];
  /** Posición de reserva si ningún encabezado coincide. */
  posicion?: number;
  /** Si falta, la hoja no se puede importar. */
  obligatoria?: boolean;
}

export type Columnas = Record<string, number>;

function leerEncabezado(ws: XLSX.WorkSheet, filaEncabezado: number): Fila {
  const filas = XLSX.utils.sheet_to_json<Fila>(ws, {
    header: 1,
    range: filaEncabezado - 1,
    defval: null,
    blankrows: false,
  });
  return filas[0] ?? [];
}

/**
 * Devuelve el índice de cada campo, o un error si falta alguno obligatorio.
 */
function mapearColumnas(
  ws: XLSX.WorkSheet,
  filaEncabezado: number,
  definiciones: DefColumna[],
  hoja: string
): { columnas: Columnas; error: string | null; avisos: string[] } {
  const encabezado = leerEncabezado(ws, filaEncabezado);
  const porClave = new Map<string, number>();
  encabezado.forEach((celda, i) => {
    const t = texto(celda);
    if (!t) return;
    const k = claveEncabezado(t);
    // Se conserva la primera aparición: si un encabezado se repite, manda el
    // de más a la izquierda.
    if (k && !porClave.has(k)) porClave.set(k, i);
  });

  const columnas: Columnas = {};
  const faltantes: string[] = [];
  const avisos: string[] = [];

  for (const def of definiciones) {
    let idx = -1;
    for (const alias of def.alias) {
      const encontrado = porClave.get(claveEncabezado(alias));
      if (encontrado !== undefined) {
        idx = encontrado;
        break;
      }
    }
    if (idx === -1 && def.posicion !== undefined) {
      // Sin encabezado: se usa la posición histórica (p. ej. la aseguradora,
      // que en los archivos viejos venía sin título).
      const t = texto(encabezado[def.posicion]);
      if (!t) {
        idx = def.posicion;
        avisos.push(
          `${hoja}: la columna "${def.campo}" no tiene encabezado; se tomó la columna ${def.posicion + 1}.`
        );
      }
    }
    if (idx === -1) {
      if (def.obligatoria) faltantes.push(def.campo);
      continue;
    }
    columnas[def.campo] = idx;
  }

  if (faltantes.length > 0) {
    return {
      columnas,
      avisos,
      error: `La hoja "${hoja}" no tiene las columnas: ${faltantes.join(", ")}. Verifique que el archivo sea el informe de producción y que los encabezados estén en la fila ${filaEncabezado}.`,
    };
  }
  return { columnas, avisos, error: null };
}

/** Lee una celda de la fila usando el mapa de columnas (null si no existe). */
function celda(fila: Fila, columnas: Columnas, campo: string): Celda {
  const i = columnas[campo];
  return i === undefined ? null : (fila[i] ?? null);
}

// ------------------------------ parseo por hoja ----------------------------

const MAX_MENSAJES = 30;

function limitar(lista: string[]): string[] {
  if (lista.length <= MAX_MENSAJES) return lista;
  return [
    ...lista.slice(0, MAX_MENSAJES),
    `… y ${lista.length - MAX_MENSAJES} más`,
  ];
}

export function parsearLibro(buffer: ArrayBuffer | Buffer): DatosImportados {
  const wb = XLSX.read(buffer, { cellDates: true });
  const resumen: ResumenHoja[] = [];

  // ---- LISTAS primero (alimenta la validación de las demás hojas) ----
  const listas: { tipo: TipoLista; valor: string }[] = [];
  {
    const ws = wb.Sheets["LISTAS"];
    const res: ResumenHoja = { hoja: "LISTAS", leidos: 0, importables: 0, duplicados: 0, errores: [], advertencias: [] };
    if (!ws) {
      res.errores.push('No se encontró la hoja "LISTAS".');
    } else {
      const filas = filasDesde(ws, 1);
      const encabezados = (filas[0] ?? []).map((c) => texto(c)?.toUpperCase() ?? "");
      const columnas: { tipo: TipoLista; col: number }[] = [];
      const mapa: Record<string, TipoLista> = {
        RAMO: "RAMO",
        TIPO_NEGOCIO: "TIPO_NEGOCIO",
        ESTADO_PAGO: "ESTADO_PAGO",
        FORMA_PAGO: "FORMA_PAGO",
        ASEGURADORA: "ASEGURADORA",
        ASESOR: "ASESOR",
      };
      encabezados.forEach((h, col) => {
        if (mapa[h]) columnas.push({ tipo: mapa[h], col });
      });
      const vistos = new Set<string>();
      for (const fila of filas.slice(1)) {
        for (const { tipo, col } of columnas) {
          const valor = texto(fila[col]);
          if (!valor) continue;
          res.leidos++;
          const clave = `${tipo}|${valor.toUpperCase()}`;
          if (vistos.has(clave)) {
            res.duplicados++;
            continue;
          }
          vistos.add(clave);
          listas.push({ tipo, valor });
          res.importables++;
        }
      }
    }
    resumen.push(res);
  }
  const validador = new Validador(listas);

  // ---- DATOS ----
  const policies: PolicyInput[] = [];
  {
    const res: ResumenHoja = { hoja: "DATOS", leidos: 0, importables: 0, duplicados: 0, errores: [], advertencias: [] };
    const ws = wb.Sheets["DATOS"];
    if (!ws) {
      res.errores.push('No se encontró la hoja "DATOS".');
    } else {
      const { columnas: col, error: errorEnc, avisos } = mapearColumnas(
        ws,
        2,
        [
          { campo: "poliza", alias: ["PÓLIZA", "POLIZA"], obligatoria: true },
          { campo: "ramo", alias: ["RAMO"], obligatoria: true },
          { campo: "asegurado", alias: ["ASEGURADO"], obligatoria: true },
          { campo: "ccNit", alias: ["CC / NIT", "CC/NIT", "CEDULA", "NIT"] },
          { campo: "placa", alias: ["PLACA"] },
          // En los archivos viejos esta columna venía sin encabezado.
          { campo: "aseguradora", alias: ["COMPAÑÍA", "COMPANIA", "ASEGURADORA"], posicion: 6 },
          { campo: "tipoNegocio", alias: ["TIPO NEGOCIO"] },
          { campo: "observacion", alias: ["OBSERVACION", "OBSERVACIÓN"] },
          { campo: "asesor1", alias: ["ASESOR 1"] },
          { campo: "asesor2", alias: ["ASESOR 2"] },
          { campo: "primaNeta", alias: ["PRIMA NETA"], obligatoria: true },
          { campo: "primaTotal", alias: ["PRIMA TOTAL"] },
          { campo: "formaPago", alias: ["FORMA DE PAGO"] },
          // "FECHA PAGO" desapareció en la versión de julio de 2026.
          { campo: "fechaPago", alias: ["FECHA PAGO"] },
          { campo: "fechaMaxPago", alias: ["FECHA MÁX. PAGO", "FECHA MAX PAGO"] },
          { campo: "estadoPago", alias: ["ESTADO DE PAGO"] },
          { campo: "vencimiento", alias: ["VENCIMIENTO"], obligatoria: true },
          { campo: "fechaNacimiento", alias: ["FECHA NACIMIENTO"] },
          { campo: "correo", alias: ["CORREO"] },
          { campo: "celular", alias: ["CELULAR"] },
          { campo: "mensajeResumen", alias: ["MENSAJE RESUMEN"] },
          { campo: "vtoSoat", alias: ["VTO. SOAT", "VTO SOAT"] },
        ],
        "DATOS"
      );
      res.advertencias.push(...avisos);
      if (errorEnc) {
        res.errores.push(errorEnc);
      } else {
        const v = (f: Fila, campo: string) => celda(f, col, campo);
        const vistos = new Set<string>();
        const filas = filasDesde(ws, 3);
        filas.forEach((f, i) => {
          const filaExcel = i + 3;
          let poliza = texto(v(f, "poliza"));
          const ramo = texto(v(f, "ramo"));
          const asegurado = texto(v(f, "asegurado"));
          if (!poliza && !ramo && !asegurado) return; // fila vacía
          res.leidos++;
          if (!ramo || !asegurado) {
            res.errores.push(`DATOS fila ${filaExcel}: falta RAMO o ASEGURADO.`);
            return;
          }
          if (!poliza) {
            // El informe original suma estas filas aunque no tengan número:
            // se importan como "S/N" para no descuadrar la producción.
            poliza = "S/N";
            res.advertencias.push(`DATOS fila ${filaExcel}: sin número de PÓLIZA; se importó como "S/N".`);
          }
          const vencimiento = fecha(v(f, "vencimiento"));
          // Las filas idénticas se REPORTAN como duplicados pero se importan
          // igualmente: el informe original las suma (un mismo número de
          // póliza puede repetirse legítimamente en colectivas, flotas o
          // certificados por asegurado) y omitirlas descuadraría la producción.
          const clave = `${poliza}|${ramo}|${vencimiento?.toISOString() ?? ""}|${asegurado}|${numero(v(f, "primaNeta"))}`;
          if (vistos.has(clave)) {
            res.duplicados++;
            res.advertencias.push(
              `DATOS fila ${filaExcel}: fila duplicada (póliza ${poliza}, ${ramo}, ${asegurado}); se importó de todas formas.`
            );
          }
          vistos.add(clave);
          const ctx = `DATOS fila ${filaExcel} (póliza ${poliza})`;
          for (const adv of [
            validador.advertir("RAMO", ramo, ctx),
            validador.advertir("TIPO_NEGOCIO", texto(v(f, "tipoNegocio")), ctx),
            validador.advertir("ASEGURADORA", texto(v(f, "aseguradora")), ctx),
            validador.advertir("ESTADO_PAGO", texto(v(f, "estadoPago")), ctx),
            validador.advertir("FORMA_PAGO", texto(v(f, "formaPago")), ctx),
            validador.advertir("ASESOR", texto(v(f, "asesor1")), ctx),
          ]) {
            if (adv) res.advertencias.push(adv);
          }
          // DÍAS AL VENCE, MES VENCIMIENTO y EDAD se recalculan siempre:
          // el mes se deriva del vencimiento; los días y la edad se calculan
          // en tiempo de consulta a partir de las fechas almacenadas.
          policies.push({
            numero: poliza,
            ramo,
            asegurado,
            ccNit: texto(v(f, "ccNit")),
            placa: texto(v(f, "placa")),
            aseguradora: texto(v(f, "aseguradora")),
            tipoNegocio: texto(v(f, "tipoNegocio"))?.toUpperCase() ?? null,
            observacion: texto(v(f, "observacion")),
            asesor1: texto(v(f, "asesor1")),
            asesor2: texto(v(f, "asesor2")),
            primaNeta: numero(v(f, "primaNeta")),
            primaTotal: numero(v(f, "primaTotal")),
            formaPago: texto(v(f, "formaPago")),
            fechaPago: fecha(v(f, "fechaPago")),
            fechaMaxPago: fecha(v(f, "fechaMaxPago")),
            estadoPago: texto(v(f, "estadoPago"))?.toUpperCase() ?? null,
            vencimiento,
            mesVencimiento: mesDeFecha(vencimiento),
            fechaNacimiento: fecha(v(f, "fechaNacimiento")),
            correo: texto(v(f, "correo")),
            celular: texto(v(f, "celular")),
            mensajeResumen: texto(v(f, "mensajeResumen")),
            vtoSoat: fecha(v(f, "vtoSoat")),
          });
          res.importables++;
        });
      }
    }
    res.errores = limitar(res.errores);
    res.advertencias = limitar(res.advertencias);
    resumen.push(res);
  }

  // ---- OTRAS PÓLIZAS ----
  const otherPolicies: OtherPolicyInput[] = [];
  {
    const res: ResumenHoja = { hoja: "OTRAS PÓLIZAS", leidos: 0, importables: 0, duplicados: 0, errores: [], advertencias: [] };
    const ws = wb.Sheets["OTRAS PÓLIZAS"];
    if (!ws) {
      res.errores.push('No se encontró la hoja "OTRAS PÓLIZAS".');
    } else {
      const { columnas: col, error: errorEnc, avisos } = mapearColumnas(
        ws,
        2,
        [
          { campo: "poliza", alias: ["PÓLIZA", "POLIZA"], obligatoria: true },
          { campo: "ramo", alias: ["RAMO"], obligatoria: true },
          { campo: "asegurado", alias: ["ASEGURADO"], obligatoria: true },
          { campo: "ccNit", alias: ["CC / NIT", "CC/NIT"] },
          { campo: "tipoNegocio", alias: ["TIPO NEGOCIO"] },
          { campo: "asesor1", alias: ["ASESOR 1"] },
          { campo: "asesor2", alias: ["ASESOR 2"] },
          { campo: "primaNeta", alias: ["PRIMA NETA"], obligatoria: true },
          { campo: "primaTotal", alias: ["PRIMA TOTAL"] },
          { campo: "formaPago", alias: ["FORMA DE PAGO"] },
          { campo: "fechaPago", alias: ["FECHA PAGO"] },
          { campo: "fechaMaxPago", alias: ["FECHA MÁX. PAGO", "FECHA MAX PAGO"] },
          { campo: "estadoPago", alias: ["ESTADO DE PAGO"] },
          { campo: "vencimiento", alias: ["VENCIMIENTO"] },
          { campo: "fechaNacimiento", alias: ["FECHA NACIMIENTO"] },
          { campo: "correo", alias: ["CORREO"] },
          { campo: "celular", alias: ["CELULAR"] },
        ],
        "OTRAS PÓLIZAS"
      );
      res.advertencias.push(...avisos);
      if (errorEnc) {
        res.errores.push(errorEnc);
      } else {
        const v = (f: Fila, campo: string) => celda(f, col, campo);
        const vistos = new Set<string>();
        const filas = filasDesde(ws, 3);
        filas.forEach((f, i) => {
          const filaExcel = i + 3;
          let poliza = texto(v(f, "poliza"));
          const ramo = texto(v(f, "ramo"));
          const asegurado = texto(v(f, "asegurado"));
          if (!poliza && !ramo && !asegurado) return;
          res.leidos++;
          if (!ramo || !asegurado) {
            res.errores.push(`OTRAS PÓLIZAS fila ${filaExcel}: falta RAMO o ASEGURADO.`);
            return;
          }
          if (!poliza) {
            poliza = "S/N";
            res.advertencias.push(`OTRAS PÓLIZAS fila ${filaExcel}: sin número de PÓLIZA; se importó como "S/N".`);
          }
          const clave = `${poliza}|${ramo}|${asegurado}|${numero(v(f, "primaNeta"))}`;
          if (vistos.has(clave)) {
            res.duplicados++;
            res.advertencias.push(
              `OTRAS PÓLIZAS fila ${filaExcel}: fila duplicada (póliza ${poliza}); se importó de todas formas.`
            );
          }
          vistos.add(clave);
          otherPolicies.push({
            numero: poliza,
            ramo,
            asegurado,
            ccNit: texto(v(f, "ccNit")),
            tipoNegocio: texto(v(f, "tipoNegocio"))?.toUpperCase() ?? null,
            asesor1: texto(v(f, "asesor1")),
            asesor2: texto(v(f, "asesor2")),
            primaNeta: numero(v(f, "primaNeta")),
            primaTotal: numero(v(f, "primaTotal")),
            formaPago: texto(v(f, "formaPago")),
            fechaPago: fecha(v(f, "fechaPago")),
            fechaMaxPago: fecha(v(f, "fechaMaxPago")),
            estadoPago: texto(v(f, "estadoPago"))?.toUpperCase() ?? null,
            vencimiento: fecha(v(f, "vencimiento")),
            fechaNacimiento: fecha(v(f, "fechaNacimiento")),
            correo: texto(v(f, "correo")),
            celular: texto(v(f, "celular")),
          });
          res.importables++;
        });
      }
    }
    res.errores = limitar(res.errores);
    res.advertencias = limitar(res.advertencias);
    resumen.push(res);
  }

  // ---- CANCELACIONES ----
  const cancellations: CancellationInput[] = [];
  {
    const res: ResumenHoja = { hoja: "CANCELACIONES", leidos: 0, importables: 0, duplicados: 0, errores: [], advertencias: [] };
    const ws = wb.Sheets["CANCELACIONES"];
    if (!ws) {
      res.errores.push('No se encontró la hoja "CANCELACIONES".');
    } else {
      const { columnas: col, error: errorEnc, avisos } = mapearColumnas(
        ws,
        2,
        [
          { campo: "poliza", alias: ["PÓLIZA", "POLIZA"], obligatoria: true },
          { campo: "ramo", alias: ["RAMO"], obligatoria: true },
          {
            campo: "fechaRenovacion",
            alias: ["FECHA RENOVACION", "FECHA RENOVACIÓN"],
            obligatoria: true,
          },
          {
            campo: "fechaCancelacion",
            alias: ["FECHA CANCELACIÓN", "FECHA CANCELACION"],
            obligatoria: true,
          },
          { campo: "tipoNegocio", alias: ["TIPO NEGOCIO"] },
          { campo: "asegurado", alias: ["ASEGURADO"] },
          { campo: "ccNit", alias: ["CC / NIT", "CC/NIT"] },
          { campo: "placa", alias: ["PLACA"] },
          { campo: "asesor", alias: ["ASESOR"] },
          { campo: "aseguradora", alias: ["ASEGURADORA", "COMPAÑÍA", "COMPANIA"] },
          { campo: "primaNeta", alias: ["PRIMA NETA"], obligatoria: true },
          { campo: "primaTotal", alias: ["PRIMA TOTAL"] },
        ],
        "CANCELACIONES"
      );
      res.advertencias.push(...avisos);
      if (errorEnc) {
        res.errores.push(errorEnc);
      } else {
        const v = (f: Fila, campo: string) => celda(f, col, campo);
        const vistos = new Set<string>();
        const filas = filasDesde(ws, 3);
        filas.forEach((f, i) => {
          const filaExcel = i + 3;
          let poliza = texto(v(f, "poliza"));
          const ramo = texto(v(f, "ramo"));
          if (!poliza && !ramo) return;
          res.leidos++;
          if (!ramo) {
            res.errores.push(`CANCELACIONES fila ${filaExcel}: falta RAMO.`);
            return;
          }
          if (!poliza) {
            poliza = "S/N";
            res.advertencias.push(`CANCELACIONES fila ${filaExcel}: sin número de PÓLIZA; se importó como "S/N".`);
          }
          const fechaRen = fecha(v(f, "fechaRenovacion"));
          const fechaCan = fecha(v(f, "fechaCancelacion"));
          const clave = `${poliza}|${ramo}|${fechaRen?.toISOString() ?? ""}|${fechaCan?.toISOString() ?? ""}|${texto(v(f, "asegurado")) ?? ""}|${numero(v(f, "primaNeta"))}`;
          if (vistos.has(clave)) {
            res.duplicados++;
            res.advertencias.push(
              `CANCELACIONES fila ${filaExcel}: fila duplicada (póliza ${poliza}); se importó de todas formas.`
            );
          }
          vistos.add(clave);
          cancellations.push({
            numero: poliza,
            ramo,
            fechaRenovacion: fechaRen,
            fechaCancelacion: fechaCan,
            tipoNegocio: texto(v(f, "tipoNegocio"))?.toUpperCase() ?? null,
            asegurado: texto(v(f, "asegurado")),
            ccNit: texto(v(f, "ccNit")),
            placa: texto(v(f, "placa")),
            asesor: texto(v(f, "asesor")),
            aseguradora: texto(v(f, "aseguradora")),
            primaNeta: numero(v(f, "primaNeta")),
            primaTotal: numero(v(f, "primaTotal")),
          });
          res.importables++;
        });
      }
    }
    res.errores = limitar(res.errores);
    res.advertencias = limitar(res.advertencias);
    resumen.push(res);
  }

  // ---- BASE 2025 ----
  const historical: HistoricalInput[] = [];
  {
    const res: ResumenHoja = { hoja: "BASE 2025", leidos: 0, importables: 0, duplicados: 0, errores: [], advertencias: [] };
    const ws = wb.Sheets["BASE 2025"];
    if (!ws) {
      res.errores.push('No se encontró la hoja "BASE 2025".');
    } else {
      const { columnas: col, error: errorEnc, avisos } = mapearColumnas(
        ws,
        1,
        [
          { campo: "poliza", alias: ["PÓLIZA", "POLIZA"], obligatoria: true },
          { campo: "ramo", alias: ["RAMO"], obligatoria: true },
          { campo: "vencimiento", alias: ["VENCIMIENTO"], obligatoria: true },
          { campo: "mes", alias: ["MES"] },
          { campo: "tipoNegocio", alias: ["TIPO NEGOCIO"] },
          { campo: "asegurado", alias: ["ASEGURADO"] },
          { campo: "primaNeta", alias: ["PRIMA NETA"], obligatoria: true },
          { campo: "primaTotal", alias: ["PRIMA TOTAL"] },
        ],
        "BASE 2025"
      );
      res.advertencias.push(...avisos);
      if (errorEnc) {
        res.errores.push(errorEnc);
      } else {
        const v = (f: Fila, campo: string) => celda(f, col, campo);
        const vistos = new Set<string>();
        const filas = filasDesde(ws, 2);
        filas.forEach((f, i) => {
          const filaExcel = i + 2;
          let poliza = texto(v(f, "poliza"));
          const ramo = texto(v(f, "ramo"));
          if (!poliza && !ramo) return;
          res.leidos++;
          if (!ramo) {
            res.errores.push(`BASE 2025 fila ${filaExcel}: falta RAMO.`);
            return;
          }
          if (!poliza) {
            poliza = "S/N";
            res.advertencias.push(`BASE 2025 fila ${filaExcel}: sin número de PÓLIZA; se importó como "S/N".`);
          }
          const vencimiento = fecha(v(f, "vencimiento"));
          const clave = `${poliza}|${ramo}|${vencimiento?.toISOString() ?? ""}|${texto(v(f, "asegurado")) ?? ""}|${numero(v(f, "primaNeta"))}`;
          if (vistos.has(clave)) {
            res.duplicados++;
            res.advertencias.push(
              `BASE 2025 fila ${filaExcel}: fila duplicada (póliza ${poliza}); se importó de todas formas.`
            );
          }
          vistos.add(clave);
          // El MES se recalcula desde el vencimiento; si no hay fecha se
          // conserva el de la hoja.
          historical.push({
            numero: poliza,
            ramo,
            vencimiento,
            mes: mesDeFecha(vencimiento) ?? texto(v(f, "mes"))?.toUpperCase() ?? null,
            tipoNegocio: texto(v(f, "tipoNegocio"))?.toUpperCase() ?? null,
            asegurado: texto(v(f, "asegurado")),
            primaNeta: numero(v(f, "primaNeta")),
            primaTotal: numero(v(f, "primaTotal")),
          });
          res.importables++;
        });
      }
    }
    res.errores = limitar(res.errores);
    res.advertencias = limitar(res.advertencias);
    resumen.push(res);
  }

  return { policies, otherPolicies, cancellations, historical, listas, resumen };
}
