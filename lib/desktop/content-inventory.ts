import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  CATEGORY_SLUGS,
  type CategorySlug,
} from "@/lib/config/categories";
import { parseArticleFile } from "@/lib/content/schema";
import {
  loadGitHubEditorialInventory,
  type EditorialInventory,
  type EditorialInventoryItem,
  type EditorialInventoryKind,
} from "@omnilede/editorial";
import type { FetchLike } from "@/lib/pipeline/types";

export type { EditorialInventory, EditorialInventoryItem, EditorialInventoryKind };

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

export async function loadEditorialInventory(
  input: LoadEditorialInventoryInput,
): Promise<EditorialInventory> {
  if (input.env.LOCAL_WRITER_SYNC === "true") {
    const target = {
      repository: input.env.GITHUB_REPOSITORY ?? "",
      branch: input.env.GITHUB_BRANCH ?? "",
      token: input.env.GITHUB_TOKEN ?? "",
      fetchImpl: input.fetchImpl,
    };
    return loadGitHubEditorialInventory(target);
  }
  return {
    source: "local",
    items: await localInventory(input.contentRoot),
  };
}
