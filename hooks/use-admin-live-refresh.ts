"use client";

import { useEffect, useRef } from "react";

import { ADMIN_DATA_CHANGED_EVENT } from "@/lib/admin/realtime";

type LiveRefreshOptions = {
  enabled?: boolean;
  intervalMs?: number;
  minIntervalMs?: number;
  runOnMount?: boolean;
};

export function useAdminLiveRefresh(
  callback: () => Promise<void> | void,
  options: LiveRefreshOptions = {}
) {
  const {
    enabled = true,
    intervalMs = 10_000,
    minIntervalMs = Math.min(intervalMs, 4_000),
    runOnMount = true,
  } = options;
  const effectiveIntervalMs = Math.max(intervalMs, 45_000);
  const effectiveMinIntervalMs = Math.max(minIntervalMs, 20_000);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let disposed = false;
    let running = false;
    let lastRunAt = 0;
    let errorCount = 0;

    const run = async () => {
      const now = Date.now();
      const backoffMs = errorCount > 0 ? Math.min(120_000, effectiveMinIntervalMs * 2 ** errorCount) : effectiveMinIntervalMs;
      if (
        disposed
        || running
        || document.visibilityState !== "visible"
        || navigator.onLine === false
        || now - lastRunAt < backoffMs
      ) {
        return;
      }

      running = true;
      lastRunAt = now;
      try {
        await callbackRef.current();
        errorCount = 0;
      } catch {
        errorCount += 1;
      } finally {
        running = false;
      }
    };

    const tick = () => {
      if (document.visibilityState === "visible") {
        void run();
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void run();
      }
    };

    if (runOnMount) {
      void run();
    }

    const intervalId = window.setInterval(tick, effectiveIntervalMs);
    window.addEventListener("focus", tick);
    window.addEventListener(ADMIN_DATA_CHANGED_EVENT, tick);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", tick);
      window.removeEventListener(ADMIN_DATA_CHANGED_EVENT, tick);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [enabled, effectiveIntervalMs, effectiveMinIntervalMs, runOnMount]);
}
