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

import * as XLSX from "xlsx";

/**
 * Convierte el libro real al mismo texto que devuelve el conector.
 *
 * Se traduce en vez de escribir un segundo lector porque el de texto ya está
 * probado contra los recibos de Sura, y porque el volcado del conector sigue
 * siendo la única vía cuando el archivo no está sincronizado en el equipo.
 * Un solo parser, dos orígenes.
 */
export function libroATexto(ruta: string): string {
  const libro = XLSX.readFile(ruta, { cellDates: true });
  const partes: string[] = [];
  for (const nombre of libro.SheetNames) {
    const hoja = libro.Sheets[nombre];
    const filas: unknown[][] = XLSX.utils.sheet_to_json(hoja, {
      header: 1,
      blankrows: true,
      defval: "",
      raw: false,
    });
    partes.push(`## Sheet: ${nombre} — ${filas.length} rows`);
    for (const f of filas) partes.push(f.map((c) => String(c ?? "").trim()).join("\t"));
  }
  return partes.join("\n");
}

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

/** Códigos que ya vienen bien: las relaciones de Sura los traen así. */
const CODIGOS = new Set(["AF", "CO", "HI", "PR", "HE", "DE", "VE"]);

export function codigoParentesco(texto: string): string {
  const t = texto.replace(/\s+/g, " ").trim();
  // Si ya es un código del CRM se respeta tal cual: traducirlo lo estropearía
  // («AF» no casa con ningún patrón de texto y acabaría como «DE»).
  if (CODIGOS.has(t.toUpperCase())) return t.toUpperCase();
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
 * Lee un «listado de asegurados» de una colectiva de autos.
 *
 * Es el otro formato con que llegan las colectivas: una cabecera con TOMADOR y
 * PÓLIZA, y luego una fila por vehículo con placa, recibo, vigencia y prima.
 * Lo usan las colectivas de flota (Logiter) y no tiene nada que ver con los
 * débitos de Sura, salvo que acaba en la misma tabla de amparados.
 *
 * Devuelve un único «mes» porque un listado de estos es una foto de la flota,
 * no una serie mensual; el mes se toma de la fecha de inicio de vigencia.
 */
export function leerListadoPlacas(texto: string): MesLeido {
  const lineas = texto.split(/\r?\n/);
  let tomador = "";
  let poliza = "";
  const amparados: AmparadoLeido[] = [];
  let enTabla = false;
  let inicio = "";

  for (const linea of lineas) {
    const c = linea.split("\t").map((x) => x.trim());
    if (/^tomador$/i.test(c[0] ?? "")) { tomador = c[1] ?? ""; continue; }
    if (/^p[oó]liza$/i.test(c[0] ?? "")) { poliza = c[1] ?? ""; continue; }
    if (/^aplica$/i.test(c[0] ?? "")) { enTabla = true; continue; }
    // La sección GPS de abajo repite placas con el detalle del vehículo; si se
    // siguiera leyendo entrarían dos veces.
    if (/^gps$/i.test(c[0] ?? "") || /^placa$/i.test(c[0] ?? "")) { enTabla = false; continue; }
    if (!enTabla) continue;

    const placa = c[1] ?? "";
    if (!placa || !/^\d+$/.test(c[0] ?? "")) continue;
    if (!inicio) inicio = c[3] ?? "";
    amparados.push({
      empresa: tomador,
      polizaNumero: poliza,
      plan: "AUTOS",
      // En una flota el titular es la propia empresa: los vehículos son suyos.
      docEmpleado: poliza,
      nombreEmpleado: tomador,
      nombreAmparado: placa,
      docAmparado: "",
      parentesco: "VE",
      placa,
    });
  }

  // «4/28/2025» -> «Abril 2025», para que el importador lo feche igual que los
  // débitos.
  const m = inicio.match(/^(\d{1,2})\/\d{1,2}\/(\d{4})$/);
  const nombre = m ? `${MESES[Number(m[1]) - 1][0].toUpperCase()}${MESES[Number(m[1]) - 1].slice(1)} ${m[2]}` : "Listado";
  return { nombre, amparados };
}

/**
 * Lector genérico de listados de asegurados.
 *
 * Cada empresa manda su listado con las columnas que le da la gana: Carrillos
 * parte el nombre en cuatro (APELLIDO 1, APELLIDO 2, NOMBRE 1, NOMBRE 2), JYMO
 * manda una hoja de vehículos con Placa y Valor Asegurado, y Sura escribe
 * «Asegurado» a secas. Escribir un lector por empresa envejece mal: en cuanto
 * alguien añade una columna hay que volver aquí.
 *
 * Así que se localiza la fila de encabezados —la primera que contenga algo
 * reconocible— y se mapean las columnas por su nombre. Lo que no se reconoce
 * se ignora en vez de romper.
 *
 * Si aparece una columna de placa, el listado es de vehículos; si no, de
 * personas.
 */
const COLUMNAS: [string, RegExp][] = [
  // En plural o singular: cada empresa titula la columna a su manera.
  ["placa", /^placas?$/i],
  // Las relaciones de VIDA GRUPO de Sura separan al titular del cubierto y ya
  // traen el parentesco en el código del CRM (AF/CO/HI), así que se aprovechan
  // en vez de tratar cada fila como un afiliado suelto.
  ["docEmpleado", /^id afiliado$/i],
  ["docAmparado", /^id asegurado$/i],
  ["parentesco", /^parentesco$/i],
  ["sexo", /^sexo$/i],
  ["valorVida", /^valor asegurado vida$/i],
  ["doc", /^(n[uú]mero de documento|documento|c[eé]dula|cc|identificaci[oó]n|n\.? ?º? ?identificaci[oó]n)$/i],
  ["nombre", /^(nombre completo|nombre|asegurado|nombre del asegurado|empleado)$/i],
  ["nombre1", /^nombre ?1$/i],
  ["nombre2", /^nombre ?2$/i],
  ["apellido1", /^apellido ?1$/i],
  ["apellido2", /^apellido ?2$/i],
  ["valor", /^valor asegurado$/i],
  ["prima", /^prima( base| mensual)?$/i],
  ["nacimiento", /^fecha de nacimiento/i],
];

export function leerListadoLibre(
  texto: string,
  empresa: string,
  poliza: string,
  plan: string
): MesLeido {
  const filas = texto.split(/\r?\n/).map((l) => l.split("\t").map((c) => c.trim()));

  // Fila de encabezados: la que reconozca más columnas, y al menos dos.
  let mejor = -1;
  let mapa: Record<string, number> = {};
  for (let i = 0; i < filas.length; i++) {
    const m: Record<string, number> = {};
    filas[i].forEach((celda, j) => {
      for (const [clave, re] of COLUMNAS) if (m[clave] === undefined && re.test(celda)) m[clave] = j;
    });
    if (Object.keys(m).length > Object.keys(mapa).length) {
      mapa = m;
      mejor = i;
    }
  }
  /*
   * Con la columna de placa basta: un listado de flota puede no traer nada más
   * reconocible («PLACAS · VALOR POLIZA · VALOR MENSUAL»), y exigir dos
   * columnas lo dejaba fuera. Para personas sí se piden dos, porque un único
   * encabezado suelto suele ser una coincidencia y no una tabla.
   */
  const suficiente = mapa.placa !== undefined || Object.keys(mapa).length >= 2;
  if (mejor < 0 || !suficiente) return { nombre: "Listado", amparados: [] };

  const dePlacas = mapa.placa !== undefined;
  const amparados: AmparadoLeido[] = [];

  for (const f of filas.slice(mejor + 1)) {
    const en = (k: string) => (mapa[k] === undefined ? "" : (f[mapa[k]] ?? "").trim());

    if (dePlacas) {
      const placa = en("placa");
      // Las placas colombianas son tres letras y tres dígitos (o dos y una
      // letra en motos). Este filtro deja fuera los totales y las notas al pie.
      if (!/^[A-Z]{3}[0-9]{2,3}[A-Z]?$/i.test(placa)) continue;
      amparados.push({
        empresa,
        polizaNumero: poliza,
        plan,
        docEmpleado: poliza,
        nombreEmpleado: empresa,
        nombreAmparado: placa.toUpperCase(),
        docAmparado: "",
        parentesco: "VE",
        placa: placa.toUpperCase(),
      });
      continue;
    }

    const nombre =
      en("nombre") ||
      [en("nombre1"), en("nombre2"), en("apellido1"), en("apellido2")]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    // Sin nombre no hay amparado; sin documento sí puede haberlo (los
    // beneficiarios suelen venir sin él).
    if (!nombre || nombre.length < 4) continue;

    /*
     * Dos formas de listado de personas:
     *  · con titular y cubierto separados (VIDA GRUPO de Sura), donde el
     *    parentesco viene dado y hay que respetarlo;
     *  · una fila por persona, que entonces es el propio afiliado.
     */
    const docEmp = en("docEmpleado");
    const docAmp = en("docAmparado") || en("doc");
    const parentesco = en("parentesco")
      ? codigoParentesco(en("parentesco"))
      : docEmp && docAmp && docEmp !== docAmp
        ? "DE"
        : "AF";

    amparados.push({
      empresa,
      polizaNumero: poliza,
      plan,
      docEmpleado: docEmp || docAmp || poliza,
      nombreEmpleado: nombre,
      nombreAmparado: nombre.toUpperCase(),
      docAmparado: docAmp,
      parentesco,
      placa: null,
    });
  }

  return { nombre: "Listado", amparados };
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
