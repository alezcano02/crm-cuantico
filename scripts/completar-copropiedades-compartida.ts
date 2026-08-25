/**
 * Rellena las 8 fichas de copropiedad que no están en la cartera, con lo que
 * se encontró en la carpeta compartida.
 *
 * Estas ocho tienen endosos tramitados —Perlato lleva 50— pero su póliza no
 * aparece en el informe de producción, ni por nombre ni por número ni por NIT.
 * Los datos salen de dos sitios de la compartida:
 *
 *   · «3. Area Tecnica/Endosos y paz y salvos/CERTIFICADOS DE PAZ Y SALVO/»,
 *     los certificados que emite cada aseguradora.
 *   · «…/ENDOSOS/EXCEL/2026/<COPROPIEDAD>/», los formatos de endoso que se le
 *     mandan a la compañía, que en el formato nuevo traen vigencia.
 *
 * Cada dato de aquí abajo lleva anotado de qué archivo salió, para poder
 * comprobarlo. Lo que no estaba documentado se deja vacío a propósito: una
 * vigencia inventada haría que el aviso de renovación mienta, que es peor que
 * no avisar.
 *
 * Uso:
 *   npx tsx scripts/completar-copropiedades-compartida.ts
 *   npx tsx scripts/completar-copropiedades-compartida.ts --aplicar
 */
import { prisma } from "../lib/prisma";

const APLICAR = process.argv.includes("--aplicar");

interface Hallazgo {
  ficha: string;
  aseguradora: string;
  numeroPoliza: string;
  nit?: string;
  /** AAAA-MM-DD. Vacío si no aparecía en ningún documento. */
  vigenciaHasta?: string;
  valorAseguradoTotal?: number;
  /** De dónde salió cada cosa. Queda escrito en la ficha. */
  fuente: string;
  /** true si la fecha se dedujo del aniversario, no estaba escrita tal cual. */
  vigenciaDeducida?: boolean;
}

const HALLAZGOS: Hallazgo[] = [
  {
    ficha: "Urbanización Q",
    aseguradora: "PREVISORA",
    numeroPoliza: "1006468",
    nit: "900778057-3",
    vigenciaHasta: "2026-10-29",
    valorAseguradoTotal: 108_814_671_231,
    fuente:
      "certificado «URBANIZACIÓN Q PROPIEDAD HORIZONTAL 1006468.pdf» (áreas comunes, vigencia 29/10/2025–29/10/2026) y formato «ENDOSO URBANIZACIÓN Q 11-05-2026.xlsx»",
  },
  {
    ficha: "Villa Central",
    aseguradora: "MAPFRE",
    numeroPoliza: "630/4205223000790",
    nit: "890938635-2",
    vigenciaHasta: "2026-11-08",
    fuente:
      "certificado «PAZ Y SALVO VILLA CENTRAL.pdf» (vigencia 09/11/2025–08/11/2026, recaudada en su totalidad)",
  },
  {
    ficha: "Nuevo Milenio",
    aseguradora: "AXA COLPATRIA",
    numeroPoliza: "3003",
    nit: "900637570-6",
    vigenciaHasta: "2026-10-14",
    fuente:
      "formato «ENDOSOS NUEVO MILENIO 17-07-2026.xlsx» (vigencia 14/10/2025–14/10/2026). Tomador: URBANIZACION NUEVO MILENIO P.H PRIMERA ETAPA, TORRE 2",
  },
  {
    ficha: "Canta Piedra",
    aseguradora: "AXA COLPATRIA",
    numeroPoliza: "2841",
    nit: "811030881-2",
    vigenciaHasta: "2026-11-15",
    fuente:
      "formato «ENDOSOS CANTA PIEDRA 23-06-2026.xlsx» (vigencia 15/11/2025–15/11/2026)",
  },
  {
    ficha: "DUQUESA",
    aseguradora: "AXA COLPATRIA",
    numeroPoliza: "2868",
    nit: "900251932-0",
    vigenciaHasta: "2026-12-17",
    vigenciaDeducida: true,
    fuente:
      "certificado de 2025 «UNIDAD RESIDENCIAL LA DUQUESA P.H. (1).pdf» (vigencia 17/12/2024–17/12/2025) y certificado de enero de 2026 con cuotas al 14/01, 13/02 y 15/03 de 2026",
  },
  {
    ficha: "Laureles Campestre",
    aseguradora: "PREVISORA",
    numeroPoliza: "1006965",
    nit: "811032047-5",
    vigenciaHasta: "2025-12-31",
    fuente:
      "certificado «URBANIZACION LAURELES CAMPESTRE1006965.pdf» (áreas comunes, vigencia 05/05/2025–31/12/2025). OJO: esa vigencia YA VENCIÓ y la póliza no aparece en la cartera; hay que confirmar si se renovó o si se perdió la cuenta",
  },
  {
    ficha: "Perlato",
    aseguradora: "AXA COLPATRIA",
    numeroPoliza: "2855",
    nit: "901017111-2",
    fuente:
      "certificados «PAZ Y SALVO PERLATO.pdf» y «CERTIFICADO DE PAGO CONJUNTO DE USO MIXTO PERLATO P.H V2.pdf» (póliza 2855, multirriesgo, con acuerdo de pago). Ninguno dice la vigencia y los formatos de endoso de esta copropiedad tampoco la traen: hay que pedírsela a AXA",
  },
  {
    ficha: "Montecarmelo",
    aseguradora: "AXA COLPATRIA",
    numeroPoliza: "2852",
    nit: "900618032-4",
    fuente:
      "certificado «CONJUNTO RESIDENCIAL URBANIZACION MONTECARMELO.pdf» (póliza 2852, multirriesgo) y formato «ENDOSO MONTECARMELO 11-05-2026.xlsx». Ninguno dice la vigencia: hay que pedírsela a AXA. En la hoja Consolidado figuraba con Seguros del Estado en agosto de 2025, así que cambió de compañía",
  },
];

