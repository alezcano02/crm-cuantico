/**
 * Carga inicial de los endosos del Excel «ENDOSOS DÍA A DÍA».
 *
 * Trae el archivo COMPLETO, no solo los casos abiertos, porque el endoso no es
 * un trámite que se hace una vez: se renueva con la póliza del edificio. Cuando
 * la póliza de áreas comunes de una copropiedad vence, todos los apartamentos
 * que tenían endoso necesitan uno nuevo —el propio Bancolombia lo dice en sus
 * correos: «en todos los casos la renovación del endoso deberá entregarse al
 * vencimiento de la póliza»—. El histórico es, por tanto, la lista de quién va
 * a pedir endoso otra vez, y es lo que permite adelantarse en vez de esperar a
 * que el cliente escriba.
 *
 * La hoja no tiene columnas para cédula, dirección, valor ni banco: esos datos
 * solo existen dentro de los correos. Lo que entra aquí es el seguimiento
 * —quién, dónde, con qué radicado y desde cuándo— y el resto se completa desde
 * el CRM cuando se toque cada caso.
 *
 * Uso:
 *   npx tsx scripts/importar-endosos.ts "C:\\ruta\\ENDOSOS DÍA A DÍA (NUEVO ARCHIVO).xlsx"
 *   npx tsx scripts/importar-endosos.ts "…\\archivo.xlsx" --aplicar
 *   npx tsx scripts/importar-endosos.ts "…\\archivo.xlsx" --solo-abiertos
 *
 * Sin --aplicar solo enseña lo que haría.
 */
import { readFileSync } from "fs";
import * as XLSX from "xlsx";
import { prisma } from "../lib/prisma";
import { normalizar, type EstadoEndoso } from "../lib/endosos";

const ruta = process.argv[2];
const APLICAR = process.argv.includes("--aplicar");
const SOLO_ABIERTOS = process.argv.includes("--solo-abiertos");

if (!ruta) {
  console.error(
    'Uso: npx tsx scripts/importar-endosos.ts "<ruta al .xlsx>" [--aplicar]'
  );
  process.exit(1);
}

const HOJA = "Día a Día";

/**
 * Cómo se traduce la columna «ESTADO - ATENCIÓN» del Excel.
 *
 * Los valores salen de la hoja «Listas Desplegables», que es la que alimenta
 * el desplegable del archivo. El orden importa: se busca la coincidencia más
 * larga primero para que «Pendiente solicitud a compañía» no la atrape la
 * regla de «Pendiente paz y salvo».
 */
const ESTADOS: { texto: string; estado: EstadoEndoso; abierto: boolean }[] = [
  { texto: "ok enviado al cliente", estado: "ENVIADO_CLIENTE", abierto: false },
  { texto: "poliza no cubre areas privadas", estado: "DATOS_INCOMPLETOS", abierto: true },
  { texto: "pendiente solicitud a compania", estado: "NUEVA_SOLICITUD", abierto: true },
  { texto: "en proceso de renovacion", estado: "DATOS_INCOMPLETOS", abierto: true },
  { texto: "pendiente paz y salvo", estado: "DATOS_INCOMPLETOS", abierto: true },
  { texto: "error aseguradora", estado: "REPROCESO", abierto: true },
  { texto: "atencion urgente", estado: "REPROCESO", abierto: true },
  { texto: "pte aseguradora", estado: "RADICADO", abierto: true },
  { texto: "en emision", estado: "RADICADO", abierto: true },
  { texto: "reproceso", estado: "REPROCESO", abierto: true },
];

function estadoDe(texto: string): { estado: EstadoEndoso; abierto: boolean } | null {
  const n = normalizar(texto);
  if (!n) return null;
  const m = ESTADOS.find((e) => n === e.texto || n.includes(e.texto));
  return m ? { estado: m.estado, abierto: m.abierto } : null;
}

/** «SIN INFO», «-», «N/A» y las celdas vacías son todas lo mismo: no hay dato. */
function valor(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = normalizar(s);
  if (n === "sin info" || n === "n a" || n === "na" || s === "-") return null;
  return s;
}

/**
 * Las fechas llegan como número de serie de Excel o como texto «7/31/25».
 * Se normalizan a mediodía UTC para que no se corran de día al mostrarlas.
 */
