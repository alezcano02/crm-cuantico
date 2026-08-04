import { NextRequest, NextResponse } from "next/server";
import { exigirSesion } from "@/lib/auth";
import { leerPdf } from "@/lib/pdf-texto";
import { todasLasFilas } from "@/lib/pdf-layout";
import { extraerPoliza } from "@/lib/extraer-poliza";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Un PDF de póliza no llega a esto ni de lejos; el tope evita abusos. */
const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Lee una póliza en PDF y devuelve los campos que encuentra.
 *
 * No toca la base: solo propone. Quien ingresa la póliza revisa y guarda con
 * el formulario de siempre.
 */
export async function POST(req: NextRequest) {
  const noAutorizado = await exigirSesion();
  if (noAutorizado) return noAutorizado;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Adjunte el PDF en el campo 'archivo'." },
      { status: 400 }
    );
  }

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File)) {
    return NextResponse.json(
      { error: "Adjunte el PDF en el campo 'archivo'." },
      { status: 400 }
    );
  }
  if (archivo.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "El archivo pesa más de 15 MB. ¿Seguro que es una póliza?" },
      { status: 413 }
    );
  }

  try {
    const datos = new Uint8Array(await archivo.arrayBuffer());
    const paginas = await leerPdf(datos);
    const extraido = extraerPoliza(todasLasFilas(paginas));
    return NextResponse.json({ ok: true, ...extraido });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          "No se pudo leer el PDF. Si está protegido con contraseña o es una imagen escaneada, hay que ingresar la póliza a mano. " +
          String(e).slice(0, 160),
      },
      { status: 422 }
    );
  }
}
