import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { crearSesion, verificarClave } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { usuario?: string; clave?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const usuario = (body.usuario ?? "").trim();
  const clave = body.clave ?? "";
  if (!usuario || !clave) {
    return NextResponse.json(
      { error: "Escriba su usuario y su contraseña." },
      { status: 400 }
    );
  }

  const registro = await prisma.usuario.findUnique({ where: { usuario } });

  // Mismo mensaje tanto si el usuario no existe como si la clave es incorrecta,
  // para no revelar qué usuarios están registrados.
  const invalido = NextResponse.json(
    { error: "Usuario o contraseña incorrectos." },
    { status: 401 }
  );
  if (!registro || !registro.activo) return invalido;
  if (!verificarClave(clave, registro.claveHash)) return invalido;

  await crearSesion(registro.id);
  return NextResponse.json({
    ok: true,
    usuario: registro.usuario,
    nombre: registro.nombre,
  });
}
