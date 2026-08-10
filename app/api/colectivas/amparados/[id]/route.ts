import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirColectivas } from "@/lib/auth";
import { invalidarCartera } from "@/lib/cache";

export const runtime = "nodejs";

/**
 * Actualiza un amparado: cambio de estado, radicado, prima… y el RETIRO.
 *
 * El retiro no borra la fila. Se le pone fecha de retiro y estado RETIRADO,
 * porque hay que poder demostrar meses después quién estuvo cubierto y hasta
 * cuándo: una reclamación llega tarde y la póliza se cobra por período.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const noAutorizado = await exigirColectivas();
  if (noAutorizado) return noAutorizado;

  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Identificador inválido." }, { status: 400 });
  }

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const amparado = await prisma.amparadoColectiva.findUnique({ where: { id } });
  if (!amparado) {
    return NextResponse.json({ error: "No se encontró la persona." }, { status: 404 });
  }

  const texto = (k: string) => {
    const v = b[k];
    if (v === null) return null;
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  const numero = (k: string) => {
    const v = b[k];
    if (v === null) return null;
    if (v === undefined || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const retirar = b.retirar === true;
  const fechaRetiro = retirar
    ? texto("fechaRetiro")
      ? new Date(texto("fechaRetiro")!)
      : new Date()
    : undefined;

  const datos: Record<string, unknown> = {};
  for (const k of ["estado", "radicado", "observacion", "plan", "parentesco"] as const) {
    const v = texto(k);
    if (v !== undefined) datos[k] = v;
  }
  for (const k of ["valorAsegurado", "primaMensual"] as const) {
    const v = numero(k);
    if (v !== undefined) datos[k] = v;
  }
  if (retirar) {
    datos.fechaRetiro = fechaRetiro;
    datos.estado = "RETIRADO";
  }

  await prisma.$transaction(async (tx) => {
    await tx.amparadoColectiva.update({ where: { id }, data: datos });
    // Solo el retiro genera novedad automática: un cambio de radicado o de
    // prima no es un movimiento de personas, y llenar la bitácora de esos
    // haría imposible leer los que sí importan.
    if (retirar) {
      await tx.novedadColectiva.create({
        data: {
          empresaId: amparado.empresaId,
          amparadoId: amparado.id,
          tipo: "RETIRO",
          fecha: fechaRetiro!,
          estado: "SOLICITADA",
          radicado: texto("radicado") ?? amparado.radicado,
          nombreAmparado: amparado.nombreAmparado,
          docAmparado: amparado.docAmparado,
          nota: texto("nota") ?? null,
        },
      });
    }
  });

  invalidarCartera();

  return NextResponse.json({ ok: true });
}