function fecha(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return new Date(Date.UTC(d.y, d.m - 1, d.d, 12));
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    // El archivo usa mes/día/año.
    const [, mes, dia, anio] = m;
    const y = Number(anio) < 100 ? 2000 + Number(anio) : Number(anio);
    return new Date(Date.UTC(y, Number(mes) - 1, Number(dia), 12));
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

async function main() {
  const libro = XLSX.read(readFileSync(ruta), { cellDates: false });
  const hoja = libro.Sheets[HOJA];
  if (!hoja) {
    console.error(
      `El archivo no tiene la hoja "${HOJA}". Hojas encontradas: ${libro.SheetNames.join(", ")}`
    );
    process.exit(1);
  }

  const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, defval: "", raw: true });

  /*
   * La cabecera no está en la primera fila: arriba hay contadores. Se busca por
   * el nombre de una columna en vez de fijar el número de fila, porque en un
   * archivo que se edita a diario ese número cambia solo.
   */
  const iCabecera = filas.findIndex((f) =>
    f.some((c) => normalizar(String(c)).includes("estado atencion"))
  );
  if (iCabecera < 0) {
    console.error('No se encontró la fila de encabezados (la que tiene "ESTADO - ATENCIÓN").');
    process.exit(1);
  }

  const cabecera = filas[iCabecera].map((c) => normalizar(String(c)));
  const col = (...alias: string[]) => {
    const i = cabecera.findIndex((c) => alias.some((a) => c.includes(a)));
    return i < 0 ? null : i;
  };
  const iFecha = col("fecha envio");
  const iUrb = col("urbanizacion");
  const iApto = col("buscar un endoso");
  const iCliente = col("nombre del cliente");
  const iRadicado = col("radicado");
  const iCompania = col("compania");
  const iEstado = col("estado atencion");
  const iObs = col("observaciones");

  if (iUrb == null || iEstado == null) {
    console.error("Faltan columnas obligatorias (URBANIZACIÓN o ESTADO - ATENCIÓN).");
    process.exit(1);
  }

  const candidatos: {
    urbanizacion: string;
    cliente: string;
    apartamento: string | null;
    radicado: string | null;
    aseguradora: string | null;
    estado: EstadoEndoso;
    fechaEnvioAseguradora: Date | null;
    historia: string | null;
    estadoOriginal: string;
  }[] = [];

  let sinEstado = 0;
  let cerradasOmitidas = 0;
  const desconocidos = new Map<string, number>();
  let sinNombre = 0;
  let sinApartamento = 0;

  for (let i = iCabecera + 1; i < filas.length; i++) {
    const f = filas[i];
    const urbanizacion = valor(f[iUrb]);
    if (!urbanizacion) continue;

    const estadoTexto = String(f[iEstado] ?? "").trim();
    const m = estadoDe(estadoTexto);
    if (!m) {
      // Se distingue entre «la celda está vacía» y «dice algo que no sé
      // traducir»: lo segundo es un aviso de que la lista de estados del Excel
      // cambió y hay que actualizar la tabla de arriba.
      if (estadoTexto) desconocidos.set(estadoTexto, (desconocidos.get(estadoTexto) ?? 0) + 1);
      else sinEstado++;
      continue;
    }
    if (SOLO_ABIERTOS && !m.abierto) {
      cerradasOmitidas++;
      continue;
    }
    const estado = m.estado;
    const obs = iObs != null ? valor(f[iObs]) : null;
    const env = iFecha != null ? fecha(f[iFecha]) : null;
    const nombre = iCliente != null ? valor(f[iCliente]) : null;
    const apto = iApto != null ? valor(f[iApto]) : null;
    if (!nombre) sinNombre++;
    if (!apto) sinApartamento++;
    candidatos.push({
      urbanizacion,
      // El Excel no siempre trae el nombre; sin él el caso sigue siendo útil
      // (la urbanización y el radicado lo identifican) y se completa después.
      cliente: nombre ?? "Sin nombre en el Excel",
      apartamento: apto,
      radicado: iRadicado != null ? valor(f[iRadicado]) : null,
      aseguradora: iCompania != null ? valor(f[iCompania]) : null,
      estado,
      fechaEnvioAseguradora: env,
      historia: obs
        ? `${env ? sello(env) : sello(new Date())} · (del Excel) ${obs}`
        : null,
      estadoOriginal: estadoTexto,
    });
  }

  /*
   * UNIFICAR EL NOMBRE DE LA COPROPIEDAD.
   *
   * En el Excel el mismo edificio aparece escrito de varias formas —«Puerto
   * Ventura» y «PUERTO VENTURA», «Portón de la Hacienda» y «Portón de la
   * hacienda»— porque la columna es texto libre. Importado tal cual, un
   * edificio con 113 endosos se parte en dos grupos de 59 y 54, cada uno
   * enganchado (o no) a su propia ficha, y el aviso de «a estos les toca
   * renovar» se quedaría corto justo a la mitad.
   *
   * Se agrupa por el nombre normalizado y se adopta como bueno el que más
   * veces aparece escrito, que suele ser el que está bien puesto.
   */
  const variantes = new Map<string, Map<string, number>>();
  for (const c of candidatos) {
    const clave = normalizar(c.urbanizacion);
    if (!variantes.has(clave)) variantes.set(clave, new Map());
    const m = variantes.get(clave)!;
    m.set(c.urbanizacion, (m.get(c.urbanizacion) ?? 0) + 1);
  }
  const canonico = new Map<string, string>();
  const unificados: { canonico: string; descartadas: string[]; total: number }[] = [];
  for (const [clave, m] of variantes) {
    const ordenadas = [...m].sort((a, b) => b[1] - a[1]);
    canonico.set(clave, ordenadas[0][0]);
    if (ordenadas.length > 1) {
      unificados.push({
        canonico: ordenadas[0][0],
        descartadas: ordenadas.slice(1).map(([n, v]) => `${n} (${v})`),
        total: ordenadas.reduce((s, [, v]) => s + v, 0),
      });
    }
  }
  for (const c of candidatos) {
    c.urbanizacion = canonico.get(normalizar(c.urbanizacion)) ?? c.urbanizacion;
  }

  // Resumen por estado, para poder comparar con los contadores del Excel.
  const porEstado = new Map<string, number>();
  for (const c of candidatos) {
    porEstado.set(c.estadoOriginal, (porEstado.get(c.estadoOriginal) ?? 0) + 1);
  }

  console.log(`Hoja "${HOJA}" · ${SOLO_ABIERTOS ? "SOLO CASOS ABIERTOS" : "ARCHIVO COMPLETO"}`);
  console.log(`Endosos a cargar: ${candidatos.length}`);
  if (SOLO_ABIERTOS) console.log(`Cerrados omitidos: ${cerradasOmitidas}`);
  console.log(`Filas con urbanización pero sin estado: ${sinEstado}`);
  if (desconocidos.size) {
    console.log("\nAVISO · estados que no supe traducir (revisa la tabla ESTADOS del script):");
    for (const [k, v] of [...desconocidos].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(v).padStart(4)}  "${k}"`);
    }
  }

  console.log("\nPor estado del Excel:");
  for (const [k, v] of [...porEstado].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(4)}  ${k}`);
  }

  // Cuánto sirve de verdad el histórico: una fila sin apartamento no se puede
  // usar para avisar a nadie de que le toca renovar.
  console.log("\nCalidad de los datos:");
  console.log(`  ${candidatos.length - sinNombre} de ${candidatos.length} traen nombre del cliente`);
  console.log(`  ${candidatos.length - sinApartamento} de ${candidatos.length} traen apartamento`);

  if (unificados.length) {
    console.log(
      `\nNombres unificados: ${unificados.length} copropiedades venían escritas de varias formas`
    );
    for (const u of unificados.sort((a, b) => b.total - a.total).slice(0, 12)) {
      console.log(`  ${u.canonico} (${u.total}) ← ${u.descartadas.join(", ")}`);
    }
    if (unificados.length > 12) console.log(`  … y ${unificados.length - 12} más`);
  }

  console.log("\nPor copropiedad (las 15 con más endosos):");
  const porUrb = new Map<string, number>();
  for (const c of candidatos) porUrb.set(c.urbanizacion, (porUrb.get(c.urbanizacion) ?? 0) + 1);
  for (const [k, v] of [...porUrb].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${String(v).padStart(4)}  ${k}`);
  }
  console.log(`  (${porUrb.size} copropiedades distintas en total)`);

  console.log("\nPrimeros 10:");
  for (const c of candidatos.slice(0, 10)) {
    console.log(
      `  ${c.urbanizacion}${c.apartamento ? ` · ${c.apartamento}` : ""} — ${c.cliente} — ${
        c.aseguradora ?? "sin compañía"
      } — ${c.estado}${c.radicado ? ` — rad. ${c.radicado}` : ""}`
    );
  }

  if (!APLICAR) {
    console.log("\nSimulación. Añade --aplicar para escribir en la base de datos.");
    await prisma.$disconnect();
    return;
  }

  /*
   * Se enganchan con la ficha del edificio si ya existe, pero no se crean
   * fichas: una ficha sin valor asegurado ni paz y salvo daría una falsa
   * sensación de que el caso ya se puede revisar. Se crean a mano, que es
   * cuando alguien mira de verdad esos datos.
   */
  const fichas = await prisma.copropiedad.findMany({ select: { id: true, nombre: true } });
  const buscarFicha = (nombre: string) => {
    const n = normalizar(nombre);
    return (
      fichas.find((c) => normalizar(c.nombre) === n) ??
      fichas.find((c) => normalizar(c.nombre).includes(n) || n.includes(normalizar(c.nombre))) ??
      null
    );
  };

  /*
   * Se escribe en lotes y no fila a fila: son casi dos mil registros y cada
   * `create` suelto sería un viaje de ida y vuelta a Neon.
   */
  const LOTE = 200;
  let creados = 0;
  for (let i = 0; i < candidatos.length; i += LOTE) {
    const lote = candidatos.slice(i, i + LOTE).map((c) => ({
      urbanizacion: c.urbanizacion,
      copropiedadId: buscarFicha(c.urbanizacion)?.id ?? null,
      cliente: c.cliente,
      apartamento: c.apartamento,
      radicado: c.radicado,
      aseguradora: c.aseguradora,
      estado: c.estado,
      fechaEnvioAseguradora: c.fechaEnvioAseguradora,
      historia: c.historia,
    }));
    const r = await prisma.endoso.createMany({ data: lote });
    creados += r.count;
    console.log(`  ${creados} / ${candidatos.length}`);
  }

  console.log(`\nCreados ${creados} endosos.`);
  await prisma.$disconnect();
}

function sello(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}/${d.getUTCFullYear()}`;
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
