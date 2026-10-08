"use client";

import { cn } from "@/lib/cn";
import { IconMonitor, IconMoon, IconSun } from "@/components/ui/icons";
import { useTheme, type ThemePreference } from "./theme";

const OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  Icon: typeof IconSun;
}> = [
  { value: "light", label: "Light", Icon: IconSun },
  { value: "system", label: "System", Icon: IconMonitor },
  { value: "dark", label: "Dark", Icon: IconMoon },
];

/**
 * Three-state control rather than a binary switch: "follow the system" is a real
 * preference, and collapsing it into a toggle silently pins users to whichever
 * theme they happened to be on.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-line bg-surface-2 p-1",
        "shadow-xs",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setPreference(value)}
            className={cn(
              "relative grid size-11 place-items-center rounded-full transition-colors md:size-8",
              active ? "bg-accent text-on-accent" : "text-muted hover:text-ink",
            )}
          >
            <Icon size={15} className="relative z-10" />
          </button>
        );
      })}
    </div>
  );
}
