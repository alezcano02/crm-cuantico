import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirSesion } from "@/lib/auth";
import { ESTADOS_ENDOSO, normalizarAseguradora, type EstadoEndoso } from "@/lib/endosos";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const noAutorizado = await exigirSesion();
  if (noAutorizado) return noAutorizado;

  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Identificador inválido." }, { status: 400 });
  }

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const t = (k: string) => {
    const v = b[k];
    return typeof v === "string" ? v.trim() || null : undefined;
  };
  const n = (k: string) => {
    const v = b[k];
    if (v === null) return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v !== "string") return undefined;
    if (!v.trim()) return null;
    const limpio = v.replace(/[^\d]/g, "");
    return limpio ? Number(limpio) : null;
  };

  const datos: Record<string, unknown> = {};

  /*
   * MODO SEGUIMIENTO: añade una nota fechada a la bitácora.
   *
   * Mismo patrón que prospectos y siniestros: lo nuevo se antepone y no se
   * borra nada. Aquí importa especialmente, porque un endoso que va por el
   * tercer reproceso solo se entiende leyendo qué pidió el banco cada vez.
   *
   * Es también el modo que usa el flujo asistido para registrar «la aseguradora
   * respondió» o «el banco lo devolvió» sin tocar los datos del caso.
   */
  const notaSeguimiento = t("notaSeguimiento");
  if (notaSeguimiento) {
    const actual = await prisma.endoso.findUnique({ where: { id }, select: { historia: true } });
    if (!actual) {
      return NextResponse.json({ error: "El endoso no existe." }, { status: 404 });
    }
    const cuando = t("fechaSeguimiento") ? new Date(t("fechaSeguimiento")!) : new Date();
    const sello = `${String(cuando.getUTCDate()).padStart(2, "0")}/${String(
      cuando.getUTCMonth() + 1
    ).padStart(2, "0")}/${cuando.getUTCFullYear()}`;
    datos.historia = `${sello} · ${notaSeguimiento}${actual.historia ? `\n\n${actual.historia}` : ""}`;
    datos.ultimoSeguimiento = cuando;
  }

  const estado = t("estado");
  if (estado) {
    if (!ESTADOS_ENDOSO.includes(estado as EstadoEndoso)) {
      return NextResponse.json(
        { error: `Estado desconocido: ${estado}. Válidos: ${ESTADOS_ENDOSO.join(", ")}.` },
        { status: 400 }
      );
    }
    datos.estado = estado;
  }

  for (const k of [
    "urbanizacion",
    "cliente",
    "cedula",
    "cliente2",
    "cedula2",
    "correoSolicitante",
    "celular",
    "direccion",
    "ciudad",
    "torre",
    "apartamento",
    "cuartoUtil",
    "parqueadero",
    "banco",
    "bancoNit",
    "tipoCredito",
    "numeroPoliza",
    "radicado",
  ] as const) {
    const v = t(k);
    if (v !== undefined) datos[k] = v;
  }

  const valor = n("valorSolicitado");
  if (valor !== undefined) datos.valorSolicitado = valor;

  // Se pasa por la lista canónica: sin esto, «Zurich» y «zurich» contaban como
  // dos aseguradoras distintas en los filtros de la tabla.
  const aseg = t("aseguradora");
  if (aseg !== undefined) datos.aseguradora = normalizarAseguradora(aseg);

  // El coeficiente lleva decimales y no puede pasar por el limpiador de dígitos.
  if ("coeficiente" in b) {
    const v = b.coeficiente;
    if (v === null || v === "") datos.coeficiente = null;
    else if (typeof v === "number") datos.coeficiente = Number.isFinite(v) ? v : null;
    else if (typeof v === "string") {
      const num = Number(v.replace(/%/g, "").replace(",", ".").trim());
      datos.coeficiente = Number.isFinite(num) ? num : null;
    }
  }

  const fe = t("fechaEnvioAseguradora");
  if (fe !== undefined) datos.fechaEnvioAseguradora = fe ? new Date(fe) : null;

  if ("copropiedadId" in b) {
    datos.copropiedadId = typeof b.copropiedadId === "number" ? b.copropiedadId : null;
  }
  if ("policyId" in b) {
    datos.policyId = typeof b.policyId === "number" ? b.policyId : null;
  }

  /*
   * Radicar es lo que arranca el reloj de los 5 días. Si se pone el radicado y
   * nadie dijo la fecha, se pone la de hoy: pedirla aparte es justo el paso que
   * se olvida, y sin ella el caso no aparece nunca como represado.
   */
  if (datos.radicado && datos.fechaEnvioAseguradora === undefined) {
    const actual = await prisma.endoso.findUnique({
      where: { id },
      select: { fechaEnvioAseguradora: true },
    });
    if (actual && !actual.fechaEnvioAseguradora) datos.fechaEnvioAseguradora = new Date();
  }

  if (!Object.keys(datos).length) {
    return NextResponse.json({ error: "No hay nada que cambiar." }, { status: 400 });
  }

  try {
    await prisma.endoso.update({ where: { id }, data: datos });
  } catch {
    return NextResponse.json({ error: "El endoso no existe." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, id });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const noAutorizado = await exigirSesion();
  if (noAutorizado) return noAutorizado;

  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Identificador inválido." }, { status: 400 });
  }
  try {
    await prisma.endoso.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "El endoso no existe." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
