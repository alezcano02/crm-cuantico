import { NextResponse } from "next/server";

/**
 * El manifest de la PWA, como ruta normal en vez de la convención de archivo
 * `app/manifest.ts`.
 *
 * Con `manifest.ts`, Next generaba el <link rel="manifest"> sin anteponerle
 * el basePath (salía "/manifest.webmanifest" en vez de
 * "/funcionarios/manifest.webmanifest"), y en el sitio público esa ruta cae
 * fuera de /funcionarios y da 404 — «Añadir a inicio» se quedaba sin
 * manifest aunque el JSON existiera. Como ruta corriente sí hereda el
 * basePath igual que /icon-512 y las demás, y el <link> se declara a mano en
 * app/layout.tsx con la ruta completa.
 */
export function GET() {
  return NextResponse.json(
    {
      name: "Cuántico Seguros — CRM",
      short_name: "Cuántico CRM",
      description:
        "Cartera, vencimientos y producción de Cuántico Agencia de Seguros",
      start_url: ".",
      display: "standalone",
      background_color: "#f4f1ec",
      theme_color: "#132240",
      icons: [
        { src: "icon-192", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
        {
          src: "icon-512-maskable",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } }
  );
}
