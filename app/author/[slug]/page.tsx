import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getAuthorProfileBySlug, getAuthorProfiles } from "@/lib/config/authors";
import { SITE_CONFIG } from "@/lib/config/site";

type AuthorPageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getAuthorProfiles().map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: AuthorPageProps): Promise<Metadata> {
  const profile = getAuthorProfileBySlug((await params).slug);
  if (!profile) notFound();
  const canonical = `${SITE_CONFIG.url}${profile.path}`;
  return {
    title: `${profile.name} | OmniLede`,
    description: `${profile.role}. ${profile.disclosure}`,
    alternates: { canonical },
    authors: [{ name: profile.name, url: canonical }],
  };
}

export default async function AuthorPage({ params }: AuthorPageProps) {
  const profile = getAuthorProfileBySlug((await params).slug);
  if (!profile) notFound();

  return (
    <main id="main-content" className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
      <article className="retro-page-banner">
        <p className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-muted">About the author</p>
        <h1 className="font-serif text-5xl font-semibold tracking-[-0.05em] sm:text-7xl">{profile.name}</h1>
        <p className="mt-6 text-xl font-semibold">{profile.role}.</p>
        <p className="mt-5 max-w-2xl text-base leading-8 text-muted">{profile.disclosure}</p>
      </article>
    </main>
  );
}
