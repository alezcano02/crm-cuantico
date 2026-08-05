/**
 * Reconstrucción de la disposición de un PDF a partir de las coordenadas de
 * cada fragmento de texto.
 *
 * `pdftotext -layout` aplana el documento a texto y, en las pólizas a dos
 * columnas, cruza las etiquetas de una con los valores de la otra: en un
 * certificado de Allianz se lee «Placa: CAMIONETA PASAJ.», que es la clase del
 * vehículo. Con las coordenadas que da pdfjs eso no pasa, porque se sabe qué
 * hay a la derecha de cada etiqueta y qué hay debajo.
 *
 * Aquí solo se reconstruye la geometría. Quién es cada campo lo decide
 * `lib/extraer-poliza.ts`.
 */

export interface Fragmento {
  texto: string;
  x: number;
  /** Medido desde arriba: más fácil de razonar que el origen de PDF. */
  y: number;
  ancho: number;
  alto: number;
}

export interface Fila {
  y: number;
  fragmentos: Fragmento[];
  /** La fila entera como texto, para poder buscar con expresiones. */
  texto: string;
}

export interface PaginaPdf {
  numero: number;
  ancho: number;
  alto: number;
  filas: Fila[];
}

/**
 * Agrupa fragmentos en filas.
 *
 * La tolerancia se calcula sobre la altura de la letra, no fija: un documento
 * a 6 pt y otro a 12 pt no pueden compartir umbral. Dos fragmentos son de la
 * misma fila si sus centros verticales se separan menos de media línea.
 */
export function agruparEnFilas(frags: Fragmento[]): Fila[] {
  if (!frags.length) return [];
  const alturaTipica =
    [...frags].map((f) => f.alto).sort((a, b) => a - b)[Math.floor(frags.length / 2)] || 8;
  const tolerancia = Math.max(2, alturaTipica * 0.6);

  const ordenados = [...frags].sort((a, b) => a.y - b.y || a.x - b.x);
  const filas: Fila[] = [];
  for (const f of ordenados) {
    const ultima = filas[filas.length - 1];
    if (ultima && Math.abs(f.y - ultima.y) <= tolerancia) {
      ultima.fragmentos.push(f);
      // La y de la fila es la media, para que no la arrastre un superíndice.
      ultima.y = (ultima.y * (ultima.fragmentos.length - 1) + f.y) / ultima.fragmentos.length;
    } else {
      filas.push({ y: f.y, fragmentos: [f], texto: "" });
    }
  }
  for (const fila of filas) {
    fila.fragmentos.sort((a, b) => a.x - b.x);
    // Se separa con dos espacios cuando hay un hueco ancho, para que se note
    // que son celdas distintas y no una frase.
    //
    // Y con NINGUNO cuando los fragmentos se tocan. SURA entrega cada vocal
    // acentuada como fragmento aparte, pegada a la anterior: metiéndole un
    // espacio salía «c ó digo», «seg ú n», «raz ó n», y ninguna expresión con
    // tildes podía casar contra sus carátulas. El umbral se mide sobre la
    // altura de la letra porque un espacio real ronda un cuarto de ella.
    fila.texto = fila.fragmentos
      .map((f, i) => {
        if (i === 0) return f.texto;
        const previo = fila.fragmentos[i - 1];
        const hueco = f.x - (previo.x + previo.ancho);
        if (hueco > alturaTipica * 0.8) return "  " + f.texto;
        if (hueco < alturaTipica * 0.15) return f.texto;
        return " " + f.texto;
      })
      .join("")
      .replace(/\s+$/, "");
  }
  return filas;
}

/**
 * Lo que hay INMEDIATAMENTE A LA DERECHA de una etiqueta, en su misma fila.
 *
 * Es la forma correcta de leer «Póliza n°: 023883535»: no se toma el resto del
 * renglón —que en un documento a dos columnas trae texto de la otra columna—
 * sino solo los fragmentos que empiezan antes de que se abra un hueco grande.
 */
export function valorALaDerecha(
  fila: Fila,
  indiceEtiqueta: number,
  huecoMaximo = 60
): string {
  const partes: string[] = [];
  let anterior = fila.fragmentos[indiceEtiqueta];
  for (let i = indiceEtiqueta + 1; i < fila.fragmentos.length; i++) {
    const f = fila.fragmentos[i];
    const hueco = f.x - (anterior.x + anterior.ancho);
    if (hueco > huecoMaximo) break; // ya es otra columna
    partes.push(f.texto);
    anterior = f;
  }
  return partes.join(" ").trim();
}

/**
 * Lo que hay DEBAJO de una celda, alineado con ella.
 *
 * Es el caso de LIBERTY, SURA y HDI: una fila de encabezados
 * («RAMO PRODUCTO PÓLIZA CERTIFICADO») y los valores en la fila siguiente. Se
 * empareja por solapamiento horizontal, que es lo que un humano hace al mirar
 * la tabla.
 */
export function valorDebajo(
  filas: Fila[],
  indiceFila: number,
  celda: Fragmento,
  maxFilasAbajo = 3
): string | null {
  for (let i = indiceFila + 1; i <= indiceFila + maxFilasAbajo && i < filas.length; i++) {
    const candidatos = filas[i].fragmentos.filter((f) => {
      const iniA = celda.x;
      const finA = celda.x + celda.ancho;
      const iniB = f.x;
      const finB = f.x + f.ancho;
      const solape = Math.min(finA, finB) - Math.max(iniA, iniB);
      // Basta con que se solapen a medias: las columnas no van perfectas.
      return solape > Math.min(celda.ancho, f.ancho) * 0.35;
    });
    if (candidatos.length) {
      return candidatos.map((c) => c.texto).join(" ").trim();
    }
  }
  return null;
}

/** Todas las filas de todas las páginas, en orden. */
export function todasLasFilas(paginas: PaginaPdf[]): Fila[] {
  return paginas.flatMap((p) => p.filas);
}

/** El documento entero como texto, ya con las filas bien formadas. */
export function textoDeFilas(filas: Fila[]): string {
  return filas.map((f) => f.texto).join("\n");
}
