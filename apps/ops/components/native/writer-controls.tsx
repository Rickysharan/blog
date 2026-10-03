"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import type { CategoryDefinition, CategorySlug } from "@omnilede/editorial/categories";
import {
  NATIVE_STATUS_EVENT,
  hasNativeWriter,
  postNativeAction,
  readNativeStatus,
  type NativeWriterStatus,
} from "../../lib/native/bridge";

type RequestIdFactory = () => string;
const subscribeToStaticNativeCapability = () => () => {};

function defaultRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `writer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function NativeWriterControls({
  categories,
  refreshKey,
  requestId = defaultRequestId,
}: {
  categories: readonly CategoryDefinition[];
  refreshKey?: string;
  requestId?: RequestIdFactory;
}) {
  const available = useSyncExternalStore(subscribeToStaticNativeCapability, hasNativeWriter, () => false);
  const [statuses, setStatuses] = useState<Partial<Record<CategorySlug, NativeWriterStatus>>>({});

  useEffect(() => {
    const listener = (event: Event) => {
      const status = readNativeStatus(event);
      if (status) setStatuses((current) => ({ ...current, [status.category]: status }));
    };
    window.addEventListener(NATIVE_STATUS_EVENT, listener);
    return () => window.removeEventListener(NATIVE_STATUS_EVENT, listener);
  }, []);

  function start(category: CategorySlug) {
    const id = requestId();
    if (postNativeAction({ action: "write", category, requestId: id })) {
      setStatuses((current) => ({
        ...current,
        [category]: { category, requestId: id, phase: "starting", progress: 0, etaSeconds: null, delivery: "pending", error: null },
      }));
    }
  }

  function cancel(status: NativeWriterStatus) {
    postNativeAction({ action: "cancel", requestId: status.requestId });
  }

  if (!available) {
    return <p className="native-note">Start writing is available in the OmniLede Mac app. On phone or in a browser, review and publish delivered drafts from Content.</p>;
  }

  return (
    <section className="native-writer-controls" aria-label="Local writer">
      <h2>Write locally on this Mac</h2>
      <p>Choose one category. Nothing starts until you click its button.</p>
      <div className="native-writer-grid" data-refresh-key={refreshKey}>
        {categories.map(({ slug, label }) => {
          const status = statuses[slug];
          const active = status && !status.error && status.delivery === "pending";
          return (
            <div className="native-writer-card" role="group" aria-label={label} key={slug}>
              <strong>{label}</strong>
              {status ? <>
                <span>{status.phase.replaceAll("-", " ")}</span>
                <progress aria-label={`${label} writing progress`} aria-valuenow={status.progress} max={100} value={status.progress}>{status.progress}%</progress>
                {status.delivery === "pending" && status.etaSeconds !== null ? <small>About {status.etaSeconds} seconds remaining</small> : null}
                {status.delivery === "delivered" ? <span role="status">Draft delivered. Review and publish it from Content.</span> : null}
                {status.error ? <span role="alert">{status.error}</span> : null}
              </> : null}
              <div className="native-writer-actions">
                <button
                  type="button"
                  data-omnilede-native-action="write"
                  data-omnilede-category={slug}
                  disabled={Boolean(active)}
                  onClick={() => start(slug)}
                  aria-label={`${status?.error ? "Try again" : "Start writing"} ${label}`}
                >
                  {status?.error ? "Try again" : "Start writing"}
                </button>
                {active ? <button type="button" data-omnilede-native-action="cancel" className="secondary-action" onClick={() => cancel(status)}>Cancel</button> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
