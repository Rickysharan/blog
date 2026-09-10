"use client";

import { useRef, useState, type FormEvent } from "react";

export type ContactFormType = "general" | "support" | "advertising" | "partnership";

type ContactResponse = {
  ok?: boolean;
  message?: string;
};

const inputClass =
  "mt-2 min-h-12 w-full border border-line bg-canvas px-3 py-2 text-base text-ink outline-none transition focus:border-signal focus:ring-2 focus:ring-signal/25";

export function ContactForm({ initialType = "general" }: { initialType?: ContactFormType }) {
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const submissionKey = useRef<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setMessage("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    submissionKey.current ??= crypto.randomUUID();
    const payload = {
      inquiryType: formData.get("inquiryType"),
      name: formData.get("name"),
      email: formData.get("email"),
      organisation: formData.get("organisation"),
      subject: formData.get("subject"),
      message: formData.get("message"),
      website: formData.get("website"),
      submissionKey: submissionKey.current,
    };

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as ContactResponse;

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "We could not save your message. Please retry.");
      }

      setStatus("success");
      setMessage(result.message || "Your enquiry was saved for review.");
      submissionKey.current = null;
      form.reset();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "We could not save your message. Please retry.");
    }
  }

  return (
    <form
      aria-label="Contact OmniLede"
      className="not-prose my-7 border border-line bg-panel p-5 sm:p-7"
      onSubmit={onSubmit}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-bold text-ink">
          Enquiry type
          <select className={inputClass} defaultValue={initialType} name="inquiryType" required>
            <option value="general">General or editorial</option>
            <option value="support">Support</option>
            <option value="advertising">Advertising</option>
            <option value="partnership">Partnership</option>
          </select>
        </label>
        <label className="text-sm font-bold text-ink">
          Name
          <input autoComplete="name" className={inputClass} maxLength={100} minLength={2} name="name" required />
        </label>
        <label className="text-sm font-bold text-ink">
          Email
          <input autoComplete="email" className={inputClass} maxLength={254} name="email" required type="email" />
        </label>
        <label className="text-sm font-bold text-ink">
          Organisation <span className="font-normal text-muted">(optional)</span>
          <input autoComplete="organization" className={inputClass} maxLength={160} name="organisation" />
        </label>
      </div>
      <label className="mt-5 block text-sm font-bold text-ink">
        Subject
        <input className={inputClass} maxLength={160} minLength={3} name="subject" required />
      </label>
      <label className="mt-5 block text-sm font-bold text-ink">
        Message
        <textarea className={`${inputClass} min-h-40 resize-y`} maxLength={5000} minLength={20} name="message" required />
      </label>
      <label aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        Website
        <input autoComplete="off" name="website" tabIndex={-1} />
      </label>
      <p className="mt-4 text-xs leading-5 text-muted">
        Do not include passwords, payment details, identity documents or private financial information.
      </p>
      <button
        className="mt-5 min-h-12 bg-signal px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-signalInk disabled:cursor-wait disabled:opacity-60"
        disabled={status === "sending"}
        type="submit"
      >
        {status === "sending" ? "Saving…" : "Send enquiry"}
      </button>
      {message ? (
        <p
          className={`mt-4 border-l-4 p-3 text-sm ${status === "success" ? "border-emerald-600 bg-emerald-500/10" : "border-red-600 bg-red-500/10"}`}
          role="status"
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
