/**
 * Endosos: la revisión que evita el reproceso.
 *
 * Un endoso se devuelve con muchísima frecuencia —227 reprocesos entre abril y
 * agosto de 2026 sobre 2.163 correos, 118 solo en julio— y cuando vuelve hay
 * que rehacerlo entero: llenar otra vez el formato, volver a pedírselo a la
 * aseguradora, esperar otros 15 días hábiles y reenviárselo al cliente.
 *
 * Lo que hace que valga la pena automatizar esto es que las causas se repiten.
 * De los casos reales del buzón:
 *
 *  · Nicole Forbes (Marsella 1808): faltaba la ciudad en la dirección y el
 *    beneficiario decía «Davivienda» cuando el banco era DAVIbank, que es otra
 *    entidad con otro NIT.
 *  · Julio César García (Paseo del Parque 0810): era leasing, y el banco tenía
 *    que figurar como propietario con los locatarios aparte.
 *  · Luz Delia Arroyave (Sendero Verde 427): torre equivocada, valor
 *    equivocado y un paz y salvo que no decía «cancelado».
 *  · Paola Ramírez (Majagua 1145): pidió el endoso por $61.524. Ningún caso
 *    real baja de $70 millones: le faltaban dígitos.
 *
 * Todas eran verificables ANTES de enviar. Eso es lo que hace `revisarEndoso`.
 *
 * La función es pura —no toca la base de datos ni el navegador— para poder
 * ejecutarla igual en el servidor al guardar y en el formulario mientras se
 * escribe, y para poder probarla sin montar nada.
 */

export const ESTADOS_ENDOSO = [
  "NUEVA_SOLICITUD",
  "DATOS_INCOMPLETOS",
  "RADICADO",
  "REPROCESO",
  "ENVIADO_CLIENTE",
  "CERRADO",
] as const;
export type EstadoEndoso = (typeof ESTADOS_ENDOSO)[number];

export const ETIQUETA_ESTADO_ENDOSO: Record<EstadoEndoso, string> = {
  NUEVA_SOLICITUD: "Nueva solicitud",
  DATOS_INCOMPLETOS: "Datos incompletos",
  RADICADO: "Radicado ante aseguradora",
  REPROCESO: "Reproceso",
  ENVIADO_CLIENTE: "Enviado al cliente",
  CERRADO: "Cerrado",
};

/** Estados en los que el caso sigue vivo y consume atención. */
export const ESTADOS_ABIERTOS: EstadoEndoso[] = [
  "NUEVA_SOLICITUD",
  "DATOS_INCOMPLETOS",
  "RADICADO",
  "REPROCESO",
];

export const TIPOS_CREDITO = ["HIPOTECARIO", "LEASING"] as const;

/**
 * Aseguradoras conocidas, con su escritura canónica.
 *
 * Antes de esto el campo era texto libre y cada quien lo escribía distinto:
 * «Axa Colpatria», «axa Colpatria», «AXA COLPATRIA» contaban como tres
 * aseguradoras diferentes en los filtros. Sale de las que de verdad aparecen
 * en la cartera y en el histórico de endosos — «Escritorio Virtual SBS» se
 * deja aparte porque es un canal de radicación distinto de SBS, no una
 * aseguradora distinta, y así lo maneja la propia agencia.
 */
export const ASEGURADORAS = [
  "SURA",
  "MUNDIAL",
  "Axa Colpatria",
  "Previsora",
  "Allianz",
  "Seguros del Estado",
  "HDI",
  "Zurich",
  "SBS",
  "Escritorio Virtual SBS",
  "Mapfre",
  "Solidaria",
  "BBVA Seguros",
  "Bolívar",
  "Equidad",
  "Quálitas",
] as const;

/** Encuentra la escritura canónica de una aseguradora por su nombre. */
export function normalizarAseguradora(nombre: string | null | undefined): string | null {
  const n = normalizar(nombre);
  if (!n) return null;
  const encontrada = ASEGURADORAS.find((a) => normalizar(a) === n);
  return encontrada ?? (nombre ? nombre.trim() : null);
}

/**
 * Aseguradoras para las que ya existe un generador de formato de solicitud
 * (lib/formatos-aseguradora.ts). Vive aquí y no allá porque ese módulo lee
 * archivos de disco (fs/path) y no se puede importar desde un componente de
 * cliente; esta función sí, y es lo único que la interfaz necesita para
 * decidir si mostrar el botón de descarga.
 */
