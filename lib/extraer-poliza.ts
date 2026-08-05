import type { Fila, Fragmento } from "./pdf-layout";
import { valorALaDerecha, valorDebajo } from "./pdf-layout";

/**
 * Lectura automática de una póliza en PDF.
 *
 * PROPONE, NO GUARDA. Cada campo vuelve con su grado de certeza y con el
 * fragmento del que salió, para que quien ingresa la póliza lo compruebe antes
 * de aceptar. Estas cifras alimentan el seguimiento de producción: una prima
 * mal leída descuadra el informe del año.
 *
 * POR QUÉ LEE POR COORDENADAS Y NO POR TEXTO PLANO
 *
 * Estos PDF vienen a dos columnas y aplanarlos a texto cruza las etiquetas de
 * una con los valores de otra: `pdftotext` devolvía «Placa: CAMIONETA PASAJ.»,
 * que es la clase del vehículo. Trabajando sobre las filas reconstruidas
 * (ver lib/pdf-layout.ts) la misma póliza da «Placa: HGZ192».
 *
 * Además conviven dos maquetaciones:
 *  · ALLIANZ, AXA — «etiqueta: valor» en la misma fila.
 *  · LIBERTY, SURA, HDI — TABLA: una fila de encabezados y los valores debajo.
 * Se prueban las dos, en ese orden.
 */

export type Certeza = "alta" | "media" | "baja";

export interface CampoExtraido<T = string> {
  valor: T | null;
  certeza: Certeza;
  /** De dónde salió, para poder comprobarlo de un vistazo. */
  evidencia: string | null;
}

/**
 * Qué clase de documento resultó ser. Importa decirlo: buena parte de los PDF
 * guardados con nombre de póliza son en realidad recibos de pago o escaneos, y
 * devolver campos vacíos sin explicar por qué parece un fallo del lector.
 */
export type TipoDocumento =
  | "poliza"
  | "recibo"
  | "cotizacion"
  | "escaneado"
  | "desconocido";

export interface PolizaExtraida {
  tipo: TipoDocumento;
  /** Explicación para la interfaz cuando no se pudo leer gran cosa. */
  aviso: string | null;
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
  camposEncontrados: number;
  camposDudosos: number;
}

const vacio = (): CampoExtraido => ({ valor: null, certeza: "baja", evidencia: null });
const recortar = (s: string, n = 95) => s.replace(/\s+/g, " ").trim().slice(0, n);

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

const RAMOS: [RegExp, string][] = [
  [/copropiedad|propiedad\s+horizontal|zona\s+com[uú]n/i, "ZONA COMUN"],
  [/autom[oó]vil|veh[ií]culo|livianos|\bmotos?\b|pesados/i, "AUTOS"],
  [/\bhogar\b/i, "HOGAR"],
  [/\bsalud\b/i, "SALUD"],
  [/arrendamiento/i, "ARRENDAMIENTO"],
  [/mascota|peludo/i, "MASCOTAS"],
  [/\bpyme\b/i, "PYME"],
  [/responsabilidad\s+civil\s+profesional|\brc\s+profesional/i, "RC PROFESIONAL"],
  [/cumplimiento/i, "CUMPLIMIENTO"],
  [/\bvida\b/i, "VIDA"],
];

/**
 * Reglas propias de cada compañía, que se prueban ANTES del lector genérico.
 *
 * El lector genérico tiene un techo: cada compañía rotula distinto y, buscando
 * un patrón que le sirva a todas, o se deja campos fuera o se cogen cifras que
 * no son. Aquí cada una declara dónde tiene lo suyo, en expresiones que se
 * prueban fila por fila y devuelven el grupo 1.
 *
 * La compañía no se le pregunta a nadie: se detecta del propio documento (ver
 * ASEGURADORAS), que acierta en el 100% de la muestra. Si algún día deja de
 * acertar, basta con pasar `companiaForzada` a extraerPoliza.
 *
 * Para añadir una compañía: mirar sus filas con scripts/probar-extractor.ts y
 * declarar solo los campos que el genérico falla. Lo que no esté aquí sigue
 * saliendo por el camino de siempre.
 */
type CampoCompania = "numero" | "asegurado" | "ccNit" | "primaNeta" | "primaTotal";
type ReglasCompania = Partial<Record<CampoCompania, RegExp[]>> & {
  /**
   * Encabezados de tabla cuyo valor cuelga DEBAJO, no a la derecha. Es como
   * trae SURA la prima y los datos del tomador.
   */
  tablas?: Partial<Record<CampoCompania, RegExp[]>>;
};

