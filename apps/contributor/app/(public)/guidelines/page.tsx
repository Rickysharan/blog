import Link from "next/link";

export default function GuidelinesPage() {
  return (
    <>
      <header className="simple-header">
        <Link className="wordmark" href="/" aria-label="OmniLede home">
          Omni<span>Lede</span>
        </Link>
        <Link className="text-link" href="/">
          Back to desk
        </Link>
      </header>
      <main id="main-content" className="public-shell public-shell--narrow">
        <p className="eyebrow">Contributor standards · v1</p>
        <h1>Guidelines for useful reporting.</h1>
        <p className="lede">
          We publish clear, original work that helps a global reader understand what changed and why
          it matters. Read these standards before your first submission.
        </p>
        <div className="guideline-list">
          <section id="anime">
            <p className="guideline-list__number">01</p>
            <div>
              <h2>Report, don’t recap</h2>
              <p>Use your own words, identify what is confirmed, and link to the primary source.</p>
            </div>
          </section>
          <section id="movies">
            <p className="guideline-list__number">02</p>
            <div>
              <h2>Give the reader context</h2>
              <p>Every story should explain the change, the evidence, and a concise “why it matters.”</p>
            </div>
          </section>
          <section id="politics">
            <p className="guideline-list__number">03</p>
            <div>
              <h2>Keep the world in view</h2>
              <p>We welcome global perspectives. Avoid unsupported claims, stereotypes, and false certainty.</p>
            </div>
          </section>
          <section id="sports">
            <p className="guideline-list__number">04</p>
            <div>
              <h2>Source every important fact</h2>
              <p>Use HTTPS sources, separate reporting from analysis, and disclose relevant conflicts.</p>
            </div>
          </section>
          <section id="finance">
            <p className="guideline-list__number">05</p>
            <div>
              <h2>Finance needs a disclaimer</h2>
              <p>Market writing is informational, not personal financial advice. Never promise returns.</p>
            </div>
          </section>
          <section id="share-market">
            <p className="guideline-list__number">06</p>
            <div>
              <h2>Review is part of the process</h2>
              <p>Submissions can be returned for changes. Approval is human-accountable and never automatic.</p>
            </div>
          </section>
        </div>
        <section id="points" className="terms-callout">
          <p className="eyebrow">Points beta</p>
          <h2>Points are a thank-you, not earnings.</h2>
          <p>
            During this $0 launch, approved work may earn points for testing. Points have no guaranteed
            cash value, and redemption is disabled.
          </p>
          <Link className="button button--ink" href="/signup">
            Create contributor account
          </Link>
        </section>
      </main>
      <footer className="site-footer">
        <p>OmniLede contributor desk</p>
        <Link href="/">Home</Link>
      </footer>
    </>
  );
}
