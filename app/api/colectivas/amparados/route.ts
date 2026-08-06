import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirColectivas } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Alta de una persona en una colectiva (inclusión).
 *
 * Crea el amparado y, en la misma transacción, la novedad que lo registra: la
 * bitácora es lo que se concilia con la aseguradora, así que un amparado sin
 * su novedad sería un movimiento invisible.
 */
export async function POST(req: NextRequest) {
  const noAutorizado = await exigirColectivas();
  if (noAutorizado) return noAutorizado;

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const texto = (k: string) => {
    const v = b[k];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const numero = (k: string) => {
    const v = b[k];
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const empresaId = numero("empresaId");
  const polizaNumero = texto("polizaNumero");
  const docAmparado = texto("docAmparado");
  const nombreAmparado = texto("nombreAmparado");
  const parentesco = texto("parentesco");
  const ramo = texto("ramo");

  if (!empresaId || !polizaNumero || !docAmparado || !nombreAmparado || !parentesco || !ramo) {
    return NextResponse.json(
      { error: "Faltan empresa, póliza, ramo, documento, nombre o parentesco." },
      { status: 400 }
    );
  }

  const empresa = await prisma.empresaColectiva.findUnique({ where: { id: empresaId } });
  if (!empresa) {
    return NextResponse.json({ error: "La empresa no existe." }, { status: 404 });
  }

  // Un afiliado repetido en la misma póliza casi siempre es un doble clic o un
  // pegado de más, no una persona con dos coberturas.
  const yaEsta = await prisma.amparadoColectiva.findFirst({
    where: { polizaNumero, docAmparado, fechaRetiro: null },
  });
  if (yaEsta) {
    return NextResponse.json(
      { error: `${nombreAmparado} ya está activo en la póliza ${polizaNumero}.` },
      { status: 409 }
    );
  }

  const fechaIngreso = texto("fechaIngreso") ? new Date(texto("fechaIngreso")!) : new Date();

  const creado = await prisma.$transaction(async (tx) => {
    const a = await tx.amparadoColectiva.create({
      data: {
        empresaId,
        polizaNumero,
        ramo,
        plan: texto("plan"),
        docEmpleado: texto("docEmpleado") ?? docAmparado,
        nombreEmpleado: texto("nombreEmpleado") ?? nombreAmparado,
        docAmparado,
        nombreAmparado,
        parentesco: parentesco.toUpperCase(),
        sexo: texto("sexo"),
        valorAsegurado: numero("valorAsegurado"),
        primaMensual: numero("primaMensual"),
        estado: texto("estado") ?? "EN EXPEDICION",
        radicado: texto("radicado"),
        observacion: texto("observacion"),
        fechaIngreso,
      },
    });
    await tx.novedadColectiva.create({
      data: {
        empresaId,
        amparadoId: a.id,
        tipo: "INCLUSION",
        fecha: fechaIngreso,
        estado: "SOLICITADA",
        radicado: texto("radicado"),
        nombreAmparado,
        docAmparado,
        nota: texto("observacion"),
      },
    });
    return a;
  });

  return NextResponse.json({ ok: true, id: creado.id });
}