const POR_COMPANIA: Record<string, ReglasCompania> = {
  ALLIANZ: {
    numero: [/p[oó]liza\s*n[ºo°]?\.?\s*:?\s*(\d{6,})/i],
    asegurado: [/^(.{6,60}?)\s+CC\s*:?\s*\d/i],
    ccNit: [/\bCC\s*:?\s*(\d[\d.]{5,15})/i],
    // «PRIMA 1.469.429,00» al principio de la fila; el IVA va en la siguiente.
    primaNeta: [/^\s*PRIMA\s+([\d.,]{6,})/i],
  },
  "AXA COLPATRIA": {
    asegurado: [/^TOMADOR\s+(.{6,60}?)\s+(?:CC|NIT)\s/i],
    ccNit: [/^TOMADOR\s+.{6,60}?\s+CC\s+(\d[\d.\-]{5,15})/i],
  },
  EQUIDAD: {
    asegurado: [
      /Nombre:\s*(.{6,60}?)\s+C\.?\s?C\.?\s*\d/i,
      // Copropiedad: «TOMADOR URBANIZACIÓN BIZET 1 PH NIT/CC 900155524»
      /^TOMADOR\s+(.{6,60}?)\s+NIT\s*\/\s*CC\s*\d/i,
    ],
    ccNit: [
      /Nombre:.{6,60}?\s+C\.?\s?C\.?\s*(\d{5,15})/i,
      /^TOMADOR\s+.{6,60}?\s+NIT\s*\/\s*CC\s*(\d{5,15})/i,
    ],
    // En copropiedad los rótulos van en una fila y las cifras en la siguiente.
    tablas: {
      primaNeta: [/^PRIMA\s+NETA$/i],
      primaTotal: [/^TOTAL\s+POR\s+PAGAR$/i],
    },
  },
  SBS: {
    asegurado: [/Nombres\s+y\s+Apellidos:\s*(.{6,60}?)(?:\s{2,}|\s+Nombres|$)/i],
    // «Tipo y No. de Documento: (CC) 32135689»
    ccNit: [/Tipo\s+y\s+No\.\s*de\s+Documento:\s*\(?[A-Z]{2}\)?\s*(\d{5,15})/i],
    primaNeta: [/Prima\s+Neta[\s:$*]*([\d.,]{5,})/i],
    primaTotal: [/Prima\s+anual[^$]*[\s:$*]*([\d.,]{5,})/i],
  },
  MUNDIAL: {
    primaNeta: [/PRIMA\s+NETA[\s:$*]*([\d.,]{5,})/i],
    primaTotal: [/TOTAL\s+A\s+PAGAR[\s:$*]*([\d.,]{5,})/i],
  },
  ZURICH: {
    // «PRIMA COP 2.803.771,69»: la moneda va entre el rótulo y la cifra.
    primaNeta: [/\bPRIMA\s+(?:COP|\$)?\s*([\d.,]{6,})/i],
  },
  HDI: {
    // Ojo: en la carátula de autos conviven «PRIMA VIGENCIA» (la neta) y
    // «PRIMA GASTOS DE EXPEDICION» (que no lo es). Por eso se ancla al rótulo
    // completo y no a «PRIMA» a secas.
    primaNeta: [/PRIMA\s+VIGENCIA[\s:$*]*([\d.,]{5,})/i, /TOTAL\s+PRIMA[\s:$*]*([\d.,]{5,})/i],
    primaTotal: [/TOTAL\s+A\s+PAGAR[\s:$*]*([\d.,]{5,})/i],
    asegurado: [/NOMBRE:\s*(.{6,60}?)(?:\s{2,}|\s+TIPO\b|$)/i],
    ccNit: [/IDENTIFICACI[OÓ]N:?\s*(\d{5,15})/i],
  },
  BOLIVAR: {
    numero: [/P[oó]liza\s*N[°º]?\s*(\d{6,})/i],
  },
  PREVISORA: {
    primaTotal: [/TOTAL\s+A\s+PAGAR(?:\s+EN\s+PESOS)?[\s:$*]*([\d.,]{5,})/i],
  },
  SURA: {
    // Todo va en tablas: el rótulo arriba y el dato en la fila de abajo.
    // «Valor anual sin IVA» es la prima neta; sumada al IVA da el «valor que
    // debes pagar» (1.063.611 + 202.086 = 1.265.697 en la muestra).
    tablas: {
      asegurado: [/^Nombres\s+y\s+apellidos\s+o\s+raz[oó]n\s+social$/i],
      ccNit: [/^C[eé]dula$/i, /^Nit$/i],
      primaNeta: [/^Valor\s+anual\s+sin\s+IVA$/i],
    },
  },
};

/** Como `porReglas`, pero para valores que cuelgan de un encabezado de tabla. */
function porReglasTabla(
  filas: Fila[],
  expresiones: RegExp[] | undefined,
  validar: (v: string) => string | null
): CampoExtraido | null {
  if (!expresiones) return null;
  for (const re of expresiones) {
    for (const c of porTabla(filas, re)) {
      const v = validar(c.valor);
      if (v) return { valor: v, certeza: "alta", evidencia: recortar(c.fila.texto) };
    }
  }
  return null;
}

/** Primera fila que case con alguna de las expresiones y pase el filtro. */
function porReglas(
  filas: Fila[],
  expresiones: RegExp[] | undefined,
  validar: (v: string) => string | null
): CampoExtraido | null {
  if (!expresiones) return null;
  for (const re of expresiones) {
    for (const f of filas) {
      const m = f.texto.match(re);
      if (!m || !m[1]) continue;
      const v = validar(m[1]);
      if (v) return { valor: v, certeza: "alta", evidencia: recortar(f.texto) };
    }
  }
  return null;
}

