import type { Metadata } from "next";

import { InfoPage } from "@/components/layout/info-page";

export const metadata: Metadata = {
  title: "Disclaimer",
  description: "Editorial, financial and third-party source disclaimers for OmniLede.",
};

export default function DisclaimerPage() {
  return (
    <InfoPage
      eyebrow="Policy · updated 26 August 2026"
      intro="OmniLede explains public reporting. It is not a substitute for professional advice or direct confirmation from the responsible publisher, authority, league, studio or issuer."
      templateNotice
      title="Editorial disclaimer"
    >
      <h2>Markets, finance and business</h2>
      <p>
        Index figures may be delayed, incomplete or unavailable. Nothing on the site is investment, trading, tax, accounting or legal advice, a recommendation, or an offer to buy or sell a security. Verify prices and disclosures with regulated providers and consider qualified advice suited to your circumstances.
      </p>
      <h2>Politics and public affairs</h2>
      <p>
        Analysis describes possible significance and should not be read as political endorsement, polling advice or a prediction of legal outcomes. Official texts, election authorities and primary records remain the appropriate source for binding requirements and results.
      </p>
      <h2>Entertainment and sports</h2>
      <p>
        Release dates, regional catalogues, fixtures, eligibility decisions and broadcast schedules can change. Check the linked source and the relevant official platform, distributor, organizer or governing body before making travel or purchase decisions.
      </p>
      <h2>Third-party reporting</h2>
      <p>
        Source links identify the reporting used to prepare an article; they do not imply sponsorship or endorsement. OmniLede may summarize facts in original wording but cannot guarantee that a third-party page remains accessible or unchanged.
      </p>
    </InfoPage>
  );
}
