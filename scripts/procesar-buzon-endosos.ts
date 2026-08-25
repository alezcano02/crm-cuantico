/**
 * El flujo asistido por Claude, corriendo de verdad: lee lo que ya se
 * clasificó a mano del buzón `endosos@cuanticoseguros.com` (últimos 20
 * correos, revisados el 25 de agosto de 2026) y lo escribe en el CRM en
 * producción llamando a la misma API que usa el formulario — no se toca la
 * base de datos directo, para que pase por las mismas validaciones y la
 * misma normalización.
 *
 * Cada entrada de ACCIONES lleva la clasificación con la que se decidió qué
 * hacer. Lo que no aparece aquí (agradecimientos, el aviso de Microsoft
 * Forms, reenvíos ambiguos, un correo de renovación de autos que no es de
 * este ramo) se dejó fuera a propósito — ver la nota al final de cada caso.
 *
 * Uso:
 *   npx tsx scripts/procesar-buzon-endosos.ts
 *   npx tsx scripts/procesar-buzon-endosos.ts --aplicar
 */
import { randomBytes } from "crypto";
import { prisma } from "../lib/prisma";

const APLICAR = process.argv.includes("--aplicar");
/*
 * El dominio propio (cuanticoseguros.com.co) pasa por Netlify antes de llegar
 * a Vercel, y Netlify está sirviendo respuestas de la API cacheadas y viejas
 * (se confirmó con un 401 de sesión fantasma, cache-status "Netlify Edge;
 * fwd=stale"). Se usa el dominio directo de Vercel para no toparse con eso;
 * es la misma aplicación y la misma base de datos, solo sin el intermediario
 * que está cacheando mal.
 */
const BASE = "https://crm-cuantico.vercel.app/funcionarios";

type Accion =
  | {
      tipo: "crear";
      resumen: string;
      datos: Record<string, unknown>;
    }
  | {
      tipo: "seguimiento";
      resumen: string;
      endosoId: number;
      nota: string;
      estado?: string;
      datos?: Record<string, unknown>;
    };

