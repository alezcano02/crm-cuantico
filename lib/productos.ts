/**
 * Comparación de los clausulados que la agencia tiene archivados en
 * "3. Area Tecnica\Compañia de Seguros\Clausulados".
 *
 * QUÉ ES Y QUÉ NO ES ESTO
 *
 * Todo lo de aquí está tomado del texto de los clausulados que hay en esa
 * carpeta, y solo de ahí. Nada está inferido ni completado con criterio
 * general del ramo: cuando un clausulado no dice algo, aquí figura como no
 * especificado, no como "no lo cubre".
 *
 * Lo que sí se puede comparar entre compañías es la ARQUITECTURA del producto:
 * qué entra en el amparo básico y qué exige anexo aparte con prima adicional.
 * Esa es la diferencia práctica al cotizar.
 *
 * Lo que NO se puede comparar desde estos documentos son los VALORES: límites,
 * sublímites, deducibles y primas no viven en el clausulado general sino en la
 * carátula y las condiciones particulares de cada póliza concreta. Por eso no
 * aparecen: ponerlos de memoria sería inventarlos.
 *
 * Ante cualquier duda con un cliente manda la carátula de SU póliza, no esta
 * tabla.
 */

/**
 * "segun_caratula" es un cuarto estado que hizo falta al comparar AUTOS: varios
 * clausulados listan todos sus amparos juntos, sin separar básicos de
 * adicionales, y advierten que operan «de acuerdo con los amparos contratados y
 * señalados en la carátula». Marcarlos como básicos sería afirmar de más.
 */
export type Disponibilidad =
  | "basico"
  | "opcional"
  | "segun_caratula"
  | "no_especificado";

export interface CoberturaProducto {
  /** Cómo aparece en el clausulado de esa compañía. */
  estado: Disponibilidad;
  /** Cómo lo nombra el documento, si difiere del nombre genérico. */
  nota?: string;
}

export interface ProductoClausulado {
  compania: string;
  /** Nombre exacto del producto según la portada del clausulado. */
  producto: string;
  /** Archivo del que salió, para poder volver a la fuente. */
  archivo: string;
  /** Cómo organiza el clausulado sus coberturas. */
  estructura: string;
  coberturas: Record<string, CoberturaProducto>;
  /** Anexo de asistencia archivado aparte, en la misma carpeta. */
  anexoAsistencia?: string;
}

/** Las columnas de la comparación, en el orden en que se muestran. */
export const COBERTURAS_COMPARADAS = [
  "Todo riesgo daño material",
  "Terremoto",
  "Sustracción / hurto",
  "RC extracontractual",
  "Manejo / infidelidad de empleados",
  "Transporte de valores",
  "Asistencia",
] as const;

export type NombreCobertura = (typeof COBERTURAS_COMPARADAS)[number];

const b = (nota?: string): CoberturaProducto => ({ estado: "basico", nota });
const o = (nota?: string): CoberturaProducto => ({ estado: "opcional", nota });
const n: CoberturaProducto = { estado: "no_especificado" };

/**
 * COPROPIEDADES. Es el producto del que la agencia tiene clausulado de once
 * compañías, y el ramo de mayor producción (ZONA COMÚN). Es el único con
 * material suficiente para comparar.
 */
