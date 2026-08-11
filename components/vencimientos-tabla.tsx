"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { Semaforo, TipoAnexo } from "@/lib/calculos";
import type { ListasFormulario } from "@/lib/queries";
import { fmtCOP, fmtFecha } from "@/lib/format";
import { EstadoPagoBadge, SemaforoBadge, Td, Th } from "@/components/ui";
import { IconCheck, IconMas } from "@/components/icons";
import { PolizaEditable, PolizaForm } from "@/components/poliza-form";
import { BotonExportar } from "@/components/boton-exportar";
import { GestionarPoliza } from "@/components/gestionar-poliza";
import { Paginacion, usePaginacion } from "@/components/paginacion";
import { PanelFiltros } from "@/components/panel-filtros";
import { BuscadorTabla } from "@/components/buscador-tabla";
import { FiltroMes } from "@/components/filtro-mes";
import { FiltroSeleccion, FichasFiltros } from "@/components/filtro-seleccion";

export interface PolizaVista extends PolizaEditable {
  id: number;
  dias: number | null;
  semaforo: Semaforo | null;
  gestionada: boolean;
  notaGestion: string | null;
  /** Anexo a una póliza que ya existe: vence a propósito y no se renueva. */
  anexo: TipoAnexo | null;
}

type Pestania = "pendientes" | "proximos" | "anexos" | "todas";

const PESTANIAS: { id: Pestania; etiqueta: string }[] = [
  { id: "pendientes", etiqueta: "Pendientes de renovar (vencidas)" },
  { id: "proximos", etiqueta: "Próximos a vencer (0–30 días)" },
  // Las prórrogas y los incrementos salen de las dos pestañas de renovación,
  // pero tienen que poder verse en algún sitio: si no, desaparecerían de la
  // pantalla.
  { id: "anexos", etiqueta: "Prórrogas e incrementos" },
  { id: "todas", etiqueta: "Todas las pólizas" },
];

const ETIQUETA_ANEXO: Record<TipoAnexo, string> = {
  PRORROGA: "Prórroga",
  INCREMENTO: "Incremento",
};

function normalizar(v: string): string {
  return v.trim().replace(/\s+/g, " ");
}

function opciones(valores: (string | null)[]): string[] {
  return Array.from(
    new Set(valores.filter((v): v is string => !!v).map(normalizar).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "es"));
}

