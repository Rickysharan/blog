import type { Metadata } from "next";

import { InfoPage } from "@/components/layout/info-page";

export const metadata: Metadata = {
  title: "Terms",
  description: "The OmniLede website terms template.",
};

export default function TermsPage() {
  return (
    <InfoPage
      eyebrow="Policy · updated 26 August 2026"
      intro="These draft terms describe intended website rules but require the operator’s legal identity, governing law and professional review before launch."
      templateNotice
      title="Terms of use"
    >
      <h2>Using the publication</h2>
      <p>
        Public content is provided for general information. You may link to articles and make limited uses permitted by law. Republishing substantial article text, removing attribution, bypassing access controls, disrupting the service or using automated traffic that harms availability is not permitted.
      </p>
      <h2>Accuracy and availability</h2>
      <p>
        News changes quickly. OmniLede aims to correct material errors but does not promise that every page is complete, continuously available or current after publication. Release dates, schedules, market figures and third-party statements can change without notice.
      </p>
      <h2>Intellectual property and external links</h2>
      <p>
        Original OmniLede text and design remain subject to the operator’s rights. Publisher names, marks and linked material belong to their respective owners. External links are provided for source transparency; OmniLede does not control their availability, security, cookies or later edits.
      </p>
      <h2>Liability, law and operator details</h2>
      <p>
        Mandatory consumer and statutory rights are not excluded. Any limitations of liability, governing law, dispute process, operator identity and business address must be drafted for the actual launch jurisdictions rather than copied from this template.
      </p>
    </InfoPage>
  );
}
