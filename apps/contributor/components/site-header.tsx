import Link from "next/link";

export function SiteHeader() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header" role="banner">
        <div className="site-header__inner">
          <Link className="wordmark" href="/" aria-label="OmniLede home">
            Omni<span>Lede</span>
          </Link>
          <p className="site-header__kicker">Global contributor desk</p>
          <nav aria-label="Primary navigation" className="site-header__actions">
            <Link className="button button--quiet" href="/login">
              Sign in
            </Link>
            <Link className="button button--ink" href="/signup">
              Join as contributor
            </Link>
          </nav>
        </div>
      </header>
    </>
  );
}
