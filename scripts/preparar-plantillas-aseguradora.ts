/**
 * Rehace las plantillas de lib/plantillas-aseguradoras/ a partir de los
 * formatos REALES de cada aseguradora que están en la carpeta compartida.
 *
 * Existe como script y no como un pegado a mano por dos razones:
 *
 *  1. Los formatos originales traen casos de clientes reales —nombre, cédula,
 *     dirección, banco— y el repositorio no puede llevarlos. Aquí se borra
 *     todo dato y se conserva únicamente la estructura.
 *  2. Cuando una aseguradora cambie su formato, se vuelve a correr esto en vez
 *     de reconstruirlo de memoria.
 *
 * Lo que NUNCA se toca es una celda con fórmula: tasa, prima, prorrata, IVA y
 * los filtros de coeficiente los calcula la aseguradora con su propia hoja ya
 * validada. Aquí solo se les vacía el valor cacheado (que es el cálculo de un
 * caso real) dejando un 0 o "" de relleno, para que Excel lo recalcule al
 * abrir el archivo.
 *
 * Uso: npx tsx scripts/preparar-plantillas-aseguradora.ts
 */
import * as XLSX from "xlsx";
import { mkdirSync, readdirSync, statSync, readFileSync } from "fs";
import path from "path";

const COMPARTIDA =
  "C:/Users/lezqu/Cuántico Seguros LTDA/Cuántico Seguros - General/3. Area Tecnica/Endosos y paz y salvos/ENDOSOS";
const DESTINO = "C:/Users/lezqu/Documents/crm-cuantico/lib/plantillas-aseguradoras";

/** Cuántas filas de casos deja la plantilla. Un envío real nunca se acerca. */
const FILAS = 60;

interface Plan {
  nombre: string;
  hoja: string;
  salida: string;
  /** Fila (1-based) del renglón de títulos de columna. */
  filaEncabezado: number;
  /** Fila (1-based) de la primera línea de casos. */
  filaDatos: number;
  /** Columnas de datos a vaciar en cada fila de caso (0-based, inclusive). */
  cols: [number, number];
  /** Filas sueltas de cabecera que también llevan datos del cliente. */
  cabecera?: { fila: number; cols: [number, number] }[];
  /**
   * Cuando la plantilla trae las fórmulas solo en la primera fila de casos,
   * hay que replicarlas hacia abajo para poder mandar varios en un archivo.
   */
  replicarFormulas?: boolean;
}

const PLANES: Plan[] = [
  {
    nombre: "AXA Colpatria",
    hoja: "Relacion_cert",
    salida: "axa-colpatria.xlsx",
    filaEncabezado: 1,
    filaDatos: 2,
    cols: [0, 11],
  },
  {
    nombre: "Zurich",
    hoja: "PLANTILLA ENDOSOS",
    salida: "zurich.xlsx",
    filaEncabezado: 5,
    filaDatos: 6,
    cols: [0, 8],
    // Fila 2: los datos de la copropiedad (póliza, tomador, NIT, dirección,
    // vigencias, valor del edificio). También son datos, no estructura.
    cabecera: [{ fila: 2, cols: [1, 8] }],
  },
  {
    nombre: "Previsora",
    hoja: "FORMATO ",
    salida: "previsora.xlsx",
    filaEncabezado: 1,
    filaDatos: 2,
    cols: [0, 21],
    replicarFormulas: true,
  },
  {
    nombre: "SBS",
    hoja: "Template endosos financieros",
    salida: "sbs.xlsx",
    filaEncabezado: 2,
    filaDatos: 3,
    cols: [0, 9],
  },
];

// ---------------------------------------------------------------------------
// De dónde sale cada plantilla
// ---------------------------------------------------------------------------

/**
 * El origen NO es un archivo elegido a mano, sino el formato que las
 * aseguradoras usan de verdad HOY.
 *
 * Partir de un archivo suelto salió mal: la copia de Previsora que había en la
 * carpeta FORMATOS titulaba la primera columna «Agencia», cuando 430 de las
 * 531 planillas enviadas de verdad la titulan «Intermediario»; y la de AXA de
 * 2024 traía vacía la columna G, que en el formato real es el NIT del
 * beneficiario. Se generaba una planilla que la aseguradora no reconocía del
 * todo y a la que le faltaba un dato que sí pide.
 *
 * Así que se leen todas las planillas enviadas, se agrupan por su renglón de
 * títulos y gana el encabezado MAYORITARIO; de ese grupo se toma el archivo
 * más reciente. Si mañana una aseguradora cambia su formato, basta con volver
 * a correr esto cuando ya haya unos cuantos envíos con el nuevo.
 */
