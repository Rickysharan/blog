import Link from "next/link";
import { redirect } from "next/navigation";

import { getProfile } from "../../../lib/profiles/repository";
import { requireIdentity } from "../../../lib/auth/authorization";
import { isProfileComplete } from "../../../lib/profiles/completion";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const identity = await requireIdentity();
  const profile = await getProfile(identity.userId);
  if (!isProfileComplete(profile)) redirect("/onboarding");
  return (
    <div className="dashboard-page">
      <p className="eyebrow">Contributor dashboard</p>
      <h1>Your desk, at a glance.</h1>
      <p className="lede">Welcome back. Choose a beat, follow a lead, and send work worth reading.</p>
      <div className="dashboard-grid">
        <section className="dashboard-card dashboard-card--ink">
          <p className="dashboard-card__eyebrow">Next move</p>
          <h2>Submit a reported story</h2>
          <p>Start with one clear claim, an HTTPS source, and the context a busy reader needs.</p>
          <Link className="button button--paper" href="/submit">
            Open editor ↗
          </Link>
        </section>
        <section className="dashboard-card">
          <p className="dashboard-card__eyebrow">Your points</p>
          <p className="dashboard-card__metric">0</p>
          <p>Points beta · no cash redemption</p>
          <Link className="text-link" href="/wallet">
            View wallet →
          </Link>
        </section>
        <section className="dashboard-card">
          <p className="dashboard-card__eyebrow">Desk guide</p>
          <h2>What makes work useful?</h2>
          <p>Original language, transparent sourcing, and a reason for the reader to care.</p>
          <Link className="text-link" href="/guidelines">
            Revisit standards →
          </Link>
        </section>
      </div>
    </div>
  );
}
