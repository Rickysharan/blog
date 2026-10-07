import type { FetchLike, QueueStory } from "@/lib/pipeline/types";

const MAX_SOURCE_BYTES = 1_500_000;
const MAX_SOURCE_WORDS = 1_500;
const MIN_USEFUL_WORDS = 120;
const SOURCE_TIMEOUT_MS = 12_000;

const namedEntities: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "…",
  ldquo: "“",
  lsquo: "‘",
  lt: "<",
  nbsp: " ",
  quot: '"',
  rdquo: "”",
  rsquo: "’",
};

function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(#x[\da-f]+|#\d+|[a-z]+);/gi,
    (entity, code: string) => {
      if (code.startsWith("#x")) {
        const point = Number.parseInt(code.slice(2), 16);
        return Number.isFinite(point)
          ? String.fromCodePoint(point)
          : entity;
      }
      if (code.startsWith("#")) {
        const point = Number.parseInt(code.slice(1), 10);
        return Number.isFinite(point)
          ? String.fromCodePoint(point)
          : entity;
      }
      return namedEntities[code.toLocaleLowerCase()] ?? entity;
    },
  );
}

function plainText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(value: string): number {
  return (
    value.match(
      /[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu,
    )?.length ?? 0
  );
}

function truncateWords(value: string, maximum: number): string {
  const matches = [
    ...value.matchAll(
      /[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu,
    ),
  ];

  if (matches.length <= maximum) return value;

  const last = matches[maximum - 1];
  if (!last) return "";

  const end = (last.index ?? 0) + last[0].length;
  return `${value.slice(0, end).trimEnd()}…`;
}

async function readBoundedHtml(
  response: Response,
): Promise<string | undefined> {
  const contentType = response.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLocaleLowerCase();

  if (
    !response.ok ||
    (contentType !== "text/html" &&
      contentType !== "application/xhtml+xml")
  ) {
    return undefined;
  }

  const declaredLength = Number(
    response.headers.get("content-length"),
  );

  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_SOURCE_BYTES
  ) {
    return undefined;
  }

  if (!response.body) return undefined;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      total += value.byteLength;

      if (total > MAX_SOURCE_BYTES) {
        await reader.cancel("Source page exceeded safety limit");
        return undefined;
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(bytes);
}

export function extractSourceContext(
  html: string,
): string | undefined {
  const paragraphs: string[] = [];
  const seen = new Set<string>();

  for (
    const match of html.matchAll(
      /<p\b[^>]*>([\s\S]*?)<\/p>/gi,
    )
  ) {
    const paragraph = plainText(match[1]);

    if (paragraph.length < 40) continue;
    if (
      /^(?:advertisement|read more|related:|sign up|subscribe)\b/i.test(
        paragraph,
      )
    ) {
      continue;
    }

    const normalized = paragraph.toLocaleLowerCase();
    if (seen.has(normalized)) continue;

    seen.add(normalized);
    paragraphs.push(paragraph);
  }

  const context = truncateWords(
    paragraphs.join("\n\n"),
    MAX_SOURCE_WORDS,
  );

  if (countWords(context) < MIN_USEFUL_WORDS) {
    return undefined;
  }

  return context;
}

export async function fetchSourceContext(
  story: QueueStory,
  options: {
    fetchImpl?: FetchLike;
    signal?: AbortSignal;
  } = {},
): Promise<string | undefined> {
  let sourceUrl: URL;

  try {
    sourceUrl = new URL(story.sourceUrl);
  } catch {
    return undefined;
  }

  if (
    sourceUrl.protocol !== "https:" ||
    sourceUrl.username ||
    sourceUrl.password
  ) {
    return undefined;
  }

  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(sourceUrl, {
      redirect: "follow",
      headers: {
        accept:
          "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        "user-agent":
          "OmniLede/1.0 (+https://github.com/Rickysharan/blog; editorial source verification)",
      },
      signal:
        options.signal ??
        AbortSignal.timeout(SOURCE_TIMEOUT_MS),
    });

    const html = await readBoundedHtml(response);

    return html
      ? extractSourceContext(html)
      : undefined;
  } catch {
    return undefined;
  }
}