export const COPROPIEDADES: ProductoClausulado[] = [
  {
    compania: "ZURICH",
    producto: "Póliza de seguro todo riesgo para copropiedades",
    archivo: "CLAUSULADO ZURICH.pdf",
    estructura:
      "Amparo básico todo riesgo daño material, con extensiones automáticas y gastos derivados del siniestro. Seis anexos opcionales, que solo operan si figuran en la carátula.",
    coberturas: {
      "Todo riesgo daño material": b("Condición primera"),
      Terremoto: n,
      "Sustracción / hurto": n,
      "RC extracontractual": o("Anexo de RC extracontractual"),
      "Manejo / infidelidad de empleados": o("Anexo de manejo global comercial"),
      "Transporte de valores": o("Anexo de transporte de valores"),
      Asistencia: o("Anexo de asistencia para copropiedades"),
    },
    anexoAsistencia: "anexo-de-asistencia ZURICH.pdf",
  },
  {
    compania: "SURA",
    producto: "Seguro multirriesgo de copropiedades",
    archivo: "CLAUSULADO SURA.pdf",
    estructura:
      "Cinco módulos independientes (A a E). El A es el de daños materiales; los demás se contratan por separado.",
    coberturas: {
      "Todo riesgo daño material": b("Módulo A"),
      Terremoto: n,
      "Sustracción / hurto": o("Módulo B: sustracción con violencia"),
      "RC extracontractual": o("Módulo C"),
      "Manejo / infidelidad de empleados": o(
        "Módulo D: infidelidad y abuso de confianza de empleados"
      ),
      "Transporte de valores": o("Módulo E"),
      Asistencia: n,
    },
  },
  {
    compania: "MAPFRE",
    producto: "Copropiedades",
    archivo: "Mapfre/COPROPIEDADES/CLAUSULADO/CONDICIONADO COPROPIEDADES.pdf",
    estructura:
      "Seis secciones. El terremoto va DENTRO de la sección primera (amparo básico) junto al todo riesgo daño material: es la diferencia estructural más marcada del grupo. La RC extracontractual es la sección sexta, adicional.",
    coberturas: {
      "Todo riesgo daño material": b("Sección primera, 1.1"),
      Terremoto: b("Sección primera, 1.2: terremoto, temblor y/o erupción volcánica"),
      "Sustracción / hurto": o("Sección cuarta: hurto calificado"),
      "RC extracontractual": o("Sección sexta, adicional"),
      "Manejo / infidelidad de empleados": o("Sección quinta: infidelidad de empleados"),
      "Transporte de valores": n,
      Asistencia: n,
    },
  },
  {
    compania: "SOLIDARIA",
    producto: "Póliza de seguro integral para copropiedades (SOLICOPROPIEDAD)",
    archivo: "CLAUSULADO SOLIDARIA.pdf",
    estructura:
      "Cuatro secciones. La I es la de daños materiales; las otras tres son coberturas separadas.",
    coberturas: {
      "Todo riesgo daño material": b("Sección I: pérdidas y daños materiales"),
      Terremoto: n,
      "Sustracción / hurto": n,
      "RC extracontractual": o("Sección IV"),
      "Manejo / infidelidad de empleados": o("Sección III: manejo global comercial"),
      "Transporte de valores": o("Sección II"),
      Asistencia: n,
    },
  },
  {
    compania: "BBVA SEGUROS",
    producto: "Póliza de seguro todo riesgo · daños materiales - copropiedades",
    archivo: "CLAUSULADO BBVA.pdf",
    estructura:
      "Varias secciones (todo riesgo daño material, AMIT, rotura de maquinaria…) y, dentro de ellas, amparos adicionales opcionales que se activan uno a uno.",
    coberturas: {
      "Todo riesgo daño material": b("Sección I, amparo básico todo riesgo incendio"),
      Terremoto: n,
      "Sustracción / hurto": o("Amparo adicional opcional de sustracción sin violencia"),
      "RC extracontractual": n,
      "Manejo / infidelidad de empleados": n,
      "Transporte de valores": n,
      Asistencia: n,
    },
    anexoAsistencia: "ASISTENCIAS Y EXCLUSIONES BBVA SEGUROS.docx",
  },
  {
    compania: "HDI",
    producto: "Póliza copropiedades HDI",
    archivo: "CLAUSULADO HDI.pdf",
    estructura:
      "Secciones numeradas; varias son explícitamente 'amparo adicional', incluidas sustracción y RC.",
    coberturas: {
      "Todo riesgo daño material": b(),
      Terremoto: n,
      "Sustracción / hurto": o("Sección IV: amparo adicional de sustracción con violencia"),
      "RC extracontractual": o("Sección IX: amparo adicional"),
      "Manejo / infidelidad de empleados": o("Amparo adicional de fraude de empleados"),
      "Transporte de valores": n,
      Asistencia: n,
    },
  },
  {
    compania: "SEGUROS DEL ESTADO",
    producto: "Póliza de seguro integral para copropiedades",
    archivo: "CLAUSULADO SEGUROS DEL ESTADO.pdf",
    estructura:
      "Amparo básico más una lista de amparos adicionales numerados. El terremoto es uno de ellos, a diferencia de MAPFRE.",
    coberturas: {
      "Todo riesgo daño material": b(),
      Terremoto: o("Amparo adicional de terremoto"),
      "Sustracción / hurto": o("Amparo adicional de sustracción sin o con violencia"),
      "RC extracontractual": n,
      "Manejo / infidelidad de empleados": n,
      "Transporte de valores": o("Amparo adicional para transporte de valores"),
      Asistencia: n,
    },
  },
  {
    compania: "PREVISORA",
    producto: "Póliza multirriesgo copropiedades (PRACP-003-006)",
    archivo: "Previsora/COPROPIEDADES/CLAUSULADO/Clausulado póliza multirriesgo copropiedades.pdf",
    estructura:
      "Amparo básico y una lista larga de amparos opcionales, cada uno con sus propias exclusiones. El hurto simple queda excluido salvo que se contrate el opcional de sustracción.",
    coberturas: {
      "Todo riesgo daño material": b(),
      Terremoto: n,
      "Sustracción / hurto": o("Amparo opcional de sustracción todo riesgo"),
      "RC extracontractual": n,
      "Manejo / infidelidad de empleados": n,
      "Transporte de valores": n,
      Asistencia: o("Anexo de asistencia archivado aparte"),
    },
    anexoAsistencia: "ANEEXO ASISTENCIA- PREVISORA.pdf",
  },
  {
    compania: "SBS",
    producto: "Póliza de todo riesgo para copropiedades (con o sin áreas privadas)",
    archivo: "Sbs/COPROPIEDADES/CLAUSULADO/Clausulado.pdf",
    estructura:
      "Amparo básico todo riesgo daño material, amparo automático de gastos adicionales (1.2) y tres opcionales: hurto simple, responsabilidad civil y accidentes personales. Es el único del grupo con accidentes personales para los integrantes del consejo.",
    coberturas: {
      "Todo riesgo daño material": b(),
      Terremoto: n,
      "Sustracción / hurto": o("2.1: amparo opcional de hurto simple"),
      "RC extracontractual": o("2.2: amparo opcional de responsabilidad civil"),
      "Manejo / infidelidad de empleados": n,
      "Transporte de valores": n,
      Asistencia: n,
    },
  },
  {
    compania: "AXA COLPATRIA",
    producto: "Póliza integral para copropiedades",
    archivo: "Axa Colpatria/COPROPIEDADES/CLAUSULADOS/CLAUSULADO AXA COLPATRIA.pdf",
    estructura:
      "Amparos básicos (1.1: todo riesgo incendio, deslizamiento, extended coverage), opcionales (1.2) y temporales (1.3). El terremoto es opcional, no básico. Fija sublímites propios para responsabilidad civil.",
    coberturas: {
      "Todo riesgo daño material": b("1.1.1 todo riesgo incendio"),
      Terremoto: o("1.2.1: terremoto, temblor o erupción volcánica"),
      "Sustracción / hurto": n,
      "RC extracontractual": o("Con sublímites propios (1.3.6 y 1.3.7)"),
      "Manejo / infidelidad de empleados": n,
      "Transporte de valores": n,
      Asistencia: o("Anexo de asistencia archivado aparte"),
    },
    anexoAsistencia: "ANEXO ASISTENCIA - AXA COLPATRIA.pdf",
  },
  {
    compania: "EQUIDAD",
    producto: "Seguro de copropiedades",
    archivo: "EQUIDAD SEGUROS/COPROPIEDAD/CLAUSULADO EQUIDAD.pdf",
    estructura:
      "Cobertura básica más coberturas adicionales que, según el propio texto, pueden convenirse expresamente mediante anexos.",
    coberturas: {
      "Todo riesgo daño material": b("Cobertura básica"),
      Terremoto: n,
      "Sustracción / hurto": n,
      "RC extracontractual": n,
      "Manejo / infidelidad de empleados": n,
      "Transporte de valores": n,
      Asistencia: n,
    },
  },
];

