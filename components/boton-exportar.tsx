"use client";

import { Columna, descargarCSV } from "@/lib/exportar";
import { IconDescargar } from "@/components/icons";

/**
 * Descarga las filas que se están viendo (ya filtradas) como CSV para Excel.
 */
export function BotonExportar<T>({
  nombre,
  filas,
  columnas,
  etiqueta = "Exportar",
}: {
  nombre: string;
  filas: T[];
  columnas: Columna<T>[];
  etiqueta?: string;
}) {
  const vacio = filas.length === 0;
  return (
    <button
      onClick={() => descargarCSV(nombre, filas, columnas)}
      disabled={vacio}
      title={
        vacio
          ? "No hay filas para exportar"
          : `Descargar ${filas.length} filas en formato Excel (CSV)`
      }
      className="inline-flex items-center gap-1.5 rounded-lg border border-line-axis bg-surface px-2.5 py-1.5 text-sm font-medium text-ink-secondary transition-colors hover:border-brand-300 hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
    >
      <IconDescargar className="h-4 w-4" />
      {etiqueta}
    </button>
  );
}
