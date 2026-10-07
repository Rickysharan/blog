import type { FetchLike, QueueStory } from "./types";

export interface ArticlePhoto {
  url: string;
  page: string;
  title: string;
  artist: string;
  license: string;
  licenseUrl: string;
}

export type PhotoSearchResult =
  | { ok: true; photos: ArticlePhoto[]; attempts: number }
  | {
      ok: false;
      category: "insufficient-images";
      message: string;
      photos: ArticlePhoto[];
      attempts: number;
    };

export interface RequiredPhotoSearchOptions {
  fetchImpl?: FetchLike;
  /** Initial named subject plus at most this many alternative named subjects. */
  maxAlternativeRounds?: number;
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

type CommonsPage = {
  title: string;
  index?: number;
  imageinfo?: Array<{
    thumburl?: string;
    descriptionurl?: string;
    mime?: string;
    width?: number;
    height?: number;
    extmetadata?: Record<string, { value?: string }>;
  }>;
};

const genericSubject = /^(?:news|sports?|politics|finance|movies?|anime|share market|team update|club update)$/i;
const genericPlaceToken = new Set([
  "los", "angeles", "san", "new", "york", "city", "united", "states", "north", "south",
]);

function namedEntityQueries(story: QueueStory, tags: string[]): string[] {
  const context = `${story.title} ${story.snippet}`;
  const lowerContext = context.toLocaleLowerCase();
  let sourcePathTokens = new Set<string>();
  try {
    sourcePathTokens = new Set(
      decodeURIComponent(new URL(story.sourceUrl).pathname)
        .toLocaleLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean),
    );
  } catch {
    // Queue validation reports malformed source URLs before image selection.
  }
  const extracted = [...context.matchAll(/\b[A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){1,4}\b/gu)]
    .map((match) => match[0]);
  const acronyms = context.match(/\b[A-Z]{3,6}\b/g) ?? [];
  return [...new Set([...tags, ...extracted, ...acronyms]
    .map((subject) => subject.replace(/[^\p{L}\p{N}\s'’-]/gu, " ").replace(/\s+/g, " ").trim())
    .filter((subject) => {
      if (!subject || genericSubject.test(subject)) return false;
      const looksNamed = subject.split(" ").length >= 2 || /^[A-Z]{3,6}$/.test(subject);
      const subjectTokens = subject.toLocaleLowerCase().split(/\s+/);
      const appearsInSourcePath = subjectTokens.some(
        (token) => (/[0-9]/.test(token) || token.length >= 5) &&
          !genericPlaceToken.has(token) && sourcePathTokens.has(token),
      );
      return looksNamed && (
        lowerContext.includes(subject.toLocaleLowerCase()) || appearsInSourcePath
      );
    }))];
}

async function searchCommonsForSubject(
  query: string,
  fetchImpl: FetchLike,
): Promise<Array<{ photo: ArticlePhoto; width: number; height: number }>> {
  try {
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    url.search = new URLSearchParams({
      action: "query",
      format: "json",
      generator: "search",
      gsrsearch: `"${query}" filetype:bitmap`,
      gsrnamespace: "6",
      gsrlimit: "24",
      prop: "imageinfo",
      iiprop: "url|extmetadata|mime|size",
      iiurlwidth: "1200",
      iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl|Restrictions|ImageDescription",
    }).toString();
    const response = await fetchImpl(url, {
      redirect: "error",
      signal: AbortSignal.timeout(6_000),
      headers: { "User-Agent": "OmniLede/1.0 (https://github.com/Rickysharan/blog)" },
    });
    if (!response.ok) return [];
    const text = await response.text();
    if (text.length > 512_000) return [];
    const data = JSON.parse(text) as { query?: { pages?: Record<string, CommonsPage> } };
    const queryWords = query.toLocaleLowerCase().split(/\s+/);
    const matches: Array<{ photo: ArticlePhoto; width: number; height: number }> = [];
    for (const page of Object.values(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0))) {
      const info = page.imageinfo?.[0];
      const meta = info?.extmetadata;
      if (!info || !meta || !["image/jpeg", "image/webp"].includes(info.mime ?? "")) continue;
      const description = `${page.title} ${plain(meta.ImageDescription?.value ?? "")}`
        .toLocaleLowerCase()
        .replace(/[_-]/g, " ");
      if (!queryWords.every((word) => description.includes(word))) continue;
      const width = info.width ?? 0;
      const height = info.height ?? 0;
      if (width < 320 || height < 180) continue;
      const license = plain(meta.LicenseShortName?.value ?? "");
      const licenseUrl = secureUrl(meta.LicenseUrl?.value ?? "", ["creativecommons.org"]);
      const imageUrl = secureUrl(info.thumburl ?? "", ["upload.wikimedia.org", "thumb.wikimedia.org"]);
      const source = secureUrl(info.descriptionurl ?? "", ["commons.wikimedia.org"]);
      const artist = plain(meta.Artist?.value ?? "");
      if (!/^(CC BY(?:-SA)? [\d.]+|CC0(?: [\d.]+)?)$/.test(license) ||
          !licenseUrl || !imageUrl || !source || !artist || meta.Restrictions?.value?.trim()) continue;
      if (!/^https:\/\/creativecommons.org\/(?:licenses\/by(?:-sa)?\/|publicdomain\/zero\/)/.test(licenseUrl)) continue;
      matches.push({
        photo: {
          url: imageUrl,
          page: source,
          title: plain(page.title.replace(/^File:/, "")),
          artist,
          license,
          licenseUrl,
        },
        width,
        height,
      });
    }
    return matches;
  } catch {
    return [];
  }
}

async function remoteImageIsUsable(photo: ArticlePhoto, fetchImpl: FetchLike): Promise<boolean> {
  try {
    const response = await fetchImpl(photo.url, {
      method: "HEAD",
      redirect: "error",
      signal: AbortSignal.timeout(6_000),
    });
    const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim();
    return response.ok && (contentType === "image/jpeg" || contentType === "image/webp");
  } catch {
    return false;
  }
}

const IMAGE_VERIFICATION_BATCH_SIZE = 6;

export async function findRequiredArticlePhotos(
  story: QueueStory,
  tags: string[],
  options: RequiredPhotoSearchOptions = {},
): Promise<PhotoSearchResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maximumQueries = 1 + (options.maxAlternativeRounds ?? 2);
  const queries = namedEntityQueries(story, tags).slice(0, maximumQueries);
  const photos: ArticlePhoto[] = [];
  const seenPages = new Set<string>();
  let attempts = 0;

  for (const query of queries) {
    attempts += 1;
    const candidates = await searchCommonsForSubject(query, fetchImpl);
    const unseen = candidates.filter((candidate) => {
      if (seenPages.has(candidate.photo.page)) return false;
      seenPages.add(candidate.photo.page);
      return true;
    });
    for (let offset = 0; offset < unseen.length && photos.length < 3; offset += IMAGE_VERIFICATION_BATCH_SIZE) {
      const batch = unseen.slice(offset, offset + IMAGE_VERIFICATION_BATCH_SIZE);
      const verified = await Promise.all(batch.map(async (candidate) => ({
        candidate,
        usable: await remoteImageIsUsable(candidate.photo, fetchImpl),
      })));
      for (const { candidate, usable } of verified) {
        if (usable) photos.push(candidate.photo);
        if (photos.length === 3) break;
      }
    }
    if (photos.length >= 2) break;
  }

  if (photos.length >= 2) return { ok: true, photos, attempts };
  return {
    ok: false,
    category: "insufficient-images",
    message: `Only ${photos.length} verified related photo${photos.length === 1 ? " was" : "s were"} found; two are required.`,
    photos,
    attempts,
  };
}

export function photoMarkdown(photo: ArticlePhoto): string {
  return `![${plain(photo.title)}](${photo.url})\n\nRelated archive image: ${plain(photo.title)}. Photo: ${plain(photo.artist)} / [Wikimedia Commons](${photo.page}), [${plain(photo.license)}](${photo.licenseUrl}). Not a photograph of this news event.`;
}
