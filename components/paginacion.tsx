"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Paginación en el cliente para las tablas largas.
 *
 * Cartera y Vencimientos pintaban las 716 pólizas de una vez: unos 850 KB de
 * HTML por carga y 716 filas en el DOM, que en un teléfono se nota al
 * desplazar. Los filtros y la búsqueda siguen actuando sobre la lista
 * completa; lo único que se recorta es lo que se dibuja.
 */
export const FILAS_POR_PAGINA = 100;

export function usePaginacion<T>(filas: T[], porPagina = FILAS_POR_PAGINA) {
  const [pagina, setPagina] = useState(1);
  const totalPaginas = Math.max(1, Math.ceil(filas.length / porPagina));

  // Al cambiar los filtros la lista se acorta; si estábamos en la página 7 de
  // 7 y ahora hay 2, hay que volver a una página que exista.
  useEffect(() => {
    setPagina((p) => Math.min(p, totalPaginas));
  }, [totalPaginas]);

  const visibles = useMemo(
    () => filas.slice((pagina - 1) * porPagina, pagina * porPagina),
    [filas, pagina, porPagina]
  );

  return { visibles, pagina, setPagina, totalPaginas, porPagina };
}

export function Paginacion({
  pagina,
  totalPaginas,
  onCambiar,
  total,
  porPagina = FILAS_POR_PAGINA,
  etiqueta = "registros",
}: {
  pagina: number;
  totalPaginas: number;
  onCambiar: (p: number) => void;
  total: number;
  porPagina?: number;
  etiqueta?: string;
}) {
  if (totalPaginas <= 1) return null;
  const desde = (pagina - 1) * porPagina + 1;
  const hasta = Math.min(pagina * porPagina, total);
  const claseBoton =
    "rounded-lg border border-line-axis px-2.5 py-1 text-sm text-ink-secondary transition-colors hover:bg-surface-page disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <div className="no-imprimir mt-3 flex flex-wrap items-center gap-2 border-t border-line-grid pt-3">
      <span className="text-sm text-ink-muted">
        {desde}–{hasta} de {total} {etiqueta}
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        <button
          onClick={() => onCambiar(1)}
          disabled={pagina === 1}
          className={claseBoton}
          aria-label="Primera página"
        >
          «
        </button>
        <button
          onClick={() => onCambiar(pagina - 1)}
          disabled={pagina === 1}
          className={claseBoton}
        >
          Anterior
        </button>
        <span className="px-1.5 text-sm tabla-num">
          {pagina} / {totalPaginas}
        </span>
        <button
          onClick={() => onCambiar(pagina + 1)}
          disabled={pagina === totalPaginas}
          className={claseBoton}
        >
          Siguiente
        </button>
        <button
          onClick={() => onCambiar(totalPaginas)}
          disabled={pagina === totalPaginas}
          className={claseBoton}
          aria-label="Última página"
        >
          »
        </button>
      </div>
    </div>
  );
}
