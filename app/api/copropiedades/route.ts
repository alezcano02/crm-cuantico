import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirSesion } from "@/lib/auth";

export const runtime = "nodejs";

function texto(b: Record<string, unknown>, k: string): string | null {
  const v = b[k];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function numero(b: Record<string, unknown>, k: string): number | null {
  const v = b[k];
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || !v.trim()) return null;
  const limpio = v.replace(/[^\d]/g, "");
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/**
 * Alta de la ficha de un edificio.
 *
 * Es lo que hay que saber ANTES de tramitar cualquier endoso suyo: si la
 * póliza está vigente, si el paz y salvo está al día y por cuánto está
 * asegurado el edificio completo. Se llena una vez y sirve para todos sus
 * apartamentos.
 */
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
    return NextResponse.json({ error: "El nombre de la copropiedad es obligatorio." }, { status: 400 });
  }

  const vig = texto(b, "vigenciaHasta");
  const pys = texto(b, "pazSalvoVigenteHasta");

  let creada;
  try {
    creada = await prisma.copropiedad.create({
      data: {
        nombre,
        nit: texto(b, "nit"),
        aseguradora: texto(b, "aseguradora"),
        numeroPoliza: texto(b, "numeroPoliza"),
        vigenciaHasta: vig ? new Date(vig) : null,
        valorAseguradoTotal: numero(b, "valorAseguradoTotal"),
        pazSalvoVigenteHasta: pys ? new Date(pys) : null,
        pazSalvoEstado: texto(b, "pazSalvoEstado"),
        admiteEndosos: b.admiteEndosos === false ? false : true,
        motivoBloqueo: texto(b, "motivoBloqueo"),
        nota: texto(b, "nota"),
      },
    });
  } catch {
    // El nombre es único: si ya existe, es mejor decirlo que crear un duplicado
    // que luego partiría los endosos del mismo edificio en dos fichas.
    return NextResponse.json(
      { error: `Ya existe una copropiedad llamada "${nombre}".` },
      { status: 400 }
    );
  }

  /*
   * Al crear la ficha se enganchan los endosos que ya habían entrado con ese
   * nombre en texto. Es el caso normal: las solicitudes llegan por correo
   * antes de que nadie dé de alta el edificio.
   */
  const enganchados = await prisma.endoso.updateMany({
    where: { copropiedadId: null, urbanizacion: { equals: nombre, mode: "insensitive" } },
    data: { copropiedadId: creada.id },
  });

  return NextResponse.json({ ok: true, id: creada.id, enganchados: enganchados.count });
}
