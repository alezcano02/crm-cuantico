import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { construirInforme, PolizaInforme } from "@/lib/informe-cartera";
import { fmtCOP, fmtFecha } from "@/lib/format";
import { Card, EstadoVacio, PageHeader, StatCard } from "@/components/ui";
import { IconDescargar } from "@/components/icons";
import { exigirSesionPagina } from "@/lib/auth";
import { api } from "@/lib/rutas";
import { PanelFiltros } from "@/components/panel-filtros";

export const dynamic = "force-dynamic";

export default async function InformeCarteraPage({
  searchParams,
}: {
  searchParams: { asesor?: string; ramo?: string | string[] };
}) {
  // Antes de tocar la base: el layout no alcanza a cortar el render.
  await exigirSesionPagina();

  const asesorParam = searchParams.asesor ?? "";
  // ?ramo puede venir una vez o varias; Next lo entrega como texto o lista.
  const ramosParam = (
    Array.isArray(searchParams.ramo) ? searchParams.ramo : searchParams.ramo ? [searchParams.ramo] : []
  ).filter(Boolean);

  const polizas = await prisma.policy.findMany({
    select: {
      numero: true,
      ramo: true,
      asegurado: true,
      placa: true,
      aseguradora: true,
      formaPago: true,
      estadoPago: true,
      primaTotal: true,
      valorCuota: true,
      celular: true,
      correo: true,
      notaCartera: true,
      fechaMaxPago: true,
      asesor1: true,
      asesor2: true,
    },
  });

  const informe = construirInforme(polizas as PolizaInforme[], {
    asesor: asesorParam,
    ramos: ramosParam,
  });

  // Asesores disponibles para cambiar el destinatario del informe
  const asesores = Array.from(
    new Set(
      polizas
        .flatMap((p) => [p.asesor1, p.asesor2])
        .filter((a): a is string => !!a)
        .map((a) => a.trim().replace(/\s+/g, " "))
    )
  ).sort((a, b) => a.localeCompare(b, "es"));

  // Solo los ramos que tienen cartera pendiente: ofrecer un ramo que daría un
  // informe vacío es una promesa que no se cumple.
  const ramosDisponibles = Array.from(
    new Set(
      polizas
        .filter((p) => (p.estadoPago ?? "").toUpperCase() !== "OK PAGO" && p.fechaMaxPago != null)
        .map((p) => p.ramo.trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "es"));

  const nPendientes =
    informe.vencida.reduce((s, g) => s + g.lineas.length, 0) +
    informe.proxima.reduce((s, g) => s + g.lineas.length, 0);

  const parametros = new URLSearchParams();
  if (asesorParam) parametros.set("asesor", asesorParam);
  for (const r of ramosParam) parametros.append("ramo", r);
  const urlWord = api(
    `/api/informe-cartera${parametros.toString() ? "?" + parametros : ""}`
  );

  /** Enlace conservando el asesor y alternando un ramo. */
  const urlConRamo = (ramo: string | null) => {
    const q = new URLSearchParams();
    if (asesorParam) q.set("asesor", asesorParam);
    if (ramo === null) {
      // «Todos los ramos»
    } else if (ramosParam.includes(ramo)) {
      for (const r of ramosParam.filter((x) => x !== ramo)) q.append("ramo", r);
    } else {
      for (const r of [...ramosParam, ramo]) q.append("ramo", r);
    }
    return `/cartera/informe${q.toString() ? "?" + q : ""}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        titulo={
          `Informe de cartera${informe.asesor ? " · " + informe.asesor : ""}` +
          (informe.ramos.length ? ` · ${informe.ramos.join(", ")}` : "")
        }
        descripcion={`Pólizas pendientes de pago al ${fmtFecha(informe.generadoEl)} · mismo formato del documento de Word`}
      >
        <Link
          href="/cartera"
          className="rounded-lg border border-line-axis px-3 py-2 text-sm font-medium text-ink-secondary hover:bg-surface-page"
        >
          Volver a cartera
        </Link>
        <a
          href={urlWord}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-dark"
        >
          <IconDescargar className="h-4 w-4" />
          Descargar Word
        </a>
      </PageHeader>

      <PanelFiltros activos={(asesorParam ? 1 : 0) + ramosParam.length}>
        <div className="no-imprimir space-y-3 rounded-lg border border-line-axis bg-surface-page p-3">
          <div>
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              Asesor
            </span>
            <div className="flex flex-wrap gap-1.5">
              <Link
                href={(() => {
                  const q = new URLSearchParams();
                  for (const r of ramosParam) q.append("ramo", r);
                  return `/cartera/informe${q.toString() ? "?" + q : ""}`;
                })()}
                className={`rounded-lg border px-2.5 py-1.5 text-sm ${
                  !asesorParam
                    ? "border-brand bg-brand text-white"
                    : "border-line-axis bg-surface text-ink-secondary hover:bg-surface-page"
                }`}
              >
                Toda la cartera
              </Link>
              {asesores.map((a) => (
                <Link
                  key={a}
                  href={(() => {
                    const q = new URLSearchParams();
                    q.set("asesor", a);
                    for (const r of ramosParam) q.append("ramo", r);
                    return `/cartera/informe?${q}`;
                  })()}
                  className={`rounded-lg border px-2.5 py-1.5 text-sm ${
                    asesorParam === a
                      ? "border-brand bg-brand text-white"
                      : "border-line-axis bg-surface text-ink-secondary hover:bg-surface-page"
                  }`}
                >
                  {a}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              Ramo · se pueden combinar varios
            </span>
            <div className="flex flex-wrap gap-1.5">
              <Link
                href={urlConRamo(null)}
                className={`rounded-lg border px-2.5 py-1.5 text-sm ${
                  ramosParam.length === 0
                    ? "border-brand bg-brand text-white"
                    : "border-line-axis bg-surface text-ink-secondary hover:bg-surface-page"
                }`}
              >
                Todos
              </Link>
              {ramosDisponibles.map((r) => (
                <Link
                  key={r}
                  href={urlConRamo(r)}
                  className={`rounded-lg border px-2.5 py-1.5 text-sm ${
                    ramosParam.includes(r)
                      ? "border-brand bg-brand text-white"
                      : "border-line-axis bg-surface text-ink-secondary hover:bg-surface-page"
                  }`}
                >
                  {r}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </PanelFiltros>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <StatCard
          etiqueta="Pólizas en el informe"
          valor={String(nPendientes)}
          detalle="Pendientes de pago"
        />
        <StatCard
          etiqueta="Cartera vencida"
          valor={fmtCOP(informe.totalVencida)}
          detalle="Pagos ya vencidos"
          acento={informe.totalVencida > 0 ? "rojo" : "verde"}
        />
        <StatCard
          etiqueta="Próxima a vencer"
          valor={fmtCOP(informe.totalProxima)}
          detalle="Pagos por vencer"
          acento={informe.totalProxima > 0 ? "amarillo" : undefined}
        />
      </div>

      {nPendientes === 0 ? (
        <Card>
          <EstadoVacio
            titulo="No hay pólizas pendientes de pago"
            descripcion={
              informe.asesor
                ? `${informe.asesor} no tiene cartera pendiente con los datos cargados.`
                : "Toda la cartera figura como pagada."
            }
          />
        </Card>
      ) : (
        <Card className="font-serif leading-relaxed">
          <h2 className="text-lg font-bold">Cartera Vencida</h2>
          {informe.vencida.length === 0 ? (
            <p className="mt-1 text-sm text-ink-muted">Sin pólizas vencidas de pago.</p>
          ) : (
            informe.vencida.map((g) => (
              <div key={g.mes} className="mt-3">
                <h3 className="font-bold">{g.mes}</h3>
                {/* Viñetas, igual que en el Word que se descarga: un mes con
                    quince pólizas se leía como un bloque corrido. */}
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                  {g.lineas.map((l, i) => (
                    <li key={i}>
                      <strong>{l.asegurado}</strong>
                      {l.resto}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}

          <h2 className="mt-6 text-lg font-bold">Próxima a vencer</h2>
          {informe.proxima.length === 0 ? (
            <p className="mt-1 text-sm text-ink-muted">Sin pólizas próximas a vencer.</p>
          ) : (
            informe.proxima.map((g) => (
              <div key={g.mes} className="mt-3">
                <h3 className="font-bold">{g.mes}</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                  {g.lineas.map((l, i) => (
                    <li key={i}>
                      <strong>{l.asegurado}</strong>
                      {l.resto}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}

          {informe.casos.length > 0 && (
            <>
              <h2 className="mt-6 text-lg font-bold">CASOS:</h2>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {informe.casos.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
