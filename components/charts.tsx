"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtCOP, fmtCOPCompact, fmtPct } from "@/lib/format";

// Paleta (slots categóricos fijos + tinta de ejes)
const AZUL = "#2a78d6";
const AGUA = "#1baf7a";
const GRIS = "#898781";
const GRID = "#e1e0d9";
const INK = "#52514e";

const ejes = { fontSize: 11, fill: GRIS } as const;

function TooltipCaja({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-line-grid bg-white px-3 py-2 text-xs shadow-md">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prima neta por ramo (barras horizontales) con % del total
// ---------------------------------------------------------------------------

export function RamoBarChart({
  data,
}: {
  data: { ramo: string; prima: number; pct: number }[];
}) {
  const alto = Math.max(220, data.length * 30 + 40);
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 70, top: 4 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis
          type="number"
          tick={ejes}
          tickFormatter={(v) => fmtCOPCompact(v)}
          axisLine={{ stroke: "#c3c2b7" }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="ramo"
          width={110}
          tick={{ ...ejes, fill: INK }}
          axisLine={{ stroke: "#c3c2b7" }}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(11,11,11,0.04)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as { ramo: string; prima: number; pct: number };
            return (
              <TooltipCaja>
                <div className="font-semibold">{d.ramo}</div>
                <div className="tabla-num">{fmtCOP(d.prima)}</div>
                <div className="text-ink-muted">{fmtPct(d.pct)} del total</div>
              </TooltipCaja>
            );
          }}
        />
        <Bar
          dataKey="prima"
          fill={AZUL}
          radius={[0, 4, 4, 0]}
          barSize={16}
          label={{
            position: "right",
            fontSize: 10,
            fill: GRIS,
            formatter: (v: number) => {
              const total = data.reduce((a, b) => a + b.prima, 0);
              return total > 0 ? fmtPct(v / total, 0) : "";
            },
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Meta vs Real vs Producción Neta por mes (líneas)
// ---------------------------------------------------------------------------

export function MetaRealChart({
  data,
}: {
  data: { mes: string; meta: number; real: number; neta: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ left: 12, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="mes" tick={ejes} axisLine={{ stroke: "#c3c2b7" }} tickLine={false} />
        <YAxis
          tick={ejes}
          tickFormatter={(v) => fmtCOPCompact(v)}
          axisLine={false}
          tickLine={false}
          width={70}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <TooltipCaja>
                <div className="mb-1 font-semibold">{label}</div>
                {payload.map((p) => (
                  <div key={p.dataKey as string} className="flex items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: p.color }}
                      aria-hidden
                    />
                    <span>{p.name}:</span>
                    <span className="tabla-num font-medium">{fmtCOP(p.value as number)}</span>
                  </div>
                ))}
              </TooltipCaja>
            );
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
        <Line
          name="Meta (+15%)"
          dataKey="meta"
          stroke={GRIS}
          strokeWidth={2}
          strokeDasharray="6 4"
          dot={false}
        />
        <Line
          name="Real"
          dataKey="real"
          stroke={AZUL}
          strokeWidth={2}
          dot={{ r: 3, fill: AZUL, strokeWidth: 0 }}
        />
        <Line
          name="Producción neta"
          dataKey="neta"
          stroke={AGUA}
          strokeWidth={2}
          dot={{ r: 3, fill: AGUA, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// % de cumplimiento mensual (barras) con línea de referencia en 100%
// ---------------------------------------------------------------------------

export function CumplimientoChart({
  data,
}: {
  data: { mes: string; cumplimiento: number | null }[];
}) {
  const filas = data.map((d) => ({ ...d, valor: d.cumplimiento ?? 0 }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={filas} margin={{ left: 4, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="mes" tick={ejes} axisLine={{ stroke: "#c3c2b7" }} tickLine={false} />
        <YAxis
          tick={ejes}
          tickFormatter={(v) => fmtPct(v, 0)}
          axisLine={false}
          tickLine={false}
          width={50}
        />
        <Tooltip
          cursor={{ fill: "rgba(11,11,11,0.04)" }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as { cumplimiento: number | null };
            return (
              <TooltipCaja>
                <div className="font-semibold">{label}</div>
                <div className="tabla-num">
                  {d.cumplimiento == null ? "Sin meta" : fmtPct(d.cumplimiento)}
                </div>
              </TooltipCaja>
            );
          }}
        />
        <ReferenceLine
          y={1}
          stroke={GRIS}
          strokeDasharray="6 4"
          label={{ value: "Meta 100%", position: "insideTopRight", fontSize: 10, fill: GRIS }}
        />
        <Bar dataKey="valor" radius={[4, 4, 0, 0]} barSize={26}>
          {filas.map((f, i) => (
            <Cell key={i} fill={AZUL} fillOpacity={f.cumplimiento == null ? 0.25 : 1} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
