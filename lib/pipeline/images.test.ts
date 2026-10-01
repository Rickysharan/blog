import { describe, expect, it, vi } from "vitest";
import { findArticlePhotos, findRequiredArticlePhotos, photoMarkdown } from "./images";

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

function relevantPage(id: number, overrides: Record<string, unknown> = {}) {
  const base = page(id) as ReturnType<typeof page> & {
    imageinfo: Array<ReturnType<typeof page>["imageinfo"][number] & { width?: number; height?: number }>;
  };
  base.title = `File:Baker Mayfield ${id}.jpg`;
  base.imageinfo[0].width = 1200;
  base.imageinfo[0].height = 800;
  (base.imageinfo[0].extmetadata as Record<string, { value: string }>).ImageDescription = {
    value: `Baker Mayfield at a team event ${id}`,
  };
  Object.assign(base.imageinfo[0], overrides);
  return base;
}

const namedStory = {
  title: "Baker Mayfield provides team update",
  snippet: "Baker Mayfield spoke after the team session.",
  source: "Example Outlet",
  sourceUrl: "https://example.com/story",
  date: "2026-09-30T10:00:00.000Z",
  category: "sports" as const,
};

describe("required article photo policy", () => {
  it("returns three relevant unique credited photos", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        return new Response(null, { status: 200, headers: { "content-type": "image/jpeg" } });
      }
      return Response.json({ query: { pages: {
        a: relevantPage(1), b: relevantPage(2), c: relevantPage(3),
      } } });
    });

    const result = await findRequiredArticlePhotos(namedStory, ["Baker Mayfield", "sports"], { fetchImpl: fetcher });

    expect(result).toMatchObject({ ok: true, attempts: 1 });
    expect(result.photos).toHaveLength(3);
    expect(new Set(result.photos.map((photo) => photo.page)).size).toBe(3);
  });

  it("accepts two photos found across bounded alternative queries", async () => {
    let search = 0;
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        return new Response(null, { status: 200, headers: { "content-type": "image/jpeg" } });
      }
      search += 1;
      const query = new URL(String(input)).searchParams.get("gsrsearch")?.match(/^"([^"]+)"/)?.[1] ?? "Baker Mayfield";
      const candidate = relevantPage(search);
      candidate.title = `File:${query} ${search}.jpg`;
      (candidate.imageinfo[0].extmetadata as Record<string, { value: string }>).ImageDescription = {
        value: `${query} at an event`,
      };
      return Response.json({ query: { pages: { photo: candidate } } });
    });

    const result = await findRequiredArticlePhotos(
      { ...namedStory, snippet: "Baker Mayfield met Tampa Bay Buccaneers officials." },
      ["Baker Mayfield", "Tampa Bay Buccaneers"],
      { fetchImpl: fetcher },
    );

    expect(result).toMatchObject({ ok: true, attempts: 2 });
    expect(result.photos).toHaveLength(2);
    expect(search).toBe(2);
  });

  it("returns an explicit insufficient-images result when only one photo is usable", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        return new Response(null, { status: 200, headers: { "content-type": "image/jpeg" } });
      }
      return Response.json({ query: { pages: { only: relevantPage(1) } } });
    });

    const result = await findRequiredArticlePhotos(namedStory, ["Baker Mayfield"], { fetchImpl: fetcher });

    expect(result).toMatchObject({ ok: false, category: "insufficient-images" });
    expect(result.photos).toHaveLength(1);
  });

  it("deduplicates Commons pages before applying the minimum", async () => {
    const duplicate = relevantPage(2);
    duplicate.imageinfo[0].descriptionurl = relevantPage(1).imageinfo[0].descriptionurl;
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "HEAD") return new Response(null, { headers: { "content-type": "image/jpeg" } });
      return Response.json({ query: { pages: { a: relevantPage(1), b: duplicate } } });
    });

    const result = await findRequiredArticlePhotos(namedStory, ["Baker Mayfield"], { fetchImpl: fetcher });
    expect(result.ok).toBe(false);
    expect(result.photos).toHaveLength(1);
  });

  it("does not search a generic category that is not a named source entity", async () => {
    const fetcher = vi.fn();
    const result = await findRequiredArticlePhotos(
      { ...namedStory, title: "Team update", snippet: "The club issued an update." },
      ["sports", "news"],
      { fetchImpl: fetcher },
    );
    expect(result).toMatchObject({ ok: false, category: "insufficient-images", attempts: 0 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses a named tag when its distinctive subject appears in the source URL", async () => {
    const queries: string[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        return new Response(null, { headers: { "content-type": "image/jpeg" } });
      }
      const query = new URL(String(input)).searchParams.get("gsrsearch")?.match(/^"([^"]+)"/)?.[1] ?? "";
      queries.push(query);
      const candidates = [1, 2].map((id) => {
        const candidate = relevantPage(id);
        candidate.title = `File:${query} ${id}.jpg`;
        (candidate.imageinfo[0].extmetadata as Record<string, { value: string }>).ImageDescription = {
          value: `${query} at an event`,
        };
        return candidate;
      });
      return Response.json({ query: { pages: { a: candidates[0], b: candidates[1] } } });
    });
    const sourceUrlStory = {
      ...namedStory,
      title: "Five coaching situations to monitor",
      snippet: "Several coaches could face scrutiny this season.",
      sourceUrl: "https://example.com/nba-preview-76ers-nurse-spurs-johnson",
    };

    const result = await findRequiredArticlePhotos(
      sourceUrlStory,
      ["Philadelphia 76ers", "San Antonio Spurs"],
      { fetchImpl: fetcher },
    );

    expect(result.ok).toBe(true);
    expect(queries[0]).toBe("Philadelphia 76ers");
  });

  it.each([
    {
      name: "unsupported MIME type",
      mutate: (candidate: ReturnType<typeof relevantPage>) => { candidate.imageinfo[0].mime = "image/png"; },
      head: new Response(null, { headers: { "content-type": "image/png" } }),
    },
    {
      name: "missing credits",
      mutate: (candidate: ReturnType<typeof relevantPage>) => { candidate.imageinfo[0].extmetadata.Artist.value = ""; },
      head: new Response(null, { headers: { "content-type": "image/jpeg" } }),
    },
    {
      name: "unreachable image",
      mutate: () => undefined,
      head: new Response(null, { status: 503, headers: { "content-type": "image/jpeg" } }),
    },
    {
      name: "unusable dimensions",
      mutate: (candidate: ReturnType<typeof relevantPage>) => { candidate.imageinfo[0].width = 120; candidate.imageinfo[0].height = 80; },
      head: new Response(null, { headers: { "content-type": "image/jpeg" } }),
    },
  ])("rejects a photo with $name", async ({ mutate, head }) => {
    const candidate = relevantPage(1);
    mutate(candidate);
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) =>
      init?.method === "HEAD" ? head : Response.json({ query: { pages: { candidate } } }));

    const result = await findRequiredArticlePhotos(namedStory, ["Baker Mayfield"], { fetchImpl: fetcher });
    expect(result.ok).toBe(false);
    expect(result.photos).toEqual([]);
  });
});
