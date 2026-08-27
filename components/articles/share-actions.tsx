"use client";

import { Check, Copy, MessageCircle, Share2 } from "lucide-react";
import { useState } from "react";

export function ShareActions({ title, url }: { title: string; url: string }) {
  const [status, setStatus] = useState("");
  const whatsappUrl = `https://wa.me/?${new URLSearchParams({ text: `${title} ${url}` })}`;
  const xUrl = `https://twitter.com/intent/tweet?${new URLSearchParams({
    text: title,
    url,
  })}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Link copied.");
    } catch {
      setStatus("Could not copy the link. Please copy it from the address bar.");
    }
  }

  return (
    <div className="mt-7 flex flex-wrap items-center justify-start gap-2" aria-label="Share this article">
      <button
        type="button"
        onClick={copyLink}
        className="inline-flex min-h-11 items-center gap-2 border border-line px-4 text-sm font-semibold hover:border-signal"
      >
        {status === "Link copied." ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}
        Copy link
      </button>
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center gap-2 border border-line px-4 text-sm font-semibold hover:border-signal"
      >
        <MessageCircle aria-hidden="true" size={16} />
        Share on WhatsApp
      </a>
      <a
        href={xUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center gap-2 border border-line px-4 text-sm font-semibold hover:border-signal"
      >
        <Share2 aria-hidden="true" size={16} />
        Share on X
      </a>
      <p role="status" aria-live="polite" className="basis-full text-left text-xs text-muted">
        {status}
      </p>
    </div>
  );
}
