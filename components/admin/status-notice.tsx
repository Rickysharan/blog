"use client";

import { useEffect, useRef } from "react";

export function StatusNotice({
  kind,
  children,
}: {
  kind: "error" | "success";
  children: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, [children]);

  return (
    <div
      className={
        kind === "error"
          ? "rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-800 outline-none dark:text-red-200"
          : "rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-800 outline-none dark:text-green-200"
      }
      ref={ref}
      role={kind === "error" ? "alert" : "status"}
      tabIndex={-1}
    >
      {children}
    </div>
  );
}
