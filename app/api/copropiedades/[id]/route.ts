import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirSesion } from "@/lib/auth";
import { normalizarAseguradora } from "@/lib/endosos";

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
    return typeof v === "string" ? v.trim() || null : undefined;
  };

  const datos: Record<string, unknown> = {};
  for (const k of [
    "nombre",
    "nit",
    "numeroPoliza",
    "pazSalvoEstado",
    "motivoBloqueo",
    "nota",
  ] as const) {
    const v = t(k);
    if (v !== undefined) datos[k] = v;
  }

  const aseg = t("aseguradora");
  if (aseg !== undefined) datos.aseguradora = normalizarAseguradora(aseg);

  if ("valorAseguradoTotal" in b) {
    const v = b.valorAseguradoTotal;
    if (v === null || v === "") datos.valorAseguradoTotal = null;
    else if (typeof v === "number") datos.valorAseguradoTotal = Number.isFinite(v) ? v : null;
    else if (typeof v === "string") {
      const limpio = v.replace(/[^\d]/g, "");
      datos.valorAseguradoTotal = limpio ? Number(limpio) : null;
    }
  }

  for (const k of ["vigenciaHasta", "pazSalvoVigenteHasta"] as const) {
    const v = t(k);
    if (v !== undefined) datos[k] = v ? new Date(v) : null;
  }

  if (typeof b.admiteEndosos === "boolean") datos.admiteEndosos = b.admiteEndosos;

  if (!Object.keys(datos).length) {
    return NextResponse.json({ error: "No hay nada que cambiar." }, { status: 400 });
  }

  try {
    await prisma.copropiedad.update({ where: { id }, data: datos });
  } catch {
    return NextResponse.json({ error: "La copropiedad no existe." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, id });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const noAutorizado = await exigirSesion();
  if (noAutorizado) return noAutorizado;

  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Identificador inválido." }, { status: 400 });
  }
  // Los endosos no se borran con la ficha: quedan con su nombre en texto y sin
  // enlace (onDelete: SetNull en el esquema). Un edificio se puede dar de baja
  // sin perder el historial de lo que se le tramitó.
  try {
    await prisma.copropiedad.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "La copropiedad no existe." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
