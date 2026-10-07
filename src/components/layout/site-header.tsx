import Link from "next/link";
import { FoxMarkStatic } from "@/components/brand/fox-mark-static";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { InstallApp } from "@/components/pwa/install-app";
import { IconArrowRight } from "@/components/ui/icons";
import { SiteMenu } from "./site-menu";
import { ToolsMegaMenu } from "./tools-mega-menu";
import { TOOL_NAVIGATION_GROUPS } from "@/lib/api/catalog";

const links = [
  { href: "/#tools", label: "All tools" },
  { href: "/remove-background", label: "Remove background" },
  { href: "/compress-image", label: "Compress" },
  { href: "/enhance-image", label: "Enhance" },
];
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/95 backdrop-blur-lg">
      <div className="sf-page-shell flex h-16 items-center gap-3 md:h-[76px] md:gap-5">
        <Link
          href="/"
          aria-label="ShrinkFox home"
          className="flex min-h-11 shrink-0 items-center gap-2.5"
        >
          <FoxMarkStatic size={34} />
          <span className="text-xl font-bold tracking-[-0.04em]">
            Shrink<span className="text-accent">Fox</span>
            <span className="ml-0.5 text-accent">.</span>
          </span>
        </Link>
        <nav
          aria-label="Main navigation"
          className="ml-5 hidden items-center gap-1 lg:flex"
        >
          <ToolsMegaMenu groups={TOOL_NAVIGATION_GROUPS} />
          {links.slice(1).map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="hidden min-h-11 items-center rounded-xl px-3 text-[13px] font-medium text-muted transition-colors hover:bg-surface-3 hover:text-ink xl:inline-flex"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <InstallApp className="hidden lg:inline-flex" />
          <div className="hidden md:block">
            <ThemeToggle />
          </div>
          <Link
            href="/app"
            className="hidden min-h-11 items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-xs font-semibold text-bg md:inline-flex"
          >
            Open workspace <IconArrowRight size={14} />
          </Link>
          <SiteMenu
            links={[
              ...links,
              { href: "/formats", label: "Formats & limits" },
              { href: "/app", label: "Open workspace" },
            ]}
          />
        </div>
      </div>
    </header>
  );
}
