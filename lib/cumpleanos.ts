import { hoyUTC } from "./calculos";
import { MESES } from "./constants";

/**
 * Cumpleaños de los clientes, a partir de la columna FECHA NACIMIENTO.
 *
 * Ojo: en el informe también hay razones sociales con fecha (la de
 * constitución de la empresa o de la copropiedad), así que se marca cuáles
 * parecen personas y cuáles no. Felicitar a un edificio por su cumpleaños
 * quedaría raro, por eso la pantalla muestra las personas por defecto.
 */

export interface ClienteCumple {
  asegurado: string;
  fechaNacimiento: Date;
  ccNit: string | null;
  celular: string | null;
  correo: string | null;
  asesor: string | null;
  ramos: string[];
}

export interface Cumpleanos extends ClienteCumple {
  /** Día y mes del cumpleaños de este ciclo (o del próximo si ya pasó). */
  proximo: Date;
  /** Días que faltan; 0 = hoy. */
  dias: number;
  /** Años que cumple en esa fecha. */
  edad: number;
  mes: string;
  /** false cuando el nombre parece una empresa o una copropiedad. */
  esPersona: boolean;
}

// Palabras que delatan una razón social o una copropiedad. Se comparan como
// palabras completas: así "SA" no marca a alguien que se apellide "ROSA",
// ni "TORRE" a quien se apellide "TORRES".
const PISTAS_EMPRESA = [
  // Formas jurídicas
  "SAS", "SA", "LTDA", "EU", "SCA", "BIC", "SAC", "CIA", "CI",
  // Copropiedades
  "PH", "PROPIEDAD HORIZONTAL", "EDIFICIO", "CONJUNTO", "CONDOMINIO",
  "URBANIZACION", "AGRUPACION", "CIUDADELA", "UNIDAD", "RESIDENCIAL",
  "PARQUES", "ETAPA", "TORRE", "TORRES", "BLOQUE", "COPROPIEDAD",
  // Organizaciones
  "CENTRO", "COMERCIAL", "COOPERATIVA", "FUNDACION", "ASOCIACION",
  "CLINICA", "HOTEL", "INVERSIONES", "COMERCIALIZADORA", "CONSTRUCTORA",
  "TRANSPORTES", "SEGURIDAD", "HOLDINGS", "GRUPO", "MALL", "CAMPUS",
  "INDUSTRIAS", "SERVICIOS", "SOLUCIONES", "DISTRIBUCIONES", "EMPRESA",
];

/**
 * Heurística: ¿el nombre parece una empresa o una copropiedad?
 *
 * Se quitan los puntos DENTRO de las palabras pero se conservan los espacios,
 * de modo que "S.A.S." quede como "SAS" y "P.H" como "PH", que es la forma en
 * que aparecen las siglas en el informe.
 *
 * Ante la duda se prefiere NO marcar: la pantalla oculta las empresas, así que
 * marcar a una persona por error le haría perder su cumpleaños, mientras que
 * dejar pasar una empresa solo se ve un poco raro en la lista.
 */
export function pareceEmpresa(nombre: string): boolean {
  const n = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    // Se eliminan los signos sin separar: "S.A.S." → "SAS", "P-H" → "PH"
    .replace(/[^A-Z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const palabras = new Set(n.split(" ").filter(Boolean));
  for (const pista of PISTAS_EMPRESA) {
    if (pista.includes(" ")) {
      if (n.includes(pista)) return true;
    } else if (palabras.has(pista)) {
      return true;
    }
  }
  return false;
}

/**
 * Fecha del próximo cumpleaños a partir de hoy (hoy cuenta como próximo).
 * El 29 de febrero se celebra el 1 de marzo en los años no bisiestos.
 */
export function proximoCumpleanos(nacimiento: Date, hoy: Date = hoyUTC()): Date {
  const dia = nacimiento.getUTCDate();
  const mes = nacimiento.getUTCMonth();
  const construir = (anio: number) => {
    const d = new Date(Date.UTC(anio, mes, dia));
    // Si el 29/02 no existe en ese año, JS lo pasa al 1/03: se acepta tal cual.
    return d;
  };
  let fecha = construir(hoy.getUTCFullYear());
  if (fecha.getTime() < hoy.getTime()) fecha = construir(hoy.getUTCFullYear() + 1);
  return fecha;
}

export function calcularCumpleanos(
  clientes: ClienteCumple[],
  hoy: Date = hoyUTC()
): Cumpleanos[] {
  return clientes
    .map((c) => {
      const proximo = proximoCumpleanos(c.fechaNacimiento, hoy);
      const dias = Math.round((proximo.getTime() - hoy.getTime()) / 86400000);
      return {
        ...c,
        proximo,
        dias,
        edad: proximo.getUTCFullYear() - c.fechaNacimiento.getUTCFullYear(),
        mes: MESES[c.fechaNacimiento.getUTCMonth()],
        esPersona: !pareceEmpresa(c.asegurado),
      };
    })
    .sort((a, b) => a.dias - b.dias);
}
