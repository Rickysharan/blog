import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import AdvertisePage from "@/app/advertise/page";
import ContactPage from "@/app/contact/page";
import DisclaimerPage from "@/app/disclaimer/page";
import GuidelinesPage from "@/app/guidelines/page";
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";

afterEach(cleanup);

describe("governance and partner pages", () => {
  it("keeps every required operator fact as an exact visible placeholder", () => {
    render(
      <>
        <PrivacyPage />
        <TermsPage />
        <GuidelinesPage />
      </>,
    );
    const copy = document.body.textContent ?? "";

    for (const marker of [
      "[FILL IN: LEGAL OPERATOR NAME]",
      "[FILL IN: REGISTERED ADDRESS]",
      "[FILL IN: TAX/GST DETAILS]",
      "[FILL IN: PRIVACY EMAIL]",
      "[FILL IN: FINAL PAYOUT PROCESSOR]",
    ]) {
      expect(copy).toContain(marker);
    }
    expect(copy).toMatch(/not a substitute for legal advice/i);
  });

  it("states the contributor licence, points limits, and finance warning", () => {
    render(<GuidelinesPage />);
    const copy = document.body.textContent ?? "";

    expect(copy).toMatch(/author credit/i);
    expect(copy).toMatch(/non-exclusive/i);
    expect(copy).toMatch(/publishing, display, formatting, distribution, promotion, and archival/i);
    expect(copy).toMatch(/redemptions are disabled/i);
    expect(copy).toMatch(/not verified professional financial advice/i);
  });

  it("labels advertiser metrics as not connected and protects editorial independence", () => {
    render(<AdvertisePage />);

    expect(screen.getAllByText("Not connected").length).toBeGreaterThan(0);
    expect(document.body.textContent).toMatch(/no audience figures are estimated or invented/i);
    expect(document.body.textContent).toMatch(/editorial independence/i);
    expect(screen.getByRole("link", { name: /send an advertising enquiry/i })).toHaveAttribute(
      "href",
      "/contact?subject=advertising",
    );
  });

  it("retains the editorial and financial disclaimers", () => {
    render(<DisclaimerPage />);
    expect(document.body.textContent).toMatch(/is not investment, trading, tax, accounting or legal advice/i);
    expect(document.body.textContent).toMatch(/source links.*do not imply sponsorship or endorsement/i);
  });

  it("offers a routed contact form for support and commercial enquiries", async () => {
    const page = await ContactPage({
      searchParams: Promise.resolve({ subject: "partnerships" }),
    });
    render(page);

    expect(screen.getByRole("form", { name: /contact omnilede/i })).toBeVisible();
    expect(screen.getByLabelText(/enquiry type/i)).toHaveValue("partnership");
  });
});
