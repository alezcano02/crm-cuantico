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
    // Nace dentro de la aplicación, así que la próxima importación del informe
    // no debe borrarla: es la marca que hace que una póliza dada de alta aquí
    // —una colectiva que la operación gestiona en el CRM, por ejemplo— cuente
    // en producción de forma permanente. Ver el campo `manual` del modelo.
    const poliza = await prisma.policy.create({ data: { ...data, manual: true } });
    invalidarCartera();
    return NextResponse.json({ ok: true, id: poliza.id });
  } catch (e) {
    if (e instanceof ErrorValidacion) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "No se pudo crear la póliza." }, { status: 500 });
  }
}
