import { prisma } from "@/lib/prisma";
import { exigirSesionPagina } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { EndososTabla } from "@/components/endosos-tabla";
import {
  diasEsperando,
  diasParaRenovar,
  evaluarRevision,
  revisarEndoso,
  type CopropiedadVista,
  type EndosoVista,
} from "@/lib/endosos";

export const dynamic = "force-dynamic";

/**
 * Endosos: el certificado que le dice al banco que la parte de la póliza del
 * edificio correspondiente a un apartamento queda a su favor.
 *
 * Lo que hace este módulo distinto de los demás es la REVISIÓN: antes de
 * radicar ante la aseguradora se comprueba lo que sabemos que hace que el
 * banco lo devuelva —la dirección incompleta, el NIT del beneficiario mal, el
 * paz y salvo vencido, el valor por encima del coeficiente—. El reproceso
 * cuesta rehacer el trámite entero y esperar otros 15 días hábiles, y venía
 * pasando en uno de cada diez casos.
 */
export default async function EndososPage() {
  await exigirSesionPagina();

  /*
   * Dos consultas sueltas y no un `include`.
   *
   * Con `include: { copropiedad: true }` cada uno de los casi dos mil endosos
   * viajaba con su propia copia de la ficha del edificio —98 fichas repetidas
   * mil ochocientas veces—, y la página ya recibe la lista de fichas aparte
   * para sus desplegables. Se cruzan aquí por id.
   *
   * `historia` tampoco viaja: es el campo que más crece (una línea por cada
   * gestión) y solo hace falta al abrir un caso, así que la ventana la pide
   * cuando se abre. Entre las dos cosas la consulta baja de 418 a 279 ms y el
   * envío a la mitad.
   */
  const [endosos, copropiedades] = await Promise.all([
    prisma.endoso.findMany({
      select: {
        id: true,
        urbanizacion: true,
        copropiedadId: true,
        cliente: true,
        cedula: true,
        cliente2: true,
        cedula2: true,
        correoSolicitante: true,
        celular: true,
        direccion: true,
        ciudad: true,
        torre: true,
        apartamento: true,
        cuartoUtil: true,
        parqueadero: true,
        coeficiente: true,
        valorSolicitado: true,
        banco: true,
        bancoNit: true,
        tipoCredito: true,
        aseguradora: true,
        numeroPoliza: true,
        radicado: true,
        fechaEnvioAseguradora: true,
        estado: true,
        ultimoSeguimiento: true,
        creadoEn: true,
      },
      orderBy: { creadoEn: "desc" },
    }),
    prisma.copropiedad.findMany({ orderBy: { nombre: "asc" } }),
  ]);

  const fichas = new Map(copropiedades.map((c) => [c.id, c]));

  const hoy = new Date();

  const aVistaCopropiedad = (c: {
    id: number;
    nombre: string;
    nit: string | null;
    aseguradora: string | null;
    numeroPoliza: string | null;
    vigenciaHasta: Date | null;
    valorAseguradoTotal: number | null;
    pazSalvoVigenteHasta: Date | null;
    pazSalvoEstado: string | null;
    admiteEndosos: boolean;
    motivoBloqueo: string | null;
    nota: string | null;
  }): CopropiedadVista => ({
    id: c.id,
    nombre: c.nombre,
    nit: c.nit,
    aseguradora: c.aseguradora,
    numeroPoliza: c.numeroPoliza,
    vigenciaHasta: c.vigenciaHasta?.toISOString() ?? null,
    valorAseguradoTotal: c.valorAseguradoTotal,
    pazSalvoVigenteHasta: c.pazSalvoVigenteHasta?.toISOString() ?? null,
    pazSalvoEstado: c.pazSalvoEstado,
    admiteEndosos: c.admiteEndosos,
    motivoBloqueo: c.motivoBloqueo,
    nota: c.nota,
  });

  const vista: EndosoVista[] = endosos.map((e) => {
    const ficha = e.copropiedadId != null ? (fichas.get(e.copropiedadId) ?? null) : null;
    const chequeos = revisarEndoso(e, ficha, hoy);
    return {
    id: e.id,
    urbanizacion: e.urbanizacion,
    copropiedadId: e.copropiedadId,
    cliente: e.cliente,
    cedula: e.cedula,
    cliente2: e.cliente2,
    cedula2: e.cedula2,
    correoSolicitante: e.correoSolicitante,
    celular: e.celular,
    direccion: e.direccion,
    ciudad: e.ciudad,
    torre: e.torre,
    apartamento: e.apartamento,
    cuartoUtil: e.cuartoUtil,
    parqueadero: e.parqueadero,
    coeficiente: e.coeficiente,
    valorSolicitado: e.valorSolicitado,
    banco: e.banco,
    bancoNit: e.bancoNit,
    tipoCredito: e.tipoCredito,
    aseguradora: e.aseguradora,
    numeroPoliza: e.numeroPoliza,
    radicado: e.radicado,
    fechaEnvioAseguradora: e.fechaEnvioAseguradora?.toISOString() ?? null,
    estado: e.estado,
    ultimoSeguimiento: e.ultimoSeguimiento?.toISOString() ?? null,
    creadoEn: e.creadoEn.toISOString(),
    diasEsperando: diasEsperando(e.fechaEnvioAseguradora, e.estado, hoy),
    diasParaRenovar: diasParaRenovar(e.estado, ficha?.vigenciaHasta ?? null, hoy),
    revision: evaluarRevision(chequeos),
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Endosos"
        descripcion="Solicitudes de endoso ante bancos y leasing. Cada caso se revisa contra lo que hace que el banco lo devuelva, antes de radicarlo ante la aseguradora."
      />
      <EndososTabla endosos={vista} copropiedades={copropiedades.map(aVistaCopropiedad)} />
    </div>
  );
}
