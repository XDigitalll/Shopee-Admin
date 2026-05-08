"use client";

import Image, { type ImageLoaderProps } from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { AttentionDot } from "@/components/admin/attention-dot";
import { AdminConfirmDialog, AdminFeedbackDock, AdminListLoadingOverlay, AdminStateCard, AdminTableSkeleton } from "@/components/admin/feedback-state";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useAdminLiveRefresh } from "@/hooks/use-admin-live-refresh";
import { adminApiFetch } from "@/lib/admin/api-client";
import { formatMoney } from "@/lib/admin/format";
import type {
  AdminPaymentListItem,
  AdminPaymentMethodFilter,
  AdminPaymentPeriodFilter,
  AdminPaymentReceiptResponse,
  AdminPaymentStatsResponse,
  AdminPaymentStatusFilter,
  AdminPaymentsPageResponse,
} from "@/lib/admin/types";

type PaymentsOverviewResponse = {
  stats: AdminPaymentStatsResponse;
  page: AdminPaymentsPageResponse;
};

const passthroughImageLoader = ({ src }: ImageLoaderProps) => src;

const STATUS_OPTIONS: Array<{
  value: AdminPaymentStatusFilter;
  label: string;
  tone: string;
}> = [
  { value: "ALL", label: "Todos", tone: "border-[var(--color-border)] text-[var(--color-text-primary)]" },
  { value: "PENDING", label: "Pendentes", tone: "border-[#F5C778] text-[#9A5B00]" },
  { value: "VALIDATED", label: "Validados", tone: "border-[#8DD9A8] text-[#166534]" },
  { value: "REJECTED", label: "Rejeitados", tone: "border-[#F3A4A4] text-[#B42318]" },
];

const METHOD_OPTIONS: Array<{
  value: AdminPaymentMethodFilter;
  label: string;
}> = [
  { value: "ALL", label: "Todos os métodos" },
  { value: "MPESA", label: "M-Pesa" },
  { value: "EMOLA", label: "e-Mola" },
  { value: "VISA", label: "Visa" },
  { value: "MASTERCARD", label: "Mastercard" },
];

const PERIOD_OPTIONS: Array<{
  value: AdminPaymentPeriodFilter;
  label: string;
}> = [
  { value: "ALL", label: "Todo o período" },
  { value: "TODAY", label: "Hoje" },
  { value: "7D", label: "Últimos 7 dias" },
  { value: "30D", label: "Últimos 30 dias" },
];

const METHOD_BADGE_STYLES: Record<string, string> = {
  MPESA: "bg-[rgba(99,153,34,0.12)] text-[#4D7C0F]",
  EMOLA: "bg-[rgba(55,138,221,0.12)] text-[#1D4ED8]",
  VISA: "bg-[rgba(99,102,241,0.12)] text-[#5B21B6]",
  MASTERCARD: "bg-[rgba(245,158,11,0.14)] text-[#B45309]",
};

const STATUS_BADGE_STYLES: Record<AdminPaymentListItem["status"], string> = {
  PENDING: "bg-[#FAEEDA] text-[#9A5B00]",
  VALIDATED: "bg-[#EAF3DE] text-[#166534]",
  REJECTED: "bg-[#FCEBEB] text-[#B42318]",
  CANCELLED: "bg-[#F3F4F6] text-[#4B5563]",
};

const STATUS_LABELS: Record<AdminPaymentListItem["status"], string> = {
  PENDING: "Pendente",
  VALIDATED: "Validado",
  REJECTED: "Rejeitado",
  CANCELLED: "Cancelado",
};

