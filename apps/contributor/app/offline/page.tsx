import Link from "next/link";

export const metadata = { title: "Offline | OmniLede Contributor" };
export default function OfflinePage() { return <main className="offline-page"><p className="eyebrow">Offline mode</p><h1>Your desk is waiting.</h1><p>Public guidance is available from the cached shell. Reconnect before saving a draft, uploading an image, or submitting work.</p><Link className="button button-primary" href="/">Return to OmniLede</Link></main>; }
