import { FilaSeguimiento, nivelCumplimiento } from "@/lib/calculos";
import { fmtCOP, fmtPct } from "@/lib/format";
import { CumplimientoBadge, Td, Th } from "@/components/ui";
import clsx from "clsx";

export const MES_TITULO: Record<string, string> = {
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
  TOTAL: "TOTAL",
};

export function TablaSeguimiento({
  filas,
  anioBase,
  anio,
  mostrarBase = true,
  columna = "Mes",
  etiquetas,
}: {
  filas: FilaSeguimiento[];
  anioBase: number;
  anio: number;
  /** false cuando la base del año anterior no puede desglosarse con el filtro
   *  activo (p. ej. aseguradora en 2026: la BASE 2025 no la registra). */
  mostrarBase?: boolean;
  /** Encabezado de la primera columna. */
  columna?: string;
  /** Nombre de cada fila, en el mismo orden que `filas`. Sin esto se usa el
   *  mes; se pasa cuando las filas son ramos y no meses. */
  etiquetas?: string[];
}) {
  const nombreDe = (f: FilaSeguimiento, i: number) =>
    etiquetas?.[i] ?? MES_TITULO[f.mes] ?? f.mes;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse whitespace-nowrap">
        <thead>
          <tr>
            <Th>{columna}</Th>
            <Th derecha>Base a renovar {anioBase}</Th>
            <Th derecha>Meta {anio} (+15%)</Th>
            <Th derecha>Real {anio}</Th>
            <Th derecha>Nuevos</Th>
            <Th derecha>Renovaciones</Th>
            <Th derecha>Prod. cancelada</Th>
            <Th derecha>Cancelaciones</Th>
            <Th derecha>Producción neta</Th>
            <Th derecha>% Cumpl.</Th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => {
            const nombre = nombreDe(f, i);
            const esTotal = nombre === "TOTAL";
            return (
              <tr
                key={nombre}
                className={clsx(
                  "hover:bg-surface-page",
                  esTotal && "bg-surface-page font-bold"
                )}
              >
                <Td className={clsx(esTotal && "font-bold")}>{nombre}</Td>
                <Td derecha>{mostrarBase ? fmtCOP(f.base) : "—"}</Td>
                <Td derecha>{mostrarBase ? fmtCOP(f.meta) : "—"}</Td>
                <Td derecha>{fmtCOP(f.real)}</Td>
                <Td derecha>{fmtCOP(f.nuevos)}</Td>
                <Td derecha>{fmtCOP(f.renovaciones)}</Td>
                <Td derecha>{fmtCOP(f.produccionCancelada)}</Td>
                <Td derecha className={f.cancelaciones > 0 ? "text-status-critical" : undefined}>
                  {f.cancelaciones > 0 ? `−${fmtCOP(f.cancelaciones)}` : fmtCOP(0)}
                </Td>
                <Td derecha className="font-semibold">
                  {fmtCOP(f.neta)}
                </Td>
                <Td derecha>
                  {mostrarBase ? (
                    <CumplimientoBadge
                      nivel={nivelCumplimiento(f.cumplimiento)}
                      texto={f.cumplimiento == null ? "—" : fmtPct(f.cumplimiento)}
                    />
                  ) : (
                    "—"
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
