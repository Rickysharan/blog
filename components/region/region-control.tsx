"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { REGIONS, type Region } from "@omnilede/contracts";

import {
  clearExplicitPreference,
  formatRegionSelection,
  GLOBAL_SELECTION,
  LANGUAGE_OPTIONS,
  readExplicitPreference,
  REGION_LABELS,
  regionContextSchema,
  resolveRegionSelection,
  saveExplicitPreference,
  type RegionSelection,
} from "@/lib/region/preferences";

export function RegionControl({
  onSelectionChange,
}: {
  onSelectionChange(selection: RegionSelection): void;
}) {
  const [selection, setSelection] = useState<RegionSelection>(GLOBAL_SELECTION);
  const userSelected = useRef(false);

  const select = useCallback((next: RegionSelection) => {
    setSelection(next);
    onSelectionChange(next);
  }, [onSelectionChange]);

  useEffect(() => {
    let active = true;
    const explicit = readExplicitPreference(window.localStorage);
    if (explicit) {
      queueMicrotask(() => {
        if (active) select(resolveRegionSelection(explicit, null));
      });
      return () => {
        active = false;
      };
    }

    void fetch("/api/region-context", {
      cache: "no-store",
      headers: { accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("region_context_unavailable");
        return regionContextSchema.parse(await response.json());
      })
      .then((context) => {
        if (active && !userSelected.current) select(resolveRegionSelection(null, context));
      })
      .catch(() => {
        if (active && !userSelected.current) select(GLOBAL_SELECTION);
      });

    return () => {
      active = false;
    };
  }, [select]);

  const chooseRegion = (region: Region) => {
    userSelected.current = true;
    if (region === "global") {
      clearExplicitPreference(window.localStorage);
      select(GLOBAL_SELECTION);
      return;
    }
    const preference = {
      region,
      language: selection.mode === "choice" ? selection.language : "en",
    };
    saveExplicitPreference(window.localStorage, preference);
    select({ mode: "choice", ...preference });
  };

  const chooseLanguage = (language: string) => {
    if (selection.region === "global") return;
    userSelected.current = true;
    const preference = { region: selection.region, language };
    saveExplicitPreference(window.localStorage, preference);
    select({ mode: "choice", ...preference });
  };

  const reset = () => {
    userSelected.current = true;
    clearExplicitPreference(window.localStorage);
    select(GLOBAL_SELECTION);
  };

  return (
    <div className="border-y border-line bg-panel px-4 py-4 sm:flex sm:items-end sm:justify-between sm:gap-6">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Regional discovery</p>
        <p className="mt-1 text-sm font-semibold text-ink" aria-live="polite">
          {formatRegionSelection(selection)}
        </p>
        <p className="mt-1 max-w-xl text-xs leading-5 text-muted">
          Suggestions reorder this list only. Global stories remain available and no precise location is stored.
        </p>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3 sm:mt-0">
        <label className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
          Region
          <select
            className="mt-1 block min-w-36 border border-line bg-canvas px-3 py-2 text-sm font-semibold normal-case tracking-normal text-ink"
            onChange={(event) => chooseRegion(event.target.value as Region)}
            value={selection.region}
          >
            {REGIONS.map((region) => (
              <option key={region} value={region}>{REGION_LABELS[region]}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
          Language
          <select
            className="mt-1 block min-w-40 border border-line bg-canvas px-3 py-2 text-sm font-semibold normal-case tracking-normal text-ink disabled:opacity-50"
            disabled={selection.region === "global"}
            onChange={(event) => chooseLanguage(event.target.value)}
            value={selection.language ?? "en"}
          >
            {LANGUAGE_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <button
          className="border-b-2 border-signal px-1 py-2 text-xs font-black uppercase tracking-[0.12em] text-ink disabled:cursor-not-allowed disabled:opacity-40"
          disabled={selection.mode === "global"}
          onClick={reset}
          type="button"
        >
          Reset to Global
        </button>
      </div>
    </div>
  );
}