/** Ruta de la carpeta en la unidad compartida, para poder abrir el original. */
export const CARPETA_CLAUSULADOS =
  "3. Area Tecnica\\Compañia de Seguros\\Clausulados";

/**
 * Inventario del resto de la unidad compartida.
 *
 * La carpeta "Clausulados" no es la única: cada compañía tiene la suya en
 * `3. Area Tecnica\Compañia de Seguros\<COMPAÑÍA>\<RAMO>`, y ahí hay bastante
 * más material. Esto es solo un índice de QUÉ HAY, contando archivos: sirve
 * para saber si existe clausulado de un ramo antes de pedirlo a la compañía.
 *
 * No es una comparación: comparar coberturas exige leer cada documento, y por
 * ahora eso solo está hecho para copropiedades.
 */
export interface InventarioRamo {
  ramo: string;
  documentos: number;
  companias: string[];
  /** true cuando ya hay comparación de coberturas hecha en esta pantalla. */
  comparado?: boolean;
}

/**
 * Dónde está el clausulado de cada compañía. La carpeta "Clausulados" resultó
 * ser una copia parcial y desactualizada: los buenos están en la carpeta de
 * cada compañía, en <COMPAÑÍA><PRODUCTO>. De AXA, MAPFRE y SBS los dos
 * archivos ni siquiera coinciden, y se usó el de la compañía.
 */
