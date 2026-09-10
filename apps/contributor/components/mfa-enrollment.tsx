"use client";

import { useState } from "react";
import Image from "next/image";

export function MfaEnrollment() {
  const [factor, setFactor] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function start() {
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/mfa/enroll", { method: "POST", credentials: "include" });
      const body = (await response.json()) as { error?: string; factorId?: string; qrCode?: string; secret?: string };
      if (!response.ok || !body.factorId || !body.qrCode || !body.secret) {
        setError(body.error ?? "Unable to start multi-factor setup");
      } else {
        setFactor({ factorId: body.factorId, qrCode: body.qrCode, secret: body.secret });
      }
    } catch {
      setError("The network is unavailable. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function verify() {
    if (!factor) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factorId: factor.factorId, code })
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) setError(body.error ?? "Unable to verify authenticator code");
      else { setMessage("Multi-factor authentication is enabled on this account."); setFactor(null); setCode(""); }
    } catch {
      setError("The network is unavailable. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="settings-card" aria-labelledby="mfa-heading">
      <p className="eyebrow">Account security</p>
      <h2 id="mfa-heading">Protect your account with an authenticator</h2>
      <p>Reviewer and administrator access requires multi-factor authentication. Contributors can enable it at any time.</p>
      {factor ? (
        <div className="mfa-setup">
          <Image src={factor.qrCode} alt="QR code for your OmniLede authenticator" width={180} height={180} unoptimized />
          <p className="field-hint">Can’t scan? Enter this setup key manually: <code>{factor.secret}</code></p>
          <label>Six-digit authenticator code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label>
          <button className="button button-primary" type="button" onClick={verify} disabled={pending || code.length !== 6}>{pending ? "Verifying…" : "Verify and enable"}</button>
        </div>
      ) : (
        <button className="button button-secondary" type="button" onClick={start} disabled={pending}>{pending ? "Preparing…" : "Set up authenticator"}</button>
      )}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {message ? <p className="form-success" role="status">{message}</p> : null}
    </section>
  );
}
