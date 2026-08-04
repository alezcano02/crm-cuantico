/**
 * Lectura automática de una póliza en PDF.
 *
 * ⚠ SIN TERMINAR — NO ESTÁ CONECTADO A LA INTERFAZ TODAVÍA.
 *
 * Medido sobre 14 pólizas reales de la carpeta de asesores:
 *   · compañía   12/14  ✔ sirve
 *   · ramo       11/14  ✔ sirve
 *   · número      2/14  ✘ insuficiente
 *   · vigencia    3/14  ✘ insuficiente
 *   · prima       2/14  ✘ insuficiente
 *
 * El motivo está identificado: en ALLIANZ y AXA los campos vienen como
 * «etiqueta: valor» y estos patrones los cogen, pero en LIBERTY, SURA y HDI
 * vienen en TABLA —una fila con «RAMO PRODUCTO PÓLIZA CERTIFICADO» y la
 * siguiente con los valores—, y un patrón por renglón no puede emparejarlos.
 * Para esos hace falta leer por posición de columna (pdfjs da la coordenada x
 * de cada fragmento, `pdftotext -layout` no).
 *
 * Lo que SÍ está terminado y probado es `montoColombiano()`: 7 de 7 casos,
 * incluidas las dos convenciones decimales que conviven en estos documentos.
 * Es la pieza donde un error costaría más caro.
 *
 * QUÉ HACE Y QUÉ NO
 *
 * Propone valores; no guarda nada. Cada campo vuelve con su grado de certeza y
 * con el trozo de texto del que salió, para que quien ingresa la póliza pueda
 * comprobarlo de un vistazo antes de aceptar. Eso no es exceso de celo: estas
 * cifras alimentan el seguimiento de producción, y una prima mal leída
 * descuadra el informe del año.
 *
 * Por qué hace falta esa cautela, en concreto:
 *
 * · Los PDF de las compañías vienen a dos columnas y `pdftotext` mezcla las
 *   etiquetas de una con los valores de la otra. En un certificado de Allianz
 *   se lee «Placa: CAMIONETA PASAJ.», y eso es la clase del vehículo, no la
 *   placa. Por eso la placa se busca por su forma (tres letras y tres cifras),
 *   no por lo que haya después de la etiqueta.
 *
 * · Conviven dos convenciones decimales: «2.301.383,00» y «176,551.60».
 *   Confundirlas cambia el valor por mil. `montoColombiano()` decide por la
 *   posición del último separador y, si el número queda ambiguo, baja la
 *   certeza en vez de adivinar.
 *
 * · La prima casi nunca está rotulada «PRIMA NETA»: aparece como «Valor a
 *   pagar», «PRIMA», «Total a pagar»… y a veces no está en las primeras
 *   páginas. Cuando no se encuentra, se devuelve vacía; nunca se estima.
 */

export type Certeza = "alta" | "media" | "baja";

export interface CampoExtraido<T = string> {
  valor: T | null;
  certeza: Certeza;
  /** Fragmento del PDF del que salió, para poder comprobarlo. */
  evidencia: string | null;
}

export interface PolizaExtraida {
  numero: CampoExtraido;
  aseguradora: CampoExtraido;
  asegurado: CampoExtraido;
  ccNit: CampoExtraido;
  placa: CampoExtraido;
  ramo: CampoExtraido;
  vigenciaDesde: CampoExtraido;
  vigenciaHasta: CampoExtraido;
  primaNeta: CampoExtraido<number>;
  primaTotal: CampoExtraido<number>;
  formaPago: CampoExtraido;
  /** Cuántos campos salieron con certeza alta, para el resumen de la interfaz. */
  camposSeguros: number;
  /** Texto plano, por si hay que mirar algo a mano. */
  textoPlano: string;
}

const vacio = (): CampoExtraido => ({ valor: null, certeza: "baja", evidencia: null });

