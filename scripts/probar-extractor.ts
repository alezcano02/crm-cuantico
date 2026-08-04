import { readFileSync, readdirSync } from "node:fs";
import { extraerPoliza, montoColombiano } from "../lib/extraer-poliza";

// Primero, la conversión de montos: es donde un fallo cuesta más caro.
const casos: [string, number | null, boolean][] = [
  ["2.301.383,00", 2301383, true],
  ["176,551.60", 176551.6, true],
  ["1.590.448", 1590448, true],
  ["8.965.503", 8965503, true],
  ["191812800", 191812800, true],
  ["28,188.91", 28188.91, true],
  ["176,55", 176.55, false],   // ambiguo: se marca
];
let fallos = 0;
console.log("MONTOS");
for (const [bruto, esperado, seguroEsperado] of casos) {
  const r = montoColombiano(bruto);
  const ok = r.valor === esperado && r.seguro === seguroEsperado;
  if (!ok) fallos++;
  console.log(`  ${ok ? "OK  " : "FAIL"} ${bruto.padEnd(14)} → ${r.valor} (seguro: ${r.seguro})`);
}

const W = process.argv[2];
console.log("\nPÓLIZAS REALES");
const archivos = readdirSync(W).filter((f) => /^s\d+\.txt$/.test(f)).slice(0, 14);
let conNumero = 0, conCia = 0, conVig = 0, conPrima = 0;
for (const a of archivos) {
  const r = extraerPoliza(readFileSync(`${W}/${a}`, "utf8"));
  if (r.numero.valor) conNumero++;
  if (r.aseguradora.valor) conCia++;
  if (r.vigenciaHasta.valor) conVig++;
  if (r.primaNeta.valor || r.primaTotal.valor) conPrima++;
  console.log(`  ${a.padEnd(7)} ${String(r.aseguradora.valor ?? "?").padEnd(19)} ` +
    `pól:${String(r.numero.valor ?? "—").padEnd(15)} ram:${String(r.ramo.valor ?? "—").padEnd(11)} ` +
    `vig:${String(r.vigenciaHasta.valor ?? "—").padEnd(11)} prima:${r.primaNeta.valor ?? r.primaTotal.valor ?? "—"}`);
}
const n = archivos.length;
console.log(`\nDe ${n} pólizas → número ${conNumero}, compañía ${conCia}, vigencia ${conVig}, prima ${conPrima}`);
process.exit(fallos === 0 ? 0 : 1);
