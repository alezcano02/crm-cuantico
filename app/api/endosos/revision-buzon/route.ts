import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirSesion } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Deja constancia de cada pasada de la revisión automática del buzón.
 *
 * Lo llama la tarea programada al terminar, haya encontrado algo o no. Que
 * quede registrada una pasada SIN novedades es justo el caso importante: es lo
 * que distingue un buzón tranquilo de una revisión que dejó de correr, y sin
 * ese dato el tablero se ve igual en las dos situaciones.
 */
export async function POST(req: NextRequest) {
  const noAutorizado = await exigirSesion();
  if (noAutorizado) return noAutorizado;

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const entero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
  const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 400) : null);

  const revision = await prisma.revisionBuzon.create({
    data: {
      correosNuevos: entero(b.correosNuevos),
      casosTocados: entero(b.casosTocados),
      modelo: texto(b.modelo),
      resumen: texto(b.resumen),
    },
  });

  return NextResponse.json({ ok: true, id: revision.id, ejecutadaEn: revision.ejecutadaEn });
}
