/**
 * Genera la guía «Endosos, paso a paso» en Word.
 *
 * Es un documento INTERNO, así que sigue la paleta de documentación de la
 * marca (tinta sobre papel, sin el azul corporativo). La sección de apertura
 * sigue el formato de «Qué cambió» de GUÍA DE GESTIÓN DE CARTERA.docx: qué
 * hacía falta a mano antes y qué automatiza ahora el CRM, y qué sigue igual.
 * Después va el paso a paso, qué se necesita y dónde se atasca.
 *
 * Está escrita para alguien en su primera semana. La versión anterior contaba
 * el trámite entero —siete pasos, nueve revisiones, la cuenta del coeficiente—
 * y eso es un manual de referencia, no algo que se lea un lunes por la mañana.
 * Lo que hace falta a diario es mucho más corto: mirar el número azul del
 * menú, abrir lo que llegó, corregir lo que sale en rojo y enviar.
 *
 *   npx tsx scripts/generar-manual-endosos.ts [ruta-de-salida.docx]
 */
import fs from "fs";
import path from "path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

// Paleta de documentación interna (skill cuantico-brand).
const TINTA = "132240";
const GRIS = "5B6472";
const LINEA = "D9D3C8";

const FUENTE = "Montserrat";

const versalitas = (texto: string) =>
  new Paragraph({
    children: [
      new TextRun({ text: texto, size: 15, color: GRIS, characterSpacing: 28, font: "Consolas" }),
    ],
    spacing: { after: 80 },
  });

const titulo = (texto: string) =>
  new Paragraph({
    children: [new TextRun({ text: texto, bold: true, size: 44, color: TINTA, font: FUENTE })],
    spacing: { after: 60 },
  });

const bajada = (texto: string) =>
  new Paragraph({
    children: [new TextRun({ text: texto, size: 21, color: GRIS, font: FUENTE })],
    spacing: { after: 240 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: TINTA, space: 12 } },
  });

const seccion = (texto: string) =>
  new Paragraph({
    children: [new TextRun({ text: texto, bold: true, size: 26, color: TINTA, font: FUENTE })],
    spacing: { before: 320, after: 120 },
  });

const parrafo = (texto: string) =>
  new Paragraph({
    children: [new TextRun({ text: texto, size: 21, font: FUENTE })],
    spacing: { after: 100 },
  });

/** Un paso del día a día: número en negrita y la acción en una línea. */
const paso = (n: number, negrilla: string, resto: string) =>
  new Paragraph({
    children: [
      new TextRun({ text: `${n}.  `, bold: true, size: 21, color: TINTA, font: FUENTE }),
      new TextRun({ text: negrilla, bold: true, size: 21, font: FUENTE }),
      new TextRun({ text: resto, size: 21, font: FUENTE }),
    ],
    spacing: { after: 120 },
    indent: { left: 200, hanging: 200 },
  });

const vineta = (negrilla: string, resto: string) =>
  new Paragraph({
    children: [
      new TextRun({ text: negrilla, bold: true, size: 21, font: FUENTE }),
      new TextRun({ text: resto, size: 21, font: FUENTE }),
    ],
    numbering: { reference: "vinetas", level: 0 },
    spacing: { after: 80 },
  });

const HILO = { style: BorderStyle.SINGLE, size: 1, color: LINEA };

function celda(texto: string, negrilla: boolean, ancho: number): TableCell {
  return new TableCell({
    width: { size: ancho, type: WidthType.PERCENTAGE },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: texto,
            bold: negrilla,
            size: 19,
            color: negrilla ? TINTA : undefined,
            font: FUENTE,
          }),
        ],
      }),
    ],
  });
}

const tabla = (encabezados: string[], filas: string[][], anchos: number[]) =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: HILO, bottom: HILO, left: HILO, right: HILO },
    rows: [
      new TableRow({
        tableHeader: true,
        children: encabezados.map((h, i) => celda(h, true, anchos[i])),
      }),
      ...filas.map((f) => new TableRow({ children: f.map((c, i) => celda(c, false, anchos[i])) })),
    ],
  });

