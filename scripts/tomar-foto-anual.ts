/**
 * Congela la cartera de un año de producción para que no se desvanezca.
 *
 *   npx tsx scripts/tomar-foto-anual.ts 2026            (ensayo)
 *   npx tsx scripts/tomar-foto-anual.ts 2026 --aplicar
 *   npx tsx scripts/tomar-foto-anual.ts 2025 --desde-base-2025 --aplicar
 *
 * CUÁNDO CORRERLO
 *
 * En enero, para el año que acaba de terminar. La producción del año N son las
 * pólizas que vencen en N+1, y esas se renuevan A LO LARGO de N+1: cada
 * renovación mueve el vencimiento a N+2 y borra esa póliza de la producción de
 * N. Por eso la foto de N hay que tomarla antes de que empiece a renovarse,
 * es decir, al arrancar N+1.
 *
 * Tomarla tarde no avisa de nada: simplemente congela una cifra ya erosionada.
 * Por eso el script compara contra lo que la foto debería valer y avisa si el
 * año que se está fotografiando ya perdió pólizas.
 *
 * EL CASO DE 2025
 *
 * 2025 ya se erosionó —de $6.138M quedan $2.752M visibles en la cartera— así
 * que su foto no puede salir de `Policy`. Sale de `HistoricalPolicy2025`, que
 * es la hoja BASE 2025 y sí es el registro fiel del año. Para eso está
 * --desde-base-2025.
 */
import { prisma } from "../lib/prisma";

const args = process.argv.slice(2);
const APLICAR = args.includes("--aplicar");
const DESDE_BASE = args.includes("--desde-base-2025");
const ANIO = Number(args.find((a) => /^\d{4}$/.test(a)));

const cop = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

async function main() {
  if (!ANIO) {
    console.error("Falta el año. Ej.: npx tsx scripts/tomar-foto-anual.ts 2026");
    process.exit(1);
  }

  // Producción del año N = pólizas que vencen en N+1.
  const desde = new Date(Date.UTC(ANIO + 1, 0, 1));
  const hasta = new Date(Date.UTC(ANIO + 2, 0, 1));
  // …salvo las que llevan fecha de expedición, que cuentan en el año en que se
  // vendieron y no en el de su vencimiento. Sin esto, una de cumplimiento
  // expedida en 2026 y con vencimiento en 2029 se quedaba fuera de la foto de
  // 2026 y su producción desaparecía al cerrar el año. Ver Policy.expedidaEn.
  const expDesde = new Date(Date.UTC(ANIO, 0, 1));
  const expHasta = new Date(Date.UTC(ANIO + 1, 0, 1));

  const filas = DESDE_BASE
    ? (await prisma.historicalPolicy2025.findMany()).map((h) => ({
        anioProduccion: ANIO,
        numero: h.numero,
        ramo: h.ramo,
        asegurado: h.asegurado ?? "",
        ccNit: null,
        placa: null,
        aseguradora: null, // la hoja BASE 2025 no registra aseguradora
        tipoNegocio: h.tipoNegocio,
        observacion: null,
        asesor1: null,
        asesor2: null,
        primaNeta: h.primaNeta,
        primaTotal: h.primaTotal,
        formaPago: null,
        estadoPago: null,
        vencimiento: h.vencimiento,
        expedidaEn: null,
      }))
    : (
        await prisma.policy.findMany({
          where: {
            OR: [
              { expedidaEn: { gte: expDesde, lt: expHasta } },
              { expedidaEn: null, vencimiento: { gte: desde, lt: hasta } },
            ],
          },
        })
      ).map((p) => ({
        anioProduccion: ANIO,
        numero: p.numero,
        ramo: p.ramo,
        asegurado: p.asegurado,
        ccNit: p.ccNit,
        placa: p.placa,
        aseguradora: p.aseguradora,
        tipoNegocio: p.tipoNegocio,
        observacion: p.observacion,
        asesor1: p.asesor1,
        asesor2: p.asesor2,
        primaNeta: p.primaNeta,
        primaTotal: p.primaTotal,
        formaPago: p.formaPago,
        estadoPago: p.estadoPago,
        vencimiento: p.vencimiento,
        expedidaEn: p.expedidaEn,
      }));

  const total = filas.reduce((s, f) => s + (f.primaNeta || 0), 0);
  const previa = await prisma.fotoPoliza.count({ where: { anioProduccion: ANIO } });

  console.log(`Foto de producción ${ANIO} (vencimientos de ${ANIO + 1})`);
  console.log(`  origen: ${DESDE_BASE ? "hoja BASE 2025" : "cartera actual"}`);
  console.log(`  ${filas.length} pólizas · ${cop(total)} de prima neta`);
  if (previa) console.log(`  ya existe una foto de ${ANIO} con ${previa} filas: se reemplaza`);

  /*
   * Aviso de erosión: si el año ya empezó a renovarse, la foto llega tarde y
   * congelaría una cifra incompleta. Se compara contra las canceladas más las
   * que ya migraron, que es lo que se puede saber sin un registro histórico.
   */
  const hoy = new Date();
  if (!DESDE_BASE && hoy.getUTCFullYear() > ANIO + 1) {
    console.log(
      `\n  ! Estamos en ${hoy.getUTCFullYear()} y esta foto es de ${ANIO}: las pólizas de ${ANIO + 1}\n` +
        `    llevan tiempo renovándose, así que esta cifra ya viene erosionada.\n` +
        `    La foto de un año se toma en enero del año siguiente.`
    );
  }

  if (!APLICAR) {
    console.log("\nEnsayo: no se escribió nada. Vuelva a correrlo con --aplicar.");
    await prisma.$disconnect();
    return;
  }

  // Borrar y reescribir el año entero: la foto refleja la cartera tal cual, y
  // actualizar fila por fila exigiría una llave única que el informe no tiene
  // (trae pólizas repetidas a propósito).
  await prisma.$transaction([
    prisma.fotoPoliza.deleteMany({ where: { anioProduccion: ANIO } }),
    prisma.fotoPoliza.createMany({ data: filas }),
  ]);

  console.log(`\nFoto de ${ANIO} guardada: ${filas.length} pólizas.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
