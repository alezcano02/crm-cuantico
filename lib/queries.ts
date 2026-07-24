import { prisma } from "./prisma";
import {
  calcularSeguimiento,
  Seguimiento,
  CancelacionRow,
  HistoricaRow,
  PolizaRow,
} from "./calculos";

export async function datosSeguimiento(): Promise<{
  polizas: PolizaRow[];
  cancelaciones: CancelacionRow[];
  historicas2025: HistoricaRow[];
}> {
  const [polizas, cancelaciones, historicas2025] = await Promise.all([
    prisma.policy.findMany({
      select: { ramo: true, tipoNegocio: true, primaNeta: true, vencimiento: true },
    }),
    prisma.cancellation.findMany({
      select: {
        ramo: true,
        primaNeta: true,
        fechaRenovacion: true,
        fechaCancelacion: true,
      },
    }),
    prisma.historicalPolicy2025.findMany({
      select: { ramo: true, primaNeta: true, mes: true, vencimiento: true },
    }),
  ]);
  return { polizas, cancelaciones, historicas2025 };
}

export async function seguimientoAnio(anio: number): Promise<Seguimiento> {
  const datos = await datosSeguimiento();
  return calcularSeguimiento(datos, anio);
}

/** Años disponibles para el selector: 2026 y todos los que se deriven de los
 *  vencimientos cargados (producción del año N = vencimientos en N+1). */
export async function aniosDisponibles(): Promise<number[]> {
  const polizas = await prisma.policy.findMany({
    select: { vencimiento: true },
    where: { vencimiento: { not: null } },
  });
  const anios = new Set<number>([2026]);
  for (const p of polizas) {
    if (p.vencimiento) anios.add(p.vencimiento.getUTCFullYear() - 1);
  }
  return Array.from(anios)
    .filter((a) => a >= 2026)
    .sort();
}

export async function listaValores(tipo: string): Promise<string[]> {
  const filas = await prisma.listValue.findMany({
    where: { tipo },
    orderBy: { valor: "asc" },
  });
  return filas.map((f) => f.valor);
}
