"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { api } from "@/lib/rutas";
import { exigirOk } from "@/lib/respuesta";
import { fmtCOP } from "@/lib/format";
import type { PolizaEditable } from "@/components/poliza-form";

type Certeza = "alta" | "media" | "baja";
interface Campo<T = string> {
  valor: T | null;
  certeza: Certeza;
  evidencia: string | null;
}
interface Extraido {
  tipo: "poliza" | "recibo" | "cotizacion" | "escaneado" | "desconocido";
  aviso: string | null;
  numero: Campo;
  aseguradora: Campo;
  asegurado: Campo;
  ccNit: Campo;
  placa: Campo;
  ramo: Campo;
  vigenciaDesde: Campo;
  vigenciaHasta: Campo;
  primaNeta: Campo<number>;
  primaTotal: Campo<number>;
  formaPago: Campo;
  camposEncontrados: number;
}

const ETIQUETAS: [keyof Extraido, string][] = [
  ["numero", "Número de póliza"],
  ["aseguradora", "Aseguradora"],
  ["ramo", "Ramo"],
  ["asegurado", "Asegurado"],
  ["ccNit", "CC / NIT"],
  ["placa", "Placa"],
  ["vigenciaHasta", "Vencimiento"],
  ["primaNeta", "Prima neta"],
  ["primaTotal", "Prima total"],
  ["formaPago", "Forma de pago"],
];

const COLOR: Record<Certeza, string> = {
  alta: "bg-status-good/12 text-status-good",
  media: "bg-status-warning/20 text-[#8a6100]",
  baja: "bg-status-critical/12 text-status-critical",
};
/** Lo que dice la seña. En vez del grado, lo que hay que hacer con él. */
const SEÑA: Record<Certeza, string> = {
  alta: "fiable",
  media: "revisar",
  baja: "comprobar",
};
const AYUDA: Record<Certeza, string> = {
  alta: "Salió de una etiqueta clara del PDF",
  media: "Deducido del documento: conviene mirarlo contra el PDF",
  baja: "Dudoso: hay que comprobarlo contra el PDF antes de guardar",
};
/** Fondo de la fila, para que la seña se vea sin buscarla. */
const FILA: Record<Certeza, string> = {
  alta: "",
  media: "bg-status-warning/[0.07]",
  baja: "bg-status-critical/[0.06]",
};

/**
 * Lee una póliza en PDF y rellena el formulario con lo que encuentra.
 *
 * Nunca guarda ni acepta nada por su cuenta: muestra cada campo con su grado
 * de certeza y con el trozo del PDF del que salió, y hay que pulsar para
 * llevarlo al formulario. Estas cifras alimentan el seguimiento de producción,
 * y una prima mal leída descuadra el informe del año.
 */
