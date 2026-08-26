/**
 * Genera el «Manual del endoso» en Word.
 *
 * Sigue el mismo molde que el informe de cartera (app/api/informe-cartera/
 * route.ts): título centrado en negrilla, fecha de generación en cursiva,
 * secciones con HEADING_1, subtítulos en negrilla y viñetas con la lista
 * «vinetas» declarada en el documento. La entradilla de cada viñeta va en
 * negrilla, igual que allí va el nombre del asegurado: es lo que permite
 * encontrar un punto concreto repasando la página con el dedo.
 *
 * Se aparta del molde en un solo sitio: las dos rejillas de verdad —las nueve
 * revisiones y los plazos— van en tabla. Como viñetas se perdía la columna de
 * gravedad, que es justo lo que se mira.
 *
 *   npx tsx scripts/generar-manual-endosos.ts [ruta-de-salida.docx]
 */
import fs from "fs";
import path from "path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

// --- Piezas del documento ---------------------------------------------------

const titulo = (texto: string) =>
  new Paragraph({
    text: texto,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 240, after: 120 },
  });

const subtitulo = (texto: string) =>
  new Paragraph({
    children: [new TextRun({ text: texto, bold: true })],
    spacing: { before: 160, after: 60 },
  });

const suelto = (texto: string) => new Paragraph({ text: texto, spacing: { after: 60 } });

/** Viñeta con entradilla en negrilla, como las líneas del informe de cartera. */
const vineta = (entradilla: string, resto: string) =>
  new Paragraph({
    children: [
      new TextRun({ text: entradilla, bold: true }),
      new TextRun({ text: resto }),
    ],
    numbering: { reference: "vinetas", level: 0 },
    spacing: { after: 60 },
  });

const HILO = { style: BorderStyle.SINGLE, size: 1, color: "BFBFBF" };
const BORDES = { top: HILO, bottom: HILO, left: HILO, right: HILO };

function celda(texto: string, opciones: { negrilla?: boolean; ancho: number }): TableCell {
  return new TableCell({
    width: { size: opciones.ancho, type: WidthType.PERCENTAGE },
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({
        children: [new TextRun({ text: texto, bold: opciones.negrilla, size: 19 })],
      }),
    ],
  });
}

function tabla(encabezados: string[], filas: string[][], anchos: number[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: BORDES,
    rows: [
      new TableRow({
        tableHeader: true,
        children: encabezados.map((h, i) => celda(h, { negrilla: true, ancho: anchos[i] })),
      }),
      ...filas.map(
        (f) =>
          new TableRow({
            children: f.map((c, i) => celda(c, { ancho: anchos[i] })),
          })
      ),
    ],
  });
}

// --- Contenido --------------------------------------------------------------

const parrafos: (Paragraph | Table)[] = [];

