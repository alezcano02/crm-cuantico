import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parsearLibro } from "@/lib/excel";
import { exigirSesion } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const noAutorizado = await exigirSesion();
  if (noAutorizado) return noAutorizado;
  const formData = await req.formData();
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File)) {
    return NextResponse.json(
      { error: "Adjunte el archivo .xlsx en el campo 'archivo'." },
      { status: 400 }
    );
  }

  let datos;
  try {
    datos = parsearLibro(await archivo.arrayBuffer());
  } catch (e) {
    return NextResponse.json(
      { error: "No se pudo leer el archivo. ¿Es un .xlsx válido? " + String(e) },
      { status: 400 }
    );
  }

  // Conservar la gestión interna de renovación de la carga anterior
  // (gestionada / nota), casando por número de póliza + ramo.
  const previas = await prisma.policy.findMany({
    where: { gestionada: true },
    select: { numero: true, ramo: true, notaGestion: true, gestionadaEn: true },
  });
  const gestionPrevia = new Map(
    previas.map((p) => [`${p.numero}|${p.ramo}`, p])
  );

  await prisma.$transaction(
    async (tx) => {
      if (datos.policies.length > 0) {
        await tx.policy.deleteMany();
        await tx.policy.createMany({
          data: datos.policies.map((p) => {
            const previa = gestionPrevia.get(`${p.numero}|${p.ramo}`);
            return {
              ...p,
              gestionada: !!previa,
              notaGestion: previa?.notaGestion ?? null,
              gestionadaEn: previa?.gestionadaEn ?? null,
            };
          }),
        });
      }
      if (datos.otherPolicies.length > 0) {
        await tx.otherPolicy.deleteMany();
        await tx.otherPolicy.createMany({ data: datos.otherPolicies });
      }
      if (datos.cancellations.length > 0) {
        // Solo se reemplazan las cancelaciones provenientes del Excel; las
        // creadas dentro de la app (manual = true) se conservan.
        await tx.cancellation.deleteMany({ where: { manual: false } });
        await tx.cancellation.createMany({ data: datos.cancellations });
      }
      if (datos.historical.length > 0) {
        await tx.historicalPolicy2025.deleteMany();
        await tx.historicalPolicy2025.createMany({ data: datos.historical });
      }
      if (datos.listas.length > 0) {
        await tx.listValue.deleteMany();
        await tx.listValue.createMany({ data: datos.listas });
      }
    },
    { timeout: 55000 }
  );

  return NextResponse.json({ ok: true, resumen: datos.resumen });
}
