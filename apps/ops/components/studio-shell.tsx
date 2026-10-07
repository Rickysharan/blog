"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export const STUDIO_DESTINATIONS = [
  { label: "Overview", shortLabel: "Overview", href: "/overview", mark: "O" },
  { label: "Today", shortLabel: "Today", href: "/today", mark: "T" },
  { label: "Categories", shortLabel: "Categories", href: "/categories", mark: "C" },
  { label: "Content", shortLabel: "Content", href: "/content", mark: "D" },
  { label: "Growth", shortLabel: "Growth", href: "/growth", mark: "G" },
  { label: "Google Search", shortLabel: "Search", href: "/search", mark: "S" },
  { label: "Revenue", shortLabel: "Revenue", href: "/revenue", mark: "R" },
  { label: "Site health", shortLabel: "Health", href: "/health", mark: "H" },
  { label: "Connections", shortLabel: "Connect", href: "/settings/connections", mark: "K" }
] as const;

const PHONE_PRIMARY_HREFS = ["/today", "/categories", "/content", "/overview"] as const;
const PHONE_PRIMARY = PHONE_PRIMARY_HREFS.map((href) =>
  STUDIO_DESTINATIONS.find((destination) => destination.href === href)!
);
const PHONE_SECONDARY = STUDIO_DESTINATIONS.filter(
  (destination) => !PHONE_PRIMARY_HREFS.includes(destination.href as (typeof PHONE_PRIMARY_HREFS)[number])
);

type Destination = (typeof STUDIO_DESTINATIONS)[number];

function DestinationLink({
  destination,
  pathname,
  short = false,
  onSelect,
  moreDestination = false
}: {
  destination: Destination;
  pathname: string;
  short?: boolean;
  onSelect?: () => void;
  moreDestination?: boolean;
}) {
  return (
    <Link
      aria-current={pathname === destination.href ? "page" : undefined}
      aria-label={destination.label}
      className="studio-nav-link"
      data-more-destination={moreDestination ? "true" : undefined}
      href={destination.href}
      onClick={onSelect}
      prefetch={true}
    >
      <span className="studio-nav-mark" aria-hidden="true">{destination.mark}</span>
      <span className="studio-nav-label">{short ? destination.shortLabel : destination.label}</span>
    </Link>
  );
}

export function StudioShell({
  children,
  operatorEmail
}: Readonly<{ children: ReactNode; operatorEmail: string }>) {
  const pathname = usePathname();
  const sidebarRef = useRef<HTMLElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const moreDialogRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const expanded = hovered || focusWithin || pinned;

  const closeSidebar = () => {
    setHovered(false);
    setFocusWithin(false);
    setPinned(false);
  };

  const closeMore = (restoreFocus = false) => {
    if (restoreFocus) moreButtonRef.current?.focus();
    setMoreOpen(false);
  };

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") closeSidebar();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!sidebarRef.current?.contains(event.target as Node)) closeSidebar();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [expanded]);

  useEffect(() => {
    if (!moreOpen) return;
    requestAnimationFrame(() => {
      moreDialogRef.current?.querySelector<HTMLElement>("[data-more-destination]")?.focus();
    });
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") closeMore(true);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!moreDialogRef.current?.contains(target) && !moreButtonRef.current?.contains(target)) closeMore();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [moreOpen]);

  const trapMoreFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="studio-shell" data-layout="compact-rail" data-testid="studio-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside
        className="studio-sidebar"
        data-expanded={String(expanded)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusWithin(false);
        }}
        onFocus={() => setFocusWithin(true)}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        ref={sidebarRef}
      >
        <div className="studio-brand">
          <span className="studio-brand-mark" aria-hidden="true">OL</span>
          <div className="studio-brand-copy">
            <p className="eyebrow">Private control plane</p>
            <p className="studio-brand-name">OmniLede Studio</p>
          </div>
          <button
            aria-label={pinned ? "Unpin expanded navigation" : "Pin expanded navigation"}
            aria-pressed={pinned}
            className="studio-nav-pin"
            onClick={() => setPinned((value) => !value)}
            type="button"
          >
            <span aria-hidden="true">{pinned ? "×" : "•"}</span>
          </button>
        </div>
        <nav aria-label="Studio navigation" className="studio-navigation">
          {STUDIO_DESTINATIONS.map((destination) => (
            <DestinationLink destination={destination} key={destination.href} pathname={pathname} />
          ))}
        </nav>
        <p aria-label={operatorEmail} className="studio-operator" title={operatorEmail}>
          <span className="studio-operator-mark" aria-hidden="true">R</span>
          <span className="studio-operator-copy">Signed in as {operatorEmail}</span>
        </p>
      </aside>
      <main className="studio-main" id="main-content" tabIndex={-1}>{children}</main>

      {moreOpen ? (
        <div
          aria-label="More destinations"
          aria-modal="true"
          className="studio-phone-more"
          onKeyDown={trapMoreFocus}
          ref={moreDialogRef}
          role="dialog"
        >
          {PHONE_SECONDARY.map((destination) => (
            <DestinationLink
              destination={destination}
              key={destination.href}
              moreDestination
              onSelect={() => closeMore()}
              pathname={pathname}
              short
            />
          ))}
        </div>
      ) : null}
      <nav aria-label="Studio phone navigation" className="studio-phone-navigation">
        {PHONE_PRIMARY.map((destination) => (
          <DestinationLink destination={destination} key={destination.href} pathname={pathname} short />
        ))}
        <button
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          aria-label="More"
          className="studio-phone-more-button"
          onClick={() => setMoreOpen((value) => !value)}
          ref={moreButtonRef}
          type="button"
        >
          <span className="studio-nav-mark" aria-hidden="true">+</span>
          <span className="studio-nav-label">More</span>
        </button>
      </nav>
    </div>
  );
}
