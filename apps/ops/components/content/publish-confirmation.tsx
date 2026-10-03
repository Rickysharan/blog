"use client";
import { useEffect, useRef, useState } from "react";
import { CATEGORIES } from "@omnilede/editorial/categories";
export function PublishConfirmation({ title, category, version, onConfirm, onCancel }: { title: string; category: string; version: string; onConfirm: (title: string, category: string) => void; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [confirmedTitle, setTitle] = useState("");
  const [confirmedCategory, setCategory] = useState("");
  const [versionConfirmed, setVersionConfirmed] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (element.showModal) element.showModal();
    else element.setAttribute("open", "");
    return () => { element.close?.(); };
  }, []);
  return <dialog ref={dialog} className="content-confirmation" aria-labelledby="publish-title" onCancel={onCancel}>
    <h2 id="publish-title">Confirm publication</h2><p>Publish these exact reviewed bytes to the public site and remove this draft from the private queue.</p>
    <p>Loaded article: <strong>{title}</strong> · {category}</p><p>If you edited the title, enter the new frontmatter title below. The server checks it against these exact bytes.</p>
    <label>Confirm article title<input autoFocus value={confirmedTitle} onChange={event => setTitle(event.target.value)} /></label>
    <label>Confirm category<select value={confirmedCategory} onChange={event => setCategory(event.target.value)}><option value="">Choose category</option>{CATEGORIES.map(item => <option key={item.slug} value={item.slug}>{item.label}</option>)}</select></label>
    <label className="content-version"><input type="checkbox" checked={versionConfirmed} onChange={event => setVersionConfirmed(event.target.checked)} />I reviewed the editor contents loaded at version <code>{version}</code>.</label>
    <div className="content-actions"><button type="button" onClick={onCancel}>Cancel</button><button type="button" disabled={!confirmedTitle.trim() || confirmedCategory !== category || !versionConfirmed} onClick={() => onConfirm(confirmedTitle, confirmedCategory)}>Publish now</button></div>
  </dialog>;
}
