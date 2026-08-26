/**
 * Prueba el clasificador de Claude (lib/clasificar-endoso.ts) contra los
 * mismos correos reales que ya se procesaron a mano en esta conversación,
 * para confirmar que el prompt clasifica igual que se decidió manualmente
 * antes de dejarlo corriendo solo cada hora.
 *
 * No toca la base de datos ni Microsoft Graph — solo llama a la API de
 * Claude. Necesita ANTHROPIC_API_KEY en el entorno.
 *
 * Uso: npx tsx scripts/probar-clasificador.ts
 */
import { clasificarCorreo } from "../lib/clasificar-endoso";

interface Caso {
  titulo: string;
  asunto: string;
  remitente: string;
  cuerpo: string;
  tipoEsperado: string;
}

const CASOS: Caso[] = [
  {
    titulo: "John Fredy Sánchez — solicitud nueva completa",
    asunto: "Solicitud de Endoso JOHN FREDY SANCHEZ SEPULVEDA 8127815",
    remitente: "jhonfredy32@hotmail.com",
    cuerpo:
      "Buenas tardes, cordial saludo\n\nSerian tan amables de ayudarme de manera prioritaria con el envió del siguiente endoso:\n\nUsuario: JOHN FREDY SANCHEZ SEPULVEDA\nCedula: 8127815\nDirección: Cra 57 # 38- 220 Urbanización Puerto ventura\nApartamento: 2119\nParqueadero:96142\nUtil:97158\nValor para el endoso: $162.369.194\nNombre Banco: Bancolombia\nNit Banco: 890903938-8\nCelular: 3148124166",
    tipoEsperado: "SOLICITUD_NUEVA",
  },
  {
    titulo: "Andrés García — solicitud nueva incompleta",
    asunto: "Solicitud de endoso",
    remitente: "andresg2081@hotmail.com",
    cuerpo:
      "Buenas tardes\n\nComedidamente solicito muy amablemente la información del endoso del apto 1913 torre 1 ubicado en la unidad residencial ciudadela del parque calle 71 58 102 barrio Santa María Itagüí.\n\nAtentamente,\n\nGerman Andrés García Londoño\nCC 15962033\nCEL 3113732444",
    tipoEsperado: "SOLICITUD_NUEVA",
  },
  {
    titulo: "Nicole Forbes — reproceso con 4 correcciones",
    asunto: "Devolución endoso apto 1808 Marsella",
    remitente: "nicoleforbesgo@gmail.com",
    cuerpo:
      "Buenas tardes,\n\nComo les informe por WhatsApp, el banco no aceptó el endoso y notificó estos puntos a corregir:\n\n•Primer beneficiario: Banco DAVIbank S.A, junto con el NIT 860.034.594-1\n\n• En el campo de bien asegurado en la direccion de riesgo hace falta la ciudad donde se encuentra ubicado el inmueble\n\n• El valor destructible del inmueble $285.415.540\n\n•Dirección del inmueble CL 54 Nº86C - 66 T1 ET2 APTO 1808 GJ 01099 DP 01037.\n\nQuedó muy atenta,\nNicole Forbes Gómez",
    tipoEsperado: "REPROCESO",
  },
  {
    titulo: "Andrea Bermúdez — solo un emoji de agradecimiento",
    asunto: "Re: Solicitud para endoso póliza de apto 1006 Marsella",
    remitente: "andrea@nominascolombia.com",
    cuerpo: "🙏\n\nAndrea Bermúdez Nóminas Colombia reaccionó a través de Gmail",
    tipoEsperado: "RUIDO",
  },
  {
    titulo: "Zurich — respuesta de aseguradora con el documento",
    asunto: "RE: SOLICITUD ENDOSO MARSELLA APTO 1604",
    remitente: "solicitudendosos@zurich.com",
    cuerpo:
      "Adjunto encontrarás el archivo .zip que contiene el endoso generado según tu solicitud.\n\nTe invitamos a revisar que la información que contiene esté completa, sea exacta y cumpla con lo que solicitaste.",
    tipoEsperado: "RESPUESTA_ASEGURADORA",
  },
  {
    titulo: "Mónica León — pregunta de seguimiento",
    asunto: "RV: SOLICITUD ENDOSO SEGURO INCENDIO Y TERREMOTO LEASING 362027",
    remitente: "monicaleonrios@hotmail.com",
    cuerpo:
      "Juan buenos días\nSegún esta respuesta del banco me tocará pedir el endoso después del 19 de septiembre donde se tenga la nueva póliza. Es así?\nDe antemano gracias por su respuesta",
    tipoEsperado: "PREGUNTA_SEGUIMIENTO",
  },
  {
    titulo: "Faro Verde — cierre confirmado",
    asunto: "Re: Solicitud de Endoso- Urbanizacion Faro Verde apartamento 1216",
    remitente: "faroverdeph@gmail.com",
    cuerpo:
      "Reciba de la Administración de la Urbanización Faro Verde P.H. un cordial saludo.\n\nDe acuerdo con la conversación telefónica sostenida el día de hoy, en la cual usted nos manifestó que ya se le dio solución al trámite relacionado con el endoso.",
    tipoEsperado: "CIERRE",
  },
  {
    titulo: "Majagua PH — reenvío de un tercero",
    asunto: "Fwd: Solicitud de información – Póliza de seguro de la copropiedad",
    remitente: "majaguaph@gmail.com",
    cuerpo:
      "---------- Forwarded message ---------\nDe: Claudia Davila <claudiamilenadavilar@gmail.com>\nSubject: Solicitud de información – Póliza de seguro de la copropiedad\nTo: Administración Majagua PH",
    tipoEsperado: "REENVIO_TERCERO",
  },
];

let fallos = 0;

async function main() {
  for (const caso of CASOS) {
    const r = await clasificarCorreo({ asunto: caso.asunto, remitente: caso.remitente, cuerpo: caso.cuerpo });
    const ok = r.tipo === caso.tipoEsperado;
    console.log(`\n${ok ? "ok " : "XX "}${caso.titulo}`);
    console.log(`    esperado: ${caso.tipoEsperado} · obtenido: ${r.tipo}`);
    console.log(`    resumen: ${r.resumen}`);
    if (Object.keys(r.datos).length) console.log(`    datos: ${JSON.stringify(r.datos)}`);
    if (r.datosIncompletos) console.log(`    datosIncompletos: true`);
    if (r.estadoSugerido) console.log(`    estadoSugerido: ${r.estadoSugerido}`);
    if (!ok) fallos++;
  }
  console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} FALLA(S)`} · ${CASOS.length} casos.`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
