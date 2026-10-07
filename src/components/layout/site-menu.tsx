"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { InstallApp } from "@/components/pwa/install-app";
import { ThemeToggle } from "@/components/theme/theme-toggle";

interface SiteMenuProps {
  links: readonly { href: string; label: string }[];
}

export function SiteMenu({ links }: SiteMenuProps) {
  const menu = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (
        menu.current?.open &&
        event.target instanceof Node &&
        !menu.current.contains(event.target)
      ) {
        menu.current.open = false;
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  return (
    <details
      ref={menu}
      className="relative lg:hidden"
      onKeyDown={(event) => {
        if (event.key === "Escape" && menu.current?.open) {
          menu.current.open = false;
          menu.current.querySelector("summary")?.focus();
          event.stopPropagation();
        }
      }}
      onClick={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest("a") &&
          menu.current
        ) {
          menu.current.open = false;
        }
      }}
    >
      <summary
        aria-label="Menu"
        className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-medium [&::-webkit-details-marker]:hidden"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        Menu
      </summary>
      <nav
        aria-label="Mobile navigation"
        className="sf-menu-panel absolute right-0 top-14 max-h-[calc(100dvh-10rem)] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-line bg-surface p-3 shadow-lg"
      >
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex min-h-11 items-center rounded-xl px-3 py-3 text-sm hover:bg-surface-3"
          >
            {link.label}
          </Link>
        ))}
        <div className="border-t border-line px-3 pt-3 xl:hidden">
          <InstallApp />
        </div>
        <div className="px-3 pb-1 pt-3 md:hidden">
          <ThemeToggle />
        </div>
      </nav>
    </details>
  );
}
