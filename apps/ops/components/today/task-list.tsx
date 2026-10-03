"use client";

import Link from "next/link";
import { useState } from "react";

import type { StudioTask } from "@omnilede/contracts";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function TaskList({ initialTasks, fetcher = fetch }: { initialTasks: StudioTask[]; fetcher?: Fetcher }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const open = tasks.filter(({ state }) => state === "open");

  async function request(url: string, init: RequestInit) {
    setBusy(url);
    setNotice(undefined);
    try {
      const response = await fetcher(url, { ...init, headers: { "content-type": "application/json", ...init.headers } });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.message === "string" ? payload.message : "The task action could not finish.");
      if (Array.isArray(payload.tasks)) setTasks(payload.tasks);
      if (payload.task) setTasks((current) => current.map((item) => item.id === payload.task.id ? payload.task : item));
      setNotice("Today list updated.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The task action could not finish.");
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <section className="task-workspace" aria-label="Today tasks">
      <div className="task-toolbar">
        <button className="secondary-action" disabled={Boolean(busy)} onClick={() => request("/api/tasks", { method: "POST", body: JSON.stringify({ action: "refresh" }) })}>Refresh tasks</button>
        <p>Writing starts from the OmniLede Mac app. On phone, review and publish drafts from Content.</p>
      </div>
      {notice ? <p className="task-notice" role="status">{notice}</p> : null}
      {open.length === 0 ? <div className="studio-empty-state"><p>No open tasks.</p><span>Refresh to check current editorial and site evidence.</span></div> : (
        <ul className="task-list">
          {open.map((task) => (
            <li className="task-card" key={task.id}>
              <div><span className="task-kind">{task.kind}</span><h2>{task.title}</h2><p>{task.detail}</p></div>
              <div className="task-actions">
                {task.kind === "review" || task.kind === "publication" ? <Link href="/content">Review content</Link> : null}
                <button disabled={Boolean(busy)} onClick={() => request(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ action: "complete" }) })} aria-label={`Complete ${task.title}`}>Complete</button>
                <button disabled={Boolean(busy)} onClick={() => request(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ action: "postpone", postponedUntil: new Date(Date.now() + 86_400_000).toISOString() }) })} aria-label={`Postpone ${task.title}`}>Postpone one day</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
