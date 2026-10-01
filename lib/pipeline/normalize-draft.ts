export interface NormalizedBody {
  body: string;
  repairs: string[];
}

function comparableHeading(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

export function normalizeGeneratedBody(title: string, body: string): NormalizedBody {
  let normalized = body.trim();
  const repairs: string[] = [];
  const leadingH1 = normalized.match(/^\s*#\s+([^\n]+?)\s*(?:\n+|$)/);
  if (leadingH1 && comparableHeading(leadingH1[1]) === comparableHeading(title)) {
    normalized = normalized.slice(leadingH1[0].length).trim();
    repairs.push("Removed a duplicate leading headline");
  }

  const withoutSource = normalized.replace(
    /^\s*Source:\s*\[[^\]]+\]\(https:\/\/[^\s)]+\)\s*$/gim,
    "",
  );
  if (withoutSource !== normalized) {
    normalized = withoutSource;
    repairs.push("Removed model-generated source attribution");
  }

  const canonicalAnalysisHeading = "## Why it matters";
  const headingPattern = /^##[ \t]+why[ \t]+it[ \t]+matters[ \t]*$/gim;
  let headingChanged = false;
  normalized = normalized.replace(headingPattern, (heading) => {
    if (heading !== canonicalAnalysisHeading) headingChanged = true;
    return canonicalAnalysisHeading;
  });
  if (headingChanged) repairs.push("Normalized the Why it matters heading");

  return {
    body: normalized.replace(/\n{3,}/g, "\n\n").trim(),
    repairs,
  };
}
