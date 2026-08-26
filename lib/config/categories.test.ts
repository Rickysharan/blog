import { describe, expect, it } from "vitest";

import {
  CATEGORIES,
  CATEGORY_SLUGS,
  isCategorySlug,
} from "@/lib/config/categories";

describe("category registry", () => {
  it("defines the six publication desks in stable navigation order", () => {
    expect(CATEGORY_SLUGS).toEqual([
      "anime",
      "movies",
      "politics",
      "sports",
      "finance",
      "share-market",
    ]);
    expect(CATEGORIES.map(({ accent }) => accent)).toEqual([
      "violet",
      "rose",
      "blue",
      "green",
      "amber",
      "cyan",
    ]);
  });

  it("recognizes only supported category slugs", () => {
    expect(isCategorySlug("share-market")).toBe(true);
    expect(isCategorySlug("technology")).toBe(false);
  });
});
