import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RegionControl } from "@/components/region/region-control";

describe("RegionControl", () => {
  it("starts at Global, then presents detection as an unpersisted suggestion", async () => {
    const onSelectionChange = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ countryCode: "GB", region: "europe", source: "netlify" })),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<RegionControl onSelectionChange={onSelectionChange} />);

    expect(screen.getByText("Showing: Global")).toBeVisible();
    expect(await screen.findByText("Showing: Suggested — Europe")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("omnilede-region-preference")).toBeNull();
  });

  it("restores an explicit choice without requesting detection", async () => {
    localStorage.setItem(
      "omnilede-region-preference",
      JSON.stringify({ region: "asia", language: "en-IN" }),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<RegionControl onSelectionChange={vi.fn()} />);

    expect(await screen.findByText("Showing: Your choice — Asia · en-IN")).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stores only an explicit choice and supports a keyboard reset to Global", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ countryCode: null, region: "global", source: "fallback" })),
      ),
    );
    render(<RegionControl onSelectionChange={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText("Region"), "asia");
    await user.selectOptions(screen.getByLabelText("Language"), "en-IN");

    expect(screen.getByText("Showing: Your choice — Asia · en-IN")).toBeVisible();
    expect(JSON.parse(localStorage.getItem("omnilede-region-preference") ?? "null")).toEqual({
      region: "asia",
      language: "en-IN",
    });

    const reset = screen.getByRole("button", { name: "Reset to Global" });
    reset.focus();
    await user.keyboard("{Enter}");

    expect(await screen.findByText("Showing: Global")).toBeVisible();
    expect(localStorage.getItem("omnilede-region-preference")).toBeNull();
  });

  it("recovers from corrupt storage and a failed context request", async () => {
    localStorage.setItem("omnilede-region-preference", "broken");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(<RegionControl onSelectionChange={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Showing: Global")).toBeVisible());
    expect(localStorage.getItem("omnilede-region-preference")).toBeNull();
  });

  it("never lets a late detection response overwrite an explicit choice", async () => {
    const user = userEvent.setup();
    let resolveContext: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => {
        resolveContext = resolve;
      })),
    );
    render(<RegionControl onSelectionChange={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText("Region"), "asia");
    expect(screen.getByText("Showing: Your choice — Asia · en")).toBeVisible();

    resolveContext?.(
      new Response(JSON.stringify({ countryCode: "GB", region: "europe", source: "netlify" })),
    );

    await waitFor(() => {
      expect(screen.getByText("Showing: Your choice — Asia · en")).toBeVisible();
    });
    expect(screen.queryByText("Showing: Suggested — Europe")).not.toBeInTheDocument();
  });
});
