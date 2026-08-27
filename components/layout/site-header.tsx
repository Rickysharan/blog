import { Search } from "lucide-react";
import Link from "next/link";

import { CategoryNav } from "@/components/layout/category-nav";
import { MobileMenu } from "@/components/layout/mobile-menu";
import { InstallAppButton } from "@/components/pwa/install-app-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { SITE_CONFIG } from "@/lib/config/site";

export function SiteHeader() {
  return (
    <header className="relative z-30 bg-brand text-brandInk">
      <div className="border-b border-brandInk/15">
        <div className="mx-auto flex min-h-9 max-w-7xl items-center justify-between gap-4 px-5 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-brandInk/65 sm:px-8">
          <p>Independent global briefing</p>
          <nav aria-label="Publication links" className="hidden items-center gap-5 sm:flex">
            <Link className="hover:text-signal" href="/about">About</Link>
            <Link className="hover:text-signal" href="/contact?subject=advertising">Advertise</Link>
            <Link className="hover:text-signal" href="/feed.xml">RSS</Link>
          </nav>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="flex min-h-24 items-center justify-between gap-5 py-5">
          <Link href="/" className="group inline-flex flex-col">
            <span className="font-serif text-4xl font-semibold leading-none tracking-[-0.055em] group-hover:text-signal sm:text-5xl">
              {SITE_CONFIG.name}
            </span>
            <span className="mt-2 text-[0.62rem] font-black uppercase tracking-[0.24em] text-signal">
              The world, clearly edited
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <InstallAppButton />
            <Link
              href="/search"
              aria-label="Search OmniLede"
              className="hidden min-h-11 min-w-11 items-center justify-center border border-brandInk/30 transition-colors hover:border-signal hover:text-signal md:inline-flex"
            >
              <Search aria-hidden="true" size={18} />
            </Link>
            <MobileMenu />
          </div>
        </div>
      </div>
      <div className="bg-signal text-signalInk">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <CategoryNav className="hidden py-3 md:block" />
        </div>
      </div>
    </header>
  );
}
