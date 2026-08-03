import { exigirSesionPagina } from "@/lib/auth";
import { Card, CardTitle, PageHeader, Td, Th } from "@/components/ui";
import { ProductosExplorador } from "@/components/productos-explorador";
import {
  ASISTENCIAS,
  AUTOS,
  CARPETA_COMPANIAS,
  COBERTURAS_AUTOS,
  COBERTURAS_COMPARADAS,
  COPROPIEDADES,
  EXCLUSIONES_COMUNES_ASISTENCIA,
  INVENTARIO_COMPARTIDA,
  SERVICIOS_ASISTENCIA,
  SURA_AUTOS_ILEGIBLE,
  TOTAL_CLAUSULADOS_COMPARTIDA,
} from "@/lib/productos";

export const dynamic = "force-dynamic";

/**
 * Las diferencias que importan, resumidas a una línea cada una. Antes eran
 * cuatro bloques de prosa seguidos por ramo; nadie los leía enteros.
 */
const CLAVES = {
  COPROPIEDADES: [
    {
      titulo: "MAPFRE incluye el terremoto en el básico.",
      texto:
        "Su sección primera lo trae junto al todo riesgo daño material. En SEGUROS DEL ESTADO es amparo adicional.",
    },
    {
      titulo: "La responsabilidad civil casi nunca viene incluida.",
      texto:
        "Anexo o módulo aparte en ZURICH, SURA, SOLIDARIA, HDI y SBS. AXA COLPATRIA le fija sublímites propios.",
    },
    {
      titulo: "PREVISORA excluye el hurto simple",
      texto:
        "salvo que se contrate el opcional de sustracción. Está en las exclusiones, no en las coberturas.",
    },
    {
      titulo: "ZURICH condiciona sus anexos a la carátula:",
      texto:
        "si el amparo no figura allí, «no habrá responsabilidad de la compañía». Conviene revisarlo al renovar.",
    },
  ],
  AUTOS: [
    {
      titulo: "En MAPFRE y BOLÍVAR, daños y hurto NO son básicos.",
      texto:
        "MAPFRE declara un solo amparo básico, la RC. BOLÍVAR deja daños, hurto y terremoto en «coberturas opcionales». Es lo que un cliente da por supuesto al asegurar el carro: hay que confirmarlo en la carátula.",
    },
    {
      titulo: "AXA COLPATRIA y SBS son lo contrario:",
      texto:
        "daños, hurto, naturaleza, patrimonial y jurídica van dentro de los amparos básicos.",
    },
    {
      titulo: "ALLIANZ, SEGUROS DEL ESTADO y HDI no separan básicos de adicionales.",
      texto:
        "Listan todo y remiten a «los amparos contratados»: ahí la carátula es la única fuente.",
    },
    {
      titulo: "HDI es el más completo en responsabilidad civil",
      texto:
        "—extracontractual, en exceso, de ley, contractual y general familiar— y el único con lucro cesante y exequias.",
    },
  ],
  ASISTENCIAS: [
    {
      titulo: "Solo ZURICH pone números.",
      texto:
        "15 asistencias por vigencia y hasta 30 SMDLV por evento, materiales y mano de obra incluidos. Los demás anexos no fijan tope, lo que no significa que sea ilimitado: hay que preguntarlo.",
    },
    {
      titulo: "PREVISORA es la lista más larga:",
      texto:
        "17 servicios, con sustitución de tejas, vigilante de apoyo en caso de robo, handy man y hasta chef, DJ y mesero a domicilio.",
    },
    {
      titulo: "Cuidado con la fuente del dato.",
      texto:
        "De AXA COLPATRIA solo hay su lista de exclusiones y de BBVA un resumen escrito en la agencia. Para responderle a un cliente hay que pedir el anexo oficial.",
    },
    {
      titulo: "Todas excluyen lo mismo en lo grueso:",
      texto:
        "catástrofes naturales, terrorismo, actos de autoridad, mala fe, desgaste por falta de mantenimiento y servicios contratados sin autorización previa.",
    },
  ],
};

export default async function ProductosPage() {
  // Antes de tocar la base: el layout no alcanza a cortar el render.
  await exigirSesionPagina();

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Productos"
        descripcion="Qué cubre cada compañía según sus clausulados archivados · copropiedades, autos y asistencias"
      />

      <div className="rounded-lg border border-status-warning/40 bg-status-warning/5 px-4 py-2.5 text-sm leading-relaxed text-ink-secondary">
        Sale del texto de los clausulados de la carpeta compartida y compara la{" "}
        <b>estructura</b>: qué es básico y qué exige anexo con prima adicional. No
        trae <b>límites, deducibles ni primas</b> —eso vive en la carátula de cada
        póliza—, así que ante un cliente manda su carátula, no esta tabla.
      </div>

      <Card>
        <ProductosExplorador
          copropiedades={COPROPIEDADES}
          autos={AUTOS}
          asistencias={ASISTENCIAS}
          coberturasCopropiedades={[...COBERTURAS_COMPARADAS]}
          coberturasAutos={[...COBERTURAS_AUTOS]}
          serviciosAsistencia={[...SERVICIOS_ASISTENCIA]}
          clavesPorRamo={CLAVES}
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Exclusiones que repiten todas las asistencias</CardTitle>
          <ul className="space-y-1.5">
            {EXCLUSIONES_COMUNES_ASISTENCIA.map((e) => (
              <li key={e} className="flex gap-2 text-sm text-ink-secondary">
                <span className="text-ink-muted">·</span>
                {e}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardTitle>Qué más hay en la compartida</CardTitle>
          <p className="mb-2.5 text-sm leading-relaxed text-ink-secondary">
            {TOTAL_CLAUSULADOS_COMPARTIDA} archivos en{" "}
            <span className="tabla-num text-xs">{CARPETA_COMPANIAS}</span>. Sirve
            para saber si ya existe un clausulado antes de pedirlo.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse whitespace-nowrap">
              <thead>
                <tr>
                  <Th>Ramo</Th>
                  <Th derecha>Docs</Th>
                  <Th>Compañías</Th>
                </tr>
              </thead>
              <tbody>
                {INVENTARIO_COMPARTIDA.map((r) => (
                  <tr key={r.ramo} className="hover:bg-surface-page">
                    <Td className="font-semibold">
                      {r.ramo}
                      {r.comparado && (
                        <span className="ml-1.5 rounded bg-status-good/12 px-1 py-0.5 text-[10px] font-semibold text-status-good">
                          comparado
                        </span>
                      )}
                    </Td>
                    <Td derecha>{r.documentos}</Td>
                    <Td className="max-w-[16rem] truncate text-xs text-ink-secondary">
                      {r.companias.join(" · ")}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2.5 text-xs leading-relaxed text-ink-muted">
            SURA tiene clausulado de autos en{" "}
            <span className="tabla-num">{SURA_AUTOS_ILEGIBLE.ruta}</span>, pero su
            PDF tiene la codificación dañada y no se puede leer automáticamente;
            queda fuera de la comparación. El anexo de asistencia de AXA COLPATRIA
            está escaneado como imagen, por lo mismo.
          </p>
        </Card>
      </div>
    </div>
  );
}
