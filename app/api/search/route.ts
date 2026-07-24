import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { diasAlVence } from "@/lib/calculos";

export const runtime = "nodejs";

/**
 * Búsqueda rápida para la paleta de comandos (Ctrl/⌘ + K).
 * Se buscan variantes del término en mayúscula/minúscula en vez de usar
 * `mode: "insensitive"`, para que funcione igual en Postgres y en SQLite.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ resultados: [] });

  const variantes = Array.from(new Set([q, q.toUpperCase(), q.toLowerCase()]));
  const filtro = {
    OR: variantes.flatMap((v) => [
      { numero: { contains: v } },
      { asegurado: { contains: v } },
      { ccNit: { contains: v } },
    ]),
  };

  const [polizas, cancelaciones] = await Promise.all([
    prisma.policy.findMany({
      where: filtro,
      take: 6,
      orderBy: { primaNeta: "desc" },
      select: {
        id: true,
        numero: true,
        ramo: true,
        asegurado: true,
        ccNit: true,
        aseguradora: true,
        primaNeta: true,
        vencimiento: true,
        estadoPago: true,
      },
    }),
    prisma.cancellation.findMany({
      where: filtro,
      take: 3,
      orderBy: { id: "desc" },
      select: {
        id: true,
        numero: true,
        ramo: true,
        asegurado: true,
        aseguradora: true,
        primaNeta: true,
        fechaCancelacion: true,
      },
    }),
  ]);

  return NextResponse.json({
    resultados: [
      ...polizas.map((p) => ({
        tipo: "poliza" as const,
        id: p.id,
        numero: p.numero,
        ramo: p.ramo,
        asegurado: p.asegurado,
        ccNit: p.ccNit,
        aseguradora: p.aseguradora,
        primaNeta: p.primaNeta,
        vencimiento: p.vencimiento?.toISOString() ?? null,
        dias: diasAlVence(p.vencimiento),
        estadoPago: p.estadoPago,
      })),
      ...cancelaciones.map((c) => ({
        tipo: "cancelacion" as const,
        id: c.id,
        numero: c.numero,
        ramo: c.ramo,
        asegurado: c.asegurado,
        ccNit: null,
        aseguradora: c.aseguradora,
        primaNeta: c.primaNeta,
        vencimiento: c.fechaCancelacion?.toISOString() ?? null,
        dias: null,
        estadoPago: null,
      })),
    ],
  });
}
