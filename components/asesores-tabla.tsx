"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { fmtCOP, fmtCOPCompact, fmtNum } from "@/lib/format";
import { Td, Th } from "@/components/ui";
import { BotonExportar } from "@/components/boton-exportar";
import { IconArriba, IconAbajo } from "@/components/icons";

export interface FilaAsesor {
  asesor: string;
  polizas: number;
  produccion: number;
  cartera: number;
  vencidas: number;
  mora: number;
  canceladas: number;
  primaCancelada: number;
}

type Columna = keyof Omit<FilaAsesor, "asesor"> | "asesor";

const COLUMNAS: { clave: Columna; etiqueta: string; derecha?: boolean }[] = [
  { clave: "asesor", etiqueta: "Asesor" },
  { clave: "polizas", etiqueta: "Pólizas", derecha: true },
  { clave: "produccion", etiqueta: "Producción del ciclo", derecha: true },
  { clave: "cartera", etiqueta: "Cartera administrada", derecha: true },
  { clave: "vencidas", etiqueta: "Vencidas", derecha: true },
  { clave: "mora", etiqueta: "En mora", derecha: true },
  { clave: "canceladas", etiqueta: "Canceladas", derecha: true },
  { clave: "primaCancelada", etiqueta: "Prima cancelada", derecha: true },
];

export function AsesoresTabla({
  filas,
  anio,
  campo,
}: {
  filas: FilaAsesor[];
  anio: number;
  campo: string;
}) {
  const [orden, setOrden] = useState<Columna>("produccion");
  const [desc, setDesc] = useState(true);
  const [q, setQ] = useState("");

  const ordenadas = useMemo(() => {
    const t = q.trim().toLowerCase();
    const base = t ? filas.filter((f) => f.asesor.toLowerCase().includes(t)) : filas;
    return [...base].sort((a, b) => {
      const va = a[orden];
      const vb = b[orden];
      const cmp =
        typeof va === "string" && typeof vb === "string"
          ? va.localeCompare(vb, "es")
          : Number(vb) - Number(va);
      return desc ? cmp : -cmp;
    });
  }, [filas, orden, desc, q]);

  const totales = useMemo(
    () =>
      ordenadas.reduce(
        (acc, f) => ({
          polizas: acc.polizas + f.polizas,
          produccion: acc.produccion + f.produccion,
          cartera: acc.cartera + f.cartera,
          vencidas: acc.vencidas + f.vencidas,
          mora: acc.mora + f.mora,
          canceladas: acc.canceladas + f.canceladas,
          primaCancelada: acc.primaCancelada + f.primaCancelada,
        }),
        {
          polizas: 0,
          produccion: 0,
          cartera: 0,
          vencidas: 0,
          mora: 0,
          canceladas: 0,
          primaCancelada: 0,
        }
      ),
    [ordenadas]
  );

  const maxProduccion = Math.max(1, ...ordenadas.map((f) => f.produccion));

  const alOrdenar = (c: Columna) => {
    if (c === orden) setDesc((d) => !d);
    else {
      setOrden(c);
      setDesc(c !== "asesor");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar asesor…"
          className="min-w-[200px] rounded-lg border border-line-axis bg-surface px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
        />
        <span className="text-sm text-ink-muted">{ordenadas.length} asesores</span>
        <div className="ml-auto">
          <BotonExportar
            nombre={`asesores-${campo}-${anio}`}
            filas={ordenadas}
            columnas={[
              { encabezado: "Asesor", valor: (f) => f.asesor },
              { encabezado: "Pólizas", valor: (f) => f.polizas },
              { encabezado: `Producción ${anio}`, valor: (f) => f.produccion },
              { encabezado: "Cartera administrada", valor: (f) => f.cartera },
              { encabezado: "Vencidas", valor: (f) => f.vencidas },
              { encabezado: "En mora", valor: (f) => f.mora },
              { encabezado: "Canceladas", valor: (f) => f.canceladas },
              { encabezado: "Prima cancelada", valor: (f) => f.primaCancelada },
            ]}
          />
        </div>
      </div>

      <div className="overflow-x-auto scroll-fino rounded-xl border border-line-grid bg-surface">
        <table className="w-full border-collapse whitespace-nowrap">
          <thead>
            <tr>
              {COLUMNAS.map((c) => (
                <Th key={c.clave} derecha={c.derecha}>
                  <button
                    onClick={() => alOrdenar(c.clave)}
                    className={clsx(
                      "inline-flex items-center gap-1 uppercase tracking-wide hover:text-brand",
                      orden === c.clave && "text-brand"
                    )}
                  >
                    {c.etiqueta}
                    {orden === c.clave &&
                      (desc ? (
                        <IconAbajo className="h-3 w-3" />
                      ) : (
                        <IconArriba className="h-3 w-3" />
                      ))}
                  </button>
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((f) => (
              <tr key={f.asesor} className="hover:bg-surface-page">
                <Td className="font-medium">
                  <div>{f.asesor}</div>
                  {/* Barra proporcional: comparar producción de un vistazo */}
                  <div className="mt-1 h-1 w-32 overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className="h-full rounded-full bg-brand-400"
                      style={{ width: `${(f.produccion / maxProduccion) * 100}%` }}
                    />
                  </div>
                </Td>
                <Td derecha>{fmtNum(f.polizas)}</Td>
                <Td derecha className="font-semibold">
                  {fmtCOP(f.produccion)}
                </Td>
                <Td derecha>{fmtCOP(f.cartera)}</Td>
                <Td derecha className={f.vencidas > 0 ? "text-status-critical" : undefined}>
                  {fmtNum(f.vencidas)}
                </Td>
                <Td derecha className={f.mora > 0 ? "text-status-critical" : undefined}>
                  {fmtNum(f.mora)}
                </Td>
                <Td derecha>{fmtNum(f.canceladas)}</Td>
                <Td derecha>{fmtCOP(f.primaCancelada)}</Td>
              </tr>
            ))}
            {ordenadas.length === 0 && (
              <tr>
                <Td className="py-6 text-center text-ink-muted" colSpan={8}>
                  No hay asesores que coincidan.
                </Td>
              </tr>
            )}
          </tbody>
          {ordenadas.length > 0 && (
            <tfoot>
              <tr className="bg-surface-page font-bold">
                <Td className="font-bold">TOTAL</Td>
                <Td derecha>{fmtNum(totales.polizas)}</Td>
                <Td derecha>{fmtCOPCompact(totales.produccion)}</Td>
                <Td derecha>{fmtCOPCompact(totales.cartera)}</Td>
                <Td derecha>{fmtNum(totales.vencidas)}</Td>
                <Td derecha>{fmtNum(totales.mora)}</Td>
                <Td derecha>{fmtNum(totales.canceladas)}</Td>
                <Td derecha>{fmtCOPCompact(totales.primaCancelada)}</Td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
