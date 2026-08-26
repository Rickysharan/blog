import type { Metadata } from "next";

import { InfoPage } from "@/components/layout/info-page";

export const metadata: Metadata = {
  title: "Privacy",
  description: "The OmniLede privacy and cookie policy template.",
};

export default function PrivacyPage() {
  return (
    <InfoPage
      eyebrow="Policy · updated 26 August 2026"
      intro="This page explains the data flows built into OmniLede and the decisions the operator must complete before launch."
      templateNotice
      title="Privacy and cookies"
    >
      <h2>Who controls the data</h2>
      <p>
        The legal name, postal address, privacy contact and applicable supervisory authority for the site operator must be inserted here before launch. “OmniLede” is currently a publication name, not a statement about a registered legal entity.
      </p>
      <h2>Data collected by the site</h2>
      <p>
        Reading public articles does not require an account. The application stores a theme preference and a versioned optional-cookie choice in the browser. Editorial administrators receive an eight-hour, signed, HttpOnly session cookie after entering the configured password. Hosting and security providers may process IP addresses, request metadata and diagnostic logs to deliver and protect the service.
      </p>
      <h2>Optional analytics and advertising</h2>
      <p>
        GA4 and AdSense scripts are not inserted until the reader chooses “Accept optional cookies.” Declining keeps both blocked. The choice can be reopened from “Cookie settings” in the footer. If these services are enabled, the operator must identify the exact vendors, purposes, lawful basis, international transfers and vendor retention settings here.
      </p>
      <h2>Retention and sharing</h2>
      <p>
        Browser preferences remain until the reader clears them or changes the choice. Admin sessions expire after eight hours. The operator must set and document retention periods for hosting logs, contact messages, analytics and advertising data. Data should be shared only with configured infrastructure, analytics or advertising processors, or when lawfully required.
      </p>
      <h2>Your choices and rights</h2>
      <p>
        Readers can decline optional services without losing article access, change consent later, and clear local browser data. Applicable law may provide access, correction, deletion, restriction, objection, portability or complaint rights. The final policy must explain how verified requests are submitted and handled in each launch jurisdiction.
      </p>
    </InfoPage>
  );
}
