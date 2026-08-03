/**
 * Lee la respuesta de una petición del CRM sin romperse.
 *
 * `res.json()` lanza si el cuerpo no es JSON, y entonces el usuario ve
 * "Unexpected end of JSON input" en vez de qué pasó. Eso ocurre de verdad: un
 * error no controlado en el servidor, un tiempo de espera agotado o una caída
 * de red devuelven un cuerpo vacío o una página HTML.
 *
 * Aquí se traduce a un mensaje que un asesor pueda entender y accionar.
 */
export async function leerRespuesta(res: Response): Promise<Record<string, unknown>> {
  const texto = await res.text().catch(() => "");
  if (texto) {
    try {
      return JSON.parse(texto) as Record<string, unknown>;
    } catch {
      // Cuerpo no-JSON (normalmente la página de error de Next).
    }
  }
  if (res.ok) return {};
  return { error: mensajePorEstado(res.status) };
}

function mensajePorEstado(status: number): string {
  if (status === 401)
    return "Su sesión expiró. Vuelva a ingresar y repita la operación.";
  if (status === 403) return "No tiene permiso para hacer este cambio.";
  if (status === 404)
    return "El registro ya no existe: alguien pudo haberlo cambiado o eliminado. Actualice la página.";
  if (status === 409)
    return "Otro usuario modificó este registro al mismo tiempo. Actualice la página e inténtelo de nuevo.";
  if (status === 413) return "El archivo es demasiado grande para subirlo.";
  if (status === 504 || status === 408)
    return "El servidor tardó demasiado en responder. Inténtelo de nuevo.";
  if (status >= 500)
    return "El servidor falló al procesar la operación. No se guardó nada; inténtelo de nuevo.";
  return `No se pudo completar la operación (error ${status}).`;
}

/**
 * Lanza con el mensaje del servidor si la respuesta no fue correcta; si lo fue,
 * devuelve el cuerpo ya leído.
 *
 *   const json = await exigirOk(res, "Error al cancelar.");
 */
export async function exigirOk<T = Record<string, unknown>>(
  res: Response,
  mensajePorDefecto: string
): Promise<T> {
  const json = await leerRespuesta(res);
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" && json.error ? json.error : mensajePorDefecto
    );
  }
  return json as T;
}
