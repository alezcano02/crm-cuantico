"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  IconBuscar,
  IconCalendario,
  IconDashboard,
  IconImportar,
  IconTendencia,
} from "@/components/icons";

const enlaces = [
  { href: "/", etiqueta: "Dashboard", Icono: IconDashboard },
  { href: "/seguimiento", etiqueta: "Seguimiento", Icono: IconTendencia },
  { href: "/vencimientos", etiqueta: "Vencimientos", Icono: IconCalendario },
  { href: "/buscar", etiqueta: "Búsqueda", Icono: IconBuscar },
  { href: "/importar", etiqueta: "Importar datos", Icono: IconImportar },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 p-3">
      {enlaces.map(({ href, etiqueta, Icono }) => {
        const activo = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={clsx(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              activo
                ? "bg-white/10 text-white"
                : "text-slate-300 hover:bg-white/5 hover:text-white"
            )}
          >
            <Icono className={clsx("h-4 w-4", activo ? "text-sky-300" : "text-slate-400")} />
            {etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
