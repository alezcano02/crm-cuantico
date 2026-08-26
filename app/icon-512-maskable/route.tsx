import { ImageResponse } from "next/og";
import { IconoMarca } from "@/lib/marca-icono";

export const runtime = "edge";

/**
 * Versión «maskable» del ícono: Android recorta un círculo dentro del
 * cuadrado y descarta lo que quede fuera de la «zona segura» (~66% central).
 * Por eso aquí el átomo va más chico que en icon-512 — para que ese recorte
 * no le corte los pétalos.
 */
export async function GET() {
  return new ImageResponse(<IconoMarca tamano={512} escala={0.55} />, {
    width: 512,
    height: 512,
  });
}
