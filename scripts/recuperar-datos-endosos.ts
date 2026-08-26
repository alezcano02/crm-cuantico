/**
 * Recupera los datos que le faltan a los endosos del CRM leyendo las planillas
 * que YA se le enviaron a cada aseguradora.
 *
 * EL PROBLEMA
 *
 * De los 40 casos abiertos, 40 no tenían coeficiente, 37 no tenían cédula ni
 * dirección ni valor y 36 no tenían banco. No es que se hayan perdido: la hoja
 * «ENDOSOS DÍA A DÍA» solo llevaba unas pocas columnas de seguimiento, y el
 * resto de la información vivía únicamente dentro del correo del cliente y de
 * la planilla que se le mandaba a la aseguradora.
 *
 * Sin esos datos la revisión anti-reproceso no puede comprobar nada y la
 * planilla se genera medio vacía, así que recuperarlos es lo que hace que todo
 * lo demás sirva.
 *
 * DE DÓNDE SALEN
 *
 * De `…/ENDOSOS/EXCEL/<año>/<COPROPIEDAD>/*.xlsx`: cada archivo es la planilla
 * real que se envió, con propietario, cédula, dirección, banco, NIT,
 * coeficiente y valor de cada apartamento.
 *
 * REGLAS
 *
 *  · Solo se rellenan campos VACÍOS. Nunca se pisa un dato que ya esté en el
 *    CRM: si el cliente lo corrigió después, la corrección manda.
 *  · Si un apartamento aparece en varias planillas (los reprocesos generan
 *    varias), gana la más reciente por fecha de archivo.
 *  · Nada se escribe sin `--aplicar`.
 *
 * Uso:
 *   npx tsx scripts/recuperar-datos-endosos.ts            (simulación)
 *   npx tsx scripts/recuperar-datos-endosos.ts --aplicar
 */
import * as XLSX from "xlsx";
import { readdirSync, statSync } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { buscarBanco, normalizar, soloDigitos } from "../lib/endosos";

const prisma = new PrismaClient();
const APLICAR = process.argv.includes("--aplicar");
/** Sobrescribe además lo que ya estaba guardado. Ver el bucle de campos. */
const CORREGIR = process.argv.includes("--corregir");

const RAIZ =
  "C:/Users/lezqu/Cuántico Seguros LTDA/Cuántico Seguros - General/3. Area Tecnica/Endosos y paz y salvos/ENDOSOS/EXCEL";

// ---------------------------------------------------------------------------
// Lectura de las planillas
// ---------------------------------------------------------------------------

/** Un caso tal como quedó escrito en la planilla enviada. */
interface Fila {
  copropiedad: string;
  apartamento: string | null;
  cliente: string | null;
  cedula: string | null;
  direccion: string | null;
  ciudad: string | null;
  torre: string | null;
  cuartoUtil: string | null;
  parqueadero: string | null;
  banco: string | null;
  bancoNit: string | null;
  coeficiente: number | null;
  valorSolicitado: number | null;
  origen: string;
  fecha: number;
}

function texto(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim().replace(/\s+/g, " ");
  return s && s !== "-" ? s : null;
}

