"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  IconArrowRight,
  IconChevronDown,
  IconCompress,
  IconConvert,
  IconCrop,
  IconLayers,
  IconOptimize,
  IconResize,
} from "@/components/ui/icons";
import type { ToolIcon as ToolIconName } from "@/types/catalog";

export interface MegaMenuGroup {
  id: string;
  label: string;
  tools: readonly {
    href: string;
    label: string;
    description?: string;
    icon?: ToolIconName;
  }[];
}

const toolIcons = {
  compress: IconCompress,
  cutout: IconCrop,
  resize: IconResize,
  convert: IconConvert,
  enhance: IconOptimize,
  layers: IconLayers,
} satisfies Record<ToolIconName, typeof IconCompress>;

const OPEN_DELAY = 80;
const CLOSE_DELAY = 140;

export function ToolsMegaMenu({
  groups,
}: {
  groups: readonly MegaMenuGroup[];
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusFrame = useRef<number | null>(null);
  const id = useId();
  const panelId = `${id}-tools`;
  const triggerId = `${id}-trigger`;

  const clearTimers = useCallback(() => {
    if (openTimer.current !== null) clearTimeout(openTimer.current);
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    openTimer.current = null;
    closeTimer.current = null;
    focusFrame.current = null;
  }, []);

  const close = useCallback(
    (restoreFocus = false) => {
      clearTimers();
      setOpen(false);
      if (restoreFocus) trigger.current?.focus();
    },
    [clearTimers],
  );

  const openImmediately = useCallback(
    (focusFirst = false) => {
      clearTimers();
      setOpen(true);
      if (focusFirst) {
        focusFrame.current = requestAnimationFrame(() => {
          focusFrame.current = null;
          panel.current?.querySelector<HTMLAnchorElement>("a[href]")?.focus();
        });
      }
    },
    [clearTimers],
  );

  const enter = useCallback(() => {
    clearTimers();
    if (!open) {
      openTimer.current = setTimeout(() => {
        openTimer.current = null;
        setOpen(true);
      }, OPEN_DELAY);
    }
  }, [clearTimers, open]);

  const leave = useCallback(() => {
    clearTimers();
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      // Keyboard navigation keeps its focused link available even when the
      // pointer happens to leave the panel. Blur/Escape still close it.
      if (!panel.current?.contains(document.activeElement)) setOpen(false);
    }, CLOSE_DELAY);
  }, [clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        close();
    };
    const viewport = window.matchMedia("(min-width: 1024px)");
    const onViewportChange = () => {
      if (!viewport.matches) close();
    };
    document.addEventListener("pointerdown", outside, true);
    viewport.addEventListener("change", onViewportChange);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      viewport.removeEventListener("change", onViewportChange);
    };
  }, [close, open]);

  return (
    <div
      ref={root}
      className="static hidden lg:block"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") enter();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") leave();
      }}
      onBlur={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          close();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && (open || openTimer.current !== null)) {
          event.preventDefault();
          event.stopPropagation();
          close(true);
        }
      }}
    >
      <button
        ref={trigger}
        id={triggerId}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (open) close();
          else openImmediately();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            openImmediately(true);
          }
        }}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-[13px] font-medium transition-colors hover:bg-surface-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${open ? "bg-surface-3 text-ink" : "text-muted"}`}
      >
        All tools
        <IconChevronDown
          size={16}
          className={`transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : "rotate-0"}`}
        />
      </button>

      <div
        ref={panel}
        id={panelId}
        role="region"
        aria-labelledby={triggerId}
        aria-hidden={!open}
        inert={!open}
        data-state={open ? "open" : "closed"}
        style={{
          left: "max(var(--sf-page-gutter), env(safe-area-inset-left, 0px))",
          right: "max(var(--sf-page-gutter), env(safe-area-inset-right, 0px))",
        }}
        className={`absolute top-full z-50 origin-top pt-3 transition-[opacity,transform] duration-[180ms] ease-out motion-reduce:transform-none motion-reduce:transition-none ${open ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0"}`}
      >
        <div className="max-h-[min(75dvh,38rem)] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface shadow-xl">
          <div className="grid grid-cols-4 gap-5 p-5 xl:gap-8 xl:p-6">
            {groups.map((group) => (
              <section
                key={group.id}
                aria-labelledby={`${id}-${group.id}`}
                className="min-w-0"
              >
                <h2
                  id={`${id}-${group.id}`}
                  className="mb-2 px-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-faint"
                >
                  {group.label}
                </h2>
                <ul className="space-y-0.5">
                  {group.tools.map((tool) => {
                    const Icon = tool.icon
                      ? toolIcons[tool.icon]
                      : IconArrowRight;
                    return (
                      <li key={tool.href}>
                        <Link
                          href={tool.href}
                          onClick={() => close()}
                          prefetch={false}
                          className="group flex min-h-11 items-start gap-2.5 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-surface-3 focus-visible:bg-surface-3 focus-visible:outline-2 focus-visible:outline-accent"
                        >
                          <Icon
                            size={16}
                            className="mt-0.5 shrink-0 text-muted transition-colors group-hover:text-ink"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium leading-5 text-ink">
                              {tool.label}
                            </span>
                            {tool.description && (
                              <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                                {tool.description}
                              </span>
                            )}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-line bg-surface-2 px-7 py-3 xl:px-8">
            <p className="text-xs text-muted">Choose a tool to get started.</p>
            <Link
              href="/#tools"
              onClick={() => close()}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-sm font-semibold text-ink hover:text-accent-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Explore all tools <IconArrowRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
