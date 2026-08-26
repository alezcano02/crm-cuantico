import { ImageResponse } from "next/og";
import { IconoMarca } from "@/lib/marca-icono";

export const runtime = "edge";

/** Ícono de 512×512 para el manifest (Android «Añadir a inicio»). */
export async function GET() {
  return new ImageResponse(<IconoMarca tamano={512} escala={0.78} />, {
    width: 512,
    height: 512,
  });
}
