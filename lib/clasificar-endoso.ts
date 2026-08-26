/**
 * Clasificación y extracción de un correo de endosos con Claude.
 *
 * Las categorías y el criterio salen de revisar a mano decenas de correos
 * reales del buzón (ver la conversación que dio origen a este módulo): solo
 * 1 de cada 5 correos nuevos es una solicitud real; el resto es reproceso,
 * respuesta de aseguradora, pregunta de seguimiento, cierre, reenvío de un
 * tercero o ruido. Automatizar sin clasificar antes llenaría el CRM de casos
 * basura.
 *
 * Es una sola llamada, sin herramientas ni bucle agente: la tarea es
 * "lee este texto, devuélveme esta forma de dato" — no hace falta más.
 */
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export const TIPOS_CORREO = [
  "SOLICITUD_NUEVA",
  "REPROCESO",
  "RESPUESTA_ASEGURADORA",
  "PREGUNTA_SEGUIMIENTO",
  "CIERRE",
  "REENVIO_TERCERO",
  "RUIDO",
] as const;
export type TipoCorreo = (typeof TIPOS_CORREO)[number];

export interface DatosExtraidos {
  urbanizacion?: string;
  cliente?: string;
  cedula?: string;
  cliente2?: string;
  cedula2?: string;
  direccion?: string;
  ciudad?: string;
  torre?: string;
  apartamento?: string;
  cuartoUtil?: string;
  parqueadero?: string;
  valorSolicitado?: string;
  banco?: string;
  bancoNit?: string;
  tipoCredito?: "HIPOTECARIO" | "LEASING";
  correoSolicitante?: string;
  celular?: string;
}

export interface Clasificacion {
  tipo: TipoCorreo;
  /** Un resumen de 1-2 frases, listo para usarse como nota de seguimiento. */
  resumen: string;
  /** Solo para SOLICITUD_NUEVA y REPROCESO. Vacío/parcial si el correo no trae el dato. */
  datos: DatosExtraidos;
  /** true si faltan datos clave (valor, banco) para poder radicar una solicitud nueva. */
  datosIncompletos: boolean;
  /**
   * Cambio de estado sugerido, solo cuando el correo lo justifica claramente.
   *
   * No incluye CERRADO a propósito: entregarle los documentos al cliente ya
   * cierra el caso, así que un correo de agradecimiento o de confirmación no
   * lo mueve a ningún sitio. CERRADO es para el trámite que muere sin
   * entregarse, y eso lo decide una persona, no la lectura del buzón.
   */
  estadoSugerido?: "REPROCESO" | "ENVIADO_CLIENTE";
}

const PROMPT_SISTEMA = `Clasificas correos del buzón endosos@cuanticoseguros.com de una agencia de
seguros colombiana (Cuántico Seguros). Un ENDOSO es el certificado que le
permite a un banco quedar como beneficiario del seguro de un apartamento
cuando el propietario saca un crédito hipotecario o un leasing.

Clasifica cada correo en exactamente uno de estos tipos:
- SOLICITUD_NUEVA: un cliente pide un endoso por primera vez.
- REPROCESO: el banco devolvió un endoso ya tramitado y pide corregir algo
  (puede venir directo del cliente o reenviado del portal del banco).
- RESPUESTA_ASEGURADORA: la aseguradora contesta con el documento adjunto a
  una solicitud que ya se había radicado.
- PREGUNTA_SEGUIMIENTO: el cliente pregunta por el estado, sin traer datos
  nuevos.
- CIERRE: confirman que el caso ya se resolvió.
- REENVIO_TERCERO: un administrador u otra persona reenvía la solicitud o
  pregunta de alguien más — no está claro quién es el verdadero interesado.
- RUIDO: agradecimientos, correos comerciales, avisos no relacionados con
  endosos de clientes (pólizas de autos, renovaciones de otro ramo, etc.)

Para SOLICITUD_NUEVA o REPROCESO, extrae también los datos que el correo
traiga: urbanización/copropiedad, nombre del cliente, cédula, un segundo
deudor si lo hay (frecuente en leasing), dirección completa (nomenclatura,
ciudad, torre, apartamento, cuarto útil, parqueadero), valor solicitado,
banco, NIT del banco, tipo de crédito (HIPOTECARIO o LEASING), correo y
celular del solicitante.

REGLAS DURAS:
- Nunca inventes ni completes un dato que el correo no traiga explícito.
  Deja el campo vacío en vez de adivinar.
- Si para una SOLICITUD_NUEVA falta el valor solicitado o el banco, marca
  datosIncompletos=true — sin esos dos datos no se puede radicar.
- estadoSugerido solo se llena cuando el correo cambia el estado real del
  caso. Una simple pregunta no cambia el estado: déjalo vacío.
- DÓNDE TERMINA UN CASO: en ENVIADO_CLIENTE. Entregarle los cuatro
  documentos (endoso, carátula, certificado de pago y clausulado) ES el
  cierre del trámite; no hay ningún estado posterior que marcar. Un correo
  de tipo CIERRE —el cliente agradece, confirma que ya lo radicó en el
  banco— NO cambia el estado: deja estadoSugerido en null y limítate a
  dejar la nota en la bitácora.
- EL ÚNICO CAMINO DE VUELTA es REPROCESO: si el cliente avisa de que el
  banco se lo devolvió, el caso se REABRE con estadoSugerido=REPROCESO,
  aunque ya estuviera en ENVIADO_CLIENTE.
- El resumen es la nota que va a quedar en la bitácora del caso: que sea
  legible para una persona, en español, sin tecnicismos de sistema.

Responde ÚNICAMENTE con un objeto JSON con esta forma exacta, sin texto
antes ni después:
{
  "tipo": "SOLICITUD_NUEVA" | "REPROCESO" | "RESPUESTA_ASEGURADORA" | "PREGUNTA_SEGUIMIENTO" | "CIERRE" | "REENVIO_TERCERO" | "RUIDO",
  "resumen": "...",
  "datos": { ...campos que apliquen, omite los que el correo no traiga... },
  "datosIncompletos": true | false,
  "estadoSugerido": "REPROCESO" | "ENVIADO_CLIENTE" | null
}`;

export async function clasificarCorreo(params: {
  asunto: string;
  remitente: string;
  cuerpo: string;
}): Promise<Clasificacion> {
  const respuesta = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 1500,
    system: PROMPT_SISTEMA,
    messages: [
      {
        role: "user",
        content: `De: ${params.remitente}\nAsunto: ${params.asunto}\n\n${params.cuerpo}`,
      },
    ],
  });

  const bloque = respuesta.content.find((b) => b.type === "text");
  const texto = bloque && bloque.type === "text" ? bloque.text : "";

  let json: unknown;
  try {
    // Claude a veces envuelve el JSON en una valla de código pese a la
    // instrucción; se pela por si acaso, en vez de fallar la corrida entera.
    const limpio = texto.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    json = JSON.parse(limpio);
  } catch {
    throw new Error(`La respuesta de Claude no fue JSON válido: ${texto.slice(0, 300)}`);
  }

  const c = json as Partial<Clasificacion>;
  if (!c.tipo || !TIPOS_CORREO.includes(c.tipo)) {
    throw new Error(`Tipo de correo inválido o ausente en la respuesta: ${JSON.stringify(json).slice(0, 300)}`);
  }

  return {
    tipo: c.tipo,
    resumen: c.resumen ?? "",
    datos: c.datos ?? {},
    datosIncompletos: c.datosIncompletos ?? false,
    estadoSugerido: c.estadoSugerido ?? undefined,
  };
}
