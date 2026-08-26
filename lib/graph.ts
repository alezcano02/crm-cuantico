/**
 * Acceso al correo de endosos vía Microsoft Graph, con credenciales de
 * aplicación (client credentials) en vez de una sesión de usuario.
 *
 * Existe porque esta ruta corre como tarea programada de Vercel, sin nadie
 * frente a la pantalla: no hay con quién hacer el inicio de sesión
 * interactivo que usa el resto del CRM. La aplicación se registra una vez en
 * Azure AD con permiso de aplicación `Mail.Read` sobre Microsoft Graph
 * (consentido por un administrador del tenant), y con eso puede leer
 * cualquier buzón del dominio — en la práctica, solo se usa para
 * endosos@cuanticoseguros.com.
 *
 * Variables de entorno necesarias:
 *   MICROSOFT_TENANT_ID     — Id. de directorio (inquilino) del registro
 *   MICROSOFT_CLIENT_ID     — Id. de aplicación (cliente)
 *   MICROSOFT_CLIENT_SECRET — el secreto de cliente generado en Azure
 */

const GRAPH = "https://graph.microsoft.com/v1.0";
const BUZON = "endosos@cuanticoseguros.com";

let tokenCache: { valor: string; expiraEn: number } | null = null;

/**
 * Token de aplicación, cacheado en memoria mientras dure el proceso.
 *
 * Cada invocación de la tarea programada es un proceso nuevo (serverless),
 * así que este caché solo ayuda dentro de una misma ejecución si se piden
 * varios tokens — no persiste entre corridas, y no hace falta que persista:
 * pedir uno nuevo cada hora no cuesta nada.
 */
async function obtenerToken(): Promise<string> {
  const ahora = Date.now();
  if (tokenCache && tokenCache.expiraEn > ahora + 60_000) return tokenCache.valor;

  const tenant = requerirEnv("MICROSOFT_TENANT_ID");
  const clientId = requerirEnv("MICROSOFT_CLIENT_ID");
  const clientSecret = requerirEnv("MICROSOFT_CLIENT_SECRET");

  const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  if (!r.ok) {
    throw new Error(`No se pudo autenticar contra Microsoft Graph: HTTP ${r.status} — ${await r.text()}`);
  }
  const j = (await r.json()) as { access_token: string; expires_in: number };
  tokenCache = { valor: j.access_token, expiraEn: ahora + j.expires_in * 1000 };
  return j.access_token;
}

function requerirEnv(nombre: string): string {
  const v = process.env[nombre];
  if (!v) throw new Error(`Falta la variable de entorno ${nombre}.`);
  return v;
}

export interface CorreoEndoso {
  id: string;
  internetMessageId: string;
  asunto: string;
  remitente: string;
  recibido: string; // ISO
  cuerpoTexto: string;
}

/**
 * Correos de la bandeja de endosos recibidos después de `desde`.
 *
 * Trae el cuerpo completo en la misma llamada (no hace falta una segunda
 * petición por correo, a diferencia del flujo por MCP): Graph permite pedir
 * `body` directamente en el listado.
 */
export async function correosDesde(desde: Date): Promise<CorreoEndoso[]> {
  const token = await obtenerToken();
  const filtro = `receivedDateTime ge ${desde.toISOString()}`;
  const url =
    `${GRAPH}/users/${encodeURIComponent(BUZON)}/mailFolders/inbox/messages` +
    `?$filter=${encodeURIComponent(filtro)}` +
    `&$orderby=receivedDateTime desc` +
    `&$select=id,internetMessageId,subject,from,receivedDateTime,body` +
    `&$top=50`;

  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) {
    throw new Error(`Graph devolvió HTTP ${r.status} al listar el buzón: ${await r.text()}`);
  }
  const j = (await r.json()) as {
    value: {
      id: string;
      internetMessageId: string;
      subject: string;
      from?: { emailAddress?: { address?: string; name?: string } };
      receivedDateTime: string;
      body?: { content?: string; contentType?: string };
    }[];
  };

  return j.value.map((m) => ({
    id: m.id,
    internetMessageId: m.internetMessageId,
    asunto: m.subject ?? "(sin asunto)",
    remitente: m.from?.emailAddress?.address ?? m.from?.emailAddress?.name ?? "desconocido",
    recibido: m.receivedDateTime,
    cuerpoTexto: aTexto(m.body?.content ?? "", m.body?.contentType),
  }));
}

/** El cuerpo llega en HTML la mayoría de las veces; se deja en texto plano. */
function aTexto(cuerpo: string, tipo?: string): string {
  if (tipo !== "html") return cuerpo;
  return cuerpo
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&aacute;/g, "á")
    .replace(/&eacute;/g, "é")
    .replace(/&iacute;/g, "í")
    .replace(/&oacute;/g, "ó")
    .replace(/&uacute;/g, "ú")
    .replace(/&ntilde;/g, "ñ")
    .replace(/\s+/g, " ")
    .trim();
}
