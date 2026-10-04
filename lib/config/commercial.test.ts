import { describe, expect, it } from "vitest";

import { adsenseServingConfig } from "./commercial";

const ready = () => ({
  ...process.env,
  COMMERCIAL_FEATURES_ENABLED: "true", ADSENSE_ENABLED: "true", ADSENSE_SITE_STATUS: "READY",
  ADSENSE_PUBLISHER_ID: "pub-1234567890123456", ADSENSE_CLIENT_ID: "ca-pub-1234567890123456"
});

describe("AdSense server activation", () => {
  it("enables serving only when all three server gates and matching IDs pass", () => {
    expect(adsenseServingConfig(ready())).toMatchObject({ enabled: true, publisherId: "pub-1234567890123456", clientId: "ca-pub-1234567890123456" });
  });

  it.each([
    ["commercial", { COMMERCIAL_FEATURES_ENABLED: "false" }], ["AdSense", { ADSENSE_ENABLED: "false" }],
    ["pending", { ADSENSE_SITE_STATUS: "GETTING_READY" }], ["rejected", { ADSENSE_SITE_STATUS: "NEEDS_ATTENTION" }],
    ["unknown", { ADSENSE_SITE_STATUS: "ready" }], ["publisher", { ADSENSE_PUBLISHER_ID: "pub-test" }],
    ["client", { ADSENSE_CLIENT_ID: "ca-pub-test" }], ["mismatch", { ADSENSE_CLIENT_ID: "ca-pub-9999999999999999" }]
  ])("blocks %s configuration", (_label, override) => expect(adsenseServingConfig({ ...ready(), ...override })).toMatchObject({ enabled: false }));
});
