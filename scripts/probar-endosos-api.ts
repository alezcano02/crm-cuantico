/**
 * Prueba de extremo a extremo del módulo de Endosos, contra el servidor local.
 *
 * Ejercita las rutas de API por HTTP igual que lo haría el formulario —o una
 * sesión de Claude que haya leído el buzón— y comprueba lo que de verdad
 * importa: que el guardia de sesión cierra el paso, que los valores escritos
 * como los teclea la gente («$285.415.540», «0,36») se guardan bien, que la
 * bitácora antepone sin borrar, y que la revisión señala los mismos errores por
 * los que el banco devolvió el endoso de Marsella 1808 en la vida real.
 *
 * OJO: escribe en la base a la que apunte el .env, que es la de producción.
 * Todo lo que crea lleva el prefijo «ZZ PRUEBA» y lo borra al terminar, pero
 * por eso hace falta pasar --si para que corra.
 *
 * Uso: npm run dev  (en otra terminal)
 *      npx tsx scripts/probar-endosos-api.ts --si [--dejar-datos]
 */
import { randomBytes } from "crypto";
import { prisma } from "../lib/prisma";
import { revisarEndoso } from "../lib/endosos";

const BASE = "http://localhost:3000/funcionarios";
const DEJAR = process.argv.includes("--dejar-datos");

if (!process.argv.includes("--si")) {
  console.error(
    "Esta prueba escribe en la base de datos del .env. Añade --si para confirmar que quieres correrla."
  );
  process.exit(1);
}

let fallos = 0;
function comprobar(descripcion: string, condicion: boolean, detalle?: string) {
  console.log(`${condicion ? "  ok " : "  XX "}${descripcion}${detalle ? ` — ${detalle}` : ""}`);
  if (!condicion) fallos++;
}

