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
export type TipoDocumento = "poliza" | "recibo" | "escaneado" | "desconocido";

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

/** Normaliza una fecha a AAAA-MM-DD, rechazando lo imposible. */
export function fechaISO(bruto: string): string | null {
  const m = bruto.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) {
    const [, d, mes, a] = m;
    const anio = a.length === 2 ? `20${a}` : a;
    if (Number(mes) > 12 || Number(mes) < 1 || Number(d) > 31 || Number(d) < 1) return null;
    if (Number(anio) < 1990 || Number(anio) > 2100) return null;
    return `${anio}-${mes.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio",
    "agosto","septiembre","octubre","noviembre","diciembre"];
  const t = bruto.toLowerCase().match(/(\d{1,2})\s+de\s+([a-zñáéíóú]+)\s+de\s+(\d{4})/);
  if (t) {
    const i = MESES.findIndex((x) => x.startsWith(t[2].slice(0, 4)));
    if (i >= 0) return `${t[3]}-${String(i + 1).padStart(2, "0")}-${t[1].padStart(2, "0")}`;
  }
  return null;
}

/** Busca una etiqueta y devuelve lo que hay a su derecha, en su misma fila. */
function porEtiqueta(filas: Fila[], etiqueta: RegExp): { valor: string; fila: Fila } | null {
  for (const fila of filas) {
    for (let i = 0; i < fila.fragmentos.length; i++) {
      if (!etiqueta.test(fila.fragmentos[i].texto)) continue;
      // El valor puede ir pegado a la etiqueta en el mismo fragmento.
      const propio = fila.fragmentos[i].texto.replace(etiqueta, "").replace(/^[\s:.#]+/, "");
      const derecha = valorALaDerecha(fila, i);
      const valor = (propio || derecha).trim();
      if (valor) return { valor, fila };
    }
  }
  return null;
}

/** Busca un encabezado de tabla y devuelve la celda de debajo. */
function porTabla(filas: Fila[], encabezado: RegExp): { valor: string; fila: Fila } | null {
  for (let f = 0; f < filas.length; f++) {
    for (const frag of filas[f].fragmentos) {
      if (!encabezado.test(frag.texto.trim())) continue;
      const abajo = valorDebajo(filas, f, frag);
      if (abajo) return { valor: abajo, fila: filas[f] };
    }
  }
  return null;
}

/** Prueba etiqueta y luego tabla; devuelve el primer valor que pase el filtro. */
function campo(
  filas: Fila[],
  etiqueta: RegExp,
  encabezado: RegExp | null,
  validar: (v: string) => string | null
): CampoExtraido {
  const porE = porEtiqueta(filas, etiqueta);
  if (porE) {
    const v = validar(porE.valor);
    if (v) return { valor: v, certeza: "alta", evidencia: recortar(porE.fila.texto) };
  }
  if (encabezado) {
    const porT = porTabla(filas, encabezado);
    if (porT) {
      const v = validar(porT.valor);
      if (v) return { valor: v, certeza: "alta", evidencia: recortar(porT.fila.texto) };
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
  }

  // ---- Número de póliza -------------------------------------------------
  const soloNumero = (v: string): string | null => {
    const m = v.match(/\b(\d[\d-]{4,})\b/);
    if (!m) return null;
    // «023883535 / 0»: el certificado va aparte, se queda el número.
    return m[1].replace(/-+$/, "");
  };
  let numero = campo(
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

  // ---- Aseguradora y ramo: por vocabulario del documento -----------------
  let aseguradora = vacio();
  for (const [re, nombre] of ASEGURADORAS) {
    const f = filas.find((x) => re.test(x.texto));
    if (f) { aseguradora = { valor: nombre, certeza: "alta", evidencia: recortar(f.texto) }; break; }
  }
  let ramo = vacio();
  for (const [re, nombre] of RAMOS) {
    const f = filas.find((x) => re.test(x.texto));
    if (f) { ramo = { valor: nombre, certeza: "media", evidencia: recortar(f.texto) }; break; }
  }

  // ---- Documento del cliente --------------------------------------------
  const ccNit = campo(
    filas,
    /^(nit|c\.?\s?c\.?|c[eé]dula|documento)\s*[:.]?$/i,
    /^(nit|c\.?\s?c\.?|documento)$/i,
    (v) => {
      const m = v.match(/\b(\d[\d.\-]{5,15})\b/);
      return m ? m[1] : null;
    }
  );

  // ---- Tomador / asegurado ----------------------------------------------
  // Ojo: en Allianz «Tomador del Seguro:» tiene la CIUDAD a su derecha; el
  // nombre está en la fila de arriba, junto al documento. Por eso se busca
  // primero la fila que lleva el documento y se toma lo que va antes.
  let asegurado = vacio();
  const pareceNombre = (s: string) =>
    /^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.,'-]{5,60}$/.test(s.trim()) &&
    !/(SEGUROS|S\.?A\.?S?\b|LTDA|AGENCIA|NIT|POLIZA|PÓLIZA|CERTIFICADO|MEDELLIN|BOGOTA)/i.test(s);
  for (const f of filas) {
    const m = f.texto.match(/^(.{6,60}?)\s+(?:CC|C\.C\.|NIT)\s*[:.]/i);
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

  // ---- Placa: por forma, y se prefiere la que sigue a su etiqueta --------
  let placa = vacio();
  const conEtiqueta = porEtiqueta(filas, /^placa\s*[:.]?$/i);
  const formaPlaca = /\b([A-Z]{3}\s?\d{2,3}[A-Z]?)\b/;
  if (conEtiqueta) {
    const m = conEtiqueta.valor.match(formaPlaca);
    if (m) placa = { valor: m[1].replace(/\s/g, ""), certeza: "alta", evidencia: recortar(conEtiqueta.fila.texto) };
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
      const t = porTabla(filas, enc);
      if (!t) continue;
      const m = t.valor.match(/([\d][\d.,]{3,})/);
      if (!m) continue;
      const r = aMonto(m[1]);
      if (r) return { valor: r.valor, certeza: "baja", evidencia: recortar(`${t.fila.texto} → ${t.valor}`) };
    }
    return { valor: null, certeza: "baja", evidencia: null };
  };

  const primaNeta = dinero(
    [
      /prima\s+neta\s*[:$]?\s*([\d.,]{4,})/i,
      /^\s*prima\s*[:$]?\s+\$?\s*([\d.,]{4,})/i,
      /subtotal\s*[:$]?\s*([\d.,]{4,})/i,
    ],
    [/^prima$/i, /^valor\s+prima$/i]
  );
  const primaTotal = dinero(
    [
      /prima\s+total\s*[:$]?\s*([\d.,]{4,})/i,
      /(?:valor|total)\s+a\s+pagar\s*[:$]?\s*([\d.,]{4,})/i,
      /importe\s+total\s*[:$]?\s*([\d.,]{4,})/i,
      /prima\s+con\s+iva\s*[:$]?\s*([\d.,]{4,})/i,
      /total\s+p[oó]liza\s*[:$]?\s*([\d.,]{4,})/i,
    ],
    [/^total\s+a\s+pagar$/i, /^prima\s+con\s+iva$/i, /^importe\s+total$/i]
  );

  const formaPago = (() => {
    const c = campo(filas, /^forma\s+de\s+pago\s*[:.]?$/i, /^forma\s+de\s+pago$/i, (v) =>
      v.trim().length > 2 ? v.trim() : null
    );
    if (c.valor) return c;
    const f = filas.find((x) =>
      /\b(contado|mensual|trimestral|semestral|financiad[oa]|d[eé]bito autom[aá]tico)\b/i.test(x.texto)
    );
    if (f) {
      const m = f.texto.match(/\b(contado|mensual|trimestral|semestral|financiad[oa]|d[eé]bito autom[aá]tico)\b/i);
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