/** Compañías que la agencia maneja, tal como se escriben en LISTAS. */
const ASEGURADORAS: [RegExp, string][] = [
  [/allianz/i, "ALLIANZ"],
  [/axa\s*colpatria|colpatria/i, "AXA COLPATRIA"],
  [/suramericana|\bsura\b/i, "SURA"],
  [/mapfre/i, "MAPFRE"],
  [/seguros\s+del\s+estado|segurestado/i, "SEGUROS DEL ESTADO"],
  [/previsora/i, "PREVISORA"],
  [/zurich/i, "ZURICH"],
  [/\bsbs\b/i, "SBS"],
  [/bol[ií]var/i, "BOLIVAR"],
  [/equidad/i, "EQUIDAD"],
  [/\bhdi\b/i, "HDI"],
  [/solidaria/i, "SOLIDARIA"],
  [/mundial/i, "MUNDIAL"],
  [/liberty/i, "LIBERTY"],
  [/qualitas|quálitas/i, "QUALITAS"],
  [/\bbbva\b/i, "BBVA"],
];

/** Pistas del ramo, en el vocabulario que ya usa el CRM. */
const RAMOS: [RegExp, string][] = [
  [/autom[oó]vil|veh[ií]culo|livianos|motos?\b/i, "AUTOS"],
  [/copropiedad|propiedad\s+horizontal|zona\s+com[uú]n/i, "ZONA COMUN"],
  [/\bhogar\b/i, "HOGAR"],
  [/\bsalud\b/i, "SALUD"],
  [/\bvida\b/i, "VIDA"],
  [/arrendamiento/i, "ARRENDAMIENTO"],
  [/mascota|peludo/i, "MASCOTAS"],
  [/\bpyme\b|peque[ñn]a\s+y\s+mediana/i, "PYME"],
  [/responsabilidad\s+civil\s+profesional/i, "RC PROFESIONAL"],
  [/cumplimiento/i, "CUMPLIMIENTO"],
];

/**
 * Convierte un número de un PDF colombiano a `number`.
 *
 * Decide por el ÚLTIMO separador: si va seguido de exactamente dos dígitos y el
 * otro separador aparece antes, ese último es el decimal. Devuelve también si
 * quedó alguna duda, para no dar por buena una cifra ambigua.
 */
export function montoColombiano(bruto: string): { valor: number | null; seguro: boolean } {
  const limpio = bruto.replace(/[^\d.,]/g, "");
  if (!limpio || !/\d/.test(limpio)) return { valor: null, seguro: false };

  const ultimaComa = limpio.lastIndexOf(",");
  const ultimoPunto = limpio.lastIndexOf(".");
  const corte = Math.max(ultimaComa, ultimoPunto);

  // Sin separadores: entero limpio.
  if (corte < 0) {
    const n = Number(limpio);
    return { valor: Number.isFinite(n) ? n : null, seguro: true };
  }

  const decimales = limpio.length - corte - 1;
  let entero: string;
  let fraccion = "";

  if (decimales === 2 && limpio.slice(0, corte).match(/[.,]/)) {
    // Hay otro separador antes: el último es decimal, sin duda.
    entero = limpio.slice(0, corte).replace(/[.,]/g, "");
    fraccion = limpio.slice(corte + 1);
  } else if (decimales === 3) {
    // Tres dígitos detrás: es separador de miles.
    entero = limpio.replace(/[.,]/g, "");
  } else if (decimales === 2) {
    // Un solo separador y dos dígitos: "176,55" puede ser 176,55 o 17.655.
    // Se toma como decimal, que es lo habitual, pero se marca la duda.
    entero = limpio.slice(0, corte).replace(/[.,]/g, "");
    fraccion = limpio.slice(corte + 1);
    const n = Number(`${entero}.${fraccion}`);
    return { valor: Number.isFinite(n) ? n : null, seguro: false };
  } else {
    entero = limpio.replace(/[.,]/g, "");
  }

  const n = Number(fraccion ? `${entero}.${fraccion}` : entero);
  return { valor: Number.isFinite(n) ? n : null, seguro: true };
}