parrafos.push(
  new Paragraph({
    children: [new TextRun({ text: "MANUAL DEL ENDOSO", bold: true, size: 32 })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
  }),
  new Paragraph({
    children: [
      new TextRun({ text: "Cuántico Seguros · Proceso interno", italics: true, size: 20 }),
    ],
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
  }),
  new Paragraph({
    children: [
      new TextRun({
        text: `Generado el ${new Date().toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}`,
        italics: true,
        size: 18,
      }),
    ],
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
  }),
  suelto(
    "Cómo va un endoso desde que el propietario escribe al buzón hasta que el banco lo " +
      "acepta, y sobre todo qué se revisa antes de radicarlo. Uno de cada diez se devolvía, " +
      "y las causas eran casi siempre las mismas cinco cosas."
  )
);

// 1 ---------------------------------------------------------------------------
parrafos.push(titulo("1. Qué es un endoso"));
parrafos.push(
  suelto(
    "Cuántico asegura copropiedades enteras —edificios y urbanizaciones— con una póliza de " +
      "incendio y terremoto sobre las áreas comunes."
  ),
  suelto(
    "Cuando un propietario saca un crédito hipotecario o un leasing, el banco le exige figurar " +
      "como beneficiario del seguro del inmueble. Como ese apartamento ya está cubierto por la " +
      "póliza del edificio, no se hace una póliza nueva: se emite un ENDOSO, un certificado que " +
      "dice que la parte de la póliza correspondiente al apartamento 1406 queda a favor del " +
      "Banco X por $Y."
  ),
  suelto(
    "De ahí sale casi todo lo demás. El endoso no vive solo: depende de la póliza del edificio, " +
      "y cuando esa se renueva hay que rehacerlo. Y el valor que puede certificar no lo decide el " +
      "banco, lo decide el coeficiente del apartamento: la participación que le asigna el " +
      "reglamento de propiedad horizontal."
  )
);

// 2 ---------------------------------------------------------------------------
parrafos.push(titulo("2. El trámite, paso a paso"));
parrafos.push(
  suelto(
    "Siete pasos. El estado del caso en el CRM sigue este mismo orden, así que decir «está en el " +
      "cuatro» y «está radicado» es lo mismo."
  ),
  vineta(
    "1. Llega la solicitud (cliente). ",
    "El propietario, el administrador del edificio o a veces otro corredor escribe a " +
      "endosos@cuanticoseguros.com. En el correo vienen los datos del inmueble, del crédito y del " +
      "banco; sobre todo la dirección, que la manda siempre el cliente y nunca se inventa."
  ),
  vineta(
    "2. Se revisa si el caso se puede tramitar (CRM + Juan). ",
    "Aquí está todo el oficio, y es el paso que evita el reproceso. El CRM corre nueve " +
      "revisiones automáticas; lo que no puede juzgar solo —un valor raro, un banco desconocido— " +
      "lo deja en ámbar para que lo mire una persona. Estado: nueva solicitud o datos incompletos."
  ),
  vineta(
    "3. Se llena el formato y se envía a la aseguradora (Juan). ",
    "Un formato distinto por compañía. El CRM genera la planilla con los casos marcados —hasta " +
      "60 por archivo— y Juan la revisa, completa lo que falta y la manda por correo. Estado: " +
      "radicado ante aseguradora."
  ),
  vineta(
    "4. La aseguradora responde (aseguradora). ",
    "Hasta 15 días hábiles. A los 5 días sin respuesta el caso aparece como represado en el " +
      "tablero, que es el mismo umbral que usaba la columna ALERTA del Excel."
  ),
  vineta(
    "5. Se le envían cuatro documentos al cliente (Juan). ",
    "El endoso, la carátula de la póliza, el certificado de pago y el clausulado general. Los " +
      "cuatro, siempre. Estado: enviado al cliente. AQUÍ SE CIERRA EL CASO: la entrega es el " +
      "cierre, no hay nada que marcar después. Es además el momento que cuenta para la cifra del mes."
  ),
  vineta(
    "6. El cliente lo lleva al banco (cliente). ",
    "Con Bancolombia hay un paso extra: el cliente tiene que descargar el formulario de su web, " +
      "firmarlo y cargar los cuatro documentos en el portal. Conviene recordárselo al entregarle todo."
  ),
  vineta(
    "7. El banco lo acepta… o lo devuelve (banco). ",
    "Si lo acepta, no hay que hacer nada: el caso ya quedó cerrado en el paso 5. Si lo devuelve y " +
      "el cliente avisa, el caso REABRE y vuelve al paso 2: otro formato, otra espera de 15 días, " +
      "otro envío. Estado: reproceso. Ese es el único camino de vuelta."
  ),
  subtitulo("Dónde empieza y dónde termina"),
  suelto(
    "Un caso se cierra al entregarle los documentos al cliente, y solo vuelve a abrirse si él " +
      "reporta un reproceso. Nadie tiene que acordarse de «cerrarlo» a mano: el correo de " +
      "agradecimiento del cliente, o su confirmación de que ya lo radicó en el banco, no cambia " +
      "nada — se queda como nota en la bitácora."
  ),
  suelto(
    "El estado «Cerrado sin entregar» es para otra cosa: el trámite que muere sin llegar al " +
      "cliente, porque se resolvió por otro lado, se duplicó o la copropiedad lo retiró. Si hubo " +
      "entrega, el estado correcto es «Enviado al cliente», no ese."
  ),
  suelto(
    "El endoso no es de una sola vez. Vive lo que viva la póliza de áreas comunes del edificio. " +
      "Cuando esa se renueva, el endoso hay que rehacerlo; el propio banco lo pide así: «en todos " +
      "los casos la renovación del endoso deberá entregarse al vencimiento de la póliza». El CRM " +
      "avisa 15 días antes."
  )
);

// 3 ---------------------------------------------------------------------------
parrafos.push(titulo("3. La revisión antes de radicar"));
parrafos.push(
  suelto(
    "Nueve comprobaciones. Ninguna bloquea a la fuerza —siempre se puede seguir adelante—, pero " +
      "avisan antes, no después de tres semanas de espera."
  ),
  suelto(
    "Lo importante es que separan dos cosas que no son iguales: un dato que FALTA es trabajo " +
      "pendiente, y un dato que ESTÁ MAL es una devolución en camino. Mezclarlas fue el error de " +
      "la primera versión: 39 de 40 casos abiertos salían en rojo por datos incompletos, y un rojo " +
      "que sale siempre se deja de mirar."
  ),
  tabla(
    ["Qué se revisa", "Qué se exige", "Si falla"],
    [
      [
        "Dirección completa",
        "Nomenclatura, ciudad y apartamento. Torre, cuarto útil y parqueadero: si no tiene, se escribe «No aplica»; en blanco hace dudar al banco.",
        "No enviar",
      ],
      [
        "Banco y NIT",
        "El banco sale de la lista oficial con su NIT ya cargado. Se comprueba hasta el dígito de verificación.",
        "No enviar",
      ],
      [
        "Davivienda vs. DAVIbank",
        "Son dos entidades distintas con nombres casi iguales. Davivienda es NIT 860034313-7; DAVIbank, el antiguo Scotiabank Colpatria, es 860034594-1.",
        "No enviar",
      ],
      [
        "Requisitos del banco",
        "Las exigencias propias de cada entidad (ver la sección 4).",
        "Revisar",
      ],
      [
        "Tipo de crédito",
        "Hipotecario o leasing. En leasing el banco va como PROPIETARIO y el cliente como locatario, y el formato cambia.",
        "Revisar",
      ],
      [
        "Valor razonable",
        "Ningún inmueble real baja de unos $70 millones. Por debajo de $10 millones es casi seguro que al cliente se le fueron dígitos.",
        "No enviar",
      ],
      [
        "Póliza vigente",
        "Mientras el edificio está en renovación la aseguradora no emite endosos. Avisa desde 30 días antes del vencimiento.",
        "No enviar",
      ],
      [
        "Paz y salvo",
        "Sin certificado de pago al día no hay endoso. Avisa desde 15 días antes de que venza.",
        "No enviar",
      ],
      [
        "Valor vs. coeficiente",
        "Que lo que pide el banco quepa en lo que le corresponde al apartamento, con las tolerancias del 20 % y del 40 %.",
        "No enviar",
      ],
    ],
    [22, 60, 18]
  ),
  new Paragraph({ text: "", spacing: { after: 120 } }),
  suelto("Al final, el caso queda en una de cuatro situaciones:"),
  vineta("Listo. ", "Se puede radicar."),
  vineta("Faltan datos. ", "Solo hay que llenarlos; no hay ningún problema detectado."),
  vineta("Revisar. ", "Hay algo puesto que conviene mirar antes de enviar."),
  vineta("No enviar. ", "Tal como está, el banco lo devuelve.")
);

// 4 ---------------------------------------------------------------------------
parrafos.push(titulo("4. Las manías de cada banco"));
parrafos.push(
  suelto(
    "Cada entidad tiene la suya, y saltarse una cuesta el trámite entero. Esto vivía en la firma " +
      "automática del correo y en la memoria de Juan; ahora el CRM lo saca solo en cuanto se elige " +
      "el banco."
  ),
  vineta(
    "Fondo Nacional del Ahorro — no prospera. ",
    "No recibe endosos de aseguradoras externas: exige deducible al 0 %. El trámite no va a salir " +
      "adelante, y lo mejor es decírselo al cliente de entrada en vez de radicarlo."
  ),
  vineta(
    "BBVA — paz y salvo literal. ",
    "Solo acepta el endoso si el paz y salvo dice textualmente «Pagado en su Totalidad». La " +
      "copropiedad debe haber cancelado el 100 % de la póliza; no basta con estar al día en cuotas."
  ),
  vineta(
    "Davivienda — paz y salvo literal. ",
    "La misma exigencia que BBVA: el paz y salvo tiene que decir «Pagado en su Totalidad», con el " +
      "100 % de la póliza cancelado."
  ),
  vineta(
    "Bancolombia — recordárselo al cliente. ",
    "Exige que el cliente descargue el formulario de su web, lo firme y cargue cuatro documentos " +
      "en el portal: póliza, clausulado, paz y salvo y endoso. No estorba para radicar; es para el " +
      "momento de entregarle los documentos."
  )
);

// 5 ---------------------------------------------------------------------------
parrafos.push(titulo("5. La cuenta del coeficiente"));
parrafos.push(
  suelto(
    "Un apartamento solo puede endosarse hasta lo que le corresponde de la póliza del edificio. " +
      "Eso se calcula multiplicando el valor asegurado total por el coeficiente del apartamento, y " +
      "luego se compara con lo que pide el banco aplicando dos tolerancias."
  ),
  subtitulo("Ejemplo real · Puerto Ventura, apartamento 2119"),
  vineta("Valor asegurado del edificio: ", "$ 80.945.125.857"),
  vineta("Coeficiente del apartamento: ", "0,25 %"),
  vineta("Le corresponden: ", "$ 202.362.815"),
  vineta("Tope con el 20 % admitido: ", "$ 242.835.378"),
  vineta("Tope con el 40 %, segundo filtro: ", "$ 283.307.941"),
  vineta("Lo que pide el banco: ", "$ 162.369.194 — cabe."),
  subtitulo("Cómo se lee el resultado"),
  vineta("Cabe en el tope del 20 %. ", "Se radica sin más. Es el caso normal."),
  vineta(
    "Se pasa del 20 % pero cabe en el 40 %. ",
    "Se puede radicar, pero la aseguradora puede pedir justificación."
  ),
  vineta(
    "Se pasa incluso del 40 %. ",
    "Hay que cobrar prima adicional o ajustar el valor con el banco. Radicarlo así es pedir la devolución."
  ),
  suelto(
    "El coeficiente se averigua una sola vez. Está en el reglamento de propiedad horizontal y no " +
      "cambia nunca. El CRM guarda el de cada apartamento por separado del caso, así que en cuanto " +
      "se teclea el número de apartamento aparece solo, también el año que viene cuando toque " +
      "renovar ese mismo endoso."
  )
);

// 6 ---------------------------------------------------------------------------
parrafos.push(titulo("6. Los relojes"));
parrafos.push(
  tabla(
    ["Plazo", "Cuánto", "Qué pasa al cumplirse"],
    [
      ["Respuesta de la aseguradora", "15 días hábiles", "Es lo que tarda de verdad. No hay atajo."],
      ["Alerta de represado", "5 días", "El caso aparece marcado en el tablero para que alguien insista."],
      [
        "Aviso de renovación",
        "15 días antes",
        "Cuando la póliza del edificio está por vencer, sus endosos entran en «Por renovar».",
      ],
      [
        "Revisión del buzón",
        "Cada hora",
        "Los correos nuevos entran solos al CRM. La hora de la última pasada sale en la cabecera de Endosos.",
      ],
      [
        "Casos por planilla",
        "60",
        "Es el sitio que trae cada plantilla. El CRM avisa antes de pulsar, no después.",
      ],
    ],
    [30, 18, 52]
  ),
  new Paragraph({ text: "", spacing: { after: 120 } })
);

// 7 ---------------------------------------------------------------------------
parrafos.push(titulo("7. Qué hace el CRM y qué sigue siendo tuyo"));
parrafos.push(
  suelto(
    "La regla de fondo no ha cambiado: el CRM escribe en la base de datos, pero no le manda correo " +
      "a nadie. Todo lo que sale hacia una aseguradora o hacia un cliente lo envía una persona."
  ),
  subtitulo("Lo hace el CRM"),
  vineta("Lee el buzón cada hora ", "y crea o actualiza los casos, con la fecha en que entró la solicitud."),
  vineta("Hereda de la ficha del edificio ", "la aseguradora, el número de póliza y la ciudad."),
  vineta("Pone el coeficiente ", "en cuanto se escribe el apartamento."),
  vineta("Completa el NIT del banco ", "desde la lista oficial y corrige su escritura."),
  vineta("Corre las nueve revisiones ", "y avisa de las manías del banco."),
  vineta("Genera la planilla ", "de AXA, Zurich, Previsora y SBS con los casos marcados."),
  vineta("Cuenta los días de espera ", "y avisa de los represados y de los que toca renovar."),
  subtitulo("Sigue siendo tuyo"),
  vineta("Enviar los correos, ", "a la aseguradora y al cliente."),
  vineta("Negociar la tasa ", "con la aseguradora: el CRM deja esa celda en blanco a propósito."),
  vineta("Decidir el tipo de endoso: ", "comercial o reconstrucción."),
  vineta("El tipo de documento ", "(CC / CE / NIT) y el tipo de propiedad (apartamento, casa, local)."),
  vineta("Conseguir el paz y salvo ", "con la administración del edificio."),
  vineta("Juzgar lo que quedó en ámbar: ", "un valor raro, un banco que no está en la lista."),
  subtitulo("Dónde está la revisión"),
  suelto(
    "En el tablero, la columna de la izquierda enseña la fecha en que se recibió la solicitud, y " +
      "se puede acotar por un rango de fechas. La revisión completa —los nueve puntos, con lo que " +
      "está bien y lo que no— sale al abrir el caso, y también sirve como filtro: «Listos para " +
      "enviar» y «Con problema»."
  ),
  subtitulo("Las fórmulas de las planillas no se tocan"),
  suelto(
    "Previsora, SBS y Zurich traen sus propios cálculos de tasa, prima, IVA y filtros de " +
      "coeficiente, ya validados con la aseguradora. El CRM solo escribe en las celdas de entrada y " +
      "deja esas intactas para que Excel las recalcule al abrir el archivo. Cuando falta un dato que " +
      "el CRM no guarda, la celda se deja en blanco y se reporta; nunca se inventa."
  )
);

// 8 ---------------------------------------------------------------------------
parrafos.push(titulo("8. Cuatro devoluciones reales"));
parrafos.push(
  suelto(
    "Estas pasaron. Las cuatro eran verificables antes de enviar, y las cuatro costaron rehacer el " +
      "trámite entero."
  ),
  vineta(
    "Nicole Forbes — Marsella, apto 1808. ",
    "Faltaba la ciudad en la dirección, el beneficiario decía «Davivienda» cuando el banco era " +
      "DAVIbank —otra entidad, otro NIT— y el NIT estaba mal. Tres errores, los tres de la lista " +
      "de revisión."
  ),
  vineta(
    "Julio César García — Paseo del Parque, apto 0810. ",
    "Devuelto dos veces. Era un leasing: el Banco de Bogotá tenía que figurar como propietario, " +
      "con los dos locatarios aparte."
  ),
  vineta(
    "Luz Delia Arroyave — Sendero Verde, apto 427. ",
    "Torre equivocada y valor equivocado, corregidos en dos correos distintos. Y el banco además " +
      "exigía que el paz y salvo dijera «cancelado»."
  ),
  vineta(
    "Paola Ramírez — Majagua, apto 1145. ",
    "Pidió el endoso por $61.524. Ningún caso real baja de $70 millones: al cliente se le fueron " +
      "dígitos al escribir. Digitado tal cual, se radica mal y vuelve."
  ),
  new Paragraph({
    children: [
      new TextRun({
        text:
          "Las cifras de reprocesos salen del histórico de abril a agosto de 2026: 227 devoluciones " +
          "sobre 2.163 correos, 118 de ellas solo en julio. Los umbrales —5 días, 15 días, 20 % y " +
          "40 %— son los que ya usaba la agencia; esta guía los recoge, no los cambia.",
        italics: true,
        size: 18,
      }),
    ],
    spacing: { before: 240 },
  })
);

// --- Armado -----------------------------------------------------------------

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
  sections: [{ properties: {}, children: parrafos }],
});

const salida = process.argv[2] ?? path.join(process.cwd(), "MANUAL DEL ENDOSO.docx");

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(salida, buffer);
  console.log(`Escrito: ${salida} (${(buffer.length / 1024).toFixed(1)} KB)`);
});
