"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Td, Th } from "@/components/ui";
import type {
  AsistenciaCompania,
  Disponibilidad,
  OrigenAsistencia,
  ProductoClausulado,
} from "@/lib/productos";

/**
 * Una sola pantalla con filtros, en vez de seis tarjetas apiladas.
 *
 * Antes había una tabla por ramo, otra de inventario y cuatro bloques de texto
 * seguidos: para saber algo de una compañía había que recorrerlo todo. Ahora se
 * elige ramo y compañía y queda a la vista solo eso.
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

const ORIGEN: Record<OrigenAsistencia, { texto: string; clase: string }> = {
  anexo_oficial: {
    texto: "Anexo oficial",
    clase: "bg-status-good/12 text-status-good",
  },
  exclusiones: {
    texto: "Solo exclusiones",
    clase: "bg-status-warning/15 text-status-warning",
  },
  nota_interna: {
    texto: "Nota interna",
    clase: "bg-status-critical/12 text-status-critical",
  },
};

type Ramo = "COPROPIEDADES" | "AUTOS" | "ASISTENCIAS";

export function ProductosExplorador({
  copropiedades,
  autos,
  asistencias,
  coberturasCopropiedades,
  coberturasAutos,
  serviciosAsistencia,
  clavesPorRamo,
}: {
  copropiedades: ProductoClausulado[];
  autos: ProductoClausulado[];
  asistencias: AsistenciaCompania[];
  coberturasCopropiedades: string[];
  coberturasAutos: string[];
  serviciosAsistencia: string[];
  /** Diferencias que conviene saber, una lista corta por ramo. */
  clavesPorRamo: Record<Ramo, { titulo: string; texto: string }[]>;
}) {
  const [ramo, setRamo] = useState<Ramo>("COPROPIEDADES");
  const [compania, setCompania] = useState("");
  const [soloBasico, setSoloBasico] = useState(false);

  const companias = useMemo(() => {
    const lista =
      ramo === "COPROPIEDADES"
        ? copropiedades.map((p) => p.compania)
        : ramo === "AUTOS"
          ? autos.map((p) => p.compania)
          : asistencias.map((a) => a.compania);
    return [...lista].sort((a, b) => a.localeCompare(b, "es"));
  }, [ramo, copropiedades, autos, asistencias]);

  const productos = ramo === "AUTOS" ? autos : copropiedades;
  const coberturas = ramo === "AUTOS" ? coberturasAutos : coberturasCopropiedades;

  const filas = useMemo(
    () => productos.filter((p) => !compania || p.compania === compania),
    [productos, compania]
  );
  const filasAsistencia = useMemo(
    () => asistencias.filter((a) => !compania || a.compania === compania),
    [asistencias, compania]
  );

  // Con "solo lo incluido" se ocultan las columnas donde nadie de los visibles
  // trae la cobertura en el básico: es la vista para cotizar rápido.
  const columnas = useMemo(() => {
    if (!soloBasico || ramo === "ASISTENCIAS") return coberturas;
    return coberturas.filter((c) =>
      filas.some((p) => p.coberturas[c]?.estado === "basico")
    );
  }, [soloBasico, coberturas, filas, ramo]);

  const cambiarRamo = (r: Ramo) => {
    setRamo(r);
    setCompania("");
  };

  const claseSelect =
    "rounded-lg border border-line-axis bg-white px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-line-grid bg-surface-page p-1">
          {(["COPROPIEDADES", "AUTOS", "ASISTENCIAS"] as Ramo[]).map((r) => (
            <button
              key={r}
              onClick={() => cambiarRamo(r)}
              className={clsx(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                ramo === r
                  ? "bg-brand text-white"
                  : "text-ink-secondary hover:bg-surface"
              )}
            >
              {r === "COPROPIEDADES"
                ? "Copropiedades"
                : r === "AUTOS"
                  ? "Autos"
                  : "Asistencias"}
            </button>
          ))}
        </div>

        <select
          className={claseSelect}
          value={compania}
          onChange={(e) => setCompania(e.target.value)}
        >
          <option value="">Compañía: todas</option>
          {companias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {ramo !== "ASISTENCIAS" && (
          <label className="flex items-center gap-2 text-sm text-ink-secondary">
            <input
              type="checkbox"
              checked={soloBasico}
              onChange={(e) => setSoloBasico(e.target.checked)}
              className="h-4 w-4 rounded border-line-axis"
            />
            Solo coberturas que alguien trae en el básico
          </label>
        )}

        <span className="ml-auto text-sm text-ink-muted">
          {(() => {
            const n = ramo === "ASISTENCIAS" ? filasAsistencia.length : filas.length;
            if (ramo === "ASISTENCIAS") return `${n} con documento`;
            return `${n} ${n === 1 ? "compañía" : "compañías"}`;
          })()}
        </span>
      </div>

      {ramo === "ASISTENCIAS" ? (
        <TablaAsistencias filas={filasAsistencia} servicios={serviciosAsistencia} />
      ) : (
        <TablaCoberturas filas={filas} columnas={columnas} />
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-ink-muted">
        {ramo === "ASISTENCIAS"
          ? (Object.keys(ORIGEN) as OrigenAsistencia[]).map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <Insignia texto={ORIGEN[k].texto} clase={ORIGEN[k].clase} />
                {k === "anexo_oficial"
                  ? "Documento de la compañía"
                  : k === "exclusiones"
                    ? "Solo la lista de exclusiones; los servicios se deducen"
                    : "Resumen escrito en la agencia, no de la compañía"}
              </span>
            ))
          : (Object.keys(MARCA) as Disponibilidad[]).map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <Insignia texto={MARCA[k].texto} clase={MARCA[k].clase} />
                {MARCA[k].ayuda}
              </span>
            ))}
      </div>

      <div className="rounded-lg border border-line-grid bg-surface-page px-4 py-3">
        <div className="etiqueta-marca mb-2 text-[11px] text-ink-muted">
          Lo que hay que mirar
        </div>
        <ul className="space-y-2">
          {clavesPorRamo[ramo].map((c) => (
            <li key={c.titulo} className="text-sm leading-relaxed text-ink-secondary">
              <b className="text-ink">{c.titulo}</b> {c.texto}
            </li>
          ))}
        </ul>
      </div>

      {(ramo === "ASISTENCIAS" ? filasAsistencia : filas).length > 0 && (
        <details className="rounded-lg border border-line-grid px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-ink-secondary">
            Cómo organiza cada compañía su producto y de qué archivo salió
          </summary>
          <div className="mt-3 space-y-2">
            {ramo === "ASISTENCIAS"
              ? filasAsistencia.map((a) => (
                  <p key={a.compania} className="text-xs leading-relaxed text-ink-secondary">
                    <b className="text-ink">{a.compania}:</b> {a.advertencia}{" "}
                    <span className="text-ink-muted">({a.archivo})</span>
                  </p>
                ))
              : filas.map((p) => (
                  <p key={p.compania} className="text-xs leading-relaxed text-ink-secondary">
                    <b className="text-ink">{p.compania}:</b> {p.estructura}{" "}
                    <span className="text-ink-muted">({p.archivo})</span>
                  </p>
                ))}
          </div>
        </details>
      )}
    </div>
  );
}

