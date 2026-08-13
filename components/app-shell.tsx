"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import {
  IconBuscar,
  IconCalendario,
  IconCartera,
  IconDashboard,
  IconDinero,
  IconHistorial,
  IconImportar,
  IconPersonas,
  IconRegalo,
  IconSiniestro,
  IconTendencia,
} from "@/components/icons";
import { LogoCompleto } from "@/components/logo";
import { BotonBusquedaRapida, BusquedaRapida } from "@/components/busqueda-rapida";
import { api } from "@/lib/rutas";

export interface ContadoresNav {
  /** Pólizas vencidas pendientes de renovar */
  vencidas: number;
  /** Pólizas con el pago vencido */
  mora: number;
}

type Enlace = {
  href: string;
  etiqueta: string;
  Icono: (p: { className?: string }) => JSX.Element;
  contador?: keyof ContadoresNav;
  /** true = solo para quien puede importar. */
  soloImportador?: boolean;
  /** true = solo para quien ve comisiones. */
  soloComisiones?: boolean;
  /** true = solo para quien gestiona colectivas. */
  soloColectivas?: boolean;
};

/**
 * El menú vuelve a la columna izquierda, agrupado por secciones.
 *
 * En una sola fila horizontal los diez enlaces caben pero no se pueden agrupar,
 * y sin grupos hay que leerlos todos para encontrar uno. En vertical el título
 * de sección hace de índice. Los grupos son los mismos de antes de que el menú
 * pasara al encabezado, para no obligar a reaprender dónde está cada cosa.
 *
 * Los filtros de cada módulo ya no comparten esta columna: se pliegan sobre la
 * tabla (ver components/panel-filtros.tsx), que además le devuelve ancho a la
 * tabla, que es donde hacía falta.
 */
const GRUPOS: { titulo: string; enlaces: Enlace[] }[] = [
  {
    titulo: "Análisis",
    enlaces: [
      { href: "/", etiqueta: "Dashboard", Icono: IconDashboard },
      { href: "/seguimiento", etiqueta: "Seguimiento", Icono: IconTendencia },
      { href: "/asesores", etiqueta: "Asesores", Icono: IconPersonas },
    ],
  },
  {
    titulo: "Operación",
    enlaces: [
      {
        href: "/vencimientos",
        etiqueta: "Vencimientos",
        Icono: IconCalendario,
        contador: "vencidas",
      },
      { href: "/cartera", etiqueta: "Cartera", Icono: IconCartera, contador: "mora" },
      { href: "/cancelaciones", etiqueta: "Cancelaciones", Icono: IconHistorial },
      { href: "/siniestros", etiqueta: "Siniestros", Icono: IconSiniestro },
      { href: "/cumpleanos", etiqueta: "Cumpleaños", Icono: IconRegalo },
      {
        href: "/colectivas",
        etiqueta: "Colectivas",
        Icono: IconPersonas,
        soloColectivas: true,
      },
    ],
  },
  {
    titulo: "Datos",
    enlaces: [
      { href: "/prospectos", etiqueta: "Prospectos", Icono: IconPersonas },
      { href: "/buscar", etiqueta: "Búsqueda", Icono: IconBuscar },
      {
        href: "/comisiones",
        etiqueta: "Comisiones",
        Icono: IconDinero,
        soloComisiones: true,
      },
      {
        href: "/importar",
        etiqueta: "Importar datos",
        Icono: IconImportar,
        soloImportador: true,
      },
    ],
  },
];

export interface SesionVista {
  usuario: string;
  nombre: string | null;
  /** Si no puede importar, el enlace ni siquiera se dibuja. */
  puedeImportar?: boolean;
  /** Ídem con comisiones: es información de remuneración. */
  puedeVerComisiones?: boolean;
  /** Ídem con colectivas. */
  puedeVerColectivas?: boolean;
}