export function LeerPolizaPdf({
  onAplicar,
}: {
  onAplicar: (datos: Partial<PolizaEditable>) => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [r, setR] = useState<Extraido | null>(null);
  const [nombre, setNombre] = useState<string | null>(null);
  const [comprobado, setComprobado] = useState(false);

  /*
   * Campos que hay que comprobar sí o sí antes de llevarlos al formulario.
   *
   * Solo los de certeza «baja»: son los que el lector saca de una conjetura, y
   * los que hemos visto equivocarse en pólizas reales —un ramo cogido del
   * clausulado, una prima que era un año—. Los de certeza media se marcan en
   * la tabla pero no bloquean: avisar de todo equivale a no avisar de nada.
   */
  const aComprobar = r
    ? ETIQUETAS.filter(([k]) => {
        const c = r[k] as Campo<string | number>;
        return c.valor != null && c.certeza === "baja";
      })
    : [];

  const leer = async (archivo: File) => {
    setLeyendo(true);
    setError(null);
    setR(null);
    // Cada PDF nuevo vuelve a exigir la comprobación: si no, el visto bueno de
    // la póliza anterior arrastraría a la siguiente.
    setComprobado(false);
    setNombre(archivo.name);
    try {
      const fd = new FormData();
      fd.append("archivo", archivo);
      const res = await fetch(api("/api/extraer-poliza"), { method: "POST", body: fd });
      setR(await exigirOk<Extraido>(res, "No se pudo leer el PDF."));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLeyendo(false);
    }
  };

  const aplicar = () => {
    if (!r) return;
    const datos: Partial<PolizaEditable> = {};
    if (r.numero.valor) datos.numero = r.numero.valor;
    if (r.ramo.valor) datos.ramo = r.ramo.valor;
    if (r.asegurado.valor) datos.asegurado = r.asegurado.valor;
    if (r.ccNit.valor) datos.ccNit = r.ccNit.valor;
    if (r.placa.valor) datos.placa = r.placa.valor;
    if (r.aseguradora.valor) datos.aseguradora = r.aseguradora.valor;
    if (r.vigenciaHasta.valor) datos.vencimiento = r.vigenciaHasta.valor;
    if (r.primaNeta.valor != null) datos.primaNeta = r.primaNeta.valor;
    if (r.primaTotal.valor != null) datos.primaTotal = r.primaTotal.valor;
    if (r.formaPago.valor) datos.formaPago = r.formaPago.valor.toUpperCase();
    onAplicar(datos);
  };

  const valorLegible = (k: keyof Extraido, c: Campo<string | number>) => {
    if (c.valor == null) return "—";
    if (k === "primaNeta" || k === "primaTotal") return fmtCOP(Number(c.valor));
    return String(c.valor);
  };

  return (
    <div className="rounded-lg border border-dashed border-line-axis bg-surface-page p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={entrada}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) leer(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => entrada.current?.click()}
          disabled={leyendo}
          className="etiqueta-marca rounded-lg bg-brand px-3 py-1.5 text-xs text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {leyendo ? "Leyendo…" : "Leer póliza en PDF"}
        </button>
        <span className="text-xs leading-relaxed text-ink-muted">
          {nombre ?? "Rellena el formulario con lo que traiga el PDF. Siempre hay que revisarlo antes de guardar."}
        </span>
      </div>

      {error && (
        <p className="mt-2 rounded-lg border border-status-critical/30 bg-status-critical/5 px-3 py-2 text-xs text-status-critical">
          {error}
        </p>
      )}

      {r && (
        <div className="mt-3">
          {r.aviso && (
            <p className="mb-2 rounded-lg border border-status-warning/40 bg-status-warning/5 px-3 py-2 text-xs leading-relaxed text-ink-secondary">
              {r.aviso}
            </p>
          )}

          {r.camposEncontrados > 0 && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <tbody>
                    {ETIQUETAS.map(([k, etiqueta]) => {
                      const c = r[k] as Campo<string | number>;
                      const marcado = c.valor != null && c.certeza !== "alta";
                      return (
                        <tr
                          key={k}
                          className={clsx(
                            "border-b border-line-grid last:border-0",
                            c.valor != null && FILA[c.certeza]
                          )}
                        >
                          <td className="py-1 pr-2 text-ink-muted">{etiqueta}</td>
                          <td
                            className={clsx(
                              "py-1 pr-2 font-medium",
                              marcado && "text-ink"
                            )}
                          >
                            {marcado && (
                              <span aria-hidden className="mr-1">
                                ⚠
                              </span>
                            )}
                            {valorLegible(k, c)}
                          </td>
                          <td className="py-1 pr-2">
                            {c.valor != null && (
                              <span
                                className={clsx("rounded px-1.5 py-0.5 text-[10px] font-semibold", COLOR[c.certeza])}
                                title={AYUDA[c.certeza]}
                              >
                                {SEÑA[c.certeza]}
                              </span>
                            )}
                          </td>
                          <td
                            className="max-w-[16rem] truncate py-1 text-[11px] text-ink-muted"
                            title={c.evidencia ?? ""}
                          >
                            {c.evidencia ?? ""}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {aComprobar.length > 0 && (
                <label className="mt-2.5 flex cursor-pointer items-start gap-2 rounded-lg border border-status-critical/30 bg-status-critical/5 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={comprobado}
                    onChange={(e) => setComprobado(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[color:theme(colors.status.critical)]"
                  />
                  <span className="text-[11px] leading-relaxed text-ink-secondary">
                    El lector no está seguro de{" "}
                    <strong className="font-semibold text-status-critical">
                      {aComprobar.map(([, e]) => e.toLowerCase()).join(", ")}
                    </strong>
                    . Confirmo que lo he comprobado contra el PDF.
                  </span>
                </label>
              )}

              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={aplicar}
                  disabled={aComprobar.length > 0 && !comprobado}
                  className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Llevar al formulario
                </button>
                <span className="text-[11px] leading-relaxed text-ink-muted">
                  {aComprobar.length > 0 && !comprobado
                    ? "Confirme arriba que comprobó los campos marcados."
                    : `Se rellenan ${r.camposEncontrados} campos. Los marcados con ⚠ conviene mirarlos contra el PDF antes de guardar.`}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
