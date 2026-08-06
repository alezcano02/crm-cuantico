"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import type { EstadoCartera } from "@/lib/calculos";
import type { ListasFormulario } from "@/lib/queries";
import { fmtCOP, fmtCOPCompact, fmtFecha } from "@/lib/format";
import { CarteraBadge, StatCard, Td, Th } from "@/components/ui";
import { IconDescargar, IconDinero } from "@/components/icons";
import { BotonExportar } from "@/components/boton-exportar";
import { GestionarPoliza } from "@/components/gestionar-poliza";
import { Paginacion, usePaginacion } from "@/components/paginacion";
import { PanelFiltros } from "@/components/panel-filtros";
import { BuscadorTabla } from "@/components/buscador-tabla";
import { FiltroMes } from "@/components/filtro-mes";

/** Las fechas viajan como ISO; el CSV las quiere como Date para formatearlas. */
function fechaCSV(iso: string | null): Date | null {
  return iso ? new Date(iso) : null;
}

export interface CarteraVista {
  id: number;
  numero: string;
  ramo: string;
  asegurado: string;
  ccNit: string | null;
  placa: string | null;
  aseguradora: string | null;
  tipoNegocio: string | null;
  asesor1: string | null;
  asesor2: string | null;
  primaNeta: number;
  primaTotal: number;
  formaPago: string | null;
  estadoPago: string | null;
  fechaPago: string | null;
  fechaMaxPago: string | null;
  vencimiento: string | null;
  fechaNacimiento: string | null;
  correo: string | null;
  celular: string | null;
  valorCuota: number | null;
  notaCartera: string | null;
  /** Nota del área técnica del informe (distinta de notaCartera, que es cobranza). */
  observacion: string | null;
  estado: EstadoCartera;
  diasCartera: number | null;
}

type Pestania = "pendientes" | "mora" | "todas";

const PESTANIAS: { id: Pestania; etiqueta: string }[] = [
  { id: "pendientes", etiqueta: "Pendientes de cobro" },
  { id: "mora", etiqueta: "En mora" },
  { id: "todas", etiqueta: "Todas las pólizas" },
];

const PENDIENTES: EstadoCartera[] = ["EN_MORA", "POR_COBRAR", "PENDIENTE", "SIN_FECHA"];

function normalizar(v: string): string {
  return v.trim().replace(/\s+/g, " ");
}

function opciones(valores: (string | null)[]): string[] {
  return Array.from(
    new Set(valores.filter((v): v is string => !!v).map(normalizar).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "es"));
}

