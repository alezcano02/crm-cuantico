import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirSesion } from "@/lib/auth";
import { normalizarEstado } from "@/lib/siniestros";

export const runtime = "nodejs";

function texto(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s === "" ? null : s;
}

function numero(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/[$.\s]/g, "").replace(",", "."));
    if (isFinite(n)) return n;
  }
  return null;
}

function fecha(v: unknown): Date | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return isNaN(d.getTime()) ? null : d;
}

function hoyISO(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Actualiza un siniestro. Dos modos:
 *  · seguimiento: agrega una nota fechada al historial de observaciones y
 *    actualiza el estado y la fecha de último seguimiento. Es la acción del día.
 *  · edición: cambia los campos que se envíen.
 * En ambos casos el registro queda marcado como manual para que una
 * reimportación de los Excel no borre lo trabajado aquí.
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

  const actual = await prisma.siniestro.findUnique({ where: { id } });
  if (!actual) {
    return NextResponse.json({ error: "Siniestro no encontrado." }, { status: 404 });
  }

  const datos: Record<string, unknown> = { manual: true };

  if (body.modo === "seguimiento") {
    const nota = texto(body.nota);
    if (!nota) {
      return NextResponse.json(
        { error: "Escriba qué se hizo en este seguimiento." },
        { status: 400 }
      );
    }
    const cuando = fecha(body.fecha) ?? fecha(hoyISO())!;
    const sello = `${String(cuando.getUTCDate()).padStart(2, "0")}/${String(cuando.getUTCMonth() + 1).padStart(2, "0")}/${cuando.getUTCFullYear()}`;
    // Lo nuevo va arriba: así se lee primero lo último que pasó.
    datos.observaciones = `${sello} · ${nota}${
      actual.observaciones ? `\n\n${actual.observaciones}` : ""
    }`;
    datos.fechaUltimoSeguimiento = cuando;
    const estadoTexto = texto(body.estadoTexto);
    if (estadoTexto) {
      datos.estadoTexto = estadoTexto;
      datos.estado = normalizarEstado(estadoTexto);
    }
  } else {
    // Edición campo por campo: solo se toca lo que venga en la petición.
    const cadenas = [
      "asegurado", "nit", "administrador", "firmaAdministracion", "celular",
      "email", "aseguradora", "poliza", "cobertura", "resumen", "radicado",
      "responsable", "empleadoCompania", "telefonoCompania", "correoCompania",
      "notaInterna", "observaciones",
    ];
    for (const c of cadenas) if (c in body) datos[c] = texto(body[c]);

    for (const n of ["valorSiniestro", "valorLiquidar", "valorPagado", "deducible"]) {
      if (n in body) datos[n] = numero(body[n]);
    }
    for (const f of [
      "vigenciaPoliza", "fechaOcurrencia", "fechaAvisoAsesor",
      "fechaAvisoCompania", "fechaPago", "fechaUltimoSeguimiento",
    ]) {
      if (f in body) datos[f] = fecha(body[f]);
    }
    if ("estadoTexto" in body) {
      const t = texto(body.estadoTexto);
      datos.estadoTexto = t;
      datos.estado = normalizarEstado(t);
    }

    if ("cerrado" in body) {
      const cerrar = body.cerrado === true;
      if (cerrar) {
        // Un caso no se cierra sin confirmar el pago: la fecha y el valor
        // pueden venir en esta misma petición o estar ya guardados.
        const fechaPago = "fechaPago" in body ? fecha(body.fechaPago) : actual.fechaPago;
        const valorPagado =
          "valorPagado" in body ? numero(body.valorPagado) : actual.valorPagado;
        if (!fechaPago) {
          return NextResponse.json(
            { error: "Para cerrar el siniestro indique la fecha de confirmación del pago." },
            { status: 400 }
          );
        }
        if (valorPagado == null) {
          return NextResponse.json(
            {
              error:
                "Para cerrar el siniestro indique el valor pagado (escriba 0 si el caso se objetó o no hubo indemnización).",
            },
            { status: 400 }
          );
        }
        datos.fechaPago = fechaPago;
        datos.valorPagado = valorPagado;
      }
      datos.cerrado = cerrar;
    }
  }

  await prisma.siniestro.update({ where: { id }, data: datos });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const noAutorizado = await exigirSesion();
  if (noAutorizado) return noAutorizado;
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }
  try {
    await prisma.siniestro.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Siniestro no encontrado." }, { status: 404 });
  }
}
