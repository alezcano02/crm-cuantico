export const MESES = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
] as const;

export const MESES_CORTO = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
] as const;

export type TipoLista =
  | "RAMO"
  | "TIPO_NEGOCIO"
  | "ESTADO_PAGO"
  | "FORMA_PAGO"
  | "ASEGURADORA"
  | "ASESOR";

export const TIPOS_LISTA: TipoLista[] = [
  "RAMO",
  "TIPO_NEGOCIO",
  "ESTADO_PAGO",
  "FORMA_PAGO",
  "ASEGURADORA",
  "ASESOR",
];

// Tipos de negocio que cuentan como "NUEVOS" en el seguimiento
export const TIPOS_NUEVO = ["NUEVO", "COASEGURO", "INCLUSIÓN", "INCLUSION"];
export const TIPO_RENOVACION = "RENOVACION";

// Factor de crecimiento de la meta anual
export const FACTOR_META = 1.15;

// Umbrales del semáforo de cumplimiento (% cumplimiento = neta / meta)
export const CUMPLIMIENTO_VERDE = 0.95;
export const CUMPLIMIENTO_AMARILLO = 0.7;
