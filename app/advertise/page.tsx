import type { Metadata } from "next";
import Link from "next/link";

import { InfoPage } from "@/components/layout/info-page";

export const metadata: Metadata = {
  title: "Advertise and partner",
  description: "Truthful advertising and partnership information for OmniLede.",
};

const metrics = [
  ["Monthly users", "Not connected"],
  ["Monthly page views", "Not connected"],
  ["Audience geography", "Not connected"],
  ["Newsletter subscribers", "Not connected"],
] as const;

export default function AdvertisePage() {
  return (
    <InfoPage
      eyebrow="Commercial"
      intro="Reach readers across anime, movies, politics, sports, finance and share markets through clearly labelled placements that never buy editorial influence."
      templateNotice
      title="Advertise and partner with OmniLede"
    >
      <h2>Verified audience reporting only</h2>
      <p>
        Audience analytics are not connected yet, so no audience figures are estimated or invented. A media kit will use genuine GA4 data only after consent, configuration and sufficient measurement history.
      </p>
      <dl className="not-prose my-7 grid gap-px border border-line bg-line sm:grid-cols-2">
        {metrics.map(([label, value]) => (
          <div className="bg-canvas p-5" key={label}>
            <dt className="text-xs font-black uppercase tracking-[0.14em] text-muted">{label}</dt>
            <dd className="mt-2 font-serif text-2xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <h2>Available formats</h2>
      <p>
        Subject to final review, OmniLede can discuss display placements, clearly labelled sponsorships and useful partner projects. Inventory, pricing, traffic forecasts and performance guarantees are not offered until measurement and ad-serving controls are operational.
      </p>
      <h2>Editorial independence and safety</h2>
      <p>
        Commercial partners receive no right to select, preview, suppress or rewrite independent coverage. Ads must be identifiable, lawful, privacy-respecting and suitable for a general global audience. Political, financial, gambling, age-restricted and sensitive-category campaigns require additional review and may be declined.
      </p>
      <h2>Start a conversation</h2>
      <p>
        Include the organisation, intended markets, campaign objective, dates and creative format. Do not send payment details through the form.
      </p>
      <p className="not-prose mt-6">
        <Link
          className="inline-flex bg-signal px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-signalInk"
          href="/contact?subject=advertising"
        >
          Send an advertising enquiry
        </Link>
      </p>
    </InfoPage>
  );
}
