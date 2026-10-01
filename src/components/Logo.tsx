interface LogoProps {
  height?: number;
  zoom?: number; // ajustez si le cadrage n'est pas parfait (ex: 1.3, 1.5, 1.8...)
}

export default function Logo({ height = 40, zoom = 1.6 }: LogoProps) {
  return (
    <div
      style={{
        height,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <img
        src="/calendraft-banner.png"
        alt="Calendraft"
        style={{
          height: height * zoom,
          width: 'auto',
          objectFit: 'contain',
          display: 'block',
        }}
      />
    </div>
  );
}