export function AppShell({
  contadores,
  sesion,
  children,
}: {
  contadores: ContadoresNav;
  sesion?: SesionVista;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [colapsado, setColapsado] = useState(false);

  /*
   * El estado del menú se recuerda entre pantallas y entre sesiones: quien
   * trabaja todo el día en la tabla de cartera lo pliega una vez y no quiere
   * volver a hacerlo en cada navegación.
   *
   * Se lee después de montar y no durante el primer render porque en el
   * servidor no existe localStorage; leerlo allí rompería la hidratación.
   */
  useEffect(() => {
    setColapsado(localStorage.getItem("menu-colapsado") === "1");
  }, []);
  const alternarColapso = () => {
    setColapsado((v) => {
      localStorage.setItem("menu-colapsado", v ? "0" : "1");
      return !v;
    });
  };

  const salir = async () => {
    setSaliendo(true);
    try {
      await fetch(api("/api/auth/logout"), { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setSaliendo(false);
    }
  };

  // Ctrl/⌘ + K abre la búsqueda rápida desde cualquier pantalla.
  useEffect(() => {
    const alTeclado = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setBuscando((v) => !v);
      }
    };
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, []);

  // Al navegar se cierra el menú desplegado.
  useEffect(() => setMenuAbierto(false), [pathname]);

  const esActivo = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const enlaceNav = (e: Enlace, compacto = false) => {
    const activo = esActivo(e.href);
    const n = e.contador ? contadores[e.contador] : 0;
    return (
      <Link
        key={e.href}
        href={e.href}
        aria-current={activo ? "page" : undefined}
        // Plegado no hay texto, así que el nombre lo da el title y el
        // aria-label; sin ellos el menú se vuelve inservible con lector de
        // pantalla y con el ratón hay que adivinar los iconos.
        title={compacto ? e.etiqueta : undefined}
        aria-label={compacto ? e.etiqueta : undefined}
        className={clsx(
          "group relative flex items-center rounded-lg text-sm font-medium transition-colors",
          compacto ? "justify-center px-0 py-2" : "gap-2.5 px-3 py-2",
          activo
            ? "bg-brand text-white"
            : "text-ink-secondary hover:bg-surface hover:text-ink"
        )}
      >
        <e.Icono
          className={clsx(
            "h-4 w-4 shrink-0",
            activo ? "text-white" : "text-ink-muted group-hover:text-ink-secondary"
          )}
        />
        {!compacto && <span className="truncate">{e.etiqueta}</span>}
        {n > 0 &&
          (compacto ? (
            // Plegado el contador no cabe al lado: se marca en la esquina.
            <span
              className={clsx(
                "absolute right-1 top-1 h-1.5 w-1.5 rounded-full",
                activo ? "bg-white" : "bg-status-critical"
              )}
              aria-hidden
            />
          ) : (
            <span
              className={clsx(
                "ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabla-num",
                activo ? "bg-white/25 text-white" : "bg-status-critical/85 text-white"
              )}
              title={`${n} requieren atención`}
            >
              {n > 999 ? "999+" : n}
            </span>
          ))}
      </Link>
    );
  };

  /** El menú entero, agrupado. Se usa igual en la columna y en el desplegable. */
  const construirMenu = (compacto = false) => (
    <nav className={compacto ? "space-y-2" : "space-y-4"}>
      {GRUPOS.map((grupo, i) => {
        const enlaces = grupo.enlaces.filter(
          (e) =>
            (!e.soloImportador || sesion?.puedeImportar) &&
            (!e.soloComisiones || sesion?.puedeVerComisiones) &&
            (!e.soloColectivas || sesion?.puedeVerColectivas)
        );
        // Si a un grupo no le queda ningún enlace visible —«Datos» para quien no
        // puede importar sigue teniendo Búsqueda, pero por si acaso— no se
        // dibuja el título huérfano.
        if (enlaces.length === 0) return null;
        return (
          <div key={grupo.titulo}>
            {compacto ? (
              // Plegado no cabe el título; una línea separa los grupos para no
              // perder del todo la agrupación.
              i > 0 && <div className="mx-2 mb-2 border-t border-line-axis/60" />
            ) : (
              <div className="etiqueta-marca px-3 pb-1.5 text-[10px] text-ink-muted">
                {grupo.titulo}
              </div>
            )}
            <div className="flex flex-col gap-0.5">
              {enlaces.map((e) => enlaceNav(e, compacto))}
            </div>
          </div>
        );
      })}
    </nav>
  );
  const menu = construirMenu(false);

  return (
    <div className="min-h-screen bg-surface-page">
      {/* ---------------------------------------------------------------
          Encabezado: logo, búsqueda y sesión. El menú ya no vive aquí.
          --------------------------------------------------------------- */}
      <header className="no-imprimir sticky top-0 z-40 border-b border-line-grid bg-surface">
        <div className="flex items-center gap-3 px-4 py-2.5 lg:px-6">
          <button
            onClick={() => setMenuAbierto((v) => !v)}
            aria-label="Abrir menú"
            aria-expanded={menuAbierto}
            className="rounded-md p-1.5 text-ink-secondary hover:bg-surface-page xl:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <Link href="/" className="shrink-0">
            <LogoCompleto alto={36} />
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden w-44 md:block">
              <BotonBusquedaRapida onAbrir={() => setBuscando(true)} />
            </div>
            <button
              onClick={() => setBuscando(true)}
              aria-label="Buscar"
              className="rounded-md p-1.5 text-ink-secondary hover:bg-surface-page md:hidden"
            >
              <IconBuscar className="h-5 w-5" />
            </button>

            {sesion && (
              <div className="flex items-center gap-2 border-l border-line-grid pl-2">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white"
                  title={sesion.usuario}
                >
                  {(sesion.nombre ?? sesion.usuario).slice(0, 2).toUpperCase()}
                </div>
                <div className="hidden min-w-0 lg:block">
                  <div className="truncate text-sm font-medium leading-tight">
                    {sesion.nombre ?? sesion.usuario}
                  </div>
                  <button
                    onClick={salir}
                    disabled={saliendo}
                    className="text-[11px] text-ink-muted hover:text-brand disabled:opacity-50"
                  >
                    {saliendo ? "Saliendo…" : "Cerrar sesión"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Donde no cabe la columna, el mismo menú se despliega bajo el
            encabezado. */}
        {menuAbierto && (
          <div className="border-t border-line-grid px-4 py-3 xl:hidden">{menu}</div>
        )}
      </header>

      {/* ---------------------------------------------------------------
          Debajo: el menú a la izquierda y el contenido a la derecha.
          --------------------------------------------------------------- */}
      <div className="mx-auto flex max-w-[1600px] gap-6 px-4 py-5 sm:px-6 lg:px-8">
        {/* El fondo hundido y el borde dan el límite del menú: sobre el crema
            de la página la columna no se distinguía del contenido y no se veía
            dónde acababa. */}
        <aside
          className={clsx(
            "no-imprimir sticky top-[68px] hidden h-fit shrink-0 rounded-xl border border-line-grid bg-surface-sunken p-2 xl:block",
            colapsado ? "w-[3.25rem]" : "w-56"
          )}
        >
          {construirMenu(colapsado)}

          <div className="mt-2 border-t border-line-axis/60 pt-2">
            <button
              onClick={alternarColapso}
              title={colapsado ? "Desplegar menú" : "Plegar menú"}
              aria-label={colapsado ? "Desplegar menú" : "Plegar menú"}
              aria-expanded={!colapsado}
              className={clsx(
                "flex w-full items-center rounded-lg py-2 text-ink-muted transition-colors hover:bg-surface hover:text-ink-secondary",
                colapsado ? "justify-center px-0" : "gap-2.5 px-3"
              )}
            >
              <svg
                viewBox="0 0 24 24"
                className={clsx("h-4 w-4 shrink-0 transition-transform", colapsado && "rotate-180")}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
              {!colapsado && <span className="text-sm font-medium">Plegar menú</span>}
            </button>
          </div>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <BusquedaRapida abierta={buscando} onCerrar={() => setBuscando(false)} />
    </div>
  );
}
