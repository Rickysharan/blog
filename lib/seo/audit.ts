import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

export type SiteFindingState = "pass" | "warning" | "error";
export type SiteFinding = {
  check: "robots" | "sitemap" | "canonical" | "metadata" | "image-alt" | "internal-links" | "structured-data";
  state: SiteFindingState;
  evidence: string;
  affectedUrl: string;
  checkedAt: string;
  recoveryAction: string;
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type ResolvedAddress = { address: string; family: 4 | 6 };
type ResolveHostname = (hostname: string) => Promise<ResolvedAddress[]>;
type PinnedRequest = (url: URL, address: ResolvedAddress, signal: AbortSignal) => Promise<Response>;
type AuditOptions = {
  fetchImpl?: FetchLike;
  now?: Date;
  resolveHostname?: ResolveHostname;
  requestImpl?: PinnedRequest;
};
type PageEvidence = { url: string; html: string };

const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_SITEMAP_URLS = 25;
const MAX_EXTRA_INTERNAL_URLS = 20;
const MAX_REDIRECTS = 3;

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (isIP(host) === 4) {
    const [a, b] = host.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 2, 168].includes(b)) ||
      (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0);
  }
  if (isIP(host) === 6) {
    // Fail closed to IANA's allocated global-unicast ranges; special-purpose
    // addresses (including translation and transition mechanisms) are not web targets.
    // https://www.iana.org/assignments/ipv6-unicast-address-assignments/
    const expanded = new URL(`https://[${host}]/`).hostname.slice(1, -1);
    const [left, right = ""] = expanded.split("::");
    const start = left ? left.split(":") : [];
    const end = right ? right.split(":") : [];
    const words = [...start, ...Array(8 - start.length - end.length).fill("0"), ...end].map((word) => parseInt(word, 16));
    const [first, second, third] = words;
    if (first === 0x2001) {
      if (second === 0xdb8) return true;
      return !((second >= 0x200 && second < 0x1000) || (second >= 0x1200 && second < 0x4e00) ||
        (second >= 0x5000 && second < 0x6000) || (second >= 0x8000 && second < 0xc000));
    }
    if (first === 0x2003) return second >= 0x4000;
    if (first === 0x2620 && second === 0x4f && third === 0x8000) return true;
    return !((first >= 0x2400 && first <= 0x241f) || (first >= 0x2600 && first <= 0x260f) ||
      (first >= 0x2610 && first <= 0x2611) || (first >= 0x2620 && first <= 0x2621) ||
      (first >= 0x2630 && first <= 0x263f) || (first >= 0x2800 && first <= 0x280f) ||
      (first >= 0x2a00 && first <= 0x2a1f) || (first >= 0x2c00 && first <= 0x2c0f));
  }
  return false;
}

async function defaultResolveHostname(hostname: string): Promise<ResolvedAddress[]> {
  const answers = await lookup(hostname, { all: true, verbatim: true });
  return answers.map(({ address, family }) => ({ address, family: family as 4 | 6 }));
}

async function resolvePublicAddresses(hostname: string, resolver: ResolveHostname): Promise<ResolvedAddress[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const answers = await Promise.race([
    resolver(hostname),
    new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("Site audit DNS lookup timed out.")), 8_000); }),
  ]).finally(() => clearTimeout(timer));
  if (answers.length === 0 || answers.some(({ address, family }) => (family !== 4 && family !== 6) || isIP(address) !== family || isPrivateHostname(address))) {
    throw new Error("Site audit hostname did not resolve exclusively to public addresses.");
  }
  return answers;
}