function numero(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  // «413,659,408.95» y « 109,868,205,781 » vienen como texto con separadores.
  const s = String(v).replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Saca el número de apartamento del texto del riesgo.
 *
 * Los formatos lo escriben de mil maneras: «APTO 1006», «APARTAMENTO No. 206»,
 * «AP 810 TORRE 3», «Apartamento 413». Se piden 3 o 4 dígitos para no
 * confundirlo con el número de la torre o del parqueadero.
 */
function apartamentoDe(riesgo: string | null): string | null {
  if (!riesgo) return null;
  const m = /\b(?:APTO|APARTAMENTO|APTOS|AP)\.?\s*(?:N[oº°]\.?\s*)?(\d{3,5})\b/i.exec(riesgo);
  return m ? m[1] : null;
}

function torreDe(riesgo: string | null): string | null {
  if (!riesgo) return null;
  const m = /\b(?:TORRE|T)\.?\s*(\d{1,2})\b/i.exec(riesgo);
  return m ? m[1] : null;
}

/**
 * Cada aseguradora escribe el coeficiente en una escala distinta, y meterlos
 * mezclados en el CRM equivaldría a multiplicar por cien el valor que le
 * corresponde a la mitad de los apartamentos. Lo dicen sus propias fórmulas:
 *
 *  · Zurich  `I6-(H6*$I$2/100)`  → divide entre 100, luego H es PORCENTAJE.
 *  · SBS     `+I3*J3`            → no divide, luego J es FRACCIÓN.
 *  · Previsora `+T2*S2`          → no divide, luego S es FRACCIÓN.
 *  · AXA no tiene fórmulas, pero sus cifras están en la misma escala que Zurich.
 *
 * El CRM lo guarda siempre en porcentaje, que es como se habla de él.
 */
function coeficienteA(v: unknown, esFraccion: boolean): number | null {
  const n = numero(v);
  if (n == null || n <= 0) return null;
  const pct = esFraccion ? n * 100 : n;
  /*
   * Un coeficiente real de un apartamento va de una décima de punto a algún
   * punto porcentual. Fuera de ese rango es basura de origen —hay planillas
   * con 0,00001 de relleno— y meterla dispararía una alarma roja falsa justo
   * en la comprobación que decide si el endoso se puede enviar.
   */
  if (pct < 0.01 || pct > 10) return null;
  return Number(pct.toFixed(6));
}

const base =(copropiedad: string, origen: string, fecha: number): Fila => ({
  copropiedad,
  apartamento: null,
  cliente: null,
  cedula: null,
  direccion: null,
  ciudad: null,
  torre: null,
  cuartoUtil: null,
  parqueadero: null,
  banco: null,
  bancoNit: null,
  coeficiente: null,
  valorSolicitado: null,
  origen,
  fecha,
});

/** Convierte la hoja en una matriz para leerla por posición, no por encabezado. */
function matriz(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true, blankrows: true });
}
/**
 * Localiza las columnas por el TEXTO de su encabezado, no por su posición.
 *
 * Es la diferencia entre que esto funcione y que meta basura. Las planillas
 * las edita gente: en la de Selva alguien insertó dos columnas propias («LO
 * QUE SE ENVIÓ») en mitad del formato de Previsora, y todo lo que venía
 * después quedó corrido dos puestos. Leyendo por posición, el coeficiente
 * (0,004) se guardaba como el valor que pide el banco.
 *
 * Devuelve, para cada campo pedido, el índice de la primera columna cuyo
 * encabezado casa con su expresión — o -1 si esa planilla no la trae.
 */
function columnasPorEncabezado(
  encabezado: unknown[],
  patrones: Record<string, RegExp>
): Record<string, number> {
  const limpio = encabezado.map((v) =>
    String(v ?? "")
      .replace(/\s+/g, " ")
      .trim()
  );
  const out: Record<string, number> = {};
  for (const [campo, re] of Object.entries(patrones)) {
    out[campo] = limpio.findIndex((h) => h && re.test(h));
  }
  return out;
}

interface Formato {
  hoja: string;
  /** Fila (0-based) donde están los títulos de las columnas. */
  filaEncabezado: number;
  /** Cómo escribe esta aseguradora el coeficiente. Ver `coeficienteA`. */
  coeficienteEsFraccion: boolean;
  patrones: Record<string, RegExp>;
}

const FORMATOS: Formato[] = [
  {
    hoja: "PLANTILLA ENDOSOS", // Zurich
    filaEncabezado: 4,
    coeficienteEsFraccion: false,
    patrones: {
      cliente: /^propietario$/i,
      cedula: /^nit propietario$/i,
      riesgo: /riesgo/i,
      banco: /beneficiario oneroso/i,
      bancoNit: /nit beneficiario/i,
      coeficiente: /coeficiente/i,
      valor: /vlr comercial requerido/i,
    },
  },
  {
    hoja: "FORMATO ", // Previsora / Messantia
    filaEncabezado: 0,
    coeficienteEsFraccion: true,
    patrones: {
      cliente: /nombre del propietario/i,
      cedula: /c[eé]dula|documento de identidad/i,
      direccion: /^nomenclatura/i,
      ciudad: /municipio/i,
      torre: /n[uú]mero de torre/i,
      apartamento: /n[uú]mero de apartamento/i,
      cuartoUtil: /cuarto [uú]til/i,
      parqueadero: /n[uú]mero de parqueadero/i,
      riesgo: /direcci[oó]n completa del riesgo/i,
      banco: /banco ?\/? ?entidad/i,
      bancoNit: /^nit$/i,
      coeficiente: /coeficiente/i,
      valor: /valor requerido/i,
    },
  },
  {
    hoja: "Template endosos financieros", // SBS
    filaEncabezado: 1,
    coeficienteEsFraccion: true,
    patrones: {
      cliente: /^propietario$/i,
      cedula: /n[uú]mero de documento/i,
      riesgo: /nomenclatura al interior/i,
      banco: /^beneficiario$/i,
      bancoNit: /^nit$/i,
      valor: /valor solicitado por el banco/i,
      coeficiente: /coeficiente de cada apartamento|^coeficiente/i,
    },
  },
  {
    hoja: "Relacion_cert", // AXA Colpatria
    filaEncabezado: 0,
    coeficienteEsFraccion: false,
    patrones: {
      cliente: /^propietario$/i,
      cedula: /^cc$/i,
      ciudad: /^ciudad$/i,
      banco: /^beneficiario$/i,
      coeficiente: /coeficiente/i,
      valor: /valor +asegurado a certificar/i,
      riesgo: /direccion riesgo/i,
    },
  },
];

