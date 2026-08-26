import type { Metadata } from "next";

import { InfoPage } from "@/components/layout/info-page";

export const metadata: Metadata = {
  title: "About",
  description: "How OmniLede selects, drafts, reviews and corrects its global news explainers.",
};

export default function AboutPage() {
  return (
    <InfoPage
      eyebrow="Publication"
      intro="OmniLede is a publication name for a global, source-linked newsroom covering anime, movies, politics, sports, finance and share markets."
      title="About OmniLede"
    >
      <h2>Our editorial process</h2>
      <p>
        Public RSS feeds help the editorial team discover possible stories. Discovery is not publication. A queued item can be used to prepare a private draft, but every draft remains outside the public article collection until an authorized reviewer edits it and deliberately selects Publish.
      </p>
      <p>
        Articles are written in original language and link to the outlet that supplied the underlying report. The visible “Why it matters” section separates analysis from the basic update. Reviewers are expected to remove unsupported claims, distinguish confirmed facts from interpretation, and avoid presenting regional availability as worldwide availability.
      </p>
      <h2>Automation and AI assistance</h2>
      <p>
        RSS software performs discovery and deduplication. Optional AI drafting can be enabled by the operator, but it is disabled by default and never has authority to publish. When enabled, its output is treated as an untrusted draft: it must pass structural validation and human review. OmniLede does not represent generated text as first-hand reporting.
      </p>
      <h2>Sources, corrections and independence</h2>
      <p>
        Each article identifies a source link so readers can inspect the underlying reporting. If a material error is found, the intended practice is to correct the article promptly and add a clear correction note where the change affects the story’s meaning. Commercial placements are labelled and do not grant advertisers editorial approval.
      </p>
    </InfoPage>
  );
}