/**
 * Convierte un número de un PDF colombiano a `number`.
 *
 * Conviven «2.301.383,00» y «176,551.60»: confundirlas cambia la cifra por
 * mil. Se decide por la posición del último separador y, si queda ambiguo, se
 * marca como no seguro en vez de adivinar.
 */
export function montoColombiano(bruto: string): { valor: number | null; seguro: boolean } {
  const limpio = bruto.replace(/[^\d.,]/g, "");
  if (!limpio || !/\d/.test(limpio)) return { valor: null, seguro: false };

  const corte = Math.max(limpio.lastIndexOf(","), limpio.lastIndexOf("."));
  if (corte < 0) {
    const n = Number(limpio);
    return { valor: Number.isFinite(n) ? n : null, seguro: true };
  }

  const decimales = limpio.length - corte - 1;
  let entero: string;
  let fraccion = "";

  if (decimales === 2 && /[.,]/.test(limpio.slice(0, corte))) {
    entero = limpio.slice(0, corte).replace(/[.,]/g, "");
    fraccion = limpio.slice(corte + 1);
  } else if (decimales === 3) {
    entero = limpio.replace(/[.,]/g, "");
  } else if (decimales === 2) {
    // Un único separador con dos dígitos detrás: «176,55» tanto puede ser
    // 176,55 como 17.655. Se toma lo habitual pero se avisa.
    const n = Number(`${limpio.slice(0, corte).replace(/[.,]/g, "")}.${limpio.slice(corte + 1)}`);
    return { valor: Number.isFinite(n) ? n : null, seguro: false };
  } else {
    entero = limpio.replace(/[.,]/g, "");
  }

  const n = Number(fraccion ? `${entero}.${fraccion}` : entero);
  return { valor: Number.isFinite(n) ? n : null, seguro: true };
}

const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio",
  "agosto","septiembre","octubre","noviembre","diciembre"];

/**
 * Índice 0–11 de un mes escrito con letras, entero o abreviado.
 *
 * Basta comparar las tres primeras letras: los doce meses se distinguen entre
 * sí con ese prefijo y ninguno lleva tilde ahí, así que no hace falta
 * normalizar acentos. Eso además hace que «sept», «set» y «sep» caigan todos
 * en septiembre.
 */
function mesPorNombre(nombre: string): number {
  const n = nombre.toLowerCase().slice(0, 3);
  return MESES.findIndex((x) => x.startsWith(n));
}

/** Arma la fecha comprobando que el día y el año sean posibles. */
function armar(anio: string, mes: number, dia: string): string | null {
  if (mes < 0 || mes > 11) return null;
  if (Number(dia) > 31 || Number(dia) < 1) return null;
  if (Number(anio) < 1990 || Number(anio) > 2100) return null;
  return `${anio}-${String(mes + 1).padStart(2, "0")}-${dia.padStart(2, "0")}`;
}

/** Normaliza una fecha a AAAA-MM-DD, rechazando lo imposible. */
export function fechaISO(bruto: string): string | null {
  const m = bruto.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) {
    const [, d, mes, a] = m;
    const anio = a.length === 2 ? `20${a}` : a;
    if (Number(mes) > 12 || Number(mes) < 1) return null;
    return armar(anio, Number(mes) - 1, d);
  }

  // HDI (antes Liberty) fecha con el mes en letras abreviado, en los dos
  // órdenes que usa en la misma carátula: «25-JUL-2026» en la vigencia y
  // «2026-JUL-18» en los certificados de modificación.
  const dma = bruto.match(/\b(\d{1,2})[-/\s]([a-zA-ZñÑáéíóúÁÉÍÓÚ]{3,10})\.?[-/\s](\d{4})\b/);
  if (dma) {
    const f = armar(dma[3], mesPorNombre(dma[2]), dma[1]);
    if (f) return f;
  }
  const amd = bruto.match(/\b(\d{4})[-/\s]([a-zA-ZñÑáéíóúÁÉÍÓÚ]{3,10})\.?[-/\s](\d{1,2})\b/);
  if (amd) {
    const f = armar(amd[1], mesPorNombre(amd[2]), amd[3]);
    if (f) return f;
  }

  const t = bruto.toLowerCase().match(/(\d{1,2})\s+de\s+([a-zñáéíóú]+)\s+de\s+(\d{4})/);
  if (t) return armar(t[3], mesPorNombre(t[2]), t[1]);
  return null;
}

/**
 * TODAS las apariciones de una etiqueta, con lo que hay a su derecha.
 *
 * Se devuelven todas y no la primera porque el mismo rótulo se repite dentro de
 * una carátula y no siempre es la primera la que trae el dato: en HDI hay dos
 * bloques «DESDE / HASTA» —vigencia del seguro y vigencia del documento— y
 * también tres «NOMBRE:» (tomador, asegurado y beneficiario). Quien decide
 * cuál sirve es el validador de `campo`, no el orden de aparición.
 */
