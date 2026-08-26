import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { AdSlot } from "@/components/ads/ad-slot";
import { ConsentManager } from "@/components/privacy/consent-manager";

describe("AdSlot", () => {
  beforeEach(() => localStorage.clear());

  it("renders a labelled non-tracking placeholder when advertising is disabled", () => {
    render(
      <ConsentManager adsenseEnabled={false}>
        <AdSlot variant="header" adsenseEnabled={false} />
      </ConsentManager>,
    );

    expect(screen.getByText("Advertisement placeholder")).toBeVisible();
    expect(document.querySelector("ins.adsbygoogle")).toBeNull();
  });

  it("creates an ad unit only after consent when advertising is enabled", async () => {
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

    expect(document.querySelector("ins.adsbygoogle")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: /accept optional cookies/i }),
    );
    expect(document.querySelector("ins.adsbygoogle")).not.toBeNull();
  });
});
