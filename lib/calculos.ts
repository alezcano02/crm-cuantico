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
  /** Necesario para agrupar los recibos de una misma póliza colectiva. */
  numero?: string;
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
  /** Para consolidar los recibos de una misma colectiva. */
  numero?: string | null;
  ramo: string;
  tipoNegocio?: string | null;
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
// Anexos que no se renuevan por sí mismos (prórrogas e incrementos)
// ---------------------------------------------------------------------------

/**
 * Una prórroga es la extensión temporal de una póliza que ya existe, mientras
 * se cierra la renovación de fondo. Un incremento es un ajuste —de valor
 * asegurado o de prima— sobre una póliza que ya existe, en mitad de su
 * vigencia. Los dos se usan sobre todo en copropiedades, y los dos comparten
 * el mismo problema práctico: no son una renovación, son un anexo a la
 * póliza de base.
 *
 * NO SE RENUEVAN POR SÍ MISMOS, y ahí estaba el problema: al vencer su
 * período —a veces corto— aparecían en «pendientes de renovar» junto a las
 * renovaciones de verdad, ensuciando la lista con trabajo que no existe. Pero
 * su prima SÍ es producción del año y SÍ entra en la base de renovación del
 * siguiente, así que sacarlos de la cartera tampoco valía.
 *
 * La solución es tratarlos como lo que son: una póliza más de la cartera, que
 * suma en todo, pero que no se cuenta como pendiente de renovar.
 *
 * Se reconocen por la columna OBSERVACION del informe, que es donde el área
 * técnica los marca. Es texto libre, así que se acepta con y sin tilde y
 * rodeado de más texto («PRORROGA 3 MESES»).
 */
export type TipoAnexo = "PRORROGA" | "INCREMENTO";

const PATRONES_ANEXO: [RegExp, TipoAnexo][] = [
  [/pr[oó]rroga/i, "PRORROGA"],
  [/incremento/i, "INCREMENTO"],
];

/** Cuál de los dos es, o null si la observación no marca ninguno. */
export function tipoAnexo(observacion: string | null | undefined): TipoAnexo | null {
  if (!observacion) return null;
  const hallado = PATRONES_ANEXO.find(([re]) => re.test(observacion));
  return hallado ? hallado[1] : null;
}

export function esAnexo(observacion: string | null | undefined): boolean {
  return tipoAnexo(observacion) != null;
}

/**
 * Fragmento de Prisma para dejar prórrogas e incrementos fuera de una
 * consulta.
 *
 * `contains` es literal, así que hay que preguntar por las dos grafías de
 * prórroga: en la base conviven «PRORROGA» y «PRÓRROGA» según quién
 * escribiera la fila. «incremento» no lleva tilde en ninguna variante vista.
 *
 * OJO CON EL NULL. La rama `observacion: null` no es adorno: en SQL
 * `NOT (NULL LIKE '%rorrog%')` no vale `true`, vale NULL, y la fila se cae de
 * la consulta. Sin ella este filtro descartaba TODAS las pólizas sin
 * observación —la inmensa mayoría— y el panel pasó de 22 vencidas a 2.
 */
export const SIN_ANEXOS = {
  OR: [
    { observacion: null },
    {
      NOT: {
        OR: [
          { observacion: { contains: "rorrog", mode: "insensitive" as const } },
          { observacion: { contains: "rórrog", mode: "insensitive" as const } },
          { observacion: { contains: "incremento", mode: "insensitive" as const } },
        ],
      },
    },
  ],
};

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

/**
 * Ramos cuyas pólizas son de empresa y se gestionan por amparado.
 * Duplicado a propósito de lib/colectivas.ts: este archivo no importa nada,
 * para que el cálculo no arrastre dependencias.
 */
// Se aceptan tanto los nombres del informe como los del mapa de colectivas
// («Colectiva Autos», «Colectiva Salud»…). Duplicado a propósito de
// lib/colectivas.ts: este archivo no importa nada, para que el cálculo no
// arrastre dependencias.
function esColectivo(ramo: string): boolean {
  const r = ramo.trim().toUpperCase();
  return r === "COLECTIVA" || r === "VIDA GRUPO" || r.startsWith("COLECTIVA");
}

/**
 * Deja UN SOLO RECIBO por póliza colectiva.
 *
 * El informe trae varias filas por colectiva: el recibo principal —la
 * renovación o la emisión del año— y uno o más recibos de INCLUSIÓN, que son
 * las personas o vehículos que entraron durante la vigencia. En el informe de
 * producción eso hace que una misma póliza aparezca dos y tres veces.
 *
 * Las inclusiones no desaparecen: viven en el módulo de colectivas, que es
 * donde se les hace seguimiento amparado por amparado. Aquí solo se decide
 * cuál de los recibos representa a la póliza:
 *
 *  1. Manda el que NO es una inclusión (RENOVACION antes que NUEVO).
 *  2. Si empatan, el de mayor prima, que es el recibo principal.
 *
 * El desempate por prima también resuelve los duplicados de verdad —misma
 * póliza, misma prima, misma fecha, cargada dos veces con distinta forma de
 * pago—, que si no se contarían dos veces.
 */
