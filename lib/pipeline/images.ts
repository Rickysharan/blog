import type { FetchLike, QueueStory } from "./types";

export interface ArticlePhoto {
  url: string;
  page: string;
  title: string;
  artist: string;
  license: string;
  licenseUrl: string;
}

// Metadata is untrusted prose, never MDX or HTML.
function plain(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/&[^;\s]+;/g, " ")
    .replace(/[{}<>\[\]\\`*_!#]/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
}
function secureUrl(value: string, hosts: string[]): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || !hosts.includes(url.hostname)) return null;
    return url.href.replace(/[()]/g, c => c === "(" ? "%28" : "%29");
  } catch { return null; }
}

/** Related archive photos, not evidence of the reported event. No paid key required. */
export async function findArticlePhotos(tags: string[], fetchImpl: FetchLike = fetch, story?: QueueStory): Promise<ArticlePhoto[]> {
  const namedSubjects = story ? [...story.snippet.matchAll(/\b[A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+){1,4}\b/g)].map(m => m[0]) : [];
  const acronyms = story ? [...new Set((`${story.title} ${story.snippet}`).match(/\b[A-Z]{3,6}\b/g) ?? [])].filter(name => !story.source.includes(name)) : [];
  const context = story ? `${story.title} ${story.snippet}`.toLocaleLowerCase() : "";
  const candidates = story ? [...tags, ...namedSubjects, ...acronyms].filter(tag => (tag.trim().split(/\s+/).length >= 2 || acronyms.includes(tag)) && context.includes(tag.toLocaleLowerCase())) : tags;
  const queries = [...new Set(candidates.map(t => t.replace(/[^\p{L}\p{N}\s-]/gu, " ").trim()).filter(Boolean))].slice(0, 3);
  const batches = await Promise.all(queries.map(async query => {
    try {
      const url = new URL("https://commons.wikimedia.org/w/api.php");
      url.search = new URLSearchParams({ action: "query", format: "json", generator: "search",
        gsrsearch: `"${query}" filetype:bitmap`, gsrnamespace: "6", gsrlimit: "24",
        prop: "imageinfo", iiprop: "url|extmetadata|mime", iiurlwidth: "1200",
        iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl|Restrictions|ImageDescription" }).toString();
      const response = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(6000),
        headers: { "User-Agent": "OmniLede/1.0 (https://github.com/Rickysharan/blog)" } });
      if (!response.ok) return [];
      const text = await response.text();
      if (text.length > 512_000) return [];
      const data = JSON.parse(text) as { query?: { pages?: Record<string, { title: string; index?: number; imageinfo?: Array<{
        thumburl?: string; descriptionurl?: string; mime?: string;
        extmetadata?: Record<string, { value?: string }>;
      }> }> } };
      const photos: ArticlePhoto[] = [];
      for (const page of Object.values(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0))) {
        const info = page.imageinfo?.[0];
        const meta = info?.extmetadata;
        if (!info || !meta || !["image/jpeg", "image/webp"].includes(info.mime ?? "")) continue;
        if (story) {
          const description = `${page.title} ${plain(meta.ImageDescription?.value ?? "")}`.toLocaleLowerCase().replace(/[_-]/g, " ");
          if (!query.toLocaleLowerCase().split(/\s+/).every(word => description.includes(word))) continue;
        }
        const license = plain(meta.LicenseShortName?.value ?? "");
        const licenseUrl = secureUrl(meta.LicenseUrl?.value ?? "", ["creativecommons.org"]);
        const imageUrl = secureUrl(info.thumburl ?? "", ["upload.wikimedia.org", "thumb.wikimedia.org"]);
        const source = secureUrl(info.descriptionurl ?? "", ["commons.wikimedia.org"]);
        const artist = plain(meta.Artist?.value ?? "");
        // Accept only explicit commercial reuse licences with complete attribution.
        if (!/^(CC BY(?:-SA)? [\d.]+|CC0(?: [\d.]+)?)$/.test(license) || !licenseUrl || !imageUrl || !source || !artist || meta.Restrictions?.value?.trim()) continue;
        if (!/^https:\/\/creativecommons.org\/(?:licenses\/by(?:-sa)?\/|publicdomain\/zero\/)/.test(licenseUrl)) continue;
        photos.push({ url: imageUrl, page: source, title: plain(page.title.replace(/^File:/, "")), artist, license, licenseUrl });
      }
      return photos;
    } catch { return []; }
  }));
  // Prefer a different subject for each image, then fill from remaining results.
  const ordered = [...batches.map(b => b[0]).filter((p): p is ArticlePhoto => !!p), ...batches.flat()];
  return ordered.filter((p, i, all) => all.findIndex(other => other.page === p.page) === i).slice(0, 3);
}

export function photoMarkdown(photo: ArticlePhoto): string {
  return `![${plain(photo.title)}](${photo.url})\n\nRelated archive image: ${plain(photo.title)}. Photo: ${plain(photo.artist)} / [Wikimedia Commons](${photo.page}), [${plain(photo.license)}](${photo.licenseUrl}). Not a photograph of this news event.`;
}
