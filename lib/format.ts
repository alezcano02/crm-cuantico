const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const copCompact = new Intl.NumberFormat("es-CO", {
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 1,
});

const num = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

export function fmtCOP(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "—";
  return cop.format(v);
}

export function fmtCOPCompact(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "—";
  return "$ " + copCompact.format(v);
}

export function fmtNum(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "—";
  return num.format(v);
}

export function fmtPct(v: number | null | undefined, decimals = 1): string {
  if (v == null || isNaN(v)) return "—";
  return (v * 100).toFixed(decimals).replace(".", ",") + "%";
}

export function fmtFecha(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}
