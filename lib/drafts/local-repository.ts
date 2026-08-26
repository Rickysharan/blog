import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { CATEGORY_SLUGS } from "@/lib/config/categories";
import {
  DraftRepositoryError,
  type DraftDocument,
  type DraftRef,
  type DraftRepository,
  type DraftSummary,
  type PublishResult,
} from "@/lib/drafts/types";
import { validateDraftMdx, validateDraftRef } from "@/lib/drafts/validation";

interface LocalDraftRepositoryOptions {
  contentRoot?: string;
}

function contentVersion(mdx: string): string {
  return createHash("sha256").update(mdx, "utf8").digest("hex");
}

function toSummary(document: DraftDocument): DraftSummary {
  return {
    ref: document.ref,
    title: document.title,
    date: document.date,
    excerpt: document.excerpt,
    category: document.category,
    version: document.version,
  };
}

function repositoryError(error: unknown, fallback: string): DraftRepositoryError {
  if (error instanceof DraftRepositoryError) {
    return error;
  }
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOENT") {
    return new DraftRepositoryError("not_found", "Draft was not found", { cause: error });
  }
  if (code === "EEXIST") {
    return new DraftRepositoryError("conflict", "A published article already exists", {
      cause: error,
    });
  }
  return new DraftRepositoryError("storage_unavailable", fallback, { cause: error });
}

export class LocalDraftRepository implements DraftRepository {
  private readonly contentRoot: string;

  constructor(options: LocalDraftRepositoryOptions = {}) {
    this.contentRoot = options.contentRoot ?? path.join(process.cwd(), "content");
  }

  private draftPath(refInput: DraftRef): string {
    const ref = validateDraftRef(refInput);
    return path.join(this.contentRoot, "drafts", ref.category, ref.filename);
  }

  private articlePath(refInput: DraftRef): string {
    const ref = validateDraftRef(refInput);
    return path.join(this.contentRoot, "articles", ref.category, ref.filename);
  }

  async list(): Promise<DraftSummary[]> {
    try {
      const refs = (
        await Promise.all(
          CATEGORY_SLUGS.map(async (category) => {
            const directory = path.join(this.contentRoot, "drafts", category);
            try {
              const entries = await fs.readdir(directory, { withFileTypes: true });
              return entries
                .filter((entry) => entry.isFile() && entry.name.endsWith(".mdx"))
                .map((entry) => validateDraftRef({ category, filename: entry.name }));
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return [];
              }
              throw error;
            }
          }),
        )
      ).flat();
      const drafts = await Promise.all(refs.map((ref) => this.read(ref)));
      return drafts
        .map(toSummary)
        .sort(
          (left, right) =>
            left.category.localeCompare(right.category) ||
            right.date.localeCompare(left.date) ||
            left.title.localeCompare(right.title),
        );
    } catch (error) {
      throw repositoryError(error, "Local drafts could not be listed");
    }
  }

  async read(refInput: DraftRef): Promise<DraftDocument> {
    const ref = validateDraftRef(refInput);
    try {
      const mdx = await fs.readFile(this.draftPath(ref), "utf8");
      const article = validateDraftMdx(ref, mdx);
      return {
        ref,
        title: article.title,
        date: article.date,
        excerpt: article.excerpt,
        category: article.category,
        version: contentVersion(mdx),
        mdx,
        article,
      };
    } catch (error) {
      throw repositoryError(error, "Local draft could not be read");
    }
  }

  private async assertVersion(ref: DraftRef, expectedVersion?: string): Promise<DraftDocument> {
    const current = await this.read(ref);
    if (expectedVersion && expectedVersion !== current.version) {
      throw new DraftRepositoryError(
        "conflict",
        "Draft changed since it was loaded; refresh before trying again",
      );
    }
    return current;
  }

  async save(
    refInput: DraftRef,
    mdx: string,
    expectedVersion?: string,
  ): Promise<DraftDocument> {
    const ref = validateDraftRef(refInput);
    validateDraftMdx(ref, mdx);
    await this.assertVersion(ref, expectedVersion);
    const draftPath = this.draftPath(ref);
    const temporaryPath = path.join(
      path.dirname(draftPath),
      `.${ref.filename}.${randomUUID()}.tmp`,
    );

    try {
      await fs.writeFile(temporaryPath, mdx, { encoding: "utf8", flag: "wx" });
      await fs.rename(temporaryPath, draftPath);
      return await this.read(ref);
    } catch (error) {
      await fs.unlink(temporaryPath).catch(() => undefined);
      throw repositoryError(error, "Local draft could not be saved");
    }
  }

  async publish(
    refInput: DraftRef,
    mdx: string,
    expectedVersion?: string,
  ): Promise<PublishResult> {
    const ref = validateDraftRef(refInput);
    validateDraftMdx(ref, mdx);
    const articlePath = this.articlePath(ref);
    try {
      await fs.access(articlePath);
      throw new DraftRepositoryError(
        "conflict",
        "A published article with this slug already exists",
      );
    } catch (error) {
      if (
        error instanceof DraftRepositoryError ||
        (error as NodeJS.ErrnoException).code !== "ENOENT"
      ) {
        throw repositoryError(error, "Published article could not be checked");
      }
    }

    await this.save(ref, mdx, expectedVersion);
    try {
      await fs.mkdir(path.dirname(articlePath), { recursive: true });
      await fs.rename(this.draftPath(ref), articlePath);
      return { articlePath };
    } catch (error) {
      throw repositoryError(error, "Draft could not be published locally");
    }
  }

  async discard(refInput: DraftRef, expectedVersion?: string): Promise<void> {
    const ref = validateDraftRef(refInput);
    await this.assertVersion(ref, expectedVersion);
    try {
      await fs.unlink(this.draftPath(ref));
    } catch (error) {
      throw repositoryError(error, "Draft could not be discarded locally");
    }
  }
}
