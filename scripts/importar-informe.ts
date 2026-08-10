/**
 * Importa el informe de producción desde la línea de comandos.
 *
 *   npx tsx scripts/importar-informe.ts "<informe.xlsx>"
 *
 * Reproduce paso por paso la transacción de app/api/import/route.ts, incluida
 * la conservación de la gestión de renovación y de la cobranza registrada
 * dentro de la aplicación. Si los dos se separan, manda la ruta: es la que usa
 * la gente desde la pantalla de Importar datos.
 *
 * Existe para poder importar sin pasar por la interfaz cuando el .xlsx está en
 * la carpeta sincronizada del SharePoint. Comprobar antes con
 * scripts/ensayo-importacion.ts, que dice qué va a cambiar sin escribir nada.
 */
import { readFileSync } from "node:fs";
import { prisma } from "../lib/prisma";
import { parsearLibro } from "../lib/excel";
import { aplicarMapaColectivas, buscadorDePrevias, numerosColectivos } from "../lib/mapa-colectivas";

async function main() {
  const ruta = process.argv[2];
  if (!ruta) {
    console.log('Uso: npx tsx scripts/importar-informe.ts "<informe.xlsx>"');
    process.exit(1);
  }

  const datos = parsearLibro(readFileSync(ruta).buffer as ArrayBuffer);
  console.log(
    `Leído: ${datos.policies.length} pólizas, ${datos.otherPolicies.length} otras, ` +
    `${datos.cancellations.length} cancelaciones, ${datos.historical.length} histórico, ` +
    `${datos.listas.length} listas.`
  );

  // Conservar lo que la aplicación administra y el Excel no debe pisar,
  // casando por número de póliza + ramo.
  const previas = await prisma.policy.findMany({
    where: { OR: [{ gestionada: true }, { cobranzaEditadaEn: { not: null } }] },
    select: {
      numero: true, ramo: true, gestionada: true, notaGestion: true,
      gestionadaEn: true, cobranzaEditadaEn: true, estadoPago: true,
      fechaPago: true, fechaMaxPago: true, valorCuota: true, notaCartera: true,
    },
  });
  const buscarPrevia = buscadorDePrevias(previas, await numerosColectivos());
  let cobranzaConservada = 0;

  await prisma.$transaction(
    async (tx) => {
      if (datos.policies.length > 0) {
        await tx.policy.deleteMany();
        await tx.policy.createMany({
          data: datos.policies.map((p) => {
            const previa = buscarPrevia(p.numero, p.ramo);
            const conservarCobranza = previa?.cobranzaEditadaEn != null;
            if (conservarCobranza) cobranzaConservada++;
            return {
              ...p,
              gestionada: previa?.gestionada ?? false,
              notaGestion: previa?.notaGestion ?? null,
              gestionadaEn: previa?.gestionadaEn ?? null,
              // Manda el CRM: el pago se registró aquí, no en el informe.
              ...(conservarCobranza
                ? {
                    estadoPago: previa!.estadoPago,
                    fechaPago: previa!.fechaPago,
                    fechaMaxPago: previa!.fechaMaxPago,
                    valorCuota: previa!.valorCuota,
                    notaCartera: previa!.notaCartera,
                    cobranzaEditadaEn: previa!.cobranzaEditadaEn,
                  }
                : {}),
            };
          }),
        });
      }
      if (datos.otherPolicies.length > 0) {
        await tx.otherPolicy.deleteMany();
        await tx.otherPolicy.createMany({ data: datos.otherPolicies });
      }
      if (datos.cancellations.length > 0) {
        // Solo las del Excel; las creadas dentro de la app (manual) se quedan.
        await tx.cancellation.deleteMany({ where: { manual: false } });
        await tx.cancellation.createMany({ data: datos.cancellations });
      }
      if (datos.historical.length > 0) {
        await tx.historicalPolicy2025.deleteMany();
        await tx.historicalPolicy2025.createMany({ data: datos.historical });
      }
      if (datos.listas.length > 0) {
        await tx.listValue.deleteMany();
        await tx.listValue.createMany({ data: datos.listas });
      }
    },
    { timeout: 55000 }
  );

  console.log(`\nImportado. Cobranza conservada en ${cobranzaConservada} pólizas.`);

  /*
   * La importación borra y recrea la cartera, así que se lleva por delante los
   * nombres de ramo de las colectivas y las marcas de recibo. Se vuelven a
   * aplicar aquí mismo: si no, entre la importación y el siguiente arreglo
   * manual el dashboard contaría cada inclusión como producción propia.
   */
  const mapa = await aplicarMapaColectivas();
  console.log(
    `Mapa de colectivas: ${mapa.madresRenombradas} renombradas, ` +
      `${mapa.recibosMarcados} recibos absorbidos.`
  );
  if (mapa.recibosSinPoliza.length)
    console.log(`  Recibos declarados que ya no están en el informe: ${mapa.recibosSinPoliza.join(", ")}`);
  if (mapa.madresSinPoliza.length)
    console.log(`  Colectivas declaradas que ya no están en el informe: ${mapa.madresSinPoliza.join(", ")}`);

  console.log("Ahora en la base:");
  for (const [k, v] of [
    ["cartera", await prisma.policy.count()],
    ["otras pólizas", await prisma.otherPolicy.count()],
    ["cancelaciones (Excel)", await prisma.cancellation.count({ where: { manual: false } })],
    ["histórico 2025", await prisma.historicalPolicy2025.count()],
    ["listas", await prisma.listValue.count()],
    ["siniestros (sin tocar)", await prisma.siniestro.count()],
  ] as [string, number][]) {
    console.log(`  ${k.padEnd(24)} ${v}`);
  }
  await prisma.$disconnect();
}

main();
