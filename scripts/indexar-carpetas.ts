/**
 * Recorre la unidad compartida sincronizada y enlaza cada asegurado del CRM
 * con su carpeta de documentos en SharePoint.
 *
 *   npx tsx scripts/indexar-carpetas.ts ["C:\ruta\a\Cuántico Seguros - General"]
 *   npx tsx scripts/indexar-carpetas.ts --simular      (no escribe en la base)
 *
 * Solo se enlaza cuando la coincidencia es SEGURA:
 *   · el nombre normalizado es idéntico, o
 *   · uno es prefijo del otro y se parecen en al menos un 85% de su longitud
 *     (p. ej. "CAMPUS RESERVADO P-H" ↔ "CAMPUS RESERVADO").
 *
 * No se usa parecido por palabras sueltas a propósito: enlazaba clientes
 * distintos entre sí (p. ej. "EDIFICIO LISBOA" con "EDIFICIO CATALANA"), y
 * mandar a un asesor a la carpeta equivocada es peor que no tener enlace.
 * Lo que queda sin carpeta se resuelve desde la aplicación, con el buscador
 * de SharePoint o pegando la dirección a mano.
 */
import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { claveCliente, rutaCliente, urlCarpeta } from "../lib/carpetas";

const prisma = new PrismaClient();

const RAIZ_POR_DEFECTO =
  "C:\\Users\\Lenovo\\Cuántico Seguros LTDA\\Cuántico Seguros - General";

const args = process.argv.slice(2);
const simular = args.includes("--simular");
const raiz = args.find((a) => !a.startsWith("--")) ?? RAIZ_POR_DEFECTO;

interface Carpeta {
  asesor: string;
  nombre: string;
  clave: string;
}

function leerCarpetas(raizAsesores: string): Carpeta[] {
  const salida: Carpeta[] = [];
  for (const asesor of readdirSync(raizAsesores, { withFileTypes: true })) {
    if (!asesor.isDirectory()) continue;
    const dirClientes = join(raizAsesores, asesor.name, "Clientes");
    if (!existsSync(dirClientes)) continue;
    let entradas;
    try {
      entradas = readdirSync(dirClientes, { withFileTypes: true });
    } catch {
      continue; // carpeta sin permisos o no sincronizada
    }
    for (const e of entradas) {
      if (!e.isDirectory()) continue;
      salida.push({ asesor: asesor.name, nombre: e.name, clave: claveCliente(e.name) });
    }
  }
  return salida;
}

(async () => {
  const raizAsesores = join(raiz, "4. Asesores");
  if (!existsSync(raizAsesores)) {
    console.error(`No se encontró "${raizAsesores}".`);
    console.error("Verifique que la unidad compartida esté sincronizada en este equipo.");
    process.exit(1);
  }

  const carpetas = leerCarpetas(raizAsesores);
  console.log(`Carpetas de clientes encontradas: ${carpetas.length}`);

  const porClave = new Map<string, Carpeta>();
  for (const c of carpetas) if (!porClave.has(c.clave)) porClave.set(c.clave, c);

  const polizas = await prisma.policy.findMany({ select: { asegurado: true } });
  const asegurados = new Map<string, string>();
  for (const p of polizas) {
    const k = claveCliente(p.asegurado);
    if (k) asegurados.set(k, p.asegurado.trim());
  }
  console.log(`Asegurados distintos en la cartera: ${asegurados.size}`);

  let exactas = 0;
  let porPrefijo = 0;
  const sinCarpeta: string[] = [];
  const aGuardar: {
    clave: string;
    nombre: string;
    asesor: string;
    ruta: string;
    url: string;
  }[] = [];

  for (const [clave, nombre] of asegurados) {
    let elegida = porClave.get(clave);
    let tipo: "exacta" | "prefijo" | null = elegida ? "exacta" : null;

    if (!elegida) {
      let mejor: Carpeta | null = null;
      let mejorRatio = 0;
      for (const c of carpetas) {
        const [corta, larga] =
          clave.length < c.clave.length ? [clave, c.clave] : [c.clave, clave];
        if (larga.startsWith(corta)) {
          const ratio = corta.length / larga.length;
          if (ratio > mejorRatio) {
            mejorRatio = ratio;
            mejor = c;
          }
        }
      }
      if (mejor && mejorRatio >= 0.85) {
        elegida = mejor;
        tipo = "prefijo";
      }
    }

    if (!elegida) {
      sinCarpeta.push(nombre);
      continue;
    }
    if (tipo === "exacta") exactas++;
    else porPrefijo++;

    const ruta = rutaCliente(elegida.asesor, elegida.nombre);
    aGuardar.push({
      clave,
      nombre: elegida.nombre,
      asesor: elegida.asesor,
      ruta,
      url: urlCarpeta(ruta),
    });
  }

  const total = asegurados.size;
  console.log(`\nCoincidencia exacta   : ${exactas}`);
  console.log(`Coincidencia por prefijo: ${porPrefijo}`);
  console.log(
    `Enlazables            : ${aGuardar.length}/${total} (${((aGuardar.length / total) * 100).toFixed(1)}%)`
  );
  console.log(`Sin carpeta           : ${sinCarpeta.length}`);

  if (simular) {
    console.log("\n(--simular: no se escribió nada en la base)");
    console.log("\nPrimeros sin carpeta:");
    sinCarpeta.slice(0, 15).forEach((n) => console.log(`  · ${n}`));
    await prisma.$disconnect();
    return;
  }

  // Las carpetas asignadas a mano no se tocan: mandan sobre el indexador.
  const manuales = new Set(
    (
      await prisma.carpetaCliente.findMany({
        where: { origen: "manual" },
        select: { clave: true },
      })
    ).map((c) => c.clave)
  );

  let creadas = 0;
  let actualizadas = 0;
  let respetadas = 0;
  for (const c of aGuardar) {
    if (manuales.has(c.clave)) {
      respetadas++;
      continue;
    }
    const existente = await prisma.carpetaCliente.findUnique({ where: { clave: c.clave } });
    if (existente) {
      await prisma.carpetaCliente.update({
        where: { clave: c.clave },
        data: { ...c, origen: "auto" },
      });
      actualizadas++;
    } else {
      await prisma.carpetaCliente.create({ data: { ...c, origen: "auto" } });
      creadas++;
    }
  }

  console.log(`\nCreadas: ${creadas} · Actualizadas: ${actualizadas} · Manuales respetadas: ${respetadas}`);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
