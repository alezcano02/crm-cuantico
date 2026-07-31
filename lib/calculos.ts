import {
  FACTOR_META,
  MESES,
  TIPOS_NUEVO,
  TIPO_RENOVACION,
  CUMPLIMIENTO_VERDE,
  CUMPLIMIENTO_AMARILLO,
} from "./constants";

// ---------------------------------------------------------------------------
// Tipos de entrada (subconjuntos planos de los modelos Prisma, para que todo
// el motor de cálculo sea puro y verificable contra el Excel original).
// ---------------------------------------------------------------------------

export interface PolizaRow {
  ramo: string;
  tipoNegocio: string | null;
  primaNeta: number;
  vencimiento: Date | null;
  aseguradora?: string | null;
}

export interface CancelacionRow {
  ramo: string;
  primaNeta: number;
  fechaRenovacion: Date | null;
  fechaCancelacion: Date | null;
  aseguradora?: string | null;
}

export interface HistoricaRow {
  ramo: string;
  primaNeta: number;
  mes: string | null;
  vencimiento: Date | null;
}

// ---------------------------------------------------------------------------
// Utilidades de fechas. Todas las fechas se guardan normalizadas a medianoche
// UTC del día calendario, por lo que aquí se usan siempre los getters UTC.
// ---------------------------------------------------------------------------

export function hoyUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** DÍAS AL VENCE = VENCIMIENTO − HOY (negativo ⇒ vencida, pendiente de renovar) */
export function diasAlVence(vencimiento: Date | null, hoy: Date = hoyUTC()): number | null {
  if (!vencimiento) return null;
  return Math.round((vencimiento.getTime() - hoy.getTime()) / 86400000);
}

export function edadDesde(fechaNacimiento: Date | null, hoy: Date = hoyUTC()): number | null {
  if (!fechaNacimiento) return null;
  let edad = hoy.getUTCFullYear() - fechaNacimiento.getUTCFullYear();
  const m = hoy.getUTCMonth() - fechaNacimiento.getUTCMonth();
  if (m < 0 || (m === 0 && hoy.getUTCDate() < fechaNacimiento.getUTCDate())) edad--;
  return edad;
}

export function mesDeFecha(d: Date | null): string | null {
  if (!d) return null;
  return MESES[d.getUTCMonth()];
}

export function indiceMes(mes: string | null | undefined): number {
  if (!mes) return -1;
  return MESES.indexOf(mes.trim().toUpperCase() as (typeof MESES)[number]);
}

// ---------------------------------------------------------------------------
// Semáforo de vencimientos
// ---------------------------------------------------------------------------

export type Semaforo = "ROJO" | "NARANJA" | "AMARILLO" | "VERDE";

/**
 * ROJO = vencida (días negativos) · NARANJA = vence en 0–15 días ·
 * AMARILLO = vence en 15–30 días · VERDE = vence después de 30 días.
 */
export function semaforoVencimiento(dias: number | null): Semaforo | null {
  if (dias == null) return null;
  if (dias < 0) return "ROJO";
  if (dias <= 15) return "NARANJA";
  if (dias <= 30) return "AMARILLO";
  return "VERDE";
}

// ---------------------------------------------------------------------------
// Estado de cartera (cobranza) — basado en la fecha máxima de pago y el estado
// de pago. Es independiente del semáforo de vencimiento (que mira la vigencia).
// ---------------------------------------------------------------------------

export type EstadoCartera =
  | "PAGADA"
  | "EN_MORA" // pendiente y ya pasó la fecha máxima de pago
  | "POR_COBRAR" // pendiente, vence el pago en 0–15 días
  | "PENDIENTE" // pendiente, con más de 15 días de plazo
  | "SIN_FECHA" // pendiente sin fecha máxima de pago
  | "SIN_ESTADO"; // no se registró estado de pago

