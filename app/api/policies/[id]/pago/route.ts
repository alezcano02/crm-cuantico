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
 * Registra el pago de una póliza (o lo revierte): marca el estado de pago y la
 * fecha de pago. Es la acción rápida de cobranza desde la vista de cartera.
 */
export async function PATCH(
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
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const pagada = body.pagada === true;
  const hoy = new Date();
  const hoyISO = `${hoy.getUTCFullYear()}-${String(hoy.getUTCMonth() + 1).padStart(2, "0")}-${String(hoy.getUTCDate()).padStart(2, "0")}`;

  try {
    await prisma.policy.update({
      where: { id },
      data: pagada
        ? {
            estadoPago: "OK PAGO",
            fechaPago: fecha(body.fechaPago) ?? fecha(hoyISO),
          }
        : { estadoPago: "PENDIENTE", fechaPago: null },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Póliza no encontrada." }, { status: 404 });
  }
}
