import { cn } from "@/lib/cn";

interface ColorWheelProps {
  color: string;
  className?: string;
}

/** Map a native color input's hex value onto the wheel's hue and saturation. */
function selectionPoint(color: string) {
  const hex = color.replace(/^#/, "");
  const expanded = hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex;
  if (!/^[\da-f]{6}$/i.test(expanded)) return { x: 28, y: 28 };

  const red = Number.parseInt(expanded.slice(0, 2), 16) / 255;
  const green = Number.parseInt(expanded.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(expanded.slice(4, 6), 16) / 255;
  const high = Math.max(red, green, blue);
  const range = high - Math.min(red, green, blue);
  if (range === 0) return { x: 28, y: 28 };

  const sector = high === red
    ? (green - blue) / range
    : high === green
      ? (blue - red) / range + 2
      : (red - green) / range + 4;
  const angle = sector * Math.PI / 3;
  const radius = range / high * 16;
  return {
    x: 28 + Math.cos(angle) * radius,
    y: 28 - Math.sin(angle) * radius,
  };
}

/** Decorative only; the containing color input supplies the accessible control. */
export function ColorWheel({ color, className }: ColorWheelProps) {
  const point = selectionPoint(color);

  return (
    <span
      aria-hidden="true"
      className={cn("relative inline-block size-14 shrink-0 align-middle", className)}
    >
      <span
        className="absolute inset-[15%] rounded-full"
        style={{
          background: "radial-gradient(circle, #fff 0%, rgb(255 255 255 / 0) 72%), conic-gradient(from 90deg, #ff4148, #ff42ce, #6554ff, #3ecfff, #56dc67, #ffe55a, #ff4148)",
        }}
      />
      <svg
        width={56}
        height={56}
        viewBox="0 0 56 56"
        fill="none"
        className="absolute inset-0 size-full"
        focusable="false"
      >
        <path
          d="M49.7 36a23.1 23.1 0 1 1 0-16"
          stroke="var(--sf-border-strong, #d8d0c4)"
          strokeWidth={1.4}
          strokeLinecap="round"
        />
        <circle cx={point.x} cy={point.y} r={3.3} stroke="rgb(0 0 0 / 0.2)" strokeWidth={0.8} />
        <circle cx={point.x} cy={point.y} r={2.5} fill={color} stroke="#ffffff" strokeWidth={1.5} />
        <circle cx={51} cy={28} r={4.5} fill={color} stroke="var(--sf-surface, #fff)" strokeWidth={2} />
        <circle cx={51} cy={28} r={4.6} stroke="var(--sf-muted, #6c655c)" strokeWidth={0.8} />
      </svg>
    </span>
  );
}