type FiltersState = {
  status: AdminPaymentStatusFilter;
  method: AdminPaymentMethodFilter;
  search: string;
  period: AdminPaymentPeriodFilter;
  page: number;
  size: number;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "Sem registo";
  }

  try {
    return new Intl.DateTimeFormat("pt-PT", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "CL";
}

function getMethodLabel(payment: AdminPaymentListItem) {
  if (payment.method === "CASH_ON_DELIVERY") {
    return "Cobrança na entrega";
  }

  if (!payment.receiptSubmitted) {
    return "Por definir";
  }

  if (payment.method === "MPESA") return "M-Pesa";
  if (payment.method === "EMOLA") return "e-Mola";
  return payment.method || "Sem método";
}

function downloadCsv(rows: AdminPaymentListItem[]) {
  const escape = (value: string | number | null | undefined) => {
    const text = String(value ?? "");
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, "\"\"")}"`;
    }
    return text;
  };

  const lines = [
    ["Pagamento", "Pedido", "Cliente", "Método", "Valor", "Data", "Estado"].join(","),
    ...rows.map((row) =>
      [
        row.id,
        row.orderNumber,
        row.customerName,
        row.method ?? "—",
        row.amount,
        row.submittedAt ?? "",
        STATUS_LABELS[row.status],
      ]
        .map(escape)
        .join(","),
    ),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "pagamentos.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function buildQuery(filters: FiltersState, deferredSearch: string) {
  const params = new URLSearchParams();

  if (filters.status !== "ALL") params.set("status", filters.status);
  if (filters.method !== "ALL") params.set("method", filters.method);
  if (filters.period !== "ALL") params.set("period", filters.period);
  if (deferredSearch.trim()) params.set("search", deferredSearch.trim());
  params.set("page", String(filters.page));
  params.set("size", String(filters.size));

  return params.toString();
}

