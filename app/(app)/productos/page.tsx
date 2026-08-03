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
  FUENTES,
  SIN_COMPARAR,
  SERVICIOS_ASISTENCIA,
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
      titulo: "La responsabilidad civil nunca viene incluida.",
      texto:
        "En las once es anexo, módulo o sección aparte. En MAPFRE es la sección sexta; en SBS, el opcional 2.2; AXA COLPATRIA además le fija sublímites propios.",
    },
    {
      titulo: "PREVISORA excluye el hurto simple",
      texto:
        "salvo que se contrate el opcional de sustracción. Está en las exclusiones, no en las coberturas.",
    },
    {
      titulo: "El terremoto se contrata aparte en casi todas.",
      texto:
        "Solo MAPFRE lo trae en el básico. En AXA COLPATRIA es el opcional 1.2.1 y en SEGUROS DEL ESTADO un amparo adicional. ZURICH además avisa que si el anexo no figura en la carátula, «no habrá responsabilidad de la compañía».",
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
      titulo: "ALLIANZ, SEGUROS DEL ESTADO, HDI y ZURICH no separan básicos de adicionales.",
      texto:
        "Listan todo y remiten a «los amparos contratados» o «el plan contratado»: ahí la carátula es la única fuente de qué está cubierto.",
    },
    {
      titulo: "Detalles que solo tiene uno:",
      texto:
        "HDI distingue cinco modalidades de responsabilidad civil y es el único con lucro cesante y exequias. ZURICH extiende su RC a bicicleta y patineta —propia, prestada o alquilada— con sublímite de $5.000.000 por evento.",
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
        descripcion="Qué cubre cada compañía según el clausulado de su propia carpeta · copropiedades y autos"
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
          <CardTitle>De dónde salió cada clausulado</CardTitle>
          <p className="mb-2.5 text-sm leading-relaxed text-ink-secondary">
            Los buenos están en{" "}
            <span className="tabla-num text-xs">
              {CARPETA_COMPANIAS}/&lt;compañía&gt;/&lt;producto&gt;
            </span>
            . La carpeta <span className="tabla-num text-xs">Clausulados</span> es
            una copia parcial: en AXA, MAPFRE y SBS los dos archivos ni siquiera
            coinciden, y se usó el de la compañía.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse whitespace-nowrap">
              <thead>
                <tr>
                  <Th>Compañía</Th>
                  <Th>Ramo</Th>
                  <Th>Fuente</Th>
                </tr>
              </thead>
              <tbody>
                {FUENTES.map((f) => (
                  <tr key={`${f.ramo}-${f.compania}`} className="hover:bg-surface-page">
                    <Td className="font-semibold">{f.compania}</Td>
                    <Td className="text-xs text-ink-secondary">{f.ramo}</Td>
                    <Td>
                      <span
                        className={
                          f.origen === "carpeta_compania"
                            ? "rounded bg-status-good/12 px-1.5 py-0.5 text-[11px] font-semibold text-status-good"
                            : "rounded bg-status-warning/15 px-1.5 py-0.5 text-[11px] font-semibold text-status-warning"
                        }
                      >
                        {f.origen === "carpeta_compania"
                          ? "Carpeta de la compañía"
                          : "Solo en Clausulados"}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 border-t border-line-grid pt-2.5">
            <div className="etiqueta-marca mb-1.5 text-[11px] text-ink-muted">
              Con clausulado archivado pero sin comparar
            </div>
            {SIN_COMPARAR.map((c) => (
              <p
                key={`${c.compania}-${c.ramo}`}
                className="text-xs leading-relaxed text-ink-secondary"
              >
                <b className="text-ink">
                  {c.compania} ({c.ramo}):
                </b>{" "}
                {c.motivo}
              </p>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
