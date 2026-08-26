import { ImageResponse } from "next/og";
import { IconoMarca } from "@/lib/marca-icono";

export const runtime = "edge";

/**
 * Ícono para «Añadir a inicio» en iPhone/iPad.
 *
 * Sin este archivo, Safari no encuentra un apple-touch-icon y arma uno solo
 * con una captura recortada de la pantalla — así llegó el acceso directo sin
 * logo que reportó el usuario. Next detecta `app/apple-icon.tsx` por
 * convención y añade el <link rel="apple-touch-icon"> él solo.
 *
 * Sin esquinas redondeadas propias: iOS le aplica su propia máscara al
 * ícono, así que un fondo ya redondeado se ve con doble borde.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<IconoMarca tamano={180} escala={0.82} />, size);
}
