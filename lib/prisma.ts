import { PrismaClient } from "@prisma/client";

/**
 * UNA CONEXIÓN POR INSTANCIA.
 *
 * Sin decirle nada, Prisma abre hasta CINCO conexiones por cada proceso. En un
 * servidor de toda la vida eso está bien, porque hay un proceso. En Vercel cada
 * petición simultánea puede levantar su propia instancia, así que veinte
 * personas a la vez son veinte instancias por cinco conexiones: cien contra una
 * base que no las tiene. Cuando se agotan, Prisma espera diez segundos y
 * responde «Timed out fetching a new connection from the connection pool», que
 * en pantalla se ve como un error del servidor al iniciar sesión.
 *
 * Una instancia atiende UNA petición cada vez, así que con una conexión le
 * basta. A cambio, las consultas que dentro de una misma petición se lanzaban
 * en paralelo pasan a hacerse en fila; son décimas, y la caché de lib/cache.ts
 * ya se había llevado por delante la mayoría de esas repeticiones.
 *
 * `pool_timeout` sube a 20 s para que un pico puntual espere en vez de fallar.
 *
 * Se hace aquí y no en la variable de entorno para que quede en el repositorio:
 * es una decisión de arquitectura, no un ajuste de despliegue que alguien pueda
 * borrar sin saber qué se lleva por delante.
 */
function urlConLimite(): string | undefined {
  const base = process.env.CRM_CUANTICO_POSTGRES_PRISMA_URL;
  if (!base) return undefined;
  try {
    const url = new URL(base);
    if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "1");
    if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "20");
    return url.toString();
  } catch {
    // Si la URL no se puede analizar se devuelve tal cual: mejor arrancar con
    // los valores por defecto que no arrancar.
    return base;
  }
}

/**
 * Cliente único.
 *
 * Se guarda en `globalThis` también en producción: una misma instancia atiende
 * varias peticiones seguidas y puede reevaluar este módulo, y sin el global
 * cada reevaluación abriría un pool nuevo dejando el anterior ocupando su
 * conexión.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const url = urlConLimite();

function crear(): PrismaClient {
  // Sin URL se deja que Prisma la lea del esquema como siempre: pasarle
  // `url: undefined` haría fallar el arranque en vez de usar el valor normal.
  if (!url) return new PrismaClient();
  return new PrismaClient({ datasources: { db: { url } } });
}

export const prisma = globalForPrisma.prisma ?? crear();

globalForPrisma.prisma = prisma;
