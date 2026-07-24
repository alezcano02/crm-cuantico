# Cuántico CRM — Cartera, vencimientos y metas de producción

Aplicación web CRM/BI para **Cuántico Agencia de Seguros**: seguimiento de
cartera activa, gestión de vencimientos/renovaciones y cumplimiento de metas de
producción, replicando la lógica del informe de producción en Excel.

**Stack:** Next.js 14 (App Router) + TypeScript · Vercel Postgres + Prisma ·
Tailwind CSS · Recharts · xlsx. 100% serverless, lista para Vercel.

## Lógica de negocio (replicada del Excel)

- **Producción del año N** = prima neta de las pólizas de la hoja DATOS cuyo
  **vencimiento cae en N+1** (la vigencia es anual: lo vendido/renovado en 2026
  vence en 2027), agrupada por ramo y por el mes del vencimiento.
- **BASE PARA RENOVAR** de 2026 = hoja BASE 2025 agrupada por su columna MES.
  Para años posteriores, la base es la producción real del año anterior.
- **META (+15%)** = (BASE + PRODUCCIÓN CANCELADA del mes) × 1,15.
- **NUEVOS** = tipos NUEVO, COASEGURO e INCLUSIÓN · **RENOVACIONES** = tipo
  RENOVACION.
- **PRODUCCIÓN CANCELADA** = cancelaciones agrupadas por mes de **FECHA
  RENOVACIÓN** (del año en curso) · **CANCELACIONES** = agrupadas por mes de
  **FECHA CANCELACIÓN**. Son métricas distintas y no se mezclan.
- **PRODUCCIÓN NETA** = REAL − CANCELACIONES · **% CUMPLIMIENTO** = NETA / META.
- **Semáforo de vencimientos:** ROJO = vencida (días negativos) · NARANJA =
  0–15 días · AMARILLO = 15–30 días · VERDE = más de 30 días.
- **DÍAS AL VENCE, MES VENCIMIENTO y EDAD** se recalculan siempre (al importar
  y en cada consulta); nunca se confía en los valores que traiga el Excel.

Las fórmulas fueron verificadas contra la hoja «SEGUIMIENTO 2026» del informe
original (los totales coinciden al centavo).

## Módulos

| Ruta | Módulo |
|---|---|
| `/` | Dashboard: tarjetas, prima por ramo, Meta vs Real vs Neta, canceladas del mes |
| `/seguimiento` | Seguimiento de objetivos por año, consolidado y por ramo, con semáforo de cumplimiento |
| `/vencimientos` | Pendientes de renovar, próximos a vencer (0–30 días), filtros por asesor/ramo/aseguradora, cruce con estado de pago, marca de «renovación gestionada» con nota |
| `/buscar` | Búsqueda por póliza, asegurado o CC/NIT (cartera activa y otras pólizas) |
| `/importar` | Importación del Excel (5 hojas), validación contra LISTAS y resumen de importados/errores/duplicados |

## Estructura esperada del Excel

- **DATOS**, **OTRAS PÓLIZAS** y **CANCELACIONES**: encabezados en la **fila 2**,
  datos desde la fila 3. En DATOS el encabezado de ASEGURADORA (columna G) viene
  en blanco en el archivo real: el mapeo de columnas es posicional.
- **BASE 2025** y **LISTAS**: encabezados en la fila 1.
- La importación **reemplaza** los datos de cada hoja pero conserva las marcas
  de gestión de renovación (por número de póliza + ramo). Los valores fuera de
  LISTAS se importan y se reportan como advertencias.

## Desarrollo local

Requisitos: Node.js 18+ y una base PostgreSQL (local o la misma de Vercel).

```bash
npm install

# Variables de entorno
copy .env.example .env        # y edite las dos cadenas de conexión

# Crear las tablas
npm run db:push

# Datos de ejemplo (para probar sin el Excel real)
npm run db:seed

npm run dev                   # http://localhost:3000
```

> Para desarrollar sin instalar Postgres puede usar la propia base de Vercel
> Postgres: copie sus cadenas de conexión al `.env` local.

## Despliegue en Vercel (con Vercel Postgres)

1. Suba el repositorio a GitHub e impórtelo en [vercel.com/new](https://vercel.com/new)
   (framework autodetectado: Next.js; no requiere configuración extra).
2. En el proyecto de Vercel: **Storage → Create Database → Postgres** (Neon).
   Al conectarla al proyecto, Vercel crea automáticamente las variables
   `POSTGRES_PRISMA_URL` y `POSTGRES_URL_NON_POOLING`, que son exactamente las
   que usa `prisma/schema.prisma`.
3. Cree las tablas contra la base de producción. Desde su máquina, con las
   variables de la base (cópielas de **Storage → .env.local** o use
   `vercel env pull .env`):

   ```bash
   npm run db:push
   npm run db:seed        # opcional: datos de ejemplo
   ```

4. Haga *redeploy* si la primera build ocurrió antes de crear la base.
5. Entre a `/importar` y cargue el informe de producción real (.xlsx): la
   importación reemplaza los datos de ejemplo.

Notas:

- `npm run build` ejecuta `prisma generate` automáticamente (también en
  `postinstall`), así que la build de Vercel no necesita pasos adicionales.
- Todas las páginas son dinámicas (`force-dynamic`): cada visita recalcula
  métricas directamente desde la base de datos.
- La importación corre en una función serverless con `maxDuration = 60`; el
  archivo real (~1.200 pólizas) tarda pocos segundos.

## Modelo de datos (Prisma)

- `Policy` — hoja DATOS (cartera activa) + campos de gestión interna
  (`gestionada`, `notaGestion`).
- `OtherPolicy` — hoja OTRAS PÓLIZAS.
- `Cancellation` — hoja CANCELACIONES (`fechaRenovacion` y `fechaCancelacion`
  separadas).
- `HistoricalPolicy2025` — hoja BASE 2025.
- `ListValue` — hoja LISTAS (`tipo` + `valor`): RAMO, TIPO_NEGOCIO, ESTADO_PAGO,
  FORMA_PAGO, ASEGURADORA, ASESOR.
