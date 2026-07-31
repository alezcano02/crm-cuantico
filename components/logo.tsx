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
  /** Color de las órbitas y el núcleo. Por defecto hereda del contenedor. */
  orbita?: string;
  /** Color de los seis nodos. */
  nodo?: string;
};

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
      <circle cx="50" cy="50" r="11.5" fill={orbita} />
    </svg>
  );
}

/**
 * Marca + nombre. El logo original usa una serif romana en versalitas, así que
 * el texto va en serif para mantener el parecido.
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
    <div className={`flex items-center gap-3 ${className}`}>
      <LogoMarca
        className="h-9 w-9 shrink-0"
        orbita={claro ? "#ffffff" : "#132240"}
        nodo={claro ? "rgba(255,255,255,0.45)" : "#9a9a9a"}
      />
      <div className="leading-none">
        <div
          className={`font-display text-[19px] font-normal tracking-[0.16em] ${
            claro ? "text-white" : "text-brand"
          }`}
        >
          CUÁNTICO
        </div>
        <div
          className={`mt-1 font-condensada text-[9px] font-semibold uppercase tracking-[0.22em] ${
            claro ? "text-white/55" : "text-ink-muted"
          }`}
        >
          SIEMPRE CONTIGO
        </div>
      </div>
    </div>
  );
}
