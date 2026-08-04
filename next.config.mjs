/**
 * El CRM se sirve dentro del sitio de la agencia, en
 * cuanticoseguros.com.co/funcionarios. El sitio está en Netlify y reenvía esa
 * ruta a este despliegue de Vercel con una regla de reescritura (status 200,
 * no redirección), de modo que el usuario nunca sale del dominio.
 *
 * Para que eso funcione, la aplicación entera tiene que colgar de
 * /funcionarios: si no, sus enlaces y sus recursos apuntarían a la raíz del
 * sitio y Netlify devolvería 404. `basePath` hace justamente eso — Next añade
 * el prefijo a las rutas, a los Link, a los redirect() y a /_next/*.
 *
 * Se deja configurable por si algún día cambia la ruta pública.
 */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "/funcionarios";

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: BASE,
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // pdfjs resuelve su propio worker en tiempo de ejecución. Si Next lo
    // empaqueta, esa resolución apunta dentro de .next y falla con
    // «Cannot find module pdf.worker.mjs». Se deja fuera del empaquetado para
    // que se cargue desde node_modules como cualquier módulo de Node.
    serverComponentsExternalPackages: ["pdfjs-dist"],
  },
  async redirects() {
    return [
      // Quien llegue a la raíz del despliegue de Vercel —un marcador antiguo,
      // por ejemplo— acaba en la aplicación en vez de en un 404.
      { source: "/", destination: BASE, basePath: false, permanent: false },
    ];
  },
};

export default nextConfig;