// ---------------------------------------------------------------------------

const hoy = new Date().toLocaleDateString("es-CO", {
  timeZone: "America/Bogota",
  month: "long",
  year: "numeric",
});

const cuerpo: (Paragraph | Table)[] = [];

cuerpo.push(
  versalitas("CUÁNTICO · AGENCIA DE SEGUROS LTDA"),
  titulo("Endosos, paso a paso"),
  bajada(
    `Qué hacer cada día con lo que llega al correo de endosos. NIT 901.891.365-3 · Medellín · ${hoy}`
  )
);

// 1 --------------------------------------------------------------------------
cuerpo.push(
  seccion("1.  Qué cambió"),
  parrafo(
    "Cuando un propietario saca un crédito, el banco exige ser beneficiario del seguro del " +
      "apartamento. Como ese apartamento ya está cubierto por la póliza del edificio, no se hace " +
      "una póliza nueva: se emite un ENDOSO, un certificado que pone a favor del banco la parte de " +
      "esa póliza que le corresponde. Uno de cada diez se devolvía por errores que se podían ver " +
      "antes de enviarlo."
  ),
  parrafo(
    "Antes, cada solicitud había que copiarla a mano al Excel del correo, revisar en otra hoja si " +
      "la copropiedad tenía el paz y salvo al día, y acordarse de las manías de cada banco. El CRM " +
      "ya hace la primera parte solo: lee endosos@cuanticoseguros.com cada hora, crea el caso o le " +
      "añade la respuesta que llegó, y completa la aseguradora, el número de póliza, la ciudad, el " +
      "coeficiente y el NIT del banco. Eso ya no se teclea. También revisa cada caso contra las " +
      "nueve cosas que hacen que el banco lo devuelva, y avisa antes de radicar."
  ),
  parrafo(
    "Lo que no cambió: tú sigues decidiendo, llenando a mano el formato propio de cada aseguradora " +
      "— esas fórmulas no se tocan — y enviando tú mismo el correo, tanto a la aseguradora como al " +
      "cliente. El CRM NUNCA manda correos. Eso lo haces tú siempre."
  )
);

// 2 --------------------------------------------------------------------------
cuerpo.push(
  seccion("2.  El día a día"),
  parrafo(
    "Esto es todo el ciclo, desde que llega la solicitud hasta que el caso queda cerrado. Si " +
      "algún día no hay número azul en el menú, no hay nada pendiente de tu parte."
  ),
  paso(
    1,
    "El cliente envía el endoso con la información. ",
    "Llega a endosos@cuanticoseguros.com — del propietario, del administrador del edificio o de " +
      "otro corredor — con la dirección exacta, el valor que pide el banco, el banco beneficiario " +
      "y el paz y salvo. Esto es lo que arranca todo lo demás."
  ),
  paso(
    2,
    "Mira el menú. ",
    "El CRM lee ese correo solo, cada hora. Si «Endosos» tiene un número azul al lado, ya creó o " +
      "actualizó el caso y te está esperando."
  ),
  paso(3, "Entra y pulsa «Ver los N». ", "Deja en pantalla solo lo que llegó y nadie ha abierto."),
  paso(
    4,
    "Abre cada caso. ",
    "«¡Nuevo!» es una solicitud recién llegada. «¡Actualizado!» es un caso que ya conocías y al " +
      "que le entró una nota: el banco lo devolvió, la aseguradora contestó o el cliente escribió. " +
      "Abrirlo quita el aviso."
  ),
  paso(
    5,
    "Lee la revisión. ",
    "Rojo: tal como está, el banco lo devuelve — corrígelo. Ámbar: hay algo que mirar. Gris: solo " +
      "falta un dato por llenar."
  ),
  paso(
    6,
    "Marca los que estén «Listos» y descarga la planilla. ",
    "El CRM la llena con los casos marcados, hasta 60 por archivo, y te dice qué columnas quedaron " +
      "en blanco."
  ),
  paso(
    7,
    "Completa a mano lo que falta y envíala a la aseguradora. ",
    "La tasa, el tipo de documento y el tipo de propiedad los pones tú. Nunca toques las celdas de " +
      "fórmulas."
  ),
  paso(
    8,
    "Cuando la aseguradora responda, envíale al cliente los cuatro documentos: ",
    "endoso, carátula de la póliza, certificado de pago y clausulado. Con eso el caso QUEDA " +
      "CERRADO — no hay que marcar nada más."
  ),
  paso(
    9,
    "Si el banco lo devuelve, ",
    "el caso vuelve solo a «Reproceso» y aparece otra vez con aviso. Se corrige y se repite desde " +
      "el paso 5."
  )
);

