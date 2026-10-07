"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconCrop, IconLayers, IconOptimize } from "@/components/ui/icons";

function HomeIcon({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m3 10 9-7 9 7M5 9v11h5v-6h4v6h5V9" />
    </svg>
  );
}

const items = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/app", label: "Workspace", icon: IconLayers },
  { href: "/remove-background", label: "Remove BG", icon: IconCrop },
  { href: "/enhance-image", label: "Enhance", icon: IconOptimize },
] as const;

export function MobileNavigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="Bottom navigation" className="sf-mobile-nav md:hidden">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            prefetch={false}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] font-medium transition-colors active:bg-surface-3 ${active ? "text-accent" : "text-muted hover:text-ink"}`}
          >
            <span
              className={`grid h-7 w-12 place-items-center rounded-full ${active ? "bg-accent-soft" : ""}`}
            >
              <Icon size={22} />
            </span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNavigationSkeleton() {
  return (
    <div aria-hidden="true" className="sf-mobile-nav md:hidden">
      {items.map(({ label }) => (
        <div
          key={label}
          className="flex min-h-14 flex-col items-center justify-center gap-2"
        >
          <span className="h-6 w-10 animate-pulse rounded-full bg-surface-3" />
          <span className="h-2 w-12 animate-pulse rounded bg-surface-3" />
        </div>
      ))}
    </div>
  );
}
