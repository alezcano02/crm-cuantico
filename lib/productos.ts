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

export type Disponibilidad = "basico" | "opcional" | "no_especificado";

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
    archivo: "CLAUSULADO MAPFRE.pdf",
    estructura:
      "Cinco secciones. El terremoto va DENTRO de la sección primera (amparo básico), no como anexo aparte: es la diferencia estructural más marcada del grupo.",
    coberturas: {
      "Todo riesgo daño material": b("Sección primera, 1.1"),
      Terremoto: b("Sección primera, 1.2: terremoto, temblor y/o erupción volcánica"),
      "Sustracción / hurto": o("Sección cuarta: hurto calificado"),
      "RC extracontractual": n,
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
    archivo: "CLAUSULADO PREVISORA.pdf",
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
    archivo: "CLAUSULADO SBS.pdf",
    estructura:
      "Amparo básico con gastos adicionales automáticos, más amparos opcionales. Es el único del grupo que ofrece accidentes personales para los integrantes del consejo.",
    coberturas: {
      "Todo riesgo daño material": b(),
      Terremoto: n,
      "Sustracción / hurto": n,
      "RC extracontractual": o("Amparo opcional de responsabilidad civil"),
      "Manejo / infidelidad de empleados": n,
      "Transporte de valores": n,
      Asistencia: n,
    },
  },
  {
    compania: "AXA COLPATRIA",
    producto: "Póliza integral para copropiedades",
    archivo: "CLAUSULADO AXA COLPATRIA.pdf",
    estructura:
      "Amparos básicos y un bloque 1.2 de amparos opcionales. El clausulado fija sublímites propios para responsabilidad civil.",
    coberturas: {
      "Todo riesgo daño material": b(),
      Terremoto: n,
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
    archivo: "CLAUSULADO EQUIDAD.pdf",
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

/** Clausulados de otros productos: uno por compañía, sin con qué compararlos. */
export const OTROS_PRODUCTOS: ProductoClausulado[] = [
  {
    compania: "ALLIANZ",
    producto: "Seguro de hogar (individual)",
    archivo:
      "CLAUSULADO HOGAR ALLIANZ -Condicionado_Hogar_Individual_13122023.pdf",
    estructura:
      "Clausulado de hogar, versión 07/02/2024. Es el único de HOGAR archivado, así que no hay con qué compararlo.",
    coberturas: {},
  },
  {
    compania: "AXA COLPATRIA",
    producto:
      "RC extracontractual · empresas de vigilancia y seguridad privada (Decreto 356 de 1994)",
    archivo: "CLAUSULADO RC-EMP-VIGILANCIA - AXA COLPATRIA.pdf",
    estructura:
      "Producto de nicho, ligado al Decreto 356 de 1994. Es el único de su tipo archivado.",
    coberturas: {},
  },
];

/** Documentos de asistencias y exclusiones que están sueltos en la carpeta. */
export const DOCUMENTOS_ASISTENCIA = [
  "ASISTENCIAS Y EXCLUSIONES AXA COLPATRIA.docx",
  "ASISTENCIAS Y EXCLUSIONES BBVA SEGUROS.docx",
  "ASISTENCIAS Y EXCLUSIONES PREVISORA SEGUROS.docx",
  "ASISTENCIAS Y EXCLUSIONES ZURICH COLOMBIA.docx",
  "CLAUSULADOS TODAS Z COMUN.docx",
];

/** Ruta de la carpeta en la unidad compartida, para poder abrir el original. */
export const CARPETA_CLAUSULADOS =
  "3. Area Tecnica\\Compañia de Seguros\\Clausulados";
