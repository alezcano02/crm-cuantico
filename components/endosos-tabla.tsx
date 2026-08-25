"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { fmtCOP, fmtFecha } from "@/lib/format";
import { EndosoEstadoBadge, StatCard, Td, Th } from "@/components/ui";
import { IconMas } from "@/components/icons";
import { BotonExportar } from "@/components/boton-exportar";
import { Paginacion, usePaginacion } from "@/components/paginacion";
import { PanelFiltros } from "@/components/panel-filtros";
import { BuscadorTabla } from "@/components/buscador-tabla";
import { FiltroSeleccion, FichasFiltros } from "@/components/filtro-seleccion";
import {
  BANCOS,
  DIAS_ALERTA_ASEGURADORA,
  DIAS_AVISO_RENOVACION,
  ESTADOS_ABIERTOS,
  ESTADOS_ENDOSO,
  ETIQUETA_ESTADO_ENDOSO,
  TIPOS_CREDITO,
  buscarBanco,
  resumirRevision,
  revisarEndoso,
  type Chequeo,
  type CopropiedadVista,
  type EndosoVista,
  type EstadoEndoso,
  type Resultado,
} from "@/lib/endosos";
import { exigirOk } from "@/lib/respuesta";
import { api } from "@/lib/rutas";

type Pestania = "abiertos" | "represados" | "reprocesos" | "renovar" | "todos";

const PESTANIAS: { id: Pestania; etiqueta: string }[] = [
  { id: "abiertos", etiqueta: "Abiertos" },
  { id: "represados", etiqueta: "Represados" },
  { id: "reprocesos", etiqueta: "Reprocesos" },
  { id: "renovar", etiqueta: "Por renovar" },
  { id: "todos", etiqueta: "Todos" },
];

const CLASE_INPUT =
  "w-full rounded-lg border border-line-axis bg-surface px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none";

const SEMAFORO: Record<Resultado, { punto: string; texto: string; fondo: string; etiqueta: string }> = {
  ok: { punto: "bg-status-good", texto: "text-status-good", fondo: "bg-status-good/10", etiqueta: "Listo" },
  aviso: {
    punto: "bg-status-warning",
    texto: "text-[#8a6100]",
    fondo: "bg-status-warning/15",
    etiqueta: "Revisar",
  },
  bloqueo: {
    punto: "bg-status-critical",
    texto: "text-status-critical",
    fondo: "bg-status-critical/10",
    etiqueta: "No enviar",
  },
};

function normalizarTxt(v: string): string {
  return v.trim().replace(/\s+/g, " ");
}
function opciones(valores: (string | null)[]): string[] {
  return Array.from(
    new Set(valores.filter((v): v is string => !!v).map(normalizarTxt).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "es"));
}

