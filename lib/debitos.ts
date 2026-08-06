/**
 * Lector del listado de débitos de Sura (Cristica y Espumas Medellín).
 *
 * QUÉ ES ESTE ARCHIVO
 *
 * Cada mes la aseguradora cobra a la empresa un recibo por póliza, y el
 * detalle dice qué empleado va en él y con qué familiares. Ese detalle es, de
 * hecho, la nómina asegurada del mes: quien aparece está amparado y quien
 * desaparece se retiró. Por eso sirve para poblar las colectivas sin escribir
 * las inclusiones a mano.
 *
 * FORMATO
 *
 * El libro trae una hoja por mes. Dentro de cada hoja hay secciones, una por
 * póliza, encabezadas así:
 *
 *   CRISTICA S.A.S  |  SALUD CLASICA  |  Póliza 091000812844  |  Recibo 14103909
 *   Fecha del documento: 2026-03-01
 *   Empleado	ID Empleado	# Familiares	Detalle familiares	Total a debitar
 *   LUIS ALFONSO ORTEGA ALMARIO	98597458	4	EMILIANA ORTEGA RUIZ (HIJO(A)), …	$1,797,621
 *   SUBTOTAL				$6,774,679
 *
 * Hay DOS formatos de sección, y confundirlos mete placas donde van personas:
 *  - personas (SALUD, VIDA): Empleado · ID · # Familiares · Detalle · Total
 *  - vehículos (AUTOS):      Asegurado · N.º identificación · Placa · Detalle · Total
 *
 * Se distinguen por el encabezado de columnas, no por el nombre de la póliza:
 * los títulos varían («AUTOS Cristica», «AUTOS Utilitarios y Pesados») y
 * algunos llevan sufijos de ajuste —(NEGATIVO), (NC), (AJUSTE)— que no cambian
 * la forma de las filas.
 */

/** Parentescos tal como los escribe Sura, ya normalizados a los códigos del CRM. */
const PARENTESCO_TEXTO: [RegExp, string][] = [
  [/^hijo/i, "HI"],
  // «CONYUG E» aparece 14 veces en el archivo: es el mismo dato partido por
  // un salto de columna del Excel original.
  [/^c[oó]nyug|^conyug/i, "CO"],
  [/^progenitor|^padre|^madre/i, "PR"],
  [/^hermano|^hermana/i, "HE"],
  [/^dependiente/i, "DE"],
];

export function codigoParentesco(texto: string): string {
  const t = texto.replace(/\s+/g, " ").trim();
  for (const [re, cod] of PARENTESCO_TEXTO) if (re.test(t)) return cod;
  return "DE"; // desconocido pero cubierto: se prefiere a descartarlo
}

export interface AmparadoLeido {
  empresa: string;
  polizaNumero: string;
  plan: string;
  docEmpleado: string;
  nombreEmpleado: string;
  nombreAmparado: string;
  docAmparado: string;
  parentesco: string;
  placa: string | null;
}

export interface MesLeido {
  /** Nombre de la hoja, p. ej. «Marzo 2026». */
  nombre: string;
  amparados: AmparadoLeido[];
}

const RE_HOJA = /^## Sheet:\s*(.+?)\s+—/;
const RE_SECCION = /^(.+?)\s{2}\|\s{2}(.+?)\s{2}\|\s{2}P[oó]liza\s+(\S+)/;
/** Meses en español, para ordenar las hojas por fecha y no alfabéticamente. */
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Convierte «Marzo 2026» en 202603, para poder comparar hojas entre sí. */
export function ordenDeMes(nombre: string): number {
  const m = nombre.trim().toLowerCase().match(/^([a-záéíóú]+)\s+(\d{4})$/);
  if (!m) return -1;
  const i = MESES.indexOf(m[1]);
  return i < 0 ? -1 : Number(m[2]) * 100 + i + 1;
}

/**
 * Quita el sufijo de ajuste del título de la póliza: «SALUD CLASICA (AJUSTE)»
 * y «SALUD CLASICA» son el mismo plan, y si no se unifican salen dos veces.
 */
