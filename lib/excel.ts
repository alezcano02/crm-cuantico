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

function verificarEncabezado(
  ws: XLSX.WorkSheet,
  filaEncabezado: number,
  esperados: { col: number; nombre: string }[],
  hoja: string
): string | null {
  const filas = XLSX.utils.sheet_to_json<Fila>(ws, {
    header: 1,
    range: filaEncabezado - 1,
    defval: null,
    blankrows: false,
  });
  const encabezado = filas[0] ?? [];
  for (const { col, nombre } of esperados) {
    const celda = texto(encabezado[col])?.toUpperCase() ?? "";
    if (!celda.includes(nombre.toUpperCase())) {
      return `La hoja "${hoja}" no tiene el encabezado esperado "${nombre}" en la fila ${filaEncabezado} (columna ${col + 1}). Verifique que el archivo tenga la estructura del informe de producción.`;
    }
  }
  return null;
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
      const errorEnc = verificarEncabezado(
        ws,
        2,
        [
          { col: 0, nombre: "N°" },
          { col: 1, nombre: "PÓLIZA" },
          { col: 2, nombre: "RAMO" },
          { col: 16, nombre: "VENCIMIENTO" },
        ],
        "DATOS"
      );
      if (errorEnc) {
        res.errores.push(errorEnc);
      } else {
        const vistos = new Set<string>();
        const filas = filasDesde(ws, 3);
        filas.forEach((f, i) => {
          const filaExcel = i + 3;
          // Columnas (posicionales, fila 2 del Excel):
          // 0 N° · 1 PÓLIZA · 2 RAMO · 3 ASEGURADO · 4 CC/NIT · 5 PLACA ·
          // 6 ASEGURADORA (encabezado en blanco) · 7 TIPO NEGOCIO · 8 ASESOR 1 ·
          // 9 ASESOR 2 · 10 PRIMA NETA · 11 PRIMA TOTAL · 12 FORMA DE PAGO ·
          // 13 FECHA PAGO · 14 FECHA MÁX. PAGO · 15 ESTADO DE PAGO ·
          // 16 VENCIMIENTO · 17 MES VENCIMIENTO · 18 DÍAS AL VENCE ·
          // 19 FECHA NACIMIENTO · 20 EDAD · 21 CORREO · 22 CELULAR ·
          // 23 MENSAJE RESUMEN · 24 VTO. SOAT (25-26 derivados, se recalculan)
          let poliza = texto(f[1]);
          const ramo = texto(f[2]);
          const asegurado = texto(f[3]);
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
          const vencimiento = fecha(f[16]);
          // Las filas idénticas se REPORTAN como duplicados pero se importan
          // igualmente: el informe original las suma (un mismo número de
          // póliza puede repetirse legítimamente en colectivas, flotas o
          // certificados por asegurado) y omitirlas descuadraría la producción.
          const clave = `${poliza}|${ramo}|${vencimiento?.toISOString() ?? ""}|${asegurado}|${numero(f[10])}`;
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
            validador.advertir("TIPO_NEGOCIO", texto(f[7]), ctx),
            validador.advertir("ASEGURADORA", texto(f[6]), ctx),
            validador.advertir("ESTADO_PAGO", texto(f[15]), ctx),
            validador.advertir("FORMA_PAGO", texto(f[12]), ctx),
            validador.advertir("ASESOR", texto(f[8]), ctx),
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
            ccNit: texto(f[4]),
            placa: texto(f[5]),
            aseguradora: texto(f[6]),
            tipoNegocio: texto(f[7])?.toUpperCase() ?? null,
            asesor1: texto(f[8]),
            asesor2: texto(f[9]),
            primaNeta: numero(f[10]),
            primaTotal: numero(f[11]),
            formaPago: texto(f[12]),
            fechaPago: fecha(f[13]),
            fechaMaxPago: fecha(f[14]),
            estadoPago: texto(f[15])?.toUpperCase() ?? null,
            vencimiento,
            mesVencimiento: mesDeFecha(vencimiento),
            fechaNacimiento: fecha(f[19]),
            correo: texto(f[21]),
            celular: texto(f[22]),
            mensajeResumen: texto(f[23]),
            vtoSoat: fecha(f[24]),
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
      const errorEnc = verificarEncabezado(
        ws,
        2,
        [
          { col: 1, nombre: "PÓLIZA" },
          { col: 2, nombre: "RAMO" },
          { col: 8, nombre: "PRIMA NETA" },
        ],
        "OTRAS PÓLIZAS"
      );
      if (errorEnc) {
        res.errores.push(errorEnc);
      } else {
        const vistos = new Set<string>();
        const filas = filasDesde(ws, 3);
        filas.forEach((f, i) => {
          const filaExcel = i + 3;
          // 0 N° · 1 PÓLIZA · 2 RAMO · 3 ASEGURADO · 4 CC/NIT · 5 TIPO NEGOCIO ·
          // 6 ASESOR 1 · 7 ASESOR 2 · 8 PRIMA NETA · 9 PRIMA TOTAL ·
          // 10 FORMA DE PAGO · 11 FECHA PAGO · 12 FECHA MÁX. PAGO ·
          // 13 ESTADO DE PAGO · 14 VENCIMIENTO · … · 17 FECHA NACIMIENTO ·
          // 19 CORREO · 20 CELULAR (columnas 14+ presentes en el archivo real)
          let poliza = texto(f[1]);
          const ramo = texto(f[2]);
          const asegurado = texto(f[3]);
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
          const clave = `${poliza}|${ramo}|${asegurado}|${numero(f[8])}`;
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
            ccNit: texto(f[4]),
            tipoNegocio: texto(f[5])?.toUpperCase() ?? null,
            asesor1: texto(f[6]),
            asesor2: texto(f[7]),
            primaNeta: numero(f[8]),
            primaTotal: numero(f[9]),
            formaPago: texto(f[10]),
            fechaPago: fecha(f[11]),
            fechaMaxPago: fecha(f[12]),
            estadoPago: texto(f[13])?.toUpperCase() ?? null,
            vencimiento: fecha(f[14]),
            fechaNacimiento: fecha(f[17]),
            correo: texto(f[19]),
            celular: texto(f[20]),
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
      const errorEnc = verificarEncabezado(
        ws,
        2,
        [
          { col: 0, nombre: "PÓLIZA" },
          { col: 2, nombre: "FECHA RENOVACION" },
          { col: 4, nombre: "FECHA CANCELACIÓN" },
        ],
        "CANCELACIONES"
      );
      if (errorEnc) {
        res.errores.push(errorEnc);
      } else {
        const vistos = new Set<string>();
        const filas = filasDesde(ws, 3);
        filas.forEach((f, i) => {
          const filaExcel = i + 3;
          // 0 PÓLIZA · 1 RAMO · 2 FECHA RENOVACION · 3 MES RENOVACIÓN ·
          // 4 FECHA CANCELACIÓN · 5 MES CANCELACIÓN · 6 TIPO NEGOCIO ·
          // 7 ASEGURADO · 8 CC/NIT · 9 PLACA · 10 ASESOR · 11 ASEGURADORA ·
          // 12 PRIMA NETA · 13 PRIMA TOTAL
          let poliza = texto(f[0]);
          const ramo = texto(f[1]);
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
          const fechaRen = fecha(f[2]);
          const fechaCan = fecha(f[4]);
          const clave = `${poliza}|${ramo}|${fechaRen?.toISOString() ?? ""}|${fechaCan?.toISOString() ?? ""}|${texto(f[7]) ?? ""}|${numero(f[12])}`;
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
            tipoNegocio: texto(f[6])?.toUpperCase() ?? null,
            asegurado: texto(f[7]),
            ccNit: texto(f[8]),
            placa: texto(f[9]),
            asesor: texto(f[10]),
            aseguradora: texto(f[11]),
            primaNeta: numero(f[12]),
            primaTotal: numero(f[13]),
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
      const errorEnc = verificarEncabezado(
        ws,
        1,
        [
          { col: 0, nombre: "PÓLIZA" },
          { col: 2, nombre: "VENCIMIENTO" },
          { col: 6, nombre: "PRIMA NETA" },
        ],
        "BASE 2025"
      );
      if (errorEnc) {
        res.errores.push(errorEnc);
      } else {
        const vistos = new Set<string>();
        const filas = filasDesde(ws, 2);
        filas.forEach((f, i) => {
          const filaExcel = i + 2;
          // 0 PÓLIZA · 1 RAMO · 2 VENCIMIENTO · 3 MES · 4 TIPO NEGOCIO ·
          // 5 ASEGURADO · 6 PRIMA NETA · 7 PRIMA TOTAL
          let poliza = texto(f[0]);
          const ramo = texto(f[1]);
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
          const vencimiento = fecha(f[2]);
          const clave = `${poliza}|${ramo}|${vencimiento?.toISOString() ?? ""}|${texto(f[5]) ?? ""}|${numero(f[6])}`;
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
            mes: mesDeFecha(vencimiento) ?? texto(f[3])?.toUpperCase() ?? null,
            tipoNegocio: texto(f[4])?.toUpperCase() ?? null,
            asegurado: texto(f[5]),
            primaNeta: numero(f[6]),
            primaTotal: numero(f[7]),
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
