import { promises as fs } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("Netlify deployment configuration", () => {
  it("uses the existing production build and does not define public secrets", async () => {
    const config = await fs.readFile(path.join(root, "netlify.toml"), "utf8");

    expect(config).toContain('command = "npm run build"');
    expect(config).toContain('publish = ".next"');
    expect(config).not.toMatch(/NEXT_PUBLIC_(PASSWORD|TOKEN|SECRET|API_KEY)/i);
  });
});
