"use client";

import { Menu, Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { CategoryNav } from "@/components/layout/category-nav";
import { MobileMenu } from "@/components/layout/mobile-menu";
import { InstallAppButton } from "@/components/pwa/install-app-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { SITE_CONFIG } from "@/lib/config/site";

export function DesktopCategoryReveal() {
  const root = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = pinned || (!dismissed && (hovered || focusWithin));

  function close() {
    setHovered(false);
    setFocusWithin(false);
    setPinned(false);
    setDismissed(true);
  }

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div
      ref={root}
      data-open={open}
      data-testid="desktop-category-reveal"
      onPointerEnter={() => { setHovered(true); setDismissed(false); }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => { setFocusWithin(true); setDismissed(false); }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocusWithin(false);
          setHovered(false);
        }
      }}
    >
      <div className="relative z-40 bg-canvas">
        <div className="mx-auto max-w-[1480px] px-5 sm:px-8">
          <div className="flex min-h-32 items-center justify-between gap-5 py-6 sm:py-7">
            <Link href="/" className="group inline-flex flex-col">
              <span className="masthead-wordmark font-serif text-4xl font-semibold leading-none tracking-[-0.065em] group-hover:text-cobalt sm:text-6xl lg:text-7xl">
                {SITE_CONFIG.name}
              </span>
              <span className="mt-3 text-[0.62rem] font-black uppercase tracking-[0.35em] text-ink sm:text-xs">The world, clearly edited</span>
            </Link>
            <div className="flex items-center gap-2 sm:gap-3">
              <p className="mr-2 hidden border-r border-line pr-6 font-serif text-lg text-ink/80 lg:block">Independent reporting, visibly sourced.</p>
              <ThemeToggle />
              <InstallAppButton />
              <Link href="/search" aria-label="Search OmniLede" className="hidden min-h-11 min-w-11 items-center justify-center border border-ink/20 transition-colors hover:border-signal hover:bg-signal md:inline-flex">
                <Search aria-hidden="true" size={18} />
              </Link>
              <button
                type="button"
                aria-expanded={open}
                aria-controls="desktop-news-desks"
                aria-label={open ? "Close news desks" : "Open news desks"}
                onClick={() => {
                  if (pinned) close();
                  else { setPinned(true); setDismissed(false); }
                }}
                className="hidden min-h-11 min-w-11 items-center justify-center border border-ink/20 transition-colors hover:border-signal hover:bg-signal md:inline-flex"
              >
                {open ? <X aria-hidden="true" size={20} /> : <Menu aria-hidden="true" size={20} />}
              </button>
              <MobileMenu />
            </div>
          </div>
        </div>
      </div>
      <div className="desktop-category-panel retro-nav-shell border-y-2 border-ink bg-signal text-signalInk">
        <div className="mx-auto max-w-[1480px] px-5 sm:px-8">
          <CategoryNav id="desktop-news-desks" ariaHidden={!open} focusable={open} onNavigate={close} className="py-4" />
        </div>
      </div>
    </div>
  );
}
