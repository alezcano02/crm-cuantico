/**
 * La aplicación cuelga de /funcionarios (ver next.config.mjs), porque se sirve
 * dentro de cuanticoseguros.com.co.
 *
 * Next añade ese prefijo solo donde lo controla él: los `Link`, el router,
 * `redirect()` y `/_next/*`. **A `fetch()` no**, porque es una llamada del
 * navegador y Next no la ve. Un `fetch("/api/…")` desde el cliente iría a
 * cuanticoseguros.com.co/api/… y daría 404 en Netlify.
 *
 * Por eso todas las llamadas a la API pasan por `api()`.
 */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "/funcionarios";

/**
 * Ruta absoluta hacia una API de la aplicación, con el prefijo puesto.
 *
 *   fetch(api("/api/auth/login"), { … })
 */
export function api(ruta: string): string {
  return `${BASE}${ruta.startsWith("/") ? ruta : `/${ruta}`}`;
}

/** El prefijo, por si hace falta construir una URL a mano. */
export const BASE_PATH = BASE;
