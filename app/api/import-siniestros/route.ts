import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirImportador } from "@/lib/auth";
import {
  parsearResumen,
  parsearSeguimiento,
  ResumenSiniestros,
  SiniestroInput,
} from "@/lib/siniestros";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Importa los siniestros. Se pueden enviar los dos archivos a la vez:
 *  · "seguimiento": el de una hoja por cliente (el del detalle).
 *  · "resumen": SINIESTROS.xlsx, que aporta responsable y cifras.
 * Basta con uno de los dos.
 */
export async function POST(req: NextRequest) {
  const noAutorizado = await exigirImportador();
  if (noAutorizado) return noAutorizado;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "No se recibió ningún archivo." }, { status: 400 });
  }

  const seguimiento = formData.get("seguimiento");
  const resumenArchivo = formData.get("resumen");
  if (!(seguimiento instanceof File) && !(resumenArchivo instanceof File)) {
    return NextResponse.json(
      { error: "Adjunte el archivo de seguimiento de siniestros o el resumen." },
      { status: 400 }
    );
  }

  let siniestros: SiniestroInput[] = [];
  const resumenes: ResumenSiniestros[] = [];

  try {
    if (seguimiento instanceof File) {
      const r = parsearSeguimiento(await seguimiento.arrayBuffer());
      siniestros = r.siniestros;
      resumenes.push(r.resumen);
    }
    if (resumenArchivo instanceof File) {
      // Se cruza con lo que trajo el detalle para no duplicar los mismos casos.
      const r = parsearResumen(await resumenArchivo.arrayBuffer(), siniestros);
      siniestros = [...siniestros, ...r.siniestros];
      resumenes.push(r.resumen);
    }
  } catch (e) {
    return NextResponse.json(
      { error: "No se pudo leer el archivo. ¿Es un .xlsx válido? " + String(e) },
      { status: 400 }
    );
  }

  if (siniestros.length === 0) {
    return NextResponse.json(
      { error: "No se encontró ningún siniestro en el archivo.", resumen: resumenes },
      { status: 400 }
    );
  }

  // Se conserva lo que se haya trabajado dentro de la app (nota interna,
  // cierre manual) casando por cliente + radicado o cobertura.
  const previos = await prisma.siniestro.findMany({
    where: { OR: [{ manual: true }, { notaInterna: { not: null } }, { cerrado: true }] },
    select: {
      asegurado: true,
      radicado: true,
      cobertura: true,
      notaInterna: true,
      cerrado: true,
    },
  });
  const clave = (asegurado: string, radicado: string | null, cobertura: string | null) =>
    [asegurado, radicado ?? "", cobertura ?? ""]
      .join("|")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9|]/g, "");
  const antes = new Map(
    previos.map((p) => [clave(p.asegurado, p.radicado, p.cobertura), p])
  );

  await prisma.$transaction(
    async (tx) => {
      await tx.siniestro.deleteMany({ where: { manual: false } });
      await tx.siniestro.createMany({
        data: siniestros.map((s) => {
          const previo = antes.get(clave(s.asegurado, s.radicado, s.cobertura));
          return {
            ...s,
            notaInterna: previo?.notaInterna ?? null,
            cerrado: previo?.cerrado ?? false,
          };
        }),
      });
    },
    { timeout: 55000 }
  );

  const total = await prisma.siniestro.count();
  return NextResponse.json({ ok: true, total, resumen: resumenes });
}
