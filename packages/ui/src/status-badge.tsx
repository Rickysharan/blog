import type { CSSProperties } from "react";

import type { SubmissionStatus } from "@omnilede/contracts";

const statusDetails: Record<
  SubmissionStatus,
  { label: string; foreground: string; background: string }
> = {
  draft: {
    label: "Draft",
    foreground: "var(--omnilede-ink)",
    background: "var(--omnilede-paper)"
  },
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
};

export type StatusBadgeProps = {
  status: SubmissionStatus;
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const { background, foreground, label } = statusDetails[status];
  const style: CSSProperties = {
    backgroundColor: background,
    color: foreground,
    display: "inline-flex",
    fontFamily: "var(--omnilede-font-sans)",
    fontSize: "0.875rem",
    fontWeight: 700,
    padding: "var(--omnilede-space-1) var(--omnilede-space-2)"
  };

  return (
    <span aria-label={label} data-status={status} role="status" style={style}>
      {label}
    </span>
  );
}
