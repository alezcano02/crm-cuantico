import clsx from "clsx";
import { Td, Th } from "@/components/ui";
import type { Disponibilidad, ProductoClausulado } from "@/lib/productos";

/**
 * Tres estados, y el tercero importa tanto como los otros dos: "no
 * especificado" quiere decir que ESE clausulado no menciona la cobertura, no
 * que la compañía no la ofrezca. Puede estar en un anexo que no tenemos
 * archivado. Se marca distinto para que nadie lo lea como un "no cubre".
 */
const MARCA: Record<Disponibilidad, { texto: string; clase: string; ayuda: string }> = {
  basico: {
    texto: "Básico",
    clase: "bg-status-good/12 text-status-good",
    ayuda: "Incluido en el amparo básico según el clausulado",
  },
  opcional: {
    texto: "Anexo",
    clase: "bg-status-warning/15 text-status-warning",
    ayuda: "Existe, pero como anexo o módulo aparte con prima adicional",
  },
  segun_caratula: {
    texto: "Carátula",
    clase: "bg-brand-light text-brand-dark",
    ayuda:
      "El clausulado lo lista sin decir si es básico o adicional: opera si está contratado en la carátula",
  },
  no_especificado: {
    texto: "—",
    clase: "text-ink-muted",
    ayuda:
      "El clausulado archivado no la menciona. No significa que la compañía no la ofrezca: confirme con la compañía.",
  },
};

export function TablaProductos({
  productos,
  coberturas,
}: {
  productos: ProductoClausulado[];
  coberturas: string[];
}) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse whitespace-nowrap">
          <thead>
            <tr>
              <Th>Compañía</Th>
              {coberturas.map((c) => (
                <Th key={c}>{c}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => (
              <tr key={p.compania} className="hover:bg-surface-page">
                <Td>
                  <div className="font-semibold">{p.compania}</div>
                  <div
                    className="max-w-[15rem] truncate text-xs text-ink-muted"
                    title={p.producto}
                  >
                    {p.producto}
                  </div>
                </Td>
                {coberturas.map((c) => {
                  const cob = p.coberturas[c] ?? { estado: "no_especificado" as const };
                  const m = MARCA[cob.estado];
                  return (
                    <Td key={c} title={cob.nota ? `${m.ayuda} · ${cob.nota}` : m.ayuda}>
                      <span
                        className={clsx(
                          "inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold",
                          m.clase
                        )}
                      >
                        {m.texto}
                      </span>
                      {cob.nota && (
                        <div className="max-w-[13rem] truncate text-[11px] text-ink-muted">
                          {cob.nota}
                        </div>
                      )}
                    </Td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-ink-muted">
        {(Object.keys(MARCA) as Disponibilidad[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span
              className={clsx(
                "inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold",
                MARCA[k].clase
              )}
            >
              {MARCA[k].texto}
            </span>
            {MARCA[k].ayuda}
          </span>
        ))}
      </div>

      <div className="mt-4 space-y-2 border-t border-line-grid pt-3">
        <div className="etiqueta-marca text-[11px] text-ink-muted">
          Cómo organiza cada compañía su producto
        </div>
        {productos.map((p) => (
          <p key={p.compania} className="text-xs leading-relaxed text-ink-secondary">
            <b className="text-ink">{p.compania}:</b> {p.estructura}{" "}
            <span className="text-ink-muted">({p.archivo})</span>
          </p>
        ))}
      </div>
    </>
  );
}
