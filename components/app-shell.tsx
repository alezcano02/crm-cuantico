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
  IconHistorial,
  IconImportar,
  IconPersonas,
  IconRegalo,
  IconSiniestro,
  IconTendencia,
} from "@/components/icons";
import { LogoCompleto } from "@/components/logo";
import { BotonBusquedaRapida, BusquedaRapida } from "@/components/busqueda-rapida";
import { ID_PANEL_FILTROS } from "@/components/panel-filtros";
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
};

/**
 * El menú va en el encabezado, en una sola fila. Antes eran tres grupos en una
 * barra lateral; en horizontal los grupos no aportan y quitan sitio, así que se
 * ordenan por uso: primero lo que se mira a diario.
 */
const ENLACES: Enlace[] = [
  { href: "/", etiqueta: "Dashboard", Icono: IconDashboard },
  {
    href: "/vencimientos",
    etiqueta: "Vencimientos",
    Icono: IconCalendario,
    contador: "vencidas",
  },
  { href: "/cartera", etiqueta: "Cartera", Icono: IconCartera, contador: "mora" },
  { href: "/seguimiento", etiqueta: "Seguimiento", Icono: IconTendencia },
  { href: "/cancelaciones", etiqueta: "Cancelaciones", Icono: IconHistorial },
  { href: "/siniestros", etiqueta: "Siniestros", Icono: IconSiniestro },
  { href: "/asesores", etiqueta: "Asesores", Icono: IconPersonas },
  { href: "/cumpleanos", etiqueta: "Cumpleaños", Icono: IconRegalo },
  { href: "/buscar", etiqueta: "Búsqueda", Icono: IconBuscar },
  {
    href: "/importar",
    etiqueta: "Importar datos",
    Icono: IconImportar,
    soloImportador: true,
  },
];

export interface SesionVista {
  usuario: string;
  nombre: string | null;
  /** Si no puede importar, el enlace ni siquiera se dibuja. */
  puedeImportar?: boolean;
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

  const enlaces = ENLACES.filter(
    (e) => !e.soloImportador || sesion?.puedeImportar
  );

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

  // Al navegar se cierra el menú móvil.
  useEffect(() => setMenuAbierto(false), [pathname]);

  const esActivo = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const enlaceNav = (e: Enlace, vertical = false) => {
    const activo = esActivo(e.href);
    const n = e.contador ? contadores[e.contador] : 0;
    return (
      <Link
        key={e.href}
        href={e.href}
        className={clsx(
          "group relative flex items-center gap-2 rounded-lg text-sm font-medium transition-colors",
          vertical ? "px-3 py-2.5" : "px-2.5 py-1.5",
          activo
            ? "bg-brand text-white"
            : "text-ink-secondary hover:bg-surface-page hover:text-ink"
        )}
      >
        <e.Icono
          className={clsx(
            "h-4 w-4 shrink-0",
            activo ? "text-white" : "text-ink-muted group-hover:text-ink-secondary"
          )}
        />
        <span className="truncate">{e.etiqueta}</span>
        {n > 0 && (
          <span
            className={clsx(
              "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabla-num",
              activo ? "bg-white/25 text-white" : "bg-status-critical/85 text-white"
            )}
            title={`${n} requieren atención`}
          >
            {n > 999 ? "999+" : n}
          </span>
        )}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-surface-page">
      {/* ---------------------------------------------------------------
          Encabezado: logo, menú y sesión. El menú pasó aquí desde la barra
          lateral; la izquierda queda libre para los filtros de cada módulo.
          --------------------------------------------------------------- */}
      <header className="no-imprimir sticky top-0 z-40 border-b border-line-grid bg-surface">
        <div className="flex items-center gap-3 px-4 py-2.5 lg:px-6">
          <button
            onClick={() => setMenuAbierto((v) => !v)}
            aria-label="Abrir menú"
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

          <nav className="ml-2 hidden flex-1 flex-wrap items-center gap-0.5 xl:flex">
            {enlaces.map((e) => enlaceNav(e))}
          </nav>

          <div className="ml-auto flex items-center gap-2 xl:ml-0">
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

        {/* Menú desplegado en pantallas donde no cabe en una fila */}
        {menuAbierto && (
          <nav className="grid grid-cols-2 gap-1 border-t border-line-grid px-4 py-2 sm:grid-cols-3 xl:hidden">
            {enlaces.map((e) => enlaceNav(e, true))}
          </nav>
        )}
      </header>

      {/* ---------------------------------------------------------------
          Debajo: columna de filtros a la izquierda y contenido a la derecha.
          El contenedor de filtros está siempre; cada módulo mete los suyos
          con <PanelFiltros> (ver components/panel-filtros.tsx).
          --------------------------------------------------------------- */}
      <div className="mx-auto flex max-w-[1600px] gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <aside
          id={ID_PANEL_FILTROS}
          className="no-imprimir sticky top-[68px] hidden h-fit w-64 shrink-0 space-y-3 lg:block"
        />
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <BusquedaRapida abierta={buscando} onCerrar={() => setBuscando(false)} />
    </div>
  );
}
