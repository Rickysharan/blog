import { requireAdmin } from "../../../../lib/auth/authorization";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requireAdmin();
  return <div className="account-page"><div className="page-heading"><p className="eyebrow">Operations settings</p><h1>Guardrails before growth.</h1><p>Provider thresholds, reward rules, display rates, and the redemption switch are server-managed and audited.</p></div><section className="settings-card"><h2>Redemptions disabled</h2><p>REDEMPTIONS_ENABLED=false and the independent funded gate must both be enabled before any future request path can exist.</p></section></div>;
}
