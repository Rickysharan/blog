import { MfaEnrollment } from "../../../components/mfa-enrollment";
import { ProfileForm } from "../../../components/profile-form";
import { getProfile } from "../../../lib/profiles/repository";
import { requireIdentity } from "../../../lib/auth/authorization";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings | OmniLede Contributor" };

export default async function SettingsPage() {
  const identity = await requireIdentity();
  const profile = await getProfile(identity.userId);
  if (!profile) throw new Error("Profile not found");
  return (
    <div className="account-page">
      <div className="page-heading">
        <p className="eyebrow">Settings</p>
        <h1>Account security and preferences</h1>
        <p>Keep your account protected before you submit work or join a review team.</p>
      </div>
      <ProfileForm initialProfile={profile} />
      <MfaEnrollment />
      <section className="settings-card">
        <p className="eyebrow">Points beta</p>
        <h2>$0 launch mode</h2>
        <p>OmniLede points are an internal recognition system during launch. They have no cash value, and we will never ask for bank details here.</p>
      </section>
    </div>
  );
}
