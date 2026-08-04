"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Id del contenedor que AppShell reserva en la columna izquierda. */
export const ID_PANEL_FILTROS = "panel-filtros";

/**
 * Manda sus hijos a la columna izquierda de la pantalla.
 *
 * Los filtros de cada módulo viven dentro del componente que tiene su estado
 * (cartera-tabla, vencimientos-tabla…), y ahí deben seguir: sacarlos de ahí
 * obligaría a subir todo ese estado y a reescribir el filtrado, que ya está
 * probado. Con un portal se quedan donde están y solo se dibujan en otro sitio.
 *
 * Si el contenedor no existe —una página sin barra, o el primer render en el
 * servidor— los hijos se pintan en su sitio de siempre y no se pierde nada.
 */
export function PanelFiltros({ children }: { children: React.ReactNode }) {
  const [destino, setDestino] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setDestino(document.getElementById(ID_PANEL_FILTROS));
  }, []);

  if (!destino) {
    return <div className="mb-4 lg:hidden">{children}</div>;
  }
  return createPortal(children, destino);
}
