import { prisma } from "@/lib/prisma";
import { diasAlVence, semaforoVencimiento } from "@/lib/calculos";
import { fmtCOP, fmtFecha } from "@/lib/format";
import {
  Card,
  CardTitle,
  EstadoPagoBadge,
  PageHeader,
  SemaforoBadge,
  Td,
  Th,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function BuscarPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const q = (searchParams.q ?? "").trim();

  // Los datos del informe vienen en mayúsculas; se buscan las variantes del
  // término para que funcione igual en Postgres y en SQLite (sin `mode`).
  const variantes = Array.from(new Set([q, q.toUpperCase(), q.toLowerCase()]));
  const filtro = q
    ? {
        OR: variantes.flatMap((v) => [
          { numero: { contains: v } },
          { asegurado: { contains: v } },
          { ccNit: { contains: v } },
        ]),
      }
    : undefined;

  const [polizas, otras] = q
    ? await Promise.all([
        prisma.policy.findMany({ where: filtro, take: 100, orderBy: { asegurado: "asc" } }),
        prisma.otherPolicy.findMany({ where: filtro, take: 100, orderBy: { asegurado: "asc" } }),
      ])
    : [[], []];

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Búsqueda de pólizas"
        descripcion="Por número de póliza, nombre de asegurado o CC/NIT"
      />

      <form method="get" className="flex max-w-xl gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Ej: 23847918, BALLARD, 900123456…"
          className="flex-1 rounded-md border border-line-axis bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none"
          autoFocus
        />
        <button
          type="submit"
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          Buscar
        </button>
      </form>

      {q && (
        <>
          <Card>
            <CardTitle>
              Cartera activa · {polizas.length} resultado{polizas.length !== 1 && "s"}
            </CardTitle>
            {polizas.length === 0 ? (
              <p className="text-sm text-ink-muted">Sin coincidencias en la cartera activa.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse whitespace-nowrap">
                  <thead>
                    <tr>
                      <Th>Asegurado</Th>
                      <Th>CC/NIT</Th>
                      <Th>Ramo</Th>
                      <Th>Aseguradora</Th>
                      <Th>Póliza</Th>
                      <Th derecha>Prima neta</Th>
                      <Th derecha>Prima total</Th>
                      <Th>Vencimiento</Th>
                      <Th>Estado</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {polizas.map((p) => {
                      const dias = diasAlVence(p.vencimiento);
                      return (
                        <tr key={p.id} className="hover:bg-surface-page">
                          <Td className="font-medium">{p.asegurado}</Td>
                          <Td>{p.ccNit ?? "—"}</Td>
                          <Td>{p.ramo}</Td>
                          <Td>{p.aseguradora ?? "—"}</Td>
                          <Td>{p.numero}</Td>
                          <Td derecha>{fmtCOP(p.primaNeta)}</Td>
                          <Td derecha>{fmtCOP(p.primaTotal)}</Td>
                          <Td>
                            <div className="flex items-center gap-2">
                              {fmtFecha(p.vencimiento)}
                              <SemaforoBadge nivel={semaforoVencimiento(dias)} dias={dias} />
                            </div>
                          </Td>
                          <Td>
                            <EstadoPagoBadge estado={p.estadoPago} />
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardTitle>
              Otras pólizas · {otras.length} resultado{otras.length !== 1 && "s"}
            </CardTitle>
            {otras.length === 0 ? (
              <p className="text-sm text-ink-muted">Sin coincidencias en otras pólizas.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse whitespace-nowrap">
                  <thead>
                    <tr>
                      <Th>Asegurado</Th>
                      <Th>CC/NIT</Th>
                      <Th>Ramo</Th>
                      <Th>Póliza</Th>
                      <Th derecha>Prima neta</Th>
                      <Th derecha>Prima total</Th>
                      <Th>Vencimiento</Th>
                      <Th>Estado</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {otras.map((p) => (
                      <tr key={p.id} className="hover:bg-surface-page">
                        <Td className="font-medium">{p.asegurado}</Td>
                        <Td>{p.ccNit ?? "—"}</Td>
                        <Td>{p.ramo}</Td>
                        <Td>{p.numero}</Td>
                        <Td derecha>{fmtCOP(p.primaNeta)}</Td>
                        <Td derecha>{fmtCOP(p.primaTotal)}</Td>
                        <Td>{fmtFecha(p.vencimiento)}</Td>
                        <Td>
                          <EstadoPagoBadge estado={p.estadoPago} />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