export type ClaveAseguradoraFormato = "AXA_COLPATRIA" | "ZURICH" | "PREVISORA" | "SBS";

/**
 * Cuántos casos caben en una planilla. Las plantillas se preparan con sitio
 * para estos (ver scripts/preparar-plantillas-aseguradora.ts) y la interfaz lo
 * avisa antes de pulsar, no después de un error.
 */
export const CASOS_POR_ARCHIVO = 60;

export function claveFormatoPorAseguradora(aseguradora: string | null | undefined): ClaveAseguradoraFormato | null {
  switch (aseguradora) {
    case "Axa Colpatria":
      return "AXA_COLPATRIA";
    case "Zurich":
      return "ZURICH";
    case "Previsora":
      return "PREVISORA";
    case "SBS":
    case "Escritorio Virtual SBS":
      return "SBS";
    default:
      return null;
  }
}

/**
 * Días que la aseguradora puede tardar antes de que el caso se considere
 * represado. Es el mismo umbral de la columna ALERTA del Excel actual.
 */
export const DIAS_ALERTA_ASEGURADORA = 5;

/**
 * Con cuánta antelación se avisa de que a un endoso le toca renovarse.
 *
 * El endoso no es un trámite de una sola vez: vive lo que viva la póliza de
 * áreas comunes del edificio, y cuando esa se renueva hay que rehacerlo. Lo
 * dice el propio banco en sus correos: «en todos los casos la renovación del
 * endoso deberá entregarse al vencimiento de la póliza».
 *
 * Dos meses es lo que hace falta de verdad: la agencia anuncia hasta 15 días
 * hábiles de trámite (unas tres semanas) después de 5 de recepción, y encima
 * las aseguradoras restringen la emisión en las semanas previas a renovar. Con
 * menos margen se llega tarde.
 */
export const DIAS_AVISO_RENOVACION = 60;

// ---------------------------------------------------------------------------
// Entidades financieras
// ---------------------------------------------------------------------------

/**
 * Beneficiarios con su NIT oficial.
 *
 * Sale de la hoja «ENTIDADES FINANCIERAS» del formato de SBS, que trae la lista
 * completa que usa la aseguradora. Aquí quedan las que de verdad aparecen en
 * endosos; para cualquier otra el campo admite texto libre.
 *
 * OJO con el par Davivienda / DAVIbank: son entidades DISTINTAS con nombres
 * casi iguales. DAVIbank es el antiguo Scotiabank Colpatria y comparte su NIT.
 * Confundirlas es exactamente lo que devolvió el endoso de Nicole Forbes.
 */
export interface Banco {
  nombre: string;
  nit: string;
  /** Otros nombres con los que la gente lo escribe en los correos. */
  alias?: string[];
}

export const BANCOS: Banco[] = [
  { nombre: "BANCOLOMBIA S.A.", nit: "890903938-8", alias: ["bancolombia"] },
  { nombre: "BANCO DE BOGOTÁ S.A.", nit: "860002964-4", alias: ["banco de bogota", "bogota"] },
  {
    nombre: "BANCO DAVIVIENDA S.A.",
    nit: "860034313-7",
    alias: ["davivienda"],
  },
  {
    nombre: "DAVIbank S.A. (antes Scotiabank Colpatria)",
    nit: "860034594-1",
    alias: ["davibank", "scotiabank", "colpatria", "scotiabank colpatria"],
  },
  { nombre: "BBVA COLOMBIA S.A.", nit: "860003020-1", alias: ["bbva"] },
  { nombre: "BANCO CAJA SOCIAL S.A.", nit: "860007335-4", alias: ["caja social"] },
  { nombre: "BANCO DE OCCIDENTE S.A.", nit: "890300279-4", alias: ["occidente"] },
  { nombre: "BANCO POPULAR S.A.", nit: "860007738-9", alias: ["popular"] },
  {
    nombre: "BANCO COMERCIAL AV VILLAS S.A.",
    nit: "860035827-5",
    alias: ["av villas", "avvillas"],
  },
  { nombre: "ITAÚ CORPBANCA COLOMBIA S.A.", nit: "890903937-0", alias: ["itau", "corpbanca"] },
  { nombre: "BANCO GNB SUDAMERIS S.A.", nit: "860050750-1", alias: ["gnb", "sudameris"] },
  { nombre: "BANCOOMEVA", nit: "900406150-5", alias: ["coomeva"] },
  { nombre: "BANCO PICHINCHA S.A.", nit: "890200756-7", alias: ["pichincha"] },
  { nombre: "BANCO W S.A.", nit: "900378212-2", alias: ["banco w"] },
  { nombre: "BANCO FINANDINA S.A.", nit: "860051894-6", alias: ["finandina"] },
  {
    nombre: "COTRAFA COOPERATIVA FINANCIERA",
    nit: "890901176-3",
    alias: ["cotrafa"],
  },
  { nombre: "LEASING BANCOLOMBIA S.A.", nit: "860059294-3", alias: ["leasing bancolombia"] },
  { nombre: "LEASING BOGOTÁ", nit: "860500996-6", alias: ["leasing bogota"] },
  { nombre: "LEASING BOLÍVAR S.A.", nit: "860067203-7", alias: ["leasing bolivar"] },
  { nombre: "SULEASING", nit: "890927705-2", alias: ["suleasing", "sufi"] },
  {
    nombre: "FONDO NACIONAL DEL AHORRO",
    nit: "899999284-4",
    alias: ["fna", "fondo nacional del ahorro"],
  },
];

