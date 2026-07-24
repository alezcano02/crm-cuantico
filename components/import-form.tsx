"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ResumenHoja } from "@/lib/excel";
import { Td, Th } from "@/components/ui";
import { IconAlerta, IconError } from "@/components/icons";

export function ImportForm() {
  const router = useRouter();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumen, setResumen] = useState<ResumenHoja[] | null>(null);

  const importar = async () => {
    if (!archivo) return;
    setCargando(true);
    setError(null);
    setResumen(null);
    try {
      const fd = new FormData();
      fd.append("archivo", archivo);
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error desconocido");
      setResumen(json.resumen);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  };

  const totalErrores = resumen?.reduce((a, r) => a + r.errores.length, 0) ?? 0;
  const totalAdvertencias = resumen?.reduce((a, r) => a + r.advertencias.length, 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".xlsx,.xlsm"
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-light/60 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-dark hover:file:bg-brand-light"
        />
        <button
          onClick={importar}
          disabled={!archivo || cargando}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {cargando ? "Importando…" : "Importar archivo"}
        </button>
      </div>

      {cargando && (
        <p className="text-sm text-ink-muted">
          Leyendo hojas, validando contra LISTAS y recalculando campos derivados…
        </p>
      )}

      {error && (
        <div className="rounded-md border border-status-critical/30 bg-status-critical/5 p-3 text-sm text-status-critical">
          {error}
        </div>
      )}

      {resumen && (
        <div className="space-y-4">
          <div className="rounded-md border border-status-good/30 bg-status-good/5 p-3 text-sm">
            <b>Importación completada.</b>{" "}
            {totalErrores > 0 && `${totalErrores} filas con errores fueron omitidas. `}
            {totalAdvertencias > 0 &&
              `${totalAdvertencias} advertencias de validación contra LISTAS.`}
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Hoja</Th>
                <Th derecha>Leídos</Th>
                <Th derecha>Importados</Th>
                <Th derecha>Duplicados</Th>
                <Th derecha>Errores</Th>
                <Th derecha>Advertencias</Th>
              </tr>
            </thead>
            <tbody>
              {resumen.map((r) => (
                <tr key={r.hoja}>
                  <Td className="font-medium">{r.hoja}</Td>
                  <Td derecha>{r.leidos}</Td>
                  <Td derecha className="font-semibold text-status-good">
                    {r.importables}
                  </Td>
                  <Td derecha>{r.duplicados}</Td>
                  <Td derecha className={r.errores.length ? "text-status-critical" : ""}>
                    {r.errores.length}
                  </Td>
                  <Td derecha className={r.advertencias.length ? "text-[#8a6100]" : ""}>
                    {r.advertencias.length}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>

          {resumen.some((r) => r.errores.length > 0 || r.advertencias.length > 0) && (
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border border-line-grid bg-surface-page p-3 text-xs">
              {resumen.flatMap((r) =>
                r.errores.map((e, i) => (
                  <p
                    key={`${r.hoja}-e-${i}`}
                    className="flex items-start gap-1.5 text-status-critical"
                  >
                    <IconError className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {e}
                  </p>
                ))
              )}
              {resumen.flatMap((r) =>
                r.advertencias.map((a, i) => (
                  <p
                    key={`${r.hoja}-a-${i}`}
                    className="flex items-start gap-1.5 text-[#8a6100]"
                  >
                    <IconAlerta className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {a}
                  </p>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
