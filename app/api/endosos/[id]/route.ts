import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirSesion } from "@/lib/auth";
import {
  ESTADOS_ENDOSO,
  normalizar,
  normalizarAseguradora,
  selloBitacora,
  type EstadoEndoso,
} from "@/lib/endosos";

export const runtime = "nodejs";

/**
 * Un caso completo, con su bitácora.
 *
 * El listado de la página no lleva `historia` —es lo que más pesa y solo se
 * mira al abrir un caso—, así que la ventana la pide por aquí.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const noAutorizado = await exigirSesion();
  if (noAutorizado) return noAutorizado;

  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Identificador inválido." }, { status: 400 });
  }
  const endoso = await prisma.endoso.findUnique({ where: { id } });
  if (!endoso) {
    return NextResponse.json({ error: "El endoso no existe." }, { status: 404 });
  }

  /*
   * Abrir el caso es haberlo visto, y aquí es donde se sabe: la ventana pide
   * esta ruta justo al abrirse y en ningún otro momento. Por eso el sello va
   * en el GET y no en el PATCH — la pregunta que responde el aviso es «¿lo
   * miré?», no «¿lo cambié?», y la mayoría de lo que llega se lee sin tocar
   * nada.
   *
   * Se responde con el endoso tal como estaba ANTES de sellarlo, para que la
   * ventana pueda enseñar «¡Nuevo!» esa última vez; el aviso desaparece al
   * refrescar la tabla, que es cuando ya se leyó.
   */
  await prisma.endoso.update({ where: { id }, data: { vistoEn: new Date() } });

  return NextResponse.json({ ok: true, endoso });
}

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
  /*
   * Importes en pesos, siempre enteros. Se redondea a propósito: las planillas
   * de las aseguradoras traen céntimos («244906811.6») y el formulario los
   * muestra con separador de miles, donde un punto decimal se confundiría con
   * uno de millares y multiplicaría la cifra por diez.
   */
  const n = (k: string) => {
    const v = b[k];
    if (v === null) return null;
    if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : null;
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
    const texto = t("fechaSeguimiento");
    const cuando = texto ? new Date(texto) : new Date();
    datos.historia = `${selloBitacora(cuando, !texto || texto.includes("T"))} · ${notaSeguimiento}${
      actual.historia ? `\n\n${actual.historia}` : ""
    }`;
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

  const fr = t("fechaRecepcion");
  if (fr !== undefined) datos.fechaRecepcion = fr ? new Date(fr) : null;

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

  /*
   * La aseguradora, la póliza, la calle y la ciudad salen de la ficha del
   * edificio cuando el caso no las tiene: son datos de la copropiedad, no del
   * caso, y copiarlos a mano era de donde salían las variantes de escritura,
   * las planillas sin número de póliza y las direcciones que no coinciden con
   * la del crédito. Nunca se pisa lo que ya esté puesto ni lo que venga en
   * esta misma petición.
   */
  {
    const actual = await prisma.endoso.findUnique({
      where: { id },
      select: { urbanizacion: true, copropiedadId: true, aseguradora: true, numeroPoliza: true, direccion: true, ciudad: true },
    });
    if (actual) {
      const idFicha =
        (datos.copropiedadId as number | null | undefined) ?? actual.copropiedadId ?? null;
      const nombre = (datos.urbanizacion as string | undefined) ?? actual.urbanizacion;
      let ficha = idFicha
        ? await prisma.copropiedad.findUnique({
            where: { id: idFicha },
            select: { aseguradora: true, numeroPoliza: true, direccion: true, ciudad: true },
          })
        : null;
      // Sin ficha enlazada se busca por nombre, igual que al crear el caso.
      if (!ficha && nombre) {
        const todas = await prisma.copropiedad.findMany({
          select: {
            nombre: true,
            aseguradora: true,
            numeroPoliza: true,
            direccion: true,
            ciudad: true,
          },
        });
        const objetivo = normalizar(nombre);
        ficha =
          todas.find((c) => normalizar(c.nombre) === objetivo) ??
          todas.find(
            (c) =>
              normalizar(c.nombre).includes(objetivo) || objetivo.includes(normalizar(c.nombre))
          ) ??
          null;
      }
      if (ficha) {
        if (datos.aseguradora === undefined && !actual.aseguradora && ficha.aseguradora) {
          datos.aseguradora = normalizarAseguradora(ficha.aseguradora);
        }
        if (datos.numeroPoliza === undefined && !actual.numeroPoliza && ficha.numeroPoliza) {
          datos.numeroPoliza = ficha.numeroPoliza;
        }
        /*
         * La dirección NO se hereda: la manda el cliente en su correo y es la
         * que el banco compara contra la escritura del crédito. La ciudad sí,
         * porque el edificio la sabe y que falte es la causa nº 1 de
         * devolución; el correo, cuando la trae, manda igual.
         */
        if (datos.ciudad === undefined && !actual.ciudad && ficha.ciudad) {
          datos.ciudad = ficha.ciudad;
        }
      }
    }
  }

  /*
   * Pasar a «Enviado al cliente» es el momento que cuenta la cifra del mes, y
   * se sella aquí para no depender de que alguien la escriba. Solo la primera
   * vez: si el caso vuelve a reproceso y se entrega otra vez, la entrega que
   * vale para el histórico es la primera de este ciclo.
   */
  if (datos.estado === "ENVIADO_CLIENTE") {
    const actual = await prisma.endoso.findUnique({
      where: { id },
      select: { fechaEnvioCliente: true },
    });
    if (actual && !actual.fechaEnvioCliente) {
      datos.fechaEnvioCliente = datos.ultimoSeguimiento ?? new Date();
    }
  }

  if (!Object.keys(datos).length) {
    return NextResponse.json({ error: "No hay nada que cambiar." }, { status: 400 });
  }

  /*
   * Si esta edición trae coeficiente, se guarda en la tabla del edificio para
   * que el apartamento no lo vuelva a necesitar nunca. Y si no lo trae pero el
   * edificio ya lo sabe, se le pone: es el dato que más cuesta conseguir.
   */
  {
    const actual = await prisma.endoso.findUnique({
      where: { id },
      select: { copropiedadId: true, apartamento: true, coeficiente: true },
    });
    const idFicha = (datos.copropiedadId as number | null | undefined) ?? actual?.copropiedadId ?? null;
    const apto = ((datos.apartamento as string | undefined) ?? actual?.apartamento ?? "")?.trim();
    const coef = (datos.coeficiente as number | null | undefined) ?? actual?.coeficiente ?? null;
    if (idFicha && apto) {
      if (coef != null) {
        await prisma.coeficienteApartamento.upsert({
          where: { copropiedadId_apartamento: { copropiedadId: idFicha, apartamento: apto } },
          create: { copropiedadId: idFicha, apartamento: apto, coeficiente: coef },
          update: { coeficiente: coef },
        });
      } else if (datos.coeficiente === undefined) {
        const guardado = await prisma.coeficienteApartamento.findUnique({
          where: { copropiedadId_apartamento: { copropiedadId: idFicha, apartamento: apto } },
          select: { coeficiente: true },
        });
        if (guardado) datos.coeficiente = guardado.coeficiente;
      }
    }
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
