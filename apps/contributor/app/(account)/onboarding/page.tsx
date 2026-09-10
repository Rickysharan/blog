import { redirect } from "next/navigation";

import { requireIdentity } from "../../../lib/auth/authorization";
import { getProfile } from "../../../lib/profiles/repository";
import { ProfileForm } from "../../../components/profile-form";
import { isProfileComplete } from "../../../lib/profiles/completion";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up your profile | OmniLede Contributor" };

export default async function OnboardingPage() {
  const identity = await requireIdentity();
  const profile = await getProfile(identity.userId);
  if (!profile) throw new Error("Profile not found");
  if (isProfileComplete(profile)) redirect("/dashboard");

  return (
    <div className="account-page">
      <div className="page-heading">
        <p className="eyebrow">First, a little context</p>
        <h1>Set up your contributor profile.</h1>
        <p>A few safe details help editors route your global work. You can change them later.</p>
      </div>
      <ProfileForm initialProfile={profile} />
    </div>
  );
}
