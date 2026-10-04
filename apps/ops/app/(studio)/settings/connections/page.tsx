import { GoogleConnection } from "../../../../components/connections/google-connection";
import { listGoogleConnections } from "../../../../lib/google/connections";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const connections = await listGoogleConnections();
  return (
    <div className="studio-page">
      <p className="eyebrow">Settings</p>
      <h1>Provider connections</h1>
      <p className="studio-page-intro">Connect free Google reporting APIs to replace empty dashboard cards with sourced data. Studio shows stale or unavailable states when Google cannot return a report.</p>
      <GoogleConnection connections={connections} />
    </div>
  );
}