/**
 * Exigencias propias de cada entidad.
 *
 * Hoy esto vive en la firma automática del correo de endosos y en la cabeza de
 * Juan. Es conocimiento que se pierde el día que él no esté.
 */
export interface ReglaBanco {
  /** Se compara contra el nombre normalizado del banco. */
  coincide: string[];
  gravedad: Resultado;
  /**
   * Por omisión «riesgo»: es algo que hay que resolver antes de radicar. Con
   * «nota» solo hay que acordarse más tarde, y no ensucia el semáforo del
   * caso —si no, todo endoso de Bancolombia viviría en ámbar para siempre.
   */
  categoria?: CategoriaChequeo;
  mensaje: string;
}

export const REGLAS_BANCO: ReglaBanco[] = [
  {
    coincide: ["fondo nacional del ahorro", "fna"],
    gravedad: "bloqueo",
    mensaje:
      "El Fondo Nacional del Ahorro NO recibe endosos de aseguradoras externas: exige deducible al 0%. El trámite no va a prosperar.",
  },
  {
    coincide: ["bbva"],
    gravedad: "aviso",
    mensaje:
      'BBVA solo acepta el endoso si el paz y salvo dice textualmente "Pagado en su Totalidad". La copropiedad debe haber cancelado el 100% de la póliza.',
  },
  {
    coincide: ["davivienda"],
    gravedad: "aviso",
    mensaje:
      'Davivienda solo acepta el endoso si el paz y salvo dice textualmente "Pagado en su Totalidad". La copropiedad debe haber cancelado el 100% de la póliza.',
  },
  {
    coincide: ["bancolombia"],
    gravedad: "aviso",
    // Es para el final del trámite, no para radicar: no debe teñir el
    // semáforo del caso, o todo endoso de Bancolombia —que son muchos—
    // viviría en ámbar sin que nadie tenga nada que arreglar.
    categoria: "nota",
    mensaje:
      "Bancolombia exige que el cliente descargue el formulario de su web, lo firme y cargue 4 documentos en el portal: póliza, clausulado, paz y salvo y endoso. Hay que recordárselo al enviarle los documentos.",
  },
];

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Minúsculas, sin acentos y sin dobles espacios, para poder comparar nombres. */
export function normalizar(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Deja el NIT en dígitos pelados: «890.903.938-8» y «8909039388» son lo mismo. */
export function soloDigitos(nit: string | null | undefined): string {
  return (nit ?? "").replace(/\D/g, "");
}

/** Busca la entidad por nombre o alias. Devuelve null si no la reconoce. */
export function buscarBanco(nombre: string | null | undefined): Banco | null {
  const n = normalizar(nombre);
  if (!n) return null;
  for (const b of BANCOS) {
    if (normalizar(b.nombre) === n) return b;
    if (b.alias?.some((a) => normalizar(a) === n)) return b;
  }
  // Coincidencia parcial: «Banco Davivienda S.A» contra el alias «davivienda».
  for (const b of BANCOS) {
    if (b.alias?.some((a) => n.includes(normalizar(a)))) return b;
  }
  return null;
}

function aFecha(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = typeof v === "string" ? new Date(v) : v;
  return isNaN(d.getTime()) ? null : d;
}

function dias(desde: Date, hasta: Date): number {
  return Math.round((hasta.getTime() - desde.getTime()) / 86400000);
}

// ---------------------------------------------------------------------------
// La revisión
// ---------------------------------------------------------------------------

export type Resultado = "ok" | "aviso" | "bloqueo";

/**
 * De qué tipo es lo que encontró la revisión. Separarlas es lo que hace que
 * la revisión sirva de algo:
 *
 *  · «falta» — todavía no se puede juzgar porque el dato no está. Casi todos
 *    los casos que vienen del Excel «Día a Día» están así: esa hoja no tenía
 *    columnas para cédula, dirección, valor ni coeficiente, así que esos datos
 *    solo existían dentro del correo.
 *  · «riesgo» — el dato SÍ está, y es de los que hacen que el banco devuelva.
 *  · «nota» — no afecta a si se puede radicar; hay que acordarse más tarde,
 *    al entregarle los documentos al cliente.
 *
 * Mezclarlas fue el error de la primera versión: 39 de los 40 casos abiertos
 * salían en rojo por datos que faltaban, y un rojo que sale siempre se deja de
 * mirar. Los pocos problemas de verdad quedaban enterrados en el ruido.
 */
export type CategoriaChequeo = "falta" | "riesgo" | "nota";

/** Campo del formulario que resuelve un punto de la revisión. */
export type CampoEndoso =
  | "urbanizacion"
  | "direccion"
  | "ciudad"
  | "torre"
  | "apartamento"
  | "cuartoUtil"
  | "parqueadero"
  | "banco"
  | "bancoNit"
  | "tipoCredito"
  | "valorSolicitado"
  | "coeficiente"
  | "correoSolicitante";

export interface Chequeo {
  /** Nombre corto de lo que se revisó, para la interfaz. */
  regla: string;
  resultado: Resultado;
  categoria: CategoriaChequeo;
  mensaje: string;
  /**
   * Campo que resolvería este punto. La interfaz lo usa para llevar directo
   * al recuadro que hay que llenar, en vez de obligar a buscarlo.
   */
  campo?: CampoEndoso;
}

/** Lo mínimo que necesita la revisión de un endoso. */
export interface DatosEndoso {
  cliente?: string | null;
  cliente2?: string | null;
  cedula?: string | null;
  correoSolicitante?: string | null;
  direccion?: string | null;
  ciudad?: string | null;
  torre?: string | null;
  apartamento?: string | null;
  cuartoUtil?: string | null;
  parqueadero?: string | null;
  coeficiente?: number | null;
  valorSolicitado?: number | null;
  banco?: string | null;
  bancoNit?: string | null;
  tipoCredito?: string | null;
}

/** Lo mínimo que necesita la revisión de la copropiedad. */
export interface DatosCopropiedad {
  nombre?: string | null;
  valorAseguradoTotal?: number | null;
  vigenciaHasta?: Date | string | null;
  pazSalvoVigenteHasta?: Date | string | null;
  pazSalvoEstado?: string | null;
  admiteEndosos?: boolean | null;
  motivoBloqueo?: string | null;
}

/**
 * Valor mínimo que se considera creíble para un endoso.
 *
 * El caso real más bajo del buzón ronda los $70 millones. Por debajo de diez
 * es casi seguro que al cliente se le fueron dígitos al escribir, como los
 * $61.524 de Majagua 1145.
 */
const VALOR_MINIMO_CREIBLE = 10_000_000;

/**
 * Revisa un endoso contra todo lo que sabemos que hace que lo devuelvan.
 *
 * Devuelve la lista completa —también lo que está bien— porque la interfaz
 * enseña la revisión entera: ver ocho verdes tranquiliza tanto como ver un
 * rojo alerta. Nada de esto impide guardar ni enviar: avisa, no bloquea.
 */
export function revisarEndoso(
  endoso: DatosEndoso,
  copropiedad: DatosCopropiedad | null,
  hoy: Date = new Date()
): Chequeo[] {
  const out: Chequeo[] = [];
  const add = (
    regla: string,
    resultado: Resultado,
    categoria: CategoriaChequeo,
    mensaje: string,
    campo?: CampoEndoso
  ) => out.push({ regla, resultado, categoria, mensaje, campo });

  // --- Dirección -----------------------------------------------------------
  // Es la causa nº 1 de devolución, y lo dice el propio formulario de la
  // agencia: «este es el ítem por el que devuelven mayor cantidad de endosos».
  const faltan: { texto: string; campo: CampoEndoso }[] = [];
  if (!endoso.direccion?.trim()) faltan.push({ texto: "la nomenclatura", campo: "direccion" });
  if (!endoso.ciudad?.trim()) faltan.push({ texto: "la ciudad", campo: "ciudad" });
  if (!endoso.apartamento?.trim())
    faltan.push({ texto: "el número de apartamento", campo: "apartamento" });
  if (faltan.length) {
    add(
      "Dirección completa",
      "bloqueo",
      "falta",
      `Falta ${faltan.map((f) => f.texto).join(", ")}. La dirección debe quedar exactamente como figura en el crédito del banco; es lo que más devoluciones causa.`,
      faltan[0].campo
    );
  } else {
    const sinDetalle: { texto: string; campo: CampoEndoso }[] = [];
    if (!endoso.torre?.trim()) sinDetalle.push({ texto: "torre/etapa", campo: "torre" });
    if (!endoso.cuartoUtil?.trim()) sinDetalle.push({ texto: "cuarto útil", campo: "cuartoUtil" });
    if (!endoso.parqueadero?.trim())
      sinDetalle.push({ texto: "parqueadero", campo: "parqueadero" });
    if (sinDetalle.length) {
      add(
        "Dirección completa",
        "aviso",
        "falta",
        `Sin ${sinDetalle.map((s) => s.texto).join(", ")}. Si el inmueble no tiene, se escribe "No aplica"; dejarlo en blanco hace dudar al banco.`,
        sinDetalle[0].campo
      );
    } else {
      add(
        "Dirección completa",
        "ok",
        "falta",
        "Nomenclatura, ciudad, torre, apartamento, cuarto útil y parqueadero."
      );
    }
  }

  // --- Beneficiario y NIT --------------------------------------------------
  const banco = buscarBanco(endoso.banco);
  if (!endoso.banco?.trim()) {
    add("Banco y NIT", "bloqueo", "falta", "Falta el banco beneficiario del endoso.", "banco");
  } else if (!banco) {
    add(
      "Banco y NIT",
      "aviso",
      "riesgo",
      `"${endoso.banco}" no está en la lista de entidades conocidas. Verifica el nombre y el NIT con el cliente antes de radicar.`,
      "banco"
    );
  } else {
    const dado = soloDigitos(endoso.bancoNit);
    const oficial = soloDigitos(banco.nit);
    const base = oficial.slice(0, -1); // NIT sin dígito de verificación
    if (!dado) {
      add(
        "Banco y NIT",
        "aviso",
        "falta",
        `Falta el NIT. El de ${banco.nombre} es ${banco.nit}.`,
        "bancoNit"
      );
    } else if (dado === oficial) {
      add("Banco y NIT", "ok", "riesgo", `${banco.nombre} · NIT ${banco.nit}.`);
    } else if (dado === base) {
      add(
        "Banco y NIT",
        "aviso",
        "riesgo",
        `Al NIT le falta el dígito de verificación: debe ser ${banco.nit}.`,
        "bancoNit"
      );
    } else {
      add(
        "Banco y NIT",
        "bloqueo",
        "riesgo",
        `El NIT no corresponde. Para ${banco.nombre} es ${banco.nit}, no ${endoso.bancoNit}.`,
        "bancoNit"
      );
    }

    // Davivienda y DAVIbank son entidades distintas con nombres casi iguales.
    // Es un error real y caro: devolvió el endoso de Marsella 1808.
    const n = normalizar(endoso.banco);
    if (n.includes("davi") && !n.includes("davibank") && !n.includes("davivienda")) {
      add(
        "Davivienda vs. DAVIbank",
        "bloqueo",
        "riesgo",
        'Escribiste solo "Davi". Son dos entidades distintas: DAVIVIENDA (NIT 860034313-7) y DAVIbank, el antiguo Scotiabank Colpatria (NIT 860034594-1). Confírmalo con el cliente.',
        "banco"
      );
    }
  }

  // --- Manías del banco ----------------------------------------------------
  const nBanco = normalizar(endoso.banco);
  const reglas = REGLAS_BANCO.filter((r) => r.coincide.some((c) => nBanco.includes(normalizar(c))));
  for (const r of reglas)
    add("Requisitos del banco", r.gravedad, r.categoria ?? "riesgo", r.mensaje);

  // --- Leasing -------------------------------------------------------------
  if (!endoso.tipoCredito) {
    add(
      "Tipo de crédito",
      "aviso",
      "falta",
      "Sin definir si es hipotecario o leasing. En leasing el banco va como PROPIETARIO y el cliente como locatario, y el formato cambia.",
      "tipoCredito"
    );
  } else if (endoso.tipoCredito === "LEASING") {
    add(
      "Leasing",
      "aviso",
      "riesgo",
      `En leasing habitacional el endoso debe mostrar a ${endoso.banco ?? "el banco"} como PROPIETARIO y a ${
        endoso.cliente2 ? "los locatarios" : "el locatario"
      } aparte. Verifica que el formato lo refleje así.`
    );
  } else {
    add("Tipo de crédito", "ok", "falta", "Crédito hipotecario.");
  }

  // --- Valor razonable -----------------------------------------------------
  if (endoso.valorSolicitado == null) {
    add(
      "Valor solicitado",
      "bloqueo",
      "falta",
      "Falta el valor que exige el banco para el endoso.",
      "valorSolicitado"
    );
  } else if (endoso.valorSolicitado < VALOR_MINIMO_CREIBLE) {
    add(
      "Valor solicitado",
      "bloqueo",
      "riesgo",
      `$${endoso.valorSolicitado.toLocaleString("es-CO")} es demasiado bajo para un inmueble. Lo más probable es que falten dígitos: confírmalo con el cliente antes de radicar.`,
      "valorSolicitado"
    );
  } else {
    add("Valor solicitado", "ok", "riesgo", `$${endoso.valorSolicitado.toLocaleString("es-CO")}.`);
  }

  // --- Correo del solicitante ---------------------------------------------
  if (!endoso.correoSolicitante?.trim()) {
    add(
      "Correo del cliente",
      "aviso",
      "falta",
      "Sin correo no hay a dónde enviarle el endoso cuando llegue.",
      "correoSolicitante"
    );
  }

  // --- Todo lo que depende de la ficha del edificio ------------------------
  if (!copropiedad) {
    add(
      "Ficha de la copropiedad",
      "aviso",
      "falta",
      "Este endoso no está enlazado a una copropiedad, así que no se puede verificar la vigencia de la póliza, el paz y salvo ni el coeficiente. Crea o enlaza la ficha del edificio.",
      "urbanizacion"
    );
    return out;
  }

  // Estado general del edificio.
  if (copropiedad.admiteEndosos === false) {
    add(
      "Copropiedad habilitada",
      "bloqueo",
      "riesgo",
      copropiedad.motivoBloqueo?.trim()
        ? `No se pueden enviar endosos de este edificio: ${copropiedad.motivoBloqueo}`
        : "Esta copropiedad está marcada como que no admite endosos por ahora."
    );
  } else {
    add("Copropiedad habilitada", "ok", "riesgo", "El edificio admite endosos.");
  }

  // Vigencia de la póliza de áreas comunes.
  const vig = aFecha(copropiedad.vigenciaHasta);
  if (!vig) {
    add(
      "Póliza vigente",
      "aviso",
      "falta",
      "La ficha del edificio no dice hasta cuándo va la póliza."
    );
  } else {
    const d = dias(hoy, vig);
    if (d < 0) {
      add(
        "Póliza vigente",
        "bloqueo",
        "riesgo",
        `La póliza del edificio venció hace ${-d} días. Mientras esté en renovación la aseguradora no emite endosos.`
      );
    } else if (d <= 30) {
      add(
        "Póliza vigente",
        "aviso",
        "riesgo",
        `La póliza vence en ${d} días. En el periodo previo a la renovación las aseguradoras suelen restringir la emisión de endosos: conviene radicar ya o esperar a la nueva vigencia.`
      );
    } else {
      add("Póliza vigente", "ok", "riesgo", `Vigente ${d} días más.`);
    }
  }

  // Paz y salvo.
  const estadoPyS = normalizar(copropiedad.pazSalvoEstado);
  const pys = aFecha(copropiedad.pazSalvoVigenteHasta);
  if (estadoPyS.includes("vencido") || estadoPyS.includes("sin paz")) {
    add(
      "Paz y salvo",
      "bloqueo",
      "riesgo",
      "El paz y salvo de la copropiedad no está al día. Sin certificado de pago la aseguradora no emite el endoso."
    );
  } else if (!pys) {
    add(
      "Paz y salvo",
      "aviso",
      "falta",
      "La ficha del edificio no dice hasta cuándo vale el paz y salvo."
    );
  } else {
    const d = dias(hoy, pys);
    if (d < 0) {
      add(
        "Paz y salvo",
        "bloqueo",
        "riesgo",
        `El paz y salvo venció hace ${-d} días. Hay que pedir uno actualizado antes de radicar.`
      );
    } else if (d <= 15) {
      add(
        "Paz y salvo",
        "aviso",
        "riesgo",
        `El paz y salvo vence en ${d} días. Conviene renovarlo ya.`
      );
    } else {
      add("Paz y salvo", "ok", "riesgo", `Al día, vence en ${d} días.`);
    }
  }

  // --- Valor contra el coeficiente ----------------------------------------
  const total = copropiedad.valorAseguradoTotal ?? null;
  const coef = endoso.coeficiente ?? null;
  if (total == null || coef == null || endoso.valorSolicitado == null) {
    const falta: string[] = [];
    let campo: CampoEndoso | undefined;
    if (total == null) falta.push("el valor asegurado del edificio (ficha de la copropiedad)");
    if (coef == null) {
      falta.push("el coeficiente del apartamento");
      campo = "coeficiente";
    }
    if (endoso.valorSolicitado == null) {
      falta.push("el valor que pide el banco");
      campo = campo ?? "valorSolicitado";
    }
    add(
      "Valor vs. coeficiente",
      "aviso",
      "falta",
      `No se puede verificar: falta ${falta.join(" y ")}.`,
      campo
    );
  } else {
    const corresponde = total * (coef / 100);
    const limite20 = corresponde * 1.2;
    const limite40 = corresponde * 1.4;
    const cop = (v: number) => `$${Math.round(v).toLocaleString("es-CO")}`;
    if (endoso.valorSolicitado <= limite20) {
      add(
        "Valor vs. coeficiente",
        "ok",
        "riesgo",
        `Cabe. Al apartamento le corresponden ${cop(corresponde)} (${coef}% de ${cop(total)}); con el 20% admitido el tope es ${cop(limite20)}.`
      );
    } else if (endoso.valorSolicitado <= limite40) {
      add(
        "Valor vs. coeficiente",
        "aviso",
        "riesgo",
        `Se pasa del primer filtro (${cop(limite20)}) pero cabe en el segundo, al 40% (${cop(limite40)}). La aseguradora puede pedir justificación.`
      );
    } else {
      add(
        "Valor vs. coeficiente",
        "bloqueo",
        "riesgo",
        `Se pasa. Al apartamento le corresponden ${cop(corresponde)} y ni con el 40% adicional (${cop(limite40)}) alcanza para los ${cop(endoso.valorSolicitado)} que pide el banco. Hay que cobrar prima adicional o ajustar el valor.`,
        "valorSolicitado"
      );
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// El resumen de la revisión
// ---------------------------------------------------------------------------

/**
 * En qué situación está el caso, en una sola palabra.
 *
 * El orden importa: un problema real tapa a un dato que falta, porque el dato
 * se completa en un minuto y el problema es el que cuesta tres semanas.
 */
export type EstadoRevision = "listo" | "incompleto" | "revisar" | "no-enviar";

export interface ResumenRevision {
  estado: EstadoRevision;
  /** Datos por diligenciar. No son un problema: es trabajo pendiente. */
  faltan: number;
  /** Problemas de verdad, de los que hacen que el banco lo devuelva. */
  problemas: number;
  /** Cosas que conviene mirar, con el dato ya puesto. */
  avisos: number;
}

/**
 * Resume la revisión separando lo que falta de lo que está mal.
 *
 * Un caso al que solo le faltan datos NO sale en rojo: sale como incompleto,
 * que es lo que de verdad es. El rojo queda reservado para los casos en los
 * que hay un dato puesto y ese dato devolvería el endoso.
 */
export function evaluarRevision(chequeos: Chequeo[]): ResumenRevision {
  const faltan = chequeos.filter((c) => c.categoria === "falta" && c.resultado !== "ok").length;
  const problemas = chequeos.filter(
    (c) => c.categoria === "riesgo" && c.resultado === "bloqueo"
  ).length;
  const avisos = chequeos.filter(
    (c) => c.categoria === "riesgo" && c.resultado === "aviso"
  ).length;

  const estado: EstadoRevision = problemas
    ? "no-enviar"
    : avisos
      ? "revisar"
      : faltan
        ? "incompleto"
        : "listo";

  return { estado, faltan, problemas, avisos };
}

// ---------------------------------------------------------------------------
// Vista
// ---------------------------------------------------------------------------

/** El endoso tal como viaja del servidor a la tabla (fechas ya en texto). */
export interface EndosoVista {
  id: number;
  urbanizacion: string;
  copropiedadId: number | null;
  cliente: string;
  cedula: string | null;
  cliente2: string | null;
  cedula2: string | null;
  correoSolicitante: string | null;
  celular: string | null;
  direccion: string | null;
  ciudad: string | null;
  torre: string | null;
  apartamento: string | null;
  cuartoUtil: string | null;
  parqueadero: string | null;
  coeficiente: number | null;
  valorSolicitado: number | null;
  banco: string | null;
  bancoNit: string | null;
  tipoCredito: string | null;
  aseguradora: string | null;
  numeroPoliza: string | null;
  radicado: string | null;
  fechaEnvioAseguradora: string | null;
  estado: string;
  /**
   * La bitácora NO viaja en el listado: es el campo que más crece —una línea
   * por cada gestión de cada caso— y solo hace falta al abrir uno. La ventana
   * del caso la pide aparte, a GET /api/endosos/[id].
   */
  ultimoSeguimiento: string | null;
  creadoEn: string;
  /** Días esperando respuesta de la aseguradora; null si aún no se ha enviado. */
  diasEsperando: number | null;
  /**
   * Días que faltan para que venza la póliza del edificio y haya que rehacer
   * este endoso. Negativo si ya venció. Null si el caso sigue en curso o si no
   * se sabe la vigencia.
   */
  diasParaRenovar: number | null;
  /**
   * Resumen de la revisión: en qué situación está y por qué.
   *
   * Se calcula en el servidor a propósito: varias comprobaciones comparan
   * contra la fecha de hoy, y si la tabla las recalculara en el navegador el
   * texto renderizado podría no coincidir con el del servidor.
   */
  revision: ResumenRevision;
}

export interface CopropiedadVista {
  id: number;
  nombre: string;
  nit: string | null;
  aseguradora: string | null;
  numeroPoliza: string | null;
  vigenciaHasta: string | null;
  valorAseguradoTotal: number | null;
  pazSalvoVigenteHasta: string | null;
  pazSalvoEstado: string | null;
  admiteEndosos: boolean;
  motivoBloqueo: string | null;
  nota: string | null;
}

/**
 * Días que lleva el caso esperando a la aseguradora.
 *
 * Solo cuenta desde que se radicó: antes de enviar, la demora es nuestra y se
 * ve en el estado, no en este reloj.
 */
export function diasEsperando(
  fechaEnvio: Date | string | null,
  estado: string,
  hoy: Date = new Date()
): number | null {
  if (estado === "ENVIADO_CLIENTE" || estado === "CERRADO") return null;
  const f = aFecha(fechaEnvio);
  if (!f) return null;
  return dias(f, hoy);
}

/**
 * Días que faltan para que a este endoso le toque renovarse.
 *
 * El reloj no es del endoso sino de la póliza del edificio: cuando esa vence,
 * todos los apartamentos que tenían endoso necesitan uno nuevo. Por eso el
 * histórico de endosos ya entregados no es papel viejo —es la lista de quién
 * va a volver a pedirlo, y permite adelantarse en vez de esperar a que el
 * cliente escriba.
 *
 * Solo aplica a los que ya se entregaron: un caso todavía en trámite ya está
 * en la cola, y meterlo aquí lo contaría dos veces.
 */
export function diasParaRenovar(
  estado: string,
  vigenciaHasta: Date | string | null | undefined,
  hoy: Date = new Date()
): number | null {
  if (estado !== "ENVIADO_CLIENTE") return null;
  const v = aFecha(vigenciaHasta ?? null);
  if (!v) return null;
  return dias(hoy, v);
}
