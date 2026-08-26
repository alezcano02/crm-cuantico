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
import { mkdirSync } from "fs";

const COMPARTIDA =
  "C:/Users/lezqu/Cuántico Seguros LTDA/Cuántico Seguros - General/3. Area Tecnica/Endosos y paz y salvos/ENDOSOS";
const DESTINO = "C:/Users/lezqu/Documents/crm-cuantico/lib/plantillas-aseguradoras";

/** Cuántas filas de casos deja la plantilla. Un envío real nunca se acerca. */
const FILAS = 60;

interface Plan {
  nombre: string;
  origen: string;
  hoja: string;
  salida: string;
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
    origen: `${COMPARTIDA}/PDF/2024/ENDOSOS/formato endosos axa colpatria 2024.xlsx`,
    hoja: "Relacion_cert",
    salida: "axa-colpatria.xlsx",
    filaDatos: 2,
    cols: [0, 11],
  },
  {
    nombre: "Zurich",
    origen: `${COMPARTIDA}/EXCEL/2025/PLANILLA SOLICITUD ENDOSOS ZURICH.xlsx`,
    hoja: "PLANTILLA ENDOSOS",
    salida: "zurich.xlsx",
    filaDatos: 6,
    cols: [0, 8],
    // Fila 2: los datos de la copropiedad (póliza, tomador, NIT, dirección,
    // vigencias, valor del edificio). También son datos, no estructura.
    cabecera: [{ fila: 2, cols: [1, 8] }],
  },
  {
    nombre: "Previsora",
    origen: `${COMPARTIDA}/FORMATOS/FORMATO PREVISORA 2026.xlsx`,
    hoja: "FORMATO ",
    salida: "previsora.xlsx",
    filaDatos: 2,
    cols: [0, 21],
    replicarFormulas: true,
  },
  {
    nombre: "SBS",
    origen: `${COMPARTIDA}/EXCEL/2026/PRADO VERDE/FORMATO EXCELL PARA SBS.xlsx`,
    hoja: "Template endosos financieros",
    salida: "sbs.xlsx",
    filaDatos: 3,
    cols: [0, 9],
  },
];

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

function preparar(plan: Plan) {
  const wb = XLSX.readFile(plan.origen, { cellFormula: true, cellDates: true });
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
  console.log(
    `${plan.nombre.padEnd(15)} → ${plan.salida.padEnd(20)} ${FILAS} filas de casos · ${formulas} fórmulas`
  );
}

mkdirSync(DESTINO, { recursive: true });
for (const plan of PLANES) preparar(plan);
console.log("\nListo.");
