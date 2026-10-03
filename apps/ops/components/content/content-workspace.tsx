"use client";
import { useRef, useState } from "react";
import { CATEGORIES } from "@omnilede/editorial/categories";
import type { DraftDocument, DraftRef, DraftSummary, PublishResult } from "@omnilede/editorial/drafts/types";
import type { PublicationEvent } from "../../lib/publication/history";
import { DraftEditor } from "./draft-editor";
import { ArticlePreview } from "./article-preview";
import { PublishConfirmation } from "./publish-confirmation";
const keyOf = (ref: DraftRef) => `${ref.category}/${ref.filename}`;
const pathOf = (ref: DraftRef) => `/api/content/drafts/${encodeURIComponent(ref.category)}/${encodeURIComponent(ref.filename)}`;
type Entry = { draft: DraftDocument; text: string };
type Notice = { error: boolean; text: string };
export function ContentWorkspace({ initialDrafts, initialHistory = [], publicSiteUrl }: { initialDrafts: DraftSummary[]; initialHistory?: PublicationEvent[]; publicSiteUrl?: string }) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [history, setHistory] = useState(initialHistory);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [selectedKey, setSelectedKey] = useState("");
  const [category, setCategory] = useState("all");
  const [state, setState] = useState("all");
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [preview, setPreview] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmation, setConfirmation] = useState<Entry | null>(null);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [published, setPublished] = useState<{ result: PublishResult; slug: string } | null>(null);
  const selected = entries[selectedKey];
  function start() { if (busy.current) return false; busy.current = true; setPending(true); return true; }
  function finish() { busy.current = false; setPending(false); }
  async function load(draft: DraftSummary) {
    const key = keyOf(draft.ref);
    if (entries[key]) { setSelectedKey(key); return; }
    if (!start()) return;
    try {
      const response = await fetch(pathOf(draft.ref), { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error();
      const payload = await response.json() as { draft: DraftDocument };
      setEntries(current => ({ ...current, [key]: { draft: payload.draft, text: payload.draft.mdx } })); setSelectedKey(key); setNotice(null);
    } catch { setNotice({ error: true, text: "Unable to load this draft. Your existing edits are still here." }); }
    finally { finish(); }
  }
  async function refresh() {
    if (!start()) return;
    try {
      const response = await fetch("/api/content/drafts", { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error();
      const payload = await response.json() as { drafts: DraftSummary[]; history: PublicationEvent[] };
      // Refresh inventory only: never silently replace loaded editor text or its version.
      setDrafts(payload.drafts); setHistory(payload.history);
    } catch { setNotice({ error: true, text: "Unable to refresh the list. Your edits are still here." }); }
    finally { finish(); }
  }
  async function mutate(action: "save" | "publish" | "discard", reviewed = selected, confirmedTitle?: string, confirmedCategory?: string) {
    if (!reviewed || !start()) return;
    setConfirmation(null); setDiscardConfirm(false); setNotice(null);
    const { draft, text } = reviewed;
    try {
      const response = await fetch(pathOf(draft.ref), { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, expectedVersion: draft.version, ...(action === "discard" ? {} : { mdx: text }), ...(action === "publish" ? { confirmedTitle, confirmedCategory } : {}) }) });
      const payload = await response.json();
      if (!response.ok) {
        setNotice({ error: true, text: response.status === 409 ? "This draft changed after you loaded it. Your edits are still here. Open another tab to compare and reconcile before retrying." : payload.message || "The action failed. Your edits are still here." }); return;
      }
      if (action === "save") {
        if (!payload.draft) throw new Error();
        setEntries(current => ({ ...current, [keyOf(draft.ref)]: { draft: payload.draft, text } }));
        setDrafts(current => current.map(item => keyOf(item.ref) === keyOf(draft.ref) ? payload.draft : item));
        setNotice({ error: false, text: "Draft saved. It is still private." });
      } else {
        setDrafts(current => current.filter(item => keyOf(item.ref) !== keyOf(draft.ref)));
        setEntries(current => { const next = { ...current }; delete next[keyOf(draft.ref)]; return next; }); setSelectedKey("");
        if (action === "publish") setPublished({ result: payload.result, slug: draft.ref.filename.slice(0, -4) });
        setNotice({ error: false, text: action === "publish" ? "Article published. The public site will update after deployment." : "Draft discarded." });
      }
      if (payload.event) setHistory(current => [payload.event, ...current]);
      if (payload.historyWarning) setNotice({ error: true, text: payload.historyWarning });
    } catch { setNotice({ error: true, text: "The response could not be verified. Your edits are still here. Refresh the list or check publication history before retrying." }); }
    finally { finish(); }
  }
  function matches(itemCategory: string, date: string, text: string) {
    return (category === "all" || category === itemCategory) && (!fromDate || date.slice(0, 10) >= fromDate) && (!toDate || date.slice(0, 10) <= toDate) && text.toLowerCase().includes(query.toLowerCase());
  }
  const visibleDrafts = drafts.filter(draft => (state === "all" || state === "private") && matches(draft.category, draft.date, `${draft.title} ${draft.excerpt} ${keyOf(draft.ref)}`));
  const visibleHistory = history.filter(event => (state === "all" || ({ save: "private", publish: "published", discard: "discarded" }[event.action]) === state) && matches(event.category, event.created_at, event.content_ref));
  return <div className="content-workspace">
    <div className="content-filters">
      <label>Search content<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Title, excerpt or filename" /></label>
      <label>Category<select value={category} onChange={event => setCategory(event.target.value)}><option value="all">All categories</option>{CATEGORIES.map(item => <option key={item.slug} value={item.slug}>{item.label}</option>)}</select></label>
      <label>State<select value={state} onChange={event => setState(event.target.value)}><option value="all">All states</option><option value="private">Private</option><option value="published">Published</option><option value="discarded">Discarded</option></select></label>
      <label>From date<input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} /></label><label>To date<input type="date" value={toDate} onChange={event => setToDate(event.target.value)} /></label>
    </div>
    <div className="content-actions"><button disabled={pending || !!confirmation} onClick={refresh}>Refresh list</button><span>Refresh preserves loaded text and versions.</span></div>
    {notice && <p role={notice.error ? "alert" : "status"} className="content-notice">{notice.text}</p>}
    {pending && <p role="status">Working…</p>}
    {published && <p className="content-result">{publicSiteUrl && <a target="_blank" rel="noreferrer" href={`${publicSiteUrl.replace(/\/$/, "")}/article/${published.slug}`}>View public article</a>} {published.result.commitUrl && <a target="_blank" rel="noreferrer" href={published.result.commitUrl}>View publication commit</a>}</p>}
    <div className="content-columns"><aside className="content-queue"><h2>Private drafts <small>{visibleDrafts.length}</small></h2>{!visibleDrafts.length && <p>No drafts match these filters.</p>}{visibleDrafts.map(draft => <div key={keyOf(draft.ref)}><button disabled={pending || !!confirmation || discardConfirm} aria-pressed={selectedKey === keyOf(draft.ref)} onClick={() => load(draft)}>{draft.title}</button><p>{draft.category} · {draft.date}</p></div>)}</aside>
    <section className="content-detail">{selected ? <><h2>{selected.draft.title}</h2><p>Save keeps this draft private. Only Publish makes it public.</p><p className="content-loaded-version">Loaded version: <code>{selected.draft.version}</code></p><DraftEditor value={selected.text} disabled={pending || !!confirmation || discardConfirm} onChange={text => { setEntries(current => ({ ...current, [selectedKey]: { ...current[selectedKey]!, text } })); setPublished(null); }} /><div className="content-actions"><button disabled={pending || !!confirmation || discardConfirm} onClick={() => mutate("save")}>Save private draft</button><button disabled={pending || !!confirmation || discardConfirm} onClick={() => setPreview(value => !value)}>Preview</button><button disabled={pending || !!confirmation || discardConfirm} onClick={() => setConfirmation({ ...selected })}>Publish…</button><button disabled={pending || !!confirmation || discardConfirm} onClick={() => setDiscardConfirm(true)}>Discard…</button></div>{preview && <ArticlePreview mdx={selected.text} />}{discardConfirm && <section role="dialog" aria-label="Confirm discard"><p>Discard this private draft and its unsaved editor contents?</p><button onClick={() => setDiscardConfirm(false)}>Cancel discard</button><button onClick={() => mutate("discard")}>Discard draft</button></section>}</> : <p>Select a draft to review its exact source before publishing.</p>}</section></div>
    {confirmation && <PublishConfirmation title={confirmation.draft.title} category={confirmation.draft.category} version={confirmation.draft.version} onCancel={() => setConfirmation(null)} onConfirm={(title, category) => mutate("publish", confirmation, title, category)} />}
    <section className="content-history"><h2>Publication history</h2><p>Latest 100 actions. Metadata only; article contents stay in the content repository.</p>{visibleHistory.length ? <ol>{visibleHistory.map((event, index) => <li key={event.id ?? `${event.created_at}-${index}`}><strong>{event.action}</strong> <span>{event.content_ref}</span><p><time>{event.created_at}</time> · Actor: {event.actor_id}</p><p>Version <code>{event.prior_version}</code>{event.resulting_version && <> → <code>{event.resulting_version}</code></>}</p>{event.commit_url && <a target="_blank" rel="noreferrer" href={event.commit_url}>View commit</a>}</li>)}</ol> : <p>No recorded actions match these filters.</p>}</section>
  </div>;
}
