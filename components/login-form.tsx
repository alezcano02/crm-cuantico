"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogoCompleto, LogoMarca } from "@/components/logo";

export function LoginForm() {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEntrando(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, clave }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo ingresar.");
      // replace + refresh para que el layout vuelva a leer la sesión
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setEntrando(false);
    }
  };

  const claseInput =
    "w-full rounded-lg border border-line-axis bg-surface px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand focus:ring-1 focus:ring-brand";

  return (
    <div className="flex min-h-screen">
      {/* Panel de marca — se oculta en pantallas pequeñas */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-brand-800 p-10 lg:flex">
        <LogoCompleto tono="claro" />

        {/* Marca de agua: el mismo símbolo, ampliado */}
        <LogoMarca
          className="pointer-events-none absolute -right-24 top-1/2 h-[520px] w-[520px] -translate-y-1/2 opacity-[0.07]"
          orbita="#ffffff"
          nodo="#ffffff"
        />

        <div className="relative">
          <h2 className="titular text-4xl leading-tight text-white">
            CRM de cartera
            <br />y producción
          </h2>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/60">
            Seguimiento de vencimientos, cobranza y cumplimiento de metas de
            producción de la agencia.
          </p>
        </div>

        <p className="relative text-xs text-white/35">
          Acceso exclusivo para el equipo de Cuántico Agencia de Seguros.
        </p>
      </div>

      {/* Formulario */}
      <div className="flex w-full items-center justify-center bg-surface-page px-5 py-10 lg:w-1/2">
        <div className="w-full max-w-sm">
          <LogoCompleto className="mb-8 lg:hidden" />

          <h1 className="titular text-3xl text-brand">Ingresar</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Escriba sus credenciales para entrar al CRM.
          </p>

          <form onSubmit={enviar} className="mt-7 space-y-4">
            <div>
              <label
                htmlFor="usuario"
                className="block text-xs font-semibold uppercase tracking-wide text-ink-muted"
              >
                Usuario
              </label>
              <input
                id="usuario"
                name="usuario"
                autoComplete="username"
                autoFocus
                required
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                className={`${claseInput} mt-1.5`}
                placeholder="Su nombre de usuario"
              />
            </div>

            <div>
              <label
                htmlFor="clave"
                className="block text-xs font-semibold uppercase tracking-wide text-ink-muted"
              >
                Contraseña
              </label>
              <div className="relative mt-1.5">
                <input
                  id="clave"
                  name="clave"
                  type={verClave ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  className={`${claseInput} pr-16`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setVerClave((v) => !v)}
                  className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-ink-muted hover:text-brand"
                >
                  {verClave ? "Ocultar" : "Ver"}
                </button>
              </div>
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-status-critical/30 bg-status-critical/5 px-3 py-2 text-sm text-status-critical"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={entrando}
              className="etiqueta-marca w-full rounded-lg bg-brand px-4 py-3 text-sm text-white transition-colors hover:bg-brand-dark disabled:opacity-60"
            >
              {entrando ? "Ingresando…" : "Ingresar"}
            </button>
          </form>

          <p className="mt-6 text-xs leading-relaxed text-ink-muted">
            ¿No tiene usuario o lo olvidó? Solicítelo al administrador del CRM.
          </p>
        </div>
      </div>
    </div>
  );
}
