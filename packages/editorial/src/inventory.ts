import {
  CATEGORY_SLUGS,
  isCategorySlug,
  type CategorySlug,
} from "./categories";
import { parseArticleFile } from "./content/schema";
import {
  GitDataClient,
  type FetchLike,
  type GitDataClientOptions,
  type GitHubTreeEntry,
} from "./github/git-data-client";

export type EditorialInventoryKind = "draft" | "published";

export interface EditorialInventoryItem {
  kind: EditorialInventoryKind;
  category: CategorySlug;
  filename: string;
  slug: string;
  date: string;
}

export interface EditorialInventory {
  source: "local" | "github";
  version?: string;
  items: EditorialInventoryItem[];
}

function inventoryItem(
  kind: EditorialInventoryKind,
  category: CategorySlug,
  filename: string,
  source: string,
): EditorialInventoryItem | null {
  try {
    const article = parseArticleFile(source, filename);
    if (article.category !== category) return null;
    return {
      kind,
      category,
      filename,
      slug: article.slug,
      date: new Date(`${article.date}T00:00:00.000Z`).toISOString(),
    };
  } catch {
    return null;
  }
}

function sortItems(items: EditorialInventoryItem[]): EditorialInventoryItem[] {
  const categoryIndex = new Map(CATEGORY_SLUGS.map((category, index) => [category, index]));
  return items.sort((left, right) =>
    (categoryIndex.get(left.category) ?? 0) - (categoryIndex.get(right.category) ?? 0) ||
    left.kind.localeCompare(right.kind) ||
    right.date.localeCompare(left.date) ||
    left.filename.localeCompare(right.filename));
}

function remoteRef(entry: GitHubTreeEntry): {
  kind: EditorialInventoryKind;
  category: CategorySlug;
  filename: string;
  sha: string;
} | null {
  if (entry.type !== "blob" || typeof entry.path !== "string" || typeof entry.sha !== "string") {
    return null;
  }
  const parts = entry.path.split("/");
  if (
    parts.length !== 4 ||
    parts[0] !== "content" ||
    (parts[1] !== "drafts" && parts[1] !== "articles") ||
    !isCategorySlug(parts[2]) ||
    !parts[3]?.endsWith(".mdx")
  ) {
    return null;
  }
  return {
    kind: parts[1] === "drafts" ? "draft" : "published",
    category: parts[2],
    filename: parts[3],
    sha: entry.sha,
  };
}

export async function loadGitHubEditorialInventory(
  options: GitDataClientOptions & { fetchImpl?: FetchLike },
): Promise<EditorialInventory> {
  const client = new GitDataClient(options);
  const snapshot = await client.snapshot();
  const refs = snapshot.entries.map(remoteRef).filter((ref): ref is NonNullable<typeof ref> => ref !== null);
  const items = await Promise.all(refs.map(async (ref) =>
    inventoryItem(ref.kind, ref.category, ref.filename, await client.readBlob(ref.sha))));
  return {
    source: "github",
    version: snapshot.headSha,
    items: sortItems(items.filter((item): item is EditorialInventoryItem => item !== null)),
  };
}