export function CarteraTabla({
  polizas,
  listas,
}: {
  polizas: CarteraVista[];
  listas: ListasFormulario;
}) {
  const router = useRouter();
  const [pestania, setPestania] = useState<Pestania>("pendientes");
  const [ramo, setRamo] = useState("");
  const [aseguradora, setAseguradora] = useState("");
  const [asesor, setAsesor] = useState("");
  const [tipoNegocio, setTipoNegocio] = useState("");
  const [formaPago, setFormaPago] = useState("");
  const [mes, setMes] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [q, setQ] = useState("");
  const [orden, setOrden] = useState<"mora" | "prima" | "fecha">("mora");
  const [gestionando, setGestionando] = useState<CarteraVista | null>(null);

  // Meses que existen en los datos, para no ofrecer meses vacíos.
  const meses = useMemo(
    () =>
      Array.from(
        new Set(
          polizas.map((p) => p.fechaMaxPago?.slice(0, 7)).filter((m): m is string => !!m)
        )
      ).sort(),
    [polizas]
  );
  const ramos = useMemo(() => opciones(polizas.map((p) => p.ramo)), [polizas]);
  const aseguradoras = useMemo(() => opciones(polizas.map((p) => p.aseguradora)), [polizas]);
  const asesores = useMemo(
    () => opciones(polizas.flatMap((p) => [p.asesor1, p.asesor2])),
    [polizas]
  );
  const tiposNegocio = useMemo(() => opciones(polizas.map((p) => p.tipoNegocio)), [polizas]);
  const formasPago = useMemo(() => opciones(polizas.map((p) => p.formaPago)), [polizas]);

  const filtradas = useMemo(() => {
    let lista = polizas;
    if (pestania === "pendientes") lista = lista.filter((p) => PENDIENTES.includes(p.estado));
    else if (pestania === "mora") lista = lista.filter((p) => p.estado === "EN_MORA");
    if (ramo) lista = lista.filter((p) => normalizar(p.ramo) === ramo);
    if (aseguradora)
      lista = lista.filter((p) => p.aseguradora && normalizar(p.aseguradora) === aseguradora);
    if (asesor)
      lista = lista.filter(
        (p) =>
          (p.asesor1 && normalizar(p.asesor1) === asesor) ||
          (p.asesor2 && normalizar(p.asesor2) === asesor)
      );
    if (tipoNegocio)
      lista = lista.filter((p) => p.tipoNegocio && normalizar(p.tipoNegocio) === tipoNegocio);
    if (formaPago)
      lista = lista.filter((p) => p.formaPago && normalizar(p.formaPago) === formaPago);
    // Año y mes, no solo el mes: la cartera abarca más de un año y filtrar por
    // «marzo» a secas mezclaba marzo de 2025 con marzo de 2026.
    if (mes) lista = lista.filter((p) => p.fechaMaxPago?.slice(0, 7) === mes);
    if (desde) lista = lista.filter((p) => p.fechaMaxPago && p.fechaMaxPago.slice(0, 10) >= desde);
    if (hasta) lista = lista.filter((p) => p.fechaMaxPago && p.fechaMaxPago.slice(0, 10) <= hasta);
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      lista = lista.filter(
        (p) =>
          p.numero.toLowerCase().includes(t) ||
          p.asegurado.toLowerCase().includes(t) ||
          (p.ccNit ?? "").toLowerCase().includes(t)
      );
    }
    return [...lista].sort((a, b) => {
      if (orden === "prima") return b.primaTotal - a.primaTotal;
      if (orden === "fecha") {
        const fa = a.fechaMaxPago ?? "9999";
        const fb = b.fechaMaxPago ?? "9999";
        return fa.localeCompare(fb);
      }
      // Mora primero: EN_MORA con más días arriba; luego por vencer
      const peso = (p: CarteraVista) =>
        p.estado === "EN_MORA"
          ? -1000000 - (p.diasCartera ?? 0)
          : p.estado === "POR_COBRAR"
            ? (p.diasCartera ?? 0)
            : p.estado === "PENDIENTE"
              ? 1000 + (p.diasCartera ?? 0)
              : 2000000;
      return peso(a) - peso(b);
    });
  }, [
    polizas, pestania, ramo, aseguradora, asesor, tipoNegocio, formaPago,
    mes, desde, hasta, q, orden,
  ]);

  // Totales sobre lo filtrado (prima total = lo que se cobra al cliente)
  // Solo se pintan 100 filas por página; los filtros siguen sobre el total.
  const { visibles, pagina, setPagina, totalPaginas } = usePaginacion(filtradas);

  const resumen = useMemo(() => {
    let pendiente = 0, mora = 0, porCobrar = 0, recaudado = 0, nMora = 0, nPend = 0;
    for (const p of filtradas) {
      if (p.estado === "PAGADA") recaudado += p.primaTotal;
      else {
        pendiente += p.primaTotal;
        nPend++;
        if (p.estado === "EN_MORA") {
          mora += p.primaTotal;
          nMora++;
        } else if (p.estado === "POR_COBRAR") porCobrar += p.primaTotal;
      }
    }
    return { pendiente, mora, porCobrar, recaudado, nMora, nPend };
  }, [filtradas]);

  const limpiar = () => {
    setRamo("");
    setAseguradora("");
    setAsesor("");
    setTipoNegocio("");
    setFormaPago("");
    setMes("");
    setDesde("");
    setHasta("");
    setQ("");
  };

  const claseSelect =
    "rounded-lg border border-line-axis bg-surface px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none";
  const hayFiltros =
    ramo || aseguradora || asesor || tipoNegocio || formaPago || mes || desde || hasta || q;

  // El informe se genera con el asesor seleccionado (o toda la cartera).
  const urlInforme = `/cartera/informe?${new URLSearchParams(
    asesor ? { asesor } : {}
  ).toString()}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          etiqueta="Cartera pendiente"
          valor={fmtCOPCompact(resumen.pendiente)}
          detalle={`${resumen.nPend} pólizas por cobrar · ${fmtCOP(resumen.pendiente)}`}
        />
        <StatCard
          etiqueta="En mora"
          valor={fmtCOPCompact(resumen.mora)}
          detalle={`${resumen.nMora} pólizas vencidas de pago`}
          acento={resumen.mora > 0 ? "rojo" : undefined}
        />
        <StatCard
          etiqueta="Por cobrar (≤ 15 días)"
          valor={fmtCOPCompact(resumen.porCobrar)}
          detalle="Vence el pago pronto"
          acento={resumen.porCobrar > 0 ? "amarillo" : undefined}
        />
        <StatCard
          etiqueta="Recaudado (filtro)"
          valor={fmtCOPCompact(resumen.recaudado)}
          detalle="Pólizas marcadas OK PAGO"
          acento={resumen.recaudado > 0 ? "verde" : undefined}
        />
      </div>

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
        <Link
          href={urlInforme}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-dark"
          title={
            asesor
              ? `Generar el informe de cartera de ${asesor}`
              : "Generar el informe de cartera (elija un asesor para filtrarlo)"
          }
        >
          <IconDescargar className="h-4 w-4" />
          Informe de cartera
        </Link>
      </div>

      {/* Buscador y mes fuera del panel plegable: son los dos controles de uso
          diario, y dentro costaban un clic y no se veían. */}
      <div className="flex flex-wrap items-center gap-2">
        <BuscadorTabla valor={q} onCambiar={setQ} />
        <FiltroMes
          valor={mes}
          onCambiar={setMes}
          meses={meses}
          etiqueta="Mes de pago: todos"
        />
      </div>

      <PanelFiltros>
      {/* Fluyen en horizontal porque los filtros ya no viven en una columna de
          256px sino en una banda sobre la tabla; apilados en vertical la
          empujarían fuera de la pantalla. */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line-grid bg-white p-3">
        <select className={claseSelect} value={ramo} onChange={(e) => setRamo(e.target.value)}>
          <option value="">Ramo: todos</option>
          {ramos.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <select
          className={claseSelect}
          value={tipoNegocio}
          onChange={(e) => setTipoNegocio(e.target.value)}
        >
          <option value="">Tipo negocio: todos</option>
          {tiposNegocio.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select
          className={claseSelect}
          value={aseguradora}
          onChange={(e) => setAseguradora(e.target.value)}
        >
          <option value="">Aseguradora: todas</option>
          {aseguradoras.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <select className={claseSelect} value={asesor} onChange={(e) => setAsesor(e.target.value)}>
          <option value="">Asesor: todos</option>
          {asesores.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <select
          className={claseSelect}
          value={formaPago}
          onChange={(e) => setFormaPago(e.target.value)}
        >
          <option value="">Forma de pago: todas</option>
          {formasPago.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm text-ink-secondary">
          Desde
          <input
            type="date"
            className={claseSelect}
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-1 text-sm text-ink-secondary">
          Hasta
          <input
            type="date"
            className={claseSelect}
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
          />
        </label>
        <select
          className={claseSelect}
          value={orden}
          onChange={(e) => setOrden(e.target.value as typeof orden)}
        >
          <option value="mora">Orden: mora primero</option>
          <option value="prima">Orden: mayor prima</option>
          <option value="fecha">Orden: fecha máx. pago</option>
        </select>
        {hayFiltros && (
          <button
            onClick={limpiar}
            className="rounded-lg border border-line-axis px-2.5 py-1.5 text-sm text-ink-secondary hover:bg-surface-page"
          >
            Limpiar
          </button>
        )}
        <span className="ml-auto text-sm text-ink-muted">{filtradas.length} pólizas</span>
        <BotonExportar
          nombre="cartera"
          filas={filtradas}
          columnas={[
            { encabezado: "Estado", valor: (p) => p.estado },
            { encabezado: "Días", valor: (p) => p.diasCartera ?? "" },
            { encabezado: "Fecha máx. pago", valor: (p) => fechaCSV(p.fechaMaxPago) },
            { encabezado: "Póliza", valor: (p) => p.numero },
            { encabezado: "Ramo", valor: (p) => p.ramo },
            { encabezado: "Placa", valor: (p) => p.placa ?? "" },
            { encabezado: "Tipo negocio", valor: (p) => p.tipoNegocio ?? "" },
            { encabezado: "Asegurado", valor: (p) => p.asegurado },
            { encabezado: "CC/NIT", valor: (p) => p.ccNit ?? "" },
            { encabezado: "Aseguradora", valor: (p) => p.aseguradora ?? "" },
            { encabezado: "Asesor 1", valor: (p) => p.asesor1 ?? "" },
            { encabezado: "Asesor 2", valor: (p) => p.asesor2 ?? "" },
            { encabezado: "Forma de pago", valor: (p) => p.formaPago ?? "" },
            { encabezado: "Estado de pago", valor: (p) => p.estadoPago ?? "" },
            { encabezado: "Valor cuota", valor: (p) => p.valorCuota ?? "" },
            { encabezado: "Prima neta", valor: (p) => p.primaNeta },
            { encabezado: "Prima total", valor: (p) => p.primaTotal },
            { encabezado: "Vencimiento", valor: (p) => fechaCSV(p.vencimiento) },
            { encabezado: "Celular", valor: (p) => p.celular ?? "" },
            { encabezado: "Correo", valor: (p) => p.correo ?? "" },
            { encabezado: "Observación", valor: (p) => p.notaCartera ?? "" },
          ]}
        />
      </div>
      </PanelFiltros>

      <div className="overflow-x-auto scroll-fino rounded-xl border border-line-grid bg-surface">
        <table className="w-full border-collapse whitespace-nowrap">
          <thead>
            <tr>
              <Th>Estado</Th>
              <Th>Fecha máx. pago</Th>
              <Th>Póliza</Th>
              <Th>Ramo</Th>
              <Th>Tipo negocio</Th>
              <Th>Placa</Th>
              <Th>Asegurado</Th>
              <Th>Teléfono</Th>
              <Th>Aseguradora</Th>
              <Th>Asesor</Th>
              <Th>Forma pago</Th>
              <Th derecha>Prima neta</Th>
              <Th derecha>Prima total</Th>
              <Th>Vencimiento</Th>
              <Th>Observación</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) => (
              <tr key={p.id} className="hover:bg-surface-page">
                <Td>
                  <CarteraBadge estado={p.estado} dias={p.diasCartera} />
                </Td>
                <Td>{fmtFecha(p.fechaMaxPago)}</Td>
                <Td className="font-medium">{p.numero}</Td>
                <Td>{p.ramo}</Td>
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
                  {p.placa ? (
                    <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-[11px] font-semibold tracking-wide">
                      {p.placa}
                    </span>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </Td>
                <Td>
                  <div className="max-w-[220px] truncate" title={p.asegurado}>
                    {p.asegurado}
                  </div>
                  <div className="text-[11px] text-ink-muted">{p.ccNit ?? "—"}</div>
                  {p.notaCartera && (
                    <div className="text-[11px] italic text-[#8a6100]" title={p.notaCartera}>
                      {p.notaCartera}
                    </div>
                  )}
                </Td>
                <Td>
                  <div className="text-xs">{p.celular ?? "—"}</div>
                  {p.correo && (
                    <div
                      className="max-w-[160px] truncate text-[11px] text-ink-muted"
                      title={p.correo}
                    >
                      {p.correo}
                    </div>
                  )}
                </Td>
                <Td>{p.aseguradora ?? "—"}</Td>
                <Td>
                  <div className="text-xs">{p.asesor1 ?? "—"}</div>
                </Td>
                <Td>
                  <div className="text-xs">{p.formaPago ?? "—"}</div>
                  {p.valorCuota != null && p.valorCuota > 0 && (
                    <div className="text-[11px] text-ink-muted tabla-num">
                      Cuota {fmtCOP(p.valorCuota)}
                    </div>
                  )}
                </Td>
                <Td derecha>{fmtCOP(p.primaNeta)}</Td>
                <Td derecha className="font-semibold">
                  {fmtCOP(p.primaTotal)}
                </Td>
                <Td>{fmtFecha(p.vencimiento)}</Td>
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
                    <IconDinero className="h-3.5 w-3.5" />
                    Gestionar
                  </button>
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
          pestaniaInicial="pago"
          onCerrar={() => setGestionando(null)}
          onGuardado={() => {
            setGestionando(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
