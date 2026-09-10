export default function OperationsPage() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <p>OmniLede</p>
      </header>
      <main id="main-content" className="antialiased" tabIndex={-1}>
        <p className="eyebrow">Newsroom systems</p>
        <h1>OmniLede Operations</h1>
        <p>Coordinate the lightweight systems that keep the newsroom moving.</p>
        <p className="launch-mode">$0 launch mode</p>
      </main>
      <footer className="site-footer">Built for the OmniLede newsroom.</footer>
    </>
  );
}
