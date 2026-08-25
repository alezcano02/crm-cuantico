/**
 * Prueba de la revisión de endosos contra casos REALES del buzón.
 *
 * Cada caso de aquí abajo es un endoso que el banco devolvió de verdad, con los
 * datos tal como llegaron. La prueba consiste en que `revisarEndoso` señale
 * exactamente lo que hizo que lo devolvieran, antes de radicarlo.
 *
 * No toca la base de datos: la revisión es una función pura y esto se puede
 * correr en cualquier momento.
 *
 * Uso: npx tsx scripts/probar-revision-endosos.ts
 */
import {
  revisarEndoso,
  resumirRevision,
  type Chequeo,
  type DatosCopropiedad,
  type DatosEndoso,
} from "../lib/endosos";

// Fecha fija para que la prueba no cambie de resultado según el día.
const HOY = new Date("2026-08-25T00:00:00Z");

interface Caso {
  titulo: string;
  queePaso: string;
  endoso: DatosEndoso;
  copropiedad: DatosCopropiedad | null;
  /** Reglas que TIENEN que salir en rojo. */
  esperaBloqueo: string[];
  /** Reglas que TIENEN que salir en verde. */
  esperaOk?: string[];
}

const COPROPIEDAD_SANA: DatosCopropiedad = {
  nombre: "Marsella",
  valorAseguradoTotal: 80_945_125_857,
  vigenciaHasta: new Date("2027-04-25T00:00:00Z"),
  pazSalvoVigenteHasta: new Date("2026-12-30T00:00:00Z"),
  pazSalvoEstado: "AL DIA",
  admiteEndosos: true,
};

const CASOS: Caso[] = [
  {
    titulo: "Nicole Forbes · Marsella 1808",
    queePaso:
      "El banco lo devolvió: faltaba la ciudad en la dirección de riesgo y el beneficiario " +
      'decía "Davivienda" cuando era DAVIbank, que tiene otro NIT.',
    endoso: {
      cliente: "Nicole Forbes Gómez",
      cedula: "1017237538",
      direccion: "CL 54 Nº 86C - 66",
      ciudad: null, // ← lo que faltaba
      torre: "T1",
      apartamento: "1808",
      cuartoUtil: "01037",
      parqueadero: "01099",
      valorSolicitado: 285_415_540,
      banco: "Davivienda", // ← la entidad equivocada…
      bancoNit: "860034594-1", // ← …con el NIT de DAVIbank
      tipoCredito: "HIPOTECARIO",
      coeficiente: 0.36,
      correoSolicitante: "nicoleforbesgo@gmail.com",
    },
    copropiedad: COPROPIEDAD_SANA,
    esperaBloqueo: ["Dirección completa", "Banco y NIT"],
  },
  {
    titulo: "Paola Ramírez · Majagua Natural 1145",
    queePaso: "Pidió el endoso por $61.524. Ningún caso real baja de $70 millones: faltan dígitos.",
    endoso: {
      cliente: "Juan Pablo Londoño Bermúdez",
      cliente2: "Paola Andrea Ramírez Zuluaga",
      cedula: "8358386",
      direccion: "Unidad Residencial Majagua Natural",
      ciudad: "Medellín",
      torre: "1",
      apartamento: "1145",
      cuartoUtil: "2151",
      parqueadero: "449",
      valorSolicitado: 61_524, // ← el error
      banco: "BANCO DAVIVIENDA S.A.",
      bancoNit: "860034313-7",
      tipoCredito: "HIPOTECARIO",
      correoSolicitante: "paomimi19@gmail.com",
    },
    copropiedad: COPROPIEDAD_SANA,
    esperaBloqueo: ["Valor solicitado"],
    esperaOk: ["Dirección completa", "Banco y NIT"],
  },
  {
    titulo: "Pablo Arroyave · Majagua Natural 1243",
    queePaso: "Escribió el NIT de Bancolombia sin el dígito de verificación (890903938).",
    endoso: {
      cliente: "Pablo Andrés Arroyave Trujillo",
      cedula: "8061572",
      direccion: "Calle 55 # 67B - 160",
      ciudad: "Medellín",
      torre: "2",
      apartamento: "1243",
      cuartoUtil: "No aplica",
      parqueadero: "No aplica",
      valorSolicitado: 169_340_654,
      banco: "Bancolombia",
      bancoNit: "890903938", // ← sin dígito de verificación
      tipoCredito: "HIPOTECARIO",
      correoSolicitante: "parro-31@hotmail.com",
    },
    copropiedad: COPROPIEDAD_SANA,
    esperaBloqueo: [],
    esperaOk: ["Dirección completa", "Valor solicitado"],
  },
  {
    titulo: "Caso hipotético · Fondo Nacional del Ahorro",
    queePaso: "El FNA no recibe endosos de aseguradoras externas: el trámite no prospera.",
    endoso: {
      cliente: "Cliente de prueba",
      direccion: "Calle 1 # 2 - 3",
      ciudad: "Medellín",
      torre: "1",
      apartamento: "101",
      cuartoUtil: "1",
      parqueadero: "1",
      valorSolicitado: 150_000_000,
      banco: "FONDO NACIONAL DEL AHORRO",
      bancoNit: "899999284-4",
      tipoCredito: "HIPOTECARIO",
      correoSolicitante: "prueba@ejemplo.com",
    },
    copropiedad: COPROPIEDAD_SANA,
    esperaBloqueo: ["Requisitos del banco"],
  },
  {
    titulo: "Caso hipotético · valor por encima del coeficiente",
    queePaso:
      "El banco pide más de lo que le corresponde al apartamento ni con el 40% adicional.",
    endoso: {
      cliente: "Cliente de prueba",
      direccion: "Calle 1 # 2 - 3",
      ciudad: "Medellín",
      torre: "1",
      apartamento: "101",
      cuartoUtil: "1",
      parqueadero: "1",
      // Al 0,36% de 80.945 millones le corresponden ~291 millones; el tope al
      // 40% son ~408 millones.
      valorSolicitado: 900_000_000,
      coeficiente: 0.36,
      banco: "BANCOLOMBIA S.A.",
      bancoNit: "890903938-8",
      tipoCredito: "HIPOTECARIO",
      correoSolicitante: "prueba@ejemplo.com",
    },
    copropiedad: COPROPIEDAD_SANA,
    esperaBloqueo: ["Valor vs. coeficiente"],
  },
  {
    titulo: "Caso hipotético · paz y salvo vencido",
    queePaso: "Sin certificado de pago al día la aseguradora no emite el endoso.",
    endoso: {
      cliente: "Cliente de prueba",
      direccion: "Calle 1 # 2 - 3",
      ciudad: "Medellín",
      torre: "1",
      apartamento: "101",
      cuartoUtil: "1",
      parqueadero: "1",
      valorSolicitado: 150_000_000,
      banco: "BANCOLOMBIA S.A.",
      bancoNit: "890903938-8",
      tipoCredito: "HIPOTECARIO",
      correoSolicitante: "prueba@ejemplo.com",
    },
    copropiedad: {
      ...COPROPIEDAD_SANA,
      pazSalvoVigenteHasta: new Date("2026-07-01T00:00:00Z"),
      pazSalvoEstado: "VENCIDO",
    },
    esperaBloqueo: ["Paz y salvo"],
  },
  {
    titulo: "Caso completo y correcto · John Fredy Sánchez",
    queePaso: "Llegó con todo bien. No debería saltar ningún bloqueo.",
    endoso: {
      cliente: "JOHN FREDY SANCHEZ SEPULVEDA",
      cedula: "8127815",
      direccion: "Cra 57 # 38 - 220 Urbanización Puerto Ventura",
      ciudad: "Medellín",
      torre: "1",
      apartamento: "2119",
      cuartoUtil: "97158",
      parqueadero: "96142",
      valorSolicitado: 162_369_194,
      coeficiente: 0.25,
      banco: "BANCOLOMBIA S.A.",
      bancoNit: "890903938-8",
      tipoCredito: "HIPOTECARIO",
      correoSolicitante: "jhonfredy32@hotmail.com",
    },
    copropiedad: COPROPIEDAD_SANA,
    esperaBloqueo: [],
    esperaOk: ["Dirección completa", "Banco y NIT", "Valor solicitado", "Valor vs. coeficiente"],
  },
];

