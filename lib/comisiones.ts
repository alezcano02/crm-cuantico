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
  /** En cuántas cuotas se recauda, según la forma de pago. */
  cuotas: number;
  /** Cómo se reparte la comisión en el tiempo. Ver `cronogramaComision`. */
  cronograma: CuotaComision[];
  fechaMaxPago: string | null;
  vencimiento: string | null;
  /** Inicio de vigencia (ISO), del que cuelga todo el cronograma. */
  inicioVigencia: string | null;
}

/**
 * CRONOGRAMA DE COMISIONES
 *
 * Una comisión no se cobra de golpe: se cobra a medida que la aseguradora
 * recauda. Por eso una póliza no pertenece a «un mes», sino que reparte su
 * comisión en varios, y ese reparto es lo que permite saber qué se espera
 * cobrar en los meses que vienen.
 *
 * El cronograma se calcula desde la VIGENCIA, no desde la fecha de pago
 * registrada. Suena a rodeo pero es al revés: la fecha de pago solo existe
 * cuando ya ocurrió, así que no sirve para proyectar; la vigencia se conoce
 * desde que se emite la póliza. Además está en 697 de 698 pólizas frente a
 * 524 con fecha máxima de pago.
 *
 * Las reglas, tal como funciona la operación:
 *
 *  - El inicio de vigencia es el vencimiento menos un año. El CRM no guarda la
 *    fecha de inicio, y las pólizas son anuales: es la misma convención con
 *    que se cuenta la producción (producción del año N = vencimientos de N+1).
 *  - MENSUAL va a 12 cuotas, ACUERDO DE PAGO a 3, y todo lo demás —contado,
 *    servicrédito, finesa, anual, financiada— a una sola.
 *  - Las cuotas se recaudan mes a mes empezando UN MES después del inicio de
 *    la vigencia. El pago único se recauda al inicio.
 *  - La comisión se liquida SIEMPRE al mes siguiente del recaudo. Para el pago
 *    único eso da el mes siguiente al inicio de la vigencia.
 */

/** Cuotas en que se fracciona el recaudo según la forma de pago. */
export function cuotasDeFormaPago(formaPago: string | null | undefined): number {
  const f = normalizarRamo(formaPago ?? "");
  if (f.includes("MENSUAL")) return 12;
  // «ACUERDO DE PAGO/SERVICREDITO» también son 3: manda el acuerdo.
  if (f.includes("ACUERDO DE PAGO")) return 3;
  return 1;
}

/** Inicio de vigencia: el vencimiento menos un año. */
export function inicioVigencia(vencimiento: Date | null): Date | null {
  if (!vencimiento) return null;
  return new Date(
    Date.UTC(
      vencimiento.getUTCFullYear() - 1,
      vencimiento.getUTCMonth(),
      vencimiento.getUTCDate()
    )
  );
}

export interface CuotaComision {
  /** 1..n */
  numero: number;
  /** Mes en que se recauda la cuota (AAAA-MM). */
  mesRecaudo: string;
  /** Mes en que se cobra la comisión de esa cuota (AAAA-MM). */
  mes: string;
  /** Año de `mes`: el eje por el que se filtra el módulo. */
  anio: number;
  /** Comisión que corresponde a esta cuota. */
  valor: number;
}

/** Suma meses a un AAAA-MM sin pelearse con los días ni con los diciembres. */
function mesMas(anio: number, mes0: number, suma: number): string {
  const d = new Date(Date.UTC(anio, mes0 + suma, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * Reparte la comisión de una póliza en las cuotas en que se va a recaudar.
 *
 * Devuelve lista vacía si no hay vencimiento o no hay tarifa: sin una de las
 * dos no se puede afirmar nada, y es preferible que la póliza salga marcada
 * como pendiente de revisar a que aporte una cifra inventada.
 */
export function cronogramaComision(
  vencimiento: Date | null,
  formaPago: string | null | undefined,
  comisionTotal: number | null
): CuotaComision[] {
  const inicio = inicioVigencia(vencimiento);
  if (!inicio || comisionTotal == null) return [];

  const n = cuotasDeFormaPago(formaPago);
  const anio = inicio.getUTCFullYear();
  const mes0 = inicio.getUTCMonth();
  const valor = comisionTotal / n;

  const cuotas: CuotaComision[] = [];
  for (let k = 1; k <= n; k++) {
    // Pago único: se recauda al inicio de la vigencia (desplazamiento 0).
    // Fraccionado: la cuota k se recauda k meses después del inicio.
    const desplazamiento = n === 1 ? 0 : k;
    const mesRecaudo = mesMas(anio, mes0, desplazamiento);
    const mes = mesMas(anio, mes0, desplazamiento + 1);
    cuotas.push({
      numero: k,
      mesRecaudo,
      mes,
      anio: Number(mes.slice(0, 4)),
      valor,
    });
  }
  return cuotas;
}
