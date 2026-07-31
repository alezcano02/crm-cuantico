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
 * Marca + nombre, igual que la cabecera de cuanticoseguros.com.co: el símbolo a
 * color, "Cuántico Seguros" en Cormorant Garamond 600 y "Siempre Contigo" en
 * Barlow Condensed en versalitas azul acento.
 *
 * Sobre fondo oscuro (`tono="claro"`) el símbolo se pasa a blanco: los grises y
 * el crema del original desaparecen contra el azul marino.
 */
export function LogoCompleto({
  className = "",
  tono = "oscuro",
}: {
  className?: string;
  /** "oscuro" = para fondos claros · "claro" = para fondos oscuros */
  tono?: "oscuro" | "claro";
}) {
  const claro = tono === "claro";
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoMarca
        className="h-10 w-10 shrink-0"
        orbita={claro ? "rgba(255,255,255,0.85)" : COLORES_MARCA.orbita}
        nodo={claro ? "rgba(255,255,255,0.55)" : COLORES_MARCA.nodo}
        nucleo={claro ? "#ffffff" : COLORES_MARCA.nucleo}
        anillo={claro ? null : COLORES_MARCA.anillo}
      />
      <div className="leading-none">
        <div
          className={`font-display text-[20px] font-semibold tracking-[0.01em] ${
            claro ? "text-white" : "text-brand"
          }`}
        >
          Cuántico Seguros
        </div>
        <div
          className={`mt-1 font-condensada text-[10px] font-medium uppercase tracking-[0.14em] ${
            claro ? "text-white/60" : "text-brand-acento"
          }`}
        >
          Siempre Contigo
        </div>
      </div>
    </div>
  );
}
