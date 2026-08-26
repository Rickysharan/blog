import Link from "next/link";

import { CATEGORIES } from "@/lib/config/categories";
import { SITE_CONFIG } from "@/lib/config/site";

const policyLinks = [
  ["About", "/about"],
  ["Contact", "/contact"],
  ["Privacy", "/privacy"],
  ["Terms", "/terms"],
  ["Disclaimer", "/disclaimer"],
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line bg-ink text-paper">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1fr_2fr]">
        <div>
          <Link href="/" className="font-serif text-3xl font-semibold tracking-[-0.035em]">
            {SITE_CONFIG.name}
          </Link>
          <p className="mt-3 max-w-sm text-sm leading-6 text-paper/70">
            Independent-format global explainers, reviewed before publication and always linked to their source.
          </p>
        </div>
        <div className="grid gap-8 sm:grid-cols-2">
          <nav aria-label="Footer news desks">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-paper/60">Desks</p>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {CATEGORIES.map((category) => (
                <li key={category.slug}>
                  <Link className="hover:underline" href={`/category/${category.slug}`}>
                    {category.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Publication information">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-paper/60">Information</p>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {policyLinks.map(([label, href]) => (
                <li key={href}>
                  <Link className="hover:underline" href={href}>{label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
      <div className="border-t border-paper/15 px-5 py-4 text-center text-xs text-paper/60">
        © {new Date().getUTCFullYear()} {SITE_CONFIG.name}. Example editorial content is provided for demonstration.
      </div>
    </footer>
  );
}
