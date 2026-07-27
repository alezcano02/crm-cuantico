import { MESES } from "./constants";
import { hoyUTC } from "./calculos";

/**
 * Armado del informe de cartera con el mismo formato que la agencia venía
 * escribiendo a mano en Word (ver "CARTERA <asesor>.docx"):
 *
 *   Cartera Vencida
 *   JULIO
 *   ASEGURADO, RAMO ASEGURADORA. Póliza: 123. Placa: ABC123. Fecha límite de
 *   pago: 13/07. Forma de pago: MENSUAL, valor: $ 3.666.600. Contacto: 300…
 *   Cuota: $301.950. OBSERVACIÓN
 *
 *   Próxima a vencer
 *   …
 *
 *   CASOS:
 *   PENDIENTES EN MORA: …
 */

export interface PolizaInforme {
  numero: string;
  ramo: string;
  asegurado: string;
  placa: string | null;
  aseguradora: string | null;
  formaPago: string | null;
  estadoPago: string | null;
  primaTotal: number;
  valorCuota: number | null;
  celular: string | null;
  correo: string | null;
  notaCartera: string | null;
  fechaMaxPago: Date | null;
  asesor1: string | null;
  asesor2: string | null;
}

export interface LineaInforme {
  texto: string;
  /** Para ordenar y para la sección de casos */
  fecha: Date;
  asegurado: string;
}

export interface GrupoMes {
  mes: string; // "JULIO"
  lineas: LineaInforme[];
}

export interface Informe {
  asesor: string | null;
  generadoEl: Date;
  vencida: GrupoMes[];
  proxima: GrupoMes[];
  casos: string[];
  totalVencida: number;
  totalProxima: number;
}

function pesos(v: number): string {
  return "$ " + new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(v);
}

function diaMes(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Construye la línea de texto de una póliza, igual que en el Word original.
 *
 * OJO con la fecha límite: la columna MENSAJE RESUMEN del Excel la arma con
 * `TEXT(DATE(1900,1,1)+O3-2,"dd/mm")`, que equivale a FECHA MÁX. PAGO menos un
 * día — es un error al convertir el número serial de Excel a fecha (el serial
 * ya ES la fecha; no hay que sumarlo a 01/01/1900). Por eso el documento de
 * Word decía "29/06" cuando la celda tenía 30/06.
 *
 * Aquí se imprime la fecha real de la celda. Si algún día se quiere volver a
 * cuadrar con los documentos viejos, hay que restar un día a propósito, no
 * "arreglar" esto.
 */
export function lineaDePoliza(p: PolizaInforme): string {
  const partes: string[] = [];
  partes.push(
    `${p.asegurado}, ${p.ramo}${p.aseguradora ? " " + p.aseguradora : ""}. Póliza: ${p.numero}.`
  );
  if (p.placa) partes.push(`Placa: ${p.placa}.`);
  if (p.fechaMaxPago) partes.push(`Fecha límite de pago: ${diaMes(p.fechaMaxPago)}.`);
  partes.push(
    `Forma de pago: ${p.formaPago ?? ""}, valor: ${pesos(p.primaTotal)}.`
  );
  partes.push(`Contacto: ${p.celular ?? ""}.`);
  if (p.valorCuota != null && p.valorCuota > 0) {
    partes.push(`Cuota: ${pesos(p.valorCuota)}.`);
  }
  if (p.notaCartera) partes.push(p.notaCartera.toUpperCase());
  return partes.join(" ");
}

function agrupar(polizas: PolizaInforme[]): GrupoMes[] {
  const mapa = new Map<number, LineaInforme[]>();
  for (const p of polizas) {
    if (!p.fechaMaxPago) continue;
    const m = p.fechaMaxPago.getUTCMonth();
    const lista = mapa.get(m) ?? [];
    lista.push({
      texto: lineaDePoliza(p),
      fecha: p.fechaMaxPago,
      asegurado: p.asegurado,
    });
    mapa.set(m, lista);
  }
  return Array.from(mapa.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([m, lineas]) => ({
      mes: MESES[m],
      lineas: lineas.sort((a, b) => a.fecha.getTime() - b.fecha.getTime()),
    }));
}

export function construirInforme(
  polizas: PolizaInforme[],
  opciones: { asesor?: string | null; hoy?: Date } = {}
): Informe {
  const hoy = opciones.hoy ?? hoyUTC();
  const asesor = opciones.asesor?.trim() || null;

  const normalizar = (v: string) => v.trim().replace(/\s+/g, " ").toUpperCase();

  let base = polizas.filter(
    (p) => (p.estadoPago ?? "").toUpperCase() !== "OK PAGO" && p.fechaMaxPago != null
  );
  if (asesor) {
    const a = normalizar(asesor);
    base = base.filter(
      (p) =>
        (p.asesor1 && normalizar(p.asesor1) === a) ||
        (p.asesor2 && normalizar(p.asesor2) === a)
    );
  }

  const vencidas = base.filter((p) => p.fechaMaxPago! < hoy);
  const proximas = base.filter((p) => p.fechaMaxPago! >= hoy);

  // "CASOS" replica el resumen que se escribía al final del documento.
  const casos: string[] = [];
  const ordenadasVencidas = [...vencidas].sort(
    (a, b) => a.fechaMaxPago!.getTime() - b.fechaMaxPago!.getTime()
  );
  if (ordenadasVencidas.length > 0) {
    const urgente = ordenadasVencidas[0];
    casos.push(`URGENTES: ${urgente.asegurado} (${diaMes(urgente.fechaMaxPago!)})`);
    casos.push(
      "PENDIENTES EN MORA: " +
        ordenadasVencidas
          .map((p) => `${p.asegurado} (${diaMes(p.fechaMaxPago!)})`)
          .join(", ")
    );
  }
  const conNota = base.filter((p) => p.notaCartera);
  for (const p of conNota) {
    casos.push(`${p.asegurado}: ${p.notaCartera!.toUpperCase()}`);
  }

  return {
    asesor,
    generadoEl: hoy,
    vencida: agrupar(vencidas),
    proxima: agrupar(proximas),
    casos,
    totalVencida: vencidas.reduce((s, p) => s + p.primaTotal, 0),
    totalProxima: proximas.reduce((s, p) => s + p.primaTotal, 0),
  };
}
