import { exigirSesionPagina } from "@/lib/auth";
import { Card, CardTitle, PageHeader } from "@/components/ui";
import { TablaProductos } from "@/components/tabla-productos";
import {
  CARPETA_CLAUSULADOS,
  COBERTURAS_COMPARADAS,
  COPROPIEDADES,
  DOCUMENTOS_ASISTENCIA,
  OTROS_PRODUCTOS,
} from "@/lib/productos";

export const dynamic = "force-dynamic";

export default async function ProductosPage() {
  // Antes de tocar la base: el layout no alcanza a cortar el render.
  await exigirSesionPagina();

  const conAsistencia = COPROPIEDADES.filter((p) => p.anexoAsistencia).length;

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Productos"
        descripcion={`Diferencias entre los clausulados archivados de las compañías · ${COPROPIEDADES.length} de copropiedades y ${OTROS_PRODUCTOS.length} de otros ramos`}
      />

      <div className="rounded-lg border border-status-warning/40 bg-status-warning/5 px-4 py-3 text-sm leading-relaxed text-ink-secondary">
        <b className="text-ink">Lea esto antes de usarlo con un cliente.</b> Esta
        comparación sale del texto de los clausulados guardados en{" "}
        <span className="tabla-num text-xs">{CARPETA_CLAUSULADOS}</span>, y solo
        de ahí. Compara la <b>estructura</b> del producto: qué entra en el amparo
        básico y qué exige anexo aparte con prima adicional.
        <br />
        <br />
        No incluye <b>límites, sublímites, deducibles ni primas</b>: eso no está
        en el clausulado general, sino en la carátula y las condiciones
        particulares de cada póliza. Para responderle a un cliente sobre su caso,
        manda la carátula de <i>su</i> póliza, no esta tabla.
      </div>

      <Card>
        <CardTitle>Copropiedades · {COPROPIEDADES.length} compañías</CardTitle>
        <p className="mb-3 text-sm text-ink-secondary">
          Es el ramo de mayor producción de la agencia y el único con clausulado
          de varias compañías, así que es donde la comparación tiene sentido.
        </p>
        <TablaProductos
          productos={COPROPIEDADES}
          coberturas={[...COBERTURAS_COMPARADAS]}
        />
      </Card>

      <Card>
        <CardTitle>Lo que de verdad separa a una compañía de otra</CardTitle>
        <div className="space-y-3 text-sm leading-relaxed text-ink-secondary">
          <p>
            <b className="text-ink">MAPFRE mete el terremoto en el amparo básico.</b>{" "}
            Su sección primera incluye «terremoto, temblor y/o erupción volcánica»
            junto al todo riesgo daño material. En SEGUROS DEL ESTADO, en cambio,
            el terremoto figura como amparo adicional. Es la diferencia
            estructural más marcada del grupo y conviene verificarla en la
            cotización, no darla por supuesta.
          </p>
          <p>
            <b className="text-ink">
              La responsabilidad civil casi nunca viene incluida.
            </b>{" "}
            En ZURICH, SURA, SOLIDARIA, HDI y SBS es un anexo o módulo aparte. AXA
            COLPATRIA además le fija sublímites propios dentro del clausulado.
          </p>
          <p>
            <b className="text-ink">PREVISORA excluye el hurto simple</b> salvo que
            se contrate el amparo opcional de sustracción. Está dicho en su lista
            de exclusiones, no en la de coberturas: es fácil pasarlo por alto.
          </p>
          <p>
            <b className="text-ink">
              SBS es el único que ofrece accidentes personales para los integrantes
              del consejo
            </b>{" "}
            de la copropiedad, como amparo opcional.
          </p>
          <p>
            <b className="text-ink">
              ZURICH condiciona todos sus anexos a la carátula:
            </b>{" "}
            su clausulado dice que si el amparo opcional no figura allí, «no habrá
            responsabilidad de la compañía respecto a los mismos». Vale la pena
            revisar la carátula al renovar.
          </p>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Otros ramos · sin comparación posible</CardTitle>
          <p className="mb-3 text-sm text-ink-secondary">
            Hay un solo clausulado de cada uno, así que no hay contra qué
            contrastarlos.
          </p>
          <ul className="space-y-3">
            {OTROS_PRODUCTOS.map((p) => (
              <li key={p.archivo} className="border-l-2 border-line-axis pl-3">
                <div className="etiqueta-marca text-[11px] text-brand">
                  {p.compania}
                </div>
                <div className="text-sm font-medium">{p.producto}</div>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                  {p.estructura}
                </p>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardTitle>Documentos de asistencias archivados aparte</CardTitle>
          <p className="mb-3 text-sm text-ink-secondary">
            {conAsistencia} de las {COPROPIEDADES.length} compañías de
            copropiedades tienen su anexo de asistencia en un archivo distinto del
            clausulado. Además hay estos documentos sueltos:
          </p>
          <ul className="space-y-1.5 text-sm">
            {DOCUMENTOS_ASISTENCIA.map((d) => (
              <li key={d} className="flex gap-2 text-ink-secondary">
                <span className="text-ink-muted">·</span>
                <span className="tabla-num text-xs">{d}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-ink-muted">
            El anexo de asistencia de AXA COLPATRIA está escaneado como imagen, así
            que su contenido no se pudo leer y no entró en la comparación.
          </p>
        </Card>
      </div>
    </div>
  );
}
