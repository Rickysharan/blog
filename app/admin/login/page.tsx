import type { Metadata } from "next";

import { LoginForm } from "@/components/admin/login-form";

export const metadata: Metadata = {
  title: "Editorial sign in",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-lg items-center px-4 py-16 sm:px-6">
      <section className="w-full rounded-2xl border border-line bg-panel p-6 shadow-sm sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">
          OmniLede editorial
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-ink">
          Review desk sign in
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          This private area is for reviewing drafts. Signing in never publishes content by itself.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
