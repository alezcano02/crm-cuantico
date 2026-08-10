import { PrismaClient } from "@prisma/client";

/**
 * Cliente único de Prisma.
 *
 * Se guarda en `globalThis` TAMBIÉN en producción, no solo en desarrollo. En
 * Vercel cada instancia serverless evalúa los módulos por su cuenta, pero una
 * misma instancia atiende varias peticiones seguidas y puede reevaluar este
 * módulo; sin el global, cada reevaluación abría un pool nuevo contra Neon y
 * los pools viejos quedaban ocupando conexiones. Con veinte personas dentro a
 * la vez eso se nota: Neon empieza a rechazar conexiones antes de que la base
 * esté siquiera cargada.
 *
 * La URL ya apunta al `-pooler` de Neon (PgBouncer), así que el pool de aquí
 * habla con un pool que multiplexa: lo que hay que evitar es multiplicarlos.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

globalForPrisma.prisma = prisma;
