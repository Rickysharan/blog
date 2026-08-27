import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { AdSlot } from "@/components/ads/ad-slot";
import { ConsentManager } from "@/components/privacy/consent-manager";

describe("AdSlot", () => {
  beforeEach(() => localStorage.clear());

  it("renders a labelled house ad when third-party advertising is disabled", () => {
    render(
      <ConsentManager adsenseEnabled={false}>
        <AdSlot variant="header" adsenseEnabled={false} />
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
      <ConsentManager adsenseClientId="ca-pub-test" adsenseEnabled>
        <AdSlot
          variant="article"
          adsenseClientId="ca-pub-test"
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
      <ConsentManager adsenseClientId="ca-pub-test" adsenseEnabled>
        <AdSlot
          variant="article"
          adsenseClientId="ca-pub-test"
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
        <AdSlot variant="header" adsenseEnabled slotId="" />
      </ConsentManager>,
    );

    expect(screen.getByText(/reach globally curious readers/i)).toBeInTheDocument();
    expect(document.querySelector("ins.adsbygoogle")).toBeNull();
  });
});
