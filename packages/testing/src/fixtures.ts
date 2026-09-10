import type { Role, SubmissionInput } from "@omnilede/contracts";

export const FIXTURE_TIMESTAMP = "2026-08-27T00:00:00.000Z";

export const FIXTURE_IDS = {
  contributor: "00000000-0000-4000-8000-000000000001",
  reviewer: "00000000-0000-4000-8000-000000000002",
  submission: "00000000-0000-4000-8000-000000000003",
  revision: "00000000-0000-4000-8000-000000000004",
  image: "00000000-0000-4000-8000-000000000005"
} as const;

export type FixtureIdentity = {
  id: string;
  role: Role;
  createdAt: string;
};

const baseSubmission: SubmissionInput = {
  title: "Deterministic fixture submission",
  contentDocument: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "A repeatable test document." }]
      }
    ]
  },
  category: "finance",
  region: "global",
  language: "en",
  primarySourceName: "Fixture Source",
  primarySourceUrl: "https://example.test/source",
  privateImagePath: `${FIXTURE_IDS.contributor}/${FIXTURE_IDS.submission}/${FIXTURE_IDS.image}.webp`,
  guidelinesVersion: "2026-08-27",
  guidelinesAccepted: true
};

export function createSubmissionFixture(overrides: Partial<SubmissionInput> = {}): SubmissionInput {
  return { ...baseSubmission, ...overrides };
}

export function createIdentityFixture(
  overrides: Partial<FixtureIdentity> = {}
): FixtureIdentity {
  return {
    id: FIXTURE_IDS.contributor,
    role: "contributor",
    createdAt: FIXTURE_TIMESTAMP,
    ...overrides
  };
}
