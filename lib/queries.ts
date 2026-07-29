import { prisma } from "./prisma";
import { pareceEmpresa, proximoCumpleanos } from "./cumpleanos";
import {
  calcularSeguimiento,
  hoyUTC,
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

/**
 * Indicadores operativos para el panel "requiere atención" del dashboard:
 * lo que un asesor debe mirar hoy.
 */
export async function resumenOperativo() {
  const hoy = hoyUTC();
  const en30 = new Date(hoy.getTime() + 30 * 86400000);
  const inicioMes = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
  const inicioMesSiguiente = new Date(
    Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, 1)
  );

  const [vencidas, sinGestionar, proximas, mora, canceladasMes, primaMora] =
    await Promise.all([
      prisma.policy.count({ where: { vencimiento: { lt: hoy } } }),
      prisma.policy.count({ where: { vencimiento: { lt: hoy }, gestionada: false } }),
      prisma.policy.count({ where: { vencimiento: { gte: hoy, lte: en30 } } }),
      prisma.policy.count({
        where: { estadoPago: "PENDIENTE", fechaMaxPago: { lt: hoy } },
      }),
      prisma.cancellation.count({
        where: { fechaCancelacion: { gte: inicioMes, lt: inicioMesSiguiente } },
      }),
      prisma.policy.aggregate({
        _sum: { primaTotal: true },
        where: { estadoPago: "PENDIENTE", fechaMaxPago: { lt: hoy } },
      }),
    ]);

  // Cumpleaños de los próximos 7 días (se compara día y mes, no el año).
  let cumpleSemana = 0;
  try {
    const conFecha = await prisma.policy.findMany({
      where: { fechaNacimiento: { not: null } },
      select: { asegurado: true, fechaNacimiento: true },
    });
    const vistos = new Set<string>();
    for (const p of conFecha) {
      if (!p.fechaNacimiento) continue;
      const clave = p.asegurado.trim().toUpperCase();
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      const prox = proximoCumpleanos(p.fechaNacimiento, hoy);
      const dias = Math.round((prox.getTime() - hoy.getTime()) / 86400000);
      if (dias <= 7 && !pareceEmpresa(p.asegurado)) cumpleSemana++;
    }
  } catch {
    cumpleSemana = 0;
  }

  return {
    vencidas,
    sinGestionar,
    proximas,
    mora,
    canceladasMes,
    cumpleSemana,
    primaMora: primaMora._sum.primaTotal ?? 0,
  };
}

/**
 * Producción y cartera agrupadas por asesor.
 *
 * En el archivo original ASESOR 1 suele ser el canal/oficina (CUANTICO,
 * MAGENTA…) y ASESOR 2 la persona que atiende, pero no siempre: por eso el
 * campo de agrupación se elige desde la pantalla en vez de asumirlo aquí.
 */
export async function produccionPorAsesor(anio: number, campo: "asesor1" | "asesor2") {
  const hoy = hoyUTC();
  const polizas = await prisma.policy.findMany({
    select: {
      asesor1: true,
      asesor2: true,
      primaNeta: true,
      primaTotal: true,
      vencimiento: true,
      estadoPago: true,
      fechaMaxPago: true,
    },
  });
  const cancelaciones = await prisma.cancellation.findMany({
    select: { asesor: true, primaNeta: true, fechaCancelacion: true },
  });

  type Fila = {
    asesor: string;
    polizas: number;
    produccion: number; // prima neta del ciclo (vencimiento en anio+1)
    cartera: number; // prima neta total administrada
    vencidas: number;
    mora: number;
    canceladas: number;
    primaCancelada: number;
  };
  const mapa = new Map<string, Fila>();
  const obtener = (nombre: string): Fila => {
    let f = mapa.get(nombre);
    if (!f) {
      f = {
        asesor: nombre,
        polizas: 0,
        produccion: 0,
        cartera: 0,
        vencidas: 0,
        mora: 0,
        canceladas: 0,
        primaCancelada: 0,
      };
      mapa.set(nombre, f);
    }
    return f;
  };

  for (const p of polizas) {
    const nombre = (p[campo] ?? "").trim().replace(/\s+/g, " ");
    if (!nombre) continue;
    const f = obtener(nombre);
    f.polizas++;
    f.cartera += p.primaNeta || 0;
    if (p.vencimiento && p.vencimiento.getUTCFullYear() === anio + 1) {
      f.produccion += p.primaNeta || 0;
    }
    if (p.vencimiento && p.vencimiento < hoy) f.vencidas++;
    if (p.estadoPago === "PENDIENTE" && p.fechaMaxPago && p.fechaMaxPago < hoy) f.mora++;
  }

  // Las cancelaciones solo guardan un asesor; se cruzan por nombre.
  for (const c of cancelaciones) {
    const nombre = (c.asesor ?? "").trim().replace(/\s+/g, " ");
    if (!nombre || !c.fechaCancelacion) continue;
    if (c.fechaCancelacion.getUTCFullYear() !== anio) continue;
    const f = mapa.get(nombre);
    if (!f) continue;
    f.canceladas++;
    f.primaCancelada += c.primaNeta || 0;
  }

  return Array.from(mapa.values()).sort((a, b) => b.produccion - a.produccion);
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
