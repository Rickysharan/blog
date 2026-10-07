import Link from "next/link";

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

function NavigationLinks({ compact = false }: { compact?: boolean }) {
  return STUDIO_DESTINATIONS.map((destination) => (
    <Link
      aria-label={compact ? destination.label : undefined}
      className="studio-nav-link"
      href={destination.href}
      key={destination.href}
      prefetch={true}
    >
      <span className="studio-nav-mark" aria-hidden="true">{destination.mark}</span>
      <span>{compact ? destination.shortLabel : destination.label}</span>
    </Link>
  ));
}

export function StudioShell({
  children,
  operatorEmail
}: Readonly<{ children: React.ReactNode; operatorEmail: string }>) {
  return (
    <div className="studio-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="studio-sidebar">
        <div className="studio-brand">
          <span className="studio-brand-mark" aria-hidden="true">OL</span>
          <div>
            <p className="eyebrow">Private control plane</p>
            <p className="studio-brand-name">OmniLede Studio</p>
          </div>
        </div>
        <nav aria-label="Studio navigation" className="studio-navigation">
          <NavigationLinks />
        </nav>
        <p className="studio-operator" title={operatorEmail}>Signed in as {operatorEmail}</p>
      </aside>
      <main className="studio-main" id="main-content" tabIndex={-1}>{children}</main>
      <nav aria-label="Studio phone navigation" className="studio-phone-navigation">
        <NavigationLinks compact />
      </nav>
    </div>
  );
}
