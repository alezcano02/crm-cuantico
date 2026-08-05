"use client";

/**
 * Filtros plegables sobre el contenido del módulo.
 *
 * Antes viajaban por un portal a una columna de la izquierda. Esa columna la
 * ocupa ahora el menú (ver components/app-shell.tsx), así que el portal ya no
 * tiene destino y desapareció: los filtros se dibujan donde están declarados,
 * dentro del componente que tiene su estado.
 *
 * Van cerrados. Abiertos ocupan una banda alta sobre la tabla, y lo que se
 * quiere ver al entrar es la tabla; quien va a filtrar da un clic.
 */
export function PanelFiltros({ children }: { children: React.ReactNode }) {
  return (
    <details className="mb-4">
      <summary className="etiqueta-marca inline-flex cursor-pointer select-none items-center gap-1.5 rounded-lg border border-line-grid bg-surface px-3 py-2 text-[12px] text-ink-secondary hover:bg-surface-page">
        Filtros
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}
