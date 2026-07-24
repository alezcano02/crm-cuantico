import clsx from "clsx";
import type { NivelCumplimiento, Semaforo } from "@/lib/calculos";

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "rounded-lg border border-line-grid bg-surface p-5 shadow-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
      {children}
    </h2>
  );
}

export function StatCard({
  etiqueta,
  valor,
  detalle,
  acento,
}: {
  etiqueta: string;
  valor: string;
  detalle?: string;
  acento?: "verde" | "amarillo" | "rojo";
}) {
  return (
    <Card>
      <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">
        {etiqueta}
      </div>
      <div
        className={clsx(
          "mt-1.5 text-2xl font-bold",
          acento === "verde" && "text-status-good",
          acento === "amarillo" && "text-[#b07800]",
          acento === "rojo" && "text-status-critical"
        )}
      >
        {valor}
      </div>
      {detalle && <div className="mt-1 text-xs text-ink-muted">{detalle}</div>}
    </Card>
  );
}

const COLORES_SEMAFORO: Record<Semaforo, { bg: string; texto: string; etiqueta: string }> = {
  ROJO: { bg: "bg-status-critical", texto: "text-status-critical", etiqueta: "Vencida" },
  NARANJA: { bg: "bg-status-serious", texto: "text-[#c05a2e]", etiqueta: "0–15 días" },
  AMARILLO: { bg: "bg-status-warning", texto: "text-[#b07800]", etiqueta: "15–30 días" },
  VERDE: { bg: "bg-status-good", texto: "text-status-good", etiqueta: "> 30 días" },
};

export function SemaforoBadge({ nivel, dias }: { nivel: Semaforo | null; dias: number | null }) {
  if (!nivel)
    return <span className="text-xs text-ink-muted">Sin fecha</span>;
  const c = COLORES_SEMAFORO[nivel];
  return (
    <span className={clsx("inline-flex items-center gap-1.5 text-xs font-semibold", c.texto)}>
      <span className={clsx("h-2 w-2 rounded-full", c.bg)} aria-hidden />
      {dias != null && dias < 0 ? `${-dias} d vencida` : `${dias} d`}
    </span>
  );
}

export function CumplimientoBadge({
  nivel,
  texto,
}: {
  nivel: NivelCumplimiento | null;
  texto: string;
}) {
  if (!nivel) return <span className="text-ink-muted">{texto}</span>;
  const clases: Record<NivelCumplimiento, string> = {
    VERDE: "bg-status-good/10 text-status-good",
    AMARILLO: "bg-status-warning/15 text-[#8a6100]",
    ROJO: "bg-status-critical/10 text-status-critical",
  };
  const icono: Record<NivelCumplimiento, string> = {
    VERDE: "●",
    AMARILLO: "◐",
    ROJO: "○",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-bold tabla-num",
        clases[nivel]
      )}
    >
      <span aria-hidden>{icono[nivel]}</span>
      {texto}
    </span>
  );
}

export function EstadoPagoBadge({ estado }: { estado: string | null }) {
  if (!estado) return <span className="text-xs text-ink-muted">—</span>;
  const ok = estado.toUpperCase() === "OK PAGO";
  return (
    <span
      className={clsx(
        "inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold",
        ok ? "bg-status-good/10 text-status-good" : "bg-status-warning/15 text-[#8a6100]"
      )}
    >
      {ok ? "OK PAGO" : "PENDIENTE"}
    </span>
  );
}

export function Th({
  children,
  className,
  derecha,
}: {
  children?: React.ReactNode;
  className?: string;
  derecha?: boolean;
}) {
  return (
    <th
      className={clsx(
        "border-b border-line-axis px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted",
        derecha ? "text-right" : "text-left",
        className
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  derecha,
  colSpan,
}: {
  children?: React.ReactNode;
  className?: string;
  derecha?: boolean;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={clsx(
        "border-b border-line-grid px-2.5 py-1.5 text-sm",
        derecha && "text-right tabla-num",
        className
      )}
    >
      {children}
    </td>
  );
}
