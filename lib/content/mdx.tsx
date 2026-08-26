import type { AnchorHTMLAttributes, ReactElement } from "react";

import { MDXRemote } from "next-mdx-remote/rsc";

const MODULE_STATEMENT = /^\s*(?:import|export)\s/m;

function ArticleLink({
  href = "",
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>): ReactElement {
  const external = href.startsWith("https://") || href.startsWith("http://");
  return (
    <a
      {...props}
      href={href}
      rel={external ? "noopener noreferrer" : undefined}
      target={external ? "_blank" : undefined}
    />
  );
}

const components = {
  a: ArticleLink,
};

export async function renderArticleMdx(source: string): Promise<ReactElement> {
  if (MODULE_STATEMENT.test(source)) {
    throw new Error("MDX imports are not allowed in article content");
  }

  return MDXRemote({ source, components });
}