async function defaultPinnedRequest(url: URL, pinned: ResolvedAddress, signal: AbortSignal): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest({
      protocol: "https:",
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      servername: url.hostname,
      headers: { Host: url.host, Accept: "text/html,application/xml,text/plain;q=0.9,*/*;q=0.1" },
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [pinned]);
        else callback(null, pinned.address, pinned.family);
      },
    }, (response) => {
      response.once("error", reject);
      response.once("aborted", () => reject(new Error("Site audit response was interrupted.")));
      const headers = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        if (Array.isArray(value)) value.forEach((entry) => headers.append(name, entry));
        else if (value !== undefined) headers.set(name, String(value));
      }
      const status = response.statusCode ?? 500;
      if (status >= 300 && status < 400) {
        response.resume();
        resolve(new Response(null, { status, headers }));
        return;
      }
      const declared = Number(headers.get("content-length"));
      if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
        response.destroy();
        reject(new Error("Response exceeded the safe size limit."));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.byteLength;
        if (size > MAX_RESPONSE_BYTES) {
          response.destroy(new Error("Response exceeded the safe size limit."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        try { resolve(new Response(status === 204 || status === 304 ? null : Buffer.concat(chunks), { status, headers })); }
        catch (error) { reject(error); }
      });
    });
    const abort = () => request.destroy(new DOMException("The operation was aborted.", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    request.once("close", () => signal.removeEventListener("abort", abort));
    request.once("error", reject);
    if (signal.aborted) abort();
    else request.end();
  });
}

function requirePublicOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash || isPrivateHostname(url.hostname)) {
    throw new Error("Site audit requires a public HTTPS origin without a path.");
  }
  return url.origin;
}

async function boundedText(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw new Error("Response exceeded the safe size limit.");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("Response exceeded the safe size limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

async function safeFetch(url: string, origin: string, fetchImpl: FetchLike): Promise<{ url: string; status: number; text: string }> {
  let current = new URL(url);
  const signal = AbortSignal.timeout(8_000);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    if (current.protocol !== "https:" || current.origin !== origin || isPrivateHostname(current.hostname)) {
      throw new Error("Blocked an unsafe site-audit redirect.");
    }
    const response = await fetchImpl(current.toString(), { method: "GET", cache: "no-store", redirect: "manual", signal });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) throw new Error("Blocked an invalid site-audit redirect chain.");
      current = new URL(location, current);
      continue;
    }
    return { url: current.toString(), status: response.status, text: await boundedText(response) };
  }
  throw new Error("Blocked an invalid site-audit redirect chain.");
}

function finding(check: SiteFinding["check"], state: SiteFindingState, evidence: string, affectedUrl: string, checkedAt: string, recoveryAction: string): SiteFinding {
  return { check, state, evidence, affectedUrl, checkedAt, recoveryAction };
}

function attribute(source: string, element: string, name: string): string[] {
  const values: string[] = [];
  const elements = source.match(new RegExp(`<${element}\\b[^>]*>`, "gi")) ?? [];
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i");
  for (const value of elements) {
    const match = value.match(pattern);
    if (match?.[2] !== undefined) values.push(match[2]);
  }
  return values;
}

