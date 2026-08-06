import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirColectivas } from "@/lib/auth";
import { ESTADOS_NOVEDAD } from "@/lib/colectivas";

export const runtime = "nodejs";

/**
 * Confirma o rechaza una novedad cuando responde la aseguradora.
 *
 * Al confirmar una INCLUSION se pasa el amparado a EXPEDIDO, que es lo que
 * significa: la aseguradora lo aceptó. Se hace aquí y no a mano para que el
 * estado del amparado y el de su novedad no se separen.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const noAutorizado = await exigirColectivas();
  if (noAutorizado) return noAutorizado;

  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Identificador inválido." }, { status: 400 });
  }

  let b: { estado?: string; radicado?: string; nota?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const estado = (b.estado ?? "").trim().toUpperCase();
  if (!ESTADOS_NOVEDAD.includes(estado as (typeof ESTADOS_NOVEDAD)[number])) {
    return NextResponse.json(
      { error: `Estado inválido. Use: ${ESTADOS_NOVEDAD.join(", ")}.` },
      { status: 400 }
    );
  }

  const novedad = await prisma.novedadColectiva.findUnique({ where: { id } });
  if (!novedad) {
    return NextResponse.json({ error: "No se encontró la novedad." }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.novedadColectiva.update({
      where: { id },
      data: {
        estado,
        radicado: b.radicado?.trim() || novedad.radicado,
        nota: b.nota?.trim() ?? novedad.nota,
      },
    });

    if (!novedad.amparadoId) return;
    if (estado === "CONFIRMADA" && novedad.tipo === "INCLUSION") {
      await tx.amparadoColectiva.update({
        where: { id: novedad.amparadoId },
        data: { estado: "EXPEDIDO", radicado: b.radicado?.trim() || undefined },
      });
    }
    if (estado === "RECHAZADA" && novedad.tipo === "INCLUSION") {
      await tx.amparadoColectiva.update({
        where: { id: novedad.amparadoId },
        data: { estado: "RECHAZADO" },
      });
    }
    // Un retiro rechazado devuelve a la persona a la cobertura: si no, se
    // quedaría fuera del listado sin estarlo de verdad.
    if (estado === "RECHAZADA" && novedad.tipo === "RETIRO") {
      await tx.amparadoColectiva.update({
        where: { id: novedad.amparadoId },
        data: { estado: "EXPEDIDO", fechaRetiro: null },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
