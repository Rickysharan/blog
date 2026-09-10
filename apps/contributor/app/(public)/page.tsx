import Link from "next/link";

import { SiteHeader } from "../../components/site-header";

const beats = [
  { name: "Anime", detail: "Episodes, seasons, studios", href: "/guidelines#anime" },
  { name: "Movies", detail: "Releases, reviews, box office", href: "/guidelines#movies" },
  { name: "Politics", detail: "Power, policy, context", href: "/guidelines#politics" },
  { name: "Sports", detail: "The global sporting day", href: "/guidelines#sports" },
  { name: "Finance", detail: "Business and the economy", href: "/guidelines#finance" },
  { name: "Share market", detail: "Indices and company moves", href: "/guidelines#share-market" }
];

export default function ContributorPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="public-shell">
        <section className="hero-grid" aria-labelledby="hero-title">
          <div className="hero-grid__copy">
            <p className="eyebrow">The open newsroom</p>
            <h1 id="hero-title">Make the world’s signal clearer.</h1>
            <p className="hero-grid__lead">
              OmniLede gives careful contributors a global desk for reporting what moves culture,
              institutions, and markets.
            </p>
            <div className="hero-grid__actions">
              <Link className="button button--ink" href="/signup">
                Start contributing <span aria-hidden="true">↗</span>
              </Link>
              <Link className="text-link" href="/guidelines">
                Read the desk guide
              </Link>
            </div>
          </div>
          <div className="hero-grid__note" aria-label="Contributor promise">
            <div className="stamp">OL / 01</div>
            <p className="hero-grid__quote">Original reporting. Clear sourcing. Useful context.</p>
            <p className="hero-grid__small">
              Every submission is reviewed. We reward craft and transparency—not volume.
            </p>
          </div>
        </section>

        <section className="section-block" aria-labelledby="beats-title">
          <div className="section-heading">
            <p className="eyebrow">Six global desks</p>
            <h2 id="beats-title">Choose the beat where you see around corners.</h2>
          </div>
          <div className="beat-grid">
            {beats.map((beat, index) => (
              <Link className="beat-card" href={beat.href} key={beat.name} id={beat.href.slice(12)}>
                <span className="beat-card__number">0{index + 1}</span>
                <span className="beat-card__name">{beat.name}</span>
                <span className="beat-card__detail">{beat.detail}</span>
                <span aria-hidden="true" className="beat-card__arrow">
                  ↗
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="notice-strip" aria-label="Launch program terms">
          <p className="notice-strip__title">$0 launch mode</p>
          <p>Points only during the beta. No cash value or redemption is promised.</p>
          <Link className="text-link text-link--light" href="/guidelines#points">
            See how it works ↗
          </Link>
        </section>
      </main>
      <footer className="site-footer">
        <p>OmniLede contributor desk</p>
        <Link href="/guidelines">Standards &amp; guidelines</Link>
      </footer>
    </>
  );
}
