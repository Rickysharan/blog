"use client";

import { useState } from "react";

import type { ProfileRecord } from "../lib/profiles/types";

const languageOptions = [
  ["en", "English"],
  ["en-GB", "English (UK)"],
  ["es", "Español"],
  ["fr", "Français"],
  ["de", "Deutsch"],
  ["pt-BR", "Português (Brazil)"],
  ["ja", "日本語"],
  ["ko", "한국어"],
  ["zh", "中文"],
  ["ar", "العربية"]
] as const;

export function ProfileForm({ initialProfile }: { initialProfile: ProfileRecord }) {
  const [profile, setProfile] = useState(initialProfile);
  const [displayName, setDisplayName] = useState(initialProfile.displayName === "Contributor" ? "" : initialProfile.displayName);
  const [countryCode, setCountryCode] = useState(initialProfile.countryCode ?? "");
  const [preferredLanguage, setPreferredLanguage] = useState(initialProfile.preferredLanguage);
  const [payoutPreference, setPayoutPreference] = useState(initialProfile.payoutPreference);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    setError("");
    setStatus("");
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: profile.version,
          displayName,
          countryCode: countryCode || null,
          preferredLanguage,
          payoutPreference
        })
      });
      const body = (await response.json()) as { error?: string; profile?: ProfileRecord };
      if (!response.ok || !body.profile) {
        setError(body.error ?? "Unable to save your profile");
        return;
      }
      setProfile(body.profile);
      setStatus("Profile saved.");
    } catch {
      setError("The network is unavailable. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="settings-card profile-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <div>
        <p className="eyebrow">Your contributor profile</p>
        <h2>Tell readers who is behind the byline</h2>
        <p>Your profile helps editors route work globally. It never controls your permissions or points.</p>
      </div>
      <label>
        Display name
        <input name="displayName" autoComplete="name" required maxLength={100} value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
      </label>
      <label>
        Country code
        <input name="countryCode" autoComplete="country" inputMode="text" placeholder="e.g. IN" maxLength={2} value={countryCode} onChange={(event) => setCountryCode(event.target.value.replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase())} />
        <span className="field-hint">Use your ISO 3166-1 alpha-2 code. This is routing context, not a precise location.</span>
      </label>
      <label>
        Preferred language
        <select name="preferredLanguage" value={preferredLanguage} onChange={(event) => setPreferredLanguage(event.target.value)}>
          {languageOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label>
        Future payout preference
        <select name="payoutPreference" value={payoutPreference} onChange={(event) => setPayoutPreference(event.target.value as typeof payoutPreference)}>
          <option value="not_configured">Not configured</option>
          <option value="bank_transfer_interest">Interested in bank transfer later</option>
          <option value="gift_card_interest">Interested in gift cards later</option>
        </select>
        <span className="field-hint">Research only. Do not enter bank, card, or payment details.</span>
      </label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {status ? <p className="form-success" role="status">{status}</p> : null}
      <button className="button button-primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save profile"}</button>
    </form>
  );
}
