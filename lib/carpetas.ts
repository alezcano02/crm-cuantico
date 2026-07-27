/**
 * Acceso a los documentos del cliente en la unidad compartida de la empresa.
 *
 * Se llega por el BUSCADOR de SharePoint, no con un enlace directo a la
 * carpeta. Se intentó enlazar cada cliente con su carpeta
 * (4. Asesores/<Asesor>/Clientes/<CLIENTE>) construyendo la dirección a mano,
 * pero esas direcciones daban error al abrirlas, así que se quitó: buscar por
 * nombre es más lento pero funciona siempre, aunque la carpeta se renombre,
 * se mueva de asesor o el nombre no coincida exactamente con el del Excel.
 *
 * Si algún día se quieren enlaces directos, lo correcto sería pedirlos a la
 * API de Microsoft Graph (que devuelve la webUrl real de cada carpeta) en vez
 * de armar la dirección por nuestra cuenta.
 */

export const SITIO = "https://cuanticoseguros.sharepoint.com/sites/cuanticoseguros";

/** Busca al cliente por nombre dentro del sitio de la empresa. */
export function urlBusqueda(nombreCliente: string): string {
  return `${SITIO}/_layouts/15/search.aspx?q=${encodeURIComponent(nombreCliente)}`;
}
