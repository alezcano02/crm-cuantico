/**
 * Recupera el VALOR ASEGURADO DEL EDIFICIO de cada copropiedad, leyéndolo de
 * las planillas ya enviadas a las aseguradoras.
 *
 * POR QUÉ IMPORTA
 *
 * Es el dato que permite la comprobación más valiosa del módulo: cuánto le
 * corresponde a un apartamento es `valor del edificio × coeficiente`, y contra
 * eso se mide lo que pide el banco (tolerancia del 20% y del 40%). Sin él, esa
 * comprobación no puede hacerse en NINGÚN caso —hoy sale «no se puede
 * verificar» en los 42 abiertos— y es justo la que evita mandar un endoso por
 * encima de lo que la póliza cubre.
 *
 * DE DÓNDE SALE
 *
 *  · Zurich: la fila de cabecera, columna «VLR EDIFICIO» (es de la
 *    copropiedad, no del caso, y por eso va una sola vez arriba).
 *  · Previsora y SBS: una columna de valor asegurado repetida en cada fila.
 *  · AXA no lo trae.
 *
 * Gana la planilla más reciente: el valor asegurado cambia en cada renovación.
 *
 * Uso:
 *   npx tsx scripts/recuperar-valor-edificio.ts             (simulación)
 *   npx tsx scripts/recuperar-valor-edificio.ts --aplicar
 */
import * as XLSX from "xlsx";
import { readdirSync, statSync, readFileSync } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { normalizar } from "../lib/endosos";

const prisma = new PrismaClient();
const APLICAR = process.argv.includes("--aplicar");

const RAIZ =
  "C:/Users/lezqu/Cuántico Seguros LTDA/Cuántico Seguros - General/3. Area Tecnica/Endosos y paz y salvos/ENDOSOS/EXCEL";

/**
 * Un edificio asegurado no baja de unos mil millones ni pasa del billón. Fuera
 * de ahí lo leído no es un valor asegurado —suele ser una fecha de Excel o una
 * celda corrida— y meterlo desviaría todos los cálculos de la copropiedad.
 */
const MINIMO = 1_000_000_000;
const MAXIMO = 1_000_000_000_000;

function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || !v.trim()) return null;
  const n = Number(v.replace(/[^\d.,-]/g, "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function archivos(dir: string): string[] {
  const out: string[] = [];
  let e: string[] = [];
  try {
    e = readdirSync(dir);
  } catch {
    return out;
  }
  for (const x of e) {
    const p = path.join(dir, x);
    let s;
    try {
      s = statSync(p);
    } catch {
      continue;
    }
    if (s.isDirectory()) out.push(...archivos(p));
    else if (/\.xlsx$/i.test(x) && !x.startsWith("~$")) out.push(p);
  }
  return out;
}

/** Índice de la primera columna cuyo encabezado casa con la expresión. */
function col(encabezado: unknown[], re: RegExp): number {
  return encabezado.findIndex((h) =>
    re.test(
      String(h ?? "")
        .replace(/\s+/g, " ")
        .trim()
    )
  );
}

function valorDe(wb: XLSX.WorkBook): number | null {
  const filas = (hoja: string) =>
    XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[hoja], {
      header: 1,
      defval: "",
      raw: true,
      blankrows: true,
    });

  if (wb.SheetNames.includes("PLANTILLA ENDOSOS")) {
    const m = filas("PLANTILLA ENDOSOS");
    const c = col(m[0] ?? [], /vlr edificio/i);
    if (c < 0) return null;
    // Va en la fila siguiente al encabezado: describe el edificio, no un caso.
    return numero((m[1] ?? [])[c]);
  }

  for (const [hoja, re, filaEnc] of [
    ["FORMATO ", /valor asegurado \(edificio/i, 0],
    ["Template endosos financieros", /valor asegurado da[ñn]o material/i, 1],
  ] as const) {
    if (!wb.SheetNames.includes(hoja)) continue;
    const m = filas(hoja);
    const c = col(m[filaEnc] ?? [], re);
    if (c < 0) continue;
    // Se repite en cada fila; basta la primera que traiga una cifra creíble.
    for (let i = filaEnc + 1; i < m.length; i++) {
      const v = numero((m[i] ?? [])[c]);
      if (v != null && v >= MINIMO && v <= MAXIMO) return v;
    }
  }
  return null;
}

async function main() {
  const lista: string[] = [];
  for (const anio of ["2025", "2026"]) lista.push(...archivos(path.join(RAIZ, anio)));
  console.log(`Planillas: ${lista.length}`);

  // Por copropiedad (carpeta), el valor de la planilla más reciente.
  const mejor = new Map<string, { valor: number; fecha: number; origen: string }>();
  for (const f of lista) {
    let wb: XLSX.WorkBook;
    let fecha = 0;
    try {
      fecha = statSync(f).mtimeMs;
      wb = XLSX.read(readFileSync(f));
    } catch {
      continue;
    }
    let v: number | null = null;
    try {
      v = valorDe(wb);
    } catch {
      continue;
    }
    if (v == null || v < MINIMO || v > MAXIMO) continue;
    const cop = normalizar(path.basename(path.dirname(f)));
    const previo = mejor.get(cop);
    if (!previo || fecha > previo.fecha)
      mejor.set(cop, { valor: v, fecha, origen: path.basename(f) });
  }
  console.log(`Copropiedades con valor asegurado hallado: ${mejor.size}`);

  const copropiedades = await prisma.copropiedad.findMany();
  const cambios: { id: number; nombre: string; valor: number; origen: string }[] = [];
  for (const c of copropiedades) {
    if (c.valorAseguradoTotal != null) continue; // nunca se pisa lo ya guardado
    const m = mejor.get(normalizar(c.nombre));
    if (!m) continue;
    cambios.push({ id: c.id, nombre: c.nombre, valor: m.valor, origen: m.origen });
  }

  console.log(`\nFichas sin valor asegurado: ${copropiedades.filter((c) => c.valorAseguradoTotal == null).length}`);
  console.log(`Se pueden completar: ${cambios.length}\n`);
  for (const c of cambios.slice(0, 20)) {
    console.log(`  ${c.nombre.padEnd(34)} $${c.valor.toLocaleString("es-CO").padStart(20)}  (${c.origen})`);
  }

  if (!APLICAR) {
    console.log("\nSimulación. Añade --aplicar para escribirlo de verdad.");
    await prisma.$disconnect();
    return;
  }
  for (const c of cambios) {
    await prisma.copropiedad.update({
      where: { id: c.id },
      data: { valorAseguradoTotal: c.valor },
    });
  }
  console.log(`\nActualizadas ${cambios.length} fichas.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
