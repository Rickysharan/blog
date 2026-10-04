import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { AdSlot } from "@/components/ads/ad-slot";
import { ConsentManager } from "@/components/privacy/consent-manager";

describe("AdSlot", () => {
  beforeEach(() => localStorage.clear());

  it("shows an editorial note without commercial invitations in preparation mode", () => {
    render(
      <ConsentManager adsenseEnabled={false}>
        <AdSlot
          variant="header"
          adsenseEnabled={false}
          commercialEnabled={false}
        />
      </ConsentManager>,
    );

    expect(screen.getByRole("complementary", { name: /publication note/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /how omnilede works/i })).toHaveAttribute("href", "/about");
    expect(screen.queryByRole("link", { name: /advertise with omnilede/i })).toBeNull();
    expect(screen.queryByText(/^advertisement$/i)).toBeNull();
    expect(document.querySelector("ins.adsbygoogle")).toBeNull();
  });

  it("renders a labelled house ad when third-party advertising is disabled", () => {
    render(
      <ConsentManager adsenseEnabled={false}>
        <AdSlot variant="header" commercialEnabled adsenseEnabled={false} />
      </ConsentManager>,
    );

    expect(
      screen.getByRole("link", { name: /advertise with omnilede/i }),
    ).toHaveAttribute("href", "/contact?subject=advertising");
    expect(screen.getByText(/reach globally curious readers/i)).toBeVisible();
    expect(screen.queryByText("Advertisement placeholder")).toBeNull();
    expect(document.querySelector("ins.adsbygoogle")).toBeNull();
  });

  it("creates an ad unit only after consent when advertising is enabled", async () => {
    const user = userEvent.setup();
    render(
      <ConsentManager adsenseClientId="ca-pub-1234567890123456" adsenseEnabled>
        <AdSlot
          variant="article"
          commercialEnabled
          adsenseClientId="ca-pub-1234567890123456"
          slotId="1234567890"
          adsenseEnabled
        />
      </ConsentManager>,
    );

    expect(document.querySelector("ins.adsbygoogle")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: /accept optional cookies/i }),
    );
    expect(document.querySelector("ins.adsbygoogle")).toHaveAttribute(
      "data-ad-slot",
      "1234567890",
    );
  });

  it("keeps the house ad when an approved slot id is missing", async () => {
    const user = userEvent.setup();
    render(
      <ConsentManager adsenseClientId="ca-pub-1234567890123456" adsenseEnabled>
        <AdSlot
          variant="article"
          commercialEnabled
          adsenseClientId="ca-pub-1234567890123456"
          adsenseEnabled
        />
      </ConsentManager>,
    );

    await user.click(
      screen.getByRole("button", { name: /accept optional cookies/i }),
    );
    expect(document.querySelector("ins.adsbygoogle")).toBeNull();
    expect(
      screen.getByRole("link", { name: /advertise with omnilede/i }),
    ).toBeVisible();
  });

  it("keeps the house ad when approval values are absent", () => {
    render(
      <ConsentManager adsenseEnabled adsenseClientId="">
        <AdSlot variant="header" commercialEnabled adsenseEnabled slotId="" />
      </ConsentManager>,
    );

    expect(screen.getByText(/reach globally curious readers/i)).toBeInTheDocument();
    expect(document.querySelector("ins.adsbygoogle")).toBeNull();
  });

  it.each(["ca-pub-test", "ca-pub-12345678901234567", "ca-pub-123456789012345X"])("keeps ads disabled for malformed client id %s", async (clientId) => {
    localStorage.setItem("omnilede_consent_v1", JSON.stringify({ version: 1, choice: "granted", updatedAt: new Date().toISOString() }));
    render(<ConsentManager adsenseEnabled adsenseClientId={clientId}><AdSlot variant="article" commercialEnabled adsenseEnabled adsenseClientId={clientId} slotId="1234567890" /></ConsentManager>);
    expect(document.querySelector("ins.adsbygoogle")).toBeNull();
    expect(document.querySelector('script[src*="adsbygoogle"]')).toBeNull();
  });

  it.each(["12345", "12345678901", "abcdefghij"])("keeps ads disabled for malformed slot id %s", (slotId) => {
    localStorage.setItem("omnilede_consent_v1", JSON.stringify({ version: 1, choice: "granted", updatedAt: new Date().toISOString() }));
    render(<ConsentManager adsenseEnabled adsenseClientId="ca-pub-1234567890123456"><AdSlot variant="article" commercialEnabled adsenseEnabled adsenseClientId="ca-pub-1234567890123456" slotId={slotId} /></ConsentManager>);
    expect(document.querySelector("ins.adsbygoogle")).toBeNull();
  });
});
