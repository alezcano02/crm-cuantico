import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirSesion } from "@/lib/auth";

export const runtime = "nodejs";

function fecha(v: unknown): Date | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return isNaN(d.getTime()) ? null : d;
}

function numero(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/[$.\s]/g, "").replace(",", "."));
    if (isFinite(n)) return n;
  }
  return null;
}

function hoyISO(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Registro de pagos de cartera. Tres modos:
 *
 *  - "total"    la póliza queda paga (OK PAGO).
 *  - "cuota"    se recibió una cuota: la póliza sigue PENDIENTE y la fecha
 *               límite pasa a ser la de la próxima cuota. Es el caso de las
 *               formas de pago MENSUAL, ACUERDO DE PAGO o FINANCIADO.
 *  - "revertir" deshace el pago y la deja PENDIENTE.
 */
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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  // Compatibilidad con la acción rápida anterior ({ pagada: true/false }).
  const modo =
    typeof body.modo === "string"
      ? body.modo
      : body.pagada === true
        ? "total"
        : "revertir";

  const notaCartera =
    typeof body.notaCartera === "string"
      ? body.notaCartera.trim() || null
      : undefined;

  // Registrar un pago es exactamente el caso en que el CRM va por delante del
  // Excel: el recaudo se anota aquí el día que entra. A partir de ahora la
  // reimportación respeta la cobranza de esta póliza (ver app/api/import).
  const cobranzaEditadaEn = new Date();

  try {
    if (modo === "cuota") {
      const proxima = fecha(body.proximaFecha);
      if (!proxima) {
        return NextResponse.json(
          { error: "Indique la fecha de la próxima cuota (AAAA-MM-DD)." },
          { status: 400 }
        );
      }
      const valorCuota = numero(body.valorCuota);
      await prisma.policy.update({
        where: { id },
        data: {
          estadoPago: "PENDIENTE",
          fechaPago: fecha(body.fechaPago) ?? fecha(hoyISO()),
          fechaMaxPago: proxima,
          cobranzaEditadaEn,
          ...(valorCuota != null ? { valorCuota } : {}),
          ...(notaCartera !== undefined ? { notaCartera } : {}),
        },
      });
      return NextResponse.json({ ok: true });
    }

    if (modo === "total") {
      await prisma.policy.update({
        where: { id },
        data: {
          estadoPago: "OK PAGO",
          fechaPago: fecha(body.fechaPago) ?? fecha(hoyISO()),
          cobranzaEditadaEn,
          ...(notaCartera !== undefined ? { notaCartera } : {}),
        },
      });
      return NextResponse.json({ ok: true });
    }

    // revertir
    await prisma.policy.update({
      where: { id },
      data: {
        estadoPago: "PENDIENTE",
        fechaPago: null,
        cobranzaEditadaEn,
        ...(notaCartera !== undefined ? { notaCartera } : {}),
      },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Póliza no encontrada." }, { status: 404 });
  }
}
