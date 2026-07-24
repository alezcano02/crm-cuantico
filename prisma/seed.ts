/**
 * Datos de ejemplo que replican la estructura del informe de producción:
 * cartera activa (ya renovadas con vencimiento en el año siguiente + pendientes
 * de renovar), otras pólizas, cancelaciones (con fecha de renovación y fecha
 * real de cancelación separadas), base histórica 2025 y listas de valores.
 *
 * Ejecutar con: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ------------------------------ listas -------------------------------------

const RAMOS = [
  "AP", "ARRENDAMIENTO", "AUTOS", "COLECTIVA", "EDUCATIVO", "HOGAR", "MASCOTAS",
  "PYME", "RC DECRETO", "RC EMPRESA", "RC HOTELES", "RC MEDICA",
  "RC PROFESIONAL", "RC ZC", "RCE", "SALUD", "VIDA", "VIDA GRUPO", "ZONA COMUN",
];
const TIPOS_NEGOCIO = [
  "COASEGURO", "INCLUSIÓN", "INCREMENTO", "MODIFICACION", "NO RENOVADO",
  "NUEVO", "PRORROGA", "RENOVACION", "SINIESTRO PTH",
];
const ESTADOS_PAGO = ["OK PAGO", "PENDIENTE"];
const FORMAS_PAGO = [
  "ACUERDO DE PAGO", "CONTADO", "DÉBITO AUTOMÁTICO", "FINANCIADO", "MENSUAL",
  "SEMESTRAL", "TRIMESTRAL", "FINANCIACION",
];
const ASEGURADORAS = [
  "ALLIANZ", "AXA COLPATRIA", "BBVA", "BOLIVAR", "EQUIDAD", "HDI", "MAPFRE",
  "MUNDIAL", "PREVISORA", "SBS", "SEGUROS DEL ESTADO", "SOLIDARIA", "SURA",
  "ZURICH", "QUALITAS",
];
const ASESORES = ["BERNARDO LEZCANO", "VIVASEGUROS", "CUANTICO", "BLIN SEGUROS", "CLARA OSORIO"];

// ------------------------- generador determinista --------------------------

let semilla = 42;
function azar(): number {
  // LCG determinista para que el seed sea reproducible
  semilla = (semilla * 1103515245 + 12345) % 2147483648;
  return semilla / 2147483648;
}
function entre(min: number, max: number): number {
  return Math.floor(azar() * (max - min + 1)) + min;
}
function de<T>(lista: readonly T[]): T {
  return lista[entre(0, lista.length - 1)];
}
function fechaUTC(anio: number, mes: number, dia: number): Date {
  return new Date(Date.UTC(anio, mes, dia));
}

const NOMBRES = [
  "MARIA FERNANDA LOPEZ", "CARLOS ANDRES GOMEZ", "LUISA PEREZ CARDONA",
  "JORGE ENRIQUE RAMIREZ", "ANA SOFIA TORRES", "PEDRO PABLO MARTINEZ",
  "DIANA CAROLINA RIOS", "ANDRES FELIPE CASTRO", "CLAUDIA MILENA VARGAS",
  "JUAN SEBASTIAN OSPINA", "PAULA ANDREA MEJIA", "RICARDO JOSE HERRERA",
  "SANDRA PATRICIA RUIZ", "OSCAR IVAN MORENO", "NATALIA ANDREA GIL",
  "EDIFICIO MIRADOR PH", "CONJUNTO ALAMEDA PH", "TORRES DEL PARQUE PH",
  "INVERSIONES EL ROBLE SAS", "COMERCIALIZADORA ANDINA SAS",
  "HOTEL CASA BLANCA SAS", "CLINICA SAN RAFAEL SAS", "TRANSPORTES UNIDOS SA",
  "CONSTRUCTORA HORIZONTE SAS", "FUNDACION EDUCATIVA FUTURO",
];

function contacto(i: number) {
  return {
    correo: `cliente${i}@ejemplo.com`,
    celular: `31${entre(0, 9)} ${entre(100, 999)} ${entre(1000, 9999)}`,
  };
}

async function main() {
  console.log("Limpiando tablas…");
  await prisma.policy.deleteMany();
  await prisma.otherPolicy.deleteMany();
  await prisma.cancellation.deleteMany();
  await prisma.historicalPolicy2025.deleteMany();
  await prisma.listValue.deleteMany();

  // ---- LISTAS ----
  const listas = [
    ...RAMOS.map((valor) => ({ tipo: "RAMO", valor })),
    ...TIPOS_NEGOCIO.map((valor) => ({ tipo: "TIPO_NEGOCIO", valor })),
    ...ESTADOS_PAGO.map((valor) => ({ tipo: "ESTADO_PAGO", valor })),
    ...FORMAS_PAGO.map((valor) => ({ tipo: "FORMA_PAGO", valor })),
    ...ASEGURADORAS.map((valor) => ({ tipo: "ASEGURADORA", valor })),
    ...ASESORES.map((valor) => ({ tipo: "ASESOR", valor })),
  ];
  await prisma.listValue.createMany({ data: listas });
  console.log(`LISTAS: ${listas.length} valores`);

  // Ramos con peso realista en la cartera
  const RAMOS_CARTERA = [
    "AUTOS", "AUTOS", "AUTOS", "AUTOS", "SALUD", "SALUD", "SALUD",
    "ZONA COMUN", "ZONA COMUN", "ZONA COMUN", "HOGAR", "HOGAR", "VIDA",
    "PYME", "RC ZC", "COLECTIVA", "AP", "RC EMPRESA", "RC PROFESIONAL",
    "VIDA GRUPO", "RC DECRETO",
  ];

  // ---- BASE 2025 (histórico: define la base a renovar de 2026) ----
  const historico: {
    numero: string; ramo: string; vencimiento: Date; mes: string;
    tipoNegocio: string; asegurado: string; primaNeta: number; primaTotal: number;
  }[] = [];
  const MESES = [
    "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO",
    "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
  ];
  for (let i = 0; i < 240; i++) {
    const ramo = de(RAMOS_CARTERA);
    const mes = entre(0, 11);
    // La base 2025 son pólizas del ciclo 2025: vencimientos en 2026
    const venc = fechaUTC(2026, mes, entre(1, 28));
    const prima = entre(400, 40000) * 1000;
    historico.push({
      numero: String(10000000 + i),
      ramo,
      vencimiento: venc,
      mes: MESES[mes],
      tipoNegocio: azar() < 0.7 ? "RENOVACION" : "NUEVO",
      asegurado: de(NOMBRES),
      primaNeta: prima,
      primaTotal: Math.round(prima * 1.19),
    });
  }
  await prisma.historicalPolicy2025.createMany({ data: historico });
  console.log(`BASE 2025: ${historico.length} pólizas`);

  // ---- DATOS (cartera activa) ----
  // Hoy de referencia: la app calcula DÍAS AL VENCE contra la fecha actual.
  const hoy = new Date();
  const hoyUTC = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
  const anioActual = hoyUTC.getUTCFullYear();

  const polizas: any[] = [];
  let consecutivo = 20000000;

  // a) Pólizas YA renovadas para el ciclo actual: vencimiento en anioActual+1,
  //    concentradas en los meses ya trabajados del año.
  for (let i = 0; i < 130; i++) {
    const ramo = de(RAMOS_CARTERA);
    const mes = entre(0, hoyUTC.getUTCMonth()); // meses ya gestionados
    const venc = fechaUTC(anioActual + 1, mes, entre(1, 28));
    const prima = entre(400, 45000) * 1000;
    const tipo = azar() < 0.68 ? "RENOVACION" : azar() < 0.8 ? "NUEVO" : de(["COASEGURO", "INCLUSIÓN", "INCREMENTO", "PRORROGA"]);
    const c = contacto(i);
    polizas.push({
      numero: String(consecutivo++),
      ramo,
      asegurado: de(NOMBRES),
      ccNit: String(entre(10000000, 999999999)),
      placa: ramo === "AUTOS" ? `${String.fromCharCode(65 + entre(0, 25))}${String.fromCharCode(65 + entre(0, 25))}${String.fromCharCode(65 + entre(0, 25))}${entre(100, 999)}` : null,
      aseguradora: de(ASEGURADORAS),
      tipoNegocio: tipo,
      asesor1: de(ASESORES),
      asesor2: azar() < 0.5 ? de(ASESORES) : null,
      primaNeta: prima,
      primaTotal: Math.round(prima * 1.19),
      formaPago: de(FORMAS_PAGO),
      fechaPago: azar() < 0.7 ? fechaUTC(anioActual, mes, entre(1, 28)) : null,
      fechaMaxPago: fechaUTC(anioActual, Math.min(mes + 1, 11), entre(1, 28)),
      estadoPago: azar() < 0.75 ? "OK PAGO" : "PENDIENTE",
      vencimiento: venc,
      mesVencimiento: MESES[mes],
      fechaNacimiento: azar() < 0.4 ? fechaUTC(entre(1955, 1998), entre(0, 11), entre(1, 28)) : null,
      correo: c.correo,
      celular: c.celular,
      mensajeResumen: null,
      vtoSoat: null,
    });
  }

  // b) Pólizas VENCIDAS pendientes de renovar (vencimiento pasado, días negativos)
  for (let i = 0; i < 25; i++) {
    const ramo = de(RAMOS_CARTERA);
    const diasVencida = entre(3, 90);
    const venc = new Date(hoyUTC.getTime() - diasVencida * 86400000);
    const prima = entre(400, 30000) * 1000;
    const c = contacto(200 + i);
    polizas.push({
      numero: String(consecutivo++),
      ramo,
      asegurado: de(NOMBRES),
      ccNit: String(entre(10000000, 999999999)),
      placa: ramo === "AUTOS" ? `${String.fromCharCode(65 + entre(0, 25))}${String.fromCharCode(65 + entre(0, 25))}${String.fromCharCode(65 + entre(0, 25))}${entre(100, 999)}` : null,
      aseguradora: de(ASEGURADORAS),
      tipoNegocio: "RENOVACION",
      asesor1: de(ASESORES),
      asesor2: null,
      primaNeta: prima,
      primaTotal: Math.round(prima * 1.19),
      formaPago: de(FORMAS_PAGO),
      fechaPago: null,
      fechaMaxPago: venc,
      estadoPago: azar() < 0.5 ? "OK PAGO" : "PENDIENTE",
      vencimiento: venc,
      mesVencimiento: MESES[venc.getUTCMonth()],
      fechaNacimiento: null,
      correo: c.correo,
      celular: c.celular,
      mensajeResumen: null,
      vtoSoat: null,
    });
  }

  // c) Pólizas próximas a vencer (0–45 días)
  for (let i = 0; i < 25; i++) {
    const ramo = de(RAMOS_CARTERA);
    const dias = entre(0, 45);
    const venc = new Date(hoyUTC.getTime() + dias * 86400000);
    const prima = entre(400, 30000) * 1000;
    const c = contacto(300 + i);
    polizas.push({
      numero: String(consecutivo++),
      ramo,
      asegurado: de(NOMBRES),
      ccNit: String(entre(10000000, 999999999)),
      placa: null,
      aseguradora: de(ASEGURADORAS),
      tipoNegocio: "RENOVACION",
      asesor1: de(ASESORES),
      asesor2: null,
      primaNeta: prima,
      primaTotal: Math.round(prima * 1.19),
      formaPago: de(FORMAS_PAGO),
      fechaPago: null,
      fechaMaxPago: venc,
      estadoPago: azar() < 0.6 ? "OK PAGO" : "PENDIENTE",
      vencimiento: venc,
      mesVencimiento: MESES[venc.getUTCMonth()],
      fechaNacimiento: null,
      correo: c.correo,
      celular: c.celular,
      mensajeResumen: null,
      vtoSoat: null,
    });
  }

  await prisma.policy.createMany({ data: polizas });
  console.log(`DATOS: ${polizas.length} pólizas activas`);

  // ---- OTRAS PÓLIZAS ----
  const otras: any[] = [];
  for (let i = 0; i < 20; i++) {
    const prima = entre(200, 2000) * 1000;
    const c = contacto(400 + i);
    otras.push({
      numero: `4513-${entre(100000, 999999)}-${entre(1000000, 9999999)}`,
      ramo: "VIAJE",
      asegurado: de(NOMBRES),
      ccNit: String(entre(10000000, 99999999)),
      tipoNegocio: "NUEVO",
      asesor1: de(ASESORES),
      asesor2: null,
      primaNeta: prima,
      primaTotal: prima,
      formaPago: "CONTADO",
      fechaPago: fechaUTC(anioActual, entre(0, hoyUTC.getUTCMonth()), entre(1, 28)),
      fechaMaxPago: null,
      estadoPago: "OK PAGO",
      vencimiento: fechaUTC(anioActual, entre(hoyUTC.getUTCMonth(), 11), entre(1, 28)),
      fechaNacimiento: null,
      correo: c.correo,
      celular: c.celular,
    });
  }
  await prisma.otherPolicy.createMany({ data: otras });
  console.log(`OTRAS PÓLIZAS: ${otras.length}`);

  // ---- CANCELACIONES ----
  // fechaRenovacion (año actual) → PRODUCCIÓN CANCELADA
  // fechaCancelacion (año actual) → CANCELACIONES (algunas en el mes actual
  // para que el dashboard muestre la tabla de canceladas del mes)
  const cancelaciones: any[] = [];
  for (let i = 0; i < 30; i++) {
    const ramo = de(RAMOS_CARTERA);
    const prima = entre(300, 15000) * 1000;
    const mesRenovacion = entre(0, 11);
    const conFechaCancelacion = azar() < 0.5;
    const mesCancelacion = i < 6 ? hoyUTC.getUTCMonth() : entre(0, hoyUTC.getUTCMonth());
    cancelaciones.push({
      numero: String(30000000 + i),
      ramo,
      fechaRenovacion: fechaUTC(anioActual, mesRenovacion, entre(1, 28)),
      fechaCancelacion:
        conFechaCancelacion || i < 6
          ? fechaUTC(anioActual, mesCancelacion, entre(1, Math.max(1, Math.min(28, hoyUTC.getUTCDate()))))
          : null,
      tipoNegocio: de(["CANCELACION", "NO RENOVADO", "RENOVACION"]),
      asegurado: de(NOMBRES),
      ccNit: String(entre(10000000, 999999999)),
      placa: ramo === "AUTOS" ? `${String.fromCharCode(65 + entre(0, 25))}${String.fromCharCode(65 + entre(0, 25))}${String.fromCharCode(65 + entre(0, 25))}${entre(100, 999)}` : null,
      asesor: de(ASESORES),
      aseguradora: de(ASEGURADORAS),
      primaNeta: prima,
      primaTotal: Math.round(prima * 1.19),
    });
  }
  await prisma.cancellation.createMany({ data: cancelaciones });
  console.log(`CANCELACIONES: ${cancelaciones.length}`);

  console.log("Seed completado ✔");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
