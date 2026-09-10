import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { StatusBadge } from "./status-badge";

const statusPresentation = {
  draft: { label: "Draft", foreground: "var(--omnilede-ink)", background: "var(--omnilede-paper)" },
  under_review: {
    label: "Under review",
    foreground: "var(--omnilede-paper)",
    background: "var(--omnilede-electric-blue)"
  },
  manual_review: {
    label: "Manual review",
    foreground: "var(--omnilede-paper)",
    background: "var(--omnilede-signal-red)"
  },
  changes_requested: {
    label: "Changes requested",
    foreground: "var(--omnilede-paper)",
    background: "var(--omnilede-signal-red)"
  },
  rejected: {
    label: "Rejected",
    foreground: "var(--omnilede-paper)",
    background: "var(--omnilede-signal-red)"
  },
  approved: {
    label: "Approved",
    foreground: "var(--omnilede-paper)",
    background: "var(--omnilede-electric-blue)"
  },
  publishing: {
    label: "Publishing",
    foreground: "var(--omnilede-paper)",
    background: "var(--omnilede-electric-blue)"
  },
  published: {
    label: "Published",
    foreground: "var(--omnilede-paper)",
    background: "var(--omnilede-ink)"
  },
  publishing_failed: {
    label: "Publishing failed",
    foreground: "var(--omnilede-paper)",
    background: "var(--omnilede-signal-red)"
  }
} as const;

describe("StatusBadge", () => {
  test.each(Object.entries(statusPresentation))(
    "renders the accessible semantic presentation for %s",
    (status, presentation) => {
      render(<StatusBadge status={status as keyof typeof statusPresentation} />);

      const badge = screen.getByRole("status", { name: presentation.label });
      expect(badge).toHaveTextContent(presentation.label);
      expect(badge).toHaveAttribute("data-status", status);
      expect(badge).toHaveStyle({
        backgroundColor: presentation.background,
        color: presentation.foreground
      });
    }
  );
});