async function main() {
  console.log(APLICAR ? "APLICANDO\n" : "SIMULACIÓN (añade --aplicar para escribir)\n");

  let conVigencia = 0;
  for (const h of HALLAZGOS) {
    const ficha = await prisma.copropiedad.findFirst({ where: { nombre: h.ficha } });
    if (!ficha) {
      console.log(`   ${h.ficha}: NO existe la ficha`);
      continue;
    }
    const n = await prisma.endoso.count({ where: { copropiedadId: ficha.id } });
    if (h.vigenciaHasta) conVigencia++;
    console.log(
      `   ${h.ficha.padEnd(20)} ${n.toString().padStart(3)} endosos · ${h.aseguradora} · pól. ${h.numeroPoliza} · vence ${h.vigenciaHasta ?? "SIN DATO"}${h.vigenciaDeducida ? " (deducida)" : ""}`
    );

    if (APLICAR) {
      await prisma.copropiedad.update({
        where: { id: ficha.id },
        data: {
          aseguradora: h.aseguradora,
          numeroPoliza: h.numeroPoliza,
          nit: h.nit ?? null,
          vigenciaHasta: h.vigenciaHasta ? new Date(`${h.vigenciaHasta}T12:00:00Z`) : null,
          valorAseguradoTotal: h.valorAseguradoTotal ?? null,
          nota:
            "NO aparece en la cartera del CRM; los datos se sacaron de la carpeta compartida. " +
            `Fuente: ${h.fuente}.` +
            (h.vigenciaDeducida
              ? " La fecha de vencimiento es el aniversario de la vigencia anterior, no estaba escrita como tal: confirmar con la aseguradora."
              : "") +
            (h.vigenciaHasta ? "" : " FALTA LA VIGENCIA: sin ella esta copropiedad no entra en el aviso de renovación.") +
            (h.valorAseguradoTotal ? "" : " Falta el valor asegurado del edificio y el paz y salvo."),
        },
      });
    }
  }

  console.log(
    `\n${conVigencia} de ${HALLAZGOS.length} con vigencia documentada · ${HALLAZGOS.length - conVigencia} sin ella`
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
