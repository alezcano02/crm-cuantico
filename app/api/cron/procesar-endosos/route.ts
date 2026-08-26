import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { correosDesde } from "@/lib/graph";
import { clasificarCorreo, type DatosExtraidos } from "@/lib/clasificar-endoso";
import { buscarBanco, normalizar, normalizarAseguradora } from "@/lib/endosos";

export const runtime = "nodejs";
// Puede tardar unos minutos si llegan varios correos a la vez (cada uno hace
// una llamada a Graph ya incluida en el listado, más una llamada a Claude).
export const maxDuration = 300;

/**
 * El reemplazo automático de "leer el correo de endosos y pasarlo al CRM".
 *
 * La dispara el cron de Vercel (ver vercel.json) cada hora. No depende de
 * ninguna sesión de Claude Code ni de la plataforma de rutinas de
 * Anthropic — corre en la misma infraestructura que el resto del CRM, así
 * que llega a la base de datos sin ningún bloqueo de red que sortear.
 *
 * Ventana de 90 minutos (no 60) a propósito: si una corrida se atrasa o
 * falla, la siguiente igual cubre el hueco. El solape no duplica nada porque
 * cada correo se marca como procesado (ver `yaProcesado`).
 */
export async function GET(req: NextRequest) {
  /*
   * Sin CRON_SECRET la ruta NO se abre.
   *
   * Antes se comparaba directamente contra `Bearer ${process.env.CRON_SECRET}`:
   * con la variable sin definir eso da la cadena literal «Bearer undefined», y
   * cualquiera que mandara esa cabecera entraba. La ruta lee el buzón entero y
   * escribe en la base, así que fallar abierto es lo último que puede hacer.
   */
  const secreto = process.env.CRON_SECRET;
  if (!secreto) {
    return NextResponse.json(
      { error: "CRON_SECRET no está configurado; la tarea no se ejecuta." },
      { status: 503 }
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const desde = new Date(Date.now() - 90 * 60 * 1000);
  const resultado = {
    revisados: 0,
    creados: [] as { id: number; cliente: string }[],
    actualizados: [] as { id: number; cliente: string; tipo: string }[],
    omitidos: [] as { asunto: string; motivo: string }[],
    errores: [] as { asunto: string; error: string }[],
  };

  let correos;
  try {
    correos = await correosDesde(desde);
  } catch (e) {
    return NextResponse.json({ error: `No se pudo leer el buzón: ${(e as Error).message}` }, { status: 502 });
  }

  for (const correo of correos) {
    resultado.revisados++;
    try {
      const yaHecho = await yaProcesado(correo.internetMessageId);
      if (yaHecho) {
        resultado.omitidos.push({ asunto: correo.asunto, motivo: "ya procesado en una corrida anterior" });
        continue;
      }

      const c = await clasificarCorreo({
        asunto: correo.asunto,
        remitente: correo.remitente,
        cuerpo: correo.cuerpoTexto,
      });

      const marcador = `[correo:${correo.internetMessageId}]`;
      const notaConMarcador = `${c.resumen} ${marcador}`;

      if (c.tipo === "RUIDO" || c.tipo === "REENVIO_TERCERO") {
        resultado.omitidos.push({
          asunto: correo.asunto,
          motivo: c.tipo === "RUIDO" ? "ruido, no es un caso de cliente" : "reenvío de tercero, requiere revisión manual",
        });
        continue;
      }

      if (c.tipo === "SOLICITUD_NUEVA") {
        const creado = await crearEndoso(correo.internetMessageId, c.datos, c.datosIncompletos, correo.recibido);
        if (!creado) {
          resultado.omitidos.push({ asunto: correo.asunto, motivo: "solicitud nueva sin cliente ni copropiedad identificables" });
          continue;
        }
        resultado.creados.push({ id: creado.id, cliente: creado.cliente });
        continue;
      }

      // REPROCESO / RESPUESTA_ASEGURADORA / PREGUNTA_SEGUIMIENTO / CIERRE:
      // se busca el caso existente y se le antepone la nota.
      const existente = await buscarCasoExistente(c.datos);
      if (!existente) {
        resultado.omitidos.push({
          asunto: correo.asunto,
          motivo: `${c.tipo.toLowerCase()} pero no se encontró el caso correspondiente en el CRM — revisar a mano`,
        });
        continue;
      }

      /*
       * La hora que se guarda es la del CORREO, no la de la corrida.
       *
       * Antes iba `new Date()`, así que un correo de las 8:05 aparecía en la
       * bitácora a la hora en que el cron pasó a recogerlo. Con eso no se
       * puede reconstruir qué pasó ni en qué orden, que es para lo único que
       * sirve una bitácora.
       */
      const cuando = new Date(correo.recibido);
      await prisma.endoso.update({
        where: { id: existente.id },
        data: {
          historia: `${sello(cuando)} · ${notaConMarcador}${existente.historia ? `\n\n${existente.historia}` : ""}`,
          ultimoSeguimiento: cuando,
          ...(c.estadoSugerido ? { estado: c.estadoSugerido } : {}),
          ...camposActualizables(c.datos),
        },
      });
      resultado.actualizados.push({ id: existente.id, cliente: existente.cliente, tipo: c.tipo });
    } catch (e) {
      resultado.errores.push({ asunto: correo.asunto, error: (e as Error).message });
    }
  }

  /*
   * Queda constancia de la pasada, aunque no haya encontrado nada.
   *
   * Es lo que el tablero enseña como «Última revisión del correo». Sin este
   * registro una revisión que corre y no encuentra novedades es
   * indistinguible de una revisión que dejó de correr, que es justo lo que no
   * se puede permitir en un proceso desatendido.
   */
  await prisma.revisionBuzon.create({
    data: {
      correosNuevos: resultado.revisados,
      casosTocados: resultado.creados.length + resultado.actualizados.length,
      modelo: "Opus 5",
      resumen:
        `${resultado.creados.length} creado(s), ${resultado.actualizados.length} actualizado(s), ` +
        `${resultado.omitidos.length} omitido(s)` +
        (resultado.errores.length ? `, ${resultado.errores.length} con error` : ""),
    },
  });

  return NextResponse.json({ ok: true, ventanaDesde: desde.toISOString(), ...resultado });
}

/** Ya se creó un caso a partir de este correo, o ya se le anotó una nota. */
async function yaProcesado(internetMessageId: string): Promise<boolean> {
  const marcador = `[correo:${internetMessageId}]`;
  const porCreacion = await prisma.endoso.findFirst({
    where: { origenCorreoId: internetMessageId },
    select: { id: true },
  });
  if (porCreacion) return true;
  const porNota = await prisma.endoso.findFirst({
    where: { historia: { contains: marcador } },
    select: { id: true },
  });
  return !!porNota;
}

async function crearEndoso(
  internetMessageId: string,
  datos: DatosExtraidos,
  datosIncompletos: boolean,
  recibido: string
) {
  if (!datos.cliente || !datos.urbanizacion) return null;

  /*
   * Se completa desde la ficha del edificio y las listas del CRM, igual que
   * hace POST /api/endosos.
   *
   * Esta ruta escribe con Prisma directo, así que no pasaba por nada de eso:
   * los casos que entraban por aquí nacían sin aseguradora, sin número de
   * póliza, sin coeficiente y —lo más caro— sin el NIT del banco, que es de
   * lo que más devoluciones causa. Lo que trae el correo manda siempre; la
   * ficha solo rellena lo que el cliente no escribió.
   */
  const fichas = await prisma.copropiedad.findMany({
    select: { id: true, nombre: true, aseguradora: true, numeroPoliza: true, ciudad: true },
  });
  const objetivo = normalizar(datos.urbanizacion);
  const ficha =
    fichas.find((f) => normalizar(f.nombre) === objetivo) ??
    fichas.find((f) => normalizar(f.nombre).includes(objetivo) || objetivo.includes(normalizar(f.nombre)));
  const copropiedadId = ficha?.id ?? null;

  // Nombre canónico y NIT oficial del banco a partir de como lo escriba el
  // cliente: «bancolombia» y «BANCOLOMBIA S.A.» son la misma entidad.
  const bancoConocido = buscarBanco(datos.banco ?? null);
  const banco = bancoConocido?.nombre ?? datos.banco ?? null;
  const bancoNit = datos.bancoNit ?? bancoConocido?.nit ?? null;

  // El coeficiente del apartamento ya está averiguado de otras veces.
  const apartamento = datos.apartamento ?? null;
  let coeficiente: number | null = null;
  if (apartamento && copropiedadId) {
    const guardado = await prisma.coeficienteApartamento.findUnique({
      where: { copropiedadId_apartamento: { copropiedadId, apartamento } },
      select: { coeficiente: true },
    });
    coeficiente = guardado?.coeficiente ?? null;
  }

  const creado = await prisma.endoso.create({
    data: {
      urbanizacion: datos.urbanizacion,
      copropiedadId,
      cliente: datos.cliente,
      cedula: datos.cedula ?? null,
      cliente2: datos.cliente2 ?? null,
      cedula2: datos.cedula2 ?? null,
      // La dirección la manda el cliente y nunca se hereda del edificio: es la
      // que el banco compara contra la escritura del crédito.
      direccion: datos.direccion ?? null,
      ciudad: datos.ciudad ?? ficha?.ciudad ?? null,
      torre: datos.torre ?? null,
      apartamento,
      cuartoUtil: datos.cuartoUtil ?? null,
      parqueadero: datos.parqueadero ?? null,
      coeficiente,
      valorSolicitado: numero(datos.valorSolicitado),
      banco,
      bancoNit,
      tipoCredito: datos.tipoCredito ?? null,
      aseguradora: normalizarAseguradora(ficha?.aseguradora ?? null),
      numeroPoliza: ficha?.numeroPoliza ?? null,
      correoSolicitante: datos.correoSolicitante ?? null,
      celular: datos.celular ?? null,
      estado: datosIncompletos ? "DATOS_INCOMPLETOS" : "NUEVA_SOLICITUD",
      origenCorreoId: internetMessageId,
      // Cuándo entró de verdad la solicitud, que es con lo que se mide lo que
      // tarda la agencia en responder. Sin esto el caso nacía sin fecha.
      fechaRecepcion: new Date(recibido),
      historia: `${sello(new Date(recibido))} · Solicitud recibida por correo.`,
    },
  });
  return creado;
}

/**
 * Busca el caso al que corresponde un reproceso/respuesta/pregunta.
 *
 * Primero por cédula (lo más específico). Si no hay o no encuentra, por
 * copropiedad + apartamento. No adivina por nombre solo: el mismo apellido
 * se repite entre copropiedades distintas y un cruce mal hecho le pondría a
 * un cliente la nota de otro.
 */
async function buscarCasoExistente(datos: DatosExtraidos) {
  if (datos.cedula) {
    const porCedula = await prisma.endoso.findFirst({
      where: { OR: [{ cedula: datos.cedula }, { cedula2: datos.cedula }] },
      orderBy: { creadoEn: "desc" },
    });
    if (porCedula) return porCedula;
  }
  if (datos.urbanizacion && datos.apartamento) {
    const candidatos = await prisma.endoso.findMany({
      where: { apartamento: datos.apartamento },
      orderBy: { creadoEn: "desc" },
    });
    const objetivo = normalizar(datos.urbanizacion);
    const match = candidatos.find((c) => {
      const n = normalizar(c.urbanizacion);
      return n === objetivo || n.includes(objetivo) || objetivo.includes(n);
    });
    if (match) return match;
  }
  return null;
}

/** Campos que, si el correo trae un dato nuevo, vale la pena corregir en el caso existente. */
function camposActualizables(datos: DatosExtraidos): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (datos.banco) out.banco = datos.banco;
  if (datos.bancoNit) out.bancoNit = datos.bancoNit;
  if (datos.direccion) out.direccion = datos.direccion;
  if (datos.ciudad) out.ciudad = datos.ciudad;
  if (datos.tipoCredito) out.tipoCredito = datos.tipoCredito;
  if (datos.cliente2) out.cliente2 = datos.cliente2;
  if (datos.cedula2) out.cedula2 = datos.cedula2;
  const v = numero(datos.valorSolicitado);
  if (v != null) out.valorSolicitado = v;
  return out;
}

function numero(v: string | undefined): number | null {
  if (!v) return null;
  const limpio = v.replace(/[^\d]/g, "");
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

function sello(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}/${d.getUTCFullYear()}`;
}