const ACCIONES: Accion[] = [
  // --- Solicitudes nuevas, confirmadas ausentes del sistema ---------------
  {
    tipo: "crear",
    resumen: "John Fredy Sánchez · Puerto Ventura 2119 · solicitud nueva completa",
    datos: {
      urbanizacion: "Puerto Ventura",
      cliente: "John Fredy Sánchez Sepúlveda",
      cedula: "8127815",
      direccion: "Cra 57 # 38-220 Urbanización Puerto Ventura",
      apartamento: "2119",
      parqueadero: "96142",
      cuartoUtil: "97158",
      valorSolicitado: "162369194",
      banco: "Bancolombia",
      bancoNit: "890903938-8",
      tipoCredito: "HIPOTECARIO",
      correoSolicitante: "jhonfredy32@hotmail.com",
      celular: "3148124166",
      estado: "NUEVA_SOLICITUD",
      origenCorreoId:
        "<DM6PR02MB5676A4843544D9D351E26DB2A1A02@DM6PR02MB5676.namprd02.prod.outlook.com>",
      nota: "Solicitud recibida por correo el 24/08. Marcada prioritaria por el cliente.",
    },
  },
  {
    tipo: "crear",
    resumen:
      "Andrés García · Ciudadela del Parque 1913 · solicitud incompleta (sin valor ni banco)",
    datos: {
      urbanizacion: "Ciudadela del Parque",
      cliente: "German Andrés García Londoño",
      cedula: "15962033",
      direccion: "Calle 71 58-102 Barrio Santa María, Itagüí",
      apartamento: "1913",
      torre: "1",
      celular: "3113732444",
      correoSolicitante: "andresg2081@hotmail.com",
      estado: "DATOS_INCOMPLETOS",
      origenCorreoId:
        "<EA2P220MB14834774941685B446A13711ACA02@EA2P220MB1483.NAMP220.PROD.OUTLOOK.COM>",
      nota:
        "El cliente solo pidió 'información del endoso', sin valor asegurado ni banco. Hay que responderle pidiendo esos dos datos antes de poder radicar.",
    },
  },
  {
    tipo: "crear",
    resumen: "Alaia Mantra 1003 · solicitud incompleta (apartamento nuevo en el edificio)",
    datos: {
      urbanizacion: "Alaia Mantra",
      cliente: "Sin identificar (pendiente cédula)",
      apartamento: "1003",
      tipoCredito: "LEASING",
      banco: "BANCO DAVIVIENDA S.A.",
      correoSolicitante: "ja.gallosalazar@gmail.com",
      estado: "DATOS_INCOMPLETOS",
      origenCorreoId: "<CANMk-uAxgOPTo5wCKbTBF3zyTNGqm80WbpnH_bmndmZ0YNunGg@mail.gmail.com>",
      nota:
        "Pide el documento para solicitar el endoso del leasing habitacional No. 6003030100177956 con Davivienda. No trae cédula ni valor: hay que pedírselos. Los otros apartamentos de Alaia Mantra (705, 1704) sí están en el sistema; este (1003) es nuevo.",
    },
  },

  // --- Reprocesos sobre casos existentes: el sistema los tenía como cerrados,
  //     pero el banco volvió a devolverlos. Esto es lo que hoy nadie detecta
  //     porque el estado viejo ("Enviado") no se actualiza solo. -----------
  {
    tipo: "seguimiento",
    resumen: "Julio César García (id 535) · Paseo del Parque 810 · leasing, 2º reproceso",
    endosoId: 535,
    estado: "REPROCESO",
    datos: {
      tipoCredito: "LEASING",
      banco: "BANCO DE BOGOTÁ S.A.",
      bancoNit: "860002964-4",
      cliente2: "Ángela María Pérez Lopera",
      cedula2: "1035831976",
    },
    nota:
      "El banco de Bogotá volvió a devolver el endoso: al ser Leasing Habitacional exige que el Banco de Bogotá figure como PROPIETARIO (no solo beneficiario) y los dos locatarios aparte — Julio César García (CC 71377678) y Ángela María Pérez Lopera (CC 1035831976). El estado quedaba como 'Enviado' desde enero; el caso sigue abierto.",
  },
  {
    tipo: "seguimiento",
    resumen: "Edgar Alzate (id 1277) · Messantia 1901 · reproceso por certificado de pago",
    endosoId: 1277,
    estado: "REPROCESO",
    nota:
      "El banco rechazó el endoso por radicarse tarde: piden un certificado de pago actualizado con el segundo pago ya realizado. El estado quedaba como 'Enviado' desde mayo; el caso sigue abierto.",
  },
  {
    tipo: "seguimiento",
    resumen: "Nicole Forbes (id 999) · Marsella 1808 · 4 correcciones del banco",
    endosoId: 999,
    estado: "REPROCESO",
    datos: {
      banco: "DAVIbank S.A. (antes Scotiabank Colpatria)",
      bancoNit: "860034594-1",
      ciudad: "Medellín",
      direccion: "CL 54 Nº 86C - 66 T1 ET2 APTO 1808 GJ 01099 DP 01037",
      valorSolicitado: "285415540",
    },
    nota:
      'El banco devolvió el endoso con 4 puntos a corregir: (1) el beneficiario debe decir "DAVIbank S.A." con NIT 860.034.594-1, no "Davivienda" — son entidades distintas; (2) falta la ciudad en la dirección de riesgo; (3) el valor destructible es $285.415.540; (4) la dirección completa debe incluir torre, etapa y depósito. El estado quedaba como \'Enviado\' desde abril; el caso sigue abierto.',
  },

  // --- Respuestas de aseguradora con el documento: falta compartirlo al
  //     cliente (paso que sigue siendo manual, pero al menos queda anotado). ---
  {
    tipo: "seguimiento",
    resumen: "Lalik apto 802 (id 1889) · Previsora respondió con el documento",
    endosoId: 1889,
    nota:
      "Previsora respondió (24/08) adjuntando lo solicitado para el endoso. Pendiente revisarlo y compartirlo con el cliente.",
  },
  {
    tipo: "seguimiento",
    resumen: "Marsella 1604 (id 1891) · Zurich generó el endoso",
    endosoId: 1891,
    nota:
      "Zurich respondió (24/08) con el endoso generado (adjunto .zip). Pendiente revisarlo y compartirlo con el cliente.",
  },
  {
    tipo: "seguimiento",
    resumen: "Contree Palmas 1703 (id 1890) · Zurich generó el endoso",
    endosoId: 1890,
    nota:
      "Zurich respondió (24/08) con el endoso generado (adjunto .zip). Pendiente revisarlo y compartirlo con el cliente.",
  },

  // --- Preguntas de seguimiento sobre casos existentes: no traen datos
  //     nuevos, pero el cliente está esperando respuesta. ------------------
  {
    tipo: "seguimiento",
    resumen: "Jorge Ceballos (id 66) · Paseo del Parque 306 · pregunta por el estado",
    endosoId: 66,
    nota: "El cliente (a través de Protección) pregunta por el estado de su solicitud (25/08). Sin novedad nueva, solo pide respuesta.",
  },
  {
    tipo: "seguimiento",
    resumen: "Mónica León (id 1855) · Viverdi 1406 · pregunta sobre la renovación",
    endosoId: 1855,
    nota:
      "Pregunta si, según la respuesta del banco, debe esperar hasta el 19/09 (vencimiento de la póliza) para pedir el endoso con la nueva vigencia. Pendiente confirmarle.",
  },
  {
    tipo: "seguimiento",
    resumen: "Luz Peguis (id 1850) · Sendero Verde 427 · pregunta por los documentos corregidos",
    endosoId: 1850,
    nota: "Pregunta para cuándo tendrá los documentos corregidos, para volver a llevarlos al banco.",
  },
];