function metaContent(html: string, name: string): string | undefined {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  return tags.find((tag) => new RegExp(`\\bname\\s*=\\s*(["'])${name}\\1`, "i").test(tag))
    ?.match(/\bcontent\s*=\s*(["'])(.*?)\1/i)?.[2];
}

function canonical(html: string): string | undefined {
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  return tags.find((tag) => /\brel\s*=\s*(["'])canonical\1/i.test(tag))
    ?.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2];
}

function title(html: string): string {
  return html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
}

function jsonLd(html: string): unknown[] {
  const values: unknown[] = [];
  const pattern = /<script\b[^>]*type\s*=\s*(["'])application\/ld\+json\1[^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      const parsed: unknown = JSON.parse(match[2] ?? "");
      values.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {
      values.push(null);
    }
  }
  return values;
}

function schemaType(value: unknown, type: string): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && (value as Record<string, unknown>)["@type"] === type);
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function schemaUrl(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  const record = objectValue(value);
  return typeof record?.["@id"] === "string" ? record["@id"] : undefined;
}

function exactSameOriginUrl(value: unknown, origin: string): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.origin === origin ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function validOrganization(value: unknown, origin: string): boolean {
  if (!schemaType(value, "Organization")) return false;
  return value["@id"] === `${origin}/#organization` && value.url === origin &&
    typeof value.name === "string" && value.name.trim().length > 0;
}

function decodeHtml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (entity, code: string) => {
    if (code[0] === "#") {
      const point = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
    }
    return ({ amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" } as Record<string, string>)[code.toLowerCase()] ?? entity;
  });
}

function markedElements(html: string, element: string, property: string): Array<{ tag: string; text: string }> {
  const pattern = new RegExp(`<${element}\\b[^>]*>([\\s\\S]*?)<\\/${element}>`, "gi");
  return [...html.matchAll(pattern)].filter(([tag]) =>
    (attribute(tag, element, "itemprop")[0] ?? "").split(/\s+/).includes(property),
  ).map(([tag, contents]) => ({ tag, text: decodeHtml(contents.replace(/<[^>]*>/g, "")).trim() }));
}

function visibleImageUrl(source: string, origin: string): string | undefined {
  try {
    let url = new URL(decodeHtml(source), origin);
    if (url.origin === origin && url.pathname === "/_next/image") {
      const original = url.searchParams.get("url");
      if (!original) return undefined;
      url = new URL(original, origin);
    }
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : undefined;
  } catch { return undefined; }
}

function structuredArticleProblem(html: string, pageUrl: string, origin: string, schemas: unknown[]): string | null {
  const news = schemas.find((value) => schemaType(value, "NewsArticle"));
  const breadcrumb = schemas.find((value) => schemaType(value, "BreadcrumbList"));
  const siteOrganization = schemas.find((value) => validOrganization(value, origin)) as Record<string, unknown> | undefined;
  const article = [...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/gi)]
    .find(([markup]) => decodeHtml(attribute(markup, "article", "itemid")[0] ?? "") === pageUrl)?.[0];
  if (!news || !article) return "NewsArticle or its visible canonical article is missing.";
  // Metadata belongs to the canonical article header; body/related-story dates cannot satisfy it.
  const metadata = article.match(/<header\b[^>]*>[\s\S]*?<\/header>/i)?.[0] ?? "";
  const headline = markedElements(metadata, "h1", "headline")[0]?.text;
  if (!headline || news.headline !== headline || typeof news.description !== "string" || !news.description.trim()) {
    return "NewsArticle headline does not match the visible article or description is missing.";
  }
  const author = objectValue(news.author);
  const publisher = objectValue(news.publisher);
  if (!validOrganization(publisher, origin) || !siteOrganization || publisher?.name !== siteOrganization.name) {
    return "NewsArticle publisher does not match the site Organization identity.";
  }
  const visibleAuthor = (
    markedElements(metadata, "span", "author")[0] ??
    markedElements(metadata, "a", "author")[0]
  )?.text;
  if (!visibleAuthor || !author || !["Person", "Organization"].includes(String(author["@type"])) || author.name !== visibleAuthor ||
    (author["@type"] === "Organization" && (author["@id"] !== `${origin}/#organization` || author.name !== publisher?.name))) {
    return "NewsArticle author does not match the visible author and canonical Organization identity.";
  }
  if (schemaUrl(news.mainEntityOfPage) !== pageUrl || news.url !== pageUrl) return "NewsArticle identity does not match the visible canonical page.";
  const section = markedElements(metadata, "a", "articleSection")[0];
  const categoryHref = section && attribute(section.tag, "a", "href")[0];
  const categoryUrl = categoryHref && visibleImageUrl(categoryHref, origin);
  const expectedCategory = typeof news.articleSection === "string" && /^[a-z-]+$/.test(news.articleSection)
    ? `${origin}/category/${news.articleSection}` : undefined;
  if (!expectedCategory || categoryUrl !== expectedCategory) return "NewsArticle section does not match the visible category link.";
  const expectedCrumbs = [{ name: "Home", item: `${origin}/` }, { name: section?.text, item: categoryUrl }, { name: headline, item: pageUrl }];
  if (!schemaType(breadcrumb, "BreadcrumbList") || !Array.isArray(breadcrumb.itemListElement) || breadcrumb.itemListElement.length !== 3 ||
    breadcrumb.itemListElement.some((value, index) => {
      const item = objectValue(value);
      return item?.["@type"] !== "ListItem" || item.position !== index + 1 || item.name !== expectedCrumbs[index].name ||
        exactSameOriginUrl(item.item, origin) !== expectedCrumbs[index].item;
    })) return "Article breadcrumbs do not match the Home, visible category, and current article hierarchy.";
  const heroTag = (article.match(/<img\b[^>]*>/gi) ?? []).find((tag) =>
    (attribute(tag, "img", "itemprop")[0] ?? "").split(/\s+/).includes("image"));
  const hero = heroTag && visibleImageUrl(attribute(heroTag, "img", "src")[0] ?? "", origin);
  const images = Array.isArray(news.image) ? news.image : [news.image];
  if (!hero || images.length === 0 || images.some((image) => {
    const url = schemaUrl(image) ?? objectValue(image)?.url;
    return typeof url !== "string" || visibleImageUrl(url, origin) !== hero;
  })) return "NewsArticle image does not match the visible HTTPS hero image.";
  const published = typeof news.datePublished === "string" ? news.datePublished : "";
  const modified = typeof news.dateModified === "string" ? news.dateModified : "";
  const publishedDate = markedElements(metadata, "time", "datePublished")[0];
  const modifiedDate = markedElements(metadata, "time", "dateModified")[0];
  const visiblePublished = publishedDate && attribute(publishedDate.tag, "time", "datetime")[0];
  const visibleModified = modifiedDate && attribute(modifiedDate.tag, "time", "datetime")[0];
  if (!visiblePublished || !visibleModified || published !== `${visiblePublished}T00:00:00.000Z` ||
    modified !== `${visibleModified}T00:00:00.000Z` || !Number.isFinite(Date.parse(published)) ||
    !Number.isFinite(Date.parse(modified)) || modified < published) {
    return "NewsArticle dates do not match the visible published/modified chronology.";
  }
  return null;
}

function aggregate(
  check: SiteFinding["check"],
  problems: Array<{ url: string; detail: string }>,
  success: string,
  fallbackUrl: string,
  checkedAt: string,
  recovery: string,
): SiteFinding {
  const first = problems[0];
  return first
    ? finding(check, "warning", `${problems.length} page(s) failed this check. ${first.detail}`, first.url, checkedAt, recovery)
    : finding(check, "pass", success, fallbackUrl, checkedAt, "No action is required; rerun the audit after publishing or template changes.");
}

export async function auditPublicSite(originValue: string, options: AuditOptions = {}): Promise<SiteFinding[]> {
  const origin = requirePublicOrigin(originValue);
  const checkedAt = (options.now ?? new Date()).toISOString();
  let fetchImpl = options.fetchImpl;
  if (!fetchImpl) {
    const addresses = await resolvePublicAddresses(new URL(origin).hostname, options.resolveHostname ?? defaultResolveHostname);
    const pinned = addresses[0] as ResolvedAddress;
    const requestImpl = options.requestImpl ?? defaultPinnedRequest;
    fetchImpl = (input, init) => requestImpl(new URL(String(input)), pinned, init?.signal ?? AbortSignal.timeout(8_000));
  }
  const findings: SiteFinding[] = [];
  let robotsText = "";
  let sitemapText = "";

  try {
    const response = await safeFetch(`${origin}/robots.txt`, origin, fetchImpl);
    robotsText = response.text;
    const valid = response.status === 200 && /user-agent\s*:/i.test(robotsText) && new RegExp(`sitemap\\s*:\\s*${origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/sitemap\\.xml`, "i").test(robotsText);
    findings.push(finding("robots", valid ? "pass" : "warning", valid ? "robots.txt is reachable and names the canonical sitemap." : `robots.txt returned HTTP ${response.status} or omitted the canonical sitemap.`, `${origin}/robots.txt`, checkedAt, valid ? "No action is required; rerun the audit after robots changes." : "Restore an indexable robots.txt that declares the canonical sitemap."));
  } catch (error) {
    findings.push(finding("robots", "error", error instanceof Error ? error.message : "robots.txt could not be checked.", `${origin}/robots.txt`, checkedAt, "Restore a bounded same-origin robots.txt response and rerun the audit."));
  }

  try {
    const response = await safeFetch(`${origin}/sitemap.xml`, origin, fetchImpl);
    sitemapText = response.text;
    if (response.status !== 200) throw new Error(`sitemap.xml returned HTTP ${response.status}.`);
  } catch (error) {
    findings.push(finding("sitemap", "error", error instanceof Error ? error.message : "sitemap.xml could not be checked.", `${origin}/sitemap.xml`, checkedAt, "Restore the canonical sitemap response and rerun the audit."));
    return findings;
  }

  const sitemapUrls = [...sitemapText.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => match[1] ?? "")
    .filter((value, index, values) => values.indexOf(value) === index)
    .filter((value) => {
      try { return new URL(value).origin === origin; } catch { return false; }
    })
    .slice(0, MAX_SITEMAP_URLS);
  const sitemapValid = sitemapUrls.includes(`${origin}/`) && sitemapUrls.length > 0;
  findings.push(finding("sitemap", sitemapValid ? "pass" : "warning", sitemapValid ? `sitemap.xml contains ${sitemapUrls.length} bounded canonical URL(s).` : "sitemap.xml did not contain the canonical home URL.", `${origin}/sitemap.xml`, checkedAt, sitemapValid ? "No action is required; rerun after route changes." : "Add canonical public URLs to sitemap.xml and include the home URL."));

  const pages: PageEvidence[] = [];
  const unreachable: Array<{ url: string; detail: string }> = [];
  const pageResults = await Promise.all(sitemapUrls.map(async (url) => {
    try {
      const response = await safeFetch(url, origin, fetchImpl);
      return { requestedUrl: url, response } as const;
    } catch (error) {
      return { requestedUrl: url, error: error instanceof Error ? error.message : "The page could not be fetched." } as const;
    }
  }));
  for (const result of pageResults) {
    if ("error" in result) unreachable.push({ url: result.requestedUrl, detail: result.error ?? "The page could not be fetched." });
    else if (result.response.status !== 200) unreachable.push({ url: result.requestedUrl, detail: `HTTP ${result.response.status} was returned.` });
    else if (result.response.url !== result.requestedUrl) unreachable.push({ url: result.requestedUrl, detail: `The sitemap URL redirects to ${result.response.url}.` });
    else pages.push({ url: result.requestedUrl, html: result.response.text });
  }

  const canonicalProblems = [...unreachable];
  const metadataProblems: Array<{ url: string; detail: string }> = [];
  const imageProblems: Array<{ url: string; detail: string }> = [];
  const linkProblems: Array<{ url: string; detail: string }> = [];
  const structuredProblems: Array<{ url: string; detail: string }> = [];
  const titles = new Map<string, string>();
  const descriptions = new Map<string, string>();
  let hasOrganization = false;
  const sitemapSet = new Set(sitemapUrls);
  const extraInternalUrls = new Map<string, string>();

  for (const page of pages) {
    const canonicalUrl = canonical(page.html);
    if (exactSameOriginUrl(canonicalUrl, origin) !== page.url) canonicalProblems.push({ url: page.url, detail: `Expected canonical ${page.url}; found ${canonicalUrl ?? "none"}.` });
    const pageTitle = title(page.html);
    const description = metaContent(page.html, "description")?.trim() ?? "";
    const robots = metaContent(page.html, "robots")?.toLocaleLowerCase() ?? "index,follow";
    if (!pageTitle || !description || /noindex|nofollow/.test(robots)) metadataProblems.push({ url: page.url, detail: "Title, description, or indexable robots metadata is missing." });
    const previousTitle = titles.get(pageTitle.toLocaleLowerCase());
    const previousDescription = descriptions.get(description.toLocaleLowerCase());
    if (pageTitle && previousTitle) metadataProblems.push({ url: page.url, detail: `Title duplicates ${previousTitle}.` });
    if (description && previousDescription) metadataProblems.push({ url: page.url, detail: `Description duplicates ${previousDescription}.` });
    if (pageTitle) titles.set(pageTitle.toLocaleLowerCase(), page.url);
    if (description) descriptions.set(description.toLocaleLowerCase(), page.url);

    const images = page.html.match(/<img\b[^>]*>/gi) ?? [];
    if (images.some((image) => !/\balt\s*=\s*(["'])[^"']+\1/i.test(image))) imageProblems.push({ url: page.url, detail: "At least one image has no useful alt text." });

    for (const href of attribute(page.html, "a", "href")) {
      try {
        const target = new URL(href, page.url);
        target.hash = "";
        if (target.origin === origin && !sitemapSet.has(target.toString()) && extraInternalUrls.size < MAX_EXTRA_INTERNAL_URLS) {
          extraInternalUrls.set(target.toString(), page.url);
        }
      } catch {
        linkProblems.push({ url: page.url, detail: `Internal link ${href} is malformed.` });
        break;
      }
    }

    const schemas = jsonLd(page.html);
    if (schemas.some((value) => validOrganization(value, origin))) hasOrganization = true;
    if (new URL(page.url).pathname.startsWith("/article/")) {
      const problem = structuredArticleProblem(page.html, page.url, origin, schemas);
      if (problem) structuredProblems.push({ url: page.url, detail: problem });
    }
  }
  if (!hasOrganization) structuredProblems.push({ url: origin, detail: "Organization structured data is missing." });
  if (pages.length === 0) {
    canonicalProblems.push({ url: `${origin}/sitemap.xml`, detail: "No sitemap page could be audited." });
    metadataProblems.push({ url: `${origin}/sitemap.xml`, detail: "No sitemap page could be audited." });
    imageProblems.push({ url: `${origin}/sitemap.xml`, detail: "No sitemap page could be audited." });
    linkProblems.push({ url: `${origin}/sitemap.xml`, detail: "No sitemap page could be audited." });
  }
  const extraLinkResults = await Promise.all([...extraInternalUrls.entries()].map(async ([url, source]) => {
    try {
      const response = await safeFetch(url, origin, fetchImpl);
      return response.status >= 200 && response.status < 400
        ? null
        : { url: source, detail: `Internal link ${url} returned HTTP ${response.status}.` };
    } catch (error) {
      return { url: source, detail: `Internal link ${url} failed: ${error instanceof Error ? error.message : "request error"}` };
    }
  }));
  linkProblems.push(...extraLinkResults.filter((value): value is { url: string; detail: string } => value !== null));

  findings.push(aggregate("canonical", canonicalProblems, `All ${pages.length} audited pages use their exact canonical URL.`, origin, checkedAt, "Correct the canonical URL or restore the affected sitemap page."));
  findings.push(aggregate("metadata", metadataProblems, `All ${pages.length} audited pages have unique titles, descriptions, and indexable robots metadata.`, origin, checkedAt, "Add a unique title and description and remove unintended noindex or nofollow directives."));
  findings.push(aggregate("image-alt", imageProblems, "Every audited image has useful alt text.", origin, checkedAt, "Add accurate, concise alt text to the affected image."));
  findings.push(aggregate("internal-links", linkProblems, "Every audited internal link resolves to a canonical sitemap URL.", origin, checkedAt, "Repair the internal link or add the canonical destination to the sitemap."));
  findings.push(aggregate("structured-data", structuredProblems, "Organization and article structured data contain the required fields.", origin, checkedAt, "Correct the missing structured-data fields and validate the affected page."));
  return findings;
}

export function siteFindingsToSeoWarnings(findings: readonly SiteFinding[]): Array<{ code: string; url: string; detail: string }> {
  return findings
    .filter(({ state }) => state !== "pass")
    .map((value) => ({ code: `site-audit:${value.check}`, url: value.affectedUrl, detail: `${value.evidence} Recovery: ${value.recoveryAction}` }))
    .sort((left, right) => left.code.localeCompare(right.code) || left.url.localeCompare(right.url) || left.detail.localeCompare(right.detail));
}
