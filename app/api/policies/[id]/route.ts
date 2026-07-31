import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { datosPolizaDesdeBody, ErrorValidacion } from "../validacion";
import { exigirSesion } from "@/lib/auth";
import { CAMPOS_COBRANZA } from "@/lib/cobranza";

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

    // "Editar datos" toca la póliza entera, así que no basta con que se haya
    // guardado el formulario: solo se marca la cobranza como propia del CRM si
    // alguno de esos campos cambió de verdad. De lo contrario, corregir un
    // teléfono congelaría la cobranza de esa póliza frente al Excel.
    const previa = await prisma.policy.findUnique({ where: { id } });
    if (!previa) {
      return NextResponse.json({ error: "Póliza no encontrada." }, { status: 404 });
    }
    const cambioCobranza = CAMPOS_COBRANZA.some((campo) => {
      if (!(campo in data)) return false;
      const antes = previa[campo];
      const ahora = (data as Record<string, unknown>)[campo];
      if (antes instanceof Date || ahora instanceof Date) {
        return (
          (antes instanceof Date ? antes.getTime() : null) !==
          (ahora instanceof Date ? ahora.getTime() : null)
        );
      }
      return antes !== ahora;
    });

    await prisma.policy.update({
      where: { id },
      data: cambioCobranza ? { ...data, cobranzaEditadaEn: new Date() } : data,
    });
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
