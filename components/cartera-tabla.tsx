"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { EstadoCartera } from "@/lib/calculos";
import { fmtCOP, fmtCOPCompact, fmtFecha } from "@/lib/format";
import { MESES } from "@/lib/constants";
import { CarteraBadge, StatCard, Td, Th } from "@/components/ui";
import { IconCancelar, IconDinero } from "@/components/icons";
import { DialogoCancelar } from "@/components/acciones-poliza";

export interface CarteraVista {
  id: number;
  numero: string;
  ramo: string;
  asegurado: string;
  ccNit: string | null;
  aseguradora: string | null;
  asesor1: string | null;
  asesor2: string | null;
  primaNeta: number;
  primaTotal: number;
  formaPago: string | null;
  estadoPago: string | null;
  fechaPago: string | null;
  fechaMaxPago: string | null;
  vencimiento: string | null;
  correo: string | null;
  celular: string | null;
  estado: EstadoCartera;
  diasCartera: number | null;
}

type Pestania = "pendientes" | "mora" | "todas";

const PESTANIAS: { id: Pestania; etiqueta: string }[] = [
  { id: "pendientes", etiqueta: "Pendientes de cobro" },
  { id: "mora", etiqueta: "En mora" },
  { id: "todas", etiqueta: "Toda la cartera" },
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

export function CarteraTabla({ polizas }: { polizas: CarteraVista[] }) {
  const router = useRouter();
  const [pestania, setPestania] = useState<Pestania>("pendientes");
  const [ramo, setRamo] = useState("");
  const [aseguradora, setAseguradora] = useState("");
  const [asesor, setAsesor] = useState("");
  const [mes, setMes] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [q, setQ] = useState("");
  const [orden, setOrden] = useState<"mora" | "prima" | "fecha">("mora");
  const [ocupada, setOcupada] = useState<number | null>(null);
  const [cancelando, setCancelando] = useState<CarteraVista | null>(null);

  const ramos = useMemo(() => opciones(polizas.map((p) => p.ramo)), [polizas]);
  const aseguradoras = useMemo(() => opciones(polizas.map((p) => p.aseguradora)), [polizas]);
  const asesores = useMemo(
    () => opciones(polizas.flatMap((p) => [p.asesor1, p.asesor2])),
    [polizas]
  );

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
    if (mes)
      lista = lista.filter(
        (p) => p.fechaMaxPago && Number(p.fechaMaxPago.slice(5, 7)) === Number(mes)
      );
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
  }, [polizas, pestania, ramo, aseguradora, asesor, mes, desde, hasta, q, orden]);

  // Totales sobre lo filtrado (prima total = lo que se cobra al cliente)
  const resumen = useMemo(() => {
    let pendiente = 0,
      mora = 0,
      porCobrar = 0,
      recaudado = 0,
      nMora = 0,
      nPend = 0;
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

  const registrarPago = async (p: CarteraVista, pagada: boolean) => {
    setOcupada(p.id);
    try {
      await fetch(`/api/policies/${p.id}/pago`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pagada }),
      });
      router.refresh();
    } finally {
      setOcupada(null);
    }
  };

  const limpiar = () => {
    setRamo("");
    setAseguradora("");
    setAsesor("");
    setMes("");
    setDesde("");
    setHasta("");
    setQ("");
  };

  const claseSelect =
    "rounded-md border border-line-axis bg-white px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none";
  const hayFiltros = ramo || aseguradora || asesor || mes || desde || hasta || q;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
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

      <div className="flex flex-wrap gap-1 rounded-lg border border-line-grid bg-white p-1">
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

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar póliza / asegurado / NIT"
          className={clsx(claseSelect, "min-w-[220px]")}
        />
        <select className={claseSelect} value={ramo} onChange={(e) => setRamo(e.target.value)}>
          <option value="">Ramo: todos</option>
          {ramos.map((r) => (
            <option key={r}>{r}</option>
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
        <select className={claseSelect} value={mes} onChange={(e) => setMes(e.target.value)}>
          <option value="">Mes pago: todos</option>
          {MESES.map((m, i) => (
            <option key={m} value={i + 1}>
              {m.charAt(0) + m.slice(1).toLowerCase()}
            </option>
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
            className="rounded-md border border-line-axis px-2.5 py-1.5 text-sm text-ink-secondary hover:bg-surface-page"
          >
            Limpiar
          </button>
        )}
        <span className="ml-auto text-sm text-ink-muted">{filtradas.length} pólizas</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line-grid bg-surface">
        <table className="w-full border-collapse whitespace-nowrap">
          <thead>
            <tr>
              <Th>Estado</Th>
              <Th>Fecha máx. pago</Th>
              <Th>Póliza</Th>
              <Th>Ramo</Th>
              <Th>Asegurado</Th>
              <Th>Aseguradora</Th>
              <Th>Asesor</Th>
              <Th>Forma pago</Th>
              <Th derecha>Prima total</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {filtradas.map((p) => (
              <tr key={p.id} className="hover:bg-surface-page">
                <Td>
                  <CarteraBadge estado={p.estado} dias={p.diasCartera} />
                </Td>
                <Td>{fmtFecha(p.fechaMaxPago)}</Td>
                <Td className="font-medium">{p.numero}</Td>
                <Td>{p.ramo}</Td>
                <Td>
                  <div className="max-w-[220px] truncate" title={p.asegurado}>
                    {p.asegurado}
                  </div>
                  {p.celular && <div className="text-[11px] text-ink-muted">{p.celular}</div>}
                </Td>
                <Td>{p.aseguradora ?? "—"}</Td>
                <Td>
                  <div className="text-xs">{p.asesor1 ?? "—"}</div>
                </Td>
                <Td>
                  <div className="text-xs">{p.formaPago ?? "—"}</div>
                </Td>
                <Td derecha className="font-semibold">
                  {fmtCOP(p.primaTotal)}
                </Td>
                <Td>
                  <div className="flex items-center gap-1.5">
                    {p.estado === "PAGADA" ? (
                      <button
                        onClick={() => registrarPago(p, false)}
                        disabled={ocupada === p.id}
                        className="text-xs text-ink-muted hover:text-status-critical hover:underline disabled:opacity-50"
                      >
                        Revertir
                      </button>
                    ) : (
                      <button
                        onClick={() => registrarPago(p, true)}
                        disabled={ocupada === p.id}
                        className="inline-flex items-center gap-1 rounded border border-status-good/50 px-2 py-0.5 text-xs font-medium text-status-good hover:bg-status-good/5 disabled:opacity-50"
                      >
                        <IconDinero className="h-3.5 w-3.5" />
                        {ocupada === p.id ? "…" : "Registrar pago"}
                      </button>
                    )}
                    <button
                      onClick={() => setCancelando(p)}
                      title="Cancelar / no renovar"
                      className="inline-flex items-center gap-1 rounded border border-status-critical/40 px-2 py-0.5 text-xs font-medium text-status-critical hover:bg-status-critical/5"
                    >
                      <IconCancelar className="h-3.5 w-3.5" />
                      Cancelar
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
            {filtradas.length === 0 && (
              <tr>
                <Td className="py-6 text-center text-ink-muted" colSpan={10}>
                  No hay pólizas que cumplan los filtros.
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {cancelando && (
        <DialogoCancelar
          poliza={cancelando}
          onCerrar={() => setCancelando(null)}
          onGuardado={() => {
            setCancelando(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
