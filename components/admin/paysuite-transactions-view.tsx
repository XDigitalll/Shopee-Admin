"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApiFetch } from "@/lib/admin/api-client";
import { formatMoney } from "@/lib/admin/format";
import type { AdminPaymentListItem, AdminPaymentsPageResponse } from "@/lib/admin/types";

type AdminAction = "resend" | "recreate" | "sync";

type SyncResult = {
  status?: string;
  providerStatus?: string;
};

// ─── Types ───────────────────────────────────────────────────────────────────

type StatusFilter = "ALL" | "PENDING" | "CONFIRMED" | "FAILED" | "MISMATCH" | "CANCELLED";
type PeriodFilter = "TODAY" | "7D" | "30D" | "ALL";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function paymentStatusBadge(item: AdminPaymentListItem) {
  const s: string = item.status ?? "";
  const ps = (item.providerStatus ?? "").toLowerCase();
  // Accept both "SUCCESS" (backend enum) and "VALIDATED" (legacy display label).
  if (s === "SUCCESS" || s === "VALIDATED" || ps.includes("success") || ps.includes("paid") || ps.includes("completed")) {
    return { label: "Confirmado", bg: "#DCFCE7", color: "#166534" };
  }
  if (s === "CANCELLED" || ps.includes("cancel")) {
    return { label: "Cancelada", bg: "#E5E7EB", color: "#374151" };
  }
  if (s === "FAILED" || s === "REJECTED" || ps.includes("fail") || ps.includes("cancel") || ps.includes("declin")) {
    return { label: "Falhado", bg: "#FEE2E2", color: "#991B1B" };
  }
  if (s === "AMOUNT_MISMATCH" || s === "LATE_PAYMENT" || ps.includes("mismatch") || ps.includes("amount")) {
    return { label: "Divergente", bg: "#EDE9FE", color: "#6D28D9" };
  }
  return { label: "Pendente", bg: "#FEF3C7", color: "#92400E" };
}

function methodLabel(method: string | null | undefined) {
  if (!method) return "—";
  const m = method.toUpperCase();
  if (m === "MPESA") return "M-Pesa";
  if (m === "EMOLA") return "e-Mola";
  if (m === "CARD") return "Cartão";
  return method;
}

function fmt(dt: string | null | undefined) {
  if (!dt) return "—";
  return new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" }).format(new Date(dt));
}

