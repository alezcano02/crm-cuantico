import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function fecha(v: unknown): Date | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Cancela una póliza: crea el registro en CANCELACIONES (marcado como manual
 * para que la reimportación del Excel no lo borre) y la retira de la cartera
 * activa. Es una sola transacción: o se mueve completa, o no se toca nada.
 *
 * - fechaCancelacion alimenta la métrica "cancelaciones" (por mes real).
 * - fechaRenovacion alimenta "producción cancelada" (por mes de renovación);
 *   por defecto toma el vencimiento vigente de la póliza.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const poliza = await prisma.policy.findUnique({ where: { id } });
  if (!poliza) {
    return NextResponse.json({ error: "Póliza no encontrada." }, { status: 404 });
  }

  const fechaCancelacion = fecha(body.fechaCancelacion) ?? null;
  if (!fechaCancelacion) {
    return NextResponse.json(
      { error: "Indique la fecha de cancelación (AAAA-MM-DD)." },
      { status: 400 }
    );
  }
  const fechaRenovacion = fecha(body.fechaRenovacion) ?? poliza.vencimiento ?? null;

  await prisma.$transaction(async (tx) => {
    await tx.cancellation.create({
      data: {
        numero: poliza.numero,
        ramo: poliza.ramo,
        fechaRenovacion,
        fechaCancelacion,
        tipoNegocio: "CANCELACION",
        asegurado: poliza.asegurado,
        ccNit: poliza.ccNit,
        placa: poliza.placa,
        asesor: poliza.asesor1 ?? poliza.asesor2 ?? null,
        aseguradora: poliza.aseguradora,
        primaNeta: poliza.primaNeta,
        primaTotal: poliza.primaTotal,
        manual: true,
      },
    });
    await tx.policy.delete({ where: { id } });
  });

  return NextResponse.json({ ok: true });
}
