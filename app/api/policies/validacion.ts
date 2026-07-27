import { mesDeFecha } from "@/lib/calculos";

export class ErrorValidacion extends Error {}

function texto(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s === "" ? null : s;
}

function numero(v: unknown): number {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[$.\s]/g, "").replace(",", "."));
    if (isFinite(n)) return n;
  }
  return 0;
}

/** Acepta "YYYY-MM-DD" (input type=date) o ISO completo; normaliza a medianoche UTC. */
function fecha(v: unknown): Date | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) throw new ErrorValidacion(`Fecha inválida: "${v}". Use el formato AAAA-MM-DD.`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (isNaN(d.getTime())) throw new ErrorValidacion(`Fecha inválida: "${v}".`);
  return d;
}

/**
 * Convierte el cuerpo JSON del formulario en datos Prisma para Policy.
 * MES VENCIMIENTO se recalcula siempre desde la fecha de vencimiento,
 * igual que en la importación.
 */
export function datosPolizaDesdeBody(
  body: unknown,
  opciones: { requerirObligatorios: boolean }
) {
  if (typeof body !== "object" || body === null) {
    throw new ErrorValidacion("Cuerpo inválido.");
  }
  const b = body as Record<string, unknown>;

  const numeroPoliza = texto(b.numero);
  const ramo = texto(b.ramo);
  const asegurado = texto(b.asegurado);
  if (opciones.requerirObligatorios && (!numeroPoliza || !ramo || !asegurado)) {
    throw new ErrorValidacion("PÓLIZA, RAMO y ASEGURADO son obligatorios.");
  }

  const vencimiento = fecha(b.vencimiento);

  return {
    numero: numeroPoliza ?? "S/N",
    ramo: ramo ?? "",
    asegurado: asegurado ?? "",
    ccNit: texto(b.ccNit),
    placa: texto(b.placa),
    aseguradora: texto(b.aseguradora),
    tipoNegocio: texto(b.tipoNegocio)?.toUpperCase() ?? null,
    asesor1: texto(b.asesor1),
    asesor2: texto(b.asesor2),
    primaNeta: numero(b.primaNeta),
    primaTotal: numero(b.primaTotal),
    formaPago: texto(b.formaPago),
    fechaPago: fecha(b.fechaPago),
    fechaMaxPago: fecha(b.fechaMaxPago),
    estadoPago: texto(b.estadoPago)?.toUpperCase() ?? null,
    valorCuota: b.valorCuota === "" || b.valorCuota == null ? null : numero(b.valorCuota),
    notaCartera: texto(b.notaCartera),
    vencimiento,
    mesVencimiento: mesDeFecha(vencimiento),
    fechaNacimiento: fecha(b.fechaNacimiento),
    correo: texto(b.correo),
    celular: texto(b.celular),
  };
}
