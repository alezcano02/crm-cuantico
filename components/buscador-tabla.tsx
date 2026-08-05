"use client";

import { IconBuscar } from "@/components/icons";

/**
 * Buscador de una tabla, pensado para ir FUERA del panel de filtros.
 *
 * Estaba dentro, junto a los desplegables, y el panel se pliega: buscar una
 * póliza concreta —que es lo que más se hace— costaba un clic de más y no se
 * veía que existiera. Los filtros de verdad (ramo, aseguradora, asesor) sí
 * viven bien plegados, porque se usan de vez en cuando.
 */
export function BuscadorTabla({
  valor,
  onCambiar,
  marcador = "Buscar póliza / asegurado / NIT",
}: {
  valor: string;
  onCambiar: (v: string) => void;
  marcador?: string;
}) {
  return (
    <div className="relative min-w-[240px] flex-1 sm:max-w-xs">
      <IconBuscar className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
      <input
        type="search"
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        placeholder={marcador}
        aria-label={marcador}
        className="w-full rounded-lg border border-line-axis bg-surface py-1.5 pl-8 pr-2.5 text-sm focus:border-brand focus:outline-none"
      />
    </div>
  );
}
