import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirSesion } from "@/lib/auth";
import { invalidarCartera } from "@/lib/cache";
import { situacionDeTexto } from "@/lib/prospectos";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const noAutorizado = await exigirSesion();
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

  const t = (k: string) => {
    const v = b[k];
    return typeof v === "string" ? (v.trim() || null) : undefined;
  };

  const datos: Record<string, unknown> = {};
  for (const k of ["nombre", "administrador", "compania", "estado", "asesor", "nota", "polizaNumero"] as const) {
    const v = t(k);
    if (v !== undefined) datos[k] = v;
  }
  const fi = t("fechaInicio");
  if (fi !== undefined) datos.fechaInicio = fi ? new Date(fi) : null;

  // Si cambia el texto del estado y no se dijo la situación a mano, se vuelve a
  // deducir: así el contador de pendientes no se queda mintiendo cuando alguien
  // escribe «ya la perdimos» y se olvida de tocar el desplegable.
  const sit = t("situacion");
  if (sit) datos.situacion = sit;
  else if (datos.estado !== undefined) datos.situacion = situacionDeTexto(datos.estado as string | null);

  if (!Object.keys(datos).length) {
    return NextResponse.json({ error: "No hay nada que cambiar." }, { status: 400 });
  }

  try {
    await prisma.prospecto.update({ where: { id }, data: datos });
  } catch {
    return NextResponse.json({ error: "El prospecto no existe." }, { status: 404 });
  }

  invalidarCartera();
  return NextResponse.json({ ok: true, id });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const noAutorizado = await exigirSesion();
  if (noAutorizado) return noAutorizado;

  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Identificador inválido." }, { status: 400 });
  }
  try {
    await prisma.prospecto.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "El prospecto no existe." }, { status: 404 });
  }
  invalidarCartera();
  return NextResponse.json({ ok: true });
}
