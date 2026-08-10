import { unstable_cache } from "next/cache";
import { revalidateTag } from "next/cache";

/**
 * Caché compartida de las consultas caras.
 *
 * POR QUÉ HACE FALTA
 *
 * Cada pantalla del CRM recalcula lo mismo desde cero: el dashboard y el
 * seguimiento leen la cartera entera, las cancelaciones y el histórico
 * (unos 350 ms contra Neon), y la barra lateral cuenta vencidas y mora en cada
 * navegación. Con una persona no se nota. Con veinte a la vez son veinte veces
 * el mismo trabajo, y como la base está en otro continente lo que se acumula no
 * es CPU sino ida y vuelta: la aplicación se queda esperando.
 *
 * Guardando el resultado unos segundos, veinte personas mirando el dashboard
 * hacen UNA consulta en vez de veinte.
 *
 * POR QUÉ NO SE QUEDA DESACTUALIZADO
 *
 * Porque no se confía en que el tiempo expire: cada vez que algo escribe
 * —registrar un pago, renovar, cancelar, importar el informe, tocar una
 * colectiva— se llama a `invalidarCartera()` y la caché se tira entera. El TTL
 * es solo la red de seguridad por si alguien escribe por una vía que se nos
 * olvidó etiquetar.
 *
 * Es deliberadamente corto (30 s): la ventana en que dos personas podrían ver
 * cifras distintas es la misma en que ya las verían por tener la pestaña
 * abierta sin recargar.
 */
export const TAG_CARTERA = "cartera";

/** Segundos que sobrevive un resultado sin que nadie lo invalide. */
const TTL = 30;

/**
 * Envuelve una consulta cara. `clave` debe ser única y estable, e incluir los
 * argumentos: dos llamadas con la misma clave devuelven lo mismo.
 */
export function cachearCartera<T>(clave: string[], consulta: () => Promise<T>): () => Promise<T> {
  /*
   * Fuera de Next no hay caché, y no debe haberla.
   *
   * Los scripts de mantenimiento (importar, revisar-sistema, cargar el mapa)
   * importan estas mismas funciones desde Node puro, donde `unstable_cache` no
   * tiene contexto de petición. Además, un script que revisa la base tiene que
   * leerla de verdad: servirle un resultado cacheado sería mentirle.
   */
  if (!process.env.NEXT_RUNTIME && typeof unstable_cache !== "function") return consulta;
  try {
    const envuelta = unstable_cache(consulta, clave, { revalidate: TTL, tags: [TAG_CARTERA] });
    return async () => {
      try {
        return await envuelta();
      } catch {
        return await consulta();
      }
    };
  } catch {
    return consulta;
  }
}

/**
 * Tira la caché. Llamar SIEMPRE después de escribir algo que se vea en
 * pantalla; es barato y evita que alguien registre un pago y no lo vea.
 */
export function invalidarCartera() {
  // Fuera de una petición de Next no hay nada que invalidar; que un script no
  // reviente por intentarlo.
  try {
    revalidateTag(TAG_CARTERA);
  } catch {
    /* sin contexto de petición */
  }
}