function Insignia({ texto, clase }: { texto: string; clase: string }) {
  return (
    <span
      className={clsx(
        "inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold",
        clase
      )}
    >
      {texto}
    </span>
  );
}

function TablaCoberturas({
  filas,
  columnas,
}: {
  filas: ProductoClausulado[];
  columnas: string[];
}) {
  if (columnas.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-ink-muted">
        Ninguna de las compañías visibles trae estas coberturas en el amparo básico.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse whitespace-nowrap">
        <thead>
          <tr>
            <Th>Compañía</Th>
            {columnas.map((c) => (
              <Th key={c}>{c}</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((p) => (
            <tr key={p.compania} className="hover:bg-surface-page">
              <Td>
                <div className="font-semibold">{p.compania}</div>
                <div
                  className="max-w-[14rem] truncate text-xs text-ink-muted"
                  title={p.producto}
                >
                  {p.producto}
                </div>
              </Td>
              {columnas.map((c) => {
                const cob = p.coberturas[c] ?? { estado: "no_especificado" as const };
                const m = MARCA[cob.estado];
                return (
                  <Td key={c} title={cob.nota ? `${m.ayuda} · ${cob.nota}` : m.ayuda}>
                    <Insignia texto={m.texto} clase={m.clase} />
                    {cob.nota && (
                      <div className="max-w-[12rem] truncate text-[11px] text-ink-muted">
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
  );
}

function TablaAsistencias({
  filas,
  servicios,
}: {
  filas: AsistenciaCompania[];
  servicios: string[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse whitespace-nowrap">
        <thead>
          <tr>
            <Th>Compañía</Th>
            <Th>Fuente</Th>
            {servicios.map((s) => (
              <Th key={s}>{s}</Th>
            ))}
            <Th>Topes</Th>
          </tr>
        </thead>
        <tbody>
          {filas.map((a) => (
            <tr key={a.compania} className="hover:bg-surface-page">
              <Td className="font-semibold">{a.compania}</Td>
              <Td>
                <Insignia texto={ORIGEN[a.origen].texto} clase={ORIGEN[a.origen].clase} />
              </Td>
              {servicios.map((s) => (
                <Td key={s}>
                  {a.servicios.includes(s) ? (
                    <span className="font-semibold text-status-good">Sí</span>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </Td>
              ))}
              <Td className="whitespace-normal text-xs text-ink-secondary">
                {a.tope}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
