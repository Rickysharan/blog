import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InstallAppButton } from "@/components/pwa/install-app-button";
import {
  InstallProvider,
  type BeforeInstallPromptEvent,
} from "@/components/pwa/install-provider";
import {
  IOS_INSTALL_DISMISSAL_KEY,
  IosInstallBanner,
} from "@/components/pwa/ios-install-banner";

class MockBeforeInstallPromptEvent extends Event implements BeforeInstallPromptEvent {
  readonly platforms = ["web"];
  readonly prompt = vi.fn(async () => undefined);
  readonly userChoice = Promise.resolve({ outcome: "accepted" as const, platform: "web" });

  constructor() {
    super("beforeinstallprompt", { cancelable: true });
  }
}

function setNavigatorProperty(name: string, value: unknown) {
  Object.defineProperty(window.navigator, name, { configurable: true, value });
}

function setStandalone(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === "(display-mode: standalone)" && matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("PWA install controls", () => {
  const originalUserAgent = window.navigator.userAgent;
  const originalPlatform = window.navigator.platform;
  const originalMaxTouchPoints = window.navigator.maxTouchPoints;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    setNavigatorProperty("userAgent", originalUserAgent);
    setNavigatorProperty("platform", originalPlatform);
    setNavigatorProperty("maxTouchPoints", originalMaxTouchPoints);
    setStandalone(false);
  });

  afterEach(() => {
    setNavigatorProperty("userAgent", originalUserAgent);
    setNavigatorProperty("platform", originalPlatform);
    setNavigatorProperty("maxTouchPoints", originalMaxTouchPoints);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: originalMatchMedia,
    });
  });

  it("shows the install button only after beforeinstallprompt is captured", () => {
    render(
      <InstallProvider>
        <InstallAppButton />
      </InstallProvider>,
    );

    expect(screen.queryByRole("button", { name: /install app/i })).not.toBeInTheDocument();

    fireEvent(window, new MockBeforeInstallPromptEvent());

    expect(screen.getByRole("button", { name: /install app/i })).toBeVisible();
  });

  it("prompts once and hides the install button after a decision", async () => {
    const user = userEvent.setup();
    const installEvent = new MockBeforeInstallPromptEvent();
    render(
      <InstallProvider>
        <InstallAppButton />
      </InstallProvider>,
    );

    fireEvent(window, installEvent);
    await user.click(screen.getByRole("button", { name: /install app/i }));

    expect(installEvent.prompt).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /install app/i })).not.toBeInTheDocument();
    });
  });

  it("shows iOS instructions only for non-standalone Safari after consent is settled", () => {
    setNavigatorProperty(
      "userAgent",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    );
    setNavigatorProperty("platform", "iPhone");

    const { rerender } = render(<IosInstallBanner consentResolved={false} />);
    expect(screen.queryByText(/tap the share/i)).not.toBeInTheDocument();

    rerender(<IosInstallBanner consentResolved />);
    expect(screen.getByText(/tap the share/i)).toBeVisible();

    setStandalone(true);
    rerender(<IosInstallBanner consentResolved />);
    expect(screen.queryByText(/tap the share/i)).not.toBeInTheDocument();
  });

  it("persists a versioned iOS install dismissal", async () => {
    const user = userEvent.setup();
    setNavigatorProperty(
      "userAgent",
      "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    );
    setNavigatorProperty("platform", "iPad");
    render(<IosInstallBanner consentResolved />);

    await user.click(screen.getByRole("button", { name: /dismiss install instructions/i }));

    expect(window.localStorage.getItem(IOS_INSTALL_DISMISSAL_KEY)).toBe("dismissed");
    expect(screen.queryByText(/tap the share/i)).not.toBeInTheDocument();
  });

  it("does not show iOS guidance in an alternative iOS browser", () => {
    setNavigatorProperty(
      "userAgent",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/128.0 Mobile/15E148 Safari/604.1",
    );
    setNavigatorProperty("platform", "iPhone");

    render(<IosInstallBanner consentResolved />);

    expect(screen.queryByText(/tap share/i)).not.toBeInTheDocument();
  });
});