function matchesStatusFilter(item: AdminPaymentListItem, filter: StatusFilter): boolean {
  if (filter === "ALL") return true;
  const ps = (item.providerStatus ?? "").toLowerCase();
  const s: string = item.status ?? "";
  if (filter === "PENDING") return s === "PENDING" && !ps.includes("fail") && !ps.includes("success") && !ps.includes("cancel");
  if (filter === "CONFIRMED") return s === "SUCCESS" || s === "VALIDATED" || ps.includes("success") || ps.includes("paid");
  if (filter === "FAILED") return s === "FAILED" || s === "REJECTED" || ps.includes("fail") || ps.includes("declin");
  if (filter === "MISMATCH") return s === "AMOUNT_MISMATCH" || s === "LATE_PAYMENT" || ps.includes("mismatch") || ps.includes("amount");
  if (filter === "CANCELLED") return s === "CANCELLED" || ps.includes("cancel");
  return true;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AdminActionButton({
  label,
  busyLabel,
  busy,
  disabled,
  onClick,
}: {
  label: string;
  busyLabel: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-left text-sm font-semibold text-[var(--color-text-primary)] transition hover:bg-[var(--color-background-tertiary)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {busy ? busyLabel : label}
    </button>
  );
}

function DetailDrawer({
  item,
  onClose,
  onActionSuccess,
}: {
  item: AdminPaymentListItem;
  onClose: () => void;
  onActionSuccess: (message: string) => void;
}) {
  const badge = paymentStatusBadge(item);
  const [busyAction, setBusyAction] = useState<AdminAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<"recreate" | null>(null);
  const isCancelled = String(item.status ?? "") === "CANCELLED" || String(item.providerStatus ?? "").toLowerCase().includes("cancel");

  async function runAction(action: AdminAction) {
    setBusyAction(action);
    setActionError(null);
    try {
      if (action === "sync") {
        const result = await adminApiFetch<SyncResult>(`/api/admin/payments/${item.id}/sync`, { method: "POST" });
        const st = result?.status ?? "";
        if (st === "SUCCESS") {
          onActionSuccess("Pagamento confirmado e pedido atualizado.");
        } else if (st === "PENDING" || st === "") {
          // Gateway still pending — show a neutral message, not a success toast.
          setActionError("Pagamento ainda pendente na PaySuite. Nenhuma alteração foi feita.");
        } else if (st === "FAILED" || st === "AMOUNT_MISMATCH" || st === "LATE_PAYMENT") {
          setActionError("Pagamento rejeitado ou com divergência na PaySuite. Estado: " + st);
        } else {
          // Unknown status from gateway — never treat as success. Surface it for manual review.
          setActionError("Estado inesperado recebido do gateway: \"" + st + "\". Verifique manualmente antes de avançar o pedido.");
        }
        return;
      }

      await adminApiFetch(`/api/admin/payments/${item.id}/${action}`, { method: "POST" });
      const messages: Record<Exclude<AdminAction, "sync">, string> = {
        resend: "Link de pagamento reenviado.",
        recreate: "Pagamento recriado com sucesso.",
      };
      onActionSuccess(messages[action as Exclude<AdminAction, "sync">]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erro ao executar a ação.");
    } finally {
      setBusyAction(null);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
        aria-label="Fechar"
      />
      <aside className="relative ml-auto flex h-full w-full max-w-lg flex-col overflow-y-auto bg-[var(--color-background-secondary)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Transação PaySuite</h2>
          <button type="button" onClick={onClose} className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold text-[var(--color-text-primary)] transition hover:bg-[var(--color-background-tertiary)]">
            Fechar
          </button>
        </div>

        <div className="space-y-5 p-6">
          {/* Estado */}
          <div className="flex items-center gap-3">
            <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: badge.bg, color: badge.color }}>
              {badge.label}
            </span>
            {item.method ? (
              <span className="rounded-full border px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)]">
                {methodLabel(item.method)}
              </span>
            ) : null}
          </div>

          {/* Pedido / Cliente */}
          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Pedido</p>
            <div className="space-y-2 rounded-xl bg-[var(--color-background-tertiary)] p-4 text-sm">
              <Row label="Pedido" value={item.orderNumber || String(item.orderId)} />
              <Row label="Cliente" value={item.customerName || "—"} />
              {item.customerEmail ? <Row label="Email" value={item.customerEmail} /> : null}
              {item.customerPhone ? <Row label="Telefone" value={item.customerPhone} /> : null}
            </div>
          </section>

          {/* Valores */}
          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Valores</p>
            <div className="space-y-2 rounded-xl bg-[var(--color-background-tertiary)] p-4 text-sm">
              <Row label="Valor esperado" value={formatMoney(item.expectedAmount ?? item.amount)} />
              <Row label="Valor pago pelo cliente" value={formatMoney(item.amount)} />
              <Row label="Taxa PaySuite" value={formatProviderFee(item)} />
              <Row label="Valor líquido recebido" value={formatProviderNetAmount(item)} />
              <Row label="Percentagem da taxa" value={formatProviderFeePercentage(item)} />
              {item.expectedAmount && item.expectedAmount !== item.amount ? (
                <Row label="Diferença" value={formatMoney(Math.abs((item.expectedAmount ?? 0) - item.amount))} />
              ) : null}
            </div>
          </section>

          {/* PaySuite */}
          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">PaySuite</p>
            <div className="space-y-2 rounded-xl bg-[var(--color-background-tertiary)] p-4 text-sm">
              <Row label="Provider" value={item.provider || "PAYSUITE"} />
              <Row label="Referência" value={item.providerReference || "—"} />
              <Row
                label="Estado gateway"
                value={
                  String(item.status ?? "") === "SUCCESS" || item.status === "VALIDATED"
                    ? "Confirmado (completed)"
                    : (item.providerStatus || "—")
                }
              />
              <Row label="Estado local" value={item.status || "—"} />
              <Row label="Transação" value={item.transactionId || "—"} />
              <Row label="Tipo da transação" value={item.providerTransactionType || "—"} />
            </div>
          </section>

          {/* Checkout URL */}
          {item.checkoutUrl ? (
            <section>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Checkout URL</p>
              <div className="rounded-xl bg-[var(--color-background-tertiary)] p-4">
                <p className="break-all text-xs text-[var(--color-text-secondary)]">{item.checkoutUrl}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(item.checkoutUrl ?? "")}
                    className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-primary)] transition hover:bg-[var(--color-background-secondary)]"
                  >
                    Copiar URL
                  </button>
                  <a
                    href={item.checkoutUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-primary)] transition hover:bg-[var(--color-background-secondary)]"
                  >
                    Abrir checkout
                  </a>
                </div>
              </div>
            </section>
          ) : null}

          {/* Datas */}
          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Datas</p>
            <div className="space-y-2 rounded-xl bg-[var(--color-background-tertiary)] p-4 text-sm">
              <Row label="Iniciado em" value={fmt(item.submittedAt)} />
              <Row label="Confirmado em" value={fmt(item.paymentDate ?? item.reviewedAt)} />
            </div>
          </section>

          {/* Admin note */}
          {item.adminNote ? (
            <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED] px-4 py-3 text-sm text-[#9A3412]">
              <p className="mb-1 text-xs font-semibold uppercase">Nota interna</p>
              {item.adminNote}
            </div>
          ) : null}

          {isCancelled ? (
            <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-4 py-3 text-sm text-[#374151]">
              <p className="mb-1 text-xs font-semibold uppercase">Motivo</p>
              Cancelada por cancelamento do pedido.
            </div>
          ) : null}

          {/* Admin actions */}
          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Ações</p>
            <div className="space-y-2">
              <AdminActionButton
                label="Reenviar link de pagamento"
                busyLabel="A reenviar..."
                busy={busyAction === "resend"}
                disabled={busyAction !== null || isCancelled}
                onClick={() => void runAction("resend")}
              />
              {pendingConfirm === "recreate" ? (
                <div className="rounded-xl border border-[#FECACA] bg-[#FFF5F5] px-4 py-3 space-y-3">
                  <p className="text-sm font-black text-[#991B1B]">Confirmar recriação de pagamento</p>
                  <p className="text-xs leading-5 text-[#7F1D1D]">
                    Isto vai criar uma <strong>nova transação PaySuite</strong>. Se o cliente já pagou
                    a transação anterior, pode ser cobrado duas vezes. Usa esta ação apenas se a
                    transação anterior estiver definitivamente expirada ou cancelada.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => { setPendingConfirm(null); void runAction("recreate"); }}
                      className="rounded-lg bg-[#DC2626] px-4 py-2 text-xs font-black text-white disabled:opacity-40"
                    >
                      {busyAction === "recreate" ? "A recriar..." : "Sim, recriar pagamento"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingConfirm(null)}
                      className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-xs font-semibold text-[var(--color-text-primary)]"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <AdminActionButton
                  label="Recriar pagamento"
                  busyLabel="A recriar..."
                  busy={busyAction === "recreate"}
                  disabled={busyAction !== null || isCancelled}
                  onClick={() => setPendingConfirm("recreate")}
                />
              )}
              <AdminActionButton
                label="Sincronizar estado com PaySuite"
                busyLabel="A sincronizar..."
                busy={busyAction === "sync"}
                disabled={busyAction !== null || isCancelled}
                onClick={() => void runAction("sync")}
              />
            </div>
            {actionError ? (
              <p className="mt-2 rounded-xl border border-[#FECACA] bg-[#FFF5F5] px-4 py-3 text-sm text-[#991B1B]">
                {actionError}
              </p>
            ) : null}
          </section>

          {/* View order link */}
          <a
            href={`/admin/orders/${item.orderId}`}
            className="block w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-center text-sm font-semibold text-[var(--color-text-primary)] transition hover:bg-[var(--color-background-tertiary)]"
          >
            Ver detalhe do pedido →
          </a>
        </div>
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[var(--color-text-secondary)]">{label}</span>
      <strong className="text-right text-[var(--color-text-primary)]">{value}</strong>
    </div>
  );
}

