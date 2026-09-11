"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";

import { CATEGORIES, categorySchema, editorDocumentSchema, REGIONS, regionSchema, type EditorDocument, type Category, type Region } from "@omnilede/contracts";
import type { SubmissionRecord } from "../../lib/submissions/types";
import { clearLocalDraft, restoreLocalDraft, saveLocalDraft } from "./local-draft";

const GUIDELINES_VERSION = "2026-08-27";

function editorText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const value = node as { text?: unknown; content?: unknown };
  const own = typeof value.text === "string" ? value.text : "";
  const children = Array.isArray(value.content) ? value.content.map(editorText).join(" ") : "";
  return `${own} ${children}`.trim();
}

function wordCount(document: EditorDocument): number {
  const text = editorText(document).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return text ? text.split(/\s+/u).length : 0;
}

export function ArticleEditor({ userId, submissionId, initialSubmission }: { userId: string; submissionId: string; initialSubmission?: SubmissionRecord }) {
  const initialDocument = initialSubmission?.contentDocument;
  const initial: EditorDocument = initialDocument ?? { type: "doc", content: [{ type: "paragraph", content: [] }] };
  const [title, setTitle] = useState(initialSubmission?.title ?? "");
  const [category, setCategory] = useState<Category>(initialSubmission?.category ?? "anime");
  const [region, setRegion] = useState<Region>(initialSubmission?.region ?? "global");
  const [language, setLanguage] = useState(initialSubmission?.language ?? "en");
  const [sourceName, setSourceName] = useState(initialSubmission?.primarySourceName ?? "");
  const [sourceUrl, setSourceUrl] = useState(initialSubmission?.primarySourceUrl ?? "https://");
  const [imagePath, setImagePath] = useState(initialSubmission?.privateImagePath ?? "");
  const [accepted, setAccepted] = useState(Boolean(initialSubmission?.guidelinesAccepted));
  const [version, setVersion] = useState(initialSubmission?.version ?? 0);
  const [exists, setExists] = useState(Boolean(initialSubmission));
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [dirty, setDirty] = useState(false);
  const [restoreNotice, setRestoreNotice] = useState("");
  const [document, setDocument] = useState<EditorDocument>(initial);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, codeBlock: false, horizontalRule: false, link: false }),
      LinkExtension.configure({ openOnClick: false, autolink: false, linkOnPaste: false, HTMLAttributes: { rel: "nofollow noopener noreferrer" } })
    ],
    content: initial,
    onUpdate: ({ editor: updatedEditor }) => {
      setDocument(updatedEditor.getJSON() as EditorDocument);
      setDirty(true);
    }
  });

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  useEffect(() => {
    const draft = restoreLocalDraft(userId, submissionId);
    if (!draft || !editor || initialSubmission) return;
    const restore = window.setTimeout(() => {
      if (draft.expectedVersion !== version) setRestoreNotice("A local version is available. Review it before replacing this blank draft.");
      setTitle(draft.payload.title);
      setCategory(draft.payload.category);
      setRegion(draft.payload.region);
      setLanguage(draft.payload.language);
      setSourceName(draft.payload.primarySourceName);
      setSourceUrl(draft.payload.primarySourceUrl);
      setImagePath(draft.payload.privateImagePath);
      setAccepted(draft.payload.guidelinesAccepted);
      setDocument(draft.payload.contentDocument);
      editor.commands.setContent(draft.payload.contentDocument);
    }, 0);
    return () => window.clearTimeout(restore);
  }, [editor, initialSubmission, submissionId, userId, version]);

  const words = wordCount(document);
  const characters = editorText(document).length;

  useEffect(() => {
    if (!dirty) return;
    const timeout = window.setTimeout(() => saveLocalDraft(userId, submissionId, {
      savedAt: new Date().toISOString(),
      expectedVersion: version,
      payload: { title, contentDocument: document, category, region, language, primarySourceName: sourceName, primarySourceUrl: sourceUrl, privateImagePath: imagePath, guidelinesVersion: GUIDELINES_VERSION, guidelinesAccepted: accepted }
    }), 600);
    return () => window.clearTimeout(timeout);
  }, [accepted, category, document, dirty, imagePath, language, region, sourceName, sourceUrl, submissionId, title, userId, version]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function uploadImage(file: File) {
    setUploading(true); setError("");
    try {
      const form = new FormData(); form.set("submissionId", submissionId); form.set("file", file);
      const response = await fetch("/api/submission-images", { method: "POST", credentials: "include", body: form });
      const body = (await response.json()) as { error?: string; path?: string };
      if (!response.ok || !body.path) setError(body.error ?? "Image upload failed");
      else { setImagePath(body.path); setDirty(true); setStatus("Private image uploaded and validated."); }
    } catch { setError("The network is unavailable. Please try again."); }
    finally { setUploading(false); }
  }

  async function save(submit: boolean) {
    if (!online) { setError("Reconnect before saving or submitting."); return; }
    if (!imagePath) { setError("Add a validated cover image before saving this submission."); return; }
    const parsed = editorDocumentSchema.safeParse(document);
    if (!parsed.success) { setError("Use the supported text tools and remove unsupported pasted content."); return; }
    if (!accepted) { setError("Accept the contributor guidelines before submitting."); return; }
    setPending(true); setError(""); setStatus("");
    const payload = { title, contentDocument: parsed.data, category, region, language, primarySourceName: sourceName, primarySourceUrl: sourceUrl, privateImagePath: imagePath, guidelinesVersion: GUIDELINES_VERSION, guidelinesAccepted: true };
    try {
      const response = await fetch(exists ? `/api/submissions/${submissionId}` : "/api/submissions", {
        method: exists ? "PATCH" : "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(exists ? { ...payload, expectedVersion: version, submit } : { id: submissionId, ...payload })
      });
      const body = (await response.json()) as { error?: string; submission?: SubmissionRecord };
      if (!response.ok || !body.submission) { setError(body.error ?? "Unable to save submission"); return; }
      setExists(true); setVersion(body.submission.version); setDirty(false); clearLocalDraft(userId, submissionId);
      setStatus(submit ? "Submitted for review. Editors will see your source and revision history." : "Draft saved privately.");
      if (!exists && submit) {
        const submitResponse = await fetch(`/api/submissions/${submissionId}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, expectedVersion: body.submission.version, submit: true }) });
        const submitted = (await submitResponse.json()) as { error?: string; submission?: SubmissionRecord };
        if (!submitResponse.ok || !submitted.submission) { setError(submitted.error ?? "Draft saved, but submission is still private"); return; }
        setVersion(submitted.submission.version); setStatus("Submitted for review. Editors will see your source and revision history.");
      }
    } catch { setError("The network is unavailable. Please try again."); }
    finally { setPending(false); }
  }

  return (
    <div className="editor-layout">
      <div className="page-heading"><p className="eyebrow">Contributor editor</p><h1>Make the signal clearer.</h1><p>Write in your own words, link the primary source, and explain why this matters globally.</p></div>
      {restoreNotice ? <p className="form-success" role="status">{restoreNotice}</p> : null}
      <div className="editor-fields">
        <label>Headline<input value={title} maxLength={180} onChange={(event) => { setTitle(event.target.value); setDirty(true); }} /></label>
        <label>Beat<select value={category} onChange={(event) => { const value = categorySchema.parse(event.target.value); setCategory(value); setDirty(true); }}>{CATEGORIES.map((value) => <option key={value} value={value}>{value.replace("-", " ")}</option>)}</select></label>
        <label>Region<select value={region} onChange={(event) => { const value = regionSchema.parse(event.target.value); setRegion(value); setDirty(true); }}>{REGIONS.map((value) => <option key={value} value={value}>{value.replace("-", " ")}</option>)}</select></label>
        <label>Language<input value={language} maxLength={16} onChange={(event) => { setLanguage(event.target.value); setDirty(true); }} /></label>
        <label>Primary source name<input value={sourceName} maxLength={120} onChange={(event) => { setSourceName(event.target.value); setDirty(true); }} /></label>
        <label>Primary source URL<input type="url" inputMode="url" placeholder="https://" value={sourceUrl} onChange={(event) => { setSourceUrl(event.target.value); setDirty(true); }} /></label>
      </div>
      <section className="editor-card" aria-labelledby="story-body-heading">
        <div className="editor-card__header"><h2 id="story-body-heading">Story body</h2><div className="editor-counts" aria-live="polite">{words} words · {characters} characters</div></div>
        <div className="editor-toolbar" role="toolbar" aria-label="Story formatting">
          <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} aria-label="Bold">Bold</button>
          <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()} aria-label="Italic">Italic</button>
          <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} aria-label="Heading level 2">H2</button>
          <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} aria-label="Heading level 3">H3</button>
          <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()} aria-label="Bullet list">Bullets</button>
          <button type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()} aria-label="Numbered list">Numbered</button>
          <button type="button" onClick={() => editor?.chain().focus().toggleBlockquote().run()} aria-label="Blockquote">Quote</button>
          <button type="button" onClick={() => { const href = window.prompt("HTTPS link"); if (href?.startsWith("https://")) editor?.chain().focus().setLink({ href }).run(); }} aria-label="Add HTTPS link">Link</button>
        </div>
        <EditorContent editor={editor} className="editor-content" />
      </section>
      <section className="editor-card editor-card--upload" aria-labelledby="cover-heading">
        <div><h2 id="cover-heading">Private cover image</h2><p>JPEG, PNG, or WebP · 320–8000px · max 8MB. The original stays private.</p></div>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file); }} disabled={uploading} />
        {imagePath ? <p className="form-success" role="status">Validated private image attached.</p> : null}
      </section>
      <label className="guidelines-check"><input type="checkbox" checked={accepted} onChange={(event) => { setAccepted(event.target.checked); setDirty(true); }} /> <span>I’ve read the <Link href="/guidelines" target="_blank">contributor guidelines</Link> and this article is my own work.</span></label>
      {!online ? <p className="form-error" role="alert">You are offline. Saving and submitting require a connection.</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {status ? <p className="form-success" role="status">{status}</p> : null}
      <div className="editor-actions"><button className="button button-secondary" type="button" disabled={pending || uploading} onClick={() => void save(false)}>{pending ? "Saving…" : "Save private draft"}</button><button className="button button-primary" type="button" disabled={pending || uploading || !online} onClick={() => void save(true)}>Submit for review ↗</button></div>
    </div>
  );
}