function archivosReales(dir: string): string[] {
  const out: string[] = [];
  let e: string[] = [];
  try {
    e = readdirSync(dir);
  } catch {
    return out;
  }
  for (const x of e) {
    const p = path.join(dir, x);
    let s;
    try {
      s = statSync(p);
    } catch {
      continue;
    }
    if (s.isDirectory()) out.push(...archivosReales(p));
    else if (/\.xlsx$/i.test(x) && !x.startsWith("~$")) out.push(p);
  }
  return out;
}

const tituloNormalizado = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

function encabezadoDe(wb: XLSX.WorkBook, hoja: string, fila: number): string[] {
  const m = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[hoja], {
    header: 1,
    defval: "",
    raw: true,
    blankrows: true,
  });
  const enc = (m[fila - 1] ?? []).map(tituloNormalizado);
  while (enc.length && !enc[enc.length - 1]) enc.pop();
  return enc;
}

interface Origen {
  ruta: string;
  encabezado: string[];
  cuantos: number;
  deCuantos: number;
}

function elegirOrigen(plan: Plan, candidatos: { ruta: string; fecha: number }[]): Origen | null {
  const grupos = new Map<string, { n: number; reciente: { ruta: string; fecha: number } | null; enc: string[] }>();
  for (const c of candidatos) {
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(readFileSync(c.ruta));
    } catch {
      continue;
    }
    if (!wb.SheetNames.includes(plan.hoja)) continue;
    const enc = encabezadoDe(wb, plan.hoja, plan.filaEncabezado);
    if (!enc.length) continue;
    const firma = enc.join(" | ");
    if (!grupos.has(firma)) grupos.set(firma, { n: 0, reciente: null, enc });
    const g = grupos.get(firma)!;
    g.n++;
    if (!g.reciente || c.fecha > g.reciente.fecha) g.reciente = c;
  }
  const orden = [...grupos.values()].sort((a, b) => b.n - a.n);
  if (!orden.length || !orden[0].reciente) return null;
  const total = orden.reduce((a, g) => a + g.n, 0);
  return {
    ruta: orden[0].reciente.ruta,
    encabezado: orden[0].enc,
    cuantos: orden[0].n,
    deCuantos: total,
  };
}

/**
 * Sube una fórmula `delta` filas, respetando las referencias absolutas.
 *
 * `+T2*S2` con delta 1 pasa a `+T3*S3`, pero `$AF$1` se queda como está: es
 * el índice variable, una constante de la hoja, y moverlo rompería el cálculo.
 */
function desplazarFormula(formula: string, delta: number): string {
  return formula.replace(
    /(\$?)([A-Z]{1,3})(\$?)(\d+)/g,
    (todo, dolarCol, col, dolarFila, fila) => {
      if (dolarFila) return todo; // fila anclada: no se mueve
      return `${dolarCol}${col}${dolarFila}${Number(fila) + delta}`;
    }
  );
}

/**
 * Deja la celda con la fórmula pero sin el resultado del cliente real.
 *
 * No se puede borrar el valor del todo: una celda con `<f>` y sin `<v>` deja
 * de ser legible para SheetJS, y la fórmula desaparecería sin avisar la
 * próxima vez que el generador abra la plantilla.
 */
function vaciarCache(celda: XLSX.CellObject) {
  delete celda.w;
  // SheetJS marca el resultado cacheado de una fórmula de texto como "str",
  // que su propio tipo ExcelDataType no declara; de ahí la conversión.
  const TEXTO = "str" as XLSX.ExcelDataType;
  if (celda.t === TEXTO || celda.t === "s") {
    celda.t = TEXTO;
    celda.v = "";
  } else {
    celda.t = "n";
    celda.v = 0;
  }
}