export function EndososTabla({
  endosos,
  copropiedades,
}: {
  endosos: EndosoVista[];
  copropiedades: CopropiedadVista[];
}) {
  const router = useRouter();
  const [pestania, setPestania] = useState<Pestania>("abiertos");
  const [q, setQ] = useState("");
  const [selEstado, setSelEstado] = useState<string[]>([]);
  const [selAseguradora, setSelAseguradora] = useState<string[]>([]);
  const [selCopropiedad, setSelCopropiedad] = useState<string[]>([]);
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<EndosoVista | null>(null);
  const [gestionando, setGestionando] = useState<EndosoVista | null>(null);
  const [verFichas, setVerFichas] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aseguradoras = useMemo(() => opciones(endosos.map((e) => e.aseguradora)), [endosos]);
  const urbanizaciones = useMemo(() => opciones(endosos.map((e) => e.urbanizacion)), [endosos]);
  /*
   * Las fichas se buscan por id en vez de viajar copiadas dentro de cada
   * endoso: con casi dos mil casos históricos, repetir la ficha del edificio en
   * cada fila multiplicaría por diez el peso de la página para no decir nada
   * nuevo.
   */
  const fichas = useMemo(() => new Map(copropiedades.map((c) => [c.id, c])), [copropiedades]);
  const fichaDe = (e: EndosoVista) =>
    e.copropiedadId != null ? (fichas.get(e.copropiedadId) ?? null) : null;

  const filtrados = useMemo(() => {
    let lista = endosos;
    if (pestania === "abiertos")
      lista = lista.filter((e) => ESTADOS_ABIERTOS.includes(e.estado as EstadoEndoso));
    else if (pestania === "represados")
      lista = lista.filter((e) => (e.diasEsperando ?? 0) > DIAS_ALERTA_ASEGURADORA);
    else if (pestania === "reprocesos") lista = lista.filter((e) => e.estado === "REPROCESO");
    else if (pestania === "renovar")
      lista = lista.filter(
        (e) => e.diasParaRenovar != null && e.diasParaRenovar <= DIAS_AVISO_RENOVACION
      );

    if (selEstado.length) lista = lista.filter((e) => selEstado.includes(e.estado));
    if (selAseguradora.length)
      lista = lista.filter((e) => e.aseguradora && selAseguradora.includes(normalizarTxt(e.aseguradora)));
    if (selCopropiedad.length)
      lista = lista.filter((e) => selCopropiedad.includes(normalizarTxt(e.urbanizacion)));

    if (q.trim()) {
      const t = q.trim().toLowerCase();
      lista = lista.filter(
        (e) =>
          e.cliente.toLowerCase().includes(t) ||
          e.urbanizacion.toLowerCase().includes(t) ||
          (e.apartamento ?? "").toLowerCase().includes(t) ||
          (e.cedula ?? "").includes(t) ||
          (e.banco ?? "").toLowerCase().includes(t) ||
          (e.radicado ?? "").toLowerCase().includes(t)
      );
    }

    // En «Por renovar» manda el vencimiento de la póliza: primero lo que ya
    // venció, después lo que está por vencer.
    if (pestania === "renovar") {
      return [...lista].sort((a, b) => (a.diasParaRenovar ?? 9999) - (b.diasParaRenovar ?? 9999));
    }

    /*
     * En el resto manda lo que lleva más tiempo esperando a la aseguradora: es
     * lo que se está enfriando y por lo que llama el cliente. Lo que aún no se
     * ha radicado va después, ordenado por lo más reciente.
     */
    return [...lista].sort((a, b) => {
      const da = a.diasEsperando ?? -1;
      const db = b.diasEsperando ?? -1;
      if (da !== db) return db - da;
      return b.creadoEn.localeCompare(a.creadoEn);
    });
  }, [endosos, pestania, q, selEstado, selAseguradora, selCopropiedad]);

  const totales = useMemo(() => {
    const abiertos = endosos.filter((e) => ESTADOS_ABIERTOS.includes(e.estado as EstadoEndoso));
    return {
      abiertos: abiertos.length,
      represados: endosos.filter((e) => (e.diasEsperando ?? 0) > DIAS_ALERTA_ASEGURADORA).length,
      reprocesos: endosos.filter((e) => e.estado === "REPROCESO").length,
      conBloqueo: abiertos.filter((e) => e.revision === "bloqueo").length,
      porRenovar: endosos.filter(
        (e) => e.diasParaRenovar != null && e.diasParaRenovar <= DIAS_AVISO_RENOVACION
      ).length,
    };
  }, [endosos]);

  const limpiar = () => {
    setSelEstado([]);
    setSelAseguradora([]);
    setSelCopropiedad([]);
    setQ("");
  };
  const grupos = [
    { etiqueta: "Estado", valores: selEstado, onCambiar: setSelEstado },
    { etiqueta: "Aseguradora", valores: selAseguradora, onCambiar: setSelAseguradora },
    { etiqueta: "Copropiedad", valores: selCopropiedad, onCambiar: setSelCopropiedad },
  ];
  const nFiltros = grupos.reduce((n, g) => n + g.valores.length, 0);

  const { visibles, pagina, setPagina, totalPaginas } = usePaginacion(filtrados);

  const guardar = async (url: string, metodo: string, cuerpo: unknown) => {
    try {
      const r = await fetch(api(url), {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      await exigirOk(r, "No se pudo guardar el endoso.");
      setError(null);
      setCreando(false);
      setEditando(null);
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el endoso.");
      return false;
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <StatCard etiqueta="Abiertos" valor={String(totales.abiertos)} detalle="Casos vivos" />
        <StatCard
          etiqueta="Represados"
          valor={String(totales.represados)}
          detalle={`Más de ${DIAS_ALERTA_ASEGURADORA} días esperando a la aseguradora`}
          acento={totales.represados > 0 ? "rojo" : "verde"}
        />
        <StatCard
          etiqueta="En reproceso"
          valor={String(totales.reprocesos)}
          detalle="El banco los devolvió"
          acento={totales.reprocesos > 0 ? "amarillo" : undefined}
        />
        <StatCard
          etiqueta="No enviar aún"
          valor={String(totales.conBloqueo)}
          detalle="La revisión encontró algo que los devolvería"
          acento={totales.conBloqueo > 0 ? "rojo" : "verde"}
        />
        <StatCard
          etiqueta="Por renovar"
          valor={String(totales.porRenovar)}
          detalle={`La póliza del edificio vence en ${DIAS_AVISO_RENOVACION} días o menos`}
          acento={totales.porRenovar > 0 ? "amarillo" : undefined}
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
                pestania === t.id ? "bg-brand text-white" : "text-ink-secondary hover:bg-surface-page"
              )}
            >
              {t.etiqueta}
            </button>
          ))}
        </div>
        <BuscadorTabla valor={q} onCambiar={setQ} marcador="Cliente / copropiedad / apto / banco / radicado" />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            onClick={() => setVerFichas(true)}
            className="rounded-lg border border-line-axis px-3 py-2 text-sm font-medium text-ink-secondary hover:bg-surface-page"
          >
            Copropiedades ({copropiedades.length})
          </button>
          <button
            onClick={() => setCreando(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            <IconMas className="h-4 w-4" />
            Nuevo endoso
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-status-critical/40 bg-status-critical/5 px-3 py-2 text-sm text-status-critical">
          {error}
        </p>
      )}

      <FichasFiltros grupos={grupos} onLimpiarTodo={limpiar} />

      <PanelFiltros activos={nFiltros}>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line-grid bg-white p-3">
          <FiltroSeleccion
            etiqueta="Estado"
            opciones={[...ESTADOS_ENDOSO]}
            valores={selEstado}
            onCambiar={setSelEstado}
          />
          <FiltroSeleccion
            etiqueta="Aseguradora"
            opciones={aseguradoras}
            valores={selAseguradora}
            onCambiar={setSelAseguradora}
            plural="todas"
          />
          <FiltroSeleccion
            etiqueta="Copropiedad"
            opciones={urbanizaciones}
            valores={selCopropiedad}
            onCambiar={setSelCopropiedad}
            plural="todas"
          />
          <BotonExportar
            nombre="endosos"
            filas={filtrados}
            columnas={[
              { encabezado: "Copropiedad", valor: (e) => e.urbanizacion },
              { encabezado: "Apartamento", valor: (e) => e.apartamento ?? "" },
              { encabezado: "Torre", valor: (e) => e.torre ?? "" },
              { encabezado: "Cliente", valor: (e) => e.cliente },
              { encabezado: "Cédula", valor: (e) => e.cedula ?? "" },
              { encabezado: "Dirección", valor: (e) => e.direccion ?? "" },
              { encabezado: "Ciudad", valor: (e) => e.ciudad ?? "" },
              { encabezado: "Valor solicitado", valor: (e) => e.valorSolicitado ?? "" },
              { encabezado: "Banco", valor: (e) => e.banco ?? "" },
              { encabezado: "NIT banco", valor: (e) => e.bancoNit ?? "" },
              { encabezado: "Tipo de crédito", valor: (e) => e.tipoCredito ?? "" },
              { encabezado: "Aseguradora", valor: (e) => e.aseguradora ?? "" },
              { encabezado: "Radicado", valor: (e) => e.radicado ?? "" },
              {
                encabezado: "Enviado a aseguradora",
                valor: (e) => (e.fechaEnvioAseguradora ? new Date(e.fechaEnvioAseguradora) : ""),
              },
              { encabezado: "Días esperando", valor: (e) => e.diasEsperando ?? "" },
              { encabezado: "Días para renovar", valor: (e) => e.diasParaRenovar ?? "" },
              {
                encabezado: "Estado",
                valor: (e) => ETIQUETA_ESTADO_ENDOSO[e.estado as EstadoEndoso] ?? e.estado,
              },
              { encabezado: "Revisión", valor: (e) => SEMAFORO[e.revision].etiqueta },
            ]}
          />
        </div>
      </PanelFiltros>

      <div className="overflow-x-auto scroll-fino rounded-xl border border-line-grid bg-surface">
        <table className="w-full border-collapse whitespace-nowrap">
          <thead>
            <tr>
              <Th>Revisión</Th>
              <Th>Cliente</Th>
              <Th>Copropiedad · Apto</Th>
              <Th>Banco</Th>
              <Th derecha>Valor</Th>
              <Th>Estado</Th>
              <Th derecha>{pestania === "renovar" ? "Renovar" : "Esperando"}</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {visibles.map((e) => {
              const s = SEMAFORO[e.revision];
              const represado = (e.diasEsperando ?? 0) > DIAS_ALERTA_ASEGURADORA;
              return (
                <tr key={e.id} className="hover:bg-surface-page">
                  <Td>
                    <span
                      className={clsx(
                        "inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] font-semibold",
                        s.fondo,
                        s.texto
                      )}
                      title={
                        e.bloqueos > 0
                          ? `${e.bloqueos} punto(s) harían que el banco lo devuelva`
                          : undefined
                      }
                    >
                      <span className={clsx("h-1.5 w-1.5 rounded-full", s.punto)} aria-hidden />
                      {s.etiqueta}
                      {e.bloqueos > 0 ? ` · ${e.bloqueos}` : ""}
                    </span>
                  </Td>
                  <Td className="font-medium">
                    <div className="max-w-[220px] truncate" title={e.cliente}>
                      {e.cliente}
                    </div>
                  </Td>
                  <Td>
                    <div className="max-w-[240px] truncate text-ink-secondary" title={e.urbanizacion}>
                      {e.urbanizacion}
                      {e.apartamento ? ` · ${e.apartamento}` : ""}
                    </div>
                  </Td>
                  <Td>
                    <div className="max-w-[180px] truncate text-ink-secondary" title={e.banco ?? ""}>
                      {e.banco ?? "—"}
                    </div>
                  </Td>
                  <Td derecha>{e.valorSolicitado != null ? fmtCOP(e.valorSolicitado) : "—"}</Td>
                  <Td>
                    <EndosoEstadoBadge estado={e.estado} />
                  </Td>
                  {pestania === "renovar" ? (
                    <Td
                      derecha
                      className={
                        (e.diasParaRenovar ?? 0) < 0
                          ? "font-semibold text-status-critical"
                          : "font-semibold text-[#8a6100]"
                      }
                      title="Cuando vence la póliza del edificio hay que rehacer este endoso"
                    >
                      {e.diasParaRenovar == null
                        ? "—"
                        : e.diasParaRenovar < 0
                          ? `venció hace ${-e.diasParaRenovar} d`
                          : `en ${e.diasParaRenovar} d`}
                    </Td>
                  ) : (
                    <Td
                      derecha
                      className={represado ? "font-semibold text-status-critical" : "text-ink-muted"}
                    >
                      {e.diasEsperando == null ? "—" : `${e.diasEsperando} d`}
                    </Td>
                  )}
                  <Td>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setGestionando(e)}
                        className="rounded-lg bg-brand px-2 py-1 text-xs font-semibold text-white hover:bg-brand-dark"
                      >
                        Gestionar
                      </button>
                      <button
                        onClick={() => setEditando(e)}
                        className="rounded-lg border border-line-axis px-2 py-1 text-xs text-ink-secondary hover:bg-surface-page"
                      >
                        Editar
                      </button>
                    </div>
                  </Td>
                </tr>
              );
            })}
            {filtrados.length === 0 && (
              <tr>
                <Td className="py-6 text-center text-ink-muted" colSpan={8}>
                  No hay endosos que cumplan los filtros.
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
        total={filtrados.length}
        etiqueta="endosos"
      />

      {gestionando && (
        <PanelSeguimiento
          endoso={gestionando}
          copropiedad={fichaDe(gestionando)}
          onCerrar={() => setGestionando(null)}
          onGuardar={guardar}
        />
      )}

      {(creando || editando) && (
        <FormEndoso
          endoso={editando}
          copropiedades={copropiedades}
          onCerrar={() => {
            setCreando(false);
            setEditando(null);
          }}
          onGuardar={guardar}
        />
      )}

      {verFichas && (
        <PanelCopropiedades
          copropiedades={copropiedades}
          onCerrar={() => setVerFichas(false)}
          onGuardar={guardar}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// La revisión
// ---------------------------------------------------------------------------

/**
 * La lista de chequeo, que es lo que de verdad aporta este módulo.
 *
 * Se enseña entera, también lo que está bien: ver ocho verdes da la confianza
 * de radicar sin releer el correo, y esa es justo la decisión que hoy se toma
 * a ojo.
 */
function Revision({ chequeos }: { chequeos: Chequeo[] }) {
  const resumen = resumirRevision(chequeos);
  const s = SEMAFORO[resumen];
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Revisión antes de radicar</h3>
        <span
          className={clsx(
            "inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] font-semibold",
            s.fondo,
            s.texto
          )}
        >
          <span className={clsx("h-1.5 w-1.5 rounded-full", s.punto)} aria-hidden />
          {s.etiqueta}
        </span>
      </div>
      <ul className="max-h-[26rem] space-y-1.5 overflow-y-auto scroll-fino pr-1">
        {chequeos.map((c, i) => {
          const cs = SEMAFORO[c.resultado];
          return (
            <li
              key={i}
              className={clsx(
                "rounded-lg border px-2.5 py-1.5 text-xs",
                c.resultado === "ok"
                  ? "border-line-grid bg-surface"
                  : c.resultado === "aviso"
                    ? "border-status-warning/40 bg-status-warning/5"
                    : "border-status-critical/40 bg-status-critical/5"
              )}
            >
              <div className="flex items-start gap-1.5">
                <span
                  className={clsx("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", cs.punto)}
                  aria-hidden
                />
                <div className="min-w-0">
                  <span className="font-semibold">{c.regla}</span>
                  <p className="text-ink-secondary">{c.mensaje}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-ink-muted">
        Nada de esto impide guardar ni enviar. Solo avisa ahora, en vez de que lo devuelva el banco
        dentro de tres semanas.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alta y edición
// ---------------------------------------------------------------------------

function FormEndoso({
  endoso,
  copropiedades,
  onCerrar,
  onGuardar,
}: {
  endoso: EndosoVista | null;
  copropiedades: CopropiedadVista[];
  onCerrar: () => void;
  onGuardar: (url: string, metodo: string, cuerpo: unknown) => Promise<boolean>;
}) {
  const [f, setF] = useState({
    urbanizacion: endoso?.urbanizacion ?? "",
    copropiedadId: endoso?.copropiedadId != null ? String(endoso.copropiedadId) : "",
    cliente: endoso?.cliente ?? "",
    cedula: endoso?.cedula ?? "",
    cliente2: endoso?.cliente2 ?? "",
    cedula2: endoso?.cedula2 ?? "",
    correoSolicitante: endoso?.correoSolicitante ?? "",
    celular: endoso?.celular ?? "",
    direccion: endoso?.direccion ?? "",
    ciudad: endoso?.ciudad ?? "",
    torre: endoso?.torre ?? "",
    apartamento: endoso?.apartamento ?? "",
    cuartoUtil: endoso?.cuartoUtil ?? "",
    parqueadero: endoso?.parqueadero ?? "",
    coeficiente: endoso?.coeficiente != null ? String(endoso.coeficiente) : "",
    valorSolicitado: endoso?.valorSolicitado != null ? String(endoso.valorSolicitado) : "",
    banco: endoso?.banco ?? "",
    bancoNit: endoso?.bancoNit ?? "",
    tipoCredito: endoso?.tipoCredito ?? "",
    aseguradora: endoso?.aseguradora ?? "",
    numeroPoliza: endoso?.numeroPoliza ?? "",
  });
  const [guardando, setGuardando] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  /**
   * Al elegir el banco de la lista se rellena su NIT oficial.
   *
   * Es la corrección más barata de todas: el NIT mal escrito o el de la
   * entidad equivocada —Davivienda por DAVIbank— es una de las causas
   * habituales de devolución, y aquí desaparece sin que nadie tenga que
   * acordarse de nada.
   */
  const elegirBanco = (nombre: string) => {
    const b = buscarBanco(nombre);
    setF((x) => ({ ...x, banco: nombre, bancoNit: b ? b.nit : x.bancoNit }));
  };

  const copropiedad = useMemo(() => {
    if (f.copropiedadId) return copropiedades.find((c) => String(c.id) === f.copropiedadId) ?? null;
    // Sin elegir todavía, se intenta emparejar por nombre para que la revisión
    // ya diga algo mientras se escribe.
    const n = normalizarTxt(f.urbanizacion).toLowerCase();
    if (!n) return null;
    return (
      copropiedades.find((c) => c.nombre.toLowerCase() === n) ??
      copropiedades.find(
        (c) => c.nombre.toLowerCase().includes(n) || n.includes(c.nombre.toLowerCase())
      ) ??
      null
    );
  }, [f.copropiedadId, f.urbanizacion, copropiedades]);

  const chequeos = useMemo(
    () =>
      revisarEndoso(
        {
          cliente: f.cliente,
          cliente2: f.cliente2,
          cedula: f.cedula,
          correoSolicitante: f.correoSolicitante,
          direccion: f.direccion,
          ciudad: f.ciudad,
          torre: f.torre,
          apartamento: f.apartamento,
          cuartoUtil: f.cuartoUtil,
          parqueadero: f.parqueadero,
          coeficiente: f.coeficiente ? Number(f.coeficiente.replace(",", ".")) : null,
          valorSolicitado: f.valorSolicitado
            ? Number(f.valorSolicitado.replace(/[^\d]/g, "")) || null
            : null,
          banco: f.banco,
          bancoNit: f.bancoNit,
          tipoCredito: f.tipoCredito || null,
        },
        copropiedad
      ),
    [f, copropiedad]
  );

  const enviar = async () => {
    setGuardando(true);
    await onGuardar(
      endoso ? `/api/endosos/${endoso.id}` : "/api/endosos",
      endoso ? "PATCH" : "POST",
      { ...f, copropiedadId: f.copropiedadId ? Number(f.copropiedadId) : null }
    );
    setGuardando(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <div className="mt-8 w-full max-w-5xl rounded-xl border border-line-grid bg-surface p-5 shadow-lg">
        <h2 className="mb-3 text-lg font-semibold">
          {endoso ? "Editar endoso" : "Nuevo endoso"}
        </h2>

        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-ink-secondary">Copropiedad *</span>
                <input
                  className={CLASE_INPUT}
                  value={f.urbanizacion}
                  onChange={(e) => set("urbanizacion", e.target.value)}
                  list="lista-copropiedades"
                  placeholder="Ej: Marsella"
                />
                <datalist id="lista-copropiedades">
                  {copropiedades.map((c) => (
                    <option key={c.id} value={c.nombre} />
                  ))}
                </datalist>
                {copropiedad ? (
                  <span className="mt-1 block text-[11px] text-status-good">
                    Enlazado a la ficha de {copropiedad.nombre}.
                  </span>
                ) : (
                  <span className="mt-1 block text-[11px] text-ink-muted">
                    Sin ficha. Créala en “Copropiedades” para poder verificar paz y salvo y
                    coeficiente.
                  </span>
                )}
              </label>
              <label className="block text-sm">
                <span className="text-ink-secondary">Tipo de crédito</span>
                <select
                  className={CLASE_INPUT}
                  value={f.tipoCredito}
                  onChange={(e) => set("tipoCredito", e.target.value)}
                >
                  <option value="">Sin definir</option>
                  {TIPOS_CREDITO.map((t) => (
                    <option key={t} value={t}>
                      {t === "HIPOTECARIO" ? "Hipotecario" : "Leasing habitacional"}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-ink-secondary">Deudor principal *</span>
                <input className={CLASE_INPUT} value={f.cliente} onChange={(e) => set("cliente", e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="text-ink-secondary">Cédula</span>
                <input className={CLASE_INPUT} value={f.cedula} onChange={(e) => set("cedula", e.target.value)} />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-ink-secondary">Segundo deudor / locatario</span>
                <input className={CLASE_INPUT} value={f.cliente2} onChange={(e) => set("cliente2", e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="text-ink-secondary">Cédula del segundo</span>
                <input className={CLASE_INPUT} value={f.cedula2} onChange={(e) => set("cedula2", e.target.value)} />
              </label>
            </div>

            <div className="rounded-lg border border-line-grid bg-surface-page/60 p-3">
              <p className="etiqueta-marca mb-2 text-[10px] text-ink-muted">
                Dirección — exactamente como figura en el crédito
              </p>
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                  <label className="block text-sm">
                    <span className="text-ink-secondary">Nomenclatura *</span>
                    <input
                      className={CLASE_INPUT}
                      value={f.direccion}
                      onChange={(e) => set("direccion", e.target.value)}
                      placeholder="Calle 54 # 86C - 66"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-ink-secondary">Ciudad *</span>
                    <input
                      className={CLASE_INPUT}
                      value={f.ciudad}
                      onChange={(e) => set("ciudad", e.target.value)}
                      placeholder="Medellín"
                    />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <label className="block text-sm">
                    <span className="text-ink-secondary">Torre / etapa</span>
                    <input className={CLASE_INPUT} value={f.torre} onChange={(e) => set("torre", e.target.value)} />
                  </label>
                  <label className="block text-sm">
                    <span className="text-ink-secondary">Apartamento *</span>
                    <input
                      className={CLASE_INPUT}
                      value={f.apartamento}
                      onChange={(e) => set("apartamento", e.target.value)}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-ink-secondary">Cuarto útil</span>
                    <input
                      className={CLASE_INPUT}
                      value={f.cuartoUtil}
                      onChange={(e) => set("cuartoUtil", e.target.value)}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-ink-secondary">Parqueadero</span>
                    <input
                      className={CLASE_INPUT}
                      value={f.parqueadero}
                      onChange={(e) => set("parqueadero", e.target.value)}
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm sm:col-span-2">
                <span className="text-ink-secondary">Banco / entidad</span>
                <input
                  className={CLASE_INPUT}
                  value={f.banco}
                  onChange={(e) => elegirBanco(e.target.value)}
                  list="lista-bancos"
                />
                <datalist id="lista-bancos">
                  {BANCOS.map((b) => (
                    <option key={b.nit + b.nombre} value={b.nombre} />
                  ))}
                </datalist>
              </label>
              <label className="block text-sm">
                <span className="text-ink-secondary">NIT</span>
                <input className={CLASE_INPUT} value={f.bancoNit} onChange={(e) => set("bancoNit", e.target.value)} />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-ink-secondary">Valor que pide el banco</span>
                <input
                  className={CLASE_INPUT}
                  value={f.valorSolicitado}
                  onChange={(e) => set("valorSolicitado", e.target.value)}
                  placeholder="162.369.194"
                />
              </label>
              <label className="block text-sm">
                <span className="text-ink-secondary">Coeficiente del apto (%)</span>
                <input
                  className={CLASE_INPUT}
                  value={f.coeficiente}
                  onChange={(e) => set("coeficiente", e.target.value)}
                  placeholder="0,36"
                />
                <span className="mt-1 block text-[11px] text-ink-muted">
                  Queda guardado para la próxima vez que este apartamento pida endoso.
                </span>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-ink-secondary">Correo del cliente</span>
                <input
                  className={CLASE_INPUT}
                  value={f.correoSolicitante}
                  onChange={(e) => set("correoSolicitante", e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-ink-secondary">Celular</span>
                <input className={CLASE_INPUT} value={f.celular} onChange={(e) => set("celular", e.target.value)} />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-ink-secondary">Aseguradora</span>
                <input
                  className={CLASE_INPUT}
                  value={f.aseguradora}
                  onChange={(e) => set("aseguradora", e.target.value)}
                  placeholder={copropiedad?.aseguradora ?? "Previsora, Zurich, AXA Colpatria…"}
                />
              </label>
              <label className="block text-sm">
                <span className="text-ink-secondary">Número de póliza</span>
                <input
                  className={CLASE_INPUT}
                  value={f.numeroPoliza}
                  onChange={(e) => set("numeroPoliza", e.target.value)}
                  placeholder={copropiedad?.numeroPoliza ?? ""}
                />
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-line-grid bg-surface-page/60 p-3">
            <Revision chequeos={chequeos} />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCerrar}
            className="rounded-lg border border-line-axis px-3 py-2 text-sm text-ink-secondary hover:bg-surface-page"
          >
            Cancelar
          </button>
          <button
            onClick={enviar}
            disabled={guardando || !f.cliente.trim() || !f.urbanizacion.trim()}
            className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Seguimiento
// ---------------------------------------------------------------------------

/**
 * La bitácora del caso y el sitio donde se mueve de estado.
 *
 * Un endoso que va por el tercer reproceso solo se entiende leyendo qué pidió
 * corregir el banco cada vez, así que lo nuevo se antepone y nunca se borra
 * nada. Mismo criterio que prospectos y siniestros.
 */
function PanelSeguimiento({
  endoso,
  copropiedad,
  onCerrar,
  onGuardar,
}: {
  endoso: EndosoVista;
  copropiedad: CopropiedadVista | null;
  onCerrar: () => void;
  onGuardar: (url: string, metodo: string, cuerpo: unknown) => Promise<boolean>;
}) {
  const [nota, setNota] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [estado, setEstado] = useState(endoso.estado);
  const [radicado, setRadicado] = useState(endoso.radicado ?? "");
  const [guardando, setGuardando] = useState(false);

  const entradas = (endoso.historia ?? "").split("\n\n").filter((x) => x.trim());
  const chequeos = useMemo(() => revisarEndoso(endoso, copropiedad), [endoso, copropiedad]);

  const enviar = async () => {
    setGuardando(true);
    const ok = await onGuardar(`/api/endosos/${endoso.id}`, "PATCH", {
      notaSeguimiento: nota,
      fechaSeguimiento: fecha,
      estado,
      radicado,
    });
    setGuardando(false);
    if (ok) onCerrar();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <div className="mt-8 w-full max-w-4xl rounded-xl border border-line-grid bg-surface p-5 shadow-lg">
        <h2 className="text-lg font-semibold">{endoso.cliente}</h2>
        <p className="mb-4 text-sm text-ink-secondary">
          {endoso.urbanizacion}
          {endoso.apartamento ? ` · Apto ${endoso.apartamento}` : ""}
          {endoso.banco ? ` · ${endoso.banco}` : ""}
          {endoso.valorSolicitado != null ? ` · ${fmtCOP(endoso.valorSolicitado)}` : ""}
          {endoso.diasEsperando != null &&
            ` · ${endoso.diasEsperando} días esperando a la aseguradora`}
          {endoso.diasParaRenovar != null &&
            (endoso.diasParaRenovar < 0
              ? ` · toca renovarlo, la póliza venció hace ${-endoso.diasParaRenovar} días`
              : ` · toca renovarlo en ${endoso.diasParaRenovar} días`)}
        </p>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="text-ink-secondary">¿Qué pasó? *</span>
              <textarea
                rows={4}
                className={CLASE_INPUT}
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Ej: el banco lo devolvió, falta la ciudad en la dirección de riesgo."
              />
              <span className="mt-1 block text-[11px] text-ink-muted">
                Queda con la fecha al comienzo de la historia. No borra lo anterior.
              </span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-ink-secondary">Fecha</span>
                <input
                  type="date"
                  className={CLASE_INPUT}
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-ink-secondary">Estado</span>
                <select
                  className={CLASE_INPUT}
                  value={estado}
                  onChange={(e) => setEstado(e.target.value)}
                >
                  {ESTADOS_ENDOSO.map((s) => (
                    <option key={s} value={s}>
                      {ETIQUETA_ESTADO_ENDOSO[s]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-sm">
              <span className="text-ink-secondary">Radicado ante la aseguradora</span>
              <input
                className={CLASE_INPUT}
                value={radicado}
                onChange={(e) => setRadicado(e.target.value)}
              />
              <span className="mt-1 block text-[11px] text-ink-muted">
                Al ponerlo arranca el reloj de los {DIAS_ALERTA_ASEGURADORA} días.
              </span>
            </label>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Historia</h3>
            {entradas.length === 0 ? (
              <p className="text-sm text-ink-muted">
                Todavía no hay gestiones registradas. La primera que escriba aparecerá aquí.
              </p>
            ) : (
              <ol className="max-h-[26rem] space-y-2 overflow-y-auto scroll-fino border-l border-line-grid pl-3 text-sm">
                {entradas.map((e, i) => {
                  const corte = e.indexOf(" · ");
                  const sello = corte > 0 ? e.slice(0, corte) : null;
                  const texto = corte > 0 ? e.slice(corte + 3) : e;
                  return (
                    <li key={i}>
                      {sello && (
                        <span className="mr-1.5 text-[11px] font-semibold text-ink-muted">{sello}</span>
                      )}
                      <span className="whitespace-pre-wrap">{texto}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <div className="rounded-lg border border-line-grid bg-surface-page/60 p-3">
            <Revision chequeos={chequeos} />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCerrar}
            className="rounded-lg border border-line-axis px-3 py-2 text-sm text-ink-secondary hover:bg-surface-page"
          >
            Cerrar
          </button>
          <button
            onClick={enviar}
            disabled={guardando || !nota.trim()}
            className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Registrar gestión"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fichas de copropiedad
// ---------------------------------------------------------------------------

const ESTADOS_PYS = ["AL DIA", "POR VENCER", "VENCIDO", "SIN PAZ Y SALVO"];

/**
 * La ficha del edificio: lo que hay que saber antes de tramitar cualquier
 * endoso suyo. Se llena una vez y sirve para todos sus apartamentos.
 *
 * Reemplaza las hojas «Importante» y «Consolidado» del Excel, que hoy llevan
 * esto suelto y desactualizado.
 */
function PanelCopropiedades({
  copropiedades,
  onCerrar,
  onGuardar,
}: {
  copropiedades: CopropiedadVista[];
  onCerrar: () => void;
  onGuardar: (url: string, metodo: string, cuerpo: unknown) => Promise<boolean>;
}) {
  const [editando, setEditando] = useState<CopropiedadVista | null>(null);
  const [creando, setCreando] = useState(false);

  if (creando || editando) {
    return (
      <FormCopropiedad
        copropiedad={editando}
        onCerrar={() => {
          setCreando(false);
          setEditando(null);
        }}
        onGuardar={onGuardar}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <div className="mt-8 w-full max-w-4xl rounded-xl border border-line-grid bg-surface p-5 shadow-lg">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Copropiedades</h2>
            <p className="text-sm text-ink-muted">
              Vigencia de la póliza, paz y salvo y valor asegurado del edificio. Es lo que permite
              revisar un endoso antes de radicarlo.
            </p>
          </div>
          <button
            onClick={() => setCreando(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            <IconMas className="h-4 w-4" />
            Nueva
          </button>
        </div>

        <div className="overflow-x-auto scroll-fino rounded-xl border border-line-grid">
          <table className="w-full border-collapse whitespace-nowrap">
            <thead>
              <tr>
                <Th>Copropiedad</Th>
                <Th>Aseguradora</Th>
                <Th>Póliza vence</Th>
                <Th>Paz y salvo</Th>
                <Th derecha>Valor asegurado</Th>
                <Th>Endosos</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {copropiedades.map((c) => (
                <tr key={c.id} className="hover:bg-surface-page">
                  <Td className="font-medium">{c.nombre}</Td>
                  <Td className="text-ink-secondary">{c.aseguradora ?? "—"}</Td>
                  <Td>{c.vigenciaHasta ? fmtFecha(new Date(c.vigenciaHasta)) : "—"}</Td>
                  <Td>
                    {c.pazSalvoVigenteHasta ? fmtFecha(new Date(c.pazSalvoVigenteHasta)) : "—"}
                    {c.pazSalvoEstado ? ` · ${c.pazSalvoEstado}` : ""}
                  </Td>
                  <Td derecha>
                    {c.valorAseguradoTotal != null ? fmtCOP(c.valorAseguradoTotal) : "—"}
                  </Td>
                  <Td>
                    <span
                      className={clsx(
                        "rounded px-1.5 py-0.5 text-[11px] font-semibold",
                        c.admiteEndosos
                          ? "bg-status-good/10 text-status-good"
                          : "bg-status-critical/10 text-status-critical"
                      )}
                      title={c.motivoBloqueo ?? undefined}
                    >
                      {c.admiteEndosos ? "Habilitada" : "Bloqueada"}
                    </span>
                  </Td>
                  <Td>
                    <button
                      onClick={() => setEditando(c)}
                      className="rounded-lg border border-line-axis px-2 py-1 text-xs text-ink-secondary hover:bg-surface-page"
                    >
                      Editar
                    </button>
                  </Td>
                </tr>
              ))}
              {copropiedades.length === 0 && (
                <tr>
                  <Td className="py-6 text-center text-ink-muted" colSpan={7}>
                    Todavía no hay ninguna ficha. Sin ellas, un endoso no se puede revisar contra el
                    paz y salvo ni contra el coeficiente.
                  </Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onCerrar}
            className="rounded-lg border border-line-axis px-3 py-2 text-sm text-ink-secondary hover:bg-surface-page"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function FormCopropiedad({
  copropiedad,
  onCerrar,
  onGuardar,
}: {
  copropiedad: CopropiedadVista | null;
  onCerrar: () => void;
  onGuardar: (url: string, metodo: string, cuerpo: unknown) => Promise<boolean>;
}) {
  const [f, setF] = useState({
    nombre: copropiedad?.nombre ?? "",
    nit: copropiedad?.nit ?? "",
    aseguradora: copropiedad?.aseguradora ?? "",
    numeroPoliza: copropiedad?.numeroPoliza ?? "",
    vigenciaHasta: copropiedad?.vigenciaHasta?.slice(0, 10) ?? "",
    valorAseguradoTotal:
      copropiedad?.valorAseguradoTotal != null ? String(copropiedad.valorAseguradoTotal) : "",
    pazSalvoVigenteHasta: copropiedad?.pazSalvoVigenteHasta?.slice(0, 10) ?? "",
    pazSalvoEstado: copropiedad?.pazSalvoEstado ?? "",
    motivoBloqueo: copropiedad?.motivoBloqueo ?? "",
    nota: copropiedad?.nota ?? "",
  });
  const [admite, setAdmite] = useState(copropiedad?.admiteEndosos ?? true);
  const [guardando, setGuardando] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  const enviar = async () => {
    setGuardando(true);
    const ok = await onGuardar(
      copropiedad ? `/api/copropiedades/${copropiedad.id}` : "/api/copropiedades",
      copropiedad ? "PATCH" : "POST",
      { ...f, admiteEndosos: admite }
    );
    setGuardando(false);
    if (ok) onCerrar();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <div className="mt-10 w-full max-w-2xl rounded-xl border border-line-grid bg-surface p-5 shadow-lg">
        <h2 className="mb-3 text-lg font-semibold">
          {copropiedad ? "Editar copropiedad" : "Nueva copropiedad"}
        </h2>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <label className="block text-sm">
              <span className="text-ink-secondary">Nombre *</span>
              <input className={CLASE_INPUT} value={f.nombre} onChange={(e) => set("nombre", e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="text-ink-secondary">NIT</span>
              <input className={CLASE_INPUT} value={f.nit} onChange={(e) => set("nit", e.target.value)} />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="text-ink-secondary">Aseguradora</span>
              <input
                className={CLASE_INPUT}
                value={f.aseguradora}
                onChange={(e) => set("aseguradora", e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-ink-secondary">Número de póliza</span>
              <input
                className={CLASE_INPUT}
                value={f.numeroPoliza}
                onChange={(e) => set("numeroPoliza", e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-ink-secondary">Vigente hasta</span>
              <input
                type="date"
                className={CLASE_INPUT}
                value={f.vigenciaHasta}
                onChange={(e) => set("vigenciaHasta", e.target.value)}
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="text-ink-secondary">Valor asegurado del edificio completo</span>
            <input
              className={CLASE_INPUT}
              value={f.valorAseguradoTotal}
              onChange={(e) => set("valorAseguradoTotal", e.target.value)}
              placeholder="80.945.125.857"
            />
            <span className="mt-1 block text-[11px] text-ink-muted">
              Es el que se multiplica por el coeficiente del apartamento para saber cuánto le
              corresponde a cada uno.
            </span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-ink-secondary">Paz y salvo vigente hasta</span>
              <input
                type="date"
                className={CLASE_INPUT}
                value={f.pazSalvoVigenteHasta}
                onChange={(e) => set("pazSalvoVigenteHasta", e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-ink-secondary">Estado del paz y salvo</span>
              <select
                className={CLASE_INPUT}
                value={f.pazSalvoEstado}
                onChange={(e) => set("pazSalvoEstado", e.target.value)}
              >
                <option value="">Sin definir</option>
                {ESTADOS_PYS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-line-grid bg-surface-page/60 p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={admite}
              onChange={(e) => setAdmite(e.target.checked)}
            />
            <span>
              <span className="font-medium">Se pueden enviar endosos de este edificio</span>
              <span className="mt-0.5 block text-[11px] text-ink-muted">
                Desmárcalo si la póliza está en renovación, si no cubre áreas privadas o por
                cualquier otro motivo que impida tramitar. Aparecerá en rojo en la revisión.
              </span>
            </span>
          </label>

          {!admite && (
            <label className="block text-sm">
              <span className="text-ink-secondary">¿Por qué está bloqueada?</span>
              <input
                className={CLASE_INPUT}
                value={f.motivoBloqueo}
                onChange={(e) => set("motivoBloqueo", e.target.value)}
                placeholder="La póliza está en proceso de renovación"
              />
            </label>
          )}

          <label className="block text-sm">
            <span className="text-ink-secondary">Nota</span>
            <textarea rows={2} className={CLASE_INPUT} value={f.nota} onChange={(e) => set("nota", e.target.value)} />
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCerrar}
            className="rounded-lg border border-line-axis px-3 py-2 text-sm text-ink-secondary hover:bg-surface-page"
          >
            Cancelar
          </button>
          <button
            onClick={enviar}
            disabled={guardando || !f.nombre.trim()}
            className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
