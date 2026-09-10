import type { Metadata } from "next";

import { ContactForm, type ContactFormType } from "@/components/contact/contact-form";
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
  const initialType: ContactFormType = subject === "advertising"
    ? "advertising"
    : subject === "partnerships"
      ? "partnership"
      : subject === "support"
        ? "support"
        : "general";
  const commercial = initialType === "advertising" || initialType === "partnership";
  const email = configuredEmail();
  return (
    <InfoPage
      eyebrow="Publication"
      intro={commercial
        ? "Talk to OmniLede about responsible advertising, sponsorships and editorially independent partnerships."
        : "Use the monitored editorial address for correction requests, source questions, rights concerns and privacy enquiries."}
      title="Contact"
      templateNotice
    >
      {commercial ? (
        <>
          <h2>Advertising and partnerships</h2>
          <p>
            Share your campaign goals, target desks and flight dates. Advertising must be clearly labelled, privacy-respecting and separate from editorial decisions.
          </p>
        </>
      ) : null}
      <h2>Send an enquiry</h2>
      <p>
        The form separates editorial/support requests from advertising/partnership messages. It stores a validated enquiry before attempting an email notification, so a notification problem does not silently lose the message.
      </p>
      <ContactForm initialType={initialType} />
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
      <h2>Operator details</h2>
      <p>
        Operator: [FILL IN: LEGAL OPERATOR NAME] · Address: [FILL IN: REGISTERED ADDRESS] · Privacy: [FILL IN: PRIVACY EMAIL]. This contact process is an operational template and not a substitute for legal advice.
      </p>
      <h2>Security reports</h2>
      <p>
        Describe the affected route and impact without accessing other people’s data or disrupting service. A dedicated security policy and reporting address should be added before public launch.
      </p>
    </InfoPage>
  );
}
