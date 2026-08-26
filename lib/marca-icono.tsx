/**
 * El ícono de marca (el mismo átomo/flor de app/icon.svg y del logo de la
 * agencia), redibujado con JSX plano para que `ImageResponse` (satori) pueda
 * rasterizarlo. Satori no admite <svg> arbitrario dentro de una imagen
 * generada, así que las tres elipses giradas y los seis pétalos se arman con
 * divs posicionados absolutamente — es lo que consumen apple-icon.tsx y las
 * rutas de íconos del manifest, para no repetir la figura en cada archivo.
 */
export function IconoMarca({
  tamano = 512,
  escala = 0.78,
  fondo = true,
}: {
  tamano?: number;
  /** 1 = el átomo ocupa casi todo el lienzo; más chico dentro de la zona
   *  segura de los íconos "maskable" de Android, que recortan un círculo. */
  escala?: number;
  /** false = solo el átomo, sin cuadro de fondo (para superponer). */
  fondo?: boolean;
}) {
  const centro = tamano / 2;
  const anchoElipse = tamano * 0.19 * escala;
  const altoElipse = tamano * 0.44 * escala;
  const grosorLinea = Math.max(1, tamano * 0.032 * escala);
  const petalo = tamano * 0.08 * escala;
  const radioPetalos = tamano * 0.44 * escala;
  const centroPunto = tamano * 0.12 * escala;

  const elipse = (grados: number) => (
    <div
      style={{
        position: "absolute",
        left: centro - anchoElipse / 2,
        top: centro - altoElipse / 2,
        width: anchoElipse,
        height: altoElipse,
        borderRadius: "50%",
        border: `${grosorLinea}px solid #ffffff`,
        transform: `rotate(${grados}deg)`,
      }}
    />
  );

  const petaloEn = (grados: number) => {
    const rad = (grados * Math.PI) / 180;
    const x = centro + radioPetalos * Math.sin(rad) - petalo / 2;
    const y = centro - radioPetalos * Math.cos(rad) - petalo / 2;
    return (
      <div
        key={grados}
        style={{
          position: "absolute",
          left: x,
          top: y,
          width: petalo,
          height: petalo,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.5)",
        }}
      />
    );
  };

  return (
    <div
      style={{
        width: tamano,
        height: tamano,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: fondo ? "#132240" : "transparent",
      }}
    >
      <div style={{ position: "relative", width: tamano, height: tamano, display: "flex" }}>
        {elipse(0)}
        {elipse(60)}
        {elipse(120)}
        {[0, 60, 120, 180, 240, 300].map((g) => petaloEn(g))}
        <div
          style={{
            position: "absolute",
            left: centro - centroPunto / 2,
            top: centro - centroPunto / 2,
            width: centroPunto,
            height: centroPunto,
            borderRadius: "50%",
            background: "#ffffff",
          }}
        />
      </div>
    </div>
  );
}
