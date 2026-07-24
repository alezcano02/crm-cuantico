"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const enlaces = [
  { href: "/", etiqueta: "Dashboard", icono: "📊" },
  { href: "/seguimiento", etiqueta: "Seguimiento", icono: "📈" },
  { href: "/vencimientos", etiqueta: "Vencimientos", icono: "📅" },
  { href: "/buscar", etiqueta: "Búsqueda", icono: "🔍" },
  { href: "/importar", etiqueta: "Importar datos", icono: "📥" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 p-3">
      {enlaces.map((e) => {
        const activo = e.href === "/" ? pathname === "/" : pathname.startsWith(e.href);
        return (
          <Link
            key={e.href}
            href={e.href}
            className={clsx(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              activo
                ? "bg-brand-light/50 text-brand-dark"
                : "text-ink-secondary hover:bg-surface-page hover:text-ink"
            )}
          >
            <span aria-hidden>{e.icono}</span>
            {e.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
