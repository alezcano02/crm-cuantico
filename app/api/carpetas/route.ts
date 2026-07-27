import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirSesion } from "@/lib/auth";
import { claveCliente } from "@/lib/carpetas";

export const runtime = "nodejs";

/**
 * Asigna a mano la carpeta de un cliente cuando el indexador no la detectó.
 * Se guarda con origen "manual" para que una reindexación no la sobrescriba.
 */
export async function PUT(req: NextRequest) {
  const noAutorizado = await exigirSesion();
  if (noAutorizado) return noAutorizado;

  let body: { asegurado?: string; url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const asegurado = (body.asegurado ?? "").trim();
  const url = (body.url ?? "").trim();
  if (!asegurado) {
    return NextResponse.json({ error: "Falta el nombre del cliente." }, { status: 400 });
  }
  const clave = claveCliente(asegurado);
  if (!clave) {
    return NextResponse.json({ error: "Nombre de cliente inválido." }, { status: 400 });
  }

  // Sin URL se entiende que se quiere quitar el enlace.
  if (!url) {
    await prisma.carpetaCliente.deleteMany({ where: { clave } });
    return NextResponse.json({ ok: true, url: null });
  }

  if (!/^https:\/\/[\w.-]*sharepoint\.com\//i.test(url)) {
    return NextResponse.json(
      { error: "Pegue un enlace de SharePoint (debe empezar por https://…sharepoint.com/)." },
      { status: 400 }
    );
  }

  await prisma.carpetaCliente.upsert({
    where: { clave },
    create: { clave, nombre: asegurado, asesor: null, ruta: "", url, origen: "manual" },
    update: { url, nombre: asegurado, origen: "manual" },
  });

  return NextResponse.json({ ok: true, url });
}
