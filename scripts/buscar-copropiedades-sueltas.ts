/**
 * Busca en la cartera las copropiedades que tienen endosos pero todavía no
 * tienen ficha.
 *
 * El cruce automático de `vincular-copropiedades.ts` es deliberadamente
 * estricto —exige que todas las palabras del nombre corto aparezcan en el de la
 * póliza— porque un cruce equivocado le pone a un edificio la vigencia de otro
 * y el aviso de renovación empieza a mentir sin que nadie lo note.
 *
 * Lo que queda fuera son los nombres que no se parecen palabra por palabra:
 * erratas («Portal» por «Portón»), singulares y plurales, nombres pegados
 * («Cantapiedra»), o el nombre corto de la calle. Este script no decide: SOLO
 * PROPONE candidatos ordenados por parecido, para mirarlos y confirmarlos a
 * mano.
 *
 * Uso: npx tsx scripts/buscar-copropiedades-sueltas.ts
 */
import { prisma } from "../lib/prisma";
import { normalizar } from "../lib/endosos";

const RELLENO = [
  "conjunto residencial",
  "unidad residencial",
  "conjunto multifamiliar",
  "multifamiliar",
  "urbanizacion",
  "condominio",
  "ciudadela",
  "proyecto",
  "conjunto",
  "edificio",
  "propiedad horizontal",
  "residencial",
  "p h",
  "ph",
  "etapa",
  "torres",
  "torre",
  "urb",
];

function nucleo(nombre: string): string {
  let n = normalizar(nombre);
  for (const r of RELLENO) n = n.replace(new RegExp(`\\b${r}\\b`, "g"), " ");
  return n.replace(/\s+/g, " ").trim();
}

/** Bigramas de letras, para medir parecido aunque el nombre esté mal escrito. */
function bigramas(s: string): Set<string> {
  const t = s.replace(/\s/g, "");
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

/** Índice de Sørensen–Dice: 1 = idénticos, 0 = nada en común. */
function parecido(a: string, b: string): number {
  const A = bigramas(a);
  const B = bigramas(b);
  if (!A.size || !B.size) return 0;
  let comunes = 0;
  for (const x of A) if (B.has(x)) comunes++;
  return (2 * comunes) / (A.size + B.size);
}

async function main() {
  const conFicha = new Set(
    (await prisma.copropiedad.findMany({ select: { nombre: true } })).map((c) =>
      normalizar(c.nombre)
    )
  );

  const sueltas = (
    await prisma.endoso.groupBy({
      by: ["urbanizacion"],
      where: { copropiedadId: null },
      _count: { _all: true },
      orderBy: { _count: { urbanizacion: "desc" } },
    })
  ).filter((u) => !conFicha.has(normalizar(u.urbanizacion)));

  const polizas = await prisma.policy.findMany({
    where: { vencimiento: { not: null } },
    select: {
      numero: true,
      asegurado: true,
      ccNit: true,
      aseguradora: true,
      ramo: true,
      vencimiento: true,
    },
  });

  // Una misma copropiedad puede tener varias filas en la cartera (varias
  // etapas, varios ramos). Se queda la de vencimiento más lejano por asegurado.
  const porAsegurado = new Map<string, (typeof polizas)[number]>();
  for (const p of polizas) {
    const k = normalizar(p.asegurado);
    const previa = porAsegurado.get(k);
    if (!previa || (p.vencimiento?.getTime() ?? 0) > (previa.vencimiento?.getTime() ?? 0)) {
      porAsegurado.set(k, p);
    }
  }
  const indice = [...porAsegurado.values()].map((p) => ({ ...p, clave: nucleo(p.asegurado) }));

  console.log(`Copropiedades con endosos y sin ficha: ${sueltas.length}\n`);

  for (const u of sueltas) {
    const clave = nucleo(u.urbanizacion);
    const candidatos = indice
      .map((p) => ({ p, punt: parecido(clave, p.clave) }))
      .filter((x) => x.punt > 0.35)
      .sort((a, b) => b.punt - a.punt)
      .slice(0, 4);

    console.log(`── ${u.urbanizacion}  (${u._count._all} endosos)  [núcleo: "${clave}"]`);
    if (!candidatos.length) {
      console.log("     sin candidatos parecidos en la cartera");
    }
    for (const c of candidatos) {
      const v = c.p.vencimiento;
      console.log(
        `     ${(c.punt * 100).toFixed(0).padStart(3)}%  ${c.p.asegurado} · ${
          c.p.aseguradora ?? "—"
        } · ${c.p.ramo} · pól. ${c.p.numero} · vence ${v ? v.toISOString().slice(0, 10) : "—"}`
      );
    }
    console.log("");
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
