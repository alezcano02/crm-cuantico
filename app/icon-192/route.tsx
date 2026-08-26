import { ImageResponse } from "next/og";
import { IconoMarca } from "@/lib/marca-icono";

export const runtime = "edge";

/** Ícono de 192×192 para el manifest (Android «Añadir a inicio»). */
export async function GET() {
  return new ImageResponse(<IconoMarca tamano={192} escala={0.78} />, {
    width: 192,
    height: 192,
  });
}
