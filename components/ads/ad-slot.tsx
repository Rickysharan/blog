"use client";

import { useEffect } from "react";
import Link from "next/link";

import { useConsent } from "@/components/privacy/consent-manager";

type AdVariant = "header" | "article" | "sidebar" | "footer";

const variantClasses: Record<AdVariant, string> = {
  header: "min-h-28 sm:min-h-32",
  article: "min-h-48",
  sidebar: "min-h-64",
  footer: "min-h-24",
};

const houseLayoutClasses: Record<AdVariant, string> = {
  header: "sm:grid-cols-[1fr_auto] sm:items-center sm:gap-8 sm:px-8",
  article: "sm:grid-cols-[1fr_auto] sm:items-center sm:gap-8 sm:px-8",
  sidebar: "text-left",
  footer: "sm:grid-cols-[1fr_auto] sm:items-center sm:gap-8 sm:px-8",
};

const houseLinkClasses: Record<AdVariant, string> = {
  header: "sm:mt-0",
  article: "sm:mt-0",
  sidebar: "",
  footer: "sm:mt-0",
};

function validClient(value: string | undefined): value is string {
  return Boolean(value && /^ca-pub-[A-Z0-9-]+$/i.test(value));
}

function validSlot(value: string | undefined): value is string {
  return Boolean(value && /^\d{6,20}$/.test(value));
}

export function AdSlot({
  variant,
  adsenseEnabled,
  adsenseClientId,
  slotId,
}: {
  variant: AdVariant;
  adsenseEnabled: boolean;
  adsenseClientId?: string;
  slotId?: string;
}) {
  const { choice } = useConsent();
  const active =
    adsenseEnabled &&
    choice === "granted" &&
    validClient(adsenseClientId) &&
    validSlot(slotId);

  useEffect(() => {
    if (!active) {
      return;
    }
    try {
      const scope = window as typeof window & { adsbygoogle?: unknown[] };
      (scope.adsbygoogle ??= []).push({});
    } catch {
      // Ad blockers and provider failures must never break article rendering.
    }
  }, [active]);

  if (!active) {
    return (
      <aside
        aria-label="Advertisement"
        className={`grid content-center border border-line border-l-4 border-l-signal bg-canvas px-5 py-5 text-ink ${houseLayoutClasses[variant]} ${variantClasses[variant]}`}
      >
        <div>
          <p className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-muted">
            Advertisement
          </p>
          <p className="mt-2 font-serif text-2xl font-semibold leading-tight sm:text-3xl">
            Reach globally curious readers.
          </p>
        </div>
        <Link
          href="/contact?subject=advertising"
          className={`mt-4 inline-flex min-h-11 items-center justify-center border-2 border-ink bg-signal px-5 text-xs font-black uppercase tracking-[0.14em] text-signalInk transition-colors hover:bg-ink hover:text-signal ${houseLinkClasses[variant]}`}
        >
          Advertise with OmniLede
        </Link>
      </aside>
    );
  }

  return (
    <aside aria-label="Advertisement" className={variantClasses[variant]}>
      <ins
        className="adsbygoogle block"
        data-ad-client={adsenseClientId}
        data-ad-format="auto"
        data-ad-slot={slotId}
        data-full-width-responsive="true"
      />
    </aside>
  );
}