function reglasPorResultado(chequeos: Chequeo[], resultado: string): string[] {
  return chequeos.filter((c) => c.resultado === resultado).map((c) => c.regla);
}

let fallos = 0;

for (const caso of CASOS) {
  const chequeos = revisarEndoso(caso.endoso, caso.copropiedad, HOY);
  const bloqueos = reglasPorResultado(chequeos, "bloqueo");
  const oks = reglasPorResultado(chequeos, "ok");

  console.log(`\n── ${caso.titulo} ─────────────────────────────`);
  console.log(`   ${caso.queePaso}`);
  console.log(`   Resumen: ${resumirRevision(chequeos).toUpperCase()}`);

  for (const c of chequeos) {
    const marca = c.resultado === "ok" ? "  ok " : c.resultado === "aviso" ? "  !! " : "  XX ";
    console.log(`${marca}${c.regla}: ${c.mensaje}`);
  }

  // Lo que tenía que salir en rojo, salió en rojo.
  for (const regla of caso.esperaBloqueo) {
    if (!bloqueos.includes(regla)) {
      console.log(`   FALLA: se esperaba un bloqueo en "${regla}" y no salió.`);
      fallos++;
    }
  }
  // Y no salió nada en rojo de más.
  for (const regla of bloqueos) {
    if (!caso.esperaBloqueo.includes(regla)) {
      console.log(`   FALLA: bloqueo inesperado en "${regla}".`);
      fallos++;
    }
  }
  for (const regla of caso.esperaOk ?? []) {
    if (!oks.includes(regla)) {
      console.log(`   FALLA: se esperaba "${regla}" en verde y no lo está.`);
      fallos++;
    }
  }
}

console.log(
  `\n${fallos === 0 ? "TODO OK" : `${fallos} FALLA(S)`} · ${CASOS.length} casos revisados.`
);
process.exit(fallos === 0 ? 0 : 1);
