import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { ConsentManager } from "@/components/privacy/consent-manager";

describe("ConsentManager", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loads neither GA4 nor AdSense before consent", () => {
    render(
      <ConsentManager ga4Id="G-TEST" adsenseClientId="ca-pub-test" adsenseEnabled />,
    );

    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
    expect(document.querySelector('script[src*="adsbygoogle"]')).toBeNull();
    expect(screen.getByRole("button", { name: /accept optional cookies/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /decline optional cookies/i })).toBeVisible();
  });

  it("loads configured scripts only after accepting", async () => {
    const user = userEvent.setup();
    render(
      <ConsentManager ga4Id="G-TEST" adsenseClientId="ca-pub-test" adsenseEnabled />,
    );
    await user.click(
      screen.getByRole("button", { name: /accept optional cookies/i }),
    );

    expect(document.querySelector('script[src*="googletagmanager"]')).not.toBeNull();
    expect(document.querySelector('script[src*="adsbygoogle"]')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem("omnilede_consent_v1") ?? "null")).toMatchObject({
      version: 1,
      choice: "granted",
    });
  });

  it("stores a decline with equal prominence and keeps scripts blocked", async () => {
    const user = userEvent.setup();
    render(
      <ConsentManager ga4Id="G-TEST" adsenseClientId="ca-pub-test" adsenseEnabled />,
    );
    await user.click(
      screen.getByRole("button", { name: /decline optional cookies/i }),
    );

    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
    expect(document.querySelector('script[src*="adsbygoogle"]')).toBeNull();
    expect(JSON.parse(localStorage.getItem("omnilede_consent_v1") ?? "null")).toMatchObject({
      choice: "denied",
    });
  });

  it("ignores malformed stored consent and asks again", () => {
    localStorage.setItem("omnilede_consent_v1", "not-json");
    render(<ConsentManager ga4Id="G-TEST" adsenseEnabled={false} />);

    expect(screen.getByRole("button", { name: /accept optional cookies/i })).toBeVisible();
  });
});
