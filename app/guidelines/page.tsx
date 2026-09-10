import type { Metadata } from "next";

import { InfoPage } from "@/components/layout/info-page";

export const metadata: Metadata = {
  title: "Contributor guidelines and points terms",
  description: "Editorial, licensing, points and redemption rules for OmniLede contributors.",
};

export default function GuidelinesPage() {
  return (
    <InfoPage
      eyebrow="Contributors · updated 3 September 2026"
      intro="These rules protect contributors, readers and the publication. They are an operational starting point, not a substitute for legal advice."
      templateNotice
      title="Contributor guidelines and points terms"
    >
      <h2>Original, supportable work</h2>
      <p>
        Submit work you wrote and have the right to license. Attribute primary reporting, distinguish fact from analysis, disclose relevant conflicts, and never invent quotations, sources, credentials or first-hand access. Drafts remain private until a human reviewer approves them.
      </p>
      <h2>Safety and editorial review</h2>
      <p>
        Do not submit unlawful, abusive, privacy-invasive, plagiarised or deceptively manipulated material. Review may include automated safety, originality and duplicate checks, but a human editor makes publication decisions. Corrections and appeals require supporting evidence.
      </p>
      <h2>Contributor licence and credit</h2>
      <p>
        The contributor retains ownership and author credit while granting [FILL IN: LEGAL OPERATOR NAME] a non-exclusive publishing, display, formatting, distribution, promotion, and archival licence for accepted work. The final operator-reviewed terms must define duration, territories, withdrawal, sublicensing and treatment after account closure.
      </p>
      <h2>Finance and Share Market submissions</h2>
      <p>
        Contributor views are not verified professional financial advice. Contributors must identify sources, avoid personalised recommendations and disclose any material holding or relationship that could affect the analysis.
      </p>
      <h2>Points and redemptions</h2>
      <p>
        Points are internal records, not cash, wages, deposits, securities or a guaranteed payment. Rules and display rates may change prospectively with notice. Redemptions are disabled at launch; no contributor should incur costs or rely on points as income. The future provider is [FILL IN: FINAL PAYOUT PROCESSOR], and no payout starts until identity, tax, fraud, age, jurisdiction and funding controls are approved.
      </p>
      <h2>Taxes, suspension and changes</h2>
      <p>
        Contributors remain responsible for applicable tax and reporting obligations. The operator may pause submissions, withhold disputed points, or suspend accounts for safety, fraud or repeated rule breaches, with a recorded reason and an appeal path. Operator details: [FILL IN: REGISTERED ADDRESS] · [FILL IN: TAX/GST DETAILS].
      </p>
    </InfoPage>
  );
}
