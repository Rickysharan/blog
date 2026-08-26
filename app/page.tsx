import { SITE_CONFIG } from "@/lib/config/site";

export default function HomePage() {
  return (
    <main id="main-content" className="mx-auto flex min-h-screen max-w-7xl items-center px-5 py-16 sm:px-8">
      <section className="max-w-3xl">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.24em] text-muted">
          The world, clearly edited
        </p>
        <h1 className="font-serif text-6xl font-semibold tracking-[-0.045em] sm:text-8xl">
          {SITE_CONFIG.name}
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-muted sm:text-xl">
          {SITE_CONFIG.description}
        </p>
      </section>
    </main>
  );
}
