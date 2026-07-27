import { redirect } from "next/navigation";
import { sesionActual } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Ingresar — Cuántico Seguros",
};

export default async function LoginPage() {
  // Si ya hay sesión no tiene sentido mostrar el formulario.
  if (await sesionActual()) redirect("/");
  return <LoginForm />;
}