// 3 --------------------------------------------------------------------------
cuerpo.push(
  seccion("3.  Qué se necesita para radicar"),
  vineta(
    "La dirección exacta del crédito. ",
    "La manda el cliente en su correo y el banco la compara letra por letra contra la escritura. " +
      "Nunca la copies de otro caso. Si el inmueble no tiene cuarto útil o parqueadero, escribe " +
      "«No aplica»; en blanco hace dudar al banco."
  ),
  vineta("El valor que pide el banco y el banco beneficiario. ", "Sin esos dos no se puede radicar."),
  vineta("Paz y salvo al día y póliza del edificio vigente. ", "El CRM te avisa si alguno falla."),
  parrafo(
    "Lo demás lo pone el CRM solo. Si algo te lo pide y no lo tienes, déjalo vacío: nunca inventes " +
      "un dato."
  )
);

// 4 --------------------------------------------------------------------------
cuerpo.push(
  seccion("4.  Dónde se atasca"),
  tabla(
    ["Si ves esto", "Qué significa"],
    [
      [
        "Fondo Nacional del Ahorro",
        "No acepta aseguradoras externas. El trámite no va a salir: mejor decírselo al cliente de entrada.",
      ],
      [
        "BBVA o Davivienda",
        "Solo aceptan si el paz y salvo dice textualmente «Pagado en su Totalidad».",
      ],
      [
        "Bancolombia",
        "El cliente debe cargar los cuatro documentos en el portal del banco. Recuérdaselo al enviárselos.",
      ],
      [
        "«Davivienda» a secas",
        "Confírmalo: Davivienda y DAVIbank son entidades distintas, con NIT distinto. Confundirlas devuelve el endoso.",
      ],
      [
        "Valor vs. coeficiente en rojo",
        "El banco pide más de lo que le corresponde al apartamento. Hay que cobrar prima adicional o ajustar el valor.",
      ],
      [
        "Un valor sospechosamente bajo",
        "Casi siempre al cliente se le fueron dígitos. Confírmalo antes de radicar.",
      ],
      [
        "Póliza por vencer",
        "Cuando la póliza del edificio se renueva hay que rehacer el endoso. El CRM avisa 15 días antes.",
      ],
    ],
    [30, 70]
  ),
  new Paragraph({
    children: [
      new TextRun({
        text:
          "La revisión completa de un caso, con los nueve puntos y la cuenta del coeficiente, sale " +
          "al abrirlo en el CRM. Esta guía solo cubre el día a día.",
        italics: true,
        size: 18,
        color: GRIS,
        font: FUENTE,
      }),
    ],
    spacing: { before: 240 },
  })
);

const doc = new Document({
  numbering: {
    config: [
      {
        reference: "vinetas",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "•",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 360, hanging: 200 } } },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1150, right: 1150 } } },
      children: cuerpo,
    },
  ],
});

const salida = process.argv[2] ?? path.join(process.cwd(), "ENDOSOS - PASO A PASO.docx");

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(salida, buffer);
  console.log(`Escrito: ${salida} (${(buffer.length / 1024).toFixed(1)} KB)`);
});
