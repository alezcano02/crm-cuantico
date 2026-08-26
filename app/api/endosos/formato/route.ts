import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirSesion } from "@/lib/auth";
import { claveFormatoPorAseguradora } from "@/lib/endosos";
import {
  CASOS_POR_ARCHIVO,
  generarFormatoAseguradora,
  type CasoFormato,
} from "@/lib/formatos-aseguradora";

export const runtime = "nodejs";

/**
 * Descarga el formato de solicitud ya diligenciado con TODOS los casos que se
 * marcaron, en un solo archivo.
 *
 * Es un lote y no un caso suelto porque así se tramita de verdad: se juntan
 * todos los apartamentos de un edificio que están listos y se manda una sola
 * planilla a la aseguradora.
 */
export async function POST(req: NextRequest) {
  const noAutorizado = await exigirSesion();
  if (noAutorizado) return noAutorizado;

  let cuerpo: { ids?: unknown };
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const ids = Array.isArray(cuerpo.ids)
    ? cuerpo.ids.filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    : [];
  if (!ids.length) {
    return NextResponse.json({ error: "No se marcó ningún endoso." }, { status: 400 });
  }
  if (ids.length > CASOS_POR_ARCHIVO) {
    return NextResponse.json(
      {
        error: `La planilla admite ${CASOS_POR_ARCHIVO} casos por archivo y se marcaron ${ids.length}. Divide el envío.`,
      },
      { status: 400 }
    );
  }

  const endosos = await prisma.endoso.findMany({
    where: { id: { in: ids } },
    include: { copropiedad: true },
    orderBy: [{ urbanizacion: "asc" }, { apartamento: "asc" }],
  });
  if (!endosos.length) {
    return NextResponse.json({ error: "Los endosos marcados ya no existen." }, { status: 404 });
  }

  // Una planilla es de UNA aseguradora: cada compañía tiene la suya.
  const aseguradoras = [...new Set(endosos.map((e) => e.aseguradora ?? ""))];
  if (aseguradoras.length > 1) {
    return NextResponse.json(
      {
        error: `Los casos marcados son de varias aseguradoras (${aseguradoras
          .map((a) => a || "sin asignar")
          .join(", ")}). Cada aseguradora tiene su propia planilla: marca los de una sola.`,
      },
      { status: 400 }
    );
  }

  const aseguradora = aseguradoras[0];
  const clave = claveFormatoPorAseguradora(aseguradora);
  if (!clave) {
    return NextResponse.json(
      {
        error: aseguradora
          ? `Todavía no hay planilla automática para "${aseguradora}". Disponibles: Axa Colpatria, Zurich, Previsora, SBS.`
          : "Los casos marcados no tienen aseguradora asignada.",
      },
      { status: 400 }
    );
  }

  /*
   * La planilla de Zurich lleva los datos del edificio arriba, una sola vez
   * (póliza, tomador, NIT, vigencia, valor asegurado), así que un archivo no
   * puede mezclar copropiedades. Las demás repiten esos datos en cada fila.
   */
  const copropiedades = [...new Set(endosos.map((e) => e.urbanizacion))];
  if (clave === "ZURICH" && copropiedades.length > 1) {
    return NextResponse.json(
      {
        error: `La planilla de Zurich lleva los datos del edificio arriba, así que un archivo es de una sola copropiedad. Marcaste ${copropiedades.length}: ${copropiedades.join(", ")}.`,
      },
      { status: 400 }
    );
  }

  const casos: CasoFormato[] = endosos.map((e) => ({ endoso: e, copropiedad: e.copropiedad }));
  const etiqueta = copropiedades.length === 1 ? copropiedades[0] : `${copropiedades.length}-copropiedades`;

  let generado;
  try {
    generado = generarFormatoAseguradora(clave, casos, etiqueta);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo generar la planilla." },
      { status: 500 }
    );
  }

  return new NextResponse(generado.buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${generado.nombreArchivo}"`,
      "X-Campos-Faltantes": encodeURIComponent(JSON.stringify(generado.faltantes)),
      "X-Casos": String(generado.casos),
    },
  });
}
