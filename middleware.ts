import { NextRequest, NextResponse } from "next/server";

const COOKIE_SESION = "cuantico_sesion";

/**
 * Duplicado de lib/auth.ts SEGUNDOS_SESION (6 horas), y no importado: este
 * archivo corre en el runtime Edge y lib/auth.ts arrastra Prisma, que
 * necesita Node. Si se cambia el número de horas de inactividad, hay que
 * cambiarlo en los dos sitios.
 */
const SEGUNDOS_SESION = 6 * 60 * 60;

/**
 * Primer filtro de acceso: si no hay cookie de sesión, redirige al login (o
 * responde 401 en las rutas de API) sin llegar a ejecutar la página.
 *
 * Es solo un atajo: la comprobación de verdad la hace el servidor validando
 * el token contra la base (app/(app)/layout.tsx y lib/auth.ts), porque el
 * middleware corre en el runtime Edge y no puede consultar la base.
 *
 * Aquí además se le da cuerda a la cookie: cada petición autenticada le
 * renueva el plazo de vida en el NAVEGADOR otras 6 horas. Sin esto, alguien
 * activo sin parar se quedaría fuera igual a las 6 horas del login, porque
 * la cookie expiraría por su cuenta aunque la sesión en la base siguiera
 * viva (esa se renueva aparte, en sesionActual). Renovar aquí un valor sin
 * comprobar nada contra la base no abre ningún hueco de seguridad: solo
 * decide cuánto tiempo el navegador va a seguir mandando el token, y quien
 * de verdad concede o niega el acceso es la validación contra la base en
 * cada página y cada ruta de API.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(COOKIE_SESION)?.value;
  if (token) {
    const res = NextResponse.next();
    res.cookies.set(COOKIE_SESION, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SEGUNDOS_SESION,
    });
    return res;
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Se excluyen el login, sus rutas de API, los recursos de Next, el favicon,
  // el logo y el cron. El logo tiene que salir en la pantalla de ingreso,
  // donde todavía no hay sesión: sin excluirlo, pedirlo devolvía un 307 hacia
  // /login. El cron (api/cron/*) lo dispara Vercel sin cookie de sesión —
  // se autentica con CRON_SECRET dentro de la propia ruta, no con este
  // middleware.
  //
  // Los íconos y el manifest de la PWA (apple-icon, icon-*, manifest.webmanifest)
  // también se piden sin sesión: el navegador los busca al añadir el
  // acceso directo a la pantalla de inicio, momento en que puede no haber
  // cookie todavía. Sin excluirlos, «Añadir a inicio» pedía el ícono, recibía
  // el 307 al login en vez de una imagen, y el acceso directo se quedaba sin
  // logo — que es justo lo que reportó el usuario.
  matcher: [
    "/((?!login|api/auth|api/cron|_next/static|_next/image|icon.svg|favicon.ico|logo-cuantico.png|apple-icon|icon-192|icon-512|icon-512-maskable|manifest.webmanifest).*)",
  ],
};