/** Normaliza una fecha del PDF a AAAA-MM-DD. */
function fechaISO(bruto: string): string | null {
  const m = bruto.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) {
    const [, d, mes, a] = m;
    const anio = a.length === 2 ? `20${a}` : a;
    const dd = d.padStart(2, "0");
    const mm = mes.padStart(2, "0");
    if (Number(mm) > 12) return null;
    return `${anio}-${mm}-${dd}`;
  }
  // "29 de mayo de 2026"
  const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio",
    "agosto","septiembre","octubre","noviembre","diciembre"];
  const t = bruto.toLowerCase().match(/(\d{1,2})\s+de\s+([a-zñáéíóú]+)\s+de\s+(\d{4})/);
  if (t) {
    const i = MESES.findIndex((x) => x.startsWith(t[2].slice(0, 4)));
    if (i >= 0) return `${t[3]}-${String(i + 1).padStart(2, "0")}-${t[1].padStart(2, "0")}`;
  }
  return null;
}

/** Busca el primer patrón que acierte y devuelve el grupo 1 con su renglón. */
function buscar(
  texto: string,
  patrones: RegExp[],
  certeza: Certeza = "alta"
): CampoExtraido {
  for (const p of patrones) {
    const m = texto.match(p);
    if (m && m[1] && m[1].trim()) {
      const linea = texto
        .slice(Math.max(0, m.index! - 40), m.index! + m[0].length + 40)
        .replace(/\s+/g, " ")
        .trim();
      return { valor: m[1].trim(), certeza, evidencia: linea };
    }
  }
  return vacio();
}