function porEtiqueta(filas: Fila[], etiqueta: RegExp): { valor: string; fila: Fila }[] {
  const halladas: { valor: string; fila: Fila }[] = [];
  for (const fila of filas) {
    for (let i = 0; i < fila.fragmentos.length; i++) {
      if (!etiqueta.test(fila.fragmentos[i].texto)) continue;
      // El valor puede ir pegado a la etiqueta en el mismo fragmento.
      const propio = fila.fragmentos[i].texto.replace(etiqueta, "").replace(/^[\s:.#]+/, "");
      const derecha = valorALaDerecha(fila, i);
      const valor = (propio || derecha).trim();
      if (valor) halladas.push({ valor, fila });
    }
  }
  return halladas;
}

/** Todas las celdas que cuelgan de un encabezado de tabla. Ver `porEtiqueta`. */
function porTabla(filas: Fila[], encabezado: RegExp): { valor: string; fila: Fila }[] {
  const halladas: { valor: string; fila: Fila }[] = [];
  for (let f = 0; f < filas.length; f++) {
    for (const frag of filas[f].fragmentos) {
      if (!encabezado.test(frag.texto.trim())) continue;
      const abajo = valorDebajo(filas, f, frag);
      if (abajo) halladas.push({ valor: abajo, fila: filas[f] });
    }
  }
  return halladas;
}

/**
 * Prueba etiqueta y luego tabla; devuelve el primer valor que pase el filtro.
 *
 * Recorre todas las apariciones de cada forma antes de darse por vencido. Antes
 * se quedaba con la primera y, si esa no validaba, devolvía vacío aunque el
 * dato estuviera dos columnas más allá: así se perdía la vigencia entera de
 * HDI, porque bajo su primer «DESDE» está «HI» —la sigla de la hora— y las
 * fechas cuelgan del segundo.
 */
function campo(
  filas: Fila[],
  etiqueta: RegExp,
  encabezado: RegExp | null,
  validar: (v: string) => string | null
): CampoExtraido {
  for (const c of porEtiqueta(filas, etiqueta)) {
    const v = validar(c.valor);
    if (v) return { valor: v, certeza: "alta", evidencia: recortar(c.fila.texto) };
  }
  if (encabezado) {
    for (const c of porTabla(filas, encabezado)) {
      const v = validar(c.valor);
      if (v) return { valor: v, certeza: "alta", evidencia: recortar(c.fila.texto) };
    }
  }
  return vacio();
}

export function extraerPoliza(filas: Fila[]): PolizaExtraida {
  const texto = filas.map((f) => f.texto).join("\n");

  // ---- Qué clase de documento es ----------------------------------------
  // Un PDF escaneado no trae capa de texto: pdfjs devuelve casi nada, o solo
  // la marca del escáner. Sin OCR no hay nada que hacer, y hay que decirlo.
  const caracteres = texto.replace(/\s/g, "").length;
  let tipo: TipoDocumento = "poliza";
  let aviso: string | null = null;
  if (filas.length === 0 || caracteres < 120 || /scanned by|camscanner/i.test(texto)) {
    tipo = "escaneado";
    aviso =
      "El PDF es una imagen escaneada: no tiene texto que leer. Hay que ingresar la póliza a mano, o pedirle a la compañía el PDF original.";
  } else if (/recibo\s+de\s+pago|referencia\s+de\s+pago|documento\s+de\s+cobro/i.test(texto)) {
    tipo = "recibo";
    aviso =
      "Esto parece un recibo de pago, no la póliza. Se saca lo que trae —suele venir el número y el valor—, pero conviene cargar la carátula de la póliza para tener el resto.";
  } else if (
    /presente\s+cotizaci[oó]n|no\s+constituye\s+una\s+oferta|gracias\s+por\s+cotizar|esta\s+cotizaci[oó]n\s+tiene\s+una\s+vigencia/i.test(
      texto
    ) ||
    // EQUIDAD manda sus cotizaciones de copropiedad como «Nuestra oferta de
    // servicios / Solicitud: COTIZACION COPROPIEDAD», en formato de carta. Se
    // mira solo el encabezado: «cotización» suelta en mitad del clausulado no
    // convierte una póliza expedida en cotización.
    /cotizaci[oó]n|oferta\s+de\s+servicios/i.test(
      filas.slice(0, 12).map((f) => f.texto).join("\n")
    )
  ) {
    // Una cotización no tiene número de póliza porque todavía no se expidió.
    // Antes se contaba como póliza mal leída; decirlo evita buscar un dato que
    // no existe.
    tipo = "cotizacion";
    aviso =
      "Esto es una cotización, no una póliza expedida: todavía no tiene número. Sirve para adelantar el nombre y el valor, pero hay que cargar la póliza cuando salga.";
  } else if (
    // En las carpetas de cliente conviven las carátulas con la correspondencia.
    // Un correo pidiéndole documentos al banco no es una póliza, y tratarlo
    // como tal es peor que inútil: uno de estos daba «BBVA» como aseguradora
    // solo porque el texto mencionaba al banco.
    /\b(cordialmente|agradezco\s+se\s+me|quedo\s+atent[oa]|buenas\s+tardes|buen\s+d[ií]a|reciba\s+un\s+cordial)\b/i.test(
      texto
    ) &&
    !/p[oó]liza\s*(n[oº°]\.?|no\.?|n[uú]mero)\s*[:#]?\s*\d/i.test(texto)
  ) {
    tipo = "desconocido";
    aviso =
      "Esto parece un correo o una carta, no la carátula de una póliza. Cargue el PDF de la póliza para poder leer los datos.";
  }

  // ---- Aseguradora y ramo: por vocabulario del documento -----------------
  // Va primero porque de la compañía dependen las reglas de todo lo demás.
  let aseguradora = vacio();
  for (const [re, nombre] of ASEGURADORAS) {
    const f = filas.find((x) => re.test(x.texto));
    if (f) { aseguradora = { valor: nombre, certeza: "alta", evidencia: recortar(f.texto) }; break; }
  }
  /*
   * El ramo se declara en el TÍTULO de la carátula («PÓLIZA DE SEGURO DE
   * COPROPIEDADES», «PÓLIZA DE SEGUROS HOGAR HDI»), no en el clausulado.
   * Buscándolo en todo el documento, una póliza de arrendamiento de SBS salía
   * como ZONA COMUN porque sus condiciones generales hablan de la propiedad
   * horizontal, y una de copropiedad salía como AUTOS. El ramo se guarda en la
   * base y alimenta el informe de producción por ramo, así que equivocarlo no
   * es cosmético.
   *
   * Se recorre el documento en orden y gana la primera fila con pinta de
   * título, no el primer ramo de la lista: el título va arriba.
   */
  let ramo = vacio();
  const pareceTitulo = (t: string) =>
    t.length < 120 && /p[oó]liza|seguro\s+de|certificado\s+de/i.test(t);
  for (const f of filas) {
    if (!pareceTitulo(f.texto)) continue;
    const encontrado = RAMOS.find(([re]) => re.test(f.texto));
    if (encontrado) {
      ramo = { valor: encontrado[1], certeza: "alta", evidencia: recortar(f.texto) };
      break;
    }
  }
  if (!ramo.valor) {
    // Sin título reconocible se vuelve al vocabulario de todo el documento,
    // pero con certeza baja: es justo el camino que se equivocaba.
    for (const [re, nombre] of RAMOS) {
      const f = filas.find((x) => re.test(x.texto));
      if (f) { ramo = { valor: nombre, certeza: "baja", evidencia: recortar(f.texto) }; break; }
    }
  }

  const reglas: ReglasCompania = POR_COMPANIA[aseguradora.valor ?? ""] ?? {};

  // ---- Número de póliza -------------------------------------------------
  const soloNumero = (v: string): string | null => {
    const m = v.match(/\b(\d[\d-]{4,})\b/);
    if (!m) return null;
    // «023883535 / 0»: el certificado va aparte, se queda el número.
    return m[1].replace(/-+$/, "");
  };
  let numero =
    porReglas(filas, reglas.numero, soloNumero) ??
    campo(
      filas,
      /^p[oó]liza\s*(n[oº°]\.?|no\.?|n[uú]m(ero)?\.?)?\s*[:#]?$|^p[oó]liza\s*n[oº°]/i,
      /^p[oó]liza$/i,
      soloNumero
    );
  if (!numero.valor) {
    // Variante frecuente: todo en una frase dentro de la misma fila.
    for (const f of filas) {
      const m = f.texto.match(/p[oó]liza\s*(?:n[oº°]\.?|no\.?|n[uú]mero)\s*[:#]?\s*(\d[\d-]{4,})/i);
      if (m) { numero = { valor: m[1], certeza: "alta", evidencia: recortar(f.texto) }; break; }
    }
  }

  // ---- Documento del cliente --------------------------------------------
  const soloDocumento = (v: string): string | null => {
    const m = v.match(/\b(\d[\d.\-]{5,15})\b/);
    return m ? m[1] : null;
  };
  // HDI no rotula «NIT» ni «CC» sino «TIPO Y No. DE IDENTIFICACIÓN».
  const ccNit =
    porReglas(filas, reglas.ccNit, soloDocumento) ??
    porReglasTabla(filas, reglas.tablas?.ccNit, soloDocumento) ??
    // Nombre y documento en la misma fila, con o sin dos puntos: AXA y EQUIDAD
    // escriben «CELIA GRANDA VILLA CC 22.147.397», sin ellos.
    (() => {
      for (const f of filas) {
        // «NIT/CC 900155524» de EQUIDAD: la barra rompía la expresión, que
        // exigía el dígito justo detrás del rótulo.
        const m = f.texto.match(
          /\b(?:NIT\s*\/\s*CC|CC\s*\/\s*NIT|CC|C\.\s?C\.?|NIT|C[EÉ]DULA)\s*[:.]?\s*(\d[\d.\-]{5,15})\b/i
        );
        if (m) return { valor: m[1], certeza: "alta" as Certeza, evidencia: recortar(f.texto) };
      }
      return null;
    })() ??
    campo(
      filas,
      /^(nit|c\.?\s?c\.?|c[eé]dula|documento|(?:tipo\s+y\s+)?n[oº°]?\.?\s*de\s+(identificaci[oó]n|documento)|identificaci[oó]n)\s*[:.]?$/i,
      /^(nit|c\.?\s?c\.?|documento|identificaci[oó]n)$/i,
      soloDocumento
    );

  // ---- Tomador / asegurado ----------------------------------------------
  // Ojo: en Allianz «Tomador del Seguro:» tiene la CIUDAD a su derecha; el
  // nombre está en la fila de arriba, junto al documento. Por eso se busca
  // primero la fila que lleva el documento y se toma lo que va antes.
  let asegurado = vacio();
  // Se aceptan mayúsculas («AGUDELO DUQUE, DIANA MARCELA» en Allianz) y también
  // Title Case, porque HDI imprime «Flor Eugenia Zuluaga Duque». Admitir
  // minúsculas abre la puerta a que se cuele una frase suelta, así que se exige
  // además que sean entre 2 y 8 palabras y que todas empiecen en mayúscula.
  const pareceNombre = (s: string) => {
    const t = s.trim();
    if (!/^[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ\s.,'-]{5,60}$/.test(t)) return false;
    if (/(SEGUROS|S\.?A\.?S?\b|LTDA|AGENCIA|NIT|POLIZA|PÓLIZA|CERTIFICADO|MEDELLIN|BOGOTA)/i.test(t))
      return false;
    // Rótulos de la carátula que pasan por nombre: son dos o tres palabras en
    // mayúsculas y sin cifras. «FIRMA AUTORIZADA» se colaba como asegurado en
    // HDI, que la imprime al pie tres veces.
    if (
      /^(FIRMA|TOMADOR|ASEGURADO|BENEFICIARIO|DIRECCI[OÓ]N|CIUDAD|TEL[EÉ]FONO|DEPARTAMENTO|PA[IÍ]S|NOMBRE|CLIENTE|INTERMEDIARIO|COASEGURADOR|OBSERVACIONES|CONDICIONES|AMPAROS)\b/i.test(t)
    )
      return false;
    const palabras = t.split(/\s+/).filter((p) => p.replace(/[.,]/g, "").length > 1);
    if (palabras.length === 0 || palabras.length > 8) return false;
    if (!palabras.every((p) => /^[A-ZÁÉÍÓÚÑ]/.test(p))) return false;
    // Todo en mayúsculas se acepta aunque sea una sola palabra: hay clientes que
    // se llaman así («LOGITER», «CRISTICA»). En cambio, si trae minúsculas se
    // exigen dos palabras o más, porque una sola podría ser cualquier rótulo
    // suelto de la carátula.
    const soloMayusculas = t === t.toUpperCase();
    return soloMayusculas || palabras.length >= 2;
  };
  const validarNombre = (v: string) => (pareceNombre(v) ? v.trim() : null);
  const porRegla =
    porReglas(filas, reglas.asegurado, validarNombre) ??
    porReglasTabla(filas, reglas.tablas?.asegurado, validarNombre);
  if (porRegla) asegurado = porRegla;
  for (const f of filas) {
    if (asegurado.valor) break;
    // Los dos puntos son opcionales: AXA y EQUIDAD escriben «… CC 22.147.397».
    // El rótulo inicial también, porque en copropiedad la fila entera es
    // «TOMADOR URBANIZACIÓN BIZET 1 PH NIT/CC 900155524» y sin descartarlo el
    // nombre salía empezando por «TOMADOR».
    const m = f.texto.match(
      /^(?:TOMADOR|ASEGURADO|CONTRATANTE)?\s*(.{6,60}?)\s+(?:NIT\s*\/\s*CC|CC\s*\/\s*NIT|CC|C\.\s?C\.?|NIT)\s*[:.]?\s*\d/i
    );
    if (m && pareceNombre(m[1])) {
      asegurado = { valor: m[1].trim(), certeza: "alta", evidencia: recortar(f.texto) };
      break;
    }
  }
  if (!asegurado.valor) {
    const c = campo(filas, /^(tomador|asegurado)/i, /^(tomador|asegurado)$/i, (v) =>
      pareceNombre(v) ? v.trim() : null
    );
    if (c.valor) asegurado = { ...c, certeza: "media" };
  }
  if (!asegurado.valor) {
    // HDI usa «TOMADOR» como título de sección, sin nada a su derecha, y cuelga
    // debajo un «NOMBRE:» con el valor al lado. Va de último porque «NOMBRE» a
    // secas también encabeza los anexos de beneficiarios.
    const c = campo(filas, /^nombre\s*[:.]?$/i, /^nombre$/i, (v) =>
      pareceNombre(v) ? v.trim() : null
    );
    if (c.valor) asegurado = { ...c, certeza: "media" };
  }

  // ---- Placa: por forma, y se prefiere la que sigue a su etiqueta --------
  let placa = vacio();
  const formaPlaca = /\b([A-Z]{3}\s?\d{2,3}[A-Z]?)\b/;
  for (const c of porEtiqueta(filas, /^placa\s*[:.]?$/i)) {
    const m = c.valor.match(formaPlaca);
    if (m) {
      placa = { valor: m[1].replace(/\s/g, ""), certeza: "alta", evidencia: recortar(c.fila.texto) };
      break;
    }
  }
  if (!placa.valor) {
    const encontradas = new Set<string>();
    let filaEv: Fila | null = null;
    for (const f of filas) {
      const ms = f.texto.match(new RegExp(formaPlaca, "g"));
      if (ms) for (const p of ms) {
        if (!/^(NIT|IVA|SOA|PDF|COL|CRA|CLL|APT|CAR|DEL)/i.test(p)) {
          encontradas.add(p.replace(/\s/g, ""));
          filaEv ??= f;
        }
      }
    }
    if (encontradas.size === 1) {
      const v = [...encontradas][0];
      placa = { valor: v, certeza: "media", evidencia: filaEv ? recortar(filaEv.texto) : v };
    } else if (encontradas.size > 1) {
      const v = [...encontradas][0];
      placa = { valor: v, certeza: "baja", evidencia: `Varias posibles: ${[...encontradas].slice(0,4).join(", ")}` };
    }
  }

  // ---- Vigencia ----------------------------------------------------------
  let vigenciaDesde = vacio();
  let vigenciaHasta = vacio();
  for (const f of filas) {
    // Entre «Desde» y la fecha suele haber una hora («Desde las 00:00 horas
    // del 01/12/2016»), así que no se puede exigir que no haya dígitos: se
    // permite cualquier cosa, corta y no codiciosa, y se ancla en la fecha.
    const m = f.texto.match(
      /desde.{0,40}?(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}).{0,45}?hasta.{0,40}?(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i
    );
    if (m) {
      const d = fechaISO(m[1]);
      const h = fechaISO(m[2]);
      if (d && h) {
        const ev = recortar(f.texto);
        vigenciaDesde = { valor: d, certeza: "alta", evidencia: ev };
        vigenciaHasta = { valor: h, certeza: "alta", evidencia: ev };
        break;
      }
    }
  }
  if (!vigenciaHasta.valor) {
    // Tabla con columnas DESDE / HASTA, o una fila «Vigencia» con dos fechas.
    const d = campo(filas, /^desde\s*[:.]?$/i, /^desde$/i, (v) => fechaISO(v));
    const h = campo(filas, /^hasta\s*[:.]?$/i, /^hasta$/i, (v) => fechaISO(v));
    if (d.valor) vigenciaDesde = d;
    if (h.valor) vigenciaHasta = h;
  }
  if (!vigenciaHasta.valor) {
    for (const f of filas) {
      if (!/vigencia/i.test(f.texto)) continue;
      const fechas = f.texto.match(/\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}/g);
      if (fechas && fechas.length >= 2) {
        const d = fechaISO(fechas[0]);
        const h = fechaISO(fechas[1]);
        if (d && h) {
          const ev = recortar(f.texto);
          vigenciaDesde = { valor: d, certeza: "media", evidencia: ev };
          vigenciaHasta = { valor: h, certeza: "media", evidencia: ev };
          break;
        }
      }
    }
  }

  /*
   * Coherencia de la vigencia.
   *
   * Una póliza de salud de SURA devolvía «desde 2002-07-25 hasta 2002-07-26»
   * con certeza alta: un solo día. No es un período de seguro, son dos celdas
   * de una tabla que no eran las que se buscaban. Un período real va de unas
   * semanas a tres años; fuera de ese rango se descartan LAS DOS fechas, porque
   * si una está mal la otra tampoco es de fiar. Vale más quedarse sin el dato
   * que guardar uno falso: el vacío se ve y se corrige, y el falso se acepta
   * sin mirar y descuadra los vencimientos.
   */
  if (vigenciaDesde.valor && vigenciaHasta.valor) {
    const dias =
      (Date.parse(`${vigenciaHasta.valor}T00:00:00Z`) -
        Date.parse(`${vigenciaDesde.valor}T00:00:00Z`)) /
      86_400_000;
    if (!(dias >= 20 && dias <= 1200)) {
      vigenciaDesde = vacio();
      vigenciaHasta = vacio();
    }
  }

  // ---- Primas ------------------------------------------------------------
  // El rótulo varía mucho («Prima neta», «Valor a pagar», «PRIMA»…), así que
  // la certeza nunca pasa de media: siempre hay que mirarla.
  // Una cifra por debajo de mil pesos casi nunca es una prima (suele ser un
  // porcentaje o un consecutivo mal cogido); se descarta.
  const aMonto = (bruto: string): { valor: number; seguro: boolean } | null => {
    const { valor, seguro } = montoColombiano(bruto);
    return valor != null && valor >= 1000 ? { valor, seguro } : null;
  };

  const dinero = (etiquetas: RegExp[], encabezados: RegExp[]): CampoExtraido<number> => {
    // 1) Etiqueta y valor en la misma fila. Los dos puntos son opcionales:
    //    Allianz escribe «PRIMA 674.584,00», sin ellos.
    for (const et of etiquetas) {
      for (const f of filas) {
        const m = f.texto.match(et);
        if (!m || !m[1]) continue;
        const r = aMonto(m[1]);
        if (r) return { valor: r.valor, certeza: r.seguro ? "media" : "baja", evidencia: recortar(f.texto) };
      }
    }
    // 2) Tabla: encabezado arriba y la cifra debajo. Es como lo traen SEGUROS
    //    DEL ESTADO, AXA y SBS.
    for (const enc of encabezados) {
      for (const t of porTabla(filas, enc)) {
        const m = t.valor.match(/([\d][\d.,]{3,})/);
        if (!m) continue;
        const r = aMonto(m[1]);
        if (r) return { valor: r.valor, certeza: "baja", evidencia: recortar(`${t.fila.texto} → ${t.valor}`) };
      }
    }
    return { valor: null, certeza: "baja", evidencia: null };
  };

  // Entre el rótulo y la cifra puede haber dos pesos y varios espacios: HDI
  // imprime «TOTAL A PAGAR   $   $603,230.00». Con un solo `$` opcional la
  // cifra no se cogía. `[\s:$]*` absorbe cualquier mezcla de los tres.
  const montoValido = (v: string): string | null => {
    const r = aMonto(v);
    return r ? String(r.valor) : null;
  };
  const deRegla = (
    expresiones: RegExp[] | undefined,
    tabla: RegExp[] | undefined
  ): CampoExtraido<number> | null => {
    const c =
      porReglas(filas, expresiones, montoValido) ??
      porReglasTabla(filas, tabla, montoValido);
    return c ? { valor: Number(c.valor), certeza: "alta", evidencia: c.evidencia } : null;
  };

  const primaNeta = deRegla(reglas.primaNeta, reglas.tablas?.primaNeta) ?? dinero(
    [
      /\bprima\s+neta\b[\s:$]*([\d.,]{4,})/i,
      // «TOTAL PRIMA» de HDI es la prima ANTES de IVA, no el total a pagar; va
      // aquí y no en primaTotal. En esa misma carátula el total con IVA se
      // rotula «TOTAL A PAGAR».
      /^\s*total\s+prima\b[\s:$]*([\d.,]{4,})/i,
      /^\s*prima\b[\s:$]*([\d.,]{4,})/i,
      /\bsubtotal\b[\s:$]*([\d.,]{4,})/i,
    ],
    [/^prima$/i, /^valor\s+prima$/i, /^total\s+prima$/i]
  );
  const primaTotal = deRegla(reglas.primaTotal, reglas.tablas?.primaTotal) ?? dinero(
    [
      /\bprima\s+total\b[\s:$]*([\d.,]{4,})/i,
      /(?:valor|total)\s+a\s+pagar\b[\s:$]*([\d.,]{4,})/i,
      /\bimporte\s+total\b[\s:$]*([\d.,]{4,})/i,
      /\bprima\s+con\s+iva\b[\s:$]*([\d.,]{4,})/i,
      /\btotal\s+p[oó]liza\b[\s:$]*([\d.,]{4,})/i,
    ],
    [/^total\s+a\s+pagar$/i, /^prima\s+con\s+iva$/i, /^importe\s+total$/i]
  );

  const formaPago = (() => {
    // «anual» faltaba y es justamente lo que trae la mayoría de las de hogar.
    const VOCABULARIO =
      /\b(contado|mensual|bimestral|trimestral|semestral|anualidad|anual|financiad[oa]|d[eé]bito autom[aá]tico)\b/i;

    // El validador tiene que ser estricto. En HDI el rótulo «FORMA DE COBRO» es
    // un encabezado de tabla y el valor está DEBAJO, no a la derecha; si se
    // acepta cualquier texto, `campo` se queda con lo que sigue en la misma
    // fila («FECHA LIMITE PAGO PRIMA $506.916») y nunca mira la fila de abajo.
    const validar = (v: string): string | null => {
      const t = v.trim();
      const m = t.match(VOCABULARIO);
      if (m) return m[1].toUpperCase();
      // Alguna compañía escribe «Cuota única»; se admite si es corto y sin
      // cifras ni pesos, que es la señal de que se arrastró media carátula.
      if (t.length > 2 && t.length <= 25 && /^[A-Za-zÁÉÍÓÚÑáéíóúñ\s.]+$/.test(t))
        return t.toUpperCase();
      return null;
    };

    // Cada compañía lo rotula distinto: «Forma de pago» en Allianz, «FORMA DE
    // COBRO» en HDI y «PLAN DE PAGO» en Seguros del Estado.
    const c = campo(
      filas,
      /^(forma|plan)\s+de\s+(pago|cobro)\s*[:.]?$/i,
      /^(forma|plan)\s+de\s+(pago|cobro)$/i,
      validar
    );
    if (c.valor) return c;

    const f = filas.find((x) => VOCABULARIO.test(x.texto));
    if (f) {
      const m = f.texto.match(VOCABULARIO);
      return { valor: m![1].toUpperCase(), certeza: "media" as Certeza, evidencia: recortar(f.texto) };
    }
    return vacio();
  })();

  const todos = [numero, aseguradora, asegurado, ccNit, placa, ramo,
    vigenciaDesde, vigenciaHasta, primaNeta, primaTotal, formaPago];

  return {
    tipo, aviso,
    numero, aseguradora, asegurado, ccNit, placa, ramo,
    vigenciaDesde, vigenciaHasta, primaNeta, primaTotal, formaPago,
    camposEncontrados: todos.filter((c) => c.valor != null).length,
    camposDudosos: todos.filter((c) => c.valor != null && c.certeza === "baja").length,
  };
}

/** Se exporta para las pruebas. */
export type { Fila, Fragmento };
