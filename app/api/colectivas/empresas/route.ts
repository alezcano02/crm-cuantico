import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirColectivas } from "@/lib/auth";
import { empresaExcluida } from "@/lib/colectivas";

export const runtime = "nodejs";

/** Crea una empresa para gestionar sus colectivas. */
export async function POST(req: NextRequest) {
  const noAutorizado = await exigirColectivas();
  if (noAutorizado) return noAutorizado;

  let b: { nombre?: string; nit?: string; carpeta?: string; nota?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const nombre = (b.nombre ?? "").trim().toUpperCase();
  if (!nombre) {
    return NextResponse.json({ error: "Escriba el nombre de la empresa." }, { status: 400 });
  }
  if (empresaExcluida(nombre)) {
    return NextResponse.json(
      { error: "Financrea se gestiona aparte y no va en este módulo." },
      { status: 400 }
    );
  }

  const existente = await prisma.empresaColectiva.findUnique({ where: { nombre } });
  if (existente) {
    return NextResponse.json(
      { error: `"${nombre}" ya está creada.` },
      { status: 409 }
    );
  }

  const creada = await prisma.empresaColectiva.create({
    data: {
      nombre,
      nit: b.nit?.trim() || null,
      carpeta: b.carpeta?.trim() || null,
      nota: b.nota?.trim() || null,
    },
  });
  return NextResponse.json({ ok: true, id: creada.id });
}
