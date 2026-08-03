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

  // Conservar lo que la aplicación administra y el Excel no debe pisar,
  // casando por número de póliza + ramo:
  //  · la gestión interna de renovación (gestionada / nota);
  //  · la cobranza de las pólizas cuyo recaudo se registró aquí, que va por
  //    delante del informe (ver lib/cobranza.ts).
  const previas = await prisma.policy.findMany({
    where: { OR: [{ gestionada: true }, { cobranzaEditadaEn: { not: null } }] },
    select: {
      numero: true,
      ramo: true,
      gestionada: true,
      notaGestion: true,
      gestionadaEn: true,
      cobranzaEditadaEn: true,
      estadoPago: true,
      fechaPago: true,
      fechaMaxPago: true,
      valorCuota: true,
      notaCartera: true,
    },
  });
  const anteriores = new Map(previas.map((p) => [`${p.numero}|${p.ramo}`, p]));
  let cobranzaConservada = 0;

  // La importación borra y recrea casi todo. Si se cae a mitad (dos personas
  // importando a la vez, la transacción pasa de 55 s, o la base se cae) la
  // transacción revierte entera y no queda una base a medias; lo que faltaba
  // era decirlo en vez de responder un 500 sin cuerpo.
  try {
    await prisma.$transaction(
      async (tx) => {
      if (datos.policies.length > 0) {
        await tx.policy.deleteMany();
        await tx.policy.createMany({
          data: datos.policies.map((p) => {
            const previa = anteriores.get(`${p.numero}|${p.ramo}`);
            const conservarCobranza = previa?.cobranzaEditadaEn != null;
            if (conservarCobranza) cobranzaConservada++;
            return {
              ...p,
              gestionada: previa?.gestionada ?? false,
              notaGestion: previa?.notaGestion ?? null,
              gestionadaEn: previa?.gestionadaEn ?? null,
              // Manda el CRM: el pago se registró aquí, no en el informe.
              ...(conservarCobranza
                ? {
                    estadoPago: previa!.estadoPago,
                    fechaPago: previa!.fechaPago,
                    fechaMaxPago: previa!.fechaMaxPago,
                    valorCuota: previa!.valorCuota,
                    notaCartera: previa!.notaCartera,
                    cobranzaEditadaEn: previa!.cobranzaEditadaEn,
                  }
                : {}),
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
  } catch (e) {
    return NextResponse.json(
      {
        error:
          "No se pudo guardar la importación; no se cambió nada de la base. " +
          "Si alguien más estaba importando al mismo tiempo, espere e inténtelo de nuevo. " +
          String(e),
      },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true, resumen: datos.resumen, cobranzaConservada });
}
