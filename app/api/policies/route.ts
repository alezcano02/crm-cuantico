import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { datosPolizaDesdeBody, ErrorValidacion } from "./validacion";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  try {
    const data = datosPolizaDesdeBody(body, { requerirObligatorios: true });
    const poliza = await prisma.policy.create({ data });
    return NextResponse.json({ ok: true, id: poliza.id });
  } catch (e) {
    if (e instanceof ErrorValidacion) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "No se pudo crear la póliza." }, { status: 500 });
  }
}
