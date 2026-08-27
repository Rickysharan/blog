"use client";

import { Download } from "lucide-react";

import { useInstall } from "@/components/pwa/install-provider";

export function InstallAppButton() {
  const { canInstall, promptInstall } = useInstall();

  if (!canInstall) {
    return null;
  }

  return (
    <button
      aria-label="Install app"
    className="inline-flex min-h-11 items-center gap-2 border border-ink/20 px-3 text-xs font-black uppercase tracking-[0.12em] text-ink transition-colors hover:border-signal hover:bg-signal"
      onClick={() => void promptInstall()}
      type="button"
    >
      <Download aria-hidden="true" size={16} />
      <span className="hidden sm:inline">Install app</span>
    </button>
  );
}
