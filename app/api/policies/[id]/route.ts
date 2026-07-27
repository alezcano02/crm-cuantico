import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { datosPolizaDesdeBody, ErrorValidacion } from "../validacion";
import { exigirSesion } from "@/lib/auth";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const noAutorizado = await exigirSesion();
  if (noAutorizado) return noAutorizado;
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  try {
    const data = datosPolizaDesdeBody(body, { requerirObligatorios: true });
    await prisma.policy.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ErrorValidacion) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Póliza no encontrada." }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const noAutorizado = await exigirSesion();
  if (noAutorizado) return noAutorizado;
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }
  try {
    await prisma.policy.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Póliza no encontrada." }, { status: 404 });
  }
}
