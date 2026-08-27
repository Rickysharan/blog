import type { ReactNode } from "react";

export function InfoPage({
  eyebrow,
  title,
  intro,
  children,
  templateNotice = false,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
  templateNotice?: boolean;
}) {
  return (
    <main id="main-content" className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
      <header className="border-b border-line pb-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">{eyebrow}</p>
        <h1 className="mt-3 font-serif text-5xl font-semibold tracking-[-0.04em] sm:text-6xl">{title}</h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-muted">{intro}</p>
      </header>
      {templateNotice ? (
        <aside className="mt-8 border border-amber-500/50 border-l-4 bg-amber-500/10 p-4 text-sm leading-6 text-ink">
          Policy status: operational template. The site operator must add its legal identity and contact details, choose retention periods, and obtain qualified legal review for the launch jurisdictions.
        </aside>
      ) : null}
      <div className="article-prose mt-10">{children}</div>
    </main>
  );
}
