/**
 * Mide el extractor contra pólizas reales.
 *   npx tsx scripts/probar-extractor.ts "<carpeta con PDF>"
 */
import { readFileSync, readdirSync } from "node:fs";
import { leerPdf } from "../lib/pdf-texto";
import { todasLasFilas } from "../lib/pdf-layout";
import { extraerPoliza, montoColombiano, fechaISO } from "../lib/extraer-poliza";

async function main() {
  // Los montos primero: es donde un fallo cuesta más caro.
  const casos: [string, number | null, boolean][] = [
    ["2.301.383,00", 2301383, true], ["176,551.60", 176551.6, true],
    ["1.590.448", 1590448, true], ["191812800", 191812800, true],
    ["28,188.91", 28188.91, true], ["176,55", 176.55, false],
  ];
  let fallos = 0;
  for (const [bruto, esperado, seguro] of casos) {
    const r = montoColombiano(bruto);
    if (r.valor !== esperado || r.seguro !== seguro) { fallos++; console.log(`FAIL monto ${bruto} → ${r.valor}`); }
  }
  for (const [b, e] of [["29/05/2026","2026-05-29"],["1-1-26","2026-01-01"],["32/01/2026",null],["29/13/2026",null]] as [string,string|null][]) {
    if (fechaISO(b) !== e) { fallos++; console.log(`FAIL fecha ${b} → ${fechaISO(b)}`); }
  }
  console.log(fallos === 0 ? "Montos y fechas: OK\n" : `Montos y fechas: ${fallos} fallos\n`);

  const carpeta = process.argv[2];
  const archivos = readdirSync(carpeta).filter((f) => f.toLowerCase().endsWith(".pdf")).sort();
  const cuenta: Record<string, number> = {};
  const dudosos: Record<string, number> = {};
  let leidos = 0, polizas = 0;
  const tipos: Record<string,number> = {};

  for (const a of archivos) {
    let r;
    try {
      const filas = todasLasFilas(await leerPdf(new Uint8Array(readFileSync(`${carpeta}/${a}`))));
      r = extraerPoliza(filas);
    } catch (e) {
      console.log(`  ${a.padEnd(8)} ILEGIBLE (${String(e).slice(0, 45)})`);
      continue;
    }
    leidos++;
    tipos[r.tipo]=(tipos[r.tipo]??0)+1;
    if(r.tipo!=="poliza"){ console.log(`  ${a.padEnd(8)} [${r.tipo}] ${r.aviso?.slice(0,60)}`); continue; }
    polizas++;
    for (const [k, v] of Object.entries(r)) {
      if (typeof v !== "object" || v === null) continue;
      const c = v as { valor: unknown; certeza: string };
      if (c.valor != null) {
        cuenta[k] = (cuenta[k] ?? 0) + 1;
        if (c.certeza === "baja") dudosos[k] = (dudosos[k] ?? 0) + 1;
      }
    }
    console.log(
      `  ${a.padEnd(8)} ${String(r.aseguradora.valor ?? "?").padEnd(19)}` +
      ` pól:${String(r.numero.valor ?? "—").padEnd(14)}` +
      ` ram:${String(r.ramo.valor ?? "—").padEnd(11)}` +
      ` vig:${String(r.vigenciaHasta.valor ?? "—").padEnd(11)}` +
      ` prima:${r.primaNeta.valor ?? r.primaTotal.valor ?? "—"}`
    );
  }

  console.log(`\nDe ${leidos} pólizas leídas:`);
  for (const k of ["numero","aseguradora","ramo","asegurado","ccNit","placa","vigenciaDesde","vigenciaHasta","primaNeta","primaTotal","formaPago"]) {
    const n = cuenta[k] ?? 0;
    const d = dudosos[k] ?? 0;
    const pct = polizas ? Math.round((n / polizas) * 100) : 0;
    console.log(`  ${k.padEnd(14)} ${String(n).padStart(3)}/${polizas}  ${String(pct).padStart(3)}%${d ? `  (${d} dudosos)` : ""}`);
  }
  process.exit(fallos === 0 ? 0 : 1);
}
main();
