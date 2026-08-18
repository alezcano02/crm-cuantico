import { cache } from "react";
import { prisma } from "./prisma";
import { cachearCartera } from "./cache";
import { pareceEmpresa, proximoCumpleanos } from "./cumpleanos";
import {
  PRIMER_ANIO,
  calcularSeguimiento,
  esAnexo,
  hoyUTC,
  Seguimiento,
  CancelacionRow,
  HistoricaRow,
  PolizaRow,
  SIN_ANEXOS,
} from "./calculos";

async function leerDatosSeguimiento(): Promise<{
  polizas: PolizaRow[];
  cancelaciones: CancelacionRow[];
  historicas2025: HistoricaRow[];
  fotos: Map<number, PolizaRow[]>;
}> {
  const [polizas, cancelaciones, historicas2025, fotoFilas] = await Promise.all([
    // Los recibos de una colectiva no cuentan aparte: su prima ya está
    // representada por la póliza madre, y sumarlos otra vez inflaría la
    // producción con la misma plata dos veces. Ver lib/mapa-colectivas.ts.
    prisma.policy.findMany({
      where: { colectivaDe: null },
      select: {
        numero: true,
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
      select: {
        numero: true,
        ramo: true,
        tipoNegocio: true,
        primaNeta: true,
        mes: true,
        vencimiento: true,
      },
    }),
    prisma.fotoPoliza.findMany({
      select: {
        anioProduccion: true,
        numero: true,
        ramo: true,
        tipoNegocio: true,
        primaNeta: true,
        vencimiento: true,
        aseguradora: true,
      },
    }),
  ]);

  // Agrupadas por año: `polizasDeAnio` las prefiere sobre la cartera viva para
  // los años ya cerrados.
  const fotos = new Map<number, PolizaRow[]>();
  for (const f of fotoFilas) {
    const lista = fotos.get(f.anioProduccion) ?? [];
    lista.push(f);
    fotos.set(f.anioProduccion, lista);
  }

  return { polizas, cancelaciones, historicas2025, fotos };
}

/*
 * Deduplicación DENTRO de una misma petición, no entre peticiones.
 *
 * Se usa `cache` de React y no la caché compartida porque el resultado lleva
 * `Map` y objetos `Date`: la caché compartida serializa, y al volver las fechas
 * serían texto y `vencimiento.getUTCFullYear()` reventaría. `cache` guarda la
 * referencia tal cual, así que es seguro.
 *
 * Sirve igual: al pintar el dashboard esto se pide varias veces y ahora se lee
 * una. Lo que ahorra entre usuarios distintos son las funciones de abajo, que
 * sí devuelven datos planos.
 */
// `cache` solo existe dentro de un render de React; los scripts de
// mantenimiento importan esto desde Node puro y allí no está.
export const datosSeguimiento =
  typeof cache === "function" ? cache(leerDatosSeguimiento) : leerDatosSeguimiento;

export async function seguimientoAnio(anio: number): Promise<Seguimiento> {
  const datos = await datosSeguimiento();
  return calcularSeguimiento(datos, anio);
}

/** Contadores de la barra lateral: se piden en CADA navegación. */
export const contadoresNav = cachearCartera(["contadores-nav"], async () => {
  const hoy = hoyUTC();
  const [vencidas, mora] = await Promise.all([
    /*
     * SIN_ANEXOS aquí también, igual que en el dashboard.
     *
     * El círculo rojo del menú contaba TODO lo vencido, y lo que hay en «Otras
     * pólizas» vence a propósito: una de cumplimiento muere con la obra, una
     * prórroga dura lo que dura. Ninguna se renueva, así que ninguna es trabajo
     * pendiente. El contador decía 90 cuando lo que había que renovar eran 22:
     * 31 de cumplimiento, 30 de RC, 6 prórrogas y 1 incremento inflaban la
     * alarma. Un número que exagera se deja de mirar.
     */
    prisma.policy.count({ where: { vencimiento: { lt: hoy }, colectivaDe: null, ...SIN_ANEXOS } }),
    prisma.policy.count({ where: { estadoPago: "PENDIENTE", fechaMaxPago: { lt: hoy } } }),
  ]);
  return { vencidas, mora };
});

/**
 * Años disponibles para el selector. Siempre incluye 2026, 2027 y el año en
 * curso + el siguiente, más todos los que se deriven de los vencimientos
 * cargados (producción del año N = vencimientos en N+1). Así el informe queda
 * disponible para 2027 aunque todavía no existan vencimientos en 2028.
 */
async function leerAniosDisponibles(): Promise<number[]> {
  // Solo hace falta el vencimiento MÁS LEJANO, así que lo calcula la base y no
  // se traen las 700 fechas para quedarse con una. Con veinte personas dentro,
  // esta consulta se ejecuta constantemente desde el selector de años.
  const { _max } = await prisma.policy.aggregate({ _max: { vencimiento: true } });
  const anioActual = new Date().getUTCFullYear();

  /*
   * El rango se rellena entero, de 2026 al último año con datos. Antes se
   * armaba con un puñado de años sueltos (2026, 2027, el actual y el
   * siguiente) más los que aparecieran en la cartera, y eso deja huecos en
   * cuanto pasa el tiempo: en 2030 el desplegable habría mostrado 2026, 2027,
   * 2030 y 2031, saltándose 2028 y 2029 salvo que quedara alguna póliza
   * venciendo en esos años. Un año sin producción debe poder consultarse y
   * salir en cero, no desaparecer del selector.
   *
   * 2026 es el piso porque es el primer año que el CRM puede calcular: su base
   * es la hoja BASE 2025 y no hay nada anterior.
   */
  // Producción del año N = pólizas que vencen en N+1.
  const ultimo = Math.max(
    2027,
    anioActual + 1,
    _max.vencimiento ? _max.vencimiento.getUTCFullYear() - 1 : 0
  );

  const anios: number[] = [];
  for (let a = PRIMER_ANIO; a <= ultimo; a++) anios.push(a);
  return anios;
}

/**
 * Indicadores operativos para el panel "requiere atención" del dashboard:
 * lo que un asesor debe mirar hoy.
 */
async function leerResumenOperativo() {
  const hoy = hoyUTC();
  const en30 = new Date(hoy.getTime() + 30 * 86400000);
  const inicioMes = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
  const inicioMesSiguiente = new Date(
    Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, 1)
  );

  // Prórrogas e incrementos no se renuevan: vencen porque duran poco a
  // propósito, y contarlos aquí llenaba el panel de trabajo inexistente.
  // Siguen en la cartera y siguen sumando producción (ver tipoAnexo en
  // lib/calculos.ts).
  const [vencidas, sinGestionar, proximas, mora, canceladasMes, primaMora] =
    await Promise.all([
      prisma.policy.count({ where: { vencimiento: { lt: hoy }, colectivaDe: null, ...SIN_ANEXOS } }),
      prisma.policy.count({
        where: { vencimiento: { lt: hoy }, gestionada: false, colectivaDe: null, ...SIN_ANEXOS },
      }),
      prisma.policy.count({
        where: { vencimiento: { gte: hoy, lte: en30 }, colectivaDe: null, ...SIN_ANEXOS },
      }),
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

/*
 * Estas dos sí se comparten entre usuarios: devuelven números sueltos, que la
 * caché puede serializar sin romper nada. Son justo las que más se repiten
 * —el dashboard y el selector de años— y las que más viajes a Neon ahorran
 * cuando hay gente dentro a la vez.
 */
export const aniosDisponibles = cachearCartera(["anios"], leerAniosDisponibles);
export const resumenOperativo = cachearCartera(["resumen-operativo"], leerResumenOperativo);

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
    // Los recibos de una colectiva no son trabajo de nadie: se renueva la
    // colectiva, no cada inclusión. Sin esto, Asesores contaba 24 vencidas
    // donde el menú y el dashboard contaban 21.
    where: { colectivaDe: null },
    select: {
      asesor1: true,
      asesor2: true,
      primaNeta: true,
      primaTotal: true,
      vencimiento: true,
      estadoPago: true,
      fechaMaxPago: true,
      // Para saber si la póliza se renueva o es de «Otras pólizas».
      ramo: true,
      observacion: true,
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
    // «Vencidas por gestionar» es trabajo pendiente, y lo que está en «Otras
    // pólizas» no se renueva: cumplimiento, RC, viaje, prórrogas e
    // incrementos vencen a propósito. Contarlas aquí le colgaba a cada asesor
    // una lista de pendientes que no existe.
    if (p.vencimiento && p.vencimiento < hoy && !esAnexo(p.observacion, p.ramo))
      f.vencidas++;
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
