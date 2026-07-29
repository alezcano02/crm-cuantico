"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { MESES } from "@/lib/constants";
import { fmtFecha } from "@/lib/format";
import { StatCard, Td, Th } from "@/components/ui";
import { BotonExportar } from "@/components/boton-exportar";

export interface CumpleVista {
  asegurado: string;
  ccNit: string | null;
  celular: string | null;
  correo: string | null;
  asesor: string | null;
  ramos: string[];
  nacimiento: string; // ISO
  proximo: string; // ISO
  dias: number;
  edad: number;
  mes: string;
  esPersona: boolean;
}

type Pestania = "mes" | "proximos" | "todos";

const PESTANIAS: { id: Pestania; etiqueta: string }[] = [
  { id: "proximos", etiqueta: "Próximos 30 días" },
  { id: "mes", etiqueta: "Cumplen este mes" },
  { id: "todos", etiqueta: "Todo el año" },
];

function normalizar(v: string): string {
  return v.trim().replace(/\s+/g, " ");
}

export function CumpleanosTabla({
  clientes,
  mesActual,
}: {
  clientes: CumpleVista[];
  mesActual: number; // 0–11
}) {
  // Se abre en "próximos 30 días", que es lo accionable: la vista del mes,
  // si el mes ya va avanzado, se llena de cumpleaños que ya pasaron.
  const [pestania, setPestania] = useState<Pestania>("proximos");
  const [mes, setMes] = useState<string>("");
  const [asesor, setAsesor] = useState("");
  const [incluirEmpresas, setIncluirEmpresas] = useState(false);
  const [q, setQ] = useState("");

  const asesores = useMemo(
    () =>
      Array.from(
        new Set(clientes.map((c) => c.asesor).filter((a): a is string => !!a).map(normalizar))
      ).sort((a, b) => a.localeCompare(b, "es")),
    [clientes]
  );

  const filtrados = useMemo(() => {
    let lista = clientes;
    if (!incluirEmpresas) lista = lista.filter((c) => c.esPersona);
    if (pestania === "mes") {
      lista = lista.filter((c) => c.mes === MESES[mesActual]);
    } else if (pestania === "proximos") {
      lista = lista.filter((c) => c.dias <= 30);
    }
    if (mes) lista = lista.filter((c) => c.mes === mes);
    if (asesor) lista = lista.filter((c) => c.asesor && normalizar(c.asesor) === asesor);
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      lista = lista.filter(
        (c) =>
          c.asegurado.toLowerCase().includes(t) ||
          (c.ccNit ?? "").toLowerCase().includes(t)
      );
    }
    // En la vista por mes se ordena por día del mes; en las demás, por cercanía
    return [...lista].sort((a, b) =>
      pestania === "mes"
        ? new Date(a.nacimiento).getUTCDate() - new Date(b.nacimiento).getUTCDate()
        : a.dias - b.dias
    );
  }, [clientes, pestania, mes, asesor, q, incluirEmpresas, mesActual]);

  const hoy = filtrados.filter((c) => c.dias === 0).length;
  const semana = filtrados.filter((c) => c.dias <= 7).length;
  const empresas = clientes.filter((c) => !c.esPersona).length;

  const claseSelect =
    "rounded-lg border border-line-axis bg-surface px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none";

  const diaMes = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          etiqueta="Cumplen hoy"
          valor={String(hoy)}
          detalle={hoy > 0 ? "¡Hay que felicitar!" : "Nadie cumple hoy"}
          acento={hoy > 0 ? "verde" : undefined}
        />
        <StatCard
          etiqueta="Próximos 7 días"
          valor={String(semana)}
          detalle="Para preparar el saludo"
          acento={semana > 0 ? "amarillo" : undefined}
        />
        <StatCard
          etiqueta="En la vista actual"
          valor={String(filtrados.length)}
          detalle="Clientes con fecha registrada"
        />
        <StatCard
          etiqueta="Empresas y copropiedades"
          valor={String(empresas)}
          detalle="Ocultas salvo que las incluya"
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
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar cliente / CC"
          className={clsx(claseSelect, "min-w-[200px]")}
        />
        <select className={claseSelect} value={mes} onChange={(e) => setMes(e.target.value)}>
          <option value="">Mes: todos</option>
          {MESES.map((m) => (
            <option key={m} value={m}>
              {m.charAt(0) + m.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <select className={claseSelect} value={asesor} onChange={(e) => setAsesor(e.target.value)}>
          <option value="">Asesor: todos</option>
          {asesores.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-ink-secondary">
          <input
            type="checkbox"
            checked={incluirEmpresas}
            onChange={(e) => setIncluirEmpresas(e.target.checked)}
          />
          Incluir empresas y copropiedades
        </label>
        <span className="ml-auto text-sm text-ink-muted">{filtrados.length} clientes</span>
        <BotonExportar
          nombre="cumpleanos"
          filas={filtrados}
          columnas={[
            { encabezado: "Cliente", valor: (c) => c.asegurado },
            { encabezado: "CC/NIT", valor: (c) => c.ccNit ?? "" },
            { encabezado: "Cumpleaños", valor: (c) => diaMes(c.nacimiento) },
            { encabezado: "Fecha nacimiento", valor: (c) => new Date(c.nacimiento) },
            { encabezado: "Edad que cumple", valor: (c) => c.edad },
            { encabezado: "Días para el cumpleaños", valor: (c) => c.dias },
            { encabezado: "Celular", valor: (c) => c.celular ?? "" },
            { encabezado: "Correo", valor: (c) => c.correo ?? "" },
            { encabezado: "Asesor", valor: (c) => c.asesor ?? "" },
            { encabezado: "Ramos", valor: (c) => c.ramos.join(", ") },
            { encabezado: "Tipo", valor: (c) => (c.esPersona ? "PERSONA" : "EMPRESA") },
          ]}
        />
      </div>

      <div className="overflow-x-auto scroll-fino rounded-xl border border-line-grid bg-surface">
        <table className="w-full border-collapse whitespace-nowrap">
          <thead>
            <tr>
              <Th>Cumpleaños</Th>
              <Th>Falta</Th>
              <Th>Cliente</Th>
              <Th derecha>Cumple</Th>
              <Th>Contacto</Th>
              <Th>Asesor</Th>
              <Th>Ramos</Th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((c) => (
              <tr
                key={`${c.asegurado}-${c.nacimiento}`}
                className={clsx(
                  "hover:bg-surface-page",
                  c.dias === 0 && "bg-status-good/5"
                )}
              >
                <Td className="font-medium tabla-num">{diaMes(c.nacimiento)}</Td>
                <Td>
                  {c.dias === 0 ? (
                    <span className="rounded bg-status-good/10 px-1.5 py-0.5 text-xs font-bold text-status-good">
                      ¡Hoy!
                    </span>
                  ) : c.dias <= 7 ? (
                    <span className="text-xs font-semibold text-[#b07800]">
                      en {c.dias} {c.dias === 1 ? "día" : "días"}
                    </span>
                  ) : c.dias > 300 ? (
                    // Falta casi un año: es que ya pasó en este ciclo
                    <span className="text-xs text-ink-muted">ya pasó</span>
                  ) : (
                    <span className="text-xs text-ink-muted">en {c.dias} días</span>
                  )}
                </Td>
                <Td>
                  <div className="max-w-[260px] truncate" title={c.asegurado}>
                    {c.asegurado}
                  </div>
                  <div className="text-[11px] text-ink-muted">
                    {c.ccNit ?? "—"}
                    {!c.esPersona && (
                      <span className="ml-1.5 rounded bg-surface-sunken px-1 py-0.5 font-medium">
                        empresa
                      </span>
                    )}
                  </div>
                </Td>
                <Td derecha className="tabla-num">
                  {c.edad} años
                </Td>
                <Td>
                  <div className="text-xs">
                    {c.celular && <div>{c.celular}</div>}
                    {c.correo && (
                      <div className="max-w-[200px] truncate text-ink-muted" title={c.correo}>
                        {c.correo}
                      </div>
                    )}
                    {!c.celular && !c.correo && (
                      <span className="text-ink-muted">Sin datos de contacto</span>
                    )}
                  </div>
                </Td>
                <Td>
                  <div className="text-xs">{c.asesor ?? "—"}</div>
                </Td>
                <Td>
                  <div className="max-w-[180px] truncate text-xs text-ink-muted">
                    {c.ramos.join(", ")}
                  </div>
                </Td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <Td className="py-6 text-center text-ink-muted" colSpan={7}>
                  No hay cumpleaños que cumplan los filtros.
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
