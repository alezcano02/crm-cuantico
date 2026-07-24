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
      select: {
        ramo: true,
        tipoNegocio: true,
        primaNeta: true,
        vencimiento: true,
        aseguradora: true,
      },
    }),
    prisma.cancellation.findMany({
      select: {
        ramo: true,
        primaNeta: true,
        fechaRenovacion: true,
        fechaCancelacion: true,
        aseguradora: true,
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

/**
 * Años disponibles para el selector. Siempre incluye 2026, 2027 y el año en
 * curso + el siguiente, más todos los que se deriven de los vencimientos
 * cargados (producción del año N = vencimientos en N+1). Así el informe queda
 * disponible para 2027 aunque todavía no existan vencimientos en 2028.
 */
export async function aniosDisponibles(): Promise<number[]> {
  const polizas = await prisma.policy.findMany({
    select: { vencimiento: true },
    where: { vencimiento: { not: null } },
  });
  const anioActual = new Date().getUTCFullYear();
  const anios = new Set<number>([2026, 2027, anioActual, anioActual + 1]);
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

/** Listas para los formularios de edición: valores de LISTAS unidos con los
 *  que existan en la cartera (el archivo real trae valores fuera de lista). */
export async function listasParaFormularios() {
  const [listas, polizas] = await Promise.all([
    prisma.listValue.findMany({ orderBy: { valor: "asc" } }),
    prisma.policy.findMany({
      select: { ramo: true, aseguradora: true, asesor1: true, asesor2: true, formaPago: true },
    }),
  ]);
  const de = (tipo: string) => listas.filter((l) => l.tipo === tipo).map((l) => l.valor);
  const unir = (base: string[], extras: (string | null)[]) =>
    Array.from(new Set([...base, ...extras.filter((v): v is string => !!v).map((v) => v.trim())]))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "es"));
  return {
    ramos: unir(de("RAMO"), polizas.map((p) => p.ramo)),
    tiposNegocio: de("TIPO_NEGOCIO"),
    estadosPago: de("ESTADO_PAGO"),
    formasPago: unir(de("FORMA_PAGO"), polizas.map((p) => p.formaPago)),
    aseguradoras: unir(de("ASEGURADORA"), polizas.map((p) => p.aseguradora)),
    asesores: unir(de("ASESOR"), polizas.flatMap((p) => [p.asesor1, p.asesor2])),
  };
}

export type ListasFormulario = Awaited<ReturnType<typeof listasParaFormularios>>;
