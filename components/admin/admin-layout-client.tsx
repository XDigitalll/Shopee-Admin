"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { AdminAuthProvider } from "@/components/admin/admin-auth-provider";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminLiveRefresh } from "@/hooks/use-admin-live-refresh";
import { adminApiFetch } from "@/lib/admin/api-client";
import type { TodayStatsResponse } from "@/lib/admin/types";

const emptyCounters = {
  orders: 0,
  quotes: 0,
  payments: 0,
  delivery: 0,
  orphanOrders: 0,
};

function InnerLayout({ children }: { children: React.ReactNode }) {
  const [counters, setCounters] = useState(emptyCounters);
  const [paymentNotice, setPaymentNotice] = useState<{ count: number; id: number } | null>(null);
  const previousPaymentsRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  function notifyManualPayment(count: number) {
    setPaymentNotice({ count, id: Date.now() });

    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => setPaymentNotice(null), 10_000);

    try {
      const audio = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=");
      void audio.play().catch(() => null);
    } catch {}

    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification("Novo pagamento manual", {
          body: `${count} comprovativo(s) aguardam validacao.`,
          tag: "manual-payment-submitted",
        });
      } catch {}
    }
  }

  async function loadCounters() {
    try {
      const payload = await adminApiFetch<TodayStatsResponse>("/api/admin/stats/today");
      const nextPayments = Number(payload.badges.payments ?? 0);
      const previousPayments = previousPaymentsRef.current;
      if (previousPayments !== null && nextPayments > previousPayments) {
        notifyManualPayment(nextPayments);
      }
      previousPaymentsRef.current = nextPayments;
      setCounters(payload.badges);
    } catch {
      setCounters(emptyCounters);
    }
  }

  useAdminLiveRefresh(loadCounters, { intervalMs: 15_000, minIntervalMs: 5_000 });

  return (
    <>
      <AdminShell counters={counters}>{children}</AdminShell>
      {paymentNotice ? (
        <div className="fixed right-5 top-5 z-[70] w-[min(360px,calc(100vw-2rem))] rounded-[24px] border border-[#86EFAC] bg-[#F0FDF4] p-4 text-[#14532D] shadow-[0_18px_48px_rgba(15,23,42,0.18)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-[family-name:var(--font-sora)] text-sm font-semibold">Novo pagamento manual</p>
              <p className="mt-1 text-sm leading-5">
                {paymentNotice.count} comprovativo(s) aguardam validação.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPaymentNotice(null)}
              className="rounded-full px-2 text-lg font-semibold leading-6 text-[#166534] hover:bg-[#DCFCE7]"
              aria-label="Fechar notificacao"
            >
              ×
            </button>
          </div>
          <Link
            href="/admin/payments?queue=SUBMITTED"
            onClick={() => setPaymentNotice(null)}
            className="mt-3 inline-flex rounded-2xl bg-[#166534] px-4 py-2 text-sm font-semibold text-white"
          >
            Abrir validação
          </Link>
        </div>
      ) : null}
    </>
  );
}

export function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthProvider>
      <InnerLayout>{children}</InnerLayout>
    </AdminAuthProvider>
  );
}
