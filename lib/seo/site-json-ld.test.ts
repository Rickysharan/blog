import { describe, expect, it } from "vitest";

import { buildBreadcrumbListJsonLd, buildOrganizationJsonLd } from "./site-json-ld";
import { serializeJsonLd } from "./json-ld";

const site = { name: "OmniLede", url: "https://news.example", publisher: "OmniLede Editorial" };

describe("site JSON-LD", () => {
  it("builds a stable Organization identity and canonical breadcrumb URLs", () => {
    expect(buildOrganizationJsonLd(site)).toMatchObject({
      "@context": "https://schema.org", "@type": "Organization", "@id": "https://news.example/#organization",
      name: "OmniLede Editorial", url: "https://news.example", logo: { "@type": "ImageObject", url: "https://news.example/icons/icon-512.png" },
    });
    expect(buildBreadcrumbListJsonLd(site, [
      { name: "Home", path: "/" }, { name: "Politics", path: "/category/politics" }, { name: "Story", path: "/article/story" },
    ])).toMatchObject({
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://news.example/" },
        { "@type": "ListItem", position: 2, name: "Politics", item: "https://news.example/category/politics" },
        { "@type": "ListItem", position: 3, name: "Story", item: "https://news.example/article/story" },
      ],
    });
  });

  it("escapes script ends, HTML delimiters, ampersands and line separators", () => {
    const output = serializeJsonLd({ value: "</script><script>&\u2028\u2029" });
    expect(output).not.toContain("</script>");
    expect(output).not.toContain("<script>");
    expect(output).not.toContain("&");
    expect(output).toContain("\\u2028");
    expect(output).toContain("\\u2029");
  });
});
