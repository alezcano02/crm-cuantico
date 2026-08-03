import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hoyUTC } from "@/lib/calculos";
import { calcularCumpleanos, ClienteCumple } from "@/lib/cumpleanos";
import { Card, EstadoVacio, PageHeader } from "@/components/ui";
import { CumpleanosTabla, CumpleVista } from "@/components/cumpleanos-tabla";
import { exigirSesionPagina } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function CumpleanosPage() {
  // Antes de tocar la base: el layout no alcanza a cortar el render.
  await exigirSesionPagina();

  const hoy = hoyUTC();

  // Se juntan la cartera y las otras pólizas: un cliente puede tener varias,
  // pero se felicita una sola vez, así que se agrupa por persona.
  const [polizas, otras] = await Promise.all([
    prisma.policy.findMany({
      where: { fechaNacimiento: { not: null } },
      select: {
        asegurado: true,
        ccNit: true,
        celular: true,
        correo: true,
        asesor1: true,
        asesor2: true,
        ramo: true,
        fechaNacimiento: true,
      },
    }),
    prisma.otherPolicy.findMany({
      where: { fechaNacimiento: { not: null } },
      select: {
        asegurado: true,
        ccNit: true,
        celular: true,
        correo: true,
        asesor1: true,
        asesor2: true,
        ramo: true,
        fechaNacimiento: true,
      },
    }),
  ]);

  const porCliente = new Map<string, ClienteCumple>();
  for (const p of [...polizas, ...otras]) {
    if (!p.fechaNacimiento) continue;
    const clave = p.asegurado.trim().toUpperCase();
    const existente = porCliente.get(clave);
    if (existente) {
      // Se completan los datos que falten y se acumulan los ramos
      if (!existente.celular && p.celular) existente.celular = p.celular;
      if (!existente.correo && p.correo) existente.correo = p.correo;
      if (!existente.ramos.includes(p.ramo)) existente.ramos.push(p.ramo);
      continue;
    }
    porCliente.set(clave, {
      asegurado: p.asegurado.trim(),
      fechaNacimiento: p.fechaNacimiento,
      ccNit: p.ccNit,
      celular: p.celular,
      correo: p.correo,
      // El asesor 2 suele ser la persona que atiende; si no está, el 1.
      asesor: p.asesor2?.trim() || p.asesor1?.trim() || null,
      ramos: [p.ramo],
    });
  }

  const cumpleanos = calcularCumpleanos([...porCliente.values()], hoy);

  const vista: CumpleVista[] = cumpleanos.map((c) => ({
    asegurado: c.asegurado,
    ccNit: c.ccNit,
    celular: c.celular,
    correo: c.correo,
    asesor: c.asesor,
    ramos: c.ramos,
    nacimiento: c.fechaNacimiento.toISOString(),
    proximo: c.proximo.toISOString(),
    dias: c.dias,
    edad: c.edad,
    mes: c.mes,
    esPersona: c.esPersona,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Cumpleaños de clientes"
        descripcion={`${vista.length} clientes con fecha de nacimiento registrada · un detalle que fideliza`}
      />

      {vista.length === 0 ? (
        <Card>
          <EstadoVacio
            titulo="Ningún cliente tiene fecha de nacimiento"
            descripcion="La columna FECHA NACIMIENTO del informe está vacía. Al diligenciarla en el Excel e importarlo, aquí aparecerán los cumpleaños."
            accion={
              <Link
                href="/importar"
                className="inline-flex items-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
              >
                Importar datos
              </Link>
            }
          />
        </Card>
      ) : (
        <CumpleanosTabla clientes={vista} mesActual={hoy.getUTCMonth()} />
      )}
    </div>
  );
}
