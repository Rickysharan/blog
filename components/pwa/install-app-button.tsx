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
      className="inline-flex min-h-11 items-center gap-2 border border-line px-3 text-xs font-semibold uppercase tracking-[0.12em] transition-colors hover:bg-line/30"
      onClick={() => void promptInstall()}
      type="button"
    >
      <Download aria-hidden="true" size={16} />
      <span className="hidden sm:inline">Install app</span>
    </button>
  );
}
