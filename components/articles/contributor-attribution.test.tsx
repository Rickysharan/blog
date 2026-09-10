import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ContributorAttribution } from "@/components/articles/contributor-attribution";

describe("ContributorAttribution", () => {
  it("shows the contributor byline and licence disclosure", () => {
    render(
      <ContributorAttribution
        category="politics"
        contributorName="Ada Contributor"
        language="en-GB"
        region="europe"
      />,
    );

    expect(screen.getByText(/contributor article by ada contributor/i)).toBeVisible();
    expect(screen.getByText(/non-exclusive contributor licence/i)).toBeVisible();
    expect(screen.getByText(/europe · en-gb/i)).toBeVisible();
  });

  it.each(["finance", "share-market"] as const)(
    "shows the contributor-view financial disclaimer for %s",
    (category) => {
      render(
        <ContributorAttribution
          category={category}
          contributorName="Ada Contributor"
          language="en-IN"
          region="asia"
        />,
      );

      expect(screen.getByText(/not verified professional financial advice/i)).toBeVisible();
    },
  );
});
