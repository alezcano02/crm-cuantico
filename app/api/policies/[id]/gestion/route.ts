import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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
  let body: { gestionada?: boolean; nota?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }
  const gestionada = body.gestionada === true;
  try {
    const poliza = await prisma.policy.update({
      where: { id },
      data: {
        gestionada,
        notaGestion: body.nota?.trim() || null,
        gestionadaEn: gestionada ? new Date() : null,
      },
    });
    return NextResponse.json({ ok: true, id: poliza.id });
  } catch {
    return NextResponse.json({ error: "póliza no encontrada" }, { status: 404 });
  }
}
