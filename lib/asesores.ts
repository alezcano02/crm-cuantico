/**
 * Las dos columnas de asesor NO son lo mismo, y por eso no comparten lista.
 *
 * ASESOR 1 es el CANAL por el que entró el negocio: la agencia propia o una de
 * las dos aliadas. Son tres y no cambian con la operación del día a día, así
 * que van escritos aquí y no salen de los datos: si mañana alguien teclea mal
 * un canal en el Excel, la lista del formulario no debe aprenderse la errata.
 *
 * ASESOR 2 es la PERSONA que atiende dentro de ese canal —o «OFICINA» cuando
 * la atiende la agencia sin nombre propio—. Esa sí sale de los datos, porque
 * cambia cada vez que entra o sale alguien.
 */

export const ASESORES_PRINCIPALES = ["CUANTICO", "BLIN SEGUROS", "VIVASEGUROS"];

/**
 * Canales que NO deben ofrecerse como asesor 2.
 *
 * Poner el canal en la columna de la persona es el error que se quiere evitar:
 * en asesor 2 ese papel ya lo cubre «OFICINA». Se listan las dos grafías de
 * Cuántico —la corta y la razón social entera— porque las dos han aparecido en
 * los datos y las dos hay que descartar.
 */
const CANALES_FUERA_DE_APOYO = [
  "CUANTICO",
  "CUÁNTICO",
  "CUANTICO AGENCIA DE SEGUROS LTDA",
  "CUÁNTICO AGENCIA DE SEGUROS LTDA",
  "VIVASEGUROS",
  "VIVA SEGUROS",
];

/** Compara sin tildes, mayúsculas ni espacios de más. */
function normalizar(v: string): string {
  const SIN_TILDE: Record<string, string> = {
    Á: "A", É: "E", Í: "I", Ó: "O", Ú: "U", Ü: "U",
    á: "A", é: "E", í: "I", ó: "O", ú: "U", ü: "U",
  };
  return v
    .toUpperCase()
    .replace(/[ÁÉÍÓÚÜáéíóúü]/g, (c) => SIN_TILDE[c] ?? c)
    .replace(/\s+/g, " ")
    .trim();
}

const FUERA = new Set(CANALES_FUERA_DE_APOYO.map(normalizar));

/** ¿Este nombre puede aparecer en el desplegable de asesor 2? */
export function valeComoAsesorApoyo(nombre: string): boolean {
  return !FUERA.has(normalizar(nombre));
}
