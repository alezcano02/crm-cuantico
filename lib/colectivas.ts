/**
 * Pólizas colectivas: las que una EMPRESA contrata para sus empleados.
 *
 * QUÉ SE GESTIONA AQUÍ, Y POR QUÉ NO BASTA CON LA CARTERA
 *
 * En el resto del CRM una póliza es una fila con su prima y su vencimiento.
 * En una colectiva eso no alcanza: el trabajo del día a día no es la póliza
 * sino el movimiento de personas dentro de ella —quién entra (inclusión) y
 * quién sale (retiro)—, y cada persona cubierta tiene su propio valor
 * asegurado, su propia prima y su propio trámite ante la aseguradora.
 *
 * La estructura sale de cómo se lleva hoy en el SharePoint
 * (4. Asesores/Oficina/<EMPRESA>): un empleado AFILIADO puede traer
 * beneficiarios, así que la unidad no es el empleado sino la PERSONA
 * cubierta, colgada del empleado que le da derecho.
 */

/** Parentesco tal como lo escriben las aseguradoras en sus listados. */
export const PARENTESCOS: Record<string, string> = {
  AF: "Afiliado",
  CO: "Cónyuge",
  HI: "Hijo/a",
  PR: "Padre/Madre",
  HE: "Hermano/a",
  DE: "Dependiente",
  // No toda colectiva ampara personas: las de AUTOS amparan vehículos, y el
  // amparado es la placa. Ver el campo `placa` de AmparadoColectiva.
  VE: "Vehículo",
};

export function nombreParentesco(codigo: string | null | undefined): string {
  if (!codigo) return "—";
  return PARENTESCOS[codigo.trim().toUpperCase()] ?? codigo;
}

/**
 * Estados de trámite, en el orden en que ocurren.
 *
 * Son los que usa SURA en sus listados; se guardan tal cual para que la
 * persona que concilia con la aseguradora vea la misma palabra en los dos
 * lados.
 */
export const ESTADOS_AMPARADO = [
  "EN EXPEDICION",
  "EN EVALUACION",
  "EN COMPLEMENTOS",
  "EXPEDIDO",
  "RETIRADO",
  "RECHAZADO",
] as const;

export type EstadoAmparado = (typeof ESTADOS_AMPARADO)[number];

/** Un amparado cuenta como activo mientras no se haya ido. */
export function estaActivo(estado: string, fechaRetiro: Date | null): boolean {
  if (fechaRetiro) return false;
  return estado !== "RETIRADO" && estado !== "RECHAZADO";
}

/** Los que todavía no están en firme ante la aseguradora. */
export function estaEnTramite(estado: string): boolean {
  return estado === "EN EXPEDICION" || estado === "EN EVALUACION" || estado === "EN COMPLEMENTOS";
}

export const TIPOS_NOVEDAD = ["INCLUSION", "RETIRO", "MODIFICACION"] as const;
export type TipoNovedad = (typeof TIPOS_NOVEDAD)[number];

export const ESTADOS_NOVEDAD = ["SOLICITADA", "CONFIRMADA", "RECHAZADA"] as const;

export const ETIQUETA_NOVEDAD: Record<string, string> = {
  INCLUSION: "Inclusión",
  RETIRO: "Retiro",
  MODIFICACION: "Modificación",
};

/**
 * Ramos que gestiona este módulo.
 *
 * Se excluye FINANCREA por decisión del negocio: se lleva aparte. La
 * exclusión va por nombre de empresa y no por póliza porque el informe de
 * producción no siempre trae el mismo número.
 */
export const RAMOS_COLECTIVOS = ["COLECTIVA", "VIDA GRUPO"];

/**
 * ¿Este ramo es de una póliza de empresa?
 *
 * Hay que preguntarlo con una función y no con `RAMOS_COLECTIVOS.includes`
 * porque las colectivas declaradas en el mapa llevan nombre propio —«Colectiva
 * Autos», «Colectiva Salud», «Colectiva Vida»— y una comparación exacta contra
 * la lista vieja las dejaba fuera justo después de renombrarlas: el módulo de
 * colectivas se quedaba sin pólizas y la consolidación de producción dejaba de
 * aplicarse. Se aceptan las dos formas, la del informe y la del mapa.
 */
export function esRamoColectivo(ramo: string | null | undefined): boolean {
  if (!ramo) return false;
  const r = ramo.trim().toUpperCase();
  return RAMOS_COLECTIVOS.includes(r) || r.startsWith("COLECTIVA");
}
const EXCLUIDAS = [/financrea/i];

export function empresaExcluida(nombre: string | null | undefined): boolean {
  if (!nombre) return false;
  return EXCLUIDAS.some((re) => re.test(nombre));
}

/**
 * Saca el nombre de la empresa del campo `asegurado` del informe.
 *
 * El informe mete dos cosas en un mismo campo: a veces la empresa sola
 * («CRISTICA S.A.S»), a veces la persona y la empresa separadas por barra
 * («BRAYAN ANTELIZ GARCIA/CRISTICA», «CRISTICA/JOSE MANUEL GUTIERREZ»). No hay
 * regla fija sobre cuál va primero, así que se compara contra las empresas ya
 * conocidas en vez de adivinar por posición.
 *
 * Devuelve null cuando no reconoce ninguna: es preferible dejarlo sin asignar
 * y que alguien lo revise, a colgar una póliza de la empresa equivocada.
 */
export function empresaDeAsegurado(
  asegurado: string,
  empresasConocidas: string[]
): string | null {
  const texto = asegurado.toUpperCase();
  // Se prueba primero la coincidencia más larga: «ESPUMADOS DEL LITORAL» antes
  // que «ESPUMAS», que si no se solaparían.
  const candidatas = [...empresasConocidas].sort((a, b) => b.length - a.length);
  for (const emp of candidatas) {
    const clave = emp.toUpperCase().replace(/\s+(S\.?A\.?S?|LTDA|LIMITADA)\.?$/, "").trim();
    if (clave.length >= 4 && texto.includes(clave)) return emp;
  }
  return null;
}

export interface ResumenEmpresa {
  activos: number;
  enTramite: number;
  retiradosMes: number;
  incluidosMes: number;
  primaMensual: number;
}
