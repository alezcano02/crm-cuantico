"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function SeguimientoSelector({
  anios,
  ramos,
  anio,
  ramo,
}: {
  anios: number[];
  ramos: string[];
  anio: number;
  ramo: string; // "CONSOLIDADO" o un ramo
}) {
  const router = useRouter();
  const params = useSearchParams();

  const actualizar = (clave: string, valor: string) => {
    const p = new URLSearchParams(params.toString());
    p.set(clave, valor);
    router.push(`/seguimiento?${p.toString()}`);
  };

  const claseSelect =
    "rounded-md border border-line-axis bg-white px-3 py-1.5 text-sm focus:border-brand focus:outline-none";

  return (
    <div className="flex items-center gap-3">
      <label className="text-sm text-ink-secondary">
        Año{" "}
        <select
          className={claseSelect}
          value={anio}
          onChange={(e) => actualizar("anio", e.target.value)}
        >
          {anios.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm text-ink-secondary">
        Vista{" "}
        <select
          className={claseSelect}
          value={ramo}
          onChange={(e) => actualizar("ramo", e.target.value)}
        >
          <option value="CONSOLIDADO">Consolidado (todos los ramos)</option>
          {ramos.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
