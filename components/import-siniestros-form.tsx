"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ResumenSiniestros } from "@/lib/siniestros";
import { IconAlerta } from "@/components/icons";
import { exigirOk } from "@/lib/respuesta";
import { api } from "@/lib/rutas";

export function ImportSiniestrosForm() {
  const router = useRouter();
  const [seguimiento, setSeguimiento] = useState<File | null>(null);
  const [resumen, setResumen] = useState<File | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [salida, setSalida] = useState<{ total: number; resumen: ResumenSiniestros[] } | null>(
    null
  );

  const importar = async () => {
    if (!seguimiento && !resumen) return;
    setCargando(true);
    setError(null);
    setSalida(null);
    try {
      const fd = new FormData();
      if (seguimiento) fd.append("seguimiento", seguimiento);
      if (resumen) fd.append("resumen", resumen);
      const res = await fetch(api("/api/import-siniestros"), { method: "POST", body: fd });
      const json = await exigirOk<{ total: number; resumen: ResumenSiniestros[] }>(res, "Error desconocido");
      setSalida(json);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  };

  const claseArchivo =
    "text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-light/60 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-dark hover:file:bg-brand-light";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Seguimiento de siniestros
          </label>
          <p className="mb-1.5 mt-0.5 text-xs text-ink-muted">
            El archivo con una hoja por cliente (trae el detalle de cada caso).
          </p>
          <input
            type="file"
            accept=".xlsx,.xlsm"
            onChange={(e) => setSeguimiento(e.target.files?.[0] ?? null)}
            className={claseArchivo}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Resumen (SINIESTROS.xlsx)
          </label>
          <p className="mb-1.5 mt-0.5 text-xs text-ink-muted">
            Opcional: aporta el responsable, el deducible y las cifras.
          </p>
          <input
            type="file"
            accept=".xlsx,.xlsm"
            onChange={(e) => setResumen(e.target.files?.[0] ?? null)}
            className={claseArchivo}
          />
        </div>
      </div>

      <button
        onClick={importar}
        disabled={(!seguimiento && !resumen) || cargando}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
      >
        {cargando ? "Importando…" : "Importar siniestros"}
      </button>

      {error && (
        <div className="rounded-lg border border-status-critical/30 bg-status-critical/5 p-3 text-sm text-status-critical">
          {error}
        </div>
      )}

      {salida && (
        <div className="space-y-3">
          <div className="rounded-lg border border-status-good/30 bg-status-good/5 p-3 text-sm">
            <b>Importación completada.</b> Quedaron {salida.total} siniestros en una sola
            lista.
          </div>
          {salida.resumen.map((r) => (
            <div key={r.archivo} className="rounded-lg border border-line-grid p-3 text-sm">
              <div className="font-semibold">{r.archivo}</div>
              <div className="mt-1 text-xs text-ink-secondary">
                {r.hojas > 0 && <>Hojas leídas: {r.hojas} · </>}
                Filas: {r.leidos} · Importados: {r.importables}
                {r.fusionados > 0 && <> · Fusionados con el detalle: {r.fusionados}</>}
                {r.omitidos > 0 && <> · Omitidos: {r.omitidos}</>}
              </div>
              {r.avisos.length > 0 && (
                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto scroll-fino text-[11px] text-[#8a6100]">
                  {r.avisos.slice(0, 20).map((a, i) => (
                    <p key={i} className="flex items-start gap-1.5">
                      <IconAlerta className="mt-0.5 h-3 w-3 shrink-0" />
                      {a}
                    </p>
                  ))}
                  {r.avisos.length > 20 && (
                    <p className="text-ink-muted">… y {r.avisos.length - 20} avisos más</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
