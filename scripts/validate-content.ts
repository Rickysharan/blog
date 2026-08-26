import { validateContentTree } from "@/lib/content/validation";

const result = await validateContentTree();

console.log(
  `Content validation: ${result.publishedCount} published, ${result.draftCount} drafts, ${result.errors.length} errors.`,
);

for (const error of result.errors) {
  console.error(`[${error.kind}] ${error.path}: ${error.message}`);
}

if (!result.valid) {
  process.exitCode = 1;
}