export interface EstadoCarteraResultado {
  estado: EstadoCartera;
  /** Días de mora (positivo) cuando está EN_MORA; días al vencimiento del pago
   *  (positivo) cuando está POR_COBRAR / PENDIENTE; null en el resto. */
  dias: number | null;
}

export function estadoCartera(
  estadoPago: string | null,
  fechaMaxPago: Date | null,
  hoy: Date = hoyUTC()
): EstadoCarteraResultado {
  const estado = estadoPago?.trim().toUpperCase() ?? null;
  if (estado === "OK PAGO") return { estado: "PAGADA", dias: null };
  if (estado !== "PENDIENTE") return { estado: "SIN_ESTADO", dias: null };
  if (!fechaMaxPago) return { estado: "SIN_FECHA", dias: null };
  const dias = Math.round((fechaMaxPago.getTime() - hoy.getTime()) / 86400000);
  if (dias < 0) return { estado: "EN_MORA", dias: -dias };
  if (dias <= 15) return { estado: "POR_COBRAR", dias };
  return { estado: "PENDIENTE", dias };
}

export type NivelCumplimiento = "VERDE" | "AMARILLO" | "ROJO";

export function nivelCumplimiento(pct: number | null): NivelCumplimiento | null {
  if (pct == null) return null;
  if (pct >= CUMPLIMIENTO_VERDE) return "VERDE";
  if (pct >= CUMPLIMIENTO_AMARILLO) return "AMARILLO";
  return "ROJO";
}

// ---------------------------------------------------------------------------
// A) PRODUCCIÓN POR RAMO Y MES
//    Producción del año N = prima neta de pólizas cuyo VENCIMIENTO cae en N+1,
//    agrupada por RAMO y por el MES de ese vencimiento.
// ---------------------------------------------------------------------------

export type MatrizRamoMes = Map<string, number[]>; // ramo -> [12 meses]

function sumar(matriz: MatrizRamoMes, ramo: string, mes: number, valor: number) {
  if (mes < 0 || mes > 11 || !ramo) return;
  let fila = matriz.get(ramo);
  if (!fila) {
    fila = new Array(12).fill(0);
    matriz.set(ramo, fila);
  }
  fila[mes] += valor;
}

export function produccionAnio(
  polizas: PolizaRow[],
  anio: number,
  filtroTipo?: (tipo: string | null) => boolean
): MatrizRamoMes {
  const matriz: MatrizRamoMes = new Map();
  for (const p of polizas) {
    if (!p.vencimiento) continue;
    if (p.vencimiento.getUTCFullYear() !== anio + 1) continue;
    if (filtroTipo && !filtroTipo(normalizarTipo(p.tipoNegocio))) continue;
    sumar(matriz, p.ramo, p.vencimiento.getUTCMonth(), p.primaNeta || 0);
  }
  return matriz;
}

function normalizarTipo(t: string | null): string | null {
  return t ? t.trim().toUpperCase() : t;
}

/** Base histórica 2025: hoja BASE 2025 agrupada por la columna MES (sin filtrar año). */
export function baseHistorica(historicas: HistoricaRow[]): MatrizRamoMes {
  const matriz: MatrizRamoMes = new Map();
  for (const h of historicas) {
    const mes = h.mes ? indiceMes(h.mes) : h.vencimiento ? h.vencimiento.getUTCMonth() : -1;
    sumar(matriz, h.ramo, mes, h.primaNeta || 0);
  }
  return matriz;
}

/**
 * Prima no causada: lo que realmente se pierde al cancelar una póliza.
 *
 * Cuando un cliente cancela a mitad de vigencia, la agencia solo devuelve la
 * parte proporcional a los días que le faltaban; lo ya transcurrido queda
 * causado. Por eso la métrica de CANCELACIONES no descuenta la prima
 * completa, sino esta porción:
 *
 *     prima no causada = prima neta × (días que faltaban / días de vigencia)
 *
 * El fin de la vigencia es la FECHA DE RENOVACIÓN (la fecha en que la póliza
 * iba a renovarse) y el inicio se toma un año antes, porque las pólizas de la
 * agencia son anuales. Así basta con registrar la fecha de cancelación para
 * que el valor salga solo.
 *
 * Ojo: esto NO aplica a PRODUCCIÓN CANCELADA, que sigue contando la prima
 * completa porque mide la producción que se deja de renovar, no el dinero
 * devuelto.
 */
