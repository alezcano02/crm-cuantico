/**
 * Sobreescribe los usuarios del CRM con los de un Excel (Usuario / Nombre /
 * Contraseña), en una sola transacción.
 *
 *   npx tsx scripts/sincronizar-usuarios.ts "<archivo.xlsx>"
 *
 * Reglas:
 *  · administrativo@cuanticoseguros.com es especial: SOLO se le cambia el
 *    nombre. La clave y la sesión de quien está usando esto ahora mismo no se
 *    tocan.
 *  · A los demás usuarios del Excel se les cifra la clave con hashClave (la
 *    misma de scripts/crear-usuario.ts) y se les cierran las sesiones
 *    abiertas: si la clave cambió, las sesiones viejas ya no deberían valer.
 *  · Cualquier usuario que exista en la base y NO esté en el Excel se
 *    desactiva (activo = false) y se le cierran las sesiones. No se borra:
 *    es reversible.
 *
 * Nunca escribe una contraseña en texto plano en la salida.
 */
import { readFileSync } from "node:fs";
import xlsx from "xlsx";
import { prisma } from "../lib/prisma";
import { hashClave } from "../lib/auth";

const ADMIN = "administrativo@cuanticoseguros.com";

interface Fila {
  Usuario: string;
  Nombre: string;
  Contraseña: string;
}

async function main() {
  const ruta = process.argv[2];
  if (!ruta) {
    console.log('Uso: npx tsx scripts/sincronizar-usuarios.ts "<archivo.xlsx>"');
    process.exit(1);
  }

  const wb = xlsx.read(readFileSync(ruta));
  const hoja = wb.Sheets[wb.SheetNames[0]];
  const filas = xlsx.utils.sheet_to_json<Fila>(hoja, { defval: "" });

  const delExcel = filas
    .map((f) => ({
      usuario: String(f.Usuario ?? "").trim().toLowerCase(),
      nombre: String(f.Nombre ?? "").trim() || null,
      clave: String(f.Contraseña ?? "").trim(),
    }))
    .filter((f) => f.usuario);

  if (delExcel.length === 0) {
    console.log("El Excel no trajo ninguna fila con Usuario. No se cambió nada.");
    process.exit(1);
  }
  const corta = delExcel.filter((f) => f.usuario !== ADMIN && f.clave.length < 8);
  if (corta.length) {
    console.log("Claves de menos de 8 caracteres, no se hace nada:");
    for (const f of corta) console.log(`  ${f.usuario}`);
    process.exit(1);
  }

  const enUso = new Set(delExcel.map((f) => f.usuario));
  const existentes = await prisma.usuario.findMany();
  const porUsuario = new Map(existentes.map((u) => [u.usuario.toLowerCase(), u]));

  const sesionesACerrar: number[] = [];
  const resumen: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (const f of delExcel) {
      const previo = porUsuario.get(f.usuario);

      if (f.usuario === ADMIN) {
        // Caso especial: solo el nombre. La clave y la sesión actual no se
        // tocan, así que aquí no se cierra ninguna sesión.
        if (previo) {
          await tx.usuario.update({
            where: { id: previo.id },
            data: { nombre: f.nombre, activo: true },
          });
          resumen.push(`${f.usuario}: solo se cambió el nombre a "${f.nombre}"`);
        } else {
          // No debería pasar, pero si el admin no existiera se crea igual,
          // con la clave del Excel, para no dejar a nadie sin acceso.
          await tx.usuario.create({
            data: { usuario: f.usuario, nombre: f.nombre, claveHash: hashClave(f.clave) },
          });
          resumen.push(`${f.usuario}: no existía, se creó con la clave del Excel`);
        }
        continue;
      }

      const claveHash = hashClave(f.clave);
      if (previo) {
        await tx.usuario.update({
          where: { id: previo.id },
          data: { nombre: f.nombre, claveHash, activo: true },
        });
        sesionesACerrar.push(previo.id);
        resumen.push(`${f.usuario}: actualizado (clave cambiada, sesiones cerradas)`);
      } else {
        const creado = await tx.usuario.create({
          data: { usuario: f.usuario, nombre: f.nombre, claveHash },
        });
        resumen.push(`${f.usuario}: creado`);
        void creado;
      }
    }

    // Quien esté en la base y no venga en el Excel se desactiva, no se borra.
    for (const u of existentes) {
      if (enUso.has(u.usuario.toLowerCase())) continue;
      await tx.usuario.update({ where: { id: u.id }, data: { activo: false } });
      sesionesACerrar.push(u.id);
      resumen.push(`${u.usuario}: no está en el Excel, se desactivó (no se borró)`);
    }

    if (sesionesACerrar.length) {
      await tx.sesion.deleteMany({ where: { usuarioId: { in: sesionesACerrar } } });
    }
  });

  console.log(resumen.join("\n"));
  console.log(`\nUsuarios activos ahora: ${await prisma.usuario.count({ where: { activo: true } })}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