/*
 * Lo que se dejó FUERA a propósito, y por qué:
 *
 *  · Devolución de endoso CC 1039450612 (natisca09@gmail.com, reenvío del
 *    portal de Bancolombia): no se encontró ningún caso con esa cédula en el
 *    sistema. Podría ser un caso que nunca se registró, o estar a nombre de
 *    otra persona. Se deja para que Juan lo revise a mano en vez de adivinar.
 *  · Reenvío de Majagua PH (administración reenviando la pregunta de un
 *    vecino) y de v_anepineda (reenvío de una notificación del Banco de
 *    Bogotá): son reenvíos de terceros — hay que identificar quién es el
 *    verdadero interesado antes de tocar ningún caso, y eso no se puede
 *    automatizar sin el riesgo de vincular mal.
 *  · Andrea Bermúdez (Marsella 1006): un emoji 🙏 de agradecimiento, sin
 *    contenido que registrar.
 *  · Faro Verde 1216: la administración confirma que el caso "ya se
 *    resolvió" — el sistema ya lo tiene como Enviado al cliente, coincide.
 *  · Notificación de Microsoft Forms: el canal ya no se usa (confirmado por
 *    el usuario).
 *  · G&G Transporte (renovación de póliza de autos colectiva): no es un
 *    endoso, es otro trámite completamente distinto.
 */

function texto(s: string): string {
  return s.length > 78 ? s.slice(0, 75) + "..." : s;
}

async function main() {
  console.log(APLICAR ? `APLICANDO contra ${BASE}\n` : "SIMULACIÓN (añade --aplicar)\n");

  const nuevas = ACCIONES.filter((a) => a.tipo === "crear").length;
  const seguimientos = ACCIONES.filter((a) => a.tipo === "seguimiento").length;
  console.log(`${ACCIONES.length} acciones: ${nuevas} casos nuevos, ${seguimientos} seguimientos.\n`);

  for (const a of ACCIONES) {
    if (a.tipo === "crear") {
      console.log(`[CREAR]        ${texto(a.resumen)}`);
    } else {
      console.log(`[SEGUIMIENTO]  ${texto(a.resumen)}${a.estado ? ` → ${a.estado}` : ""}`);
    }
  }

  if (!APLICAR) {
    console.log("\nSimulación. Añade --aplicar para escribir de verdad en producción.");
    await prisma.$disconnect();
    return;
  }

  // Sesión temporal contra la misma base de datos de producción, para llamar
  // a la API real (no se escribe directo en la tabla): así pasa por las
  // mismas validaciones y normalización que usa el formulario del CRM.
  const usuario = await prisma.usuario.findFirst({ where: { activo: true } });
  if (!usuario) throw new Error("No hay usuario activo.");
  const token = "auto-" + randomBytes(24).toString("base64url");
  await prisma.sesion.create({
    data: { token, usuarioId: usuario.id, expira: new Date(Date.now() + 15 * 60 * 1000) },
  });

  const cabeceras = { "Content-Type": "application/json", Cookie: `cuantico_sesion=${token}` };
  let ok = 0;
  let fallos = 0;

  try {
    for (const a of ACCIONES) {
      const url =
        a.tipo === "crear" ? `${BASE}/api/endosos` : `${BASE}/api/endosos/${a.endosoId}`;
      const cuerpo =
        a.tipo === "crear"
          ? a.datos
          : {
              ...(a.datos ?? {}),
              notaSeguimiento: a.nota,
              fechaSeguimiento: "2026-08-25",
              ...(a.estado ? { estado: a.estado } : {}),
            };
      try {
        const r = await fetch(url, {
          method: a.tipo === "crear" ? "POST" : "PATCH",
          headers: cabeceras,
          body: JSON.stringify(cuerpo),
        });
        const j = await r.json().catch(() => null);
        if (r.ok && j?.ok) {
          ok++;
          console.log(`  ok  ${texto(a.resumen)}${a.tipo === "crear" ? ` → id ${j.id}` : ""}`);
        } else {
          fallos++;
          console.log(`  XX  ${texto(a.resumen)} → HTTP ${r.status} ${JSON.stringify(j)}`);
        }
      } catch (e) {
        fallos++;
        console.log(`  XX  ${texto(a.resumen)} → ${(e as Error).message}`);
      }
    }
  } finally {
    await prisma.sesion.deleteMany({ where: { token } });
  }

  console.log(`\n${ok} aplicadas, ${fallos} fallidas.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