function limpiarPlan(titulo: string): string {
  return titulo
    .replace(/\s*[-–]?\s*(AJUSTE|NEGATIVO|NC|INGRESO)\b/gi, "")
    .replace(/\s*\(\s*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Separa el detalle de familiares en pares nombre/parentesco.
 *
 * No se puede partir por comas a secas: los parentescos traen paréntesis
 * —«HIJO(A)», «PROGENITOR(A)»— y una coma dentro de ellos rompería el nombre.
 * Se buscan directamente los pares «texto (PARENTESCO)».
 */
export function leerFamiliares(detalle: string): { nombre: string; parentesco: string }[] {
  if (!detalle || /solo el titular/i.test(detalle)) return [];
  const salida: { nombre: string; parentesco: string }[] = [];
  const re = /([^,(]+?)\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(detalle))) {
    const nombre = m[1].replace(/\s+/g, " ").trim();
    if (!nombre) continue;
    salida.push({ nombre, parentesco: codigoParentesco(m[2]) });
  }
  return salida;
}

/**
 * Lee todas las hojas mensuales del volcado de texto del libro.
 *
 * Recibe texto y no el .xlsx a propósito: así el mismo lector sirve para el
 * volcado del conector de SharePoint y para cualquier exportación que se
 * guarde a mano, sin depender de poder descargar el binario.
 */
export function leerDebitos(texto: string): MesLeido[] {
  const lineas = texto.split(/\r?\n/);
  const meses: MesLeido[] = [];

  let mes: MesLeido | null = null;
  let empresa = "";
  let poliza = "";
  let plan = "";
  let formato: "personas" | "vehiculos" | null = null;

  for (const linea of lineas) {
    const hoja = linea.match(RE_HOJA);
    if (hoja) {
      // Solo las hojas mensuales: «Resumen» y «Duplicados» no son nómina.
      mes = ordenDeMes(hoja[1]) > 0 ? { nombre: hoja[1].trim(), amparados: [] } : null;
      if (mes) meses.push(mes);
      formato = null;
      continue;
    }
    if (!mes) continue;

    const sec = linea.match(RE_SECCION);
    if (sec) {
      empresa = sec[1].replace(/\s+/g, " ").trim();
      plan = limpiarPlan(sec[2]);
      poliza = sec[3].trim();
      formato = null; // se decide al ver el encabezado de columnas
      continue;
    }

    const cols = linea.split("\t").map((c) => c.trim());

    // Encabezado de columnas: fija el formato de las filas que vienen.
    if (/^(empleado|asegurado)$/i.test(cols[0] ?? "")) {
      formato = cols.some((c) => /^placa$/i.test(c)) ? "vehiculos" : "personas";
      continue;
    }
    if (!formato || !poliza) continue;

    const primera = cols[0] ?? "";
    // Fin de sección: totales, cuadres y filas vacías.
    if (!primera || /^(subtotal|total|diferencia)/i.test(primera)) continue;

    if (formato === "vehiculos") {
      const placa = cols[2] ?? "";
      if (!placa) continue;
      mes.amparados.push({
        empresa,
        polizaNumero: poliza,
        plan,
        docEmpleado: cols[1] ?? "",
        nombreEmpleado: primera,
        nombreAmparado: placa,
        docAmparado: "",
        parentesco: "VE",
        placa,
      });
      continue;
    }

    const doc = cols[1] ?? "";
    if (!doc) continue;
    // El titular: es él quien da derecho a la cobertura.
    mes.amparados.push({
      empresa,
      polizaNumero: poliza,
      plan,
      docEmpleado: doc,
      nombreEmpleado: primera,
      nombreAmparado: primera,
      docAmparado: doc,
      parentesco: "AF",
      placa: null,
    });
    // Y sus beneficiarios, que vienen sin documento.
    for (const f of leerFamiliares(cols[3] ?? "")) {
      mes.amparados.push({
        empresa,
        polizaNumero: poliza,
        plan,
        docEmpleado: doc,
        nombreEmpleado: primera,
        nombreAmparado: f.nombre,
        docAmparado: "",
        parentesco: f.parentesco,
        placa: null,
      });
    }
  }

  return meses;
}
