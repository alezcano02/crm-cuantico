"use client";

import { useEffect, useMemo, useState } from "react";
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
  ASEGURADORAS,
  BANCOS,
  agruparOpciones,
  CASOS_POR_ARCHIVO,
  DIAS_ALERTA_ASEGURADORA,
  DIAS_AVISO_RENOVACION,
  ESTADOS_ABIERTOS,
  ESTADOS_ENDOSO,
  ETIQUETA_ESTADO_ENDOSO,
  TIPOS_CREDITO,
  buscarBanco,
  evaluarRevision,
  revisarEndoso,
  type CampoEndoso,
  type Chequeo,
  type CopropiedadVista,
  type EndosoVista,
  type EstadoEndoso,
  type EstadoRevision,
  type Resultado,
  claveFormatoPorAseguradora,
} from "@/lib/endosos";
import { exigirOk } from "@/lib/respuesta";
import { api } from "@/lib/rutas";

type Pestania = "abiertos" | "problema" | "represados" | "reprocesos" | "renovar" | "todos";

const PESTANIAS: { id: Pestania; etiqueta: string }[] = [
  { id: "abiertos", etiqueta: "Abiertos" },
  { id: "problema", etiqueta: "Con problema" },
  { id: "represados", etiqueta: "Represados" },
  { id: "reprocesos", etiqueta: "Reprocesos" },
  { id: "renovar", etiqueta: "Por renovar" },
  { id: "todos", etiqueta: "Todos" },
];

const CLASE_INPUT =
  "w-full rounded-lg border border-line-axis bg-surface px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none";

const SEMAFORO: Record<Resultado, { punto: string; texto: string; fondo: string }> = {
  ok: { punto: "bg-status-good", texto: "text-status-good", fondo: "bg-status-good/10" },
  aviso: { punto: "bg-status-warning", texto: "text-[#8a6100]", fondo: "bg-status-warning/15" },
  bloqueo: {
    punto: "bg-status-critical",
    texto: "text-status-critical",
    fondo: "bg-status-critical/10",
  },
};

/**
 * Los cuatro estados de la revisión.
 *
 * «Incompleto» va en gris a propósito, no en rojo: que a un caso le falten
 * datos no es una alarma, es trabajo pendiente. Cuando todo lo que faltaba
 * salía en rojo, 39 de los 40 casos abiertos estaban en rojo y el color dejaba
 * de significar nada. El rojo queda solo para lo que de verdad haría que el
 * banco devuelva el endoso.
 */
const REVISION: Record<
  EstadoRevision,
  { etiqueta: string; punto: string; texto: string; fondo: string; borde: string }
> = {
  listo: {
    etiqueta: "Listo",
    punto: "bg-status-good",
    texto: "text-status-good",
    fondo: "bg-status-good/10",
    borde: "border-status-good/40",
  },
  incompleto: {
    etiqueta: "Faltan datos",
    punto: "bg-ink-muted",
    texto: "text-ink-secondary",
    fondo: "bg-surface-page",
    borde: "border-line-axis",
  },
  revisar: {
    etiqueta: "Revisar",
    punto: "bg-status-warning",
    texto: "text-[#8a6100]",
    fondo: "bg-status-warning/15",
    borde: "border-status-warning/40",
  },
  "no-enviar": {
    etiqueta: "No enviar",
    punto: "bg-status-critical",
    texto: "text-status-critical",
    fondo: "bg-status-critical/10",
    borde: "border-status-critical/40",
  },
};

/** El texto del distintivo: el estado más el número que de verdad importa. */
function etiquetaRevision(r: EndosoVista["revision"]): string {
  const base = REVISION[r.estado].etiqueta;
  if (r.estado === "no-enviar") return `${base} · ${r.problemas}`;
  if (r.estado === "revisar") return `${base} · ${r.avisos}`;
  if (r.estado === "incompleto") return `Faltan ${r.faltan}`;
  return base;
}

function DistintivoRevision({
  revision,
  className,
}: {
  revision: EndosoVista["revision"];
  className?: string;
}) {
  const c = REVISION[revision.estado];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] font-semibold",
        c.fondo,
        c.texto,
        className
      )}
      title={
        revision.problemas > 0
          ? `${revision.problemas} punto(s) harían que el banco lo devuelva`
          : revision.faltan > 0
            ? `${revision.faltan} dato(s) por diligenciar`
            : undefined
      }
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", c.punto)} aria-hidden />
      {etiquetaRevision(revision)}
    </span>
  );
}

/**
 * Formatea mientras se escribe: 162369194 → «162.369.194».
 *
 * OJO con los decimales: quitar todo lo que no sea dígito convierte
 * «244906811.6» en «2.449.068.116», diez veces más. Varias planillas traen
 * céntimos, así que primero se redondea. Un endoso se pide en pesos enteros.
 */
function formatearMiles(v: string | number): string {
  if (typeof v === "number") {
    return Number.isFinite(v) ? Math.round(v).toLocaleString("es-CO") : "";
  }
  const d = v.replace(/[^\d]/g, "");
  return d ? Number(d).toLocaleString("es-CO") : "";
}

function normalizarTxt(v: string): string {
  return v.trim().replace(/\s+/g, " ");
}

/**
 * Las situaciones en que puede estar un caso.
 *
 * Antes eran pestañas. Se pasaron a filtro por una razón práctica: las
 * pestañas son excluyentes y obligan a elegir una sola mirada, cuando lo que
 * hace falta a diario es cruzar —«los de Marsella, de Zurich, que ya están
 * listos»—. Como filtro se combinan entre sí y con los demás, y sin nada
 * marcado se ven todos los endosos.
 */
const SITUACIONES = [
  "Abiertos",
  "Listos para enviar",
  "Con problema",
  "Pendientes de paz y salvo",
  "Represados",
  "En reproceso",
  "Por renovar",
] as const;
type Situacion = (typeof SITUACIONES)[number];

function cumpleSituacion(e: EndosoVista, s: Situacion): boolean {
  const abierto = ESTADOS_ABIERTOS.includes(e.estado as EstadoEndoso);
  switch (s) {
    case "Abiertos":
      return abierto;
    case "Listos para enviar":
      return abierto && e.revision.estado === "listo";
    case "Con problema":
      return abierto && (e.revision.estado === "no-enviar" || e.revision.estado === "revisar");
    // Sin certificado de pago al día la aseguradora no emite: son los casos
    // que están parados esperando a la administración del edificio, no a
    // nosotros ni al banco.
    case "Pendientes de paz y salvo":
      return abierto && e.pazSalvoPendiente;
    case "Represados":
      return (e.diasEsperando ?? 0) > DIAS_ALERTA_ASEGURADORA;
    case "En reproceso":
      return e.estado === "REPROCESO";
    case "Por renovar":
      return e.diasParaRenovar != null && e.diasParaRenovar <= DIAS_AVISO_RENOVACION;
  }
}

/** Los endosos entregados al cliente dentro de un mes o de un año concretos. */
function entregadosEn(endosos: EndosoVista[], anio: number, mes?: number): number {
  return endosos.filter((e) => {
    if (!e.fechaEnvioCliente) return false;
    const f = new Date(e.fechaEnvioCliente);
    if (f.getFullYear() !== anio) return false;
    return mes == null || f.getMonth() === mes;
  }).length;
}

