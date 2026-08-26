import { afterEach, describe, expect, it } from "vitest";

import { THEME_BOOTSTRAP } from "@/components/theme/theme-script";
import { THEME_STORAGE_KEY } from "@/components/theme/theme-toggle";

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

describe("THEME_BOOTSTRAP", () => {
  it("applies a persisted dark preference before hydration", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");

    window.eval(THEME_BOOTSTRAP);

    expect(document.documentElement).toHaveClass("dark");
  });
});
