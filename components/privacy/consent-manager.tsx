"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { ConsentBanner } from "@/components/privacy/consent-banner";
import { ThirdPartyScripts } from "@/components/privacy/third-party-scripts";

export const CONSENT_STORAGE_KEY = "omnilede_consent_v1";
export const OPEN_CONSENT_EVENT = "omnilede:open-consent";
const CONSENT_CHANGED_EVENT = "omnilede:consent-changed";

export type ConsentChoice = "granted" | "denied";

type StoredConsent = {
  version: 1;
  choice: ConsentChoice;
  updatedAt: string;
};

type ConsentContextValue = {
  choice: ConsentChoice | null;
  openSettings: () => void;
};

const ConsentContext = createContext<ConsentContextValue>({
  choice: null,
  openSettings: () => undefined,
});

function readStoredConsent(): StoredConsent | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const value = parsed as Record<string, unknown>;
    return value.version === 1 &&
      (value.choice === "granted" || value.choice === "denied") &&
      typeof value.updatedAt === "string"
      ? (value as StoredConsent)
      : null;
  } catch {
    return null;
  }
}

function storeConsent(choice: ConsentChoice): void {
  try {
    localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ version: 1, choice, updatedAt: new Date().toISOString() }),
    );
  } catch {
    // A blocked storage API should not prevent the reader from using the site.
  }
  window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT));
}

function subscribeToConsent(onStoreChange: () => void): () => void {
  const storageChanged = (event: StorageEvent) => {
    if (event.key === CONSENT_STORAGE_KEY) {
      onStoreChange();
    }
  };
  window.addEventListener(CONSENT_CHANGED_EVENT, onStoreChange);
  window.addEventListener("storage", storageChanged);
  return () => {
    window.removeEventListener(CONSENT_CHANGED_EVENT, onStoreChange);
    window.removeEventListener("storage", storageChanged);
  };
}

function consentSnapshot(): ConsentChoice | null {
  return readStoredConsent()?.choice ?? null;
}

export function useConsent(): ConsentContextValue {
  return useContext(ConsentContext);
}

export function ConsentManager({
  children,
  ga4Id,
  adsenseClientId,
  adsenseEnabled,
}: {
  children?: ReactNode;
  ga4Id?: string;
  adsenseClientId?: string;
  adsenseEnabled: boolean;
}) {
  const choice = useSyncExternalStore(subscribeToConsent, consentSnapshot, () => null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const open = () => setSettingsOpen(true);
    window.addEventListener(OPEN_CONSENT_EVENT, open);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, open);
  }, []);

  function choose(nextChoice: ConsentChoice) {
    const withdrawing = choice === "granted" && nextChoice === "denied";
    storeConsent(nextChoice);
    setSettingsOpen(false);
    if (withdrawing) {
      window.location.reload();
    }
  }

  const context = useMemo<ConsentContextValue>(
    () => ({ choice, openSettings: () => setSettingsOpen(true) }),
    [choice],
  );

  const showBanner = choice === null || settingsOpen;

  return (
    <ConsentContext.Provider value={context}>
      {children}
      {choice === "granted" ? (
        <ThirdPartyScripts
          adsenseClientId={adsenseClientId}
          adsenseEnabled={adsenseEnabled}
          ga4Id={ga4Id}
        />
      ) : null}
      {showBanner ? (
        <ConsentBanner
          onAccept={() => choose("granted")}
          onDecline={() => choose("denied")}
        />
      ) : null}
    </ConsentContext.Provider>
  );
}

export function ConsentSettingsButton() {
  const { openSettings } = useConsent();
  return (
    <button className="hover:underline" onClick={openSettings} type="button">
      Cookie settings
    </button>
  );
}
