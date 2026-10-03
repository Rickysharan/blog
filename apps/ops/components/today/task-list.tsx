"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { StudioTask } from "@omnilede/contracts";
import {
  NATIVE_PLAN_EVENT,
  NATIVE_STATUS_EVENT,
  hasNativeWriter,
  postNativeAction,
  readNativePlanSnapshot,
  readNativeStatus,
  type NativePlanSnapshot,
  type NativeWriterStatus,
} from "../../lib/native/bridge";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const subscribeToStaticNativeCapability = () => () => {};
const defaultNativeRequestId = () => globalThis.crypto?.randomUUID?.() ?? `plan-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function TaskList({ initialTasks, fetcher = fetch, nativeRequestId = defaultNativeRequestId }: { initialTasks: StudioTask[]; fetcher?: Fetcher; nativeRequestId?: () => string }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [nativePlan, setNativePlan] = useState<NativePlanSnapshot>();
  const [planWriterStatuses, setPlanWriterStatuses] = useState<Partial<Record<NativePlanSnapshot["tasks"][number]["category"], NativeWriterStatus>>>({});
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const open = tasks.filter(({ state }) => state === "open");
  const nativeAvailable = useSyncExternalStore(subscribeToStaticNativeCapability, hasNativeWriter, () => false);
  const pendingPlanRequest = useRef<string | null>(null);

  useEffect(() => {
    const listener = (event: Event) => {
      const snapshot = readNativePlanSnapshot(event);
      if (!snapshot || snapshot.requestId !== pendingPlanRequest.current) return;
      pendingPlanRequest.current = null;
      setPlanWriterStatuses({});
      setNativePlan(snapshot);
    };
    window.addEventListener(NATIVE_PLAN_EVENT, listener);
    return () => {
      pendingPlanRequest.current = null;
      window.removeEventListener(NATIVE_PLAN_EVENT, listener);
    };
  }, []);

  useEffect(() => {
    const listener = (event: Event) => {
      const status = readNativeStatus(event);
      if (!status) return;
      setPlanWriterStatuses((current) => current[status.category]?.requestId === status.requestId
        ? { ...current, [status.category]: status }
        : current);
    };
    window.addEventListener(NATIVE_STATUS_EVENT, listener);
    return () => window.removeEventListener(NATIVE_STATUS_EVENT, listener);
  }, []);

  function refreshNativePlan() {
    const requestId = nativeRequestId();
    pendingPlanRequest.current = requestId;
    if (!postNativeAction({ action: "refresh", requestId })) pendingPlanRequest.current = null;
  }

  function startPlanTask(category: NativePlanSnapshot["tasks"][number]["category"], planDate: string) {
    const requestId = nativeRequestId();
    if (postNativeAction({ action: "write", category, planDate, requestId })) {
      setPlanWriterStatuses((current) => ({
        ...current,
        [category]: { category, requestId, phase: "starting", progress: 0, etaSeconds: null, delivery: "pending", error: null },
      }));
    }
  }

  function cancelPlanTask(status: NativeWriterStatus) {
    postNativeAction({ action: "cancel", requestId: status.requestId });
  }

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
          onClick={refreshNativePlan}
        >Refresh from this Mac</button> : null}
        <p>Writing starts from the OmniLede Mac app. On phone, review and publish drafts from Content.</p>
      </div>
      {notice ? <p className="task-notice" role="status">{notice}</p> : null}
      {nativePlan ? <section className="native-plan" aria-labelledby="native-plan-heading">
        <h2 id="native-plan-heading">Mac daily plan</h2>
        <p>{nativePlan.completedCount} of {nativePlan.totalTasks} written · {nativePlan.draftCount} drafts · {nativePlan.publishedCount} published</p>
        <ul>{nativePlan.tasks.map((item) => {
          const writerStatus = planWriterStatuses[item.category];
          const active = writerStatus?.delivery === "pending" && !writerStatus.error;
          const actionable = item.status === "todo" || item.status === "writing" || item.status === "needs-attention";
          const actionLabel = item.status === "todo" && !writerStatus?.error ? "Start writing" : "Try again";
          return <li aria-label={`Mac plan ${item.label}`} key={item.category}>
            <strong>{item.label}</strong> · {item.status.replaceAll("-", " ")} · {item.reason}
            {writerStatus ? <>
              <span> · {writerStatus.phase.replaceAll("-", " ")}</span>
              {writerStatus.delivery === "delivered" ? <span role="status"> · Draft delivered. Refresh this plan to see its updated state.</span> : null}
              {writerStatus.error ? <span role="alert"> · {writerStatus.error}</span> : null}
            </> : null}
            {actionable ? <button
              type="button"
              data-omnilede-native-action="write"
              data-omnilede-category={item.category}
              data-omnilede-plan-date={nativePlan.date}
              disabled={Boolean(active)}
              aria-label={`${actionLabel} ${item.label}`}
              onClick={() => startPlanTask(item.category, nativePlan.date)}
            >{actionLabel}</button> : null}
            {active && writerStatus ? <button type="button" data-omnilede-native-action="cancel" onClick={() => cancelPlanTask(writerStatus)}>Cancel</button> : null}
          </li>;
        })}</ul>
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