function formatProviderFee(item: AdminPaymentListItem) {
  return item.providerFee == null ? "Não informado" : formatMoney(item.providerFee);
}

function formatProviderNetAmount(item: AdminPaymentListItem) {
  return item.providerNetAmount == null ? "Não informado" : formatMoney(item.providerNetAmount);
}

function formatProviderFeePercentage(item: AdminPaymentListItem) {
  return item.providerFeePercentage == null ? "Não informado" : `${item.providerFeePercentage.toFixed(2)}%`;
}

// ─── Main View ────────────────────────────────────────────────────────────────

const STATUS_TABS: Array<{ key: StatusFilter; label: string }> = [
  { key: "ALL", label: "Todos" },
  { key: "PENDING", label: "Pendentes" },
  { key: "CONFIRMED", label: "Confirmados" },
  { key: "FAILED", label: "Falhados" },
  { key: "MISMATCH", label: "Divergentes" },
  { key: "CANCELLED", label: "Canceladas" },
];

const PERIOD_OPTIONS: Array<{ key: PeriodFilter; label: string }> = [
  { key: "TODAY", label: "Hoje" },
  { key: "7D", label: "7 dias" },
  { key: "30D", label: "30 dias" },
  { key: "ALL", label: "Todos" },
];

export function PaySuiteTransactionsView() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [period, setPeriod] = useState<PeriodFilter>("30D");
  const [page, setPage] = useState(0);
  const [allPayments, setAllPayments] = useState<AdminPaymentListItem[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminPaymentListItem | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), size: "40" });
      if (period !== "ALL") params.set("period", period);
      // Map UI filter to backend status filter
      if (statusFilter === "PENDING") params.set("status", "PENDING");
      if (statusFilter === "CONFIRMED") params.set("status", "VALIDATED");
      if (statusFilter === "FAILED") params.set("status", "REJECTED");
      if (statusFilter === "CANCELLED") params.set("status", "CANCELLED");

      const data = await adminApiFetch<AdminPaymentsPageResponse>(`/api/admin/payments?${params.toString()}`);
      const items = data.content ?? [];
      // Apply client-side PaySuite filter and MISMATCH status
      const filtered = items
        .filter((p) => p.provider === "PAYSUITE" || p.providerReference)
        .filter((p) => matchesStatusFilter(p, statusFilter));

      setAllPayments(filtered);
      setTotalPages(data.totalPages ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar transações.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, period, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reset page when filter changes
  useEffect(() => {
    setPage(0);
  }, [statusFilter, period]);

  const confirmedToday = allPayments.filter(
    (p) => p.status === "VALIDATED" && p.paymentDate?.startsWith(new Date().toISOString().slice(0, 10))
  ).length;
  const revenueToday = allPayments
    .filter((p) => p.status === "VALIDATED" && p.paymentDate?.startsWith(new Date().toISOString().slice(0, 10)))
    .reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const feesToday = allPayments
    .filter((p) => p.status === "VALIDATED" && p.paymentDate?.startsWith(new Date().toISOString().slice(0, 10)))
    .reduce((sum, p) => sum + (p.providerFee ?? 0), 0);
  const pendingCount = allPayments.filter((p) => matchesStatusFilter(p, "PENDING")).length;
  const totalRevenue = allPayments.filter((p) => p.status === "VALIDATED").reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const totalProviderFees = allPayments.filter((p) => p.status === "VALIDATED").reduce((sum, p) => sum + (p.providerFee ?? 0), 0);
  const totalNetRevenue = allPayments.filter((p) => p.status === "VALIDATED").reduce((sum, p) => sum + (p.providerNetAmount ?? p.amount ?? 0), 0);
  const averageFeePercentage = totalRevenue > 0 ? (totalProviderFees / totalRevenue) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-sora)] text-2xl font-bold">Transações PaySuite</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Monitorização de pagamentos processados pelo gateway PaySuite.
          </p>
        </div>
        <div className="flex gap-2">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setPeriod(opt.key)}
              className="rounded-xl border px-3 py-1.5 text-xs font-semibold transition"
              style={{
                background: period === opt.key ? "var(--color-danger)" : undefined,
                color: period === opt.key ? "#fff" : "var(--color-text-primary)",
                borderColor: period === opt.key ? "var(--color-danger)" : "var(--color-border-strong)",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Dashboard cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <DashCard label="Pendentes" value={String(pendingCount)} color="#D97706" />
        <DashCard label="Confirmados hoje" value={String(confirmedToday)} color="#059669" />
        <DashCard label="Receita bruta hoje" value={formatMoney(revenueToday)} color="#1D4ED8" />
        <DashCard label="Taxas PaySuite hoje" value={formatMoney(feesToday)} color="#D97706" />
        <DashCard label="Receita líquida" value={formatMoney(totalNetRevenue)} color="#059669" />
        <DashCard label="Taxa média gateway" value={`${averageFeePercentage.toFixed(2)}%`} color={averageFeePercentage > 0 ? "#D97706" : "#6B7280"} />
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-background-tertiary)] p-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setStatusFilter(tab.key)}
            className="flex-shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition"
            style={{
              background: statusFilter === tab.key ? "var(--color-danger)" : undefined,
              color: statusFilter === tab.key ? "#fff" : "var(--color-text-primary)",
              boxShadow: statusFilter === tab.key ? "0 1px 3px rgba(0,0,0,0.18)" : undefined,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error ? (
        <div className="rounded-xl border border-[#FECACA] bg-[#FFF5F5] px-4 py-3 text-sm text-[#991B1B]">
          {error}
          <button type="button" onClick={() => void load()} className="ml-3 underline">Tentar novamente</button>
        </div>
      ) : null}

      {/* Table */}
      <div className="admin-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-[var(--color-text-secondary)]">A carregar transações...</p>
          </div>
        ) : allPayments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-base font-semibold">Sem transações</p>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Não existem transações PaySuite para o filtro seleccionado.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-[var(--color-background-secondary)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                  <th className="px-4 py-3">Pedido</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Método</th>
                  <th className="px-4 py-3 text-right">Valor pago</th>
                  <th className="px-4 py-3 text-right">Taxa PaySuite</th>
                  <th className="px-4 py-3 text-right">Valor líquido</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Referência</th>
                  <th className="px-4 py-3">Iniciado</th>
                  <th className="px-4 py-3">Confirmado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {allPayments.map((p) => {
                  const badge = paymentStatusBadge(p);
                  return (
                    <tr
                      key={p.id}
                      className="cursor-pointer hover:bg-[var(--color-background-secondary)] transition"
                      onClick={() => setSelected(p)}
                    >
                      <td className="px-4 py-3 font-semibold">{p.orderNumber || p.orderId}</td>
                      <td className="px-4 py-3">{p.customerName || "—"}</td>
                      <td className="px-4 py-3">{methodLabel(p.method)}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatMoney(p.amount)}</td>
                      <td className="px-4 py-3 text-right text-[var(--color-text-secondary)]">{formatProviderFee(p)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-[#166534]">{formatProviderNetAmount(p)}</td>
                      <td className="px-4 py-3">
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-semibold"
                          style={{ background: badge.bg, color: badge.color }}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-secondary)]">
                        {p.providerReference ? p.providerReference.slice(-12) : "—"}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-secondary)]">{fmt(p.submittedAt)}</td>
                      <td className="px-4 py-3 text-[var(--color-text-secondary)]">{fmt(p.paymentDate ?? p.reviewedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 ? (
          <div className="flex items-center justify-center gap-3 border-t px-4 py-3">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-primary)] transition hover:bg-[var(--color-background-tertiary)] disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="text-xs text-[var(--color-text-secondary)]">
              Página {page + 1} de {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-primary)] transition hover:bg-[var(--color-background-tertiary)] disabled:opacity-40"
            >
              Seguinte
            </button>
          </div>
        ) : null}
      </div>

      {/* Action feedback toast */}
      {actionFeedback ? (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-5 py-3 text-sm font-semibold text-[#166534] shadow-lg">
          {actionFeedback}
          <button type="button" onClick={() => setActionFeedback(null)} className="ml-3 underline">OK</button>
        </div>
      ) : null}

      {/* Detail drawer */}
      {selected ? (
        <DetailDrawer
          item={selected}
          onClose={() => setSelected(null)}
          onActionSuccess={(msg) => {
            setActionFeedback(msg);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function DashCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="admin-card p-4">
      <p className="text-xs font-semibold text-[var(--color-text-secondary)]">{label}</p>
      <p className="mt-2 font-[family-name:var(--font-sora)] text-xl font-bold" style={{ color }}>
        {value}
      </p>
    </div>
  );
}
