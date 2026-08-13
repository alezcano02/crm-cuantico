import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirSesion } from "@/lib/auth";
import { invalidarCartera } from "@/lib/cache";
import { situacionDeTexto } from "@/lib/prospectos";

export const runtime = "nodejs";

function texto(b: Record<string, unknown>, k: string): string | null {
  const v = b[k];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Alta de un prospecto. */
export async function POST(req: NextRequest) {
  const noAutorizado = await exigirSesion();
  if (noAutorizado) return noAutorizado;

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const nombre = texto(b, "nombre");
  if (!nombre) {
    return NextResponse.json({ error: "El nombre del cliente es obligatorio." }, { status: 400 });
  }

  const estado = texto(b, "estado");
  const fi = texto(b, "fechaInicio");

  const creado = await prisma.prospecto.create({
    data: {
      nombre,
      fechaInicio: fi ? new Date(fi) : null,
      administrador: texto(b, "administrador"),
      compania: texto(b, "compania"),
      estado,
      // La situación se deriva del texto en vez de pedirla aparte: quien
      // escribe «escogieron intermediario anterior» ya ha dicho que se perdió,
      // y obligarle a marcar además una casilla es donde se desincronizan.
      situacion: texto(b, "situacion") ?? situacionDeTexto(estado),
      asesor: texto(b, "asesor"),
      nota: texto(b, "nota"),
      polizaNumero: texto(b, "polizaNumero"),
    },
  });

  invalidarCartera();
  return NextResponse.json({ ok: true, id: creado.id });
}
