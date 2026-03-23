"use client";

interface MaterialIconProps {
  icon: string;
  filled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export default function MaterialIcon({
  icon,
  filled = false,
  className = "",
  style,
}: MaterialIconProps) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{
        ...(filled
          ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }
          : {}),
        ...style,
      }}
    >
      {icon}
    </span>
  );
}
