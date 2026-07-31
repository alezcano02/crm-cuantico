import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirSesion } from "@/lib/auth";

export const runtime = "nodejs";

function texto(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s === "" ? null : s;
}

function numero(v: unknown): number {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/[$.\s]/g, "").replace(",", "."));
    if (isFinite(n)) return n;
  }
  return 0;
}

function fecha(v: unknown): Date | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Edita una cancelación del histórico.
 *
 * Las dos fechas alimentan métricas distintas del seguimiento de producción:
 * FECHA RENOVACIÓN suma a "producción cancelada" (por mes de renovación) y
 * FECHA CANCELACIÓN a "cancelaciones" (por mes real). Cambiarlas mueve esas
 * cifras, por eso se editan de forma explícita.
 *
 * Al editar, el registro queda marcado como manual para que una reimportación
 * del Excel no lo sobrescriba.
 */
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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const numeroPoliza = texto(body.numero);
  const ramo = texto(body.ramo);
  if (!numeroPoliza || !ramo) {
    return NextResponse.json(
      { error: "La póliza y el ramo son obligatorios." },
      { status: 400 }
    );
  }

  const fechaCancelacion = fecha(body.fechaCancelacion);
  const fechaRenovacion = fecha(body.fechaRenovacion);
  if (!fechaCancelacion && !fechaRenovacion) {
    return NextResponse.json(
      { error: "Indique al menos la fecha de cancelación o la de renovación." },
      { status: 400 }
    );
  }

  try {
    await prisma.cancellation.update({
      where: { id },
      data: {
        numero: numeroPoliza,
        ramo,
        asegurado: texto(body.asegurado),
        ccNit: texto(body.ccNit),
        placa: texto(body.placa),
        aseguradora: texto(body.aseguradora),
        asesor: texto(body.asesor),
        tipoNegocio: texto(body.tipoNegocio)?.toUpperCase() ?? null,
        motivo: texto(body.motivo),
        fechaCancelacion,
        fechaRenovacion,
        primaNeta: numero(body.primaNeta),
        primaTotal: numero(body.primaTotal),
        manual: true,
      },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Cancelación no encontrada." }, { status: 404 });
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
    await prisma.cancellation.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Cancelación no encontrada." }, { status: 404 });
  }
}
