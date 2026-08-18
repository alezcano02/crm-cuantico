import { NextRequest, NextResponse } from "next/server";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { prisma } from "@/lib/prisma";
import { construirInforme, PolizaInforme } from "@/lib/informe-cartera";
import { exigirSesion } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Genera el informe de cartera en Word con el mismo formato que la agencia
 * escribía a mano (documento "CARTERA <asesor>.docx").
 */
export async function GET(req: NextRequest) {
  const noAutorizado = await exigirSesion();
  if (noAutorizado) return noAutorizado;
  const asesor = req.nextUrl.searchParams.get("asesor");
  // ?ramo=AUTOS&ramo=HOGAR — repetido, no separado por comas: los nombres de
  // ramo llevan espacios y alguno podría llevar coma.
  const ramos = req.nextUrl.searchParams.getAll("ramo").filter(Boolean);

  const polizas = await prisma.policy.findMany({
    select: {
      numero: true,
      ramo: true,
      asegurado: true,
      placa: true,
      aseguradora: true,
      formaPago: true,
      estadoPago: true,
      primaTotal: true,
      valorCuota: true,
      celular: true,
      correo: true,
      notaCartera: true,
      fechaMaxPago: true,
      asesor1: true,
      asesor2: true,
    },
  });

  const informe = construirInforme(polizas as PolizaInforme[], { asesor, ramos });

  const parrafos: Paragraph[] = [];

  const titulo = (texto: string) =>
    new Paragraph({
      text: texto,
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 },
    });

  const mes = (texto: string) =>
    new Paragraph({
      children: [new TextRun({ text: texto, bold: true })],
      spacing: { before: 160, after: 60 },
    });

  /*
   * Cada póliza es una viñeta.
   *
   * Antes iban como párrafos sueltos y un mes con quince pólizas se leía como
   * un bloque corrido: no se veía dónde acababa una y empezaba la siguiente.
   * La viñeta lo separa de un vistazo, que es como se lee este informe —
   * repasándolo póliza por póliza con el cliente al teléfono.
   *
   * La viñeta la pone Word con la numeración declarada abajo, no un «•»
   * escrito en el texto: así se puede sangrar, continuar en la línea siguiente
   * y copiar a otro documento sin que se rompa.
   */
  const linea = (nombre: string, resto: string) =>
    new Paragraph({
      children: [
        // El nombre en negrilla: el informe se repasa buscando clientes, y
        // destacarlo es lo que permite encontrar uno a mitad de una lista.
        new TextRun({ text: nombre, bold: true }),
        new TextRun({ text: resto }),
      ],
      numbering: { reference: "vinetas", level: 0 },
      spacing: { after: 60 },
    });

  /** Las frases sueltas que no son una póliza (avisos de sección vacía). */
  const suelto = (texto: string) =>
    new Paragraph({ text: texto, spacing: { after: 60 } });

  // Encabezado
  parrafos.push(
    new Paragraph({
      children: [
        new TextRun({
          text:
            `CARTERA${informe.asesor ? " " + informe.asesor : ""}` +
            (informe.ramos.length ? ` · ${informe.ramos.join(", ")}` : ""),
          bold: true,
          size: 32,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
    })
  );
  parrafos.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Generado el ${informe.generadoEl.toLocaleDateString("es-CO", { timeZone: "UTC" })}`,
          italics: true,
          size: 18,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );

  parrafos.push(titulo("Cartera Vencida"));
  if (informe.vencida.length === 0) {
    parrafos.push(suelto("Sin pólizas vencidas de pago."));
  } else {
    for (const g of informe.vencida) {
      parrafos.push(mes(g.mes));
      for (const l of g.lineas) parrafos.push(linea(l.asegurado, l.resto));
    }
  }

  parrafos.push(titulo("Próxima a vencer"));
  if (informe.proxima.length === 0) {
    parrafos.push(suelto("Sin pólizas próximas a vencer."));
  } else {
    for (const g of informe.proxima) {
      parrafos.push(mes(g.mes));
      for (const l of g.lineas) parrafos.push(linea(l.asegurado, l.resto));
    }
  }

  if (informe.casos.length > 0) {
    parrafos.push(titulo("CASOS:"));
    for (const c of informe.casos) parrafos.push(suelto(c));
  }

  const doc = new Document({
    // Sin esta declaración, un párrafo que diga `numbering: { reference:
    // "vinetas" }` no encuentra a qué lista pertenece y Word no dibuja nada.
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

  const buffer = await Packer.toBuffer(doc);
  const hoy = informe.generadoEl;
  const sello = `${hoy.getUTCFullYear()}${String(hoy.getUTCMonth() + 1).padStart(2, "0")}${String(hoy.getUTCDate()).padStart(2, "0")}`;
  const nombre = `CARTERA ${informe.asesor ?? "GENERAL"} ${sello}.docx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(nombre)}"`,
    },
  });
}