export function EndososTabla({
  endosos,
  copropiedades,
}: {
  endosos: EndosoVista[];
  copropiedades: CopropiedadVista[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [selSituacion, setSelSituacion] = useState<string[]>([]);
  const [selEstado, setSelEstado] = useState<string[]>([]);
  const [selAseguradora, setSelAseguradora] = useState<string[]>([]);
  const [selCopropiedad, setSelCopropiedad] = useState<string[]>([]);
  const [creando, setCreando] = useState(false);
  /*
   * Se guarda el id y no el objeto: así, al guardar y refrescar, el panel
   * abierto vuelve a leerse de la lista ya actualizada. Con una copia del
   * objeto había que cerrarlo para ver el cambio, justo cuando lo que uno
   * quiere es comprobar que la revisión ya se puso en verde.
   */
  const [abiertoId, setAbiertoId] = useState<number | null>(null);
  const [verFichas, setVerFichas] = useState(false);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [cambiandoLote, setCambiandoLote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const abierto = abiertoId != null ? (endosos.find((e) => e.id === abiertoId) ?? null) : null;

  /*
   * Las opciones se agrupan por su forma normalizada: «Cantapiedra» y «Canta
   * Piedra» son una sola entrada, y marcarla trae los casos de las dos
   * grafías. Sin esto, filtrar por una perdía en silencio los de la otra.
   */
  const aseguradoras = useMemo(() => agruparOpciones(endosos.map((e) => e.aseguradora)), [endosos]);
  const urbanizaciones = useMemo(
    () => agruparOpciones(endosos.map((e) => e.urbanizacion)),
    [endosos]
  );
  /** De la etiqueta que se ve, todas las grafías que trae detrás. */
  const variantesDe = (grupos: ReturnType<typeof agruparOpciones>, elegidas: string[]) => {
    const set = new Set<string>();
    for (const g of grupos) {
      if (elegidas.includes(g.etiqueta)) for (const v of g.variantes) set.add(normalizarTxt(v));
    }
    return set;
  };
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

    // Varias situaciones marcadas se suman: «represados O en reproceso».
    if (selSituacion.length)
      lista = lista.filter((e) => selSituacion.some((s) => cumpleSituacion(e, s as Situacion)));
    if (selEstado.length) lista = lista.filter((e) => selEstado.includes(e.estado));
    if (selAseguradora.length) {
      const acepta = variantesDe(aseguradoras, selAseguradora);
      lista = lista.filter((e) => e.aseguradora && acepta.has(normalizarTxt(e.aseguradora)));
    }
    if (selCopropiedad.length) {
      const acepta = variantesDe(urbanizaciones, selCopropiedad);
      lista = lista.filter((e) => acepta.has(normalizarTxt(e.urbanizacion)));
    }

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

    // Con «Por renovar» marcado manda el vencimiento de la póliza: primero lo
    // que ya venció, después lo que está por vencer.
    if (selSituacion.length === 1 && selSituacion[0] === "Por renovar") {
      return [...lista].sort((a, b) => (a.diasParaRenovar ?? 9999) - (b.diasParaRenovar ?? 9999));
    }
    // Y con «Represados», lo que lleva más tiempo esperando a la aseguradora.
    if (selSituacion.length === 1 && selSituacion[0] === "Represados") {
      return [...lista].sort((a, b) => (b.diasEsperando ?? -1) - (a.diasEsperando ?? -1));
    }

    /*
     * En todo lo demás mandan los más nuevos. Es lo que se busca al abrir la
     * pantalla: lo que acaba de entrar por correo, que antes quedaba enterrado
     * al fondo detrás de casos de hace meses que llevaban más días esperando.
     */
    return [...lista].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
  }, [endosos, q, selSituacion, selEstado, selAseguradora, selCopropiedad, aseguradoras, urbanizaciones]);

  const totales = useMemo(() => {
    const abiertos = endosos.filter((e) => ESTADOS_ABIERTOS.includes(e.estado as EstadoEndoso));
    const hoy = new Date();
    return {
      abiertos: abiertos.length,
      listos: abiertos.filter((e) => e.revision.estado === "listo").length,
      represados: endosos.filter((e) => (e.diasEsperando ?? 0) > DIAS_ALERTA_ASEGURADORA).length,
      reprocesos: endosos.filter((e) => e.estado === "REPROCESO").length,
      pazSalvo: abiertos.filter((e) => e.pazSalvoPendiente).length,
      porRenovar: endosos.filter(
        (e) => e.diasParaRenovar != null && e.diasParaRenovar <= DIAS_AVISO_RENOVACION
      ).length,
      entregadosMes: entregadosEn(endosos, hoy.getFullYear(), hoy.getMonth()),
      entregadosAnio: entregadosEn(endosos, hoy.getFullYear()),
      mes: hoy.toLocaleDateString("es-CO", { month: "long" }),
      anio: hoy.getFullYear(),
    };
  }, [endosos]);

  const limpiar = () => {
    setSelSituacion([]);
    setSelEstado([]);
    setSelAseguradora([]);
    setSelCopropiedad([]);
    setQ("");
  };
  /** Deja puesta una sola situación: es lo que hacen las tarjetas de arriba. */
  const soloSituacion = (s: Situacion) => {
    limpiar();
    setSelSituacion([s]);
  };
  const grupos = [
    { etiqueta: "Situación", valores: selSituacion, onCambiar: setSelSituacion },
    { etiqueta: "Estado", valores: selEstado, onCambiar: setSelEstado },
    { etiqueta: "Aseguradora", valores: selAseguradora, onCambiar: setSelAseguradora },
    { etiqueta: "Copropiedad", valores: selCopropiedad, onCambiar: setSelCopropiedad },
  ];
  const nFiltros = grupos.reduce((n, g) => n + g.valores.length, 0);

  const { visibles, pagina, setPagina, totalPaginas } = usePaginacion(filtrados);

  // --- Selección para trabajar por lotes ------------------------------------

  const seleccion = useMemo(
    () => filtrados.filter((e) => marcados.has(e.id)),
    [filtrados, marcados]
  );
  const alternar = (id: number) =>
    setMarcados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  /*
   * Marca TODO lo que cumple los filtros, no solo la página que se ve. Es lo
   * que se quiere de verdad: «todos los de Marsella que están listos» suelen
   * ser más de los que caben en una página, y marcarlos página por página es
   * volver al trabajo uno por uno que esto viene a quitar.
   */
  const marcarTodoFiltrado = () => {
    if (seleccion.length === filtrados.length) setMarcados(new Set());
    else setMarcados(new Set(filtrados.map((e) => e.id)));
  };

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
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el endoso.");
      return false;
    }
  };

  return (
    <div className="space-y-4">
      {/* Cada tarjeta es el filtro que anuncia: pulsarla lo deja puesto. */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <StatCard
          etiqueta="Abiertos"
          valor={String(totales.abiertos)}
          detalle={`${totales.listos} listos para enviar`}
          onClick={() => soloSituacion("Abiertos")}
          activo={selSituacion.length === 1 && selSituacion[0] === "Abiertos"}
        />
        {/* Lo único que no es una cola de trabajo sino lo ya hecho: cuántos
            endosos se le entregaron al cliente. En grande el mes, que es el
            ritmo con el que se mide; debajo, el acumulado del año. */}
        <StatCard
          etiqueta="Entregados"
          valor={String(totales.entregadosMes)}
          detalle={
            <>
              en {totales.mes} · <span className="tabla-num">{totales.entregadosAnio}</span> en{" "}
              {totales.anio}
            </>
          }
        />
        <StatCard
          etiqueta="Represados"
          valor={String(totales.represados)}
          detalle={`Más de ${DIAS_ALERTA_ASEGURADORA} días esperando a la aseguradora`}
          acento={totales.represados > 0 ? "rojo" : "verde"}
          onClick={() => soloSituacion("Represados")}
          activo={selSituacion.length === 1 && selSituacion[0] === "Represados"}
        />
        <StatCard
          etiqueta="En reproceso"
          valor={String(totales.reprocesos)}
          detalle="El banco los devolvió"
          acento={totales.reprocesos > 0 ? "amarillo" : undefined}
          onClick={() => soloSituacion("En reproceso")}
          activo={selSituacion.length === 1 && selSituacion[0] === "En reproceso"}
        />
        <StatCard
          etiqueta="Por renovar"
          valor={String(totales.porRenovar)}
          detalle={`La póliza del edificio vence en ${DIAS_AVISO_RENOVACION} días o menos`}
          acento={totales.porRenovar > 0 ? "amarillo" : undefined}
          onClick={() => soloSituacion("Por renovar")}
          activo={selSituacion.length === 1 && selSituacion[0] === "Por renovar"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <BuscadorTabla
          valor={q}
          onCambiar={setQ}
          marcador="Cliente / copropiedad / apto / banco / radicado"
        />
        <FiltroSeleccion
          etiqueta="Situación"
          opciones={[...SITUACIONES]}
          valores={selSituacion}
          onCambiar={setSelSituacion}
          plural="todas"
        />
        <FiltroSeleccion
          etiqueta="Aseguradora"
          opciones={aseguradoras.map((g) => g.etiqueta)}
          valores={selAseguradora}
          onCambiar={setSelAseguradora}
          plural="todas"
        />
        <FiltroSeleccion
          etiqueta="Copropiedad"
          opciones={urbanizaciones.map((g) => g.etiqueta)}
          valores={selCopropiedad}
          onCambiar={setSelCopropiedad}
          plural="todas"
        />
        <FiltroSeleccion
          etiqueta="Estado"
          opciones={[...ESTADOS_ENDOSO]}
          valores={selEstado}
          onCambiar={setSelEstado}
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
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
              { encabezado: "Revisión", valor: (e) => REVISION[e.revision.estado].etiqueta },
              { encabezado: "Problemas", valor: (e) => e.revision.problemas },
              { encabezado: "Datos por llenar", valor: (e) => e.revision.faltan },
            ]}
          />
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
      {aviso && (
        <p className="rounded-lg border border-status-warning/40 bg-status-warning/5 px-3 py-2 text-sm text-[#8a6100]">
          {aviso}
        </p>
      )}

      <FichasFiltros grupos={grupos} onLimpiarTodo={limpiar} />

      <BarraLote
        seleccion={seleccion}
        onLimpiar={() => setMarcados(new Set())}
        onCambiarEstado={() => setCambiandoLote(true)}
        onAviso={setAviso}
        onError={setError}
      />

      <div className="overflow-x-auto scroll-fino rounded-xl border border-line-grid bg-surface">
        <table className="w-full border-collapse whitespace-nowrap">
          <thead>
            <tr>
              <Th className="w-8">
                <input
                  type="checkbox"
                  aria-label="Marcar todos los que cumplen los filtros"
                  title={
                    seleccion.length === filtrados.length && filtrados.length > 0
                      ? "Quitar la marca a todos"
                      : `Marcar los ${filtrados.length} que cumplen los filtros`
                  }
                  checked={filtrados.length > 0 && seleccion.length === filtrados.length}
                  ref={(el) => {
                    if (el)
                      el.indeterminate = seleccion.length > 0 && seleccion.length < filtrados.length;
                  }}
                  onChange={marcarTodoFiltrado}
                  className="h-3.5 w-3.5 cursor-pointer accent-brand"
                />
              </Th>
              <Th>Revisión</Th>
              <Th>Caso</Th>
              <Th>Banco y valor</Th>
              <Th>Estado</Th>
              <Th derecha>
                {selSituacion.length === 1 && selSituacion[0] === "Por renovar"
                  ? "Renovar"
                  : "Esperando"}
              </Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {visibles.map((e) => {
              const represado = (e.diasEsperando ?? 0) > DIAS_ALERTA_ASEGURADORA;
              const marcado = marcados.has(e.id);
              return (
                <tr
                  key={e.id}
                  className={clsx("hover:bg-surface-page", marcado && "bg-brand-50/60")}
                >
                  <Td>
                    <input
                      type="checkbox"
                      aria-label={`Marcar el endoso de ${e.cliente}`}
                      checked={marcado}
                      onChange={() => alternar(e.id)}
                      className="h-3.5 w-3.5 cursor-pointer accent-brand"
                    />
                  </Td>
                  <Td>
                    <DistintivoRevision revision={e.revision} />
                  </Td>
                  {/* Cliente y ubicación en una sola celda: son la misma
                      pregunta —«¿de quién es este caso?»— y separarlas gastaba
                      un ancho que obligaba a desplazar la tabla de lado. */}
                  <Td>
                    <div className="max-w-[260px] truncate font-medium" title={e.cliente}>
                      {e.cliente}
                    </div>
                    <div
                      className="max-w-[260px] truncate text-xs text-ink-muted"
                      title={e.urbanizacion}
                    >
                      {e.urbanizacion}
                      {e.apartamento ? ` · Apto ${e.apartamento}` : ""}
                      {e.aseguradora ? ` · ${e.aseguradora}` : ""}
                    </div>
                  </Td>
                  <Td>
                    <div className="max-w-[190px] truncate text-ink-secondary" title={e.banco ?? ""}>
                      {e.banco ?? <span className="text-ink-muted">Sin banco</span>}
                    </div>
                    <div className="max-w-[190px] truncate text-xs tabla-num text-ink-muted">
                      {e.valorSolicitado != null ? fmtCOP(e.valorSolicitado) : "Sin valor"}
                    </div>
                  </Td>
                  <Td>
                    <EndosoEstadoBadge estado={e.estado} />
                  </Td>
                  {selSituacion.length === 1 && selSituacion[0] === "Por renovar" ? (
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
                  {/* Un solo botón: antes había «Gestionar» y «Editar», dos
                      ventanas distintas con la mitad del contenido repetido, y
                      había que adivinar cuál de las dos tenía lo que uno
                      buscaba. Ahora es una sola con pestañas. */}
                  <Td>
                    <button
                      onClick={() => setAbiertoId(e.id)}
                      className="rounded-lg bg-brand px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-dark"
                    >
                      Abrir
                    </button>
                  </Td>
                </tr>
              );
            })}
            {filtrados.length === 0 && (
              <tr>
                <Td className="py-6 text-center text-ink-muted" colSpan={7}>
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

      {abierto && (
        <PanelEndoso
          /* El formulario se rellena una sola vez al montar. Sin la clave,
             pasar de un caso a otro reutilizaría la instancia y enseñaría los
             datos del anterior. */
          key={abierto.id}
          endoso={abierto}
          copropiedad={fichaDe(abierto)}
          copropiedades={copropiedades}
          onCerrar={() => setAbiertoId(null)}
          onGuardar={guardar}
        />
      )}

      {creando && (
        <FormEndoso
          copropiedades={copropiedades}
          onCerrar={() => setCreando(false)}
          onGuardar={guardar}
        />
      )}

      {cambiandoLote && (
        <CambioEnLote
          seleccion={seleccion}
          onCerrar={() => setCambiandoLote(false)}
          onListo={() => {
            setCambiandoLote(false);
            setMarcados(new Set());
            router.refresh();
          }}
          onError={setError}
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
// Trabajo por lotes
// ---------------------------------------------------------------------------

/**
 * La barra que aparece al marcar casos.
 *
 * Un envío real no es un caso suelto: es «todos los de Marsella que están
 * listos», y se manda una sola planilla con los treinta. Esta barra es la que
 * convierte el trabajo uno por uno en un solo gesto.
 */
function BarraLote({
  seleccion,
  onLimpiar,
  onCambiarEstado,
  onAviso,
  onError,
}: {
  seleccion: EndosoVista[];
  onLimpiar: () => void;
  onCambiarEstado: () => void;
  onAviso: (v: string | null) => void;
  onError: (v: string | null) => void;
}) {
  const [generando, setGenerando] = useState(false);
  if (seleccion.length === 0) return null;

  const aseguradoras = [...new Set(seleccion.map((e) => e.aseguradora ?? "sin asignar"))];
  const copropiedadesSel = [...new Set(seleccion.map((e) => e.urbanizacion))];
  const clave = aseguradoras.length === 1 ? claveFormatoPorAseguradora(seleccion[0].aseguradora) : null;

  // Se avisa ANTES de pulsar, no después de un error: la planilla es de una
  // aseguradora, y Zurich además lleva los datos del edificio arriba.
  const impedimento =
    aseguradoras.length > 1
      ? `Hay ${aseguradoras.length} aseguradoras marcadas (${aseguradoras.join(", ")}). Cada una tiene su planilla.`
      : !clave
        ? `No hay planilla automática para ${aseguradoras[0]}.`
        : clave === "ZURICH" && copropiedadesSel.length > 1
          ? `La planilla de Zurich es de una sola copropiedad y hay ${copropiedadesSel.length} marcadas.`
          : seleccion.length > CASOS_POR_ARCHIVO
            ? `La planilla admite ${CASOS_POR_ARCHIVO} casos y hay ${seleccion.length} marcados. Afina los filtros o divide el envío.`
            : null;

  const generar = async () => {
    setGenerando(true);
    onError(null);
    onAviso(null);
    try {
      const res = await fetch(api("/api/endosos/formato"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: seleccion.map((e) => e.id) }),
      });
      if (!res.ok) {
        const cuerpo = await res.json().catch(() => null);
        onError(cuerpo?.error ?? "No se pudo generar la planilla.");
        return;
      }
      const faltantesHeader = res.headers.get("X-Campos-Faltantes");
      const faltantes: string[] = faltantesHeader
        ? JSON.parse(decodeURIComponent(faltantesHeader))
        : [];
      const disposicion = res.headers.get("Content-Disposition") ?? "";
      const nombre = /filename="([^"]+)"/.exec(disposicion)?.[1] ?? "endosos.xlsx";
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombre;
      a.click();
      URL.revokeObjectURL(url);
      onAviso(
        faltantes.length
          ? `Planilla de ${seleccion.length} caso(s) descargada. Estas columnas quedaron en blanco y hay que llenarlas a mano antes de enviarla: ${faltantes.join(" · ")}.`
          : `Planilla de ${seleccion.length} caso(s) descargada con todos los datos del CRM.`
      );
    } finally {
      setGenerando(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-300 bg-brand-50/60 px-3 py-2">
      <span className="text-sm font-semibold text-brand-dark">
        {seleccion.length} marcado{seleccion.length === 1 ? "" : "s"}
      </span>
      <span className="text-xs text-ink-secondary">
        {copropiedadesSel.length === 1 ? copropiedadesSel[0] : `${copropiedadesSel.length} copropiedades`}
        {" · "}
        {aseguradoras.length === 1 ? aseguradoras[0] : `${aseguradoras.length} aseguradoras`}
      </span>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {impedimento && <span className="text-xs text-[#8a6100]">{impedimento}</span>}
        <button
          onClick={generar}
          disabled={!!impedimento || generando}
          title={impedimento ?? "Descarga una sola planilla con todos los casos marcados"}
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generando ? "Generando…" : `Generar planilla (${seleccion.length})`}
        </button>
        <button
          onClick={onCambiarEstado}
          className="rounded-lg border border-line-axis bg-surface px-3 py-1.5 text-sm font-medium text-ink-secondary hover:border-brand-300 hover:text-brand"
        >
          Cambiar estado
        </button>
        <button
          onClick={onLimpiar}
          className="rounded-lg px-2 py-1.5 text-sm text-ink-muted hover:text-ink"
        >
          Quitar marca
        </button>
      </div>
    </div>
  );
}

/**
 * Mueve de estado y anota la misma gestión en todos los casos marcados.
 *
 * Es el gesto que sigue a mandar la planilla: los treinta casos que iban en
 * ella se radican con el mismo correo, el mismo día y el mismo número.
 */
function CambioEnLote({
  seleccion,
  onCerrar,
  onListo,
  onError,
}: {
  seleccion: EndosoVista[];
  onCerrar: () => void;
  onListo: () => void;
  onError: (v: string | null) => void;
}) {
  const [estado, setEstado] = useState<string>("RADICADO");
  const [nota, setNota] = useState("");
  const [radicado, setRadicado] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [guardando, setGuardando] = useState(false);

  const enviar = async () => {
    setGuardando(true);
    onError(null);
    try {
      const r = await fetch(api("/api/endosos/lote"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: seleccion.map((e) => e.id),
          estado,
          notaSeguimiento: nota,
          radicado,
          fechaSeguimiento: fecha,
        }),
      });
      await exigirOk(r, "No se pudo actualizar el lote.");
      onListo();
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudo actualizar el lote.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Marco ancho="max-w-lg">
      <h2 className="text-lg font-semibold">Cambiar {seleccion.length} endosos</h2>
      <p className="mb-4 text-sm text-ink-secondary">
        Lo que escribas se anota en la historia de cada uno, con su fecha, sin borrar lo anterior.
      </p>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
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
          <label className="block text-sm">
            <span className="text-ink-secondary">Fecha</span>
            <input
              type="date"
              className={CLASE_INPUT}
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="text-ink-secondary">Radicado ante la aseguradora</span>
          <input
            className={CLASE_INPUT}
            value={radicado}
            onChange={(e) => setRadicado(e.target.value)}
            placeholder="El mismo para todo el envío"
          />
          <span className="mt-1 block text-[11px] text-ink-muted">
            Arranca el reloj de los {DIAS_ALERTA_ASEGURADORA} días en los que aún no lo tenían.
          </span>
        </label>

        <label className="block text-sm">
          <span className="text-ink-secondary">¿Qué pasó? *</span>
          <textarea
            rows={3}
            className={CLASE_INPUT}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ej: se envió la planilla de Marsella a Zurich con 12 casos."
          />
        </label>

        <details className="rounded-lg border border-line-grid bg-surface-page/60 p-2 text-xs">
          <summary className="cursor-pointer text-ink-secondary">
            Ver los {seleccion.length} casos que se van a cambiar
          </summary>
          <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto scroll-fino text-ink-muted">
            {seleccion.map((e) => (
              <li key={e.id}>
                {e.urbanizacion}
                {e.apartamento ? ` · ${e.apartamento}` : ""} — {e.cliente}
              </li>
            ))}
          </ul>
        </details>
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
          disabled={guardando || !nota.trim()}
          className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {guardando ? "Guardando…" : `Aplicar a ${seleccion.length}`}
        </button>
      </div>
    </Marco>
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
function Revision({
  chequeos,
  onIrACampo,
}: {
  chequeos: Chequeo[];
  /** Lleva al recuadro que resuelve el punto, si la pantalla puede hacerlo. */
  onIrACampo?: (campo: CampoEndoso) => void;
}) {
  const resumen = evaluarRevision(chequeos);
  const problemas = chequeos.filter((c) => c.categoria === "riesgo" && c.resultado !== "ok");
  const faltas = chequeos.filter((c) => c.categoria === "falta" && c.resultado !== "ok");
  const notas = chequeos.filter((c) => c.categoria === "nota" && c.resultado !== "ok");
  const enOrden = chequeos.filter((c) => c.resultado === "ok");

  const punto = (c: Chequeo, i: number) => (
    <li
      key={`${c.regla}-${i}`}
      className={clsx(
        "rounded-lg border px-2.5 py-1.5 text-xs",
        c.categoria === "falta" || c.categoria === "nota"
          ? "border-line-grid bg-surface"
          : c.resultado === "aviso"
            ? "border-status-warning/40 bg-status-warning/5"
            : "border-status-critical/40 bg-status-critical/5"
      )}
    >
      <div className="flex items-start gap-1.5">
        <span
          className={clsx(
            "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
            c.categoria === "falta" || c.categoria === "nota"
              ? "bg-ink-muted"
              : SEMAFORO[c.resultado].punto
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <span className="font-semibold">{c.regla}</span>
          <p className="text-ink-secondary">{c.mensaje}</p>
          {c.campo && onIrACampo && (
            <button
              type="button"
              onClick={() => onIrACampo(c.campo!)}
              className="mt-1 rounded border border-line-axis bg-surface px-1.5 py-0.5 text-[11px] font-medium text-ink-secondary hover:border-brand-300 hover:text-brand"
            >
              {c.categoria === "falta" ? "Completar" : "Corregir"}
            </button>
          )}
        </div>
      </div>
    </li>
  );

  return (
    <div className="flex min-h-0 flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Revisión antes de radicar</h3>
        <DistintivoRevision revision={resumen} />
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto scroll-fino pr-1">
        {/*
         * Los problemas van primero y separados de lo que falta: un dato que
         * falta se llena en un minuto, un problema cuesta tres semanas de
         * reproceso. Mezclarlos hacía que lo caro se perdiera entre lo barato.
         */}
        {problemas.length > 0 && (
          <div>
            <p className="etiqueta-marca mb-1.5 text-[10px] text-status-critical">
              Esto lo devolvería · {problemas.length}
            </p>
            <ul className="space-y-1.5">{problemas.map(punto)}</ul>
          </div>
        )}

        {faltas.length > 0 && (
          <div>
            <p className="etiqueta-marca mb-1.5 text-[10px] text-ink-muted">
              Falta por llenar · {faltas.length}
            </p>
            <ul className="space-y-1.5">{faltas.map(punto)}</ul>
          </div>
        )}

        {notas.length > 0 && (
          <div>
            <p className="etiqueta-marca mb-1.5 text-[10px] text-ink-muted">
              Para recordar al entregar · {notas.length}
            </p>
            <ul className="space-y-1.5">{notas.map(punto)}</ul>
          </div>
        )}

        {enOrden.length > 0 && (
          <div>
            <p className="etiqueta-marca mb-1.5 text-[10px] text-ink-muted">
              En orden · {enOrden.length}
            </p>
            <ul className="space-y-1">
              {enOrden.map((c, i) => (
                <li key={`ok-${i}`} className="flex items-start gap-1.5 text-[11px]">
                  <span
                    className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-status-good"
                    aria-hidden
                  />
                  <span className="text-ink-muted">
                    <span className="font-medium text-ink-secondary">{c.regla}</span> · {c.mensaje}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <p className="mt-2 shrink-0 text-[11px] text-ink-muted">
        Nada de esto impide guardar ni enviar. Solo avisa ahora, en vez de que lo devuelva el banco
        dentro de tres semanas.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Los datos del caso
// ---------------------------------------------------------------------------

/** El formulario, en texto plano tal como se escribe. */
interface DatosForm {
  urbanizacion: string;
  copropiedadId: string;
  cliente: string;
  cedula: string;
  cliente2: string;
  cedula2: string;
  correoSolicitante: string;
  celular: string;
  direccion: string;
  ciudad: string;
  torre: string;
  apartamento: string;
  cuartoUtil: string;
  parqueadero: string;
  coeficiente: string;
  valorSolicitado: string;
  banco: string;
  bancoNit: string;
  tipoCredito: string;
  aseguradora: string;
  numeroPoliza: string;
}

function datosIniciales(endoso: EndosoVista | null): DatosForm {
  return {
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
    valorSolicitado: endoso?.valorSolicitado != null ? formatearMiles(endoso.valorSolicitado) : "",
    banco: endoso?.banco ?? "",
    bancoNit: endoso?.bancoNit ?? "",
    tipoCredito: endoso?.tipoCredito ?? "",
    aseguradora: endoso?.aseguradora ?? "",
    numeroPoliza: endoso?.numeroPoliza ?? "",
  };
}

/** Lo que el formulario le pasa a la revisión mientras se escribe. */
function aRevisable(f: DatosForm) {
  return {
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
    coeficiente: f.coeficiente ? Number(f.coeficiente.replace(",", ".")) || null : null,
    valorSolicitado: f.valorSolicitado
      ? Number(f.valorSolicitado.replace(/[^\d]/g, "")) || null
      : null,
    banco: f.banco,
    bancoNit: f.bancoNit,
    tipoCredito: f.tipoCredito || null,
  };
}

/** Busca la ficha del edificio por id y, si aún no se ha elegido, por nombre. */
function fichaDelFormulario(
  f: DatosForm,
  copropiedades: CopropiedadVista[]
): CopropiedadVista | null {
  if (f.copropiedadId) return copropiedades.find((c) => String(c.id) === f.copropiedadId) ?? null;
  const n = normalizarTxt(f.urbanizacion).toLowerCase();
  if (!n) return null;
  return (
    copropiedades.find((c) => c.nombre.toLowerCase() === n) ??
    copropiedades.find(
      (c) => c.nombre.toLowerCase().includes(n) || n.includes(c.nombre.toLowerCase())
    ) ??
    null
  );
}

/** Lleva el foco al recuadro que resuelve un punto de la revisión. */
function enfocarCampo(campo: CampoEndoso) {
  // Un tick de margen: si se acaba de cambiar de pestaña, el recuadro todavía
  // no existe en el momento de la pulsación.
  setTimeout(() => {
    const el = document.getElementById(`campo-${campo}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    (el as HTMLInputElement).focus({ preventScroll: true });
  }, 0);
}

/**
 * Botón para marcar «No aplica» de un tirón.
 *
 * La revisión pide que cuarto útil y parqueadero no queden en blanco —un vacío
 * hace dudar al banco de si se olvidó o no existe—, pero escribir «No aplica»
 * a mano en cada caso es justo el tipo de trabajo que hace que la gente lo
 * deje vacío.
 */
function BotonNoAplica({ valor, onPoner }: { valor: string; onPoner: () => void }) {
  if (valor.trim()) return null;
  return (
    <button
      type="button"
      onClick={onPoner}
      className="mt-1 text-[11px] text-ink-muted underline decoration-dotted underline-offset-2 hover:text-brand"
    >
      No aplica
    </button>
  );
}

/**
 * Ficha del edificio en pequeño, dentro del formulario del caso.
 *
 * Lo que sale aquí NO se teclea en cada endoso: la aseguradora, la póliza, la
 * calle y la ciudad son del edificio y las heredan todos sus casos. Se enseñan
 * para poder comprobarlas de un vistazo, y se corrigen en un solo sitio —la
 * ficha— con efecto sobre todos los endosos de esa copropiedad.
 */
function ResumenFicha({
  ficha,
  onEditar,
}: {
  ficha: CopropiedadVista | null;
  onEditar?: () => void;
}) {
  if (!ficha) {
    return (
      <div className="rounded-lg border border-status-warning/40 bg-status-warning/5 p-2.5 text-xs text-[#8a6100]">
        Sin ficha del edificio. Créala en «Copropiedades» y sus datos —aseguradora, póliza,
        dirección y ciudad— se aplicarán solos a todos sus endosos.
      </div>
    );
  }
  const dato = (etq: string, v: string | null | undefined) => (
    <div className="min-w-0">
      <div className="etiqueta-marca text-[10px] text-ink-muted">{etq}</div>
      <div className="truncate text-ink-secondary" title={v ?? ""}>
        {v?.trim() ? v : <span className="text-ink-muted">—</span>}
      </div>
    </div>
  );
  return (
    <div className="rounded-lg border border-line-grid bg-surface-page/60 p-2.5 text-xs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold">Datos del edificio</span>
        {onEditar && (
          <button
            type="button"
            onClick={onEditar}
            className="rounded border border-line-axis bg-surface px-1.5 py-0.5 text-[11px] font-medium text-ink-secondary hover:border-brand-300 hover:text-brand"
          >
            Editar ficha
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {dato("Aseguradora", ficha.aseguradora)}
        {dato("Póliza", ficha.numeroPoliza)}
        {dato("Dirección", ficha.direccion)}
        {dato("Ciudad", ficha.ciudad)}
      </div>
      <p className="mt-2 text-[11px] text-ink-muted">
        Se aplican a todos los endosos de {ficha.nombre}. Cambiarlos aquí los cambia para todos.
        {Object.keys(ficha.coeficientes ?? {}).length > 0 && (
          <>
            {" "}
            El edificio ya sabe el coeficiente de{" "}
            <strong>{Object.keys(ficha.coeficientes).length} apartamento(s)</strong>: se pone solo al
            escribir el número.
          </>
        )}
      </p>
    </div>
  );
}

function CamposEndoso({
  f,
  set,
  copropiedad,
  copropiedades,
  onEditarFicha,
}: {
  f: DatosForm;
  set: (k: keyof DatosForm, v: string) => void;
  copropiedad: CopropiedadVista | null;
  copropiedades: CopropiedadVista[];
  onEditarFicha?: () => void;
}) {
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
    set("banco", nombre);
    if (b) set("bancoNit", b.nit);
  };

  // Cuánto le corresponde al apartamento según el coeficiente, mientras se
  // escribe: ver la cifra al lado evita teclear un 3,6 donde iba un 0,36.
  const coefNum = f.coeficiente ? Number(f.coeficiente.replace(",", ".")) : NaN;
  const corresponde =
    copropiedad?.valorAseguradoTotal != null && Number.isFinite(coefNum) && coefNum > 0
      ? copropiedad.valorAseguradoTotal * (coefNum / 100)
      : null;

  return (
    <div className="space-y-4">
      {/* --- El edificio ---------------------------------------------- */}
      <div className="space-y-2">
        <label className="block text-sm">
          <span className="text-ink-secondary">Copropiedad *</span>
          {/*
            Desplegable y no texto libre: escribirla a mano es de donde salían
            «Cantapiedra» y «Canta Piedra» como dos edificios distintos. Solo
            se admite texto cuando el edificio todavía no tiene ficha.
          */}
          <select
            id="campo-urbanizacion"
            className={CLASE_INPUT}
            value={
              copropiedades.some((c) => c.nombre === f.urbanizacion) ? f.urbanizacion : "__otra__"
            }
            onChange={(e) => {
              if (e.target.value === "__otra__") {
                set("copropiedadId", "");
                return;
              }
              const c = copropiedades.find((x) => x.nombre === e.target.value);
              set("urbanizacion", e.target.value);
              set("copropiedadId", c ? String(c.id) : "");
              // Los datos del edificio se rellenan solos desde su ficha.
              if (c?.direccion) set("direccion", c.direccion);
              if (c?.ciudad) set("ciudad", c.ciudad);
            }}
          >
            <option value="__otra__">— Otra (escribirla) —</option>
            {copropiedades.map((c) => (
              <option key={c.id} value={c.nombre}>
                {c.nombre}
              </option>
            ))}
          </select>
          {!copropiedades.some((c) => c.nombre === f.urbanizacion) && (
            <input
              className={clsx(CLASE_INPUT, "mt-1")}
              value={f.urbanizacion}
              onChange={(e) => set("urbanizacion", e.target.value)}
              placeholder="Nombre del edificio, si aún no tiene ficha"
            />
          )}
        </label>
        <ResumenFicha ficha={copropiedad} onEditar={onEditarFicha} />
      </div>

      {/* --- Quién pide ------------------------------------------------ */}
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <label className="block text-sm">
          <span className="text-ink-secondary">Deudor principal *</span>
          <input
            className={CLASE_INPUT}
            value={f.cliente}
            onChange={(e) => set("cliente", e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Cédula</span>
          <input
            className={CLASE_INPUT}
            value={f.cedula}
            onChange={(e) => set("cedula", e.target.value)}
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-ink-secondary">Correo del cliente</span>
          <input
            id="campo-correoSolicitante"
            type="email"
            className={CLASE_INPUT}
            value={f.correoSolicitante}
            onChange={(e) => set("correoSolicitante", e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Celular</span>
          <input
            className={CLASE_INPUT}
            value={f.celular}
            onChange={(e) => set("celular", e.target.value)}
          />
        </label>
      </div>

      {/* El segundo deudor solo estorba en la mayoría de casos: se despliega. */}
      <details className="rounded-lg border border-line-grid bg-surface-page/40 p-2" open={!!f.cliente2}>
        <summary className="cursor-pointer text-xs text-ink-secondary">
          Segundo deudor o locatario (solo si el crédito es de dos)
        </summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-[2fr_1fr]">
          <label className="block text-sm">
            <span className="text-ink-secondary">Nombre</span>
            <input
              className={CLASE_INPUT}
              value={f.cliente2}
              onChange={(e) => set("cliente2", e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink-secondary">Cédula</span>
            <input
              className={CLASE_INPUT}
              value={f.cedula2}
              onChange={(e) => set("cedula2", e.target.value)}
            />
          </label>
        </div>
      </details>

      {/* --- El inmueble ------------------------------------------------ */}
      <div className="rounded-lg border border-line-grid bg-surface-page/60 p-3">
        <p className="etiqueta-marca mb-2 text-[10px] text-ink-muted">
          El inmueble — la dirección, tal como la escribió el cliente
        </p>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="block text-sm">
            <span className="text-ink-secondary">Apartamento *</span>
            {/*
              Al escribir el apartamento aparece su coeficiente, si el edificio
              ya lo sabe. Es el dato que más cuesta conseguir —sale del
              reglamento de propiedad horizontal— y no cambia nunca, así que
              basta averiguarlo una vez por apartamento.
            */}
            <input
              id="campo-apartamento"
              className={CLASE_INPUT}
              value={f.apartamento}
              onChange={(e) => {
                const apto = e.target.value;
                set("apartamento", apto);
                const conocido = copropiedad?.coeficientes?.[apto.trim()];
                if (conocido != null && !f.coeficiente) set("coeficiente", String(conocido));
              }}
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink-secondary">Torre / etapa</span>
            <input
              id="campo-torre"
              className={CLASE_INPUT}
              value={f.torre}
              onChange={(e) => set("torre", e.target.value)}
            />
            <BotonNoAplica valor={f.torre} onPoner={() => set("torre", "No aplica")} />
          </label>
          <label className="block text-sm">
            <span className="text-ink-secondary">Cuarto útil</span>
            <input
              id="campo-cuartoUtil"
              className={CLASE_INPUT}
              value={f.cuartoUtil}
              onChange={(e) => set("cuartoUtil", e.target.value)}
            />
            <BotonNoAplica valor={f.cuartoUtil} onPoner={() => set("cuartoUtil", "No aplica")} />
          </label>
          <label className="block text-sm">
            <span className="text-ink-secondary">Parqueadero</span>
            <input
              id="campo-parqueadero"
              className={CLASE_INPUT}
              value={f.parqueadero}
              onChange={(e) => set("parqueadero", e.target.value)}
            />
            <BotonNoAplica valor={f.parqueadero} onPoner={() => set("parqueadero", "No aplica")} />
          </label>
        </div>

        {/*
          La dirección es del CASO, no del edificio: la escribe el cliente en su
          correo y es la que el banco compara, letra por letra, contra la
          escritura del crédito. Por eso va visible y no heredada de la ficha.
        */}
        <div className="mt-3 grid gap-3 sm:grid-cols-[2fr_1fr]">
          <label className="block text-sm">
            <span className="text-ink-secondary">Nomenclatura *</span>
            <input
              id="campo-direccion"
              className={CLASE_INPUT}
              value={f.direccion}
              onChange={(e) => set("direccion", e.target.value)}
              placeholder="Como la escribió el cliente"
            />
            {copropiedad?.direccion && !f.direccion && (
              <button
                type="button"
                onClick={() => set("direccion", copropiedad.direccion!)}
                className="mt-1 text-[11px] text-ink-muted underline decoration-dotted underline-offset-2 hover:text-brand"
              >
                Usar la del edificio: {copropiedad.direccion}
              </button>
            )}
          </label>
          <label className="block text-sm">
            <span className="text-ink-secondary">Ciudad *</span>
            <input
              id="campo-ciudad"
              className={CLASE_INPUT}
              value={f.ciudad}
              onChange={(e) => set("ciudad", e.target.value)}
              placeholder={copropiedad?.ciudad ?? "Medellín"}
            />
          </label>
        </div>
      </div>

      {/* --- El crédito -------------------------------------------------- */}
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <label className="block text-sm">
          <span className="text-ink-secondary">Banco / entidad</span>
          {/* Desplegable: el NIT se rellena solo y no hay forma de escribir
              «Davivienda» donde iba DAVIbank, que es la confusión que más
              endosos devuelve. */}
          <select
            id="campo-banco"
            className={CLASE_INPUT}
            value={BANCOS.some((b) => b.nombre === f.banco) ? f.banco : "__otro__"}
            onChange={(e) => {
              if (e.target.value === "__otro__") {
                set("banco", "");
                set("bancoNit", "");
                return;
              }
              elegirBanco(e.target.value);
            }}
          >
            <option value="__otro__">— Otra entidad (escribirla) —</option>
            {BANCOS.map((b) => (
              <option key={b.nit + b.nombre} value={b.nombre}>
                {b.nombre}
              </option>
            ))}
          </select>
          {!BANCOS.some((b) => b.nombre === f.banco) && (
            <input
              className={clsx(CLASE_INPUT, "mt-1")}
              value={f.banco}
              onChange={(e) => elegirBanco(e.target.value)}
              placeholder="Nombre de la entidad"
            />
          )}
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">NIT</span>
          <input
            id="campo-bancoNit"
            className={clsx(CLASE_INPUT, BANCOS.some((b) => b.nombre === f.banco) && "bg-surface-page")}
            value={f.bancoNit}
            onChange={(e) => set("bancoNit", e.target.value)}
            readOnly={BANCOS.some((b) => b.nombre === f.banco)}
            title={
              BANCOS.some((b) => b.nombre === f.banco)
                ? "Lo pone la lista oficial de entidades"
                : undefined
            }
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="text-ink-secondary">Valor que pide el banco</span>
          {/*
           * Se separan los miles mientras se escribe. Es la defensa contra el
           * error de Majagua 1145, donde se pidió el endoso por $61.524: con
           * los puntos puestos, una cifra a la que le faltan dígitos se ve a
           * simple vista.
           */}
          <input
            id="campo-valorSolicitado"
            inputMode="numeric"
            className={CLASE_INPUT}
            value={f.valorSolicitado}
            onChange={(e) => set("valorSolicitado", formatearMiles(e.target.value))}
            placeholder="162.369.194"
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Coeficiente (%)</span>
          <input
            id="campo-coeficiente"
            className={CLASE_INPUT}
            value={f.coeficiente}
            onChange={(e) => set("coeficiente", e.target.value)}
            placeholder="0,36"
          />
          <span className="mt-1 block text-[11px] text-ink-muted">
            {corresponde != null
              ? `Le corresponden ${fmtCOP(Math.round(corresponde))}.`
              : "Lo trae el edificio si ya se sabe el de este apartamento."}
          </span>
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Tipo de crédito</span>
          <select
            id="campo-tipoCredito"
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alta de un caso nuevo
// ---------------------------------------------------------------------------

function FormEndoso({
  copropiedades,
  onCerrar,
  onGuardar,
}: {
  copropiedades: CopropiedadVista[];
  onCerrar: () => void;
  onGuardar: (url: string, metodo: string, cuerpo: unknown) => Promise<boolean>;
}) {
  const [f, setF] = useState<DatosForm>(() => datosIniciales(null));
  const [guardando, setGuardando] = useState(false);
  const set = (k: keyof DatosForm, v: string) => setF((x) => ({ ...x, [k]: v }));

  const copropiedad = useMemo(() => fichaDelFormulario(f, copropiedades), [f, copropiedades]);
  const chequeos = useMemo(() => revisarEndoso(aRevisable(f), copropiedad), [f, copropiedad]);

  const enviar = async () => {
    setGuardando(true);
    await onGuardar("/api/endosos", "POST", {
      ...f,
      copropiedadId: f.copropiedadId ? Number(f.copropiedadId) : null,
    });
    setGuardando(false);
  };

  return (
    <Marco ancho="max-w-5xl">
      <h2 className="mb-3 text-lg font-semibold">Nuevo endoso</h2>
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <CamposEndoso f={f} set={set} copropiedad={copropiedad} copropiedades={copropiedades} />
        <div className="max-h-[32rem] rounded-lg border border-line-grid bg-surface-page/60 p-3">
          <Revision chequeos={chequeos} onIrACampo={enfocarCampo} />
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
    </Marco>
  );
}

// ---------------------------------------------------------------------------
// El caso abierto
// ---------------------------------------------------------------------------

/**
 * El fondo oscuro y la caja blanca, iguales en todas las ventanas del módulo.
 *
 * Pulsar el fondo NO cierra a propósito. Estas ventanas llevan formularios con
 * lo que se acaba de escribir, y un clic despistado fuera de la caja borraría
 * el trabajo sin preguntar. Se cierra con su botón, que es explícito.
 */
function Marco({ children, ancho }: { children: React.ReactNode; ancho: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <div
        className={clsx(
          "mt-8 w-full rounded-xl border border-line-grid bg-surface p-5 shadow-lg",
          ancho
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Todo lo del caso en una sola ventana: los datos, la bitácora y —siempre a la
 * vista, en la columna de la derecha— la revisión.
 *
 * Antes eran dos ventanas, «Gestionar» y «Editar», con la revisión repetida en
 * las dos y la mitad del contenido en cada una. Había que abrir una, cerrarla y
 * abrir la otra para hacer lo que casi siempre es un solo gesto: leer qué está
 * mal y arreglarlo.
 */
function PanelEndoso({
  endoso,
  copropiedad,
  copropiedades,
  onCerrar,
  onGuardar,
}: {
  endoso: EndosoVista;
  copropiedad: CopropiedadVista | null;
  copropiedades: CopropiedadVista[];
  onCerrar: () => void;
  onGuardar: (url: string, metodo: string, cuerpo: unknown) => Promise<boolean>;
}) {
  const [tab, setTab] = useState<"datos" | "seguimiento">("datos");
  const [f, setF] = useState<DatosForm>(() => datosIniciales(endoso));
  const set = (k: keyof DatosForm, v: string) => setF((x) => ({ ...x, [k]: v }));
  /*
   * La ficha del edificio se edita sin salir del caso. Es lo que hace que
   * corregir una dirección mal escrita valga para los cien endosos de ese
   * edificio y no solo para el que se tiene delante.
   */
  const [editandoFicha, setEditandoFicha] = useState<CopropiedadVista | null>(null);

  const [nota, setNota] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [estado, setEstado] = useState(endoso.estado);
  const [radicado, setRadicado] = useState(endoso.radicado ?? "");
  const [guardando, setGuardando] = useState(false);

  const [descargando, setDescargando] = useState(false);
  const [faltantesFormato, setFaltantesFormato] = useState<string[] | null>(null);
  const [errorFormato, setErrorFormato] = useState<string | null>(null);

  const ficha = useMemo(
    () => fichaDelFormulario(f, copropiedades) ?? copropiedad,
    [f, copropiedades, copropiedad]
  );
  const chequeos = useMemo(() => revisarEndoso(aRevisable(f), ficha), [f, ficha]);
  /*
   * La bitácora se pide al abrir la ventana: no viaja en el listado porque es
   * el campo que más crece y solo se mira aquí. `null` mientras llega.
   */
  const [historia, setHistoria] = useState<string | null>(null);
  useEffect(() => {
    let vigente = true;
    setHistoria(null);
    fetch(api(`/api/endosos/${endoso.id}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (vigente) setHistoria(j?.endoso?.historia ?? "");
      })
      .catch(() => {
        if (vigente) setHistoria("");
      });
    return () => {
      vigente = false;
    };
    // `ultimoSeguimiento` cambia al registrar una gestión: así se recarga.
  }, [endoso.id, endoso.ultimoSeguimiento]);

  const entradas = (historia ?? "").split("\n\n").filter((x) => x.trim());
  const claveFormato = claveFormatoPorAseguradora(f.aseguradora);

  const irACampo = (campo: CampoEndoso) => {
    setTab("datos");
    enfocarCampo(campo);
  };

  const guardarDatos = async () => {
    setGuardando(true);
    await onGuardar(`/api/endosos/${endoso.id}`, "PATCH", {
      ...f,
      copropiedadId: f.copropiedadId ? Number(f.copropiedadId) : null,
    });
    setGuardando(false);
  };

  const registrarGestion = async () => {
    setGuardando(true);
    const ok = await onGuardar(`/api/endosos/${endoso.id}`, "PATCH", {
      notaSeguimiento: nota,
      fechaSeguimiento: fecha,
      estado,
      radicado,
    });
    setGuardando(false);
    if (ok) setNota("");
  };

  const descargarFormato = async () => {
    setDescargando(true);
    setErrorFormato(null);
    setFaltantesFormato(null);
    try {
      const res = await fetch(api(`/api/endosos/${endoso.id}/formato`));
      if (!res.ok) {
        const cuerpo = await res.json().catch(() => null);
        setErrorFormato(cuerpo?.error ?? "No se pudo generar el formato.");
        return;
      }
      const faltantesHeader = res.headers.get("X-Campos-Faltantes");
      if (faltantesHeader) setFaltantesFormato(JSON.parse(decodeURIComponent(faltantesHeader)));
      const disposicion = res.headers.get("Content-Disposition") ?? "";
      const nombre = /filename="([^"]+)"/.exec(disposicion)?.[1] ?? "endoso.xlsx";
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombre;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDescargando(false);
    }
  };

  return (
    <Marco ancho="max-w-6xl">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{endoso.cliente}</h2>
          <p className="text-sm text-ink-secondary">
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
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {claveFormato ? (
            <button
              onClick={descargarFormato}
              disabled={descargando}
              className="rounded-lg border border-line-axis px-3 py-2 text-sm font-medium text-ink-secondary hover:border-brand-300 hover:text-brand disabled:opacity-50"
            >
              {descargando ? "Generando…" : `Generar formato ${f.aseguradora}`}
            </button>
          ) : (
            <span className="max-w-[16rem] text-right text-[11px] text-ink-muted">
              {f.aseguradora
                ? `Sin formato automático para “${f.aseguradora}”.`
                : "Asigna una aseguradora para generar su formato."}
            </span>
          )}
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-lg border border-line-axis px-2.5 py-2 text-sm text-ink-secondary hover:bg-surface-page"
          >
            ✕
          </button>
        </div>
      </div>

      {faltantesFormato && (
        <p className="mb-3 rounded-lg border border-status-warning/40 bg-status-warning/5 p-2 text-xs text-[#8a6100]">
          {faltantesFormato.length === 0
            ? "El formato se generó con todos los datos del caso."
            : `Se descargó, pero estos campos quedaron en blanco y hay que llenarlos a mano antes de enviarlo: ${faltantesFormato.join(
                " · "
              )}.`}
        </p>
      )}
      {errorFormato && (
        <p className="mb-3 rounded-lg border border-status-critical/40 bg-status-critical/5 p-2 text-xs text-status-critical">
          {errorFormato}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="min-w-0">
          <div className="mb-3 flex gap-1 rounded-lg border border-line-grid bg-surface p-1">
            {(
              [
                { id: "datos", etiqueta: "Datos" },
                {
                  id: "seguimiento",
                  etiqueta: historia == null ? "Seguimiento" : `Seguimiento (${entradas.length})`,
                },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={clsx(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  tab === t.id ? "bg-brand text-white" : "text-ink-secondary hover:bg-surface-page"
                )}
              >
                {t.etiqueta}
              </button>
            ))}
          </div>

          {tab === "datos" ? (
            <CamposEndoso
              f={f}
              set={set}
              copropiedad={ficha}
              copropiedades={copropiedades}
              onEditarFicha={ficha ? () => setEditandoFicha(ficha) : undefined}
            />
          ) : (
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="text-ink-secondary">¿Qué pasó? *</span>
                <textarea
                  rows={3}
                  className={CLASE_INPUT}
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="Ej: el banco lo devolvió, falta la ciudad en la dirección de riesgo."
                />
                <span className="mt-1 block text-[11px] text-ink-muted">
                  Queda con la fecha al comienzo de la historia. No borra lo anterior.
                </span>
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
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
                <label className="block text-sm">
                  <span className="text-ink-secondary">Radicado</span>
                  <input
                    className={CLASE_INPUT}
                    value={radicado}
                    onChange={(e) => setRadicado(e.target.value)}
                  />
                  <span className="mt-1 block text-[11px] text-ink-muted">
                    Arranca el reloj de los {DIAS_ALERTA_ASEGURADORA} días.
                  </span>
                </label>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold">Historia</h3>
                {historia == null ? (
                  <p className="text-sm text-ink-muted">Cargando la historia…</p>
                ) : entradas.length === 0 ? (
                  <p className="text-sm text-ink-muted">
                    Todavía no hay gestiones registradas. La primera que escriba aparecerá aquí.
                  </p>
                ) : (
                  <ol className="max-h-[18rem] space-y-2 overflow-y-auto scroll-fino border-l border-line-grid pl-3 text-sm">
                    {entradas.map((e, i) => {
                      const corte = e.indexOf(" · ");
                      const sello = corte > 0 ? e.slice(0, corte) : null;
                      const texto = corte > 0 ? e.slice(corte + 3) : e;
                      return (
                        <li key={i}>
                          {sello && (
                            <span className="mr-1.5 text-[11px] font-semibold text-ink-muted">
                              {sello}
                            </span>
                          )}
                          <span className="whitespace-pre-wrap">{texto}</span>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            </div>
          )}
        </div>

        {/* La revisión no es una pestaña: es lo que hay que tener delante
            mientras se corrige, en las dos pestañas. */}
        <div className="max-h-[34rem] rounded-lg border border-line-grid bg-surface-page/60 p-3">
          <Revision chequeos={chequeos} onIrACampo={irACampo} />
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onCerrar}
          className="rounded-lg border border-line-axis px-3 py-2 text-sm text-ink-secondary hover:bg-surface-page"
        >
          Cerrar
        </button>
        {tab === "datos" ? (
          <button
            onClick={guardarDatos}
            disabled={guardando || !f.cliente.trim() || !f.urbanizacion.trim()}
            className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar datos"}
          </button>
        ) : (
          <button
            onClick={registrarGestion}
            disabled={guardando || !nota.trim()}
            className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Registrar gestión"}
          </button>
        )}
      </div>

      {editandoFicha && (
        <FormCopropiedad
          copropiedad={editandoFicha}
          onCerrar={() => setEditandoFicha(null)}
          onGuardar={async (url, metodo, cuerpo) => {
            const ok = await onGuardar(url, metodo, cuerpo);
            if (ok) setEditandoFicha(null);
            return ok;
          }}
        />
      )}
    </Marco>
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
    direccion: copropiedad?.direccion ?? "",
    ciudad: copropiedad?.ciudad ?? "",
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

          {/* La calle y la ciudad viven aquí y no en cada endoso: son del
              edificio, y puestas una vez quedan bien en todos sus casos. */}
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <label className="block text-sm">
              <span className="text-ink-secondary">Dirección del edificio</span>
              <input
                className={CLASE_INPUT}
                value={f.direccion}
                onChange={(e) => set("direccion", e.target.value)}
                placeholder="Calle 54 # 86C - 66"
              />
              <span className="mt-1 block text-[11px] text-ink-muted">
                La heredan todos los endosos de esta copropiedad.
              </span>
            </label>
            <label className="block text-sm">
              <span className="text-ink-secondary">Ciudad</span>
              <input
                className={CLASE_INPUT}
                value={f.ciudad}
                onChange={(e) => set("ciudad", e.target.value)}
                placeholder="Medellín"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="text-ink-secondary">Aseguradora</span>
              <input
                className={CLASE_INPUT}
                value={f.aseguradora}
                onChange={(e) => set("aseguradora", e.target.value)}
                list="lista-aseguradoras"
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
