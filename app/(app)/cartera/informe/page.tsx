import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { construirInforme, PolizaInforme } from "@/lib/informe-cartera";
import { fmtCOP, fmtFecha } from "@/lib/format";
import { Card, EstadoVacio, PageHeader, StatCard } from "@/components/ui";
import { IconDescargar } from "@/components/icons";
import { exigirSesionPagina } from "@/lib/auth";
import { api } from "@/lib/rutas";

export const dynamic = "force-dynamic";

export default async function InformeCarteraPage({
  searchParams,
}: {
  searchParams: { asesor?: string };
}) {
  // Antes de tocar la base: el layout no alcanza a cortar el render.
  await exigirSesionPagina();

  const asesorParam = searchParams.asesor ?? "";

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

  const informe = construirInforme(polizas as PolizaInforme[], { asesor: asesorParam });

  // Asesores disponibles para cambiar el destinatario del informe
  const asesores = Array.from(
    new Set(
      polizas
        .flatMap((p) => [p.asesor1, p.asesor2])
        .filter((a): a is string => !!a)
        .map((a) => a.trim().replace(/\s+/g, " "))
    )
  ).sort((a, b) => a.localeCompare(b, "es"));

  const nPendientes =
    informe.vencida.reduce((s, g) => s + g.lineas.length, 0) +
    informe.proxima.reduce((s, g) => s + g.lineas.length, 0);

  const urlWord = api(
    `/api/informe-cartera${asesorParam ? `?asesor=${encodeURIComponent(asesorParam)}` : ""}`
  );

  return (
    <div className="space-y-6">
      <PageHeader
        titulo={`Informe de cartera${informe.asesor ? " · " + informe.asesor : ""}`}
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

      {/* Selector de asesor */}
      <div className="no-imprimir flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-secondary">Asesor:</span>
        <Link
          href="/cartera/informe"
          className={`rounded-lg border px-2.5 py-1.5 text-sm ${
            !asesorParam
              ? "border-brand bg-brand text-white"
              : "border-line-axis text-ink-secondary hover:bg-surface-page"
          }`}
        >
          Toda la cartera
        </Link>
        {asesores.map((a) => (
          <Link
            key={a}
            href={`/cartera/informe?asesor=${encodeURIComponent(a)}`}
            className={`rounded-lg border px-2.5 py-1.5 text-sm ${
              asesorParam === a
                ? "border-brand bg-brand text-white"
                : "border-line-axis text-ink-secondary hover:bg-surface-page"
            }`}
          >
            {a}
          </Link>
        ))}
      </div>

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
                {g.lineas.map((l, i) => (
                  <p key={i} className="mt-1 text-sm">
                    {l.texto}
                  </p>
                ))}
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
                {g.lineas.map((l, i) => (
                  <p key={i} className="mt-1 text-sm">
                    {l.texto}
                  </p>
                ))}
              </div>
            ))
          )}

          {informe.casos.length > 0 && (
            <>
              <h2 className="mt-6 text-lg font-bold">CASOS:</h2>
              {informe.casos.map((c, i) => (
                <p key={i} className="mt-1 text-sm">
                  {c}
                </p>
              ))}
            </>
          )}
        </Card>
      )}
    </div>
  );
}