export function PaymentsManagementView() {
  const { hasAccess } = useAdminAuth();
  const searchParams = useSearchParams();
  const requestedOrderId = searchParams.get("orderId");
  const [filters, setFilters] = useState<FiltersState>({
    status: "ALL",
    method: "ALL",
    search: requestedOrderId ?? "",
    period: "ALL",
    page: 0,
    size: 10,
  });
  const deferredSearch = useDeferredValue(filters.search);

  const [stats, setStats] = useState<AdminPaymentStatsResponse | null>(null);
  const [pageData, setPageData] = useState<AdminPaymentsPageResponse | null>(null);
  const [selectedPaymentId, setSelectedPaymentId] = useState<number | null>(null);
  const [receiptUrls, setReceiptUrls] = useState<Record<number, string | null>>({});
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isReceiptLoading, setIsReceiptLoading] = useState(false);
  const [busyPaymentId, setBusyPaymentId] = useState<number | null>(null);
  const [rejectingPaymentId, setRejectingPaymentId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [decisionModal, setDecisionModal] = useState<{
    type: "validate" | "reject";
    payment: AdminPaymentListItem;
  } | null>(null);
  const [shouldFocusAction, setShouldFocusAction] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [notifyMessage, setNotifyMessage] = useState("");
  const [notifyingPaymentId, setNotifyingPaymentId] = useState<number | null>(null);
  const [cancelOrderModal, setCancelOrderModal] = useState<{ orderId: number; orderNumber: string } | null>(null);
  const [isCancellingOrder, setIsCancellingOrder] = useState(false);
  const actionRegionRef = useRef<HTMLDivElement | null>(null);
  const hasLoadedPaymentsRef = useRef(false);

  const query = useMemo(() => buildQuery(filters, deferredSearch), [filters, deferredSearch]);

  const payments = useMemo(() => pageData?.content ?? [], [pageData]);
  const paymentMatchedByOrderId = useMemo(
    () => (requestedOrderId
      ? payments.find((item) => String(item.orderId) === requestedOrderId) ?? null
      : null),
    [payments, requestedOrderId],
  );
  const effectiveSelectedPaymentId = paymentMatchedByOrderId?.id ?? selectedPaymentId;
  const selectedPayment =
    payments.find((item) => item.id === effectiveSelectedPaymentId) ?? null;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!hasLoadedPaymentsRef.current) {
        setIsLoading(true);
      }
      setError("");

      try {
        const overview = await adminApiFetch<PaymentsOverviewResponse>(
          `/api/admin/payments/overview?${query}`,
        );

        if (cancelled) {
          return;
        }

        setStats(overview.stats);
        setPageData(overview.page);
        hasLoadedPaymentsRef.current = true;
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível carregar os pagamentos.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [query, refreshKey]);

  useAdminLiveRefresh(() => setRefreshKey((value) => value + 1), {
    enabled: hasAccess("payments"),
    intervalMs: 10_000,
    minIntervalMs: 4_000,
    runOnMount: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadReceipt(paymentId: number) {
      if (receiptUrls[paymentId] !== undefined) {
        return;
      }

      setIsReceiptLoading(true);
      try {
        const payload = await adminApiFetch<AdminPaymentReceiptResponse>(
          `/api/admin/payments/${paymentId}/receipt`,
        );
        if (!cancelled) {
          setReceiptUrls((current) => ({
            ...current,
            [paymentId]: payload.url ?? null,
          }));
        }
      } catch {
        if (!cancelled) {
          setReceiptUrls((current) => ({
            ...current,
            [paymentId]: null,
          }));
        }
      } finally {
        if (!cancelled) {
          setIsReceiptLoading(false);
        }
      }
    }

    if (selectedPayment?.receiptSubmitted) {
      void loadReceipt(selectedPayment.id);
    }

    return () => {
      cancelled = true;
    };
  }, [receiptUrls, selectedPayment]);

  function setFilter<K extends keyof FiltersState>(key: K, value: FiltersState[K]) {
    setFilters((current) => ({
      ...current,
      [key]: value,
      page: key === "page" ? Number(value) : 0,
    }));
  }

  async function refreshStats() {
    try {
      const payload = await adminApiFetch<AdminPaymentStatsResponse>("/api/admin/payments/stats");
      setStats(payload);
    } catch {
      // Keep the current snapshot if stats refresh fails.
    }
  }

  function patchPayment(updated: AdminPaymentListItem) {
    setPageData((current) => {
      if (!current) {
        return current;
      }

      const nextContent = current.content
        .map((item) => (item.id === updated.id ? updated : item))
        .filter((item) => {
          if (filters.status === "ALL") {
            return true;
          }
          return item.status === filters.status;
        });

      return {
        ...current,
        content: nextContent,
      };
    });
  }

  async function validatePayment(paymentId: number) {
    setBusyPaymentId(paymentId);
    setActionError("");
    setFeedback("");

    try {
      const updated = await adminApiFetch<AdminPaymentListItem>(
        `/api/admin/payments/${paymentId}/validate`,
        { method: "PUT" },
      );
      patchPayment(updated);
      setRejectingPaymentId(null);
      setRejectReason("");
      setDecisionModal(null);
      setFeedback(`Pagamento #${paymentId} validado com sucesso.`);
      await refreshStats();
    } catch (mutationError) {
      setActionError(
        mutationError instanceof Error
          ? mutationError.message
          : "Não foi possível validar o pagamento.",
      );
    } finally {
      setBusyPaymentId(null);
    }
  }

  async function rejectPayment(paymentId: number) {
    if (!rejectReason.trim()) {
      setActionError("Indica o motivo da rejeição antes de confirmar.");
      return;
    }

    setBusyPaymentId(paymentId);
    setActionError("");

    try {
      const updated = await adminApiFetch<AdminPaymentListItem>(
        `/api/admin/payments/${paymentId}/reject`,
        {
          method: "PUT",
          body: JSON.stringify({ reason: rejectReason.trim() }),
        },
      );
      patchPayment(updated);
      setRejectingPaymentId(null);
      setRejectReason("");
      setDecisionModal(null);
      setFeedback(`Pagamento #${paymentId} rejeitado com sucesso.`);
      await refreshStats();
    } catch (mutationError) {
      setActionError(
        mutationError instanceof Error
          ? mutationError.message
          : "Não foi possível rejeitar o pagamento.",
      );
    } finally {
      setBusyPaymentId(null);
    }
  }

  async function cancelOrder(orderId: number) {
    setIsCancellingOrder(true);
    setActionError("");
    setFeedback("");

    try {
      await adminApiFetch(
        `/api/admin/orders/${orderId}/cancel`,
        { method: "PUT" },
      );
      setCancelOrderModal(null);
      setFeedback("Pedido cancelado com sucesso.");
      setRefreshKey((value) => value + 1);
    } catch (cancelError) {
      setCancelOrderModal(null);
      setActionError(
        cancelError instanceof Error
          ? cancelError.message
          : "Não foi possível cancelar o pedido.",
      );
    } finally {
      setIsCancellingOrder(false);
    }
  }

  async function notifyClient(paymentId: number) {
    setNotifyingPaymentId(paymentId);
    setActionError("");
    setFeedback("");

    try {
      await adminApiFetch(
        `/api/admin/payments/${paymentId}/notify-client`,
        {
          method: "POST",
          body: notifyMessage.trim() ? JSON.stringify({ message: notifyMessage.trim() }) : undefined,
        },
      );
      setNotifyMessage("");
      setFeedback("Cliente notificado com sucesso.");
    } catch (notifyError) {
      setActionError(
        notifyError instanceof Error
          ? notifyError.message
          : "Não foi possível notificar o cliente.",
      );
    } finally {
      setNotifyingPaymentId(null);
    }
  }

  useEffect(() => {
    if (!selectedPayment || !shouldFocusAction) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const target = actionRegionRef.current?.querySelector<HTMLElement>("[data-auto-focus-action='true']");
      if (!target) {
        return;
      }

      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      setShouldFocusAction(false);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [selectedPayment, shouldFocusAction]);

  if (!hasAccess("payments")) {
    return null;
  }

  const selectedReceiptUrl =
    selectedPayment && selectedPayment.receiptSubmitted
      ? receiptUrls[selectedPayment.id] ?? null
      : null;

  return (
    <div className="space-y-6">
      <section className="admin-card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-danger)]">
              Gestão financeira
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="font-[family-name:var(--font-sora)] text-3xl font-semibold text-[var(--color-text-primary)]">
                Pagamentos
              </h1>
              <span className="inline-flex rounded-full bg-[#FAEEDA] px-3 py-1 text-sm font-semibold text-[#9A5B00]">
                {stats?.pendingValidationCount ?? 0} pendente(s) de validação
              </span>
            </div>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Controla pagamentos submetidos, revê comprovativos e valida o que entra em caixa.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border border-[rgba(22,163,74,0.18)] bg-[rgba(22,163,74,0.08)] px-4 py-3 text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#166534]">
                Total validado hoje
              </p>
              <p className="mt-1 font-[family-name:var(--font-sora)] text-xl font-semibold text-[#166534]">
                {formatMoney(stats?.validatedTodayAmount ?? 0)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => downloadCsv(payments)}
              className="admin-button-muted"
            >
              Exportar
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            key: "ALL" as const,
            label: "Todos",
            value: stats?.all ?? 0,
            accent: "border-[var(--color-border)] bg-white text-[var(--color-text-primary)]",
          },
          {
            key: "PENDING" as const,
            label: "Pendentes",
            value: stats?.pending ?? 0,
            accent: "border-[#F5C778] bg-[#FFF7E8] text-[#9A5B00]",
          },
          {
            key: "VALIDATED" as const,
            label: "Validados",
            value: stats?.validated ?? 0,
            accent: "border-[#8DD9A8] bg-[#F1FBF4] text-[#166534]",
          },
          {
            key: "REJECTED" as const,
            label: "Rejeitados",
            value: stats?.rejected ?? 0,
            accent: "border-[#F3A4A4] bg-[#FFF4F4] text-[#B42318]",
          },
        ].map((card) => {
          const active = filters.status === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => setFilter("status", card.key)}
              className={`admin-card cursor-pointer border p-5 text-left transition hover:-translate-y-0.5 ${card.accent} ${
                active ? "ring-2 ring-[rgba(232,67,26,0.16)]" : ""
              }`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-80">
                {card.label}
              </p>
              <p className="mt-3 font-[family-name:var(--font-sora)] text-3xl font-semibold">
                {card.value}
              </p>
            </button>
          );
        })}
      </section>

      <section className="admin-card p-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter("status", option.value)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                  filters.status === option.value
                    ? "border-[var(--color-danger)] bg-[rgba(232,67,26,0.1)] text-[var(--color-danger)]"
                    : option.tone
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
            <div className="flex flex-wrap gap-2">
              {METHOD_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilter("method", option.value)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    filters.method === option.value
                      ? "border-[var(--color-danger)] bg-[rgba(232,67,26,0.1)] text-[var(--color-danger)]"
                      : "border-[var(--color-border)] bg-white text-[var(--color-text-secondary)]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="grid flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
              <input
                type="search"
                value={filters.search}
                onChange={(event) => setFilter("search", event.target.value)}
                placeholder="Pesquisar por ID do pagamento, pedido ou cliente"
                className="admin-input w-full"
              />
              <select
                value={filters.period}
                onChange={(event) => setFilter("period", event.target.value as AdminPaymentPeriodFilter)}
                className="admin-input w-full"
              >
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="admin-card relative overflow-hidden" aria-busy={isLoading}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="border-b border-[var(--color-border)] text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
                <tr>
                  {["Pagamento", "Pedido", "Cliente", "Método", "Valor", "Data", "Estado / acções"].map((head) => (
                    <th key={head} className="px-5 py-4 font-medium">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading && payments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-8">
                      <div className="space-y-4">
                        <AdminStateCard
                          title="A carregar pagamentos"
                          message="Estamos a reunir comprovativos, estados de validacao e detalhes da cobranca."
                          tone="loading"
                          compact
                        />
                        <AdminTableSkeleton columns={5} rows={3} />
                      </div>
                    </td>
                  </tr>
                ) : null}

                {payments.map((payment) => {
                  const isSelected = selectedPayment?.id === payment.id;
                  const showRejectForm = rejectingPaymentId === payment.id;
                  const canReviewPayment =
                    payment.status === "PENDING" &&
                    (payment.receiptSubmitted || payment.method === "CASH_ON_DELIVERY");
                  return (
                    <tr
                      key={payment.id}
                      onClick={() => {
                        setSelectedPaymentId(payment.id);
                        setShouldFocusAction(true);
                        setActionError("");
                      }}
                      className={`cursor-pointer border-b border-[var(--color-border)] align-top transition last:border-b-0 hover:bg-[var(--color-background-tertiary)]/60 ${
                        isSelected ? "bg-[rgba(232,67,26,0.05)]" : ""
                      }`}
                    >
                      <td className="px-5 py-4 font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--color-text-primary)]">
                        <span className="inline-flex items-center gap-2">
                          {canReviewPayment ? <AttentionDot label="Pagamento pendente de validacao" /> : null}
                          #{payment.id}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          href={`/admin/orders/${payment.orderId}`}
                          onClick={(event) => event.stopPropagation()}
                          className="text-sm font-semibold text-[var(--color-danger)] hover:underline"
                        >
                          {payment.orderNumber}
                        </Link>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(232,67,26,0.12)] text-xs font-semibold text-[var(--color-danger)]">
                            {initials(payment.customerName)}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                              {payment.customerName}
                            </p>
                            <p className="text-xs text-[var(--color-text-secondary)]">
                              {payment.customerEmail || payment.customerPhone || "Sem contacto"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            METHOD_BADGE_STYLES[payment.receiptSubmitted ? payment.method ?? "" : ""] ??
                            "bg-[var(--color-background-tertiary)] text-[var(--color-text-secondary)]"
                          }`}
                        >
                          {getMethodLabel(payment)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold text-[var(--color-text-primary)]">
                        {formatMoney(payment.amount)}
                      </td>
                      <td className="px-5 py-4 text-sm text-[var(--color-text-secondary)]">
                        {formatDateTime(payment.submittedAt || payment.paymentDate)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="space-y-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                              STATUS_BADGE_STYLES[payment.status]
                            }`}
                          >
                            {canReviewPayment ? <AttentionDot label="Pagamento pendente de validacao" className="mr-2 h-2.5 w-2.5" /> : null}
                            {STATUS_LABELS[payment.status]}
                          </span>

                          {canReviewPayment ? (
                            <div className="space-y-2">
                              {showRejectForm ? (
                                <div
                                  className="space-y-2"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <input
                                    type="text"
                                    value={rejectReason}
                                    onChange={(event) => setRejectReason(event.target.value)}
                                    placeholder="Motivo da rejeição"
                                    className="admin-input w-full text-sm"
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => void rejectPayment(payment.id)}
                                      className="rounded-xl bg-[#B42318] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#991b1b]"
                                      disabled={busyPaymentId === payment.id}
                                    >
                                      {busyPaymentId === payment.id ? "A rejeitar..." : "Confirmar"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setRejectingPaymentId(null);
                                        setRejectReason("");
                                      }}
                                      className="rounded-xl border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)]"
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  className="flex flex-wrap gap-2"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    onClick={() => void validatePayment(payment.id)}
                                    className="rounded-xl bg-[#166534] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#14532d]"
                                    disabled={busyPaymentId === payment.id}
                                  >
                                    {busyPaymentId === payment.id ? "A validar..." : "Validar"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRejectingPaymentId(payment.id);
                                      setRejectReason(payment.adminNote ?? "");
                                    }}
                                    className="rounded-xl bg-[#B42318] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#991b1b]"
                                  >
                                    Rejeitar
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : payment.status === "PENDING" ? (
                            <p className="max-w-[220px] text-xs text-[var(--color-text-secondary)]">
                              {payment.method === "CASH_ON_DELIVERY"
                                ? "Pagamento configurado para cobrança na entrega."
                                : "Aguardando submissão do comprovativo pelo cliente."}
                            </p>
                          ) : payment.adminNote ? (
                            <p className="max-w-[220px] text-xs text-[var(--color-text-secondary)]">
                              {payment.adminNote}
                            </p>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {!isLoading && payments.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-12 text-center text-sm text-[var(--color-text-secondary)]"
                    >
                      Nenhum pagamento encontrado para os filtros escolhidos.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-4">
            <p className="text-sm text-[var(--color-text-secondary)]">
              Página {(pageData?.page ?? 0) + 1} de {Math.max(pageData?.totalPages ?? 1, 1)}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFilter("page", Math.max(filters.page - 1, 0))}
                disabled={isLoading || (pageData?.page ?? 0) <= 0}
                className="admin-button-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() =>
                  setFilter(
                    "page",
                    Math.min(filters.page + 1, Math.max((pageData?.totalPages ?? 1) - 1, 0)),
                  )
                }
                disabled={isLoading || (pageData?.page ?? 0) >= Math.max((pageData?.totalPages ?? 1) - 1, 0)}
                className="admin-button-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                Seguinte
              </button>
            </div>
          </div>
          <AdminListLoadingOverlay
            visible={isLoading && payments.length > 0}
            title="A carregar pagamentos"
            message="Estamos a buscar a pagina de pagamentos."
          />
        </section>

        <aside className="sticky top-[96px] h-fit space-y-4">
          <section className="admin-card p-5">
            {selectedPayment ? (
              <>
                <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] pb-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">
                      Detalhes
                    </p>
                    <h2 className="mt-2 font-[family-name:var(--font-sora)] text-xl font-semibold text-[var(--color-text-primary)]">
                      Pagamento #{selectedPayment.id}
                    </h2>
                  </div>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                      STATUS_BADGE_STYLES[selectedPayment.status]
                    }`}
                  >
                    {STATUS_LABELS[selectedPayment.status]}
                  </span>
                </div>

                <div className="space-y-5 pt-4 text-sm">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
                      Pedido associado
                    </p>
                    <Link
                      href={`/admin/orders/${selectedPayment.orderId}`}
                      className="mt-1 inline-flex text-sm font-semibold text-[var(--color-danger)] hover:underline"
                    >
                      {selectedPayment.orderNumber}
                    </Link>
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
                      Cliente
                    </p>
                    <p className="mt-1 font-semibold text-[var(--color-text-primary)]">
                      {selectedPayment.customerName}
                    </p>
                    <p className="mt-1 text-[var(--color-text-secondary)]">
                      {selectedPayment.customerEmail || "Sem email"}
                    </p>
                    <p className="text-[var(--color-text-secondary)]">
                      {selectedPayment.customerPhone || "Sem telefone"}
                    </p>
                  </div>

                  <div className="grid gap-3">
                    {[
                      ["Método", getMethodLabel(selectedPayment)],
                      ["Referência", selectedPayment.receiptSubmitted ? selectedPayment.transactionId || "Sem referência" : "Aguardando cliente"],
                      ["Valor", formatMoney(selectedPayment.amount)],
                      ["Data", formatDateTime(selectedPayment.submittedAt || selectedPayment.paymentDate)],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-tertiary)] px-4 py-3"
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
                          {label}
                        </p>
                        <p className="mt-1 font-medium text-[var(--color-text-primary)]">{value}</p>
                      </div>
                    ))}
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
                        Comprovativo
                      </p>
                      {selectedPayment.receiptSubmitted && selectedReceiptUrl ? (
                        <button
                          type="button"
                          onClick={() => setReceiptModalOpen(true)}
                          className="text-xs font-semibold text-[var(--color-danger)]"
                        >
                          Ver comprovativo em tamanho completo
                        </button>
                      ) : null}
                    </div>

                    <div className="mt-3 overflow-hidden rounded-[20px] border border-[var(--color-border)] bg-[var(--color-background-tertiary)]">
                      {!selectedPayment.receiptSubmitted ? (
                        <div className="flex h-[220px] items-center justify-center px-6 text-center text-sm text-[var(--color-text-secondary)]">
                          {selectedPayment.method === "CASH_ON_DELIVERY"
                            ? "Este pedido foi configurado para cobrança na entrega e não precisa de comprovativo prévio."
                            : "Este pedido já caiu no sector de pagamentos, mas ainda está à espera do comprovativo do cliente."}
                        </div>
                      ) : isReceiptLoading ? (
                        <div className="flex h-[220px] items-center justify-center text-sm text-[var(--color-text-secondary)]">
                          A carregar comprovativo...
                        </div>
                      ) : selectedReceiptUrl ? (
                        <div className="relative h-[220px] w-full">
                          <Image
                            loader={passthroughImageLoader}
                            unoptimized
                            src={selectedReceiptUrl}
                            alt={`Comprovativo do pagamento ${selectedPayment.id}`}
                            fill
                            sizes="320px"
                            className="object-cover"
                          />
                        </div>
                      ) : (
                        <div className="flex h-[220px] items-center justify-center px-6 text-center text-sm text-[var(--color-text-secondary)]">
                          Este pagamento ainda não tem um comprovativo disponível.
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedPayment.notes ? (
                    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-tertiary)] px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
                        Observações
                      </p>
                      <p className="mt-1 text-[var(--color-text-primary)]">{selectedPayment.notes}</p>
                    </div>
                  ) : null}

                  <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-tertiary)] p-4 space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
                      Notificar cliente
                    </p>
                    <textarea
                      value={notifyMessage}
                      onChange={(event) => setNotifyMessage(event.target.value)}
                      placeholder="Mensagem para o cliente (opcional — será enviada via Telegram e visível no portal)"
                      rows={3}
                      className="admin-input w-full resize-none text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => void notifyClient(selectedPayment.id)}
                      disabled={notifyingPaymentId === selectedPayment.id}
                      className="w-full rounded-2xl bg-[#1D4ED8] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1e40af] disabled:opacity-60"
                    >
                      {notifyingPaymentId === selectedPayment.id ? "A notificar..." : "Notificar cliente"}
                    </button>
                  </div>

                  <div ref={actionRegionRef}>
                  {selectedPayment.status === "PENDING" && selectedPayment.receiptSubmitted ? (
                    <div className="space-y-3">
                      <button
                        type="button"
                        data-auto-focus-action="true"
                        onClick={() => setDecisionModal({ type: "validate", payment: selectedPayment })}
                        className="w-full rounded-2xl bg-[#166534] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#14532d]"
                        disabled={busyPaymentId === selectedPayment.id}
                      >
                        {busyPaymentId === selectedPayment.id
                          ? "A validar pagamento..."
                          : selectedPayment.method === "CASH_ON_DELIVERY"
                            ? "Marcar como pago"
                            : "Validar pagamento"}
                      </button>

                      <div className="space-y-2 rounded-2xl border border-[rgba(180,35,24,0.18)] bg-[rgba(180,35,24,0.04)] p-4">
                        <input
                          type="text"
                          value={rejectingPaymentId === selectedPayment.id ? rejectReason : ""}
                          onFocus={() => {
                            setRejectingPaymentId(selectedPayment.id);
                            setRejectReason(selectedPayment.adminNote ?? "");
                          }}
                          onChange={(event) => {
                            setRejectingPaymentId(selectedPayment.id);
                            setRejectReason(event.target.value);
                          }}
                          placeholder="Motivo da rejeição"
                          className="admin-input w-full text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setRejectingPaymentId(selectedPayment.id);
                            setDecisionModal({ type: "reject", payment: selectedPayment });
                          }}
                          className="w-full rounded-2xl bg-[#B42318] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#991b1b]"
                          disabled={busyPaymentId === selectedPayment.id}
                        >
                          {busyPaymentId === selectedPayment.id ? "A rejeitar..." : "Rejeitar"}
                        </button>
                      </div>
                    </div>
                  ) : selectedPayment.status === "PENDING" ? (
                    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-tertiary)] px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                      {selectedPayment.method === "CASH_ON_DELIVERY"
                        ? "Este pedido está marcado para cobrança na entrega. Quando o valor entrar, podes marcar como pago aqui."
                        : "À espera da submissão do comprovativo pelo cliente para poderes validar ou rejeitar."}
                    </div>
                  ) : (
                    <Link
                      href={`/admin/orders/${selectedPayment.orderId}`}
                      data-auto-focus-action="true"
                      className="inline-flex w-full justify-center rounded-2xl bg-[#E8431A] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#cf3c17]"
                    >
                      Abrir pedido associado
                    </Link>
                  )}
                  </div>

                  {selectedPayment.status !== "VALIDATED" && selectedPayment.status !== "CANCELLED" ? (
                    <button
                      type="button"
                      onClick={() => setCancelOrderModal({ orderId: selectedPayment.orderId, orderNumber: selectedPayment.orderNumber })}
                      className="mt-2 w-full rounded-2xl border border-[rgba(180,35,24,0.25)] bg-transparent px-4 py-2.5 text-sm font-semibold text-[#B42318] transition hover:bg-[rgba(180,35,24,0.06)]"
                    >
                      Cancelar pedido
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="py-12 text-center text-sm text-[var(--color-text-secondary)]">
                Selecciona um pagamento para ver os detalhes.
              </div>
            )}
          </section>
        </aside>
      </div>

      {receiptModalOpen && selectedReceiptUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setReceiptModalOpen(false)}
        >
          <div
            className="max-h-[90vh] max-w-5xl overflow-hidden rounded-[28px] bg-white p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="relative h-[82vh] w-[min(90vw,1200px)]">
              <Image
                loader={passthroughImageLoader}
                unoptimized
                src={selectedReceiptUrl}
                alt="Comprovativo em tamanho completo"
                fill
                sizes="90vw"
                className="object-contain"
              />
            </div>
          </div>
        </div>
      ) : null}

      <AdminFeedbackDock
        feedback={
          actionError
            ? { tone: "error", message: actionError }
            : error
              ? { tone: "error", message: error }
              : feedback
                ? { tone: "success", message: feedback }
                : null
        }
        onClose={() => {
          setError("");
          setActionError("");
          setFeedback("");
        }}
      />
      <AdminConfirmDialog
        open={Boolean(decisionModal)}
        title={decisionModal?.type === "reject" ? "Rejeitar pagamento?" : "Validar pagamento?"}
        message={
          decisionModal?.type === "reject"
            ? `O pagamento #${decisionModal.payment.id} sera rejeitado e o cliente vera o motivo da devolucao.`
            : `O pagamento #${decisionModal?.payment.id ?? ""} sera marcado como validado e o pedido podera avancar.`
        }
        confirmLabel={decisionModal?.type === "reject" ? "Rejeitar pagamento" : "Validar pagamento"}
        danger={decisionModal?.type === "reject"}
        pending={busyPaymentId === decisionModal?.payment.id}
        onCancel={() => {
          setDecisionModal(null);
          if (!decisionModal || decisionModal.type !== "reject") {
            setRejectReason("");
          }
        }}
        onConfirm={() => {
          if (!decisionModal) return;
          if (decisionModal.type === "reject") {
            void rejectPayment(decisionModal.payment.id);
            return;
          }
          void validatePayment(decisionModal.payment.id);
        }}
      >
        {decisionModal?.type === "reject" ? (
          <input
            type="text"
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            placeholder="Motivo da rejeicao"
            className="admin-input w-full text-sm"
          />
        ) : null}
      </AdminConfirmDialog>

      <AdminConfirmDialog
        open={Boolean(cancelOrderModal)}
        title="Cancelar pedido?"
        message={`O pedido ${cancelOrderModal?.orderNumber ?? ""} sera cancelado permanentemente. Esta accao nao pode ser desfeita.`}
        confirmLabel="Cancelar pedido"
        danger
        pending={isCancellingOrder}
        onCancel={() => setCancelOrderModal(null)}
        onConfirm={() => {
          if (!cancelOrderModal) return;
          void cancelOrder(cancelOrderModal.orderId);
        }}
      />
    </div>
  );
}
