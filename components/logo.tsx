import Image from "next/image";
import clsx from "clsx";

/**
 * Marca de Cuántico Seguros en SVG.
 *
 * Reproduce el símbolo del logo (el átomo: tres órbitas elípticas con seis
 * nodos y un núcleo central) en vector, de modo que se vea nítido en cualquier
 * tamaño, pese pocos bytes y pueda recolorearse según el fondo. Los nodos caen
 * exactamente sobre los extremos del eje mayor de cada órbita.
 */

type MarcaProps = {
  className?: string;
  /** Color de las órbitas. Por defecto hereda del contenedor. */
  orbita?: string;
  /** Color de los seis nodos. */
  nodo?: string;
  /** Relleno del núcleo. */
  nucleo?: string;
  /** Anillo cian alrededor del núcleo. `null` lo quita. */
  anillo?: string | null;
};

/**
 * Colores del logo original (medidos sobre images/logo-icon.png del sitio):
 * órbitas gris, nodos azul pizarra, núcleo crema con un anillo cian.
 */
export const COLORES_MARCA = {
  orbita: "#a8a8a8",
  nodo: "#39536c",
  nucleo: "#d7cfbc",
  anillo: "#34b7cb",
} as const;

// Extremos del eje mayor de cada órbita (ry = 44 desde el centro 50,50),
// para las tres rotaciones: 0°, 60° y 120°.
const NODOS: [number, number][] = [
  [50, 6],
  [50, 94],
  [88.1, 28],
  [11.9, 72],
  [88.1, 72],
  [11.9, 28],
];

export function LogoMarca({
  className = "h-8 w-8",
  orbita = "currentColor",
  nodo = "currentColor",
  nucleo,
  anillo,
}: MarcaProps) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" aria-hidden>
      <g stroke={orbita} strokeWidth="2.6">
        <ellipse cx="50" cy="50" rx="19" ry="44" />
        <ellipse cx="50" cy="50" rx="19" ry="44" transform="rotate(60 50 50)" />
        <ellipse cx="50" cy="50" rx="19" ry="44" transform="rotate(120 50 50)" />
      </g>
      <g fill={nodo}>
        {NODOS.map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="7.6" />
        ))}
      </g>
      {anillo && (
        <circle cx="50" cy="50" r="13.4" fill="none" stroke={anillo} strokeWidth="3" />
      )}
      <circle cx="50" cy="50" r="11.5" fill={nucleo ?? orbita} />
    </svg>
  );
}

/**
 * El logo REAL de la agencia, el archivo oficial de
 * "2. Administrativa\Logos\Logo.png": el átomo con los iconos de cada ramo en
 * las órbitas y el nombre debajo. Sustituye a la reconstrucción en SVG, que se
 * parecía pero no era el logo.
 *
 * El PNG trae el nombre incorporado y en azul marino, así que sobre fondo
 * oscuro (`tono="claro"`) no se leería: ahí va sobre una tarjeta blanca en vez
 * de recolorearlo, que sería alterar la marca.
 */
/**
 * Dónde está el ÁTOMO dentro del PNG oficial, en fracciones del ancho del
 * archivo (1563 px). Medido sobre el propio archivo: el átomo ocupa 787×874 a
 * partir de (380, 255); debajo van el nombre y el eslogan, que aquí no se usan
 * porque se escriben en HTML con la tipografía de la web.
 */
const ATOMO = { izq: 0.2431, arriba: 0.1631, ancho: 0.5035, alto: 0.5592 };

/** Solo el símbolo, recortado del archivo oficial. */
export function LogoSimbolo({
  alto = 42,
  className = "",
}: {
  alto?: number;
  className?: string;
}) {
  // Tamaño al que hay que pintar el PNG entero para que el átomo mida `alto`.
  const anchoImagen = Math.round(alto / ATOMO.alto);
  const ancho = Math.round(alto * (ATOMO.ancho / ATOMO.alto));
  return (
    <div
      className={clsx("relative shrink-0 overflow-hidden", className)}
      style={{ width: ancho, height: alto }}
    >
      <Image
        src="/logo-cuantico.png"
        alt=""
        width={anchoImagen}
        height={anchoImagen}
        priority
        className="max-w-none"
        style={{
          marginLeft: -Math.round(anchoImagen * ATOMO.izq),
          marginTop: -Math.round(anchoImagen * ATOMO.arriba),
        }}
      />
    </div>
  );
}

/**
 * El lockup tal como está en la cabecera de cuanticoseguros.com.co: el símbolo
 * a la izquierda y, al lado, "Cuántico Seguros" en Cormorant Garamond 600 sobre
 * "SIEMPRE CONTIGO" en Barlow Condensed en versalitas azul acento. Las medidas
 * salen de la propia web (20 px / 10,4 px, interletraje 1,456 px).
 *
 * El símbolo es el del archivo oficial, no una reconstrucción: el nombre se
 * escribe en HTML porque en el PNG viene en azul marino y no se podría adaptar
 * a fondo oscuro sin alterar la marca.
 */
export function LogoCompleto({
  className = "",
  tono = "oscuro",
  alto = 42,
}: {
  className?: string;
  /** "oscuro" = para fondos claros · "claro" = para fondos oscuros */
  tono?: "oscuro" | "claro";
  /** Alto del símbolo; el texto acompaña en proporción. */
  alto?: number;
}) {
  const claro = tono === "claro";
  const escala = alto / 42;
  return (
    <div className={clsx("flex items-center", className)} style={{ gap: 10 * escala }}>
      <LogoSimbolo alto={alto} />
      <div className="leading-none">
        <div
          className={clsx(
            "font-display font-semibold",
            claro ? "text-white" : "text-brand"
          )}
          style={{ fontSize: 20 * escala, letterSpacing: 0.2 * escala }}
        >
          Cuántico Seguros
        </div>
        <div
          className={clsx(
            "font-condensada font-medium uppercase",
            claro ? "text-white/70" : "text-brand-acento"
          )}
          style={{
            fontSize: 10.4 * escala,
            letterSpacing: 1.456 * escala,
            marginTop: 2 * escala,
          }}
        >
          Siempre Contigo
        </div>
      </div>
    </div>
  );
}
