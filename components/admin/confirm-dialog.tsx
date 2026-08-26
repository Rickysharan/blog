"use client";

import { useEffect, useId, useRef } from "react";

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  danger = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
    >
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-6 shadow-2xl">
        <h2 className="text-xl font-black text-ink" id={titleId}>
          {title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted">{description}</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            className="rounded-xl border border-line px-4 py-2.5 font-semibold text-ink"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className={
              danger
                ? "rounded-xl bg-red-700 px-4 py-2.5 font-semibold text-white"
                : "rounded-xl bg-ink px-4 py-2.5 font-semibold text-canvas"
            }
            onClick={onConfirm}
            ref={confirmRef}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
