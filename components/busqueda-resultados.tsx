"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmtCOP, fmtFecha } from "@/lib/format";
import { EstadoPagoBadge, SemaforoBadge, Td, Th } from "@/components/ui";
import { GestionarPoliza } from "@/components/gestionar-poliza";
import type { PolizaEditable } from "@/components/poliza-form";
import type { ListasFormulario } from "@/lib/queries";
import type { Semaforo, TipoAnexo } from "@/lib/calculos";

const ETIQUETA_ANEXO: Record<TipoAnexo, string> = {
  PRORROGA: "Prórroga",
  INCREMENTO: "Incremento",
};

export interface ResultadoPoliza extends PolizaEditable {
  id: number;
  dias: number | null;
  semaforo: Semaforo | null;
  gestionada: boolean;
  notaGestion: string | null;
  anexo: TipoAnexo | null;
}

/**
 * Resultados de cartera de la pantalla de Búsqueda.
 *
 * Va aparte y como componente de cliente por una razón concreta: gestionar una
 * póliza abre un modal con estado, y la página de búsqueda es de servidor. Al
 * encontrar una póliza aquí lo natural es actuar sobre ella sin tener que ir a
 * buscarla otra vez en Vencimientos o en Cartera.
 */
export function BusquedaResultados({
  polizas,
  listas,
}: {
  polizas: ResultadoPoliza[];
  listas: ListasFormulario;
}) {
  const router = useRouter();
  const [gestionando, setGestionando] = useState<ResultadoPoliza | null>(null);

  return (
    <>
      <div className="overflow-x-auto scroll-fino">
        <table className="w-full border-collapse whitespace-nowrap">
          <thead>
            <tr>
              <Th>Asegurado</Th>
              <Th>CC/NIT</Th>
              <Th>Ramo</Th>
              <Th>Placa</Th>
              <Th>Tipo negocio</Th>
              <Th>Aseguradora</Th>
              <Th>Póliza</Th>
              <Th>Asesor</Th>
              <Th>Contacto</Th>
              <Th derecha>Prima neta</Th>
              <Th derecha>Prima total</Th>
              <Th>Forma de pago</Th>
              <Th>Vencimiento</Th>
              <Th>Pago</Th>
              <Th>Observación</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {polizas.map((p) => (
              <tr key={p.id} className="hover:bg-surface-page">
                <Td className="font-medium">
                  <div className="max-w-[220px] truncate" title={p.asegurado}>
                    {p.asegurado}
                  </div>
                </Td>
                <Td>{p.ccNit ?? "—"}</Td>
                <Td>{p.ramo}</Td>
                <Td>
                  {p.placa ? (
                    <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-[11px] font-semibold tracking-wide">
                      {p.placa}
                    </span>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </Td>
                <Td>
                  <span className="text-xs">{p.tipoNegocio ?? "—"}</span>
                </Td>
                <Td>{p.aseguradora ?? "—"}</Td>
                <Td>{p.numero}</Td>
                <Td>
                  <div className="text-xs">
                    <div>{p.asesor1 ?? "—"}</div>
                    {p.asesor2 && <div className="text-ink-muted">{p.asesor2}</div>}
                  </div>
                </Td>
                <Td>
                  <div className="text-xs">
                    {p.celular && <div>{p.celular}</div>}
                    {p.correo && (
                      <div className="max-w-[170px] truncate text-ink-muted" title={p.correo}>
                        {p.correo}
                      </div>
                    )}
                    {!p.celular && !p.correo && <span className="text-ink-muted">—</span>}
                  </div>
                </Td>
                <Td derecha>{fmtCOP(p.primaNeta)}</Td>
                <Td derecha>{fmtCOP(p.primaTotal)}</Td>
                <Td>{p.formaPago ?? "—"}</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    {fmtFecha(p.vencimiento)}
                    {/* Un anexo vencido no es trabajo atrasado; ver lib/calculos.ts */}
                    {p.anexo ? (
                      <span className="rounded bg-brand-light px-1.5 py-0.5 text-[11px] font-semibold text-brand">
                        {ETIQUETA_ANEXO[p.anexo]}
                      </span>
                    ) : (
                      <SemaforoBadge nivel={p.semaforo} dias={p.dias} />
                    )}
                  </div>
                </Td>
                <Td>
                  <EstadoPagoBadge estado={p.estadoPago} />
                </Td>
                <Td>
                  <div className="max-w-[180px] truncate text-xs" title={p.observacion ?? ""}>
                    {p.observacion ?? <span className="text-ink-muted">—</span>}
                  </div>
                </Td>
                <Td>
                  <button
                    onClick={() => setGestionando(p)}
                    className="inline-flex items-center gap-1 rounded-lg border border-brand/40 px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-light/40"
                  >
                    Gestionar
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {gestionando && (
        <GestionarPoliza
          poliza={gestionando}
          listas={listas}
          pestaniaInicial="gestion"
          onCerrar={() => setGestionando(null)}
          onGuardado={() => {
            setGestionando(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
