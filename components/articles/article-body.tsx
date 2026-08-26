import type { ReactNode } from "react";

export function ArticleBody({ children }: { children: ReactNode }) {
  return <div className="article-prose">{children}</div>;
}
