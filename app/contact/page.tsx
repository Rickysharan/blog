import type { Metadata } from "next";

import { InfoPage } from "@/components/layout/info-page";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact the OmniLede editorial team about corrections, rights or privacy.",
};

function configuredEmail(): string | null {
  const value = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();
  return value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}

type ContactPageProps = {
  searchParams: Promise<{ subject?: string | string[] }>;
};

export default async function ContactPage({ searchParams }: ContactPageProps) {
  const query = await searchParams;
  const subject = Array.isArray(query.subject) ? query.subject[0] : query.subject;
  const commercial = subject === "advertising" || subject === "partnerships";
  const email = configuredEmail();
  return (
    <InfoPage
      eyebrow="Publication"
      intro={commercial
        ? "Talk to OmniLede about responsible advertising, sponsorships and editorially independent partnerships."
        : "Use the monitored editorial address for correction requests, source questions, rights concerns and privacy enquiries."}
      title="Contact"
      templateNotice={!email}
    >
      {commercial ? (
        <>
          <h2>Advertising and partnerships</h2>
          <p>
            Share your campaign goals, target desks and flight dates. Advertising must be clearly labelled, privacy-respecting and separate from editorial decisions.
          </p>
          {email ? (
            <p>
              Email <a href={`mailto:${email}?subject=${encodeURIComponent("OmniLede advertising enquiry")}`}>{email}</a> with your organisation name and preferred placement.
            </p>
          ) : (
            <p>
              A commercial inbox is not configured yet. Set <code>NEXT_PUBLIC_CONTACT_EMAIL</code> to a monitored address before inviting enquiries.
            </p>
          )}
        </>
      ) : null}
      <h2>Editorial and corrections</h2>
      {email ? (
        <p>
          Email <a href={`mailto:${email}`}>{email}</a>. Include the article URL, the passage at issue, and supporting evidence. Please do not send passwords, API keys, financial account details or other sensitive information.
        </p>
      ) : (
        <p>
          The operator has not configured a public inbox. Set <code>NEXT_PUBLIC_CONTACT_EMAIL</code> to a monitored address before launch; do not publish the site without a working correction and privacy contact.
        </p>
      )}
      <h2>Response expectations</h2>
      <p>
        Messages should be acknowledged according to an operator-defined service level. Urgent safety or legal requests require human assessment; automated submission does not guarantee removal, correction or a particular outcome.
      </p>
      <h2>Security reports</h2>
      <p>
        Describe the affected route and impact without accessing other people’s data or disrupting service. A dedicated security policy and reporting address should be added before public launch.
      </p>
    </InfoPage>
  );
}
