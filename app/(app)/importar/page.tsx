import { ImportForm } from "@/components/import-form";
import { ImportSiniestrosForm } from "@/components/import-siniestros-form";
import { Card, CardTitle, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function ImportarPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        titulo="Importar datos"
        descripcion="Cargue el informe de producción y, aparte, los archivos de siniestros."
      />

      <Card>
        <CardTitle>Informe de producción</CardTitle>
        <p className="mb-3 text-sm text-ink-muted">
          El .xlsx con las hojas DATOS, OTRAS PÓLIZAS, CANCELACIONES, BASE 2025 y
          LISTAS.
        </p>
        <ImportForm />
      </Card>

      <Card>
        <CardTitle>Siniestros</CardTitle>
        <p className="mb-3 text-sm text-ink-muted">
          Los dos archivos de siniestros se unen en una sola lista. Si envía
          ambos, el resumen completa el responsable y las cifras de los casos
          que ya trajo el seguimiento.
        </p>
        <ImportSiniestrosForm />
      </Card>

      <Card>
        <CardTitle>Cómo funciona la importación</CardTitle>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-secondary">
          <li>
            Los encabezados de <b>DATOS</b>, <b>OTRAS PÓLIZAS</b> y{" "}
            <b>CANCELACIONES</b> se leen desde la <b>fila 2</b>; los de{" "}
            <b>BASE 2025</b> y <b>LISTAS</b> desde la fila 1 (estructura del
            informe original).
          </li>
          <li>
            <b>MES VENCIMIENTO</b>, <b>DÍAS AL VENCE</b> y <b>EDAD</b> se
            recalculan automáticamente: no dependen de lo que traiga el Excel.
          </li>
          <li>
            Los valores se validan contra la hoja <b>LISTAS</b> (ramo, tipo de
            negocio, aseguradora, estado y forma de pago, asesor). Los valores
            fuera de lista se importan igualmente y se reportan como
            advertencias.
          </li>
          <li>
            Cada importación <b>reemplaza por completo</b> los datos de cada
            hoja, pero conserva las marcas de «renovación gestionada» y sus
            notas (casadas por número de póliza y ramo).
          </li>
          <li>
            Las cancelaciones creadas dentro de la app (al cancelar una póliza
            desde la cartera) <b>se conservan</b> al reimportar; solo se
            reemplazan las que vienen del Excel. Si esa póliza sigue en la hoja
            DATOS, volverá a la cartera activa: actualice el Excel maestro para
            reflejar la cancelación.
          </li>
          <li>Las filas duplicadas dentro del archivo se omiten y se reportan.</li>
        </ul>
      </Card>
    </div>
  );
}
