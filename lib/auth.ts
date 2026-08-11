import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { prisma } from "./prisma";

export const COOKIE_SESION = "cuantico_sesion";

/**
 * La sesión vence por INACTIVIDAD, no a fecha fija desde el login.
 *
 * Cada vez que se valida una sesión (sesionActual) se le empuja el vencimiento
 * otras 6 horas hacia adelante; si no hay ninguna petición en ese lapso, la
 * fila expira sola y hay que volver a entrar. Este mismo número lo usa
 * middleware.ts para refrescar el lado del navegador (ver el comentario ahí
 * sobre por qué está duplicado y no importado).
 */
export const SEGUNDOS_SESION = 6 * 60 * 60;

// ---------------------------------------------------------------------------
// Claves
// ---------------------------------------------------------------------------

/**
 * Deriva la clave con scrypt y una sal aleatoria por usuario.
 * Formato guardado: "scrypt$<sal hex>$<hash hex>".
 * No se usa ninguna dependencia externa: scrypt viene en Node.
 */
export function hashClave(clave: string): string {
  const sal = randomBytes(16);
  const hash = scryptSync(clave, sal, 64);
  return `scrypt$${sal.toString("hex")}$${hash.toString("hex")}`;
}

export function verificarClave(clave: string, almacenado: string): boolean {
  const partes = almacenado.split("$");
  if (partes.length !== 3 || partes[0] !== "scrypt") return false;
  try {
    const sal = Buffer.from(partes[1], "hex");
    const esperado = Buffer.from(partes[2], "hex");
    const calculado = scryptSync(clave, sal, esperado.length);
    // Comparación en tiempo constante para no filtrar información por el
    // tiempo de respuesta.
    return timingSafeEqual(esperado, calculado);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Sesiones
// ---------------------------------------------------------------------------

export async function crearSesion(usuarioId: number) {
  const token = randomBytes(32).toString("base64url");
  const expira = new Date(Date.now() + SEGUNDOS_SESION * 1000);
  await prisma.sesion.create({ data: { token, usuarioId, expira } });
  cookies().set(COOKIE_SESION, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SEGUNDOS_SESION,
  });
  // Limpieza oportunista de sesiones ya vencidas
  await prisma.sesion.deleteMany({ where: { expira: { lt: new Date() } } });
  return token;
}

export interface SesionActiva {
  usuarioId: number;
  usuario: string;
  nombre: string | null;
}

/** Devuelve la sesión válida de la petición actual, o null. */
export async function sesionActual(): Promise<SesionActiva | null> {
  const token = cookies().get(COOKIE_SESION)?.value;
  if (!token) return null;
  try {
    const sesion = await prisma.sesion.findUnique({
      where: { token },
      include: { usuario: true },
    });
    const ahora = new Date();
    if (!sesion || sesion.expira < ahora || !sesion.usuario.activo) return null;

    // Renovación por inactividad: cada petición válida empuja el vencimiento
    // otras 6 horas. No se escribe en cada llamada —una sola carga de página
    // puede disparar varias peticiones en paralelo, cada una pasando por
    // aquí— sino solo cuando ya pasó más de un minuto desde la última
    // renovación; así no se persigue la cola de escrituras sin cambiar en
    // nada el sentido de "6 horas de inactividad".
    const margenMs = 60 * 1000;
    if (sesion.expira.getTime() - ahora.getTime() < SEGUNDOS_SESION * 1000 - margenMs) {
      await prisma.sesion.update({
        where: { token },
        data: { expira: new Date(ahora.getTime() + SEGUNDOS_SESION * 1000) },
      });
    }

    return {
      usuarioId: sesion.usuarioId,
      usuario: sesion.usuario.usuario,
      nombre: sesion.usuario.nombre,
    };
  } catch {
    // Si la base no responde no se concede acceso.
    return null;
  }
}

export async function cerrarSesion() {
  const token = cookies().get(COOKIE_SESION)?.value;
  if (token) {
    await prisma.sesion.deleteMany({ where: { token } });
  }
  cookies().delete(COOKIE_SESION);
}

/**
 * Guardia para las rutas de API: devuelve una respuesta 401 si no hay sesión
 * válida, o null si puede continuar. El middleware solo comprueba que exista
 * la cookie, así que esta validación contra la base es la que realmente
 * protege los datos.
 *
 *   const noAutorizado = await exigirSesion();
 *   if (noAutorizado) return noAutorizado;
 */
export async function exigirSesion(): Promise<NextResponse | null> {
  const sesion = await sesionActual();
  if (!sesion) {
    return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  }
  return null;
}

/**
 * Quién puede importar datos.
 *
 * La importación borra y recrea casi toda la base, así que no es una acción
 * más: la hace una sola persona. Se compara en minúsculas porque el usuario
 * se escribe a mano al ingresar.
 */
const USUARIOS_IMPORTACION = ["administrativo@cuanticoseguros.com"];

export function puedeImportar(usuario: string | null | undefined): boolean {
  if (!usuario) return false;
  return USUARIOS_IMPORTACION.includes(usuario.trim().toLowerCase());
}

/**
 * Quién ve las comisiones.
 *
 * Las comisiones son información de remuneración, no operativa: se limita a
 * la cuenta de Alejandro. Se compara en minúsculas porque el usuario se
 * escribe a mano al ingresar.
 */
const USUARIOS_COMISIONES = ["administrativo@cuanticoseguros.com"];

export function puedeVerComisiones(usuario: string | null | undefined): boolean {
  if (!usuario) return false;
  return USUARIOS_COMISIONES.includes(usuario.trim().toLowerCase());
}

/**
 * Guardia para la PÁGINA de comisiones. Se manda al dashboard en vez de al
 * login: quien llega aquí sí tiene sesión, solo que no es su módulo, y
 * mandarlo a iniciar sesión otra vez sería desconcertante.
 */
export async function exigirComisionesPagina(): Promise<SesionActiva> {
  const sesion = await sesionActual();
  if (!sesion) redirect("/login");
  if (!puedeVerComisiones(sesion.usuario)) redirect("/");
  return sesion;
}

/**
 * Colectivas está abierto a todo el que tenga sesión.
 *
 * Nació restringido a una cuenta mientras se cargaban los amparados y se
 * cuadraba el cruce con el informe. Ya con las siete empresas cargadas y las
 * comprobaciones en verde, la operación lo necesita a diario: quien atiende a
 * una empresa tiene que poder ver quién está cubierto sin pedírselo a nadie.
 *
 * Sigue siendo una función y no un `true` suelto a propósito: es el punto por
 * el que se volvería a cerrar, y así los tres guardias de abajo no cambian.
 * Comisiones NO se abre —esa es remuneración— y por eso las dos listas nunca
 * se juntaron.
 */
export function puedeVerColectivas(usuario: string | null | undefined): boolean {
  return !!usuario;
}

export async function exigirColectivasPagina(): Promise<SesionActiva> {
  const sesion = await sesionActual();
  if (!sesion) redirect("/login");
  if (!puedeVerColectivas(sesion.usuario)) redirect("/");
  return sesion;
}

/** Guardia para las rutas de API de colectivas. */
export async function exigirColectivas(): Promise<NextResponse | null> {
  const sesion = await sesionActual();
  if (!sesion) {
    return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  }
  if (!puedeVerColectivas(sesion.usuario)) {
    return NextResponse.json(
      { error: "Este módulo está limitado a la cuenta administrativa." },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Guardia para las rutas de API que solo puede usar quien importa. Devuelve
 * 401 si no hay sesión y 403 si la hay pero no es de quien corresponde, para
 * que el cliente pueda distinguir "vuelva a entrar" de "no es para usted".
 */
export async function exigirImportador(): Promise<NextResponse | null> {
  const sesion = await sesionActual();
  if (!sesion) {
    return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  }
  if (!puedeImportar(sesion.usuario)) {
    return NextResponse.json(
      {
        error:
          "Solo el usuario administrativo puede importar datos. La importación reemplaza casi toda la base, así que está limitada a una sola cuenta.",
      },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Guardia para las PÁGINAS. Debe ser la primera línea de cada página del grupo
 * (app), antes de cualquier consulta a la base.
 *
 * No basta con comprobar la sesión en el layout: React renderiza el layout y
 * sus hijos EN PARALELO, así que la página alcanza a consultar la base y a
 * renderizarse aunque el layout llame a redirect(). Next devuelve entonces un
 * 307 hacia /login cuyo CUERPO sigue trayendo la página completa. El navegador
 * sigue la redirección y no lo enseña, pero cualquiera que lea la respuesta
 * directamente (curl) se lleva los datos con solo mandar una cookie con
 * cualquier valor, porque el middleware únicamente comprueba que exista.
 *
 * Llamándola aquí la página se corta antes de tocar la base y el cuerpo del
 * 307 sale vacío de datos.
 */
export async function exigirSesionPagina(): Promise<SesionActiva> {
  const sesion = await sesionActual();
  if (!sesion) redirect("/login");
  return sesion;
}