export interface FuenteRamo {
  ramo: "Copropiedades" | "Autos";
  compania: string;
  /** Dónde vive el clausulado que se usó. */
  origen: "carpeta_compania" | "carpeta_clausulados";
}

export const FUENTES: FuenteRamo[] = [
  { ramo: "Copropiedades", compania: "AXA COLPATRIA", origen: "carpeta_compania" },
  { ramo: "Copropiedades", compania: "EQUIDAD", origen: "carpeta_compania" },
  { ramo: "Copropiedades", compania: "MAPFRE", origen: "carpeta_compania" },
  { ramo: "Copropiedades", compania: "PREVISORA", origen: "carpeta_compania" },
  { ramo: "Copropiedades", compania: "SBS", origen: "carpeta_compania" },
  { ramo: "Copropiedades", compania: "BBVA SEGUROS", origen: "carpeta_clausulados" },
  { ramo: "Copropiedades", compania: "HDI", origen: "carpeta_clausulados" },
  { ramo: "Copropiedades", compania: "SEGUROS DEL ESTADO", origen: "carpeta_clausulados" },
  { ramo: "Copropiedades", compania: "SOLIDARIA", origen: "carpeta_clausulados" },
  { ramo: "Copropiedades", compania: "SURA", origen: "carpeta_clausulados" },
  { ramo: "Copropiedades", compania: "ZURICH", origen: "carpeta_clausulados" },
  { ramo: "Autos", compania: "ALLIANZ", origen: "carpeta_compania" },
  { ramo: "Autos", compania: "AXA COLPATRIA", origen: "carpeta_compania" },
  { ramo: "Autos", compania: "BOLÍVAR", origen: "carpeta_compania" },
  { ramo: "Autos", compania: "HDI", origen: "carpeta_compania" },
  { ramo: "Autos", compania: "MAPFRE", origen: "carpeta_compania" },
  { ramo: "Autos", compania: "SBS", origen: "carpeta_compania" },
  { ramo: "Autos", compania: "SEGUROS DEL ESTADO", origen: "carpeta_compania" },
  { ramo: "Autos", compania: "ZURICH", origen: "carpeta_compania" },
];

