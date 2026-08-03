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
 * El PNG es cuadrado (1563×1563) pero el dibujo ocupa solo 1182×1039 en el
 * centro: el resto es margen blanco. Medido sobre el archivo, sobra un 12,2% a
 * cada lado, un 16,3% arriba y un 17,2% abajo. Se recorta con una ventana y un
 * desplazamiento para que el logo se vea grande sin gastar ese espacio en
 * blanco, que en una barra de 240 px se nota.
 */
const RECORTE = { izq: 0.122, arriba: 0.163, ancho: 0.756, alto: 0.665 };

export function LogoCompleto({
  className = "",
  tono = "oscuro",
  ancho = 132,
}: {
  className?: string;
  /** "oscuro" = para fondos claros · "claro" = para fondos oscuros */
  tono?: "oscuro" | "claro";
  /** Ancho visible del dibujo, ya sin el margen blanco. */
  ancho?: number;
}) {
  const claro = tono === "claro";
  // Tamaño al que hay que pintar la imagen completa para que la parte útil
  // mida `ancho`, y cuánto hay que correrla para dejar fuera el margen.
  const anchoImagen = Math.round(ancho / RECORTE.ancho);
  const alto = Math.round(ancho * (RECORTE.alto / RECORTE.ancho));

  return (
    <div
      className={clsx(
        claro && "inline-block rounded-xl bg-white p-3",
        className
      )}
    >
      <div
        className="relative overflow-hidden"
        style={{ width: ancho, height: alto }}
      >
        <Image
          src="/logo-cuantico.png"
          alt="Cuántico Seguros · Siempre Contigo"
          width={anchoImagen}
          height={anchoImagen}
          priority
          className="max-w-none"
          style={{
            marginLeft: -Math.round(anchoImagen * RECORTE.izq),
            marginTop: -Math.round(anchoImagen * RECORTE.arriba),
          }}
        />
      </div>
    </div>
  );
}
