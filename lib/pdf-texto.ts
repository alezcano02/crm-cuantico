import type { Fragmento, PaginaPdf } from "./pdf-layout";
import { agruparEnFilas } from "./pdf-layout";

/**
 * Lee un PDF y devuelve sus fragmentos con coordenadas, página a página.
 *
 * Se usa la compilación `legacy` de pdfjs porque es la que funciona en Node sin
 * DOM, que es donde corre esto (ruta de API en Vercel). El trabajo (worker) se
 * desactiva a propósito: en serverless no hay hilo aparte que aprovechar y
 * arrancarlo solo añade latencia y una fuente más de fallos.
 */
export async function leerPdf(datos: Uint8Array): Promise<PaginaPdf[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // pdfjs busca su worker por su cuenta y, dentro de Next, resuelve mal. Se le
  // da la ruta real desde node_modules (ver también serverComponentsExternal-
  // Packages en next.config.mjs).
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    // require está disponible porque esto solo corre en el servidor; el tipo
    // no lo conoce en un módulo ES, de ahí el acceso indirecto.
    const requerir = eval("require") as NodeJS.Require;
    pdfjs.GlobalWorkerOptions.workerSrc = requerir.resolve(
      "pdfjs-dist/legacy/build/pdf.worker.mjs"
    );
  }

  const doc = await pdfjs.getDocument({
    data: datos,
    useSystemFonts: true,
    // Sin esto, algunos PDF de compañías piden fuentes estándar por red.
    isEvalSupported: false,
  }).promise;

  const paginas: PaginaPdf[] = [];
  // Con las primeras páginas basta: la carátula trae los datos y el resto es
  // clausulado. Leer 200 páginas de condiciones generales solo gasta tiempo.
  const limite = Math.min(doc.numPages, 4);

  for (let n = 1; n <= limite; n++) {
    const pagina = await doc.getPage(n);
    const vista = pagina.getViewport({ scale: 1 });
    const contenido = await pagina.getTextContent();

    const frags: Fragmento[] = [];
    for (const item of contenido.items as { str: string; transform: number[]; width: number; height: number }[]) {
      if (!item.str || !item.str.trim()) continue;
      const [, , , , x, y] = item.transform;
      frags.push({
        texto: item.str,
        x,
        // pdfjs mide desde abajo; se invierte para poder razonar «más arriba».
        y: vista.height - y,
        ancho: item.width || 0,
        alto: item.height || 8,
      });
    }

    paginas.push({
      numero: n,
      ancho: vista.width,
      alto: vista.height,
      filas: agruparEnFilas(frags),
    });
  }

  await doc.destroy();
  return paginas;
}