/** Compañías con clausulado archivado que NO se pudieron comparar, y por qué. */
export const SIN_COMPARAR = [
  {
    compania: "SURA",
    ramo: "Autos",
    motivo:
      "Su clausulado tiene la fuente con codificación dañada: ningún modo de extracción devuelve texto. Se lee bien abriéndolo a mano.",
    ruta: "Sura/AUTOS - MOTOS/CLAUSULADO/2025/AUTOS/CLAUSULADO AUTOS.pdf",
  },
  {
    compania: "MUNDIAL",
    ramo: "Autos",
    motivo:
      "Sus clausulados son de taxis (Seguro Amarillo), pesados de carga y RC (Conduce Tranquilo). No hay uno de livianos particulares, así que no es comparable con los demás.",
    ruta: "Mundial/AUTOS/CLAUSULADOS MOVILIDAD MUNDIAL/2025",
  },
  {
    compania: "LIBERTY",
    ramo: "Autos",
    motivo:
      "Solo tiene manual de políticas de suscripción, no clausulado.",
    ruta: "Liberty/AUTOS/POLITICAS",
  },
  {
    compania: "EQUIDAD",
    ramo: "Autos",
    motivo:
      "Lo archivado son presentaciones de producto y políticas, no el clausulado.",
    ruta: "EQUIDAD SEGUROS/AUTOS",
  },
];

export const TOTAL_CLAUSULADOS_COMPARTIDA = 654;

export const CARPETA_COMPANIAS = "3. Area Tecnica\\Compañia de Seguros";

// ---------------------------------------------------------------------------
// AUTOS
// ---------------------------------------------------------------------------

/**
 * Ocho compañías tienen clausulado de autos archivado. Aquí hay siete: el de
 * SURA no se pudo leer (ver SURA_AUTOS_ILEGIBLE más abajo).
 *
 * A diferencia de copropiedades, estos clausulados no comparten esquema: unos
 * separan amparos básicos de adicionales y otros los listan todos juntos
 * remitiéndose a la carátula. Por eso la comparación usa cuatro estados y no
 * tres: forzar un "básico" donde el documento no lo dice sería inventar.
 */
export const COBERTURAS_AUTOS = [
  "Daños (pérdida total y parcial)",
  "Hurto",
  "RC extracontractual",
  "Terremoto y eventos de la naturaleza",
  "Protección patrimonial",
  "Asistencia jurídica",
  "Vehículo de reemplazo",
  "Gastos de transporte",
] as const;

const s = (nota?: string): CoberturaProducto => ({
  estado: "segun_caratula",
  nota,
});

