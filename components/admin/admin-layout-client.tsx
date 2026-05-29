"use client";

import { useState } from "react";

import { AdminAuthProvider } from "@/components/admin/admin-auth-provider";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminLiveRefresh } from "@/hooks/use-admin-live-refresh";
import { adminApiFetch } from "@/lib/admin/api-client";
import type { TodayStatsResponse } from "@/lib/admin/types";

const emptyCounters = {
  orders: 0,
  quotes: 0,
  delivery: 0,
};

function InnerLayout({ children }: { children: React.ReactNode }) {
  const [counters, setCounters] = useState(emptyCounters);

  async function loadCounters() {
    try {
      const payload = await adminApiFetch<TodayStatsResponse>("/api/admin/stats/today");
      setCounters(payload.badges);
    } catch {
      setCounters(emptyCounters);
    }
  }

  useAdminLiveRefresh(loadCounters, { intervalMs: 15_000, minIntervalMs: 5_000 });

  return <AdminShell counters={counters}>{children}</AdminShell>;
}

export function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthProvider>
      <InnerLayout>{children}</InnerLayout>
    </AdminAuthProvider>
  );
}
