/**
 * Enlaces a las carpetas de documentos de los clientes en la unidad
 * compartida de la empresa.
 *
 * La biblioteca es el sitio de SharePoint del equipo; en los computadores se
 * ve sincronizada como
 *   C:\Users\<usuario>\Cuántico Seguros LTDA\Cuántico Seguros - General
 * y en la web vive en la URL de abajo. Como el CRM corre en la nube, los
 * enlaces tienen que ser de SharePoint (una ruta local tipo file:// no se
 * puede abrir desde una página web por seguridad del navegador).
 *
 * Estructura de las carpetas:
 *   4. Asesores / <Asesor> / Clientes / <NOMBRE DEL CLIENTE>
 */

export const SITIO = "https://cuanticoseguros.sharepoint.com/sites/cuanticoseguros";
export const BIBLIOTECA = "Shared Documents";

/**
 * Clave de comparación de nombres: sin tildes, sin espacios y sin signos.
 * Así "FARUM APARTAMENTOS P.H", "FARUM APARTAMENTOS PH" y
 * "Farum Apartamentos p.h." dan todas la misma clave.
 */
export function claveCliente(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Ruta relativa dentro de la biblioteca, p. ej. "4. Asesores/Clara Osorio/Clientes/PEPITO". */
export function rutaCliente(asesor: string, cliente: string): string {
  return `4. Asesores/${asesor}/Clientes/${cliente}`;
}

/** Enlace que abre la carpeta en SharePoint. */
export function urlCarpeta(rutaRelativa: string): string {
  const rutaServidor = `/sites/cuanticoseguros/${BIBLIOTECA}/${rutaRelativa}`;
  return `${SITIO}/${encodeURIComponent(BIBLIOTECA)}/Forms/AllItems.aspx?id=${encodeURIComponent(rutaServidor)}`;
}

/**
 * Enlace de búsqueda en el sitio. Se usa cuando el cliente no tiene carpeta
 * detectada: siempre funciona, aunque el nombre no coincida exactamente.
 */
export function urlBusqueda(nombreCliente: string): string {
  return `${SITIO}/_layouts/15/search.aspx?q=${encodeURIComponent(nombreCliente)}`;
}