export const AUTOS: ProductoClausulado[] = [
  {
    compania: "MAPFRE",
    producto: "Condicionado individuales · livianos",
    archivo: "CONDICIONADO-INDIVIDUALES-Livianos-Noviembre-2024  AUTOS.pdf",
    estructura:
      "Su cláusula 1 dice literalmente que el AMPARO BÁSICO es «responsabilidad civil extracontractual», y todo lo demás —daños, hurto, terremoto, patrimonial, jurídica— va en la lista de AMPAROS ADICIONALES. Es la lista más larga del grupo: 19 adicionales, con cosas que nadie más tiene, como canasta familiar, renta educativa y gastos por cirugía plástica.",
    coberturas: {
      "Daños (pérdida total y parcial)": o("Adicional: por daños y terrorismo"),
      Hurto: o("Adicional: hurto total y hurto parcial"),
      "RC extracontractual": b("Es el único amparo básico"),
      "Terremoto y eventos de la naturaleza": o("Temblor, terremoto o erupción volcánica"),
      "Protección patrimonial": o(),
      "Asistencia jurídica": o("Proceso penal y proceso civil, por separado"),
      "Vehículo de reemplazo": o(),
      "Gastos de transporte": o("Por pérdida total"),
    },
  },
  {
    compania: "BOLÍVAR",
    producto: "Condicionado seguro de vehículo",
    archivo: "condicionado-seguro-vehiculo-segurosBolivar_2025.pdf",
    estructura:
      "Su COBERTURA BÁSICA son solo los riesgos patrimoniales: responsabilidad civil y gastos de atención jurídica. Daños, hurto y terremoto están explícitamente bajo COBERTURAS OPCIONALES, y el resto bajo OTROS AMPAROS.",
    coberturas: {
      "Daños (pérdida total y parcial)": o("Opcional: daño parcial o total al vehículo"),
      Hurto: o("Opcional: pérdida total o parcial por hurto"),
      "RC extracontractual": b("Básica, con ampliación"),
      "Terremoto y eventos de la naturaleza": o(
        "Opcional: terremoto, temblor, erupción, maremoto, tsunami y huracán"
      ),
      "Protección patrimonial": o("Otros amparos: amparo patrimonial"),
      "Asistencia jurídica": b("Básica: proceso civil y penal"),
      "Vehículo de reemplazo": o("Otros amparos: vehículo temporal de reemplazo"),
      "Gastos de transporte": o("Otros amparos: auxilio de transporte"),
    },
  },
  {
    compania: "AXA COLPATRIA",
    producto: "Clausulado autos (movilidad)",
    archivo: "Clausulado.pdf · CLAUSULADOS MOVILIDAD 2025",
    estructura:
      "Sí trae daños, hurto, terremoto y patrimonial dentro de los AMPAROS BÁSICOS. Deja como opcionales solo tres: gastos de transporte, muerte accidental y asistencia médica.",
    coberturas: {
      "Daños (pérdida total y parcial)": b("1.2 y 1.3, básicos"),
      Hurto: b("1.4: hurto o hurto calificado"),
      "RC extracontractual": b("1.1, con límite asegurado único"),
      "Terremoto y eventos de la naturaleza": b("1.6, básico"),
      "Protección patrimonial": b("1.7, básico"),
      "Asistencia jurídica": b("2.2"),
      "Vehículo de reemplazo": o("2.1: vehículo sustituto"),
      "Gastos de transporte": o("3.1, opcional"),
    },
  },
  {
    compania: "SBS",
    producto: "Clausulado autos",
    archivo: "CLAUSULADOS AUTOS.pdf · SBS 2025",
    estructura:
      "Nueve amparos básicos (condición 1) que incluyen daños, hurto, naturaleza, patrimonial y las dos asistencias jurídicas; once adicionales (condición 2), entre ellos documentos y billetera, reemplazo de llaves y accidentes personales.",
    coberturas: {
      "Daños (pérdida total y parcial)": b("1.2 y 1.3, básicos"),
      Hurto: b("1.4, básico"),
      "RC extracontractual": b("1.1, básico"),
      "Terremoto y eventos de la naturaleza": b("1.6: eventos de la naturaleza"),
      "Protección patrimonial": b("1.7, básico"),
      "Asistencia jurídica": b("1.8 y 1.9: penal y civil"),
      "Vehículo de reemplazo": o("2.1, adicional"),
      "Gastos de transporte": o("2.2 y 2.3, adicionales"),
    },
  },
  {
    compania: "SEGUROS DEL ESTADO",
    producto: "Clausulado seguro de automóviles",
    archivo: "Clausulado Seguro de Automoviles.pdf · 2025",
    estructura:
      "Lista sus 14 amparos juntos, sin separar básicos de adicionales: operan «de acuerdo con los amparos contratados». Separa daños y hurto por cuantía (mayor y menor), como ALLIANZ.",
    coberturas: {
      "Daños (pérdida total y parcial)": s(
        "Pérdida total y daños parciales de mayor y menor cuantía"
      ),
      Hurto: s("Hurto de mayor y de menor cuantía"),
      "RC extracontractual": s("1.1"),
      "Terremoto y eventos de la naturaleza": s("Terremoto y eventos de la naturaleza; terrorismo aparte"),
      "Protección patrimonial": s(),
      "Asistencia jurídica": s(),
      "Vehículo de reemplazo": s(),
      "Gastos de transporte": s("Para pérdidas totales o de mayor cuantía"),
    },
  },
  {
    compania: "ZURICH",
    producto: "Póliza de seguro para vehículos livianos de servicio particular",
    archivo: "ZURICH/AUTOS/CLAUSULADOS AUTOS ZURICH/2025/Poliza de Seguro Autos Livianos Particular MOV 15102022.pdf",
    estructura:
      "Encabeza su cláusula 1 diciendo que los amparos «aplican según el plan contratado» y solo operan si están en la carátula. Agrupa por coberturas de daños y coberturas por hurto. Su RC se extiende a bicicleta y patineta —propia, prestada o alquilada— con sublímite de $5.000.000 por evento, algo que ningún otro clausulado del grupo contempla.",
    coberturas: {
      "Daños (pérdida total y parcial)": s("Coberturas por daños: pérdida total y parcial"),
      Hurto: s("Coberturas por hurto: pérdida total y parcial"),
      "RC extracontractual": s("Se extiende a bicicleta y patineta, sublímite $5.000.000"),
      "Terremoto y eventos de la naturaleza": s(
        "Solo si se contrata: sus exclusiones dicen «cuando este amparo no haya sido contratado»"
      ),
      "Protección patrimonial": s("Amparo patrimonial"),
      "Asistencia jurídica": n,
      "Vehículo de reemplazo": n,
      "Gastos de transporte": s(),
    },
  },
  {
    compania: "ALLIANZ",
    producto: "Clausulado livianos particulares (AUTO58 versión 24)",
    archivo: "Clausulado-Livianos-Particulares-AUTO58VERSION24.pdf",
    estructura:
      "Enumera nueve amparos sin separarlos en básicos y adicionales. Es el único que nombra un amparo de «llave en mano», y cubre lesiones o muerte en accidente de tránsito incluso para familiares del conductor, que en el resto de sus amparos excluye.",
    coberturas: {
      "Daños (pérdida total y parcial)": s("Daños de mayor o menor cuantía"),
      Hurto: s("Hurto de mayor o menor cuantía"),
      "RC extracontractual": s(),
      "Terremoto y eventos de la naturaleza": n,
      "Protección patrimonial": s("Amparo patrimonial"),
      "Asistencia jurídica": s("En proceso penal o civil"),
      "Vehículo de reemplazo": s(),
      "Gastos de transporte": s("Gastos de movilización por pérdidas de mayor cuantía"),
    },
  },
  {
    compania: "HDI",
    producto: "Clausulado autos (convenios de uso de red con entidades financieras)",
    archivo: "Clausulado Autos pólizas mediante convenios… nov2024.pdf",
    estructura:
      "Agrupa por destinatario: amparos al vehículo, amparos de responsabilidad civil y amparos a las personas. Es el más detallado en RC —extracontractual, en exceso, obligatoria de ley, contractual y general familiar— y el único con lucro cesante, exequias y obligaciones financieras.",
    coberturas: {
      "Daños (pérdida total y parcial)": s("2.1.1: pérdida parcial y total por daños"),
      Hurto: s("2.1.2: pérdida parcial y total por hurto"),
      "RC extracontractual": s("2.2.1, más otras cuatro modalidades de RC"),
      "Terremoto y eventos de la naturaleza": s("2.1.3: temblor, terremoto o erupción volcánica"),
      "Protección patrimonial": s(),
      "Asistencia jurídica": s("2.3.1"),
      "Vehículo de reemplazo": s("2.3.7: vehículo sustituto"),
      "Gastos de transporte": s("2.3.5: por pérdida total"),
    },
  },
];

