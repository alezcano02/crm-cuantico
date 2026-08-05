"use client";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** «2026-03» -> «marzo 2026». */
export function nombreMes(clave: string): string {
  const [anio, mes] = clave.split("-");
  const i = Number(mes) - 1;
  if (!anio || Number.isNaN(i) || i < 0 || i > 11) return clave;
  return `${MESES[i]} ${anio}`;
}

/**
 * Filtro por mes, para acotar una tabla a un período concreto.
 *
 * Los meses se pasan ya calculados desde los datos en vez de generar un rango
 * fijo: así solo aparecen los que existen, y no se ofrecen meses vacíos.
 */
export function FiltroMes({
  valor,
  onCambiar,
  meses,
  etiqueta = "Mes: todos",
}: {
  valor: string;
  onCambiar: (v: string) => void;
  meses: string[];
  etiqueta?: string;
}) {
  return (
    <select
      value={valor}
      onChange={(e) => onCambiar(e.target.value)}
      aria-label="Filtrar por mes"
      className="rounded-lg border border-line-axis bg-surface px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
    >
      <option value="">{etiqueta}</option>
      {meses.map((m) => (
        <option key={m} value={m}>
          {nombreMes(m)}
        </option>
      ))}
    </select>
  );
}
