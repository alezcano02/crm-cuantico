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
export function PanelFiltros({
  children,
  activos = 0,
}: {
  children: React.ReactNode;
  /** Cuántos filtros hay puestos, para avisarlo con el panel cerrado. */
  activos?: number;
}) {
  return (
    <details className="mb-4" open={activos > 0}>
      <summary
        className={
          "etiqueta-marca inline-flex cursor-pointer select-none items-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] hover:bg-surface-page " +
          (activos
            ? "border-brand bg-brand/5 text-brand"
            : "border-line-grid bg-surface text-ink-secondary")
        }
      >
        Filtros
        {activos > 0 && (
          // El panel va cerrado por defecto, así que sin este número se podía
          // estar mirando una tabla recortada sin saberlo.
          <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
            {activos}
          </span>
        )}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}
