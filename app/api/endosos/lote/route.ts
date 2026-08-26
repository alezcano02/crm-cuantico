import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirSesion } from "@/lib/auth";
import { ESTADOS_ENDOSO, type EstadoEndoso } from "@/lib/endosos";

export const runtime = "nodejs";

/**
 * Mueve de estado y anota en la bitácora varios endosos de una vez.
 *
 * Los endosos se tramitan en tandas —se manda la planilla de un edificio
 * entero y se radican todos con el mismo correo—, así que cambiarlos uno por
 * uno era repetir treinta veces el mismo gesto.
 *
 * La nota se antepone a la historia de CADA caso con su fecha, igual que en el
 * seguimiento individual: no se borra nada de lo anterior.
 */
export async function PATCH(req: NextRequest) {
  const noAutorizado = await exigirSesion();
  if (noAutorizado) return noAutorizado;

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const ids = Array.isArray(b.ids)
    ? b.ids.filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    : [];
  if (!ids.length) {
    return NextResponse.json({ error: "No se marcó ningún endoso." }, { status: 400 });
  }

  const t = (k: string) => {
    const v = b[k];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  const estado = t("estado");
  if (estado && !ESTADOS_ENDOSO.includes(estado as EstadoEndoso)) {
    return NextResponse.json({ error: `Estado desconocido: ${estado}.` }, { status: 400 });
  }
  const nota = t("notaSeguimiento");
  const radicado = t("radicado");
  if (!estado && !nota && !radicado) {
    return NextResponse.json({ error: "No hay nada que cambiar." }, { status: 400 });
  }

  const cuando = t("fechaSeguimiento") ? new Date(t("fechaSeguimiento")!) : new Date();
  if (isNaN(cuando.getTime())) {
    return NextResponse.json({ error: "La fecha no es válida." }, { status: 400 });
  }
  const sello = `${String(cuando.getUTCDate()).padStart(2, "0")}/${String(
    cuando.getUTCMonth() + 1
  ).padStart(2, "0")}/${cuando.getUTCFullYear()}`;

  const actuales = await prisma.endoso.findMany({
    where: { id: { in: ids } },
    select: { id: true, historia: true, fechaEnvioAseguradora: true },
  });

  /*
   * Se recorren uno a uno porque cada bitácora es distinta y hay que
   * anteponerle la nota a la suya. Son decenas de casos, no miles: cabe de
   * sobra en una transacción.
   */
  const cambios = actuales.map((a) => {
    const datos: Record<string, unknown> = {};
    if (estado) datos.estado = estado;
    if (radicado) datos.radicado = radicado;
    if (nota) {
      datos.historia = `${sello} · ${nota}${a.historia ? `\n\n${a.historia}` : ""}`;
      datos.ultimoSeguimiento = cuando;
    }
    // Radicar arranca el reloj de los días de espera. Si nadie dijo la fecha y
    // el caso aún no tenía una, se pone la de la gestión.
    if (radicado && !a.fechaEnvioAseguradora) datos.fechaEnvioAseguradora = cuando;
    return prisma.endoso.update({ where: { id: a.id }, data: datos });
  });

  await prisma.$transaction(cambios);

  return NextResponse.json({ ok: true, actualizados: cambios.length });
}