async function main() {
  const usuario = await prisma.usuario.findFirst({ where: { activo: true } });
  if (!usuario) throw new Error("No hay ningún usuario activo en la base.");
  const token = randomBytes(32).toString("base64url");
  await prisma.sesion.create({
    data: { token, usuarioId: usuario.id, expira: new Date(Date.now() + 30 * 60 * 1000) },
  });
  console.log(`Sesión de prueba para "${usuario.usuario}".\n`);

  const cabeceras = { "Content-Type": "application/json", Cookie: `cuantico_sesion=${token}` };
  const pedir = async (ruta: string, metodo: string, cuerpo?: unknown) => {
    const r = await fetch(`${BASE}${ruta}`, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    let json: any = null;
    try {
      json = await r.json();
    } catch {
      /* sin cuerpo JSON */
    }
    return { estado: r.status, json };
  };

  let copropiedadId: number | null = null;
  let endosoId: number | null = null;

  try {
    console.log("1. Sin sesión no se entra");
    const sinSesion = await fetch(`${BASE}/api/endosos`, { method: "GET" });
    comprobar(
      "GET /api/endosos sin cookie es rechazado",
      sinSesion.status === 401 || sinSesion.status === 403,
      `HTTP ${sinSesion.status}`
    );

    console.log("\n2. Ficha de la copropiedad");
    const cop = await pedir("/api/copropiedades", "POST", {
      nombre: "ZZ PRUEBA Marsella",
      nit: "901460370-1",
      aseguradora: "Zurich",
      numeroPoliza: "PIPL-999999999-1",
      vigenciaHasta: "2027-04-25",
      valorAseguradoTotal: "80.945.125.857",
      pazSalvoVigenteHasta: "2026-12-30",
      pazSalvoEstado: "AL DIA",
      admiteEndosos: true,
    });
    comprobar("POST /api/copropiedades responde ok", cop.estado === 200 && cop.json?.ok, `HTTP ${cop.estado}`);
    copropiedadId = cop.json?.id ?? null;
    const guardada = copropiedadId
      ? await prisma.copropiedad.findUnique({ where: { id: copropiedadId } })
      : null;
    comprobar(
      "El valor asegurado se limpió bien («80.945.125.857» → 80945125857)",
      guardada?.valorAseguradoTotal === 80945125857,
      String(guardada?.valorAseguradoTotal)
    );

    const dup = await pedir("/api/copropiedades", "POST", { nombre: "ZZ PRUEBA Marsella" });
    comprobar("Un nombre repetido se rechaza", dup.estado === 400, `HTTP ${dup.estado}`);

    console.log("\n3. El caso real de Nicole Forbes (Marsella 1808), tal como llegó");
    const alta = await pedir("/api/endosos", "POST", {
      urbanizacion: "ZZ PRUEBA Marsella",
      cliente: "Nicole Forbes Gómez",
      cedula: "1017237538",
      direccion: "CL 54 Nº 86C - 66",
      // ciudad: falta a propósito; es por lo que la devolvió el banco
      torre: "T1",
      apartamento: "1808",
      cuartoUtil: "01037",
      parqueadero: "01099",
      valorSolicitado: "$285.415.540",
      coeficiente: "0,36",
      banco: "Davivienda",
      bancoNit: "860.034.594-1", // el NIT de DAVIbank, no el de Davivienda
      tipoCredito: "HIPOTECARIO",
      correoSolicitante: "nicoleforbesgo@gmail.com",
      nota: "Entró por correo el 24 de agosto.",
    });
    comprobar("POST /api/endosos responde ok", alta.estado === 200 && alta.json?.ok, `HTTP ${alta.estado}`);
    endosoId = alta.json?.id ?? null;
    comprobar(
      "Se enlazó solo con la ficha de la copropiedad por el nombre",
      alta.json?.copropiedadId === copropiedadId,
      `copropiedadId=${alta.json?.copropiedadId}`
    );

    const e = endosoId ? await prisma.endoso.findUnique({ where: { id: endosoId } }) : null;
    comprobar(
      "El valor «$285.415.540» se guardó como número",
      e?.valorSolicitado === 285415540,
      String(e?.valorSolicitado)
    );
    comprobar("El coeficiente «0,36» se guardó con decimales", e?.coeficiente === 0.36, String(e?.coeficiente));
    comprobar("El estado inicial es NUEVA_SOLICITUD", e?.estado === "NUEVA_SOLICITUD", e?.estado ?? "");
    comprobar(
      "La nota inicial quedó en la bitácora con su fecha",
      !!e?.historia && /^\d{2}\/\d{2}\/\d{4} · Entró por correo/.test(e.historia),
      e?.historia ?? "(vacía)"
    );

    console.log("\n4. La revisión sobre el caso ya guardado");
    const copGuardada = await prisma.copropiedad.findUnique({ where: { id: copropiedadId! } });
    const chequeos = revisarEndoso(e!, copGuardada, new Date("2026-08-25T00:00:00Z"));
    const rojos = chequeos.filter((c) => c.resultado === "bloqueo").map((c) => c.regla);
    comprobar("Detecta la dirección incompleta", rojos.includes("Dirección completa"), rojos.join(", "));
    comprobar("Detecta el NIT que no corresponde al banco", rojos.includes("Banco y NIT"), rojos.join(", "));
    comprobar("No inventa bloqueos de más", rojos.length === 2, `${rojos.length} bloqueos`);

    console.log("\n5. Validación de estados");
    const malEstado = await pedir(`/api/endosos/${endosoId}`, "PATCH", { estado: "INVENTADO" });
    comprobar("Un estado desconocido se rechaza", malEstado.estado === 400, `HTTP ${malEstado.estado}`);

    console.log("\n6. Bitácora");
    await pedir(`/api/endosos/${endosoId}`, "PATCH", {
      notaSeguimiento: "Radicado ante Zurich.",
      fechaSeguimiento: "2026-08-25",
      estado: "RADICADO",
      radicado: "END-PRUEBA-1",
    });
    await pedir(`/api/endosos/${endosoId}`, "PATCH", {
      notaSeguimiento: "El banco lo devolvió: falta la ciudad.",
      fechaSeguimiento: "2026-08-26",
      estado: "REPROCESO",
    });
    const trasNotas = await prisma.endoso.findUnique({ where: { id: endosoId! } });
    const entradas = (trasNotas?.historia ?? "").split("\n\n").filter((x) => x.trim());
    comprobar("La bitácora tiene las 3 entradas", entradas.length === 3, `${entradas.length} entradas`);
    comprobar("La más reciente quedó arriba", !!entradas[0]?.includes("El banco lo devolvió"), entradas[0] ?? "");
    comprobar("La primera nota sigue al final", !!entradas[2]?.includes("Entró por correo"), entradas[2] ?? "");
    comprobar("El estado se movió a REPROCESO", trasNotas?.estado === "REPROCESO", trasNotas?.estado ?? "");
    comprobar(
      "Al poner el radicado se puso sola la fecha de envío (arranca el reloj)",
      !!trasNotas?.fechaEnvioAseguradora,
      String(trasNotas?.fechaEnvioAseguradora)
    );

    console.log("\n7. Listado (lo que consultaría Claude antes de duplicar un caso)");
    const lista = await pedir("/api/endosos?q=Nicole", "GET");
    comprobar(
      "GET /api/endosos?q=Nicole lo encuentra",
      lista.estado === 200 && lista.json?.endosos?.some((x: any) => x.id === endosoId),
      `HTTP ${lista.estado}, ${lista.json?.total} resultados`
    );

    console.log("\n8. La página");
    const pagina = await fetch(`${BASE}/endosos`, { headers: { Cookie: `cuantico_sesion=${token}` } });
    const html = await pagina.text();
    comprobar("GET /endosos responde 200", pagina.status === 200, `HTTP ${pagina.status}`);
    comprobar("Muestra el caso en la tabla", html.includes("Nicole Forbes"));
    comprobar("Muestra el semáforo de la revisión", html.includes("No enviar"));
  } finally {
    console.log("\nLimpieza");
    await prisma.sesion.deleteMany({ where: { token } });
    console.log("  ok Sesión de prueba eliminada");
    if (!DEJAR) {
      if (endosoId) await prisma.endoso.deleteMany({ where: { id: endosoId } });
      if (copropiedadId) await prisma.copropiedad.deleteMany({ where: { id: copropiedadId } });
      console.log("  ok Datos de prueba eliminados");
    } else {
      console.log("  -- Datos de prueba CONSERVADOS (--dejar-datos)");
    }
    await prisma.$disconnect();
  }

  console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} FALLA(S)`}`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
