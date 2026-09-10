import type { Metadata } from "next";

import { InfoPage } from "@/components/layout/info-page";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How OmniLede handles reader, contributor and contact data.",
};

export default function PrivacyPage() {
  return (
    <InfoPage
      eyebrow="Policy · updated 3 September 2026"
      intro="This operational template explains the data flows built into OmniLede. It is not a substitute for legal advice in the operator’s or a reader’s jurisdiction."
      templateNotice
      title="Privacy and cookies"
    >
      <h2>Who controls the data</h2>
      <p>
        The data controller is [FILL IN: LEGAL OPERATOR NAME], at [FILL IN: REGISTERED ADDRESS]. Privacy enquiries should be sent to [FILL IN: PRIVACY EMAIL]. “OmniLede” is a publication name and does not itself identify a registered legal entity.
      </p>
      <h2>Data collected by the site</h2>
      <p>
        Reading public articles does not require an account. The application stores theme, explicit region/language and versioned optional-cookie choices in the browser. Suggested region detection is returned without city or raw IP data and is not persisted as a preference unless the reader chooses it. Hosting and security providers may process IP addresses, request metadata and diagnostic logs to deliver and protect the service.
      </p>
      <p>
        Contact forms collect the sender’s name, email address, optional organisation, enquiry type, subject and message. A keyed, pseudonymous network identifier is used for abuse prevention; the application does not store the raw address in the contact record. Contributor and administrator products additionally process account, editorial, audit and security information described in their interfaces.
      </p>
      <h2>Optional analytics and advertising</h2>
      <p>
        GA4 and AdSense scripts are not inserted until the reader chooses “Accept optional cookies.” Declining keeps both blocked. The choice can be reopened from “Cookie settings” in the footer. If these services are enabled, the operator must identify the exact vendors, purposes, lawful basis, international transfers and vendor retention settings here.
      </p>
      <h2>Retention and sharing</h2>
      <p>
        Browser preferences remain until the reader clears them or changes the choice. Admin sessions expire after eight hours. Contact enquiries are stored in Supabase before an optional Brevo notification is attempted. The operator must set final retention periods for hosting logs, contact messages, contributor records, analytics and advertising data. Data is shared only with configured infrastructure, email, analytics or advertising processors, or when lawfully required.
      </p>
      <h2>Your choices and rights</h2>
      <p>
        Readers can decline optional services without losing article access, change consent later, and clear local browser data. Applicable law may provide access, correction, deletion, restriction, objection, portability or complaint rights. Verified requests should use the privacy contact above. The operator must add the applicable supervisory authority, lawful bases, international-transfer safeguards and final retention schedule before launch.
      </p>
    </InfoPage>
  );
}
