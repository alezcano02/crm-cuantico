import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mesDeFecha } from "@/lib/calculos";
import { TIPO_RENOVACION } from "@/lib/constants";
import { exigirSesion } from "@/lib/auth";
import { invalidarCartera } from "@/lib/cache";

export const runtime = "nodejs";

function fecha(v: unknown): Date | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return isNaN(d.getTime()) ? null : d;
}

function numero(v: unknown, fallback: number): number {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/[$.\s]/g, "").replace(",", "."));
    if (isFinite(n)) return n;
  }
  return fallback;
}

/**
 * Renueva una póliza: adelanta el vencimiento (nuevo ciclo anual), la marca
 * como RENOVACION y actualiza prima y datos de pago. Recalcula el mes de
 * vencimiento y reinicia la gestión de renovación (ya quedó renovada).
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

  const actual = await prisma.policy.findUnique({ where: { id } });
  if (!actual) {
    return NextResponse.json({ error: "Póliza no encontrada." }, { status: 404 });
  }

  const nuevoVencimiento = fecha(body.vencimiento);
  if (!nuevoVencimiento) {
    return NextResponse.json(
      { error: "Indique el nuevo vencimiento (AAAA-MM-DD)." },
      { status: 400 }
    );
  }

  const estadoPago =
    typeof body.estadoPago === "string" && body.estadoPago.trim() !== ""
      ? body.estadoPago.trim().toUpperCase()
      : "PENDIENTE";

  // La póliza pudo desaparecer entre la lectura y la escritura (otro usuario la
  // canceló, o se reimportó el Excel, que borra y recrea las pólizas con ids
  // nuevos). Sin este try era un 500 sin mensaje.
  try {
    await prisma.policy.update({
      where: { id },
      data: {
        vencimiento: nuevoVencimiento,
        mesVencimiento: mesDeFecha(nuevoVencimiento),
        tipoNegocio: TIPO_RENOVACION,
        // Marca de que la renovación se hizo aquí: sin ella, la siguiente
        // importación del informe devolvía NUEVO y el vencimiento viejo.
        renovadaEn: new Date(),
        primaNeta: numero(body.primaNeta, actual.primaNeta),
        primaTotal: numero(body.primaTotal, actual.primaTotal),
        estadoPago,
        fechaPago: fecha(body.fechaPago),
        fechaMaxPago: fecha(body.fechaMaxPago),
        // Nuevo ciclo: se reinicia la gestión de renovación
        gestionada: false,
        notaGestion: null,
        gestionadaEn: null,
      },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "No se pudo renovar: es posible que otro usuario haya modificado la póliza o que se acabe de reimportar el Excel. Actualice la página.",
      },
      { status: 409 }
    );
  }

  invalidarCartera();

  return NextResponse.json({ ok: true });
}