/** Lee una planilla ya enviada y devuelve sus casos. */
function leerPlanilla(
  wb: XLSX.WorkBook,
  copropiedad: string,
  origen: string,
  fecha: number
): Fila[] {
  const formato = FORMATOS.find((f) => wb.SheetNames.includes(f.hoja));
  if (!formato) return [];

  const m = matriz(wb.Sheets[formato.hoja]);
  const enc = m[formato.filaEncabezado] ?? [];
  const col = columnasPorEncabezado(enc, formato.patrones);
  // Sin la columna del propietario no hay forma de saber de quién es la fila.
  if (col.cliente < 0) return [];

  const dato = (r: unknown[], campo: string): unknown =>
    col[campo] != null && col[campo] >= 0 ? r[col[campo]] : null;

  const out: Fila[] = [];
  for (let i = formato.filaEncabezado + 1; i < m.length; i++) {
    const r = m[i] ?? [];
    const cliente = texto(dato(r, "cliente"));
    if (!cliente) continue;

    const riesgo = texto(dato(r, "riesgo"));
    const direccion = texto(dato(r, "direccion")) ?? riesgo;
    out.push({
      ...base(copropiedad, origen, fecha),
      cliente,
      cedula: texto(dato(r, "cedula")),
      direccion,
      ciudad: texto(dato(r, "ciudad")),
      torre: texto(dato(r, "torre")) ?? torreDe(riesgo),
      apartamento: texto(dato(r, "apartamento")) ?? apartamentoDe(riesgo ?? direccion),
      cuartoUtil: texto(dato(r, "cuartoUtil")),
      parqueadero: texto(dato(r, "parqueadero")),
      banco: texto(dato(r, "banco")),
      bancoNit: texto(dato(r, "bancoNit")),
      coeficiente: coeficienteA(dato(r, "coeficiente"), formato.coeficienteEsFraccion),
      valorSolicitado: valorA(dato(r, "valor")),
    });
  }
  return out;
}

/**
 * El valor que pide el banco, descartando lo que no puede serlo.
 *
 * Ningún inmueble se endosa por menos de un millón; una cifra así delata que
 * la columna leída no era la del valor —le pasó a la planilla de Selva, donde
 * el coeficiente acabó guardado como valor— o que al cliente se le fueron
 * dígitos al escribirlo.
 */
function valorA(v: unknown): number | null {
  const n = numero(v);
  if (n == null || n < 1_000_000) return null;
  // En pesos enteros: las planillas traen céntimos y el formulario, que separa
  // los miles con puntos, confundiría el punto decimal con uno de millares.
  return Math.round(n);
}

