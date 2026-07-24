/**
 * Exportación de tablas a CSV legible por Excel en español.
 *
 * Se usa punto y coma como separador y coma decimal, que es lo que espera
 * Excel con configuración regional es-CO; y se antepone el BOM de UTF-8 para
 * que las tildes y la Ñ se vean bien al abrir el archivo.
 */

export type Columna<T> = {
  encabezado: string;
  valor: (fila: T) => string | number | Date | null | undefined;
};

function celda(v: string | number | Date | null | undefined): string {
  if (v == null) return "";
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return "";
    const d = String(v.getUTCDate()).padStart(2, "0");
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    return `${d}/${m}/${v.getUTCFullYear()}`;
  }
  if (typeof v === "number") {
    if (!isFinite(v)) return "";
    // Coma decimal para que Excel en español lo lea como número
    return String(v).replace(".", ",");
  }
  const s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function construirCSV<T>(filas: T[], columnas: Columna<T>[]): string {
  const encabezado = columnas.map((c) => celda(c.encabezado)).join(";");
  const cuerpo = filas.map((f) => columnas.map((c) => celda(c.valor(f))).join(";"));
  return [encabezado, ...cuerpo].join("\r\n");
}

/** Descarga el CSV en el navegador con la fecha del día en el nombre. */
export function descargarCSV<T>(
  nombre: string,
  filas: T[],
  columnas: Columna<T>[]
): void {
  const csv = construirCSV(filas, columnas);
  // ﻿ = BOM UTF-8; sin él Excel rompe los acentos.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const hoy = new Date();
  const sello = `${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, "0")}${String(hoy.getDate()).padStart(2, "0")}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombre}-${sello}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
