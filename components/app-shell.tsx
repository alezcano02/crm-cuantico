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
import { LogoCompleto, LogoMarca } from "@/components/logo";
import { BotonBusquedaRapida, BusquedaRapida } from "@/components/busqueda-rapida";

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
};

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
    ],
  },
  {
    titulo: "Datos",
    enlaces: [
      { href: "/buscar", etiqueta: "Búsqueda", Icono: IconBuscar },
      { href: "/importar", etiqueta: "Importar datos", Icono: IconImportar },
    ],
  },
];

export interface SesionVista {
  usuario: string;
  nombre: string | null;
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

  const salir = async () => {
    setSaliendo(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
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

  const barra = (
    <>
      <div className="px-5 py-5">
        <Link href="/" className="block">
          <LogoCompleto tono="claro" />
        </Link>
      </div>

      <div className="px-3 pb-2">
        <BotonBusquedaRapida onAbrir={() => setBuscando(true)} />
      </div>

      <nav className="flex-1 overflow-y-auto scroll-fino px-3 pb-4">
        {GRUPOS.map((grupo) => (
          <div key={grupo.titulo} className="mb-4">
            <div className="etiqueta-marca px-3 pb-1.5 text-[10px] text-white/35">
              {grupo.titulo}
            </div>
            <div className="flex flex-col gap-0.5">
              {grupo.enlaces.map(({ href, etiqueta, Icono, contador }) => {
                const activo =
                  href === "/" ? pathname === "/" : pathname.startsWith(href);
                const n = contador ? contadores[contador] : 0;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={clsx(
                      "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      activo
                        ? "bg-white/12 text-white"
                        : "text-white/65 hover:bg-white/6 hover:text-white"
                    )}
                  >
                    {activo && (
                      <span
                        className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-white"
                        aria-hidden
                      />
                    )}
                    <Icono
                      className={clsx(
                        "h-4 w-4 shrink-0",
                        activo ? "text-white" : "text-white/45 group-hover:text-white/80"
                      )}
                    />
                    <span className="flex-1 truncate">{etiqueta}</span>
                    {n > 0 && (
                      <span
                        className={clsx(
                          "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabla-num",
                          activo
                            ? "bg-white/20 text-white"
                            : "bg-status-critical/85 text-white"
                        )}
                        title={`${n} requieren atención`}
                      >
                        {n > 999 ? "999+" : n}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {sesion ? (
        <div className="border-t border-white/10 px-3 py-3">
          <div className="flex items-center gap-2.5 px-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white">
              {(sesion.nombre ?? sesion.usuario).slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">
                {sesion.nombre ?? sesion.usuario}
              </div>
              <div className="truncate text-[11px] text-white/40">{sesion.usuario}</div>
            </div>
          </div>
          <button
            onClick={salir}
            disabled={saliendo}
            className="mt-2 w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium text-white/50 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            {saliendo ? "Saliendo…" : "Cerrar sesión"}
          </button>
        </div>
      ) : (
        <div className="border-t border-white/10 px-5 py-3.5 text-[11px] leading-relaxed text-white/35">
          CRM de producción y cartera
          <br />
          Datos en tiempo real desde la base
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-screen">
      {/* Barra lateral fija en escritorio */}
      <aside className="no-imprimir fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-brand-800 lg:flex">
        {barra}
      </aside>

      {/* Cabecera móvil */}
      <header className="no-imprimir sticky top-0 z-30 flex items-center gap-3 border-b border-line-grid bg-surface px-4 py-3 lg:hidden">
        <button
          onClick={() => setMenuAbierto(true)}
          aria-label="Abrir menú"
          className="rounded-md p-1.5 text-ink-secondary hover:bg-surface-page"
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
        <Link href="/" className="flex items-center gap-2">
          <LogoMarca className="h-6 w-6" orbita="#132240" nodo="#9a9a9a" />
          <span className="font-display text-sm font-bold tracking-widest text-brand">
            CUÁNTICO
          </span>
        </Link>
        <button
          onClick={() => setBuscando(true)}
          aria-label="Buscar"
          className="ml-auto rounded-md p-1.5 text-ink-secondary hover:bg-surface-page"
        >
          <IconBuscar className="h-5 w-5" />
        </button>
      </header>

      {/* Cajón móvil */}
      {menuAbierto && (
        <div
          className="no-imprimir fixed inset-0 z-50 bg-ink/50 lg:hidden"
          onClick={() => setMenuAbierto(false)}
        >
          <aside
            className="flex h-full w-64 flex-col bg-brand-800"
            onClick={(e) => e.stopPropagation()}
          >
            {barra}
          </aside>
        </div>
      )}

      <main className="min-w-0 px-4 py-5 sm:px-6 lg:ml-60 lg:px-8 lg:py-7">
        {children}
      </main>

      <BusquedaRapida abierta={buscando} onCerrar={() => setBuscando(false)} />
    </div>
  );
}