export function primaNoCausada(
  primaNeta: number,
  fechaCancelacion: Date | null,
  finVigencia: Date | null
): number {
  const prima = primaNeta || 0;
  if (prima === 0) return 0;
  // Sin alguna de las dos fechas no se puede prorratear; se cuenta completa
  // para no subestimar las cancelaciones por un dato faltante.
  if (!fechaCancelacion || !finVigencia) return prima;

  const inicioVigencia = new Date(
    Date.UTC(
      finVigencia.getUTCFullYear() - 1,
      finVigencia.getUTCMonth(),
      finVigencia.getUTCDate()
    )
  );
  const diasVigencia = Math.round(
    (finVigencia.getTime() - inicioVigencia.getTime()) / 86400000
  );
  if (diasVigencia <= 0) return prima;

  const diasRestantes = Math.round(
    (finVigencia.getTime() - fechaCancelacion.getTime()) / 86400000
  );
  // Ya se había cumplido la vigencia: no hay nada que devolver.
  if (diasRestantes <= 0) return 0;
  // Se canceló antes de que empezara: se devuelve todo.
  if (diasRestantes >= diasVigencia) return prima;

  return (prima * diasRestantes) / diasVigencia;
}

/**
 * Cancelaciones agrupadas por mes de una fecha, filtrando por año de esa fecha.
 *
 * Según el campo cambia lo que se suma:
 *  · fechaRenovacion → PRODUCCIÓN CANCELADA, con la prima completa.
 *  · fechaCancelacion → CANCELACIONES, con la prima no causada (la devolución).
 */
export function cancelacionesPorMes(
  cancelaciones: CancelacionRow[],
  anio: number,
  campo: "fechaRenovacion" | "fechaCancelacion"
): MatrizRamoMes {
  const matriz: MatrizRamoMes = new Map();
  for (const c of cancelaciones) {
    const fecha = c[campo];
    if (!fecha || fecha.getUTCFullYear() !== anio) continue;
    const valor =
      campo === "fechaCancelacion"
        ? primaNoCausada(c.primaNeta, c.fechaCancelacion, c.fechaRenovacion)
        : c.primaNeta || 0;
    sumar(matriz, c.ramo, fecha.getUTCMonth(), valor);
  }
  return matriz;
}

// ---------------------------------------------------------------------------
// B) SEGUIMIENTO DE OBJETIVOS
//    META (+15%) = (BASE + PRODUCCIÓN CANCELADA del mes) × 1.15
//    PRODUCCIÓN NETA = REAL − CANCELACIONES
//    % CUMPLIMIENTO = NETA / META
//    (fórmulas verificadas contra la hoja "SEGUIMIENTO 2026" del informe)
// ---------------------------------------------------------------------------

export interface FilaSeguimiento {
  mes: string; // "ENERO" … "DICIEMBRE" | "TOTAL"
  base: number;
  meta: number;
  real: number;
  nuevos: number;
  renovaciones: number;
  produccionCancelada: number;
  cancelaciones: number;
  neta: number;
  cumplimiento: number | null; // null cuando META = 0
}

export interface Seguimiento {
  anio: number;
  consolidado: FilaSeguimiento[]; // 12 meses + TOTAL
  porRamo: Map<string, FilaSeguimiento[]>;
  ramos: string[]; // ramos con algún dato, ordenados alfabéticamente
}

interface Datos {
  polizas: PolizaRow[];
  cancelaciones: CancelacionRow[];
  historicas2025: HistoricaRow[];
}

/**
 * BASE PARA RENOVAR del año N:
 *  - N = 2026 → hoja BASE 2025 agrupada por su columna MES.
 *  - N > 2026 → producción real del año N−1 (pólizas con vencimiento en N).
 */
