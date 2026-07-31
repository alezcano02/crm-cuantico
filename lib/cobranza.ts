/**
 * Qué campos de una póliza son "cobranza", es decir, los que el CRM administra
 * y el Excel no debe pisar al reimportarse.
 *
 * El informe se actualiza cada tanto, pero el recaudo se anota en la aplicación
 * el día que entra el pago. Si la reimportación sobrescribiera estos campos, un
 * pago registrado el martes desaparecería al volver a cargar un archivo
 * exportado el lunes. Por eso manda el CRM: cuando una póliza tiene
 * `cobranzaEditadaEn`, la importación conserva estos valores y toma del Excel
 * todo lo demás (ramo, prima, vencimiento, asesor…).
 *
 * Las pólizas que nunca se han tocado en la aplicación siguen tomando la
 * cobranza del informe, para que cargar un archivo nuevo sirva de algo.
 */
export const CAMPOS_COBRANZA = [
  "estadoPago",
  "fechaPago",
  "fechaMaxPago",
  "valorCuota",
  "notaCartera",
] as const;

export type CampoCobranza = (typeof CAMPOS_COBRANZA)[number];
