import { NextRequest, NextResponse } from "next/server";

const COOKIE_SESION = "cuantico_sesion";

/**
 * Primer filtro de acceso: si no hay cookie de sesión, redirige al login (o
 * responde 401 en las rutas de API) sin llegar a ejecutar la página.
 *
 * Es solo un atajo: la comprobación de verdad la hace el servidor validando
 * el token contra la base (app/(app)/layout.tsx y lib/auth.ts), porque el
 * middleware corre en el runtime Edge y no puede consultar la base.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const tieneCookie = !!req.cookies.get(COOKIE_SESION)?.value;
  if (tieneCookie) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Se excluyen el login, sus rutas de API, los recursos de Next y el favicon.
  matcher: [
    "/((?!login|api/auth|_next/static|_next/image|icon.svg|favicon.ico).*)",
  ],
};
