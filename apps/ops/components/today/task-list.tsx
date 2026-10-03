"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

import type { StudioTask } from "@omnilede/contracts";
import {
  NATIVE_PLAN_EVENT,
  hasNativeWriter,
  postNativeAction,
  readNativePlanSnapshot,
  type NativePlanSnapshot,
} from "../../lib/native/bridge";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const subscribeToStaticNativeCapability = () => () => {};
const defaultNativeRequestId = () => globalThis.crypto?.randomUUID?.() ?? `plan-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function TaskList({ initialTasks, fetcher = fetch, nativeRequestId = defaultNativeRequestId }: { initialTasks: StudioTask[]; fetcher?: Fetcher; nativeRequestId?: () => string }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [nativePlan, setNativePlan] = useState<NativePlanSnapshot>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const open = tasks.filter(({ state }) => state === "open");
  const nativeAvailable = useSyncExternalStore(subscribeToStaticNativeCapability, hasNativeWriter, () => false);

  useEffect(() => {
    const listener = (event: Event) => {
      const snapshot = readNativePlanSnapshot(event);
      if (snapshot) setNativePlan(snapshot);
    };
    window.addEventListener(NATIVE_PLAN_EVENT, listener);
    return () => window.removeEventListener(NATIVE_PLAN_EVENT, listener);
  }, []);

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
        {nativeAvailable ? <button
          type="button"
          className="secondary-action"
          data-omnilede-native-action="refresh"
          onClick={() => postNativeAction({ action: "refresh", requestId: nativeRequestId() })}
        >Refresh from this Mac</button> : null}
        <p>Writing starts from the OmniLede Mac app. On phone, review and publish drafts from Content.</p>
      </div>
      {notice ? <p className="task-notice" role="status">{notice}</p> : null}
      {nativePlan ? <section className="native-plan" aria-labelledby="native-plan-heading">
        <h2 id="native-plan-heading">Mac daily plan</h2>
        <p>{nativePlan.completedCount} of {nativePlan.totalTasks} written · {nativePlan.draftCount} drafts · {nativePlan.publishedCount} published</p>
        <ul>{nativePlan.tasks.map((item) => <li aria-label={`Mac plan ${item.label}`} key={item.category}><strong>{item.label}</strong> · {item.status.replaceAll("-", " ")} · {item.reason}</li>)}</ul>
      </section> : null}
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
