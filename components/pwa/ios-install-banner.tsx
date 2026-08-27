"use client";

import { Share, X } from "lucide-react";
import { useSyncExternalStore } from "react";

import { useConsent } from "@/components/privacy/consent-manager";

export const IOS_INSTALL_DISMISSAL_KEY = "omnilede_ios_install_v1";

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent;
  const iosDevice = /iPad|iPhone|iPod/.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const safari = /Safari\//.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent);
  return iosDevice && safari;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function platformSnapshot(): boolean {
  return isIosSafari() && !isStandalone();
}

function subscribeToPlatform(onStoreChange: () => void): () => void {
  const mediaQuery = window.matchMedia("(display-mode: standalone)");
  mediaQuery.addEventListener?.("change", onStoreChange);
  window.addEventListener("pageshow", onStoreChange);
  return () => {
    mediaQuery.removeEventListener?.("change", onStoreChange);
    window.removeEventListener("pageshow", onStoreChange);
  };
}

function dismissalSnapshot(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(IOS_INSTALL_DISMISSAL_KEY);
}

function subscribeToDismissal(onStoreChange: () => void): () => void {
  const storageChanged = (event: StorageEvent) => {
    if (event.key === IOS_INSTALL_DISMISSAL_KEY) {
      onStoreChange();
    }
  };
  window.addEventListener("storage", storageChanged);
  window.addEventListener("omnilede:ios-install-dismissed", onStoreChange);
  return () => {
    window.removeEventListener("storage", storageChanged);
    window.removeEventListener("omnilede:ios-install-dismissed", onStoreChange);
  };
}

export function IosInstallBanner({ consentResolved }: { consentResolved?: boolean } = {}) {
  const { choice } = useConsent();
  const consentIsSettled = consentResolved ?? choice !== null;
  const platformEligible = useSyncExternalStore(subscribeToPlatform, platformSnapshot, () => false);
  const dismissed = useSyncExternalStore(
    subscribeToDismissal,
    dismissalSnapshot,
    () => null,
  ) === "dismissed";

  if (!consentIsSettled || !platformEligible || dismissed) {
    return null;
  }

  function dismiss() {
    try {
      window.localStorage.setItem(IOS_INSTALL_DISMISSAL_KEY, "dismissed");
    } catch {
      // A blocked storage API should not prevent the reader from dismissing this hint.
    }
    window.dispatchEvent(new Event("omnilede:ios-install-dismissed"));
  }

  return (
    <aside
      aria-label="Install OmniLede on iPhone or iPad"
      className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-lg border border-line bg-paper p-5 shadow-[0_10px_40px_rgba(17,21,22,0.18)]"
    >
      <div className="flex items-start gap-4">
        <div className="mt-1 flex size-9 shrink-0 items-center justify-center border border-line bg-ink text-paper">
          <Share aria-hidden="true" size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-serif text-xl font-semibold">Keep OmniLede close</p>
          <p className="mt-1 text-sm leading-6 text-muted">
            Tap the Share button, then choose <span className="font-semibold text-ink">Add to Home Screen</span> for a fast, app-like reading experience.
          </p>
        </div>
        <button
          aria-label="Dismiss install instructions"
          className="min-h-11 min-w-11 border border-line text-muted transition-colors hover:bg-line/30 hover:text-ink"
          onClick={dismiss}
          type="button"
        >
          <X aria-hidden="true" className="mx-auto" size={17} />
        </button>
      </div>
    </aside>
  );
}
