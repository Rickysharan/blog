const MARKDOWN_TEXT_CHARACTERS = /[\\\x60*_[\]<>~|]/g;
const MAX_EXTERNAL_URL_LENGTH = 2_048;

/** Escapes characters that could otherwise introduce inline Markdown or MDX syntax. */
export function escapeMarkdownText(value: string): string {
  return value
    .replace(MARKDOWN_TEXT_CHARACTERS, "\\$&")
    .replace(/(^|\n)([#>]|[-+]|\d+[.)])(?=\s)/g, "$1\\$2")
    .replace(/(^|\n)(\s*)(-{3,}|={1,})(?=\s*(?:\n|$))/g, (_match, start, indent, markers) =>
      start + indent + markers.replace(/[-=]/g, "\\$&"),
    );
}

/** Escapes a Markdown link label without changing the destination URL. */
export function escapeMarkdownLinkLabel(value: string): string {
  return escapeMarkdownText(value);
}

/**
 * Serializes a bounded external HTTPS URL for Markdown destinations without using
 * the untrusted input string after validation.
 */
export function safeMarkdownHttpsDestination(value: string): string {
  if (
    value.length === 0 ||
    value.length > MAX_EXTERNAL_URL_LENGTH ||
    /[\u0000-\u001f\u007f\s]/.test(value)
  ) {
    throw new Error("Unsafe Markdown destination");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Unsafe Markdown destination");
  }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") {
    throw new Error("Unsafe Markdown destination");
  }

  return parsed.href.replace(/[()[\]\\<>\x60"]/g, (character) =>
    "%" + character.codePointAt(0)?.toString(16).toUpperCase().padStart(2, "0"),
  );
}
