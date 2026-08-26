import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FEEDS } from "@/lib/pipeline/feeds";
import {
  fetchTrendingStories,
  writeTrendingQueue,
} from "@/lib/pipeline/fetch";
import type { FeedDefinition, QueueStory } from "@/lib/pipeline/types";

const temporaryDirectories: string[] = [];

async function fixture(name: string): Promise<string> {
  return fs.readFile(path.join(process.cwd(), "tests", "fixtures", "rss", name), "utf8");
}

async function temporaryContentRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "omnilede-rss-"));
  temporaryDirectories.push(root);
  return root;
}

function feed(overrides: Partial<FeedDefinition> = {}): FeedDefinition {
  return {
    id: "test-feed",
    source: "Test Wire",
    category: "politics",
    url: "https://feeds.test/world.xml",
    status: "active",
    ...overrides,
  };
}

function queueStory(overrides: Partial<QueueStory> = {}): QueueStory {
  return {
    title: "A global policy story",
    source: "Test Wire",
    sourceUrl: "https://news.test/policy-story",
    date: "2026-08-25T12:00:00.000Z",
    snippet: "A factual summary.",
    category: "politics",
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("FEEDS", () => {
  it("represents every requested publisher and uses only secure feed URLs", () => {
    expect(FEEDS.map(({ source }) => source)).toEqual(
      expect.arrayContaining([
        "Anime News Network",
        "Crunchyroll News",
        "Variety",
        "IGN Movies",
        "Reuters World",
        "Al Jazeera",
        "AP News",
        "BBC Sport",
        "ESPN",
        "Reuters Business",
        "Yahoo Finance",
        "Moneycontrol",
        "CNBC Markets",
      ]),
    );
    expect(FEEDS).toHaveLength(13);
    expect(FEEDS.every(({ url }) => new URL(url).protocol === "https:")).toBe(true);
  });

  it("documents why a requested but unavailable feed is disabled", () => {
    const unavailable = FEEDS.filter(({ status }) => status === "unavailable");

    expect(unavailable.length).toBeGreaterThan(0);
    expect(unavailable.every(({ unavailableReason }) => Boolean(unavailableReason))).toBe(
      true,
    );
  });
});

describe("fetchTrendingStories", () => {
  it("parses valid RSS, sanitizes snippets and survives another feed failing", async () => {
    const rss = await fixture("world.xml");
    const fetchImpl = async (input: string | URL | Request) => {
      const url = input.toString();
      return url.includes("working")
        ? new Response(rss, {
            status: 200,
            headers: { "content-type": "application/rss+xml" },
          })
        : new Response("upstream failure", { status: 502 });
    };

    const result = await fetchTrendingStories({
      feeds: [
        feed({ id: "working", url: "https://feeds.test/working.xml" }),
        feed({ id: "broken", url: "https://feeds.test/broken.xml" }),
      ],
      fetchImpl,
      now: new Date("2026-08-26T12:00:00.000Z"),
    });

    expect(result.stories).toEqual([
      expect.objectContaining({
        title: "Leaders agree a new cross-border framework",
        source: "Test Wire",
        sourceUrl: "https://news.test/world/framework?a=1",
        snippet: "Leaders agreed a framework & published a timetable.",
        category: "politics",
      }),
    ]);
    expect(result.summaries).toEqual([
      expect.objectContaining({ id: "working", status: "success", itemCount: 1 }),
      expect.objectContaining({ id: "broken", status: "failed", itemCount: 0 }),
    ]);
  });

  it("skips unavailable feeds without issuing a request", async () => {
    let called = false;
    const result = await fetchTrendingStories({
      feeds: [
        feed({
          status: "unavailable",
          unavailableReason: "Publisher retired its public feed.",
        }),
      ],
      fetchImpl: async () => {
        called = true;
        return new Response();
      },
      now: new Date("2026-08-26T12:00:00.000Z"),
    });

    expect(called).toBe(false);
    expect(result.summaries[0]).toEqual(
      expect.objectContaining({ status: "skipped", itemCount: 0 }),
    );
  });

  it("uses the published headline when a valid feed omits its description", async () => {
    const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Headlines</title><item><title>Markets steady after the policy decision</title><link>https://news.test/markets</link><pubDate>Wed, 26 Aug 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
    const result = await fetchTrendingStories({
      feeds: [feed({ category: "finance" })],
      fetchImpl: async () => new Response(rss),
      now: new Date("2026-08-26T12:00:00.000Z"),
    });

    expect(result.stories[0]?.snippet).toBe(
      "Markets steady after the policy decision",
    );
  });

  it("rejects oversized responses before parsing", async () => {
    const result = await fetchTrendingStories({
      feeds: [feed()],
      fetchImpl: async () =>
        new Response("x", {
          headers: { "content-length": String(2 * 1024 * 1024 + 1) },
        }),
      now: new Date("2026-08-26T12:00:00.000Z"),
    });

    expect(result.stories).toEqual([]);
    expect(result.summaries[0]).toEqual(
      expect.objectContaining({ status: "failed", error: expect.stringMatching(/2 MiB/) }),
    );
  });
});

describe("writeTrendingQueue", () => {
  it("omits stories already present in published or draft frontmatter", async () => {
    const contentRoot = await temporaryContentRoot();
    const articleDirectory = path.join(contentRoot, "articles", "politics");
    const draftDirectory = path.join(contentRoot, "drafts", "finance");
    await fs.mkdir(articleDirectory, { recursive: true });
    await fs.mkdir(draftDirectory, { recursive: true });
    await fs.writeFile(
      path.join(articleDirectory, "existing-story.mdx"),
      "---\ntitle: Existing title\nslug: existing-story\nsourceUrl: https://news.test/existing?utm_source=rss\n---\n",
    );
    await fs.writeFile(
      path.join(draftDirectory, "draft-story.mdx"),
      "---\ntitle: Draft title\nslug: draft-story\nsourceUrl: https://news.test/draft\n---\n",
    );

    const result = await writeTrendingQueue(
      [
        queueStory({
          title: "Existing title",
          sourceUrl: "https://news.test/existing?utm_campaign=daily",
        }),
        queueStory({ title: "Draft title", sourceUrl: "https://news.test/new-url" }),
        queueStory({
          title: "Fresh market move",
          sourceUrl: "https://news.test/fresh",
          category: "share-market",
          date: "2026-08-26T09:00:00.000Z",
        }),
      ],
      { contentRoot },
    );

    expect(result.written).toBe(1);
    expect(result.skippedExisting).toBe(2);
    expect(
      await fs.readFile(path.join(contentRoot, "queue", "trending.json"), "utf8"),
    ).toBe(`${JSON.stringify(result.stories, null, 2)}\n`);
    expect(result.stories[0]?.title).toBe("Fresh market move");
  });
});
