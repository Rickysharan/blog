"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type AuthMode = "login" | "signup";

export function AuthForm({ mode, next }: { mode: AuthMode; next?: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const isSignup = mode === "signup";

  useEffect(() => {
    const url = new URL(window.location.href);
    const currentNext = url.searchParams.get("next");
    if (currentNext && currentNext !== next) {
      if (next) url.searchParams.set("next", next);
      else url.searchParams.delete("next");
      window.history.replaceState(null, "", url);
    }
  }, [next]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("");
    setPending(true);
    try {
      const query = next ? `?next=${encodeURIComponent(next)}` : "";
      const response = await fetch(`/api/auth/${mode}${query}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const body = (await response.json()) as { error?: string; needsConfirmation?: boolean; next?: string };
      if (!response.ok) {
        setError(body.error ?? "Unable to continue");
        return;
      }
      if (body.needsConfirmation) {
        setStatus("Check your inbox to confirm your email, then return here to sign in.");
      } else {
        window.location.assign(body.next ?? "/dashboard");
      }
    } catch {
      setError("The network is unavailable. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="auth-card" onSubmit={submit} noValidate>
      <div>
        <p className="eyebrow">{isSignup ? "Join the newsroom" : "Welcome back"}</p>
        <h1>{isSignup ? "Create your contributor account" : "Sign in to OmniLede"}</h1>
        <p className="auth-intro">
          {isSignup
            ? "Pitch global stories, build a track record, and earn points during our $0 launch."
            : "Pick up where you left off in the global contributor newsroom."}
        </p>
      </div>
      <label>
        Email address
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label>
        Password
        <input
          type="password"
          name="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          minLength={12}
          maxLength={128}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <span className="field-hint">Use 12–128 characters.</span>
      </label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {status ? <p className="form-success" role="status">{status}</p> : null}
      <button className="button button-primary button-wide" type="submit" disabled={pending}>
        {pending ? "Working…" : isSignup ? "Create account" : "Sign in"}
      </button>
      <div className="auth-links">
        {isSignup ? <Link href="/login">Already have an account? Sign in</Link> : <Link href="/forgot-password">Forgot your password?</Link>}
        {!isSignup ? <Link href="/signup">New here? Join as a contributor</Link> : null}
      </div>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const body = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) setError(body.error ?? "Unable to continue");
      else setStatus(body.message ?? "If an account exists, a reset link will be sent shortly.");
    } catch {
      setError("The network is unavailable. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="auth-card" onSubmit={submit} noValidate>
      <p className="eyebrow">Account recovery</p>
      <h1>Reset your password</h1>
      <p className="auth-intro">Enter your email and we’ll send a reset link if an account exists.</p>
      <label>
        Email address
        <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {status ? <p className="form-success" role="status">{status}</p> : null}
      <button className="button button-primary button-wide" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </button>
      <div className="auth-links"><Link href="/login">Back to sign in</Link></div>
    </form>
  );
}

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) setError(body.error ?? "Unable to reset password");
      else setStatus("Password updated. You can now sign in with your new password.");
    } catch {
      setError("The network is unavailable. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="auth-card" onSubmit={submit} noValidate>
      <p className="eyebrow">Account recovery</p>
      <h1>Choose a new password</h1>
      <p className="auth-intro">Use a password you do not reuse on another site.</p>
      <label>
        New password
        <input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} />
      </label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {status ? <p className="form-success" role="status">{status}</p> : null}
      <button className="button button-primary button-wide" type="submit" disabled={pending}>
        {pending ? "Updating…" : "Update password"}
      </button>
      <div className="auth-links"><Link href="/login">Back to sign in</Link></div>
    </form>
  );
}
