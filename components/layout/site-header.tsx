import { Search } from "lucide-react";
import Link from "next/link";

import { CategoryNav } from "@/components/layout/category-nav";
import { MobileMenu } from "@/components/layout/mobile-menu";
import { SITE_CONFIG } from "@/lib/config/site";

export function SiteHeader() {
  return (
    <header className="relative border-b border-line bg-paper">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="flex min-h-20 items-center justify-between gap-5 py-4">
          <Link href="/" className="group inline-flex flex-col">
            <span className="font-serif text-3xl font-semibold leading-none tracking-[-0.04em] group-hover:underline">
              {SITE_CONFIG.name}
            </span>
            <span className="mt-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted">
              The world, clearly edited
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/search"
              aria-label="Search OmniLede"
              className="hidden min-h-11 min-w-11 items-center justify-center border border-line transition-colors hover:bg-line/30 md:inline-flex"
            >
              <Search aria-hidden="true" size={18} />
            </Link>
            <MobileMenu />
          </div>
        </div>
        <CategoryNav className="hidden border-t border-line py-3 md:block" />
      </div>
    </header>
  );
}