/**
 * SURA queda fuera de la comparación de autos y conviene decir por qué: su
 * clausulado usa una fuente con codificación rota y NINGÚN modo de extracción
 * (-layout, -raw, por defecto) devuelve texto legible. El documento existe y se
 * lee bien abriéndolo a mano; solo no se puede procesar automáticamente.
 */
export const SURA_AUTOS_ILEGIBLE = {
  archivo: "CLAUSULADO AUTOS.pdf",
  ruta: "3. Area Tecnica\\Compañia de Seguros\\Sura\\AUTOS - MOTOS\\CLAUSULADO\\2025\\AUTOS",
};

// ---------------------------------------------------------------------------
// ASISTENCIAS de copropiedades
// ---------------------------------------------------------------------------

/**
 * Las asistencias son lo que más se nota en el día a día de una copropiedad
 * —el plomero a las once de la noche— y van en anexos aparte del clausulado.
 * Hay documento de cuatro compañías.
 *
 * OJO con la procedencia: los de ZURICH y PREVISORA son el anexo oficial de la
 * compañía. El de AXA COLPATRIA es su lista de exclusiones por servicio (de
 * ella se deduce qué servicios presta, porque solo se excluye lo que existe).
 * El de BBVA es una nota resumida por alguien de la agencia, no el documento
 * de la compañía: sirve de guía, no para responderle a un cliente.
 */
export type OrigenAsistencia = "anexo_oficial" | "exclusiones" | "nota_interna";