export function VencimientosTabla({
  polizas,
  listas,
}: {
  polizas: PolizaVista[];
  listas: ListasFormulario;
}) {
  const router = useRouter();
  const [pestania, setPestania] = useState<Pestania>("pendientes");
  const [q, setQ] = useState("");
  // Listas y no valores sueltos: se puede cruzar «AUTOS y HOGAR» de una vez.
  // Vacío = sin filtrar. Ver components/filtro-seleccion.tsx.
  const [selAsesor, setSelAsesor] = useState<string[]>([]);
  const [selRamo, setSelRamo] = useState<string[]>([]);
  const [selAseguradora, setSelAseguradora] = useState<string[]>([]);
  const [selTipo, setSelTipo] = useState<string[]>([]);
  const [selEstado, setSelEstado] = useState<string[]>([]);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [mes, setMes] = useState("");
  const [soloSinGestionar, setSoloSinGestionar] = useState(false);
  const [orden, setOrden] = useState<"dias" | "prima">("dias");
  const [gestionando, setGestionando] = useState<PolizaVista | null>(null);
  const [creando, setCreando] = useState(false);

  const asesores = useMemo(
    () => opciones(polizas.flatMap((p) => [p.asesor1, p.asesor2])),
    [polizas]
  );
  const ramos = useMemo(() => opciones(polizas.map((p) => p.ramo)), [polizas]);
  const aseguradoras = useMemo(() => opciones(polizas.map((p) => p.aseguradora)), [polizas]);
  const tiposNegocio = useMemo(() => opciones(polizas.map((p) => p.tipoNegocio)), [polizas]);
  // Meses que existen en los datos, no un rango fijo: así no se ofrecen meses
  // vacíos.
  const meses = useMemo(
    () =>
      Array.from(
        new Set(
          polizas
            .map((p) => p.vencimiento?.slice(0, 7))
            .filter((m): m is string => !!m)
        )
      ).sort(),
    [polizas]
  );

  const filtradas = useMemo(() => {
    let lista = polizas;
    // Prórrogas e incrementos vencen a propósito: quedan fuera de las dos
    // pestañas de renovación y tienen la suya. En «Todas» aparecen, porque
    // son cartera.
    if (pestania === "pendientes") {
      lista = lista.filter((p) => !p.anexo && p.dias != null && p.dias < 0);
    } else if (pestania === "proximos") {
      lista = lista.filter(
        (p) => !p.anexo && p.dias != null && p.dias >= 0 && p.dias <= 30
      );
    } else if (pestania === "anexos") {
      lista = lista.filter((p) => p.anexo);
    }
    // Rango de vencimiento: es como se arma el trabajo de renovación de un mes
    // («lo que vence entre el 1 y el 31»), que con solo las pestañas fijas de
    // 0–30 días no se podía acotar.
    if (desde) lista = lista.filter((p) => p.vencimiento && p.vencimiento.slice(0, 10) >= desde);
    if (hasta) lista = lista.filter((p) => p.vencimiento && p.vencimiento.slice(0, 10) <= hasta);
    // Atajo del rango anterior para el caso más común: un mes entero.
    if (mes) lista = lista.filter((p) => p.vencimiento?.slice(0, 7) === mes);
    // Buscador libre: mismo criterio que la pantalla de Búsqueda
    // (número de póliza, nombre del asegurado o CC/NIT).
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      lista = lista.filter(
        (p) =>
          p.numero.toLowerCase().includes(t) ||
          p.asegurado.toLowerCase().includes(t) ||
          (p.ccNit ?? "").toLowerCase().includes(t)
      );
    }
    // Dentro de una categoría los valores suman (AUTOS o HOGAR); entre
    // categorías se acumulan (AUTOS y además de tal aseguradora).
    if (selAsesor.length)
      lista = lista.filter(
        (p) =>
          (p.asesor1 && selAsesor.includes(normalizar(p.asesor1))) ||
          (p.asesor2 && selAsesor.includes(normalizar(p.asesor2)))
      );
    if (selRamo.length) lista = lista.filter((p) => selRamo.includes(normalizar(p.ramo)));
    if (selAseguradora.length)
      lista = lista.filter((p) => p.aseguradora && selAseguradora.includes(normalizar(p.aseguradora)));
    if (selTipo.length)
      lista = lista.filter((p) => p.tipoNegocio && selTipo.includes(normalizar(p.tipoNegocio)));
    if (selEstado.length) lista = lista.filter((p) => selEstado.includes(p.estadoPago ?? ""));
    if (soloSinGestionar) lista = lista.filter((p) => !p.gestionada);
    return [...lista].sort((a, b) => {
      if (orden === "prima") return b.primaNeta - a.primaNeta;
      // Por días: más vencidas primero; sin fecha al final
      const da = a.dias ?? Number.MAX_SAFE_INTEGER;
      const db = b.dias ?? Number.MAX_SAFE_INTEGER;
      return da - db;
    });
  }, [
    polizas, pestania, q, selAsesor, selRamo, selAseguradora, selTipo,
    selEstado, desde, hasta, mes, soloSinGestionar, orden,
  ]);

  const enRiesgo = filtradas.filter(
    (p) => p.estadoPago === "PENDIENTE" && p.dias != null && p.dias <= 30
  ).length;

  const alGuardar = () => {
    setGestionando(null);
    setCreando(false);
    router.refresh();
  };

  const limpiar = () => {
    setQ("");
    setSelAsesor([]);
    setSelRamo([]);
    setSelAseguradora([]);
    setSelTipo([]);
    setSelEstado([]);
    setDesde("");
    setHasta("");
    setMes("");
    setSoloSinGestionar(false);
  };

  /** Grupos para las fichas de «filtrando por…» sobre la tabla. */
  const grupos = [
    { etiqueta: "Ramo", valores: selRamo, onCambiar: setSelRamo },
    { etiqueta: "Tipo", valores: selTipo, onCambiar: setSelTipo },
    { etiqueta: "Asesor", valores: selAsesor, onCambiar: setSelAsesor },
    { etiqueta: "Aseguradora", valores: selAseguradora, onCambiar: setSelAseguradora },
    { etiqueta: "Pago", valores: selEstado, onCambiar: setSelEstado },
  ];
  const nSeleccion = grupos.reduce((n, g) => n + g.valores.length, 0);
  // Los de fecha y el interruptor no son fichas, pero sí cuentan para el aviso.
  const nFiltros =
    nSeleccion + (desde ? 1 : 0) + (hasta ? 1 : 0) + (soloSinGestionar ? 1 : 0);
  const hayFiltros = nFiltros > 0 || !!q || !!mes;

  const claseSelect =
    "rounded-lg border border-line-axis bg-surface px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none";

  // Solo se pintan 100 filas por página; los filtros siguen sobre el total.
  const { visibles, pagina, setPagina, totalPaginas } = usePaginacion(filtradas);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg border border-line-grid bg-surface p-1">
          {PESTANIAS.map((t) => (
            <button
              key={t.id}
              onClick={() => setPestania(t.id)}
              className={clsx(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                pestania === t.id
                  ? "bg-brand text-white"
                  : "text-ink-secondary hover:bg-surface-page"
              )}
            >
              {t.etiqueta}
            </button>
          ))}
        </div>
        <button
          onClick={() => setCreando(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          <IconMas className="h-4 w-4" />
          Nueva póliza
        </button>
      </div>

      {/* Buscador y mes fuera del panel plegable: son los dos controles que se
          usan a diario, y dentro del panel costaban un clic y no se veían. */}
      <div className="flex flex-wrap items-center gap-2">
        <BuscadorTabla valor={q} onCambiar={setQ} />
        <FiltroMes valor={mes} onCambiar={setMes} meses={meses} etiqueta="Mes de vencimiento: todos" />
      </div>

      <FichasFiltros grupos={grupos} onLimpiarTodo={limpiar} />

      <PanelFiltros activos={nFiltros}>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line-grid bg-white p-3">
        <FiltroSeleccion etiqueta="Ramo" opciones={ramos} valores={selRamo} onCambiar={setSelRamo} />
        <FiltroSeleccion etiqueta="Tipo" opciones={tiposNegocio} valores={selTipo} onCambiar={setSelTipo} />
        <FiltroSeleccion etiqueta="Asesor" opciones={asesores} valores={selAsesor} onCambiar={setSelAsesor} />
        <FiltroSeleccion
          etiqueta="Aseguradora"
          opciones={aseguradoras}
          valores={selAseguradora}
          onCambiar={setSelAseguradora}
          plural="todas"
        />
        <FiltroSeleccion
          etiqueta="Pago"
          opciones={["OK PAGO", "PENDIENTE"]}
          valores={selEstado}
          onCambiar={setSelEstado}
        />
        {/* Rango de vencimiento: para armar el trabajo de un mes concreto. */}
        <label className="flex items-center gap-1.5 text-sm text-ink-secondary">
          Vence desde
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className={claseSelect}
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-ink-secondary">
          hasta
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className={claseSelect}
          />
        </label>
        <select
          className={claseSelect}
          value={orden}
          onChange={(e) => setOrden(e.target.value as "dias" | "prima")}
        >
          <option value="dias">Orden: más vencidas primero</option>
          <option value="prima">Orden: mayor prima neta</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm text-ink-secondary">
          <input
            type="checkbox"
            checked={soloSinGestionar}
            onChange={(e) => setSoloSinGestionar(e.target.checked)}
          />
          Solo sin gestionar
        </label>
        {hayFiltros && (
          <button
            onClick={limpiar}
            className="rounded-lg border border-line-axis px-2.5 py-1.5 text-sm text-ink-secondary hover:bg-surface-page"
          >
            Limpiar
          </button>
        )}
        <span className="ml-auto text-sm text-ink-muted">
          {filtradas.length} pólizas
          {enRiesgo > 0 && (
            <span className="ml-2 font-semibold text-status-critical">
              · {enRiesgo} en riesgo (pago pendiente y vencen ≤ 30 días)
            </span>
          )}
        </span>
        <BotonExportar
          nombre="vencimientos"
          filas={filtradas}
          columnas={[
            { encabezado: "Días al vence", valor: (p) => p.dias ?? "" },
            { encabezado: "Estado", valor: (p) => p.semaforo ?? "" },
            {
              encabezado: "Vencimiento",
              valor: (p) => (p.vencimiento ? new Date(p.vencimiento) : null),
            },
            { encabezado: "Póliza", valor: (p) => p.numero },
            { encabezado: "Ramo", valor: (p) => p.ramo },
            { encabezado: "Placa", valor: (p) => p.placa ?? "" },
            { encabezado: "Tipo negocio", valor: (p) => p.tipoNegocio ?? "" },
            { encabezado: "Asegurado", valor: (p) => p.asegurado },
            { encabezado: "CC/NIT", valor: (p) => p.ccNit ?? "" },
            { encabezado: "Aseguradora", valor: (p) => p.aseguradora ?? "" },
            { encabezado: "Asesor 1", valor: (p) => p.asesor1 ?? "" },
            { encabezado: "Asesor 2", valor: (p) => p.asesor2 ?? "" },
            { encabezado: "Prima neta", valor: (p) => p.primaNeta },
            { encabezado: "Prima total", valor: (p) => p.primaTotal },
            { encabezado: "Forma de pago", valor: (p) => p.formaPago ?? "" },
            { encabezado: "Estado de pago", valor: (p) => p.estadoPago ?? "" },
            { encabezado: "Observación", valor: (p) => p.observacion ?? "" },
            { encabezado: "Anexo", valor: (p) => p.anexo ?? "" },
            { encabezado: "Celular", valor: (p) => p.celular ?? "" },
            { encabezado: "Correo", valor: (p) => p.correo ?? "" },
            { encabezado: "Gestionada", valor: (p) => (p.gestionada ? "SÍ" : "NO") },
            { encabezado: "Nota de gestión", valor: (p) => p.notaGestion ?? "" },
          ]}
        />
      </div>
      </PanelFiltros>

      <div className="overflow-x-auto scroll-fino rounded-xl border border-line-grid bg-surface">
        <table className="w-full border-collapse whitespace-nowrap">
          <thead>
            <tr>
              <Th>Semáforo</Th>
              <Th>Vencimiento</Th>
              <Th>Póliza</Th>
              <Th>Ramo</Th>
              <Th>Placa</Th>
              <Th>Tipo negocio</Th>
              <Th>Asegurado</Th>
              <Th>Contacto</Th>
              <Th>Aseguradora</Th>
              <Th>Asesor</Th>
              <Th derecha>Prima neta</Th>
              <Th derecha>Prima total</Th>
              <Th>Forma de pago</Th>
              <Th>Pago</Th>
              <Th>Observación</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) => (
              <tr
                key={p.id}
                className={clsx("hover:bg-surface-page", p.gestionada && "opacity-60")}
              >
                <Td>
                  {/* Un anexo vencido no es un pendiente: decirlo aquí evita
                      que el semáforo en rojo lo haga parecer trabajo atrasado. */}
                  {p.anexo ? (
                    <span className="inline-flex items-center rounded bg-brand-light px-1.5 py-0.5 text-[11px] font-semibold text-brand">
                      {ETIQUETA_ANEXO[p.anexo]}
                    </span>
                  ) : (
                    <SemaforoBadge nivel={p.semaforo} dias={p.dias} />
                  )}
                </Td>
                <Td>{fmtFecha(p.vencimiento)}</Td>
                <Td className="font-medium">{p.numero}</Td>
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
                  {p.tipoNegocio ? (
                    <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-[11px] font-medium text-ink-secondary">
                      {p.tipoNegocio}
                    </span>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </Td>
                <Td>
                  <div className="max-w-[220px] truncate" title={p.asegurado}>
                    {p.asegurado}
                  </div>
                  {p.ccNit && <div className="text-[11px] text-ink-muted">{p.ccNit}</div>}
                </Td>
                <Td>
                  <div className="text-xs">
                    {p.celular && <div>{p.celular}</div>}
                    {p.correo && (
                      <div className="max-w-[180px] truncate text-ink-muted" title={p.correo}>
                        {p.correo}
                      </div>
                    )}
                    {!p.celular && !p.correo && <span className="text-ink-muted">—</span>}
                  </div>
                </Td>
                <Td>{p.aseguradora ?? "—"}</Td>
                <Td>
                  <div className="text-xs">
                    <div>{p.asesor1 ?? "—"}</div>
                    {p.asesor2 && <div className="text-ink-muted">{p.asesor2}</div>}
                  </div>
                </Td>
                <Td derecha>{fmtCOP(p.primaNeta)}</Td>
                <Td derecha>{fmtCOP(p.primaTotal)}</Td>
                <Td>{p.formaPago ?? "—"}</Td>
                <Td>
                  <EstadoPagoBadge estado={p.estadoPago} />
                </Td>
                <Td>
                  <div className="max-w-[200px] truncate text-xs" title={p.observacion ?? ""}>
                    {p.observacion ?? <span className="text-ink-muted">—</span>}
                  </div>
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    {p.gestionada && (
                      <span
                        title={p.notaGestion ?? "Gestionada"}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-status-good"
                      >
                        <IconCheck className="h-3.5 w-3.5" />
                        Gestionada
                      </span>
                    )}
                    <button
                      onClick={() => setGestionando(p)}
                      className="inline-flex items-center gap-1 rounded-lg border border-brand/40 px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-light/40"
                    >
                      Gestionar
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
            {filtradas.length === 0 && (
              <tr>
                <Td className="py-6 text-center text-ink-muted" colSpan={16}>
                  No hay pólizas que cumplan los filtros.
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Paginacion
        pagina={pagina}
        totalPaginas={totalPaginas}
        onCambiar={setPagina}
        total={filtradas.length}
        etiqueta="pólizas"
      />

      {gestionando && (
        <GestionarPoliza
          poliza={gestionando}
          listas={listas}
          pestaniaInicial="gestion"
          onCerrar={() => setGestionando(null)}
          onGuardado={alGuardar}
        />
      )}
      {creando && (
        <PolizaForm
          poliza={null}
          listas={listas}
          onCerrar={() => setCreando(false)}
          onGuardado={alGuardar}
        />
      )}
    </div>
  );
}
