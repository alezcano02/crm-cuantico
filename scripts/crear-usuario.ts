/**
 * Crea o actualiza un usuario del CRM.
 *
 *   npx tsx scripts/crear-usuario.ts <usuario> <clave> ["Nombre completo"]
 *
 * La clave se guarda cifrada con scrypt: nunca queda en el repositorio ni en
 * la base en texto plano. Si el usuario ya existe, se le cambia la clave.
 */
import { PrismaClient } from "@prisma/client";
import { hashClave } from "../lib/auth";

const prisma = new PrismaClient();

const [, , usuario, clave, nombre] = process.argv;

if (!usuario || !clave) {
  console.error(
    'Uso: npx tsx scripts/crear-usuario.ts <usuario> <clave> ["Nombre completo"]'
  );
  process.exit(1);
}

if (clave.length < 8) {
  console.error("La clave debe tener al menos 8 caracteres.");
  process.exit(1);
}

(async () => {
  const claveHash = hashClave(clave);
  const existente = await prisma.usuario.findUnique({ where: { usuario } });

  if (existente) {
    await prisma.usuario.update({
      where: { usuario },
      data: { claveHash, activo: true, ...(nombre ? { nombre } : {}) },
    });
    // Al cambiar la clave se cierran las sesiones abiertas de ese usuario.
    await prisma.sesion.deleteMany({ where: { usuarioId: existente.id } });
    console.log(`Usuario "${usuario}" actualizado (clave cambiada, sesiones cerradas).`);
  } else {
    await prisma.usuario.create({
      data: { usuario, claveHash, nombre: nombre ?? null },
    });
    console.log(`Usuario "${usuario}" creado.`);
  }

  const total = await prisma.usuario.count({ where: { activo: true } });
  console.log(`Usuarios activos: ${total}`);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
