import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirColectivas } from "@/lib/auth";
import { invalidarCartera } from "@/lib/cache";

export const runtime = "nodejs";

/**
 * Alta de una persona en una colectiva (inclusión).
 *
 * Crea el amparado y, en la misma transacción, la novedad que lo registra: la
 * bitácora es lo que se concilia con la aseguradora, así que un amparado sin
 * su novedad sería un movimiento invisible.
 */
export async function POST(req: NextRequest) {
  const noAutorizado = await exigirColectivas();
  if (noAutorizado) return noAutorizado;

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const texto = (k: string) => {
    const v = b[k];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const numero = (k: string) => {
    const v = b[k];
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const empresaId = numero("empresaId");
  const polizaNumero = texto("polizaNumero");
  const docAmparado = texto("docAmparado");
  const nombreAmparado = texto("nombreAmparado");
  const parentesco = texto("parentesco");
  const ramo = texto("ramo");

  /*
   * El documento NO se exige.
   *
   * Los beneficiarios llegan de los listados de la aseguradora con nombre y
   * parentesco pero sin cédula —así los manda Sura—, y en una colectiva de
   * autos el amparado es una placa, que tampoco tiene documento. Exigirlo
   * hacía imposible dar de alta a mano justo lo que la importación sí carga.
   */
  if (!empresaId || !polizaNumero || !nombreAmparado || !parentesco || !ramo) {
    return NextResponse.json(
      { error: "Faltan empresa, póliza, ramo, nombre o parentesco." },
      { status: 400 }
    );
  }

  const empresa = await prisma.empresaColectiva.findUnique({ where: { id: empresaId } });
  if (!empresa) {
    return NextResponse.json({ error: "La empresa no existe." }, { status: 404 });
  }

  // Un afiliado repetido en la misma póliza casi siempre es un doble clic o un
  // pegado de más, no una persona con dos coberturas. Se compara por nombre y
  // no por documento porque, como se dijo arriba, muchos no lo traen: con
  // `docAmparado` vacío esta comprobación casaba a todos entre sí.
  const empleado = texto("docEmpleado") ?? docAmparado ?? "";
  const yaEsta = await prisma.amparadoColectiva.findFirst({
    where: { polizaNumero, nombreAmparado, docEmpleado: empleado, fechaRetiro: null },
  });
  if (yaEsta) {
    return NextResponse.json(
      { error: `${nombreAmparado} ya está activo en la póliza ${polizaNumero}.` },
      { status: 409 }
    );
  }

  const fechaIngreso = texto("fechaIngreso") ? new Date(texto("fechaIngreso")!) : new Date();

  /*
   * La comprobación de arriba solo mira los amparados ACTIVOS, así que volver
   * a dar de alta a alguien que fue retirado choca igualmente contra la llave
   * única (póliza, empleado, amparado). Sin este catch la pantalla mostraba un
   * 500 pelado en un caso que el usuario puede resolver solo.
   */
  try {
    const creado = await prisma.$transaction(async (tx) => {
    const a = await tx.amparadoColectiva.create({
      data: {
        empresaId,
        polizaNumero,
        ramo,
        plan: texto("plan"),
        docEmpleado: empleado,
        nombreEmpleado: texto("nombreEmpleado") ?? nombreAmparado,
        docAmparado: docAmparado ?? "",
        nombreAmparado,
        parentesco: parentesco.toUpperCase(),
        // En una colectiva de autos el amparado es la placa.
        placa: parentesco.toUpperCase() === "VE" ? (texto("placa") ?? nombreAmparado) : texto("placa"),
        sexo: texto("sexo"),
        valorAsegurado: numero("valorAsegurado"),
        primaMensual: numero("primaMensual"),
        estado: texto("estado") ?? "EN EXPEDICION",
        radicado: texto("radicado"),
        observacion: texto("observacion"),
        fechaIngreso,
      },
    });
    await tx.novedadColectiva.create({
      data: {
        empresaId,
        amparadoId: a.id,
        tipo: "INCLUSION",
        fecha: fechaIngreso,
        estado: "SOLICITADA",
        radicado: texto("radicado"),
        nombreAmparado,
        docAmparado: docAmparado ?? empleado,
        nota: texto("observacion"),
      },
    });
      return a;
    });
    invalidarCartera();
    return NextResponse.json({ ok: true, id: creado.id });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") {
      return NextResponse.json(
        {
          error:
            `${nombreAmparado} ya figura en la póliza ${polizaNumero}, aunque esté retirado. ` +
            "Búsquelo con «Ver también los retirados» y reactívelo en vez de crearlo otra vez.",
        },
        { status: 409 }
      );
    }
    throw e;
  }
}
