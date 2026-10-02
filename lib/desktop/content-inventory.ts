import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  CATEGORY_SLUGS,
  isCategorySlug,
  type CategorySlug,
} from "@/lib/config/categories";
import { parseArticleFile } from "@/lib/content/schema";
import { GitDataClient, type GitHubTreeEntry } from "@/lib/github/git-data-client";
import { resolveLocalGitHubTarget } from "@/lib/pipeline/local-github";
import type { FetchLike } from "@/lib/pipeline/types";

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
  items: EditorialInventoryItem[];
}

export interface LoadEditorialInventoryInput {
  contentRoot: string;
  env: Record<string, string | undefined>;
  fetchImpl?: FetchLike;
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

async function localInventory(contentRoot: string): Promise<EditorialInventoryItem[]> {
  const items = (
    await Promise.all(
      CATEGORY_SLUGS.flatMap((category) =>
        (["drafts", "articles"] as const).map(async (directory) => {
          const root = path.join(contentRoot, directory, category);
          let filenames: string[];
          try {
            filenames = (await readdir(root)).filter((name) => name.endsWith(".mdx"));
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
            throw error;
          }
          const kind = directory === "drafts" ? "draft" : "published";
          return Promise.all(filenames.map(async (filename) =>
            inventoryItem(kind, category, filename, await readFile(path.join(root, filename), "utf8"))));
        }),
      ),
    )
  ).flat(2).filter((item): item is EditorialInventoryItem => item !== null);
  return sortItems(items);
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

async function githubInventory(
  env: Record<string, string | undefined>,
  fetchImpl?: FetchLike,
): Promise<EditorialInventoryItem[]> {
  const target = await resolveLocalGitHubTarget(env);
  const client = new GitDataClient({ ...target, fetchImpl });
  const snapshot = await client.snapshot();
  const refs = snapshot.entries.map(remoteRef).filter((ref): ref is NonNullable<typeof ref> => ref !== null);
  const items = await Promise.all(refs.map(async (ref) =>
    inventoryItem(ref.kind, ref.category, ref.filename, await client.readBlob(ref.sha))));
  return sortItems(items.filter((item): item is EditorialInventoryItem => item !== null));
}

export async function loadEditorialInventory(
  input: LoadEditorialInventoryInput,
): Promise<EditorialInventory> {
  if (input.env.LOCAL_WRITER_SYNC === "true") {
    return {
      source: "github",
      items: await githubInventory(input.env, input.fetchImpl),
    };
  }
  return {
    source: "local",
    items: await localInventory(input.contentRoot),
  };
}
