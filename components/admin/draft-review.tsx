"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { getCategory } from "@/lib/config/categories";
import type { DraftDocument, DraftRef } from "@/lib/drafts/types";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { DraftEditor } from "@/components/admin/draft-editor";
import { StatusNotice } from "@/components/admin/status-notice";

type MutationAction = "save" | "publish" | "discard";
type Notice = { kind: "error" | "success"; text: string };

function refKey(ref: DraftRef): string {
  return `${ref.category}/${ref.filename}`;
}

function mutationPath(ref: DraftRef): string {
  return `/api/admin/drafts/${encodeURIComponent(ref.category)}/${encodeURIComponent(ref.filename)}`;
}

function editorValidation(source: string): string | null {
  if (!source.trimStart().startsWith("---")) {
    return "Draft frontmatter is required before the article body.";
  }
  if (!/^## Why it matters\s*$/m.test(source)) {
    return 'Add the required "## Why it matters" section before saving.';
  }
  const finalLine = source
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
  if (!finalLine?.match(/^Source: \[[^\]]+\]\(https:\/\/[^\s]+\)$/)) {
    return "The final visible line must be a secure Markdown source link.";
  }
  return null;
}

async function responsePayload(response: Response): Promise<Record<string, unknown>> {
  if (response.status === 204) {
    return {};
  }
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function DraftReview({ initialDrafts }: { initialDrafts: DraftDocument[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState(initialDrafts);
  const [selectedKey, setSelectedKey] = useState(
    initialDrafts[0] ? refKey(initialDrafts[0].ref) : "",
  );
  const selected = drafts.find((draft) => refKey(draft.ref) === selectedKey) ?? null;
  const [editorValues, setEditorValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialDrafts.map((draft) => [refKey(draft.ref), draft.mdx])),
  );
  const [pendingAction, setPendingAction] = useState<MutationAction | null>(null);
  const [confirmation, setConfirmation] = useState<"publish" | "discard" | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const groupedDrafts = useMemo(
    () =>
      Object.entries(
        drafts.reduce<Record<string, DraftDocument[]>>((groups, draft) => {
          (groups[draft.category] ??= []).push(draft);
          return groups;
        }, {}),
      ),
    [drafts],
  );

  function removeSelected(ref: DraftRef) {
    setDrafts((current) => {
      const remaining = current.filter((draft) => refKey(draft.ref) !== refKey(ref));
      setSelectedKey(remaining[0] ? refKey(remaining[0].ref) : "");
      return remaining;
    });
  }

  async function mutate(action: MutationAction) {
    if (!selected || pendingAction) {
      return;
    }
    const source = editorValues[refKey(selected.ref)] ?? selected.mdx;
    if (action !== "discard") {
      const validationError = editorValidation(source);
      if (validationError) {
        setNotice({ kind: "error", text: validationError });
        return;
      }
    }

    setPendingAction(action);
    setNotice(null);
    try {
      const response = await fetch(mutationPath(selected.ref), {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          ...(action === "discard" ? {} : { mdx: source }),
          expectedVersion: selected.version,
        }),
      });
      const payload = await responsePayload(response);
      if (!response.ok) {
        const error = typeof payload.error === "string" ? payload.error : "internal_error";
        const message =
          error === "conflict"
            ? "This draft changed after you loaded it. Keep your edits here, refresh in another tab, and reconcile before retrying."
            : typeof payload.message === "string"
              ? payload.message
              : "The draft action could not be completed. Your edits are still here.";
        setNotice({ kind: "error", text: message });
        return;
      }

      if (action === "save") {
        const updated = payload.draft as DraftDocument | undefined;
        if (!updated) {
          throw new Error("Save response did not include the draft");
        }
        setDrafts((current) =>
          current.map((draft) => (refKey(draft.ref) === refKey(updated.ref) ? updated : draft)),
        );
        setEditorValues((current) => ({ ...current, [refKey(updated.ref)]: updated.mdx }));
        setNotice({ kind: "success", text: "Draft saved. It is still private." });
      } else {
        removeSelected(selected.ref);
        setNotice({
          kind: "success",
          text:
            action === "publish"
              ? "Draft published and removed from the review queue."
              : "Draft discarded and removed from the review queue.",
        });
      }
    } catch {
      setNotice({
        kind: "error",
        text: "The review service is temporarily unavailable. Your edits are still here.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" });
    router.replace("/admin/login");
    router.refresh();
  }

  if (!selected) {
    return (
      <section className="rounded-2xl border border-line bg-panel p-8 text-center">
        <h2 className="text-2xl font-black text-ink">No drafts are waiting</h2>
        <p className="mt-3 text-sm text-muted">New generated drafts will appear here after the next content run.</p>
        {notice ? <div className="mt-6"><StatusNotice kind={notice.kind}>{notice.text}</StatusNotice></div> : null}
        <button className="mt-6 text-sm font-semibold text-muted underline" onClick={logout} type="button">
          Sign out
        </button>
      </section>
    );
  }

  const currentValue = editorValues[refKey(selected.ref)] ?? selected.mdx;

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="rounded-2xl border border-line bg-panel p-4">
        <div className="flex items-center justify-between gap-3 px-2">
          <h2 className="font-black text-ink">Pending drafts</h2>
          <span className="rounded-full bg-canvas px-2 py-1 text-xs font-bold text-muted">{drafts.length}</span>
        </div>
        <div className="mt-4 space-y-5">
          {groupedDrafts.map(([category, categoryDrafts]) => (
            <section key={category}>
              <h3 className="px-2 text-xs font-bold uppercase tracking-wider text-muted">
                {getCategory(categoryDrafts[0]!.category).label}
              </h3>
              <div className="mt-2 space-y-1">
                {categoryDrafts.map((draft) => {
                  const active = refKey(draft.ref) === selectedKey;
                  return (
                    <button
                      aria-current={active ? "page" : undefined}
                      className={`w-full rounded-xl px-3 py-3 text-left text-sm transition ${
                        active ? "bg-ink font-bold text-canvas" : "text-ink hover:bg-canvas"
                      }`}
                      key={refKey(draft.ref)}
                      onClick={() => {
                        setSelectedKey(refKey(draft.ref));
                        setNotice(null);
                      }}
                      type="button"
                    >
                      {draft.title}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <button className="mt-8 px-2 text-sm font-semibold text-muted underline" onClick={logout} type="button">
          Sign out
        </button>
      </aside>

      <section className="min-w-0 rounded-2xl border border-line bg-panel p-5 sm:p-7">
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">
            {getCategory(selected.category).label} · {selected.date}
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-ink">{selected.title}</h1>
        </div>
        {notice ? <div className="mb-5"><StatusNotice kind={notice.kind}>{notice.text}</StatusNotice></div> : null}
        <DraftEditor
          onChange={(value) =>
            setEditorValues((current) => ({ ...current, [refKey(selected.ref)]: value }))
          }
          value={currentValue}
        />
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            className="rounded-xl bg-ink px-5 py-3 font-bold text-canvas disabled:opacity-60"
            disabled={pendingAction === "save"}
            onClick={() => mutate("save")}
            type="button"
          >
            {pendingAction === "save" ? "Saving…" : "Save draft"}
          </button>
          <button
            className="rounded-xl border border-line px-5 py-3 font-bold text-ink disabled:opacity-60"
            disabled={pendingAction === "publish"}
            onClick={() => setConfirmation("publish")}
            type="button"
          >
            {pendingAction === "publish" ? "Publishing…" : "Publish"}
          </button>
          <button
            className="rounded-xl border border-red-500/40 px-5 py-3 font-bold text-red-700 disabled:opacity-60 dark:text-red-300"
            disabled={pendingAction === "discard"}
            onClick={() => setConfirmation("discard")}
            type="button"
          >
            {pendingAction === "discard" ? "Discarding…" : "Discard"}
          </button>
        </div>
      </section>

      {confirmation === "publish" ? (
        <ConfirmDialog
          confirmLabel="Publish now"
          description="Publishing moves this draft into the public articles collection. It can appear on the site after the deployment containing that commit completes."
          onCancel={() => setConfirmation(null)}
          onConfirm={() => {
            setConfirmation(null);
            void mutate("publish");
          }}
          title="Publish draft?"
        />
      ) : null}
      {confirmation === "discard" ? (
        <ConfirmDialog
          confirmLabel="Discard permanently"
          danger
          description="Discarding permanently removes this draft from the review queue. This action cannot be undone from the review desk."
          onCancel={() => setConfirmation(null)}
          onConfirm={() => {
            setConfirmation(null);
            void mutate("discard");
          }}
          title="Discard draft?"
        />
      ) : null}
    </div>
  );
}