function archivosDe(dir: string): string[] {
  const out: string[] = [];
  let entradas: string[];
  try {
    entradas = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entradas) {
    const p = path.join(dir, e);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) out.push(...archivosDe(p));
    else if (/\.xlsx$/i.test(e) && !e.startsWith("~$")) out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Principal
// ---------------------------------------------------------------------------

async function main() {
  const archivos: string[] = [];
  for (const anio of ["2025", "2026"]) archivos.push(...archivosDe(path.join(RAIZ, anio)));
  console.log(`Planillas encontradas: ${archivos.length}`);

  const filas: Fila[] = [];
  let sinFormato = 0;
  let ilegibles = 0;

  for (const f of archivos) {
    // La copropiedad es la carpeta que lo contiene: es el dato más fiable que
    // hay, más que cualquier cosa escrita dentro del archivo.
    const copropiedad = path.basename(path.dirname(f));
    let wb: XLSX.WorkBook;
    let fecha = 0;
    try {
      fecha = statSync(f).mtimeMs;
      wb = XLSX.read(require("fs").readFileSync(f), { cellDates: false });
    } catch {
      ilegibles++;
      continue;
    }
    try {
      const leidas = leerPlanilla(wb, copropiedad, path.basename(f), fecha);
      if (!leidas.length && !FORMATOS.some((x) => wb.SheetNames.includes(x.hoja))) sinFormato++;
      filas.push(...leidas);
    } catch {
      ilegibles++;
    }
  }

  console.log(
    `Filas de casos leídas: ${filas.length} · sin formato reconocido: ${sinFormato} · ilegibles: ${ilegibles}`
  );

  // La más reciente gana: los reprocesos generan varias planillas del mismo
  // apartamento y la última es la que quedó bien.
  filas.sort((a, b) => a.fecha - b.fecha);

  const porApto = new Map<string, Fila>();
  const porCedula = new Map<string, Fila>();
  for (const f of filas) {
    if (f.apartamento) porApto.set(`${normalizar(f.copropiedad)}|${f.apartamento}`, f);
    const c = soloDigitos(f.cedula);
    if (c.length >= 6) porCedula.set(c, f);
  }
  console.log(`Apartamentos con datos: ${porApto.size} · cédulas: ${porCedula.size}`);

  const endosos = await prisma.endoso.findMany({ include: { copropiedad: true } });
  const CAMPOS = [
    "cedula",
    "direccion",
    "ciudad",
    "torre",
    "cuartoUtil",
    "parqueadero",
    "banco",
    "bancoNit",
    "coeficiente",
    "valorSolicitado",
  ] as const;

  const cambios: { id: number; datos: Record<string, unknown>; etiqueta: string }[] = [];
  const rellenados: Record<string, number> = {};
  let sinFuente = 0;

  for (const e of endosos) {
    const clave = `${normalizar(e.copropiedad?.nombre ?? e.urbanizacion)}|${e.apartamento ?? ""}`;
    const fuente =
      (e.apartamento ? porApto.get(clave) : undefined) ??
      (soloDigitos(e.cedula).length >= 6 ? porCedula.get(soloDigitos(e.cedula)) : undefined);
    if (!fuente) {
      sinFuente++;
      continue;
    }

    const datos: Record<string, unknown> = {};
    for (const campo of CAMPOS) {
      const actual = (e as Record<string, unknown>)[campo];
      const nuevo = (fuente as unknown as Record<string, unknown>)[campo];
      const vacio = actual == null || actual === "";
      if (vacio && nuevo != null && nuevo !== "") {
        datos[campo] = nuevo;
        rellenados[campo] = (rellenados[campo] ?? 0) + 1;
      } else if (CORREGIR && !vacio && nuevo !== actual) {
        /*
         * Modo reparación. Una primera versión de este script leía las
         * columnas por posición y en las planillas que alguien había editado
         * —la de Selva lleva dos columnas insertadas a mano— guardó el
         * coeficiente donde va el valor. Aquí se sobrescribe lo que aquella
         * pasada dejó mal; `nuevo` puede ser null, y entonces el campo se
         * vacía, que es mejor que dejar una cifra falsa.
         */
        datos[campo] = nuevo ?? null;
        rellenados[`${campo} (corregido)`] = (rellenados[`${campo} (corregido)`] ?? 0) + 1;
      }
    }

    // El NIT del banco se normaliza contra la lista oficial: en las planillas
    // viene de cualquier forma («8600345941», «860.034.594-1») y escrito mal es
    // una de las causas habituales de devolución.
    if (datos.banco || (!e.bancoNit && e.banco)) {
      const b = buscarBanco((datos.banco as string) ?? e.banco);
      if (b) {
        datos.banco = b.nombre;
        datos.bancoNit = b.nit;
      }
    }

    /*
     * Se descarta lo que acabaría escribiendo el mismo valor que ya está. Pasa
     * sobre todo con el banco: la planilla dice «BANCOLOMBIA», el paso de
     * arriba lo normaliza a «BANCOLOMBIA S.A.» y coincide con lo guardado.
     * Sin esto, la reparación tocaría cientos de registros para nada.
     */
    for (const k of Object.keys(datos)) {
      if (datos[k] === (e as Record<string, unknown>)[k]) {
        delete datos[k];
        const etiqueta = `${k} (corregido)`;
        if (rellenados[etiqueta]) rellenados[etiqueta]--;
      }
    }

    if (Object.keys(datos).length) {
      cambios.push({
        id: e.id,
        datos,
        etiqueta: `${e.urbanizacion} ${e.apartamento ?? "?"} · ${e.cliente} → ${Object.keys(datos).join(", ")} (${fuente.origen})`,
      });
    }
  }

  console.log(`\nEndosos en el CRM: ${endosos.length} · sin planilla que los cubra: ${sinFuente}`);
  console.log(`Endosos que se pueden completar: ${cambios.length}`);
  console.log("\nCampos que se rellenarían:");
  for (const [c, n] of Object.entries(rellenados).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${c.padEnd(18)} ${n}`);
  }
  console.log("\nEjemplos:");
  for (const c of cambios.slice(0, 15)) console.log(`   ${c.etiqueta}`);

  if (!APLICAR) {
    console.log("\nSimulación. Añade --aplicar para escribirlo de verdad.");
    await prisma.$disconnect();
    return;
  }

  let ok = 0;
  for (const c of cambios) {
    await prisma.endoso.update({ where: { id: c.id }, data: c.datos });
    ok++;
  }
  console.log(`\nActualizados ${ok} endosos.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
