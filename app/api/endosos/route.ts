import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirSesion } from "@/lib/auth";
import { ESTADOS_ENDOSO, normalizar, normalizarAseguradora, type EstadoEndoso } from "@/lib/endosos";

export const runtime = "nodejs";

function texto(b: Record<string, unknown>, k: string): string | null {
  const v = b[k];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Los valores llegan escritos como los teclea la gente: «$162.369.194»,
 * «311,920,125.oo», «72´299.301». Hay que quedarse con el número.
 *
 * El criterio es que en Colombia el punto separa miles y la coma decimales,
 * pero los correos usan las dos convenciones mezcladas y ningún endoso se pide
 * con centavos: se descarta todo lo que no sea dígito.
 */
function numero(b: Record<string, unknown>, k: string): number | null {
  const v = b[k];
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : null;
  if (typeof v !== "string" || !v.trim()) return null;
  const limpio = v.replace(/[^\d]/g, "");
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/** El coeficiente sí lleva decimales: 0,36 % no es lo mismo que 36 %. */
function porcentaje(b: Record<string, unknown>, k: string): number | null {
  const v = b[k];
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || !v.trim()) return null;
  const n = Number(v.replace(/%/g, "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Listado. Existe sobre todo para el flujo asistido: antes de dar de alta un
 * caso leído del correo hay que poder mirar si ya está, y no duplicarlo.
 */
export async function GET(req: NextRequest) {
  const noAutorizado = await exigirSesion();
  if (noAutorizado) return noAutorizado;

  const q = req.nextUrl.searchParams.get("q")?.trim();
  const estado = req.nextUrl.searchParams.get("estado")?.trim();

  const endosos = await prisma.endoso.findMany({
    where: {
      ...(estado ? { estado } : {}),
      ...(q
        ? {
            OR: [
              { cliente: { contains: q, mode: "insensitive" as const } },
              { urbanizacion: { contains: q, mode: "insensitive" as const } },
              { apartamento: { contains: q, mode: "insensitive" as const } },
              { cedula: { contains: q } },
            ],
          }
        : {}),
    },
    include: { copropiedad: true },
    orderBy: { creadoEn: "desc" },
    take: 100,
  });

  return NextResponse.json({ ok: true, total: endosos.length, endosos });
}

/**
 * Alta de un endoso.
 *
 * Lo usan por igual el formulario del CRM y una sesión de Claude que haya
 * leído el buzón: mismo endpoint, mismas validaciones.
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

  const cliente = texto(b, "cliente");
  const urbanizacion = texto(b, "urbanizacion");
  if (!cliente) {
    return NextResponse.json({ error: "El nombre del cliente es obligatorio." }, { status: 400 });
  }
  if (!urbanizacion) {
    return NextResponse.json({ error: "La copropiedad es obligatoria." }, { status: 400 });
  }

  const estado = texto(b, "estado");
  if (estado && !ESTADOS_ENDOSO.includes(estado as EstadoEndoso)) {
    return NextResponse.json(
      { error: `Estado desconocido: ${estado}. Válidos: ${ESTADOS_ENDOSO.join(", ")}.` },
      { status: 400 }
    );
  }

  /*
   * Se busca la ficha del edificio por nombre normalizado —«Marsella» y
   * «CONJUNTO RESIDENCIAL MARSELLA» son el mismo sitio— para que quien crea el
   * caso no tenga que saber el id. Si no existe todavía, el endoso se guarda
   * igual con el nombre en texto: la solicitud llega antes de que nadie dé de
   * alta la copropiedad, y perderla por eso sería absurdo.
   */
  let copropiedadId = typeof b.copropiedadId === "number" ? b.copropiedadId : null;
  const candidatas = await prisma.copropiedad.findMany({
    select: { id: true, nombre: true, aseguradora: true, numeroPoliza: true },
  });
  if (!copropiedadId) {
    const objetivo = normalizar(urbanizacion);
    const exacta = candidatas.find((c) => normalizar(c.nombre) === objetivo);
    const parcial =
      exacta ??
      candidatas.find(
        (c) => normalizar(c.nombre).includes(objetivo) || objetivo.includes(normalizar(c.nombre))
      );
    copropiedadId = parcial?.id ?? null;
  }

  /*
   * La aseguradora y el número de póliza salen de la ficha del edificio.
   *
   * No son datos del caso sino de la copropiedad: todos los endosos de
   * Marsella van a Zurich con la misma póliza. Pedírselos a quien crea el caso
   * —o dejar que los escriba quien lee el correo— era pedir que copiara a mano
   * algo que el CRM ya sabe, y de ahí salían las variantes de escritura y las
   * planillas generadas sin número de póliza.
   *
   * Lo que venga en la petición manda: si alguien tramita un caso concreto por
   * otra aseguradora, su dato no se pisa.
   */
  const ficha = copropiedadId ? candidatas.find((c) => c.id === copropiedadId) : undefined;
  const aseguradora = normalizarAseguradora(texto(b, "aseguradora")) ?? ficha?.aseguradora ?? null;
  const numeroPoliza = texto(b, "numeroPoliza") ?? ficha?.numeroPoliza ?? null;

  const fechaEnvio = texto(b, "fechaEnvioAseguradora");

  const creado = await prisma.endoso.create({
    data: {
      urbanizacion,
      copropiedadId,
      cliente,
      cedula: texto(b, "cedula"),
      cliente2: texto(b, "cliente2"),
      cedula2: texto(b, "cedula2"),
      correoSolicitante: texto(b, "correoSolicitante"),
      celular: texto(b, "celular"),
      direccion: texto(b, "direccion"),
      ciudad: texto(b, "ciudad"),
      torre: texto(b, "torre"),
      apartamento: texto(b, "apartamento"),
      cuartoUtil: texto(b, "cuartoUtil"),
      parqueadero: texto(b, "parqueadero"),
      coeficiente: porcentaje(b, "coeficiente"),
      valorSolicitado: numero(b, "valorSolicitado"),
      banco: texto(b, "banco"),
      bancoNit: texto(b, "bancoNit"),
      tipoCredito: texto(b, "tipoCredito"),
      aseguradora: normalizarAseguradora(aseguradora),
      numeroPoliza,
      radicado: texto(b, "radicado"),
      fechaEnvioAseguradora: fechaEnvio ? new Date(fechaEnvio) : null,
      estado: estado ?? "NUEVA_SOLICITUD",
      origenCorreoId: texto(b, "origenCorreoId"),
      // La primera nota deja constancia de por dónde entró el caso.
      historia: texto(b, "nota")
        ? `${sello(new Date())} · ${texto(b, "nota")}`
        : null,
      policyId: typeof b.policyId === "number" ? b.policyId : null,
    },
  });

  return NextResponse.json({ ok: true, id: creado.id, copropiedadId });
}

/** DD/MM/AAAA, el mismo sello que usan las bitácoras del resto del CRM. */
function sello(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}/${d.getUTCFullYear()}`;
}
