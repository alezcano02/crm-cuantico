/**
 * Ensayo en seco de la importación: dice qué entraría y qué se borraría, SIN
 * tocar la base.
 *
 *   npx tsx scripts/ensayo-importacion.ts "<informe.xlsx>" "<seguimiento.xlsx>" "<resumen.xlsx>"
 *
 * Existe porque /api/import no añade: BORRA Y RECREA la cartera, las otras
 * pólizas, las cancelaciones del Excel, el histórico y las listas. Conviene
 * ver los dos lados antes de pulsar, no después.
 */
import { readFileSync } from "node:fs";
import { prisma } from "../lib/prisma";
import { parsearLibro } from "../lib/excel";
import { parsearSeguimiento, parsearResumen } from "../lib/siniestros";
import { normalizarNumero, numerosColectivos } from "../lib/mapa-colectivas";

const n = (x: number) => x.toLocaleString("es-CO");

async function main() {
  const [informe, seguimiento, resumen] = process.argv.slice(2);

  if (informe) {
    console.log("=".repeat(64));
    console.log("INFORME DE PRODUCCIÓN");
    console.log("=".repeat(64));
    const datos = parsearLibro(readFileSync(informe).buffer as ArrayBuffer);

    const actual = {
      policies: await prisma.policy.count(),
      otherPolicies: await prisma.otherPolicy.count(),
      cancelaciones: await prisma.cancellation.count({ where: { manual: false } }),
      cancelacionesManuales: await prisma.cancellation.count({ where: { manual: true } }),
      historico: await prisma.historicalPolicy2025.count(),
      listas: await prisma.listValue.count(),
    };

    const filas: [string, number, number][] = [
      ["Cartera (policy)", actual.policies, datos.policies.length],
      ["Otras pólizas", actual.otherPolicies, datos.otherPolicies.length],
      ["Cancelaciones del Excel", actual.cancelaciones, datos.cancellations.length],
      ["Histórico 2025", actual.historico, datos.historical.length],
      ["Listas", actual.listas, datos.listas.length],
    ];
    console.log(`\n  ${"tabla".padEnd(26)}${"en la base".padStart(12)}${"en el Excel".padStart(13)}${"cambio".padStart(10)}`);
    for (const [k, hay, entra] of filas) {
      const d = entra - hay;
      console.log(
        `  ${k.padEnd(26)}${n(hay).padStart(12)}${n(entra).padStart(13)}` +
        `${(d === 0 ? "=" : d > 0 ? `+${n(d)}` : n(d)).padStart(10)}`
      );
    }
    console.log(`\n  Cancelaciones creadas a mano en la app: ${actual.cancelacionesManuales} (NO se tocan)`);

    // Lo que la app administra y el Excel no debe pisar.
    const gestionadas = await prisma.policy.count({ where: { gestionada: true } });
    const conCobranza = await prisma.policy.count({ where: { cobranzaEditadaEn: { not: null } } });
    const claves = new Set(datos.policies.map((p) => `${p.numero}|${p.ramo}`));
    // Las pólizas creadas dentro de la aplicación (manual) ya no se borran al
    // importar, así que no hay trabajo que perder en ellas: incluirlas hacía
    // que el ensayo avisara de una pérdida que no iba a ocurrir.
    const previas = await prisma.policy.findMany({
      where: {
        manual: false,
        OR: [{ gestionada: true }, { cobranzaEditadaEn: { not: null } }],
      },
      select: { numero: true, ramo: true },
    });
    // Las colectivas llevan en el CRM un ramo propio («Colectiva Autos») que no
    // existe en el Excel, así que para ellas se compara solo el número. Sin
    // esto el ensayo avisaba de que se iba a perder trabajo que en realidad se
    // conserva. Mismo criterio que la importación (buscadorDePrevias).
    const colectivos = await numerosColectivos();
    const numerosExcel = new Set(datos.policies.map((p) => normalizarNumero(p.numero)));
    const huerfanas = previas.filter((p) =>
      colectivos.has(normalizarNumero(p.numero))
        ? !numerosExcel.has(normalizarNumero(p.numero))
        : !claves.has(`${p.numero}|${p.ramo}`)
    );

    console.log(`\n  Trabajo hecho dentro de la app:`);
    console.log(`    ${gestionadas} pólizas marcadas como gestionadas`);
    console.log(`    ${conCobranza} con cobranza registrada en el CRM`);
    console.log(
      `    ${huerfanas.length} de ellas NO están en el Excel nuevo` +
      (huerfanas.length ? " -> ese trabajo SE PIERDE" : "")
    );
    for (const h of huerfanas.slice(0, 12)) console.log(`       · ${h.numero} (${h.ramo})`);
    if (huerfanas.length > 12) console.log(`       · … y ${huerfanas.length - 12} más`);

    if (datos.resumen) console.log(`\n  Resumen del parser:`, JSON.stringify(datos.resumen));
  }

  if (seguimiento || resumen) {
    console.log("\n" + "=".repeat(64));
    console.log("SINIESTROS");
    console.log("=".repeat(64));
    let total = 0;
    if (seguimiento) {
      const r = parsearSeguimiento(readFileSync(seguimiento).buffer as ArrayBuffer);
      total += r.siniestros.length;
      console.log(`\n  Seguimiento: ${r.siniestros.length} siniestros en ${r.resumen.hojas} hojas`);
      for (const a of (r.resumen.avisos ?? []).slice(0, 10)) console.log(`     aviso: ${a}`);
      if ((r.resumen.avisos ?? []).length > 10) console.log(`     … y ${(r.resumen.avisos ?? []).length - 10} avisos más`);
    }
    if (resumen) {
      const r = parsearResumen(readFileSync(resumen).buffer as ArrayBuffer, []);
      total += r.siniestros.length;
      console.log(`\n  Resumen: ${r.siniestros.length} siniestros`);
      for (const a of (r.resumen.avisos ?? []).slice(0, 6)) console.log(`     aviso: ${a}`);
    }
    const hay = await prisma.siniestro.count({ where: { manual: false } });
    const manuales = await prisma.siniestro.count({ where: { manual: true } });
    const trabajados = await prisma.siniestro.count({
      where: { OR: [{ notaInterna: { not: null } }, { cerrado: true }] },
    });
    console.log(`\n  En la base: ${hay} del Excel (se borran) + ${manuales} manuales (se conservan)`);
    console.log(`  Entrarían: ${total}`);
    console.log(`  Con nota interna o cerrados a mano: ${trabajados} (se intenta conservar por cliente+radicado)`);
  }

  console.log("\nEnsayo en seco: NO se escribió nada en la base.");
  await prisma.$disconnect();
}

main();
