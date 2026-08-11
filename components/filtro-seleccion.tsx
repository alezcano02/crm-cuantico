"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";

/**
 * Filtro de una categoría (ramo, aseguradora, asesor…) con selección múltiple.
 *
 * POR QUÉ NO UN <select>
 *
 * El desplegable nativo solo deja elegir un valor, y la pregunta de todos los
 * días no es «¿cuántas de AUTOS?» sino «¿cuántas de AUTOS y HOGAR?». Con un
 * solo valor había que mirar los ramos de uno en uno y sumar a mano.
 *
 * ARRANCA EN MODO SENCILLO
 *
 * De entrada se comporta como el desplegable de siempre: se pulsa una opción,
 * se aplica y se cierra. Quien necesite cruzar varias pulsa «Seleccionar
 * varios» y la lista se vuelve de casillas. Así el caso frecuente sigue
 * costando un clic y el caso raro es posible, en vez de cobrarle a todo el
 * mundo la complejidad de las casillas.
 *
 * El buscador aparece solo cuando hay muchas opciones: con quince aseguradoras
 * en pantalla estorba, con sesenta asesores es imprescindible.
 */
export function FiltroSeleccion({
  etiqueta,
  opciones,
  valores,
  onCambiar,
  plural,
}: {
  /** Nombre de la categoría, tal como se lee en el botón. */
  etiqueta: string;
  opciones: string[];
  valores: string[];
  onCambiar: (v: string[]) => void;
  /** «todas» en vez de «todos» cuando la categoría es femenina. */
  plural?: "todos" | "todas";
}) {
  const [abierto, setAbierto] = useState(false);
  const [multiple, setMultiple] = useState(false);
  const [q, setQ] = useState("");
  const caja = useRef<HTMLDivElement>(null);

  // Al cerrar se olvida la búsqueda: dejarla puesta hacía que el filtro
  // pareciera vacío la siguiente vez que se abría.
  useEffect(() => {
    if (!abierto) setQ("");
  }, [abierto]);

  // Cerrar al pulsar fuera o con Escape, que es lo que espera cualquiera.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto]);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? opciones.filter((o) => o.toLowerCase().includes(t)) : opciones;
  }, [opciones, q]);

  const ninguno = plural ?? "todos";
  const resumen =
    valores.length === 0
      ? `${etiqueta}: ${ninguno}`
      : valores.length === 1
        ? `${etiqueta}: ${valores[0]}`
        : `${etiqueta}: ${valores.length} seleccionados`;

  const alternar = (o: string) => {
    if (multiple) {
      onCambiar(valores.includes(o) ? valores.filter((v) => v !== o) : [...valores, o]);
      return;
    }
    // En modo sencillo, volver a pulsar lo ya elegido lo quita: es la forma
    // más corta de deshacer sin ir a «Limpiar».
    onCambiar(valores.length === 1 && valores[0] === o ? [] : [o]);
    setAbierto(false);
  };

  return (
    <div className="relative" ref={caja}>
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        className={clsx(
          "flex max-w-[15rem] items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition-colors",
          valores.length
            ? "border-brand bg-brand/5 font-medium text-brand"
            : "border-line-axis bg-surface text-ink hover:bg-surface-page"
        )}
      >
        <span className="truncate">{resumen}</span>
        <span aria-hidden className="text-[10px] opacity-60">
          ▾
        </span>
      </button>

      {abierto && (
        <div className="absolute left-0 z-30 mt-1 w-64 rounded-lg border border-line-axis bg-surface p-2 shadow-lg">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setMultiple((m) => !m)}
              className={clsx(
                "rounded px-1.5 py-1 text-[11px] font-medium transition-colors",
                multiple ? "bg-brand text-white" : "text-brand hover:bg-surface-page"
              )}
            >
              {multiple ? "✓ Varios" : "Seleccionar varios"}
            </button>
            {valores.length > 0 && (
              <button
                type="button"
                onClick={() => onCambiar([])}
                className="rounded px-1.5 py-1 text-[11px] text-ink-secondary hover:bg-surface-page"
              >
                Quitar ({valores.length})
              </button>
            )}
          </div>

          {opciones.length > 8 && (
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Buscar en ${etiqueta.toLowerCase()}…`}
              className="mb-1.5 w-full rounded border border-line-grid bg-surface-page px-2 py-1 text-sm focus:border-brand focus:outline-none"
            />
          )}

          <div className="max-h-56 overflow-y-auto scroll-fino">
            {!multiple && (
              <button
                type="button"
                onClick={() => {
                  onCambiar([]);
                  setAbierto(false);
                }}
                className="w-full rounded px-2 py-1.5 text-left text-sm text-ink-secondary hover:bg-surface-page"
              >
                {etiqueta}: {ninguno}
              </button>
            )}
            {visibles.map((o) => {
              const puesto = valores.includes(o);
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => alternar(o)}
                  className={clsx(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-page",
                    puesto && "font-medium text-brand"
                  )}
                >
                  {multiple && (
                    <span
                      aria-hidden
                      className={clsx(
                        "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border text-[9px] leading-none text-white",
                        puesto ? "border-brand bg-brand" : "border-line-axis"
                      )}
                    >
                      {puesto ? "✓" : ""}
                    </span>
                  )}
                  <span className="truncate">{o}</span>
                </button>
              );
            })}
            {visibles.length === 0 && (
              <p className="px-2 py-2 text-sm text-ink-muted">Sin coincidencias.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Lo que hay filtrado ahora mismo, en fichas que se quitan de una en una.
 *
 * El panel de filtros va cerrado, así que sin esto se podía estar mirando una
 * tabla recortada sin ninguna señal de por qué faltaban filas: la queja de
 * «no aparece una póliza que sí existe» casi siempre era un filtro olvidado.
 * Aquí se ven y se quitan sin abrir nada.
 */
export function FichasFiltros({
  grupos,
  onLimpiarTodo,
}: {
  grupos: { etiqueta: string; valores: string[]; onCambiar: (v: string[]) => void }[];
  onLimpiarTodo: () => void;
}) {
  const total = grupos.reduce((n, g) => n + g.valores.length, 0);
  if (!total) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {grupos.flatMap((g) =>
        g.valores.map((v) => (
          <button
            key={`${g.etiqueta}-${v}`}
            type="button"
            onClick={() => g.onCambiar(g.valores.filter((x) => x !== v))}
            title={`Quitar ${g.etiqueta}: ${v}`}
            className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border border-brand/30 bg-brand/5 py-1 pl-2.5 pr-2 text-[12px] text-brand hover:bg-brand/10"
          >
            <span className="opacity-60">{g.etiqueta}:</span>
            <span className="truncate font-medium">{v}</span>
            <span aria-hidden className="text-[13px] leading-none opacity-60">
              ×
            </span>
          </button>
        ))
      )}
      <button
        type="button"
        onClick={onLimpiarTodo}
        className="rounded-full px-2 py-1 text-[12px] font-medium text-ink-secondary underline underline-offset-2 hover:text-ink"
      >
        Limpiar {total === 1 ? "el filtro" : `los ${total} filtros`}
      </button>
    </div>
  );
}
