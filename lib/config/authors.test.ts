import { describe, expect, it } from "vitest";

import { RICKY_SHARAN_PROFILE, getAuthorProfile } from "./authors";

describe("author registry", () => {
  it("exposes one immutable truthful profile for Ricky Sharan", () => {
    expect(RICKY_SHARAN_PROFILE).toMatchObject({
      name: "Ricky Sharan",
      slug: "ricky-sharan",
      path: "/author/ricky-sharan",
    });
    expect(RICKY_SHARAN_PROFILE.disclosure).toMatch(/local AI.*private drafts/i);
    expect(RICKY_SHARAN_PROFILE.disclosure).toMatch(/reviews.*publish/i);
    expect(Object.isFrozen(RICKY_SHARAN_PROFILE)).toBe(true);
    expect(getAuthorProfile("Ricky Sharan")).toBe(RICKY_SHARAN_PROFILE);
    expect(getAuthorProfile("Ada Contributor")).toBeUndefined();
  });
});
