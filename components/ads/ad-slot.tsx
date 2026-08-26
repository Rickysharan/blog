"use client";

import { useEffect } from "react";

import { useConsent } from "@/components/privacy/consent-manager";

type AdVariant = "header" | "article" | "sidebar" | "footer";

const variantClasses: Record<AdVariant, string> = {
  header: "min-h-24",
  article: "min-h-48",
  sidebar: "min-h-64",
  footer: "min-h-24",
};

function validClient(value: string | undefined): value is string {
  return Boolean(value && /^ca-pub-[A-Z0-9-]+$/i.test(value));
}

export function AdSlot({
  variant,
  adsenseEnabled,
  adsenseClientId,
}: {
  variant: AdVariant;
  adsenseEnabled: boolean;
  adsenseClientId?: string;
}) {
  const { choice } = useConsent();
  const active = adsenseEnabled && choice === "granted" && validClient(adsenseClientId);

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
        aria-label="Advertisement placeholder"
        className={`flex items-center justify-center rounded-xl border border-dashed border-line bg-panel/50 px-4 py-6 text-center ${variantClasses[variant]}`}
      >
        <span className="text-xs font-bold uppercase tracking-[0.16em] text-muted">
          Advertisement placeholder
        </span>
      </aside>
    );
  }

  // TODO(adsense): replace the placeholder data-ad-slot with the approved AdSense unit ID before enabling ads.
  return (
    <aside aria-label="Advertisement" className={variantClasses[variant]}>
      <ins
        className="adsbygoogle block"
        data-ad-client={adsenseClientId}
        data-ad-format="auto"
        data-ad-slot="0000000000"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
