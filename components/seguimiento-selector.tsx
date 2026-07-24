"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { MESES } from "@/lib/constants";

const MES_TITULO: Record<string, string> = {
  ENERO: "Enero",
  FEBRERO: "Febrero",
  MARZO: "Marzo",
  ABRIL: "Abril",
  MAYO: "Mayo",
  JUNIO: "Junio",
  JULIO: "Julio",
  AGOSTO: "Agosto",
  SEPTIEMBRE: "Septiembre",
  OCTUBRE: "Octubre",
  NOVIEMBRE: "Noviembre",
  DICIEMBRE: "Diciembre",
};

export function SeguimientoSelector({
  anios,
  ramos,
  aseguradoras,
  anio,
  ramo,
  aseguradora,
  mes,
}: {
  anios: number[];
  ramos: string[];
  aseguradoras: string[];
  anio: number;
  ramo: string; // "CONSOLIDADO" o un ramo
  aseguradora: string; // "" = todas
  mes: string; // "" = todos
}) {
  const router = useRouter();
  const params = useSearchParams();

  const actualizar = (cambios: Record<string, string>) => {
    const p = new URLSearchParams(params.toString());
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor) p.set(clave, valor);
      else p.delete(clave);
    }
    router.push(`/seguimiento?${p.toString()}`);
  };

  const claseSelect =
    "rounded-md border border-line-axis bg-white px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none";
  const claseLabel = "flex items-center gap-1.5 text-sm text-ink-secondary";

  const hayFiltros = ramo !== "CONSOLIDADO" || !!aseguradora || !!mes;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className={claseLabel}>
        Año
        <select
          className={claseSelect}
          value={anio}
          onChange={(e) => actualizar({ anio: e.target.value })}
        >
          {anios.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>
      <label className={claseLabel}>
        Ramo
        <select
          className={claseSelect}
          value={ramo}
          onChange={(e) =>
            actualizar({ ramo: e.target.value === "CONSOLIDADO" ? "" : e.target.value })
          }
        >
          <option value="CONSOLIDADO">Todos (consolidado)</option>
          {ramos.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label className={claseLabel}>
        Aseguradora
        <select
          className={claseSelect}
          value={aseguradora}
          onChange={(e) => actualizar({ aseguradora: e.target.value })}
        >
          <option value="">Todas</option>
          {aseguradoras.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>
      <label className={claseLabel}>
        Mes
        <select
          className={claseSelect}
          value={mes}
          onChange={(e) => actualizar({ mes: e.target.value })}
        >
          <option value="">Todos</option>
          {MESES.map((m) => (
            <option key={m} value={m}>
              {MES_TITULO[m]}
            </option>
          ))}
        </select>
      </label>
      {hayFiltros && (
        <button
          onClick={() => actualizar({ ramo: "", aseguradora: "", mes: "" })}
          className="rounded-md border border-line-axis px-2.5 py-1.5 text-sm text-ink-secondary hover:bg-surface-page"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}