export interface AsistenciaCompania {
  compania: string;
  archivo: string;
  origen: OrigenAsistencia;
  /** Tope de eventos y de valor, cuando el documento lo dice. */
  tope: string | null;
  servicios: string[];
  /** Lo que conviene saber antes de prometerle algo a un cliente. */
  advertencia?: string;
}

export const SERVICIOS_ASISTENCIA = [
  "Plomería",
  "Electricidad",
  "Cerrajería",
  "Vidrios",
  "Jardinería",
  "Vigilante sustituto",
  "Aseo sustituto",
  "Jurídica",
] as const;

export const ASISTENCIAS: AsistenciaCompania[] = [
  {
    compania: "PREVISORA",
    archivo: "ANEEXO ASISTENCIA- PREVISORA.pdf",
    origen: "anexo_oficial",
    tope: "El anexo no fija número de eventos ni tope por evento",
    servicios: [
      "Plomería",
      "Electricidad",
      "Cerrajería",
      "Vidrios",
      "Jardinería",
      "Vigilante sustituto",
      "Aseo sustituto",
      "Jurídica",
    ],
    advertencia:
      "Es la lista más larga: 17 servicios numerados. Además de los habituales trae sustitución de tejas, traslado de bienes, vigilante de apoyo en caso de robo, handy man y, literalmente, chef, DJ y mesero a domicilio.",
  },
  {
    compania: "ZURICH",
    archivo: "anexo-de-asistencia ZURICH.pdf",
    origen: "anexo_oficial",
    tope: "15 asistencias por vigencia (combinadas) · hasta 30 SMDLV por evento, materiales y mano de obra incluidos",
    servicios: [
      "Plomería",
      "Electricidad",
      "Cerrajería",
      "Vidrios",
      "Jardinería",
      "Vigilante sustituto",
      "Aseo sustituto",
      "Jurídica",
    ],
    advertencia:
      "Es el único que pone números: 15 asistencias por vigencia y 30 SMDLV por evento. Separa servicios básicos (electricidad, cerrajería, vidrios, plomería) de otros siete, entre ellos guarda de seguridad sustituto y gastos de traslado de bienes.",
  },
  {
    compania: "AXA COLPATRIA",
    archivo: "ASISTENCIAS Y EXCLUSIONES AXA COLPATRIA.docx",
    origen: "exclusiones",
    tope: "El documento archivado solo trae exclusiones; no fija topes",
    servicios: [
      "Plomería",
      "Electricidad",
      "Cerrajería",
      "Vidrios",
      "Jardinería",
      "Aseo sustituto",
    ],
    advertencia:
      "Lo archivado es la lista de exclusiones por servicio, no el anexo de coberturas: los servicios de aquí se deducen de qué se excluye. Distingue áreas privadas de comunes, y en vidrios cubre el desmonte e instalación de uno por evento. Su anexo oficial (9 MB) está escaneado como imagen y no se pudo leer.",
  },
  {
    compania: "BBVA SEGUROS",
    archivo: "ASISTENCIAS Y EXCLUSIONES BBVA SEGUROS.docx",
    origen: "nota_interna",
    tope: "Sin datos",
    servicios: ["Plomería", "Electricidad", "Cerrajería", "Vidrios", "Jardinería"],
    advertencia:
      "No es el documento de la compañía sino un resumen escrito en la agencia, con frases como «también pueden incluir». Sirve para orientarse; para responderle a un cliente hay que pedirle el anexo oficial a BBVA.",
  },
];

/** Exclusiones que repiten TODAS las compañías con anexo de asistencia. */
export const EXCLUSIONES_COMUNES_ASISTENCIA = [
  "Fenómenos naturales catastróficos (terremoto, inundación, erupción volcánica)",
  "Terrorismo, motín o tumulto popular",
  "Actos de las fuerzas armadas o cuerpos de seguridad",
  "Energía nuclear o radiactiva",
  "Mala fe del asegurado o beneficiario",
  "Servicios contratados por el asegurado sin autorización previa de la compañía",
  "Daños por desgaste natural, falta de mantenimiento o preexistentes",
];
