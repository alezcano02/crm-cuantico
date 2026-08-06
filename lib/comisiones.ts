/**
 * Comisiones por ramo.
 *
 * QUÉ SE COMISIONA
 *
 * La comisión se gana sobre lo RECAUDADO, no sobre lo vendido: una póliza
 * emitida pero no pagada no ha producido comisión todavía. Por eso la base es
 * la prima neta de las pólizas marcadas «OK PAGO», y las «PENDIENTE» se
 * muestran aparte como comisión por causar.
 *
 * LO QUE ESTE MÓDULO NO PUEDE HACER, Y CONVIENE SABERLO
 *
 * De los pagos fraccionados solo se guarda el valor de la cuota pactada
 * (`valorCuota`) y la fecha del último pago, no cuántas cuotas se han
 * recaudado. Con 698 pólizas en cartera, `valorCuota` está registrado en 1 y
 * `fechaPago` en 2. Así que «las cuotas recaudadas» no se pueden sumar una a
 * una: no existe el dato. Lo que hay es el estado de la póliza, y de ahí sale
 * todo lo de abajo.
 *
 * Como consecuencia, una póliza fraccionada en «OK PAGO» se toma como
 * recaudada por su prima neta completa. Si en la operación «OK PAGO» sobre una
 * póliza MENSUAL quisiera decir «al día con las cuotas» y no «cobrada del
 * todo», esta cifra estaría sobreestimada, y la solución no sería tocar este
 * archivo sino registrar las cuotas recaudadas.
 */

/**
 * Porcentaje de comisión por ramo, según la guía del área comercial.
 *
 * Las claves están normalizadas (sin tildes, en mayúsculas) para que crucen
 * con el ramo tal como viene del informe: la guía dice «Zona Común» y el
 * informe trae «ZONA COMUN».
 */
const PORCENTAJES: Record<string, number> = {
  AP: 20,
  ARRENDAMIENTO: 30,
  AUTOS: 12.5,
  COLECTIVA: 12.5,
  EDUCATIVO: 20,
  HOGAR: 20,
  PYME: 15,
  "RC DECRETO": 25,
  "RC EMPRESA": 25,
  "RC PROFESIONAL": 25,
  "RC ZC": 15,
  SALUD: 12,
  VIDA: 30,
  "VIDA GRUPO": 15,
  "ZONA COMUN": 15,
};

/**
 * Quita tildes y unifica espacios, para cruzar «Zona Común» con «ZONA COMUN».
 *
 * Las vocales se sustituyen una a una en vez de usar el rango Unicode de
 * marcas diacríticas: ese rango son caracteres invisibles en el código fuente
 * y sobrevive mal a los editores. Aquí se ve lo que hace.
 */
function normalizarRamo(ramo: string): string {
  const SIN_TILDE: Record<string, string> = {
    Á: "A", É: "E", Í: "I", Ó: "O", Ú: "U", Ü: "U",
    á: "A", é: "E", í: "I", ó: "O", ú: "U", ü: "U",
  };
  return ramo
    .toUpperCase()
    .replace(/[ÁÉÍÓÚÜáéíóúü]/g, (c) => SIN_TILDE[c] ?? c)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Porcentaje que le corresponde a un ramo, o null si la guía no lo contempla.
 *
 * Devuelve null en vez de un 0 silencioso a propósito: un ramo sin tarifa es
 * algo que alguien tiene que mirar, no una comisión de cero pesos.
 */
export function porcentajeComision(ramo: string | null | undefined): number | null {
  if (!ramo) return null;
  const pct = PORCENTAJES[normalizarRamo(ramo)];
  return pct ?? null;
}

/** Todos los ramos con tarifa, para pintar la guía en pantalla. */
export function tarifario(): { ramo: string; pct: number }[] {
  return Object.entries(PORCENTAJES)
    .map(([ramo, pct]) => ({ ramo, pct }))
    .sort((a, b) => a.ramo.localeCompare(b.ramo, "es"));
}

export interface FilaComision {
  id: number;
  numero: string;
  ramo: string;
  asegurado: string;
  aseguradora: string | null;
  asesor1: string | null;
  formaPago: string | null;
  estadoPago: string | null;
  /** Prima neta de la póliza: la base sobre la que se calcula. */
  primaNeta: number;
  /** null si el ramo no está en la guía. */
  pct: number | null;
  /** primaNeta × pct, o null si no hay tarifa. */
  comision: number | null;
  /** true si está «OK PAGO»: la comisión ya se causó. */
  pagada: boolean;
  /** Período de la comisión (AAAA-MM), tomado del vencimiento. */
  mes: string | null;
  /** Año del vencimiento: el eje por el que se filtra el módulo. */
  anio: number | null;
  /** Mes en que entra la plata (AAAA-MM). Informativo. Ver `mesDeCobro`. */
  mesCobro: string | null;
  fechaMaxPago: string | null;
  vencimiento: string | null;
}

/**
 * PERÍODO DE UNA COMISIÓN: el VENCIMIENTO de la póliza, en formato AAAA-MM.
 *
 * Es el mismo eje con que el CRM cuenta la producción (seguimiento, metas,
 * dashboard), así que la comisión de un mes se puede cruzar contra la
 * producción de ese mes sin traducir nada. Y el vencimiento está en 697 de las
 * 698 pólizas, frente a 524 con fecha máxima de pago: no deja huecos.
 *
 * Ojo con lo que este mes NO es: no es cuándo entra la plata. Para eso está
 * `mesDeCobro`, que se muestra aparte.
 */
export function mesDeComision(vencimiento: Date | null): string | null {
  return vencimiento ? vencimiento.toISOString().slice(0, 7) : null;
}

/** Año al que pertenece la comisión, que es el del vencimiento. */
export function anioDeComision(vencimiento: Date | null): number | null {
  return vencimiento ? vencimiento.getUTCFullYear() : null;
}

/**
 * Mes en que la aseguradora liquida la plata, en formato AAAA-MM.
 *
 * Se liquida al MES SIGUIENTE del pago: lo recaudado en marzo se ve reflejado
 * en abril, así que no basta el mes de la fecha, hay que correrlo uno.
 *
 * La base es la FECHA MÁXIMA DE PAGO. La fecha de pago efectiva sería lo
 * correcto, pero está registrada en 2 de 698 pólizas: usarla dejaría la
 * columna vacía. La fecha máxima está en 524.
 *
 * Es dato informativo, no el eje del módulo: una póliza que vence en marzo de
 * 2026 pertenece a marzo de 2026 aunque su plata entre en mayo. Sin fecha
 * máxima de pago no hay mes de cobro, y se dice en vez de inventarlo.
 */
export function mesDeCobro(fechaMaxPago: Date | null): string | null {
  if (!fechaMaxPago) return null;
  // Diciembre se cobra en enero del año siguiente; Date lo resuelve solo al
  // pasarle mes 12.
  const siguiente = new Date(
    Date.UTC(fechaMaxPago.getUTCFullYear(), fechaMaxPago.getUTCMonth() + 1, 1)
  );
  return siguiente.toISOString().slice(0, 7);
}
