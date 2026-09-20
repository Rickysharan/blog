import { Search } from "lucide-react";
import Link from "next/link";

import { CategoryNav } from "@/components/layout/category-nav";
import { MobileMenu } from "@/components/layout/mobile-menu";
import { InstallAppButton } from "@/components/pwa/install-app-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { SITE_CONFIG } from "@/lib/config/site";

export function SiteHeader() {
  return (
    <header className="relative z-30 bg-canvas text-ink">
      <div className="mx-auto max-w-[1480px] px-5 sm:px-8">
        <div className="flex min-h-32 items-center justify-between gap-5 py-6 sm:py-7">
          <Link href="/" className="group inline-flex flex-col">
            <span className="masthead-wordmark font-serif text-4xl font-semibold leading-none tracking-[-0.065em] group-hover:text-cobalt sm:text-6xl lg:text-7xl">
              {SITE_CONFIG.name}
            </span>
            <span className="mt-3 text-[0.62rem] font-black uppercase tracking-[0.35em] text-ink sm:text-xs">
              The world, clearly edited
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <p className="mr-2 hidden border-r border-line pr-6 font-serif text-lg text-ink/80 lg:block">
              Independent reporting, visibly sourced.
            </p>
            <ThemeToggle />
            <InstallAppButton />
            <Link
              href="/search"
              aria-label="Search OmniLede"
              className="hidden min-h-11 min-w-11 items-center justify-center border border-ink/20 transition-colors hover:border-signal hover:bg-signal md:inline-flex"
            >
              <Search aria-hidden="true" size={18} />
            </Link>
            <MobileMenu />
          </div>
        </div>
      </div>
      <div className="retro-nav-shell border-y-2 border-ink bg-signal text-signalInk">
        <div className="mx-auto max-w-[1480px] px-5 sm:px-8">
          <CategoryNav className="hidden py-4 md:block" />
        </div>
      </div>
    </header>
  );
}
