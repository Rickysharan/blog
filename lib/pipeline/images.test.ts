import { describe, expect, it, vi } from "vitest";
import { findArticlePhotos, photoMarkdown } from "./images";

function page(id: number, license = "CC BY-SA 4.0", host = "thumb.wikimedia.org") {
  return { title: `File:Photo ${id}.jpg`, index: id, imageinfo: [{ mime: "image/jpeg",
    thumburl: `https://${host}/photo${id}.jpg`, descriptionurl: `https://commons.wikimedia.org/wiki/File:Photo${id}.jpg`,
    extmetadata: { Artist: { value: "<a>Some Photographer</a>" }, LicenseShortName: { value: license },
      LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0/" } } }] };
}
describe("article photo lookup", () => {
  it("finds three distinct photos with attribution, using bounded searches", async () => {
    const fetcher = vi.fn(async () => Response.json({ query: { pages: { a: page(1), b: page(2), c: page(3) } } }));
    const photos = await findArticlePhotos(["Baker Mayfield", "NFL"], fetcher);
    expect(photos).toHaveLength(3);
    expect(new Set(photos.map(p => p.page)).size).toBe(3);
    expect(photos[0].artist).toBe("Some Photographer");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(photoMarkdown(photos[0])).toContain("Not a photograph of this news event");
    expect(photoMarkdown(photos[0])).toContain("creativecommons.org/licenses/by-sa/4.0/");
  });
  it("rejects noncommercial, missing attribution, and off-host images", async () => {
    const missing = page(4); missing.imageinfo[0].extmetadata.Artist.value = "";
    const fetcher = vi.fn(async () => Response.json({ query: { pages: { a: page(1, "CC BY-NC 4.0"), b: page(2, "CC BY-SA 4.0", "example.com"), c: missing } } }));
    expect(await findArticlePhotos(["sport"], fetcher)).toEqual([]);
  });
  it("keeps drafting available when image search is unavailable", async () => {
    expect(await findArticlePhotos(["sport"], async () => { throw new Error("timeout"); })).toEqual([]);
  });
  it("removes executable syntax from image metadata", async () => {
    const p = page(1); p.title = 'File:<script>bad</script>{process.exit()} [link].jpg';
    const photos = await findArticlePhotos(["sport"], async () => Response.json({ query: { pages: { a: p } } }));
    const markdown = photoMarkdown(photos[0]);
    expect(markdown).not.toMatch(/[{}<>]/);
    expect(markdown).not.toContain("[link]");
  });
});

it("does not substitute generic category pictures for a named subject", async () => {
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    expect(String(input)).toContain("commons.wikimedia.org");
    return Response.json({ query: { pages: { a: page(1) } } });
  });
  const story = { title: "Mayfield injury", snippet: "Baker Mayfield is injured.", source: "Example", sourceUrl: "https://example.com", date: "2026-09-30", category: "sports" as const };
  expect(await findArticlePhotos(["sports", "NFL"], fetcher, story)).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const requested = new URL(String(fetcher.mock.calls[0]?.[0]));
  expect(requested.searchParams.get("gsrsearch")).toContain("Baker Mayfield");
});
