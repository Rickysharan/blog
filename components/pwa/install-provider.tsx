"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt: () => Promise<void>;
}

type InstallContextValue = {
  canInstall: boolean;
  promptInstall: () => Promise<InstallOutcome>;
};

const InstallContext = createContext<InstallContextValue>({
  canInstall: false,
  promptInstall: async () => "unavailable",
});

export function useInstall(): InstallContextValue {
  return useContext(InstallContext);
}

export function InstallProvider({ children }: { children: ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => setDeferredPrompt(null);

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    const event = deferredPrompt;
    if (!event) {
      return "unavailable";
    }

    setDeferredPrompt(null);
    try {
      await event.prompt();
      const choice = await event.userChoice;
      return choice.outcome;
    } catch {
      return "dismissed";
    }
  }, [deferredPrompt]);

  const context = useMemo(
    () => ({ canInstall: deferredPrompt !== null, promptInstall }),
    [deferredPrompt, promptInstall],
  );

  return <InstallContext.Provider value={context}>{children}</InstallContext.Provider>;
}