export function extraerPoliza(texto: string): PolizaExtraida {
  const t = texto.replace(/ /g, " ");

  // ---- Número de póliza -------------------------------------------------
  const numero = buscar(t, [
    /p[oó]liza\s*(?:n[oº°]\.?|no\.?|n[uú]mero|num\.?)\s*[:#]?\s*([0-9][0-9\-]{4,})/i,
    /(?:^|\n)\s*p[oó]liza\s*[:#]\s*([0-9][0-9\-]{4,})/i,
    /certificado\s*(?:n[oº°]\.?|no\.?)\s*[:#]?\s*([0-9][0-9\-]{4,})/i,
  ]);

  // ---- Aseguradora: por marca en el documento ---------------------------
  let aseguradora = vacio();
  for (const [re, nombre] of ASEGURADORAS) {
    const m = t.match(re);
    if (m) {
      aseguradora = {
        valor: nombre,
        certeza: "alta",
        evidencia: t.slice(Math.max(0, m.index! - 30), m.index! + 40).replace(/\s+/g, " ").trim(),
      };
      break;
    }
  }

  // ---- Ramo: por vocabulario del documento ------------------------------
  let ramo = vacio();
  for (const [re, nombre] of RAMOS) {
    const m = t.match(re);
    if (m) {
      ramo = {
        valor: nombre,
        certeza: "media", // el vocabulario acierta casi siempre, pero no es un rótulo
        evidencia: t.slice(Math.max(0, m.index! - 30), m.index! + 40).replace(/\s+/g, " ").trim(),
      };
      break;
    }
  }

  // ---- Tomador / asegurado ----------------------------------------------
  const asegurado = buscar(t, [
    /tomador\s*(?:del\s*seguro)?\s*[:]\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .,'-]{5,60})/i,
    /asegurado\s*(?:principal)?\s*[:]\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .,'-]{5,60})/i,
    /datos\s+generales\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .,'-]{5,60})\s+(?:cc|nit)/i,
  ], "media");

  // ---- Documento del cliente --------------------------------------------
  const ccNit = buscar(t, [
    /\bnit\s*[:.]?\s*([0-9][0-9.\-]{6,15})/i,
    /\bc\.?\s?c\.?\s*[:.]?\s*([0-9][0-9.\-]{5,15})/i,
    /(?:c[eé]dula|documento)\s*[:.]?\s*([0-9][0-9.\-]{5,15})/i,
  ]);

  // ---- Placa: por forma, NUNCA por etiqueta ------------------------------
  // En los PDF a dos columnas lo que sigue a "Placa:" suele ser otra cosa.
  let placa = vacio();
  const placas = t.match(/\b[A-Z]{3}[\s-]?\d{2,3}[A-Z]?\b/g);
  if (placas && placas.length) {
    // Se descartan siglas frecuentes que casan con el patrón.
    const cand = placas.filter((p) => !/^(NIT|IVA|SOA|PDF|COL|CRA|CLL|APT)/i.test(p));
    if (cand.length) {
      const elegida = cand[0].replace(/[\s-]/g, "");
      placa = {
        valor: elegida,
        // Si aparece más de una, hay que mirarla.
        certeza: new Set(cand.map((c) => c.replace(/[\s-]/g, ""))).size === 1 ? "alta" : "media",
        evidencia: `Encontrada${cand.length > 1 ? ` entre ${new Set(cand).size} posibles` : ""}: ${elegida}`,
      };
    }
  }

  // ---- Vigencia ----------------------------------------------------------
  const rangoVigencia = t.match(
    /(?:vigencia|duraci[oó]n)[^\n]{0,80}?desde[^\d]{0,20}(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})[^\d]{0,40}?hasta[^\d]{0,20}(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i
  );
  let vigenciaDesde = vacio();
  let vigenciaHasta = vacio();
  if (rangoVigencia) {
    const ev = rangoVigencia[0].replace(/\s+/g, " ").trim().slice(0, 120);
    vigenciaDesde = { valor: fechaISO(rangoVigencia[1]), certeza: "alta", evidencia: ev };
    vigenciaHasta = { valor: fechaISO(rangoVigencia[2]), certeza: "alta", evidencia: ev };
  } else {
    const d = buscar(t, [/desde[^\d]{0,20}(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i], "media");
    const h = buscar(t, [/hasta[^\d]{0,20}(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i], "media");
    if (d.valor) vigenciaDesde = { ...d, valor: fechaISO(d.valor) };
    if (h.valor) vigenciaHasta = { ...h, valor: fechaISO(h.valor) };
  }

  // ---- Primas ------------------------------------------------------------
  const monto = (patrones: RegExp[]): CampoExtraido<number> => {
    for (const p of patrones) {
      const m = t.match(p);
      if (m && m[1]) {
        const { valor, seguro } = montoColombiano(m[1]);
        if (valor != null && valor > 0) {
          return {
            valor,
            certeza: seguro ? "media" : "baja", // nunca "alta": el rótulo varía demasiado
            evidencia: m[0].replace(/\s+/g, " ").trim().slice(0, 90),
          };
        }
      }
    }
    return { valor: null, certeza: "baja", evidencia: null };
  };

  const primaNeta = monto([
    /prima\s+neta\s*[:$]?\s*([\d.,]{4,})/i,
    /\bprima\s*[:$]\s*([\d.,]{4,})/i,
    /subtotal\s*[:$]?\s*([\d.,]{4,})/i,
  ]);
  const primaTotal = monto([
    /prima\s+total\s*[:$]?\s*([\d.,]{4,})/i,
    /(?:valor|total)\s+a\s+pagar\s*[:$]?\s*([\d.,]{4,})/i,
    /total\s+p[oó]liza\s*[:$]?\s*([\d.,]{4,})/i,
  ]);

  const formaPago = buscar(t, [
    /forma\s+de\s+pago\s*[:]?\s*([A-Za-zÁÉÍÓÚÑáéíóúñ ]{4,24})/i,
    /\b(contado|mensual|trimestral|semestral|financiado|d[eé]bito autom[aá]tico)\b/i,
  ], "media");

  const campos = [numero, aseguradora, asegurado, ccNit, placa, ramo,
    vigenciaDesde, vigenciaHasta, primaNeta, primaTotal, formaPago];
  const camposSeguros = campos.filter(
    (c) => c.valor != null && c.certeza === "alta"
  ).length;

  return {
    numero, aseguradora, asegurado, ccNit, placa, ramo,
    vigenciaDesde, vigenciaHasta, primaNeta, primaTotal, formaPago,
    camposSeguros,
    textoPlano: t.slice(0, 20000),
  };
}
