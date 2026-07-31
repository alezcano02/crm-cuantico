import clsx from "clsx";
import Link from "next/link";
import type { EstadoCartera, NivelCumplimiento, Semaforo } from "@/lib/calculos";

export function Card({
  children,
  className,
  sinPadding,
}: {
  children: React.ReactNode;
  className?: string;
  sinPadding?: boolean;
}) {
  return (
    <div
      className={clsx(
        "rounded-xl border border-line-grid bg-surface shadow-card",
        !sinPadding && "p-5",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  accion,
}: {
  children: React.ReactNode;
  accion?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="etiqueta-marca text-[12px] text-ink-secondary">{children}</h2>
      {accion}
    </div>
  );
}

const ACENTO_TEXTO = {
  verde: "text-status-good",
  amarillo: "text-[#b07800]",
  rojo: "text-status-critical",
  marca: "text-brand",
} as const;

export function StatCard({
  etiqueta,
  valor,
  detalle,
  acento,
  href,
  Icono,
}: {
  etiqueta: string;
  valor: string;
  detalle?: React.ReactNode;
  acento?: keyof typeof ACENTO_TEXTO;
  /** Si se indica, la tarjeta completa se vuelve un enlace. */
  href?: string;
  Icono?: (p: { className?: string }) => JSX.Element;
}) {
  const contenido = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="etiqueta-marca text-[11px] text-ink-muted">{etiqueta}</div>
        {Icono && <Icono className="h-4 w-4 shrink-0 text-ink-muted/70" />}
      </div>
      <div
        className={clsx(
          "mt-2 text-[26px] font-bold leading-none tracking-tight tabla-num",
          acento ? ACENTO_TEXTO[acento] : "text-ink"
        )}
      >
        {valor}
      </div>
      {detalle && <div className="mt-1.5 text-xs text-ink-muted">{detalle}</div>}
    </>
  );

  const clases =
    "block rounded-xl border border-line-grid bg-surface p-4 shadow-card transition-shadow";

  if (href) {
    return (
      <Link href={href} className={clsx(clases, "hover:shadow-raised")}>
        {contenido}
      </Link>
    );
  }
  return <div className={clases}>{contenido}</div>;
}

/** Barra de progreso para el % de cumplimiento. */
export function Progreso({
  valor,
  nivel,
}: {
  /** 0–1 (puede superar 1; la barra se recorta al 100%). */
  valor: number | null;
  nivel?: NivelCumplimiento | null;
}) {
  const pct = valor == null ? 0 : Math.max(0, Math.min(valor, 1)) * 100;
  const color =
    nivel === "VERDE"
      ? "bg-status-good"
      : nivel === "AMARILLO"
        ? "bg-status-warning"
        : nivel === "ROJO"
          ? "bg-status-critical"
          : "bg-brand-400";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
      <div className={clsx("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Estado vacío con mensaje y acción opcional. */
export function EstadoVacio({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion?: React.ReactNode;
  accion?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <p className="text-sm font-semibold text-ink-secondary">{titulo}</p>
      {descripcion && (
        <p className="max-w-md text-sm text-ink-muted">{descripcion}</p>
      )}
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  );
}

/** Contenedor con scroll y encabezado fijo para tablas largas. */
export function TablaContenedor({
  children,
  className,
  alto = "max-h-[70vh]",
}: {
  children: React.ReactNode;
  className?: string;
  alto?: string;
}) {
  return (
    <div
      className={clsx(
        "overflow-auto scroll-fino rounded-xl border border-line-grid bg-surface",
        alto,
        className
      )}
    >
      {children}
    </div>
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
  const punto: Record<NivelCumplimiento, string> = {
    VERDE: "bg-status-good",
    AMARILLO: "bg-status-warning",
    ROJO: "bg-status-critical",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs font-bold tabla-num",
        clases[nivel]
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", punto[nivel])} aria-hidden />
      {texto}
    </span>
  );
}

export function PageHeader({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line-grid pb-4">
      <div className="min-w-0">
        <h1 className="titular text-[30px] leading-tight text-brand">{titulo}</h1>
        {descripcion && (
          <p className="mt-1 text-sm text-ink-muted">{descripcion}</p>
        )}
      </div>
      <div className="no-imprimir flex flex-wrap items-center gap-2">{children}</div>
    </header>
  );
}

const CARTERA_INFO: Record<
  EstadoCartera,
  { etiqueta: string; punto: string; texto: string; fondo: string }
> = {
  PAGADA: {
    etiqueta: "Pagada",
    punto: "bg-status-good",
    texto: "text-status-good",
    fondo: "bg-status-good/10",
  },
  EN_MORA: {
    etiqueta: "En mora",
    punto: "bg-status-critical",
    texto: "text-status-critical",
    fondo: "bg-status-critical/10",
  },
  POR_COBRAR: {
    etiqueta: "Por cobrar",
    punto: "bg-status-serious",
    texto: "text-[#c05a2e]",
    fondo: "bg-status-serious/10",
  },
  PENDIENTE: {
    etiqueta: "Pendiente",
    punto: "bg-status-warning",
    texto: "text-[#8a6100]",
    fondo: "bg-status-warning/15",
  },
  SIN_FECHA: {
    etiqueta: "Sin fecha",
    punto: "bg-ink-muted",
    texto: "text-ink-secondary",
    fondo: "bg-surface-page",
  },
  SIN_ESTADO: {
    etiqueta: "Sin estado",
    punto: "bg-ink-muted",
    texto: "text-ink-muted",
    fondo: "bg-surface-page",
  },
};

export function CarteraBadge({
  estado,
  dias,
}: {
  estado: EstadoCartera;
  dias: number | null;
}) {
  const c = CARTERA_INFO[estado];
  const sufijo =
    estado === "EN_MORA" && dias != null
      ? ` · ${dias} d`
      : (estado === "POR_COBRAR" || estado === "PENDIENTE") && dias != null
        ? ` · ${dias} d`
        : "";
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs font-semibold",
        c.fondo,
        c.texto
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", c.punto)} aria-hidden />
      {c.etiqueta}
      {sufijo}
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
  title,
}: {
  children?: React.ReactNode;
  className?: string;
  derecha?: boolean;
  colSpan?: number;
  /** Tooltip nativo, para explicar una cifra sin ocupar espacio en la tabla. */
  title?: string;
}) {
  return (
    <td
      colSpan={colSpan}
      title={title}
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