function preparar(plan: Plan, origen: Origen) {
  const wb = XLSX.read(readFileSync(origen.ruta), { cellFormula: true, cellDates: true });
  const ws = wb.Sheets[plan.hoja];
  if (!ws) throw new Error(`${plan.salida}: no existe la hoja "${plan.hoja}".`);
  const ref = XLSX.utils.decode_range(ws["!ref"]!);

  const dir = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });
  const filaDatos0 = plan.filaDatos - 1;
  const ultimaFila0 = filaDatos0 + FILAS - 1;

  // 1) Datos de cabecera (la copropiedad, en Zurich).
  for (const cab of plan.cabecera ?? []) {
    for (let c = cab.cols[0]; c <= cab.cols[1]; c++) {
      const a = dir(cab.fila - 1, c);
      if (ws[a] && !ws[a].f) delete ws[a];
    }
  }

  // 2) Replicar las fórmulas de la primera fila de casos hacia abajo, cuando
  //    la plantilla no las trae ya repetidas.
  if (plan.replicarFormulas) {
    const modelo: { c: number; f: string; t: XLSX.ExcelDataType }[] = [];
    for (let c = ref.s.c; c <= ref.e.c; c++) {
      const celda = ws[dir(filaDatos0, c)];
      if (celda?.f) modelo.push({ c, f: celda.f, t: celda.t });
    }
    for (let r = filaDatos0 + 1; r <= ultimaFila0; r++) {
      for (const m of modelo) {
        const esTexto = m.t === "s" || m.t === ("str" as XLSX.ExcelDataType);
        ws[dir(r, m.c)] = {
          t: esTexto ? ("str" as XLSX.ExcelDataType) : "n",
          f: desplazarFormula(m.f, r - filaDatos0),
          v: esTexto ? "" : 0,
        };
      }
    }
  }

  // 3) Vaciar todos los datos de las filas de casos, conservando las fórmulas.
  for (let r = filaDatos0; r <= ultimaFila0; r++) {
    for (let c = ref.s.c; c <= ref.e.c; c++) {
      const a = dir(r, c);
      const celda = ws[a];
      if (!celda) continue;
      if (celda.f) vaciarCache(celda);
      else delete ws[a];
    }
  }

  // 4) Recortar lo que quede por debajo: son casos ya tramitados de clientes
  //    reales y no pueden viajar al repositorio.
  for (let r = ultimaFila0 + 1; r <= ref.e.r; r++) {
    for (let c = ref.s.c; c <= ref.e.c; c++) {
      const a = dir(r, c);
      if (ws[a]) delete ws[a];
    }
  }
  ws["!ref"] = XLSX.utils.encode_range({ s: ref.s, e: { r: ultimaFila0, c: ref.e.c } });

  // 5) Y el mismo vaciado de caché en las fórmulas de cabecera.
  for (let r = ref.s.r; r < filaDatos0; r++) {
    for (let c = ref.s.c; c <= ref.e.c; c++) {
      const celda = ws[dir(r, c)];
      if (celda?.f) vaciarCache(celda);
    }
  }

  const destino = `${DESTINO}/${plan.salida}`;
  XLSX.writeFile(wb, destino);

  const formulas = Object.keys(ws).filter((k) => !k.startsWith("!") && ws[k].f).length;
  // Se relee lo escrito y se compara el renglón de títulos con el del formato
  // real: es la comprobación de que la plantilla salió fiel.
  const releida = XLSX.read(readFileSync(destino));
  const encFinal = encabezadoDe(releida, plan.hoja, plan.filaEncabezado);
  const fiel = encFinal.join(" | ") === origen.encabezado.join(" | ");

  console.log(`${plan.nombre}`);
  console.log(`   origen : ${path.basename(origen.ruta)}`);
  console.log(
    `   formato: el de ${origen.cuantos} de ${origen.deCuantos} planillas enviadas (el mayoritario)`
  );
  console.log(
    `   salida : ${plan.salida} · ${FILAS} filas de casos · ${formulas} fórmulas · encabezado ${
      fiel ? "IDÉNTICO al real" : "DISTINTO ✗"
    }`
  );
  if (!fiel) {
    console.log(`      real: ${origen.encabezado.join(" | ")}`);
    console.log(`      mío : ${encFinal.join(" | ")}`);
  }
  console.log("");
  return fiel;
}

mkdirSync(DESTINO, { recursive: true });

const candidatos = ["2025", "2026"]
  .flatMap((anio) => archivosReales(path.join(COMPARTIDA, "EXCEL", anio)))
  .map((ruta) => ({ ruta, fecha: statSync(ruta).mtimeMs }));
console.log(`Planillas enviadas que se revisan: ${candidatos.length}\n`);

let fallos = 0;
for (const plan of PLANES) {
  const origen = elegirOrigen(plan, candidatos);
  if (!origen) {
    console.log(`${plan.nombre}: no se encontró ninguna planilla real con la hoja «${plan.hoja}».\n`);
    fallos++;
    continue;
  }
  if (!preparar(plan, origen)) fallos++;
}
console.log(fallos === 0 ? "Listo: las cuatro plantillas son fieles al formato real." : `${fallos} plantilla(s) con problemas.`);
process.exit(fallos === 0 ? 0 : 1);
