import { NextRequest, NextResponse } from "next/server";
import {
  AlignmentType,
  Document,
  HeadingLevel,
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

  const informe = construirInforme(polizas as PolizaInforme[], { asesor });

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

  const linea = (texto: string) =>
    new Paragraph({ text: texto, spacing: { after: 60 } });

  // Encabezado
  parrafos.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `CARTERA${informe.asesor ? " " + informe.asesor : ""}`,
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
    parrafos.push(linea("Sin pólizas vencidas de pago."));
  } else {
    for (const g of informe.vencida) {
      parrafos.push(mes(g.mes));
      for (const l of g.lineas) parrafos.push(linea(l.texto));
    }
  }

  parrafos.push(titulo("Próxima a vencer"));
  if (informe.proxima.length === 0) {
    parrafos.push(linea("Sin pólizas próximas a vencer."));
  } else {
    for (const g of informe.proxima) {
      parrafos.push(mes(g.mes));
      for (const l of g.lineas) parrafos.push(linea(l.texto));
    }
  }

  if (informe.casos.length > 0) {
    parrafos.push(titulo("CASOS:"));
    for (const c of informe.casos) parrafos.push(linea(c));
  }

  const doc = new Document({
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
