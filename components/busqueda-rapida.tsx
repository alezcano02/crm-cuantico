"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { fmtCOP, fmtFecha } from "@/lib/format";
import { IconBuscar } from "@/components/icons";

interface Resultado {
  tipo: "poliza" | "cancelacion";
  id: number;
  numero: string;
  ramo: string;
  asegurado: string | null;
  ccNit: string | null;
  aseguradora: string | null;
  primaNeta: number;
  vencimiento: string | null;
  dias: number | null;
  estadoPago: string | null;
}

const ATAJOS: { etiqueta: string; href: string }[] = [
  { etiqueta: "Ir al dashboard", href: "/" },
  { etiqueta: "Ir a seguimiento de producción", href: "/seguimiento" },
  { etiqueta: "Ir a vencimientos", href: "/vencimientos" },
  { etiqueta: "Ir a cartera", href: "/cartera" },
  { etiqueta: "Ir a cancelaciones", href: "/cancelaciones" },
  { etiqueta: "Ir a asesores", href: "/asesores" },
  { etiqueta: "Ir a siniestros", href: "/siniestros" },
  { etiqueta: "Ir a cumpleaños de clientes", href: "/cumpleanos" },
  { etiqueta: "Importar el Excel de producción", href: "/importar" },
];

/** Botón que abre la búsqueda rápida; se muestra en la barra lateral. */
export function BotonBusquedaRapida({ onAbrir }: { onAbrir: () => void }) {
  return (
    <button
      onClick={onAbrir}
      className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-white/50 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white/70"
    >
      <IconBuscar className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">Buscar…</span>
      <kbd className="rounded border border-white/15 px-1.5 py-0.5 font-sans text-[10px] text-white/40">
        Ctrl K
      </kbd>
    </button>
  );
}

export function BusquedaRapida({
  abierta,
  onCerrar,
}: {
  abierta: boolean;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [cargando, setCargando] = useState(false);
  const [seleccion, setSeleccion] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Atajos filtrados por el texto escrito
  const atajos = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return ATAJOS;
    return ATAJOS.filter((a) => a.etiqueta.toLowerCase().includes(t));
  }, [q]);

  const items = useMemo(
    () => [
      ...resultados.map((r) => ({
        clave: `${r.tipo}-${r.id}`,
        href: `/buscar?q=${encodeURIComponent(r.numero)}`,
        resultado: r,
        etiqueta: null as string | null,
      })),
      ...atajos.map((a) => ({
        clave: a.href,
        href: a.href,
        resultado: null,
        etiqueta: a.etiqueta,
      })),
    ],
    [resultados, atajos]
  );

  useEffect(() => {
    if (abierta) {
      setSeleccion(0);
      // Enfocar tras el montaje del diálogo
      const t = setTimeout(() => inputRef.current?.focus(), 20);
      return () => clearTimeout(t);
    }
    setQ("");
    setResultados([]);
  }, [abierta]);

  // Consulta con retardo para no disparar una petición por tecla
  useEffect(() => {
    if (!abierta) return;
    const termino = q.trim();
    if (termino.length < 2) {
      setResultados([]);
      setCargando(false);
      return;
    }
    setCargando(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(termino)}`, {
          signal: ctrl.signal,
        });
        const json = await res.json();
        setResultados(json.resultados ?? []);
      } catch {
        /* petición cancelada o fallida: se ignora */
      } finally {
        setCargando(false);
      }
    }, 220);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, abierta]);

  const navegar = useCallback(
    (href: string) => {
      onCerrar();
      router.push(href);
    },
    [onCerrar, router]
  );

  const alTeclado = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSeleccion((s) => Math.min(s + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSeleccion((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[seleccion];
      if (item) navegar(item.href);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCerrar();
    }
  };

  if (!abierta) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-ink/40 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={onCerrar}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl bg-surface shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-line-grid px-4">
          <IconBuscar className="h-4 w-4 shrink-0 text-ink-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSeleccion(0);
            }}
            onKeyDown={alTeclado}
            placeholder="Buscar póliza, asegurado o NIT…"
            className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-ink-muted"
          />
          {cargando && <span className="text-xs text-ink-muted">Buscando…</span>}
        </div>

        <div className="max-h-[55vh] overflow-y-auto scroll-fino py-1.5">
          {resultados.length > 0 && (
            <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
              Pólizas
            </div>
          )}
          {items.map((item, i) => {
            const activo = i === seleccion;
            if (item.resultado) {
              const r = item.resultado;
              return (
                <button
                  key={item.clave}
                  onMouseEnter={() => setSeleccion(i)}
                  onClick={() => navegar(item.href)}
                  className={clsx(
                    "flex w-full items-center gap-3 px-3 py-2 text-left",
                    activo ? "bg-brand-light/60" : "hover:bg-surface-page"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {r.asegurado ?? "—"}
                      {r.tipo === "cancelacion" && (
                        <span className="ml-2 rounded bg-status-critical/10 px-1.5 py-0.5 text-[10px] font-semibold text-status-critical">
                          Cancelada
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-ink-muted">
                      {r.numero} · {r.ramo}
                      {r.aseguradora ? ` · ${r.aseguradora}` : ""}
                      {r.vencimiento ? ` · ${fmtFecha(r.vencimiento)}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 tabla-num text-xs font-semibold text-ink-secondary">
                    {fmtCOP(r.primaNeta)}
                  </div>
                </button>
              );
            }
            return (
              <div key={item.clave}>
                {i === resultados.length && (
                  <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                    Ir a
                  </div>
                )}
                <button
                  onMouseEnter={() => setSeleccion(i)}
                  onClick={() => navegar(item.href)}
                  className={clsx(
                    "flex w-full items-center px-3 py-2 text-left text-sm",
                    activo ? "bg-brand-light/60" : "hover:bg-surface-page"
                  )}
                >
                  {item.etiqueta}
                </button>
              </div>
            );
          })}

          {items.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-ink-muted">
              Sin coincidencias para “{q}”.
            </p>
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-line-grid bg-surface-page px-4 py-2 text-[11px] text-ink-muted">
          <span>↑↓ moverse</span>
          <span>Enter abrir</span>
          <span>Esc cerrar</span>
        </div>
      </div>
    </div>
  );
}
