import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirSesion } from "@/lib/auth";
import { claveFormatoPorAseguradora, generarFormatoAseguradora } from "@/lib/formatos-aseguradora";

export const runtime = "nodejs";

/**
 * Descarga el formato de solicitud de endoso ya diligenciado con los datos
 * del caso, listo para revisar y enviar a la aseguradora.
 *
 * La aseguradora se toma del propio endoso; se puede forzar otra con
 * ?aseguradora=Zurich (por si Juan necesita probar el formato de una
 * aseguradora distinta a la guardada en el caso).
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const noAutorizado = await exigirSesion();
  if (noAutorizado) return noAutorizado;

  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Identificador inválido." }, { status: 400 });
  }

  const endoso = await prisma.endoso.findUnique({ where: { id }, include: { copropiedad: true } });
  if (!endoso) {
    return NextResponse.json({ error: "El endoso no existe." }, { status: 404 });
  }

  const aseguradora = req.nextUrl.searchParams.get("aseguradora") || endoso.aseguradora;
  const clave = claveFormatoPorAseguradora(aseguradora);
  if (!clave) {
    return NextResponse.json(
      {
        error: aseguradora
          ? `Todavía no hay formato automático para "${aseguradora}". Disponibles: Axa Colpatria, Zurich, Previsora, SBS.`
          : "El caso no tiene aseguradora asignada.",
      },
      { status: 400 }
    );
  }

  const { buffer, nombreArchivo, faltantes } = generarFormatoAseguradora(clave, endoso, endoso.copropiedad, endoso.cliente);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
      "X-Campos-Faltantes": encodeURIComponent(JSON.stringify(faltantes)),
    },
  });
}