/** Lo mínimo que hace falta para decidir qué recibo representa a la póliza. */
interface FilaConsolidable {
  numero?: string | null;
  ramo: string;
  tipoNegocio?: string | null;
  primaNeta: number;
}

export function unRecibopPorColectiva<T extends FilaConsolidable>(polizas: T[]): T[] {
  const principal = new Map<string, T>();
  const salida: T[] = [];

  for (const p of polizas) {
    if (!p.numero || !esColectivo(p.ramo)) {
      salida.push(p);
      continue;
    }
    const llave = `${p.numero}|${p.ramo.trim().toUpperCase()}`;
    const previo = principal.get(llave);
    if (!previo) {
      principal.set(llave, p);
      continue;
    }
    principal.set(llave, mandaSobre(p, previo) ? p : previo);
  }

  return [...salida, ...principal.values()];
}

/** ¿`a` representa mejor a la póliza que `b`? Ver `unRecibopPorColectiva`. */
function mandaSobre(a: FilaConsolidable, b: FilaConsolidable): boolean {
  const inclusionA = normalizarTipo(a.tipoNegocio ?? null) === "NUEVO";
  const inclusionB = normalizarTipo(b.tipoNegocio ?? null) === "NUEVO";
  if (inclusionA !== inclusionB) return !inclusionA;
  return (a.primaNeta || 0) > (b.primaNeta || 0);
}

/**
 * Pólizas con que se mide la producción de un año.
 *
 * Si hay foto de ese año, manda la foto: es la cartera tal como estaba al
 * cerrarlo, antes de que las renovaciones se llevaran los vencimientos al año
 * siguiente. Si no la hay —el año en curso y los futuros— se mide sobre la
 * cartera viva, que es lo correcto mientras el año no haya terminado.
 */
export function polizasDeAnio(datos: Datos, anio: number): PolizaRow[] {
  // Un solo recibo por colectiva, aquí y no en cada llamador: así ninguna
  // pantalla de producción puede olvidarse de hacerlo y contar de más.
  return unRecibopPorColectiva(datos.fotos?.get(anio) ?? datos.polizas);
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
  // Mismo criterio que en la producción: un recibo por colectiva. Si la base
  // contara los ocho recibos de una flota y la producción solo uno, la meta
  // saldría de comparar cosas distintas y sería inalcanzable por definición.
  for (const h of unRecibopPorColectiva(historicas)) {
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
  /**
   * Fotos de años ya cerrados, por año de producción. Ver el modelo
   * `FotoPoliza`: sin ellas, la producción de un año pasado se desvanece a
   * medida que sus pólizas se renuevan.
   */
  fotos?: Map<number, PolizaRow[]>;
}

/**
 * Primer año que el CRM puede calcular.
 *
 * No es una preferencia: es el primero cuya base para renovar existe. La base
 * de un año sale de la producción del anterior, y de 2025 no hay cartera sino
 * la hoja BASE 2025 (tabla `HistoricalPolicy2025`). Hacia atrás no hay nada
 * con qué comparar.
 *
 * De 2027 en adelante la cadena se sostiene sola —cada año se apoya en la
 * producción real del anterior— así que esta constante no vuelve a moverse
 * aunque pasen los años.
 */
export const PRIMER_ANIO = 2026;

/**
 * BASE PARA RENOVAR del año N:
 *  - N = PRIMER_ANIO → hoja BASE 2025 agrupada por su columna MES.
 *  - N > PRIMER_ANIO → producción real del año N−1 (pólizas con vencimiento
 *    en N).
 */
export function baseParaAnio(datos: Datos, anio: number): MatrizRamoMes {
  if (anio <= PRIMER_ANIO) return baseHistorica(datos.historicas2025);
  return produccionAnio(polizasDeAnio(datos, anio - 1), anio - 1);
}

export function calcularSeguimiento(datos: Datos, anio: number): Seguimiento {
  const base = baseParaAnio(datos, anio);
  // Un año ya cerrado se mide contra su foto, no contra la cartera de hoy.
  const fuente = polizasDeAnio(datos, anio);
  const real = produccionAnio(fuente, anio);
  const nuevos = produccionAnio(fuente, anio, (t) => !!t && TIPOS_NUEVO.includes(t));
  const renov = produccionAnio(fuente, anio, (t) => t === TIPO_RENOVACION);
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
