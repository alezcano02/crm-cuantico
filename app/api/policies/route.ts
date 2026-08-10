import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { datosPolizaDesdeBody, ErrorValidacion } from "./validacion";
import { exigirSesion } from "@/lib/auth";
import { invalidarCartera } from "@/lib/cache";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const noAutorizado = await exigirSesion();
  if (noAutorizado) return noAutorizado;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  try {
    const data = datosPolizaDesdeBody(body, { requerirObligatorios: true });
    const poliza = await prisma.policy.create({ data });
    invalidarCartera();
    return NextResponse.json({ ok: true, id: poliza.id });
  } catch (e) {
    if (e instanceof ErrorValidacion) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "No se pudo crear la póliza." }, { status: 500 });
  }
}
