/**
 * Cotizaciones que todavía no son póliza.
 *
 * El equipo lleva esto en un Excel donde la columna ESTADO es texto libre:
 * «ESCOGIERON INTERMEIDARIO ANTERIOR», «PENDIENTE DE INFORMACION PARA
 * COTIZAR.», «cambiaron administracion y nos scaron». Ese texto es lo que de
 * verdad explica el caso y se guarda tal cual, con sus erratas incluidas: es
 * la nota de quien atendió, no un campo de sistema.
 *
 * Pero con texto libre no se puede contar nada, así que además se reduce a una
 * SITUACIÓN de tres valores. Las dos cosas conviven: el texto para leer, la
 * situación para filtrar y sumar.
 */

export const SITUACIONES = ["PENDIENTE", "PERDIDA", "GANADA"] as const;
export type Situacion = (typeof SITUACIONES)[number];

export const ETIQUETA_SITUACION: Record<Situacion, string> = {
  PENDIENTE: "Pendiente",
  PERDIDA: "No conseguida",
  GANADA: "Ganada",
};

/**
 * Reduce el texto libre a una de las tres situaciones.
 *
 * El orden importa: se pregunta primero por lo que cierra el caso (perdida,
 * ganada) y solo al final se asume pendiente. «PENDIENTE DE SI CONTINUAN CON
 * LA RENOVACION POR MAPFRE» contiene «pendiente» y sigue abierto; «ESCOGIERON
 * INTERMEDIARIO ANTERIOR» no contiene «perdida» y sin embargo está perdido.
 *
 * Las erratas del archivo están contempladas a propósito —«INTERMEIDARIO»,
 * «IENTERMEDIARIO», «scaron»— porque el objetivo es leer lo que la gente
 * escribió, no lo que debería haber escrito.
 */
const PERDIDA: RegExp[] = [
  /p[eé]rdida|perdida/i,
  /escogieron\s+interme/i,
  /cambio\s+de\s+i?enterme|cambio\s+de\s+interme/i,
  /no\s+llegamos\s+a\s+tiempo/i,
  /nos\s+s[ac]aron/i,
  /desist/i,
  /no\s+se\s+consigui/i,
];
const GANADA: RegExp[] = [/ganad/i, /expedid/i, /emitid/i, /se\s+consigui/i];

export function situacionDeTexto(texto: string | null | undefined): Situacion {
  const t = (texto ?? "").trim();
  if (!t) return "PENDIENTE";
  if (GANADA.some((re) => re.test(t))) return "GANADA";
  if (PERDIDA.some((re) => re.test(t))) return "PERDIDA";
  return "PENDIENTE";
}

export interface ProspectoVista {
  id: number;
  nombre: string;
  fechaInicio: string | null;
  administrador: string | null;
  compania: string | null;
  estado: string | null;
  situacion: string;
  asesor: string | null;
  nota: string | null;
  polizaNumero: string | null;
  /** Días hasta el inicio de vigencia; negativo si ya pasó. */
  dias: number | null;
}

/**
 * Días que faltan para que arranque la vigencia cotizada.
 *
 * Es el reloj del prospecto: pasada esa fecha la oportunidad se pierde sola
 * porque el cliente ya renovó con otro. Por eso la lista se ordena por aquí y
 * no por fecha de creación.
 */
export function diasParaInicio(fechaInicio: Date | null, hoy: Date): number | null {
  if (!fechaInicio) return null;
  return Math.round((fechaInicio.getTime() - hoy.getTime()) / 86400000);
}
