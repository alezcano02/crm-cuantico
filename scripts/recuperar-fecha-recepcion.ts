/**
 * Pone la fecha en que entró la solicitud del cliente en todos los endosos en
 * que se puede saber de verdad.
 *
 * POR QUÉ NO SE PUEDE EN TODOS
 *
 * La hoja «ENDOSOS DÍA A DÍA» solo lleva UNA columna de fecha, «FECHA ENVÍO
 * ASEGURADORA», que es cuándo se radicó, no cuándo llegó la petición. Y el
 * buzón conserva apenas 38 mensajes, desde finales de julio. Para el grueso
 * del histórico la fecha de recepción sencillamente nunca se registró en
 * ninguna parte, y no se va a inventar a partir de la de radicación: son cosas
 * distintas y la diferencia entre las dos es justo lo que se querría medir.
 *
 * DE DÓNDE SÍ SALE
 *
 *  · La hoja «Forms» del mismo Excel: las solicitudes que entraron por el
 *    formulario tienen «Hora de inicio», que es exactamente cuándo se
 *    diligenció. Se cruzan por cédula, y si no, por copropiedad + apartamento.
 *  · De aquí en adelante, el receivedDateTime del correo del cliente, que la
 *    revisión del buzón manda en `fechaRecepcion`.
 *
 * Uso:
 *   npx tsx scripts/recuperar-fecha-recepcion.ts "<ruta al Excel>"
 *   npx tsx scripts/recuperar-fecha-recepcion.ts "<ruta al Excel>" --aplicar
 */
import * as XLSX from "xlsx";
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { normalizar, soloDigitos } from "../lib/endosos";

const prisma = new PrismaClient();
const APLICAR = process.argv.includes("--aplicar");
const RUTA =
  process.argv.slice(2).find((a) => !a.startsWith("--")) ??
  "C:/Users/lezqu/Cuántico Seguros LTDA/Cuántico Seguros - General/3. Area Tecnica/Endosos y paz y salvos/ENDOSOS DÍA A DÍA/ENDOSOS DÍA A DÍA (NUEVO ARCHIVO).xlsx";

/** «12/5/26 15:59» y «5/13/2026 13:04» — el Excel mezcla los dos formatos. */
function aFecha(v: unknown): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v ?? "").trim();
  if (!s) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})[\s,]*(\d{1,2}):(\d{2})?/.exec(s);
  if (!m) return null;
  let [, a, b, anio, hh, mm] = m;
  const y = Number(anio) < 100 ? 2000 + Number(anio) : Number(anio);
  /*
   * Ambiguo por naturaleza: «12/5/26» puede ser 12 de mayo o 5 de diciembre.
   * Cuando el primer número pasa de 12 es forzosamente el día; si no, se toma
   * como mes, que es lo que hace Excel con la configuración de la agencia.
   */
  let mes = Number(a);
  let dia = Number(b);
  if (mes > 12) [mes, dia] = [dia, mes];
  if (mes > 12 || dia > 31) return null;
  // Se guarda como hora de Colombia (UTC-5).
  const d = new Date(Date.UTC(y, mes - 1, dia, Number(hh ?? 0) + 5, Number(mm ?? 0)));
  return isNaN(d.getTime()) ? null : d;
}

async function main() {
  const wb = XLSX.read(readFileSync(RUTA), { cellDates: true });
  if (!wb.SheetNames.includes("Forms")) throw new Error("El Excel no tiene la hoja «Forms».");
  const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Forms"], {
    header: 1,
    defval: "",
    raw: false,
  });

  interface Solicitud {
    cuando: Date;
    cedula: string;
    copropiedad: string;
    apartamento: string;
  }
  const solicitudes: Solicitud[] = [];
  for (const r of filas.slice(1)) {
    const cuando = aFecha(r[1]);
    if (!cuando) continue;
    solicitudes.push({
      cuando,
      cedula: soloDigitos(String(r[6] ?? "")),
      copropiedad: normalizar(String(r[11] ?? "")),
      apartamento: String(r[14] ?? "").trim(),
    });
  }
  console.log(`Solicitudes del formulario con hora: ${solicitudes.length}`);

  const endosos = await prisma.endoso.findMany({
    select: {
      id: true,
      cedula: true,
      urbanizacion: true,
      apartamento: true,
      fechaRecepcion: true,
      fechaEnvioAseguradora: true,
      cliente: true,
    },
  });

  const porCedula = new Map<string, Solicitud>();
  const porApto = new Map<string, Solicitud>();
  for (const s of solicitudes) {
    if (s.cedula.length >= 6) porCedula.set(s.cedula, s);
    if (s.copropiedad && s.apartamento) porApto.set(`${s.copropiedad}|${s.apartamento}`, s);
  }

  const cambios: { id: number; cuando: Date; via: string; etiqueta: string }[] = [];
  let posteriorAlEnvio = 0;

  for (const e of endosos) {
    if (e.fechaRecepcion) continue;
    const ced = soloDigitos(e.cedula);
    const s =
      (ced.length >= 6 ? porCedula.get(ced) : undefined) ??
      porApto.get(`${normalizar(e.urbanizacion)}|${(e.apartamento ?? "").trim()}`);
    if (!s) continue;

    /*
     * Comprobación de cordura: la solicitud no puede haber entrado DESPUÉS de
     * haberse radicado. Si sale así, el cruce emparejó mal —dos endosos del
     * mismo apartamento en años distintos— y se descarta.
     */
    if (e.fechaEnvioAseguradora && s.cuando > e.fechaEnvioAseguradora) {
      posteriorAlEnvio++;
      continue;
    }
    cambios.push({
      id: e.id,
      cuando: s.cuando,
      via: ced.length >= 6 && porCedula.has(ced) ? "cédula" : "apto",
      etiqueta: `${e.urbanizacion} ${e.apartamento ?? "?"} · ${e.cliente} → ${s.cuando.toISOString().slice(0, 16).replace("T", " ")}`,
    });
  }

  const yaTienen = endosos.filter((e) => e.fechaRecepcion).length;
  console.log(`\nEndosos: ${endosos.length}`);
  console.log(`  ya tenían fecha de recepción: ${yaTienen}`);
  console.log(`  se pueden completar desde el formulario: ${cambios.length}`);
  console.log(`  descartados por ser posteriores a la radicación: ${posteriorAlEnvio}`);
  console.log("\nEjemplos:");
  for (const c of cambios.slice(0, 10)) console.log(`   [${c.via}] ${c.etiqueta}`);

  if (!APLICAR) {
    console.log("\nSimulación. Añade --aplicar para escribirlo de verdad.");
    await prisma.$disconnect();
    return;
  }
  for (const c of cambios) {
    await prisma.endoso.update({ where: { id: c.id }, data: { fechaRecepcion: c.cuando } });
  }
  console.log(`\nActualizados ${cambios.length} endosos.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
