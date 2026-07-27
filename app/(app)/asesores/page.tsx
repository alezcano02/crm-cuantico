import Link from "next/link";
import clsx from "clsx";
import { aniosDisponibles, produccionPorAsesor } from "@/lib/queries";
import { hoyUTC } from "@/lib/calculos";
import { fmtCOPCompact, fmtNum } from "@/lib/format";
import { Card, CardTitle, EstadoVacio, PageHeader, StatCard } from "@/components/ui";
import { RamoBarChart } from "@/components/charts";
import { AsesoresTabla } from "@/components/asesores-tabla";

export const dynamic = "force-dynamic";

export default async function AsesoresPage({
  searchParams,
}: {
  searchParams: { anio?: string; campo?: string };
}) {
  const anios = await aniosDisponibles();
  const anioActual = hoyUTC().getUTCFullYear();
  const anio =
    Number(searchParams.anio) ||
    (anios.includes(anioActual) ? anioActual : anios[0] ?? anioActual);

  // En el archivo original ASESOR 1 suele ser el canal/oficina y ASESOR 2 la
  // persona; como no es una regla fija, se deja elegir cuál se analiza.
  const campo: "asesor1" | "asesor2" =
    searchParams.campo === "asesor2" ? "asesor2" : "asesor1";

  const filas = await produccionPorAsesor(anio, campo);

  const totalProduccion = filas.reduce((a, f) => a + f.produccion, 0);
  const totalCartera = filas.reduce((a, f) => a + f.cartera, 0);
  const totalVencidas = filas.reduce((a, f) => a + f.vencidas, 0);

  const grafico = filas
    .filter((f) => f.produccion > 0)
    .slice(0, 12)
    .map((f) => ({
      ramo: f.asesor,
      prima: f.produccion,
      pct: totalProduccion > 0 ? f.produccion / totalProduccion : 0,
    }));

  const enlace = (params: { anio?: number; campo?: string }) => {
    const p = new URLSearchParams();
    p.set("anio", String(params.anio ?? anio));
    p.set("campo", params.campo ?? campo);
    return `/asesores?${p.toString()}`;
  };

  const claseTab = (activo: boolean) =>
    clsx(
      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
      activo ? "bg-brand text-white" : "text-ink-secondary hover:bg-surface-page"
    );

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Asesores"
        descripcion={`Producción, cartera y cancelaciones por asesor · producción ${anio} = vencimientos ${anio + 1}`}
      >
        <div className="flex gap-1 rounded-lg border border-line-grid bg-surface p-1">
          <Link href={enlace({ campo: "asesor1" })} className={claseTab(campo === "asesor1")}>
            Asesor 1
          </Link>
          <Link href={enlace({ campo: "asesor2" })} className={claseTab(campo === "asesor2")}>
            Asesor 2
          </Link>
        </div>
        <div className="flex gap-1 rounded-lg border border-line-grid bg-surface p-1">
          {anios.map((a) => (
            <Link key={a} href={enlace({ anio: a })} className={claseTab(a === anio)}>
              {a}
            </Link>
          ))}
        </div>
      </PageHeader>

      {filas.length === 0 ? (
        <Card>
          <EstadoVacio
            titulo="Sin asesores registrados"
            descripcion="Las pólizas cargadas no tienen valor en esta columna de asesor. Pruebe con la otra columna o importe el informe de producción."
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard
              etiqueta="Asesores activos"
              valor={fmtNum(filas.length)}
              detalle={campo === "asesor1" ? "Según Asesor 1" : "Según Asesor 2"}
            />
            <StatCard
              etiqueta={`Producción ${anio}`}
              valor={fmtCOPCompact(totalProduccion)}
              detalle="Prima neta con vencimiento en el ciclo"
            />
            <StatCard
              etiqueta="Cartera administrada"
              valor={fmtCOPCompact(totalCartera)}
              detalle="Prima neta total vigente"
            />
            <StatCard
              etiqueta="Vencidas por gestionar"
              valor={fmtNum(totalVencidas)}
              detalle="Suma de pólizas vencidas"
              acento={totalVencidas > 0 ? "rojo" : "verde"}
              href="/vencimientos"
            />
          </div>

          {grafico.length > 0 && (
            <Card>
              <CardTitle>Producción {anio} por asesor</CardTitle>
              <RamoBarChart data={grafico} />
            </Card>
          )}

          <AsesoresTabla filas={filas} anio={anio} campo={campo} />
        </>
      )}
    </div>
  );
}
