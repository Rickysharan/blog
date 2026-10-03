"use client";
/** Text-only Markdown preview. Never compile or execute untrusted MDX/HTML. */
export function ArticlePreview({ mdx }: { mdx: string }) {
  const body = mdx.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
  return <section className="article-preview" aria-label="Article preview"><p className="eyebrow">Safe reading preview · MDX components shown as text</p>{body.split(/\r?\n\r?\n/).map((paragraph, index) => {
    if (paragraph.startsWith("### ")) return <h4 key={index}>{paragraph.slice(4)}</h4>;
    if (paragraph.startsWith("## ")) return <h3 key={index}>{paragraph.slice(3)}</h3>;
    if (paragraph.startsWith("# ")) return <h2 key={index}>{paragraph.slice(2)}</h2>;
    return <p key={index}>{paragraph}</p>;
  })}</section>;
}