export function baseParaAnio(datos: Datos, anio: number): MatrizRamoMes {
  if (anio <= 2026) return baseHistorica(datos.historicas2025);
  return produccionAnio(datos.polizas, anio - 1);
}

export function calcularSeguimiento(datos: Datos, anio: number): Seguimiento {
  const base = baseParaAnio(datos, anio);
  const real = produccionAnio(datos.polizas, anio);
  const nuevos = produccionAnio(datos.polizas, anio, (t) => !!t && TIPOS_NUEVO.includes(t));
  const renov = produccionAnio(datos.polizas, anio, (t) => t === TIPO_RENOVACION);
  const prodCancelada = cancelacionesPorMes(datos.cancelaciones, anio, "fechaRenovacion");
  const cancel = cancelacionesPorMes(datos.cancelaciones, anio, "fechaCancelacion");

  const ramos = Array.from(
    new Set([
      ...base.keys(),
      ...real.keys(),
      ...prodCancelada.keys(),
      ...cancel.keys(),
    ])
  )
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "es"));

  const cero = new Array(12).fill(0);
  const filaDe = (matrices: MatrizRamoMes[], ramo: string | null, mes: number) =>
    matrices.reduce((acc, m) => {
      if (ramo) return acc + (m.get(ramo) ?? cero)[mes];
      let s = 0;
      for (const fila of m.values()) s += fila[mes];
      return acc + s;
    }, 0);

  const construir = (ramo: string | null): FilaSeguimiento[] => {
    const filas: FilaSeguimiento[] = [];
    for (let mes = 0; mes < 12; mes++) {
      const b = filaDe([base], ramo, mes);
      const pc = filaDe([prodCancelada], ramo, mes);
      const r = filaDe([real], ramo, mes);
      const c = filaDe([cancel], ramo, mes);
      const meta = (b + pc) * FACTOR_META;
      const neta = r - c;
      filas.push({
        mes: MESES[mes],
        base: b,
        meta,
        real: r,
        nuevos: filaDe([nuevos], ramo, mes),
        renovaciones: filaDe([renov], ramo, mes),
        produccionCancelada: pc,
        cancelaciones: c,
        neta,
        cumplimiento: meta > 0 ? neta / meta : null,
      });
    }
    const tot = (f: (x: FilaSeguimiento) => number) => filas.reduce((a, x) => a + f(x), 0);
    const totalMeta = tot((x) => x.meta);
    const totalNeta = tot((x) => x.neta);
    filas.push({
      mes: "TOTAL",
      base: tot((x) => x.base),
      meta: totalMeta,
      real: tot((x) => x.real),
      nuevos: tot((x) => x.nuevos),
      renovaciones: tot((x) => x.renovaciones),
      produccionCancelada: tot((x) => x.produccionCancelada),
      cancelaciones: tot((x) => x.cancelaciones),
      neta: totalNeta,
      cumplimiento: totalMeta > 0 ? totalNeta / totalMeta : null,
    });
    return filas;
  };

  const porRamo = new Map<string, FilaSeguimiento[]>();
  for (const ramo of ramos) porRamo.set(ramo, construir(ramo));

  return { anio, consolidado: construir(null), porRamo, ramos };
}

/** Prima neta por ramo del total de la cartera activa (para el dashboard). */
export function primaPorRamo(polizas: { ramo: string; primaNeta: number }[]) {
  const mapa = new Map<string, number>();
  for (const p of polizas) {
    mapa.set(p.ramo, (mapa.get(p.ramo) ?? 0) + (p.primaNeta || 0));
  }
  const total = Array.from(mapa.values()).reduce((a, b) => a + b, 0);
  return Array.from(mapa.entries())
    .map(([ramo, prima]) => ({ ramo, prima, pct: total > 0 ? prima / total : 0 }))
    .sort((a, b) => b.prima - a.prima);
}
