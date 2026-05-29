"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useAdminLiveRefresh } from "@/hooks/use-admin-live-refresh";
import { AdminConfirmDialog, AdminSectionSkeleton } from "@/components/admin/feedback-state";
import { adminApiFetch } from "@/lib/admin/api-client";
import { formatMoney, humanizeOrderStatus, humanizePaymentMethod } from "@/lib/admin/format";
import type { ExternalOrderDetail, InternalOrderNote, OrderHistoryEntry } from "@/lib/admin/types";

const STANDARD_STATUS_STEPS = [
  "CREATED",
  "UNDER_REVIEW",
  "QUOTED",
  "PENDING_PAYMENT",
  "PAID",
  "ORDERED",
  "IN_TRANSIT",
  "ARRIVED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
] as const;

// External orders use TO_PURCHASE instead of PAID (post-payment approval step)
const EXTERNAL_STATUS_STEPS = [
  "CREATED",
  "UNDER_REVIEW",
  "QUOTED",
  "PENDING_PAYMENT",
  "TO_PURCHASE",
  "ORDERED",
  "IN_TRANSIT",
  "ARRIVED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
] as const;

const PICKUP_STATUS_STEPS = [
  "CREATED",
  "PENDING_PAYMENT",
  "PAYMENT_SUBMITTED",
  "PAYMENT_UNDER_REVIEW",
  "PAID",
  "READY_FOR_DELIVERY",
  "DELIVERED",
] as const;

const INTERNAL_DELIVERY_STATUS_STEPS = [
  "CREATED",
  "PENDING_PAYMENT",
  "PAID",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
] as const;

type TrackableStatus =
  | (typeof STANDARD_STATUS_STEPS)[number]
  | (typeof EXTERNAL_STATUS_STEPS)[number]
  | (typeof PICKUP_STATUS_STEPS)[number]
  | (typeof INTERNAL_DELIVERY_STATUS_STEPS)[number];
type DetailAction =
  | { label: string; href: string }
  | {
      label: string;
      action: "focus-tracking" | "validate-payment" | "collect-and-deliver" | "cancel-order" | "mark-status" | "mark-ready-for-delivery" | "handoff";
      targetStatus?: "ORDERED" | "IN_TRANSIT" | "ARRIVED" | "OUT_FOR_DELIVERY" | "DELIVERED";
      targetQueue?: "PAYMENTS" | "QUOTES" | "DELIVERY" | "EXECUTION" | "SUPPORT";
    };

type DetailActionCommand = Extract<DetailAction, { action: string }>;

const STATUS_THEME: Record<string, string> = {
  CREATED: "bg-[#F1EFE8] text-[#444441]",
  UNDER_REVIEW: "bg-[#FAEEDA] text-[#633806]",
  QUOTED: "bg-[#fef3c7] text-[#92400e]",
  APPROVED: "bg-[#d1fae5] text-[#065f46]",
  PENDING_PAYMENT: "bg-[#FAEEDA] text-[#633806]",
  PAID: "bg-[#EAF3DE] text-[#173404]",
  TO_PURCHASE: "bg-[#FFF2D6] text-[#8A5A00]",
  ORDERED: "bg-[#E1F5EE] text-[#085041]",
  IN_TRANSIT: "bg-[#DBEAFE] text-[#1E3A5F]",
  ARRIVED: "bg-[#E0F2FE] text-[#0C4A6E]",
  OUT_FOR_DELIVERY: "bg-[#FDE68A] text-[#854D0E]",
  DELIVERED: "bg-[#EAF3DE] text-[#27500A]",
  CANCELLED: "bg-[#FCEBEB] text-[#791F1F]",
  FAILED: "bg-[#FCEBEB] text-[#791F1F]",
};

function isPaymentValidated(status: string | null | undefined) {
  return String(status ?? "") === "SUCCESS";
}

function isClosedOrderStatus(status: string | null | undefined) {
  return ["CANCELLED", "FAILED", "DELIVERED"].includes(String(status ?? ""));
}

function canValidatePayment(detail: ExternalOrderDetail) {
  return !isClosedOrderStatus(detail.status) && String(detail.payment.status ?? "") === "PENDING";
}

function isPickupOrder(detail: ExternalOrderDetail) {
  return detail.type === "INTERNAL" && detail.deliveryMethod === "STORE_PICKUP";
}

function isInternalDeliveryOrder(detail: ExternalOrderDetail) {
  return detail.type === "INTERNAL" && detail.deliveryMethod !== "STORE_PICKUP";
}

function isCashOnPickup(detail: ExternalOrderDetail) {
  return isPickupOrder(detail) && detail.payment.method === "CASH_ON_DELIVERY";
}

function hasAllowedAction(detail: ExternalOrderDetail | null, action: string) {
  return Boolean(detail?.allowedActions?.includes(action));
}

function buildTotals(detail: ExternalOrderDetail) {
  const subtotal = detail.itemSubtotal;
  const freight = detail.additionalCosts.freight;
  const customs = detail.additionalCosts.customs;
  const localDelivery = detail.additionalCosts.localDelivery;
  const commission = detail.additionalCosts.commission;
  const discount = detail.additionalCosts.discount;
  const total = detail.totalAmount > 0 ? detail.totalAmount : subtotal + freight + customs + localDelivery + commission - discount;
  return { subtotal, freight, customs, localDelivery, commission, discount, total };
}

function formatOrderItemMoney(detail: ExternalOrderDetail, amount: number) {
  if (amount <= 0) return "—";
  if (detail.type === "INTERNAL") {
    return formatMoney(amount, "MZN");
  }
  if (detail.quoteExchangeRate) {
    return formatMoney(amount * detail.quoteExchangeRate, "MZN");
  }
  return `${amount.toFixed(2)} ${detail.quoteCurrency || "ZAR"}`;
}

function normalizeTrackingStatus(detail: ExternalOrderDetail | null): TrackableStatus | "" {
  const status = detail?.status ?? "";
  if (!detail) return "";

  if (isPickupOrder(detail) && ["IN_TRANSIT", "ARRIVED", "OUT_FOR_DELIVERY"].includes(status)) {
    return "READY_FOR_DELIVERY";
  }

  if (isInternalDeliveryOrder(detail)) {
    if (status === "ORDERED" || status === "ARRIVED") {
      return "PAID";
    }
  }

  // External orders: PAID (legacy pre-migration) maps to TO_PURCHASE step in external tracker
  if (detail.type === "EXTERNAL" && !isInternalDeliveryOrder(detail) && status === "PAID") {
    return "TO_PURCHASE";
  }

  return status as TrackableStatus | "";
}

function getTrackingSteps(detail: ExternalOrderDetail | null) {
  if (detail && isPickupOrder(detail)) {
    return PICKUP_STATUS_STEPS;
  }
  if (detail && isInternalDeliveryOrder(detail)) {
    return INTERNAL_DELIVERY_STATUS_STEPS;
  }
  if (detail && detail.type === "EXTERNAL") {
    return EXTERNAL_STATUS_STEPS;
  }
  return STANDARD_STATUS_STEPS;
}

function getCurrentStepIndex(
  steps: readonly TrackableStatus[],
  status: TrackableStatus | ""
) {
  if (!status) {
    return -1;
  }

  return steps.findIndex((step) => step === status);
}

function getTrackingStepLabel(step: string, detail: ExternalOrderDetail | null) {
  if (detail && isPickupOrder(detail)) {
    if (step === "PAID") return "Pagamento aprovado";
    if (step === "PAYMENT_SUBMITTED") return "Pagamento submetido";
    if (step === "PAYMENT_UNDER_REVIEW") return "Pagamento em análise";
    if (step === "READY_FOR_DELIVERY") return "Pronto para levantamento";
    if (step === "DELIVERED") return "Levantado";
  }
  if (detail && isInternalDeliveryOrder(detail)) {
    if (step === "PAID") return "Pago";
    if (step === "OUT_FOR_DELIVERY") return "A caminho";
  }
  if (step === "TO_PURCHASE") return "Comprar no fornecedor";

  return humanizeOrderStatus(step);
}

function buildPrimaryAction(detail: ExternalOrderDetail, isSuperAdmin: boolean): DetailAction | null {
  const status = detail.status;
  const paymentValidated = isPaymentValidated(detail.payment.status);
  const cashOnDelivery = detail.payment.method === "CASH_ON_DELIVERY";
  const pickupOrder = isPickupOrder(detail);

  if (status === "UNDER_REVIEW" || (detail.type === "EXTERNAL" && status === "CREATED")) {
    return { label: "Analisar e cotar", href: `/admin/orders/${detail.id}/quote` };
  }
  if (status === "PENDING_PAYMENT") {
    return isSuperAdmin
      ? { label: "Ver em pagamentos", href: `/admin/payments?orderId=${detail.id}` }
      : { label: "Enviar para equipa de pagamentos", action: "handoff", targetQueue: "PAYMENTS" };
  }

  if (pickupOrder) {
    if (hasAllowedAction(detail, "MARK_READY_FOR_PICKUP")) {
      return { label: "Marcar pronto para levantamento", action: "mark-ready-for-delivery" };
    }

    if (hasAllowedAction(detail, "CONFIRM_PICKUP")) {
      if (cashOnDelivery && !paymentValidated) {
        return { label: "Confirmar cobrança e levantamento", action: "collect-and-deliver", targetStatus: "DELIVERED" };
      }

      return { label: "Confirmar levantamento", action: "mark-status", targetStatus: "DELIVERED" };
    }

    return null;
  }

  if (isInternalDeliveryOrder(detail)) {
    if (status === "PAID") {
      return isSuperAdmin
        ? { label: "Ver em entregas", href: "/admin/delivery" }
        : { label: "Enviar para equipa de delivery", action: "handoff", targetQueue: "DELIVERY" };
    }
    if (status === "ORDERED" || status === "ARRIVED") {
      return { label: "Iniciar entrega", action: "mark-status", targetStatus: "OUT_FOR_DELIVERY" };
    }
    if (status === "OUT_FOR_DELIVERY" && cashOnDelivery && !paymentValidated) {
      return { label: "Confirmar cobrança e entrega", action: "collect-and-deliver", targetStatus: "DELIVERED" };
    }
    if (status === "OUT_FOR_DELIVERY") {
      return { label: "Confirmar entrega", action: "mark-status", targetStatus: "DELIVERED" };
    }

    return null;
  }

  if (status === "TO_PURCHASE" || status === "PAID") {
    return { label: "Marcar como encomendado", action: "mark-status", targetStatus: "ORDERED" };
  }
  if (status === "ORDERED") {
    return { label: "Marcar em trânsito", action: "mark-status", targetStatus: "IN_TRANSIT" };
  }
  if (status === "IN_TRANSIT") {
    return { label: "Marcar como chegado a sede", action: "mark-status", targetStatus: "ARRIVED" };
  }
  if (status === "ARRIVED") {
    return isSuperAdmin
      ? { label: "Ver em entregas", href: "/admin/delivery" }
      : { label: "Enviar para equipa de delivery", action: "handoff", targetQueue: "DELIVERY" };
  }
  if (status === "OUT_FOR_DELIVERY" && cashOnDelivery && !paymentValidated) {
    return { label: "Confirmar cobrança e entrega", action: "collect-and-deliver", targetStatus: "DELIVERED" };
  }
  if (status === "OUT_FOR_DELIVERY") {
    return { label: "Confirmar entrega", action: "mark-status", targetStatus: "DELIVERED" };
  }
  return null;
}

function buildQuickActions(detail: ExternalOrderDetail, isSuperAdmin: boolean) {
  const status = detail.status;
  const paymentValidated = isPaymentValidated(detail.payment.status);
  const cashOnDelivery = detail.payment.method === "CASH_ON_DELIVERY";
  const pickupOrder = isPickupOrder(detail);
  const actions: DetailAction[] = [];

  if (detail.type === "EXTERNAL" && ["CREATED", "UNDER_REVIEW"].includes(status)) {
    actions.push({ label: "Analisar e cotar", href: `/admin/orders/${detail.id}/quote` });
  }
  if (status === "PENDING_PAYMENT") {
    actions.push(isSuperAdmin
      ? { label: "Ver em pagamentos", href: `/admin/payments?orderId=${detail.id}` }
      : { label: "Enviar para equipa de pagamentos", action: "handoff", targetQueue: "PAYMENTS" });
  }

  if (pickupOrder) {
    if (hasAllowedAction(detail, "MARK_READY_FOR_PICKUP")) {
      actions.push({ label: "Marcar pronto para levantamento", action: "mark-ready-for-delivery" });
    }
    if (hasAllowedAction(detail, "CONFIRM_PICKUP")) {
      if (cashOnDelivery && !paymentValidated) {
        actions.push({ label: "Confirmar cobrança e levantamento", action: "collect-and-deliver", targetStatus: "DELIVERED" });
      } else {
        actions.push({ label: "Confirmar levantamento", action: "mark-status", targetStatus: "DELIVERED" });
      }
    }
    if (cashOnDelivery && !paymentValidated) {
      actions.push({ label: "Confirmar cobrança no levantamento", action: "validate-payment" });
    }
  } else if (isInternalDeliveryOrder(detail)) {
    if (status === "PAID") {
      actions.push(isSuperAdmin
        ? { label: "Ver em entregas", href: "/admin/delivery" }
        : { label: "Enviar para equipa de delivery", action: "handoff", targetQueue: "DELIVERY" });
    }
    if (status === "ORDERED" || status === "ARRIVED") {
      actions.push({ label: "Iniciar entrega", action: "mark-status", targetStatus: "OUT_FOR_DELIVERY" });
    }
    if (status === "OUT_FOR_DELIVERY" && cashOnDelivery && !paymentValidated) {
      actions.push({ label: "Confirmar cobrança e entrega", action: "collect-and-deliver", targetStatus: "DELIVERED" });
    }
    if (status === "OUT_FOR_DELIVERY" && (!cashOnDelivery || paymentValidated)) {
      actions.push({ label: "Confirmar entrega", action: "mark-status", targetStatus: "DELIVERED" });
    }
    if (cashOnDelivery && !paymentValidated) {
      actions.push({ label: "Confirmar cobrança na entrega", action: "validate-payment" });
    }
  } else {
    if (status === "TO_PURCHASE" || status === "PAID") {
      actions.push({ label: "Marcar como encomendado", action: "mark-status", targetStatus: "ORDERED" });
      actions.push({ label: "Actualizar rastreio", action: "focus-tracking" });
    }
    if (status === "ORDERED") {
      actions.push({ label: "Marcar em trânsito", action: "mark-status", targetStatus: "IN_TRANSIT" });
      actions.push({ label: "Actualizar rastreio", action: "focus-tracking" });
    }
    if (status === "IN_TRANSIT") {
      actions.push({ label: "Marcar como chegado a sede", action: "mark-status", targetStatus: "ARRIVED" });
      actions.push({ label: "Actualizar rastreio", action: "focus-tracking" });
    }
    if (status === "ARRIVED") {
      actions.push(isSuperAdmin
        ? { label: "Ver em entregas", href: "/admin/delivery" }
        : { label: "Enviar para equipa de delivery", action: "handoff", targetQueue: "DELIVERY" });
    }
    if (status === "OUT_FOR_DELIVERY" && cashOnDelivery && !paymentValidated) {
      actions.push({ label: "Confirmar cobrança e entrega", action: "collect-and-deliver", targetStatus: "DELIVERED" });
    }
    if (status === "OUT_FOR_DELIVERY" && (!cashOnDelivery || paymentValidated)) {
      actions.push({ label: "Confirmar entrega", action: "mark-status", targetStatus: "DELIVERED" });
    }
    if (cashOnDelivery && !paymentValidated) {
      actions.push({ label: "Confirmar cobrança na entrega", action: "validate-payment" });
    }
  }

  if (!isClosedOrderStatus(status)) {
    actions.push({ label: "Cancelar pedido", action: "cancel-order" });
  }
  return actions;
}

export function OrderDetailView({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { effectiveRole } = useAdminAuth();
  const isSuperAdmin = effectiveRole === "SUPER_ADMIN";
  const trackingRef = useRef<HTMLDivElement | null>(null);
  const [detail, setDetail] = useState<ExternalOrderDetail | null>(null);
  const [history, setHistory] = useState<OrderHistoryEntry[]>([]);
  const [trackingCode, setTrackingCode] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [notes, setNotes] = useState<InternalOrderNote[]>([]);
  const [error, setError] = useState("");
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const detailPayload = await adminApiFetch<ExternalOrderDetail>(`/api/admin/orders/${orderId}`);

        if (!cancelled) {
          setDetail(detailPayload);
          setHistory(detailPayload.history ?? []);
          setTrackingCode(detailPayload.trackingCode ?? "");
          setNotes(detailPayload.internalNotes ?? []);
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar o pedido.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const totals = useMemo(() => (detail ? buildTotals(detail) : null), [detail]);
  const primaryAction = detail ? buildPrimaryAction(detail, isSuperAdmin) : null;
  const quickActions = detail ? buildQuickActions(detail, isSuperAdmin) : [];
  const trackingSteps = useMemo(() => getTrackingSteps(detail), [detail]);
  const currentStatus = normalizeTrackingStatus(detail);
  const currentStepIndex = getCurrentStepIndex(trackingSteps, currentStatus);
  const timelineDesc = useMemo(
    () =>
      [...history].sort((a, b) => {
        const aTime = a.date ? new Date(a.date).getTime() : 0;
        const bTime = b.date ? new Date(b.date).getTime() : 0;
        return bTime - aTime;
      }),
    [history]
  );

  async function refreshData() {
    const detailPayload = await adminApiFetch<ExternalOrderDetail>(`/api/admin/orders/${orderId}`);

    setDetail(detailPayload);
    setHistory(detailPayload.history ?? []);
    setTrackingCode(detailPayload.trackingCode ?? "");
    setNotes(detailPayload.internalNotes ?? []);
  }

  useAdminLiveRefresh(refreshData, { intervalMs: 15_000, minIntervalMs: 5_000 });

  async function runAction(
    action: DetailActionCommand["action"],
    targetStatus?: DetailActionCommand["targetStatus"],
    targetQueue?: DetailActionCommand["targetQueue"]
  ) {
    if (!detail) return;

    if (action === "focus-tracking") {
      trackingRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setError("");
    try {
      if (action === "validate-payment") {
        router.push(`/admin/payments?orderId=${detail.id}`);
        return;
      }

      if (action === "handoff") {
        if (!targetQueue) {
          throw new Error("Fila destino em falta para handoff.");
        }
        await adminApiFetch(`/api/admin/orders/${detail.id}/handoff`, {
          method: "PATCH",
          body: JSON.stringify({
            targetQueue,
            note: "Encaminhado pelos detalhes do pedido",
          }),
        });
        await refreshData();
        return;
      }

      if (action === "mark-status" && targetStatus) {
        await adminApiFetch(`/api/admin/orders/${detail.id}/status`, {
          method: "PUT",
          body: JSON.stringify({ status: targetStatus }),
        });
        await refreshData();
        return;
      }

      if (action === "mark-ready-for-delivery") {
        await adminApiFetch(`/api/admin/orders/${detail.id}/mark-ready-for-delivery`, {
          method: "PATCH",
        });
        await refreshData();
        return;
      }

      if (action === "collect-and-deliver") {
        router.push(`/admin/payments?orderId=${detail.id}`);
        return;
      }

      if (action === "cancel-order") {
        setCancelDialogOpen(true);
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Não foi possível executar esta ação.");
    }
  }

  async function cancelOrder() {
    if (!detail) return;

    setIsCancelling(true);
    setError("");
    try {
      await adminApiFetch(`/api/admin/orders/${detail.id}/cancel`, { method: "PUT" });
      setCancelDialogOpen(false);
      await refreshData();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Não foi possível cancelar este pedido.");
    } finally {
      setIsCancelling(false);
    }
  }

  async function saveTracking() {
    await adminApiFetch(`/api/admin/orders/${orderId}/tracking`, {
      method: "PUT",
      body: JSON.stringify({ trackingCode }),
    });
    await refreshData();
  }

  async function saveNote() {
    if (!internalNote.trim()) return;

    const payload = await adminApiFetch<{ notes: InternalOrderNote[] }>(`/api/admin/orders/${orderId}/notes`, {
      method: "POST",
      body: JSON.stringify({ content: internalNote }),
    });

    setNotes(payload.notes);
    setInternalNote("");
  }

  if (!detail || !totals) {
    return (
      <AdminSectionSkeleton
        title={error ? "Nao foi possivel abrir o pedido" : "A carregar detalhe do pedido"}
        message={error || "Estamos a montar dados, totais, historico e proximas acoes deste pedido."}
        rows={3}
      />
    );
  }

  const pickupOrder = isPickupOrder(detail);
  const cashOnPickup = isCashOnPickup(detail);
  const externalOrder = detail.type === "EXTERNAL";

  return (
    <div className="space-y-6">
      <section className="sticky top-[88px] z-10 rounded-[28px] border border-[var(--color-border)] bg-[color:var(--color-surface-overlay)]/95 px-6 py-5 backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
              <Link href="/admin/orders" className="text-[var(--color-danger)]">
                ← Pedidos
              </Link>
              <span>/</span>
              <span>Detalhe do pedido</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="font-[family-name:var(--font-sora)] text-3xl font-semibold">Detalhe do pedido</h1>
              <span className="font-[family-name:var(--font-sora)] text-xl font-semibold text-[var(--color-danger)]">
                {detail.number}
              </span>
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_THEME[currentStatus] ?? "bg-[var(--color-background-tertiary)] text-[var(--color-text-secondary)]"}`}>
                {pickupOrder && currentStatus === "DELIVERED" ? "Levantado" : humanizeOrderStatus(currentStatus)}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => window.print()} className="admin-button-muted">
              Exportar PDF
            </button>
            {primaryAction ? (
              "href" in primaryAction ? (
                <Link href={primaryAction.href} className="admin-button-danger">
                  {primaryAction.label}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => startTransition(async () => runAction(primaryAction.action, primaryAction.targetStatus, primaryAction.targetQueue))}
                  className="admin-button-danger"
                >
                  {isPending ? "A processar..." : primaryAction.label}
                </button>
              )
            ) : null}
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-[24px] border border-[rgba(232,67,26,0.18)] bg-[rgba(232,67,26,0.08)] px-5 py-4 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="admin-card p-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[rgba(232,67,26,0.1)] font-[family-name:var(--font-sora)] text-lg font-semibold text-[var(--color-danger)]">
                  {detail.customerName
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((part) => part[0]?.toUpperCase())
                    .join("")}
                </div>
                <div>
                  <h2 className="font-[family-name:var(--font-sora)] text-2xl font-semibold">{detail.customerName}</h2>
                  <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                    {detail.customerEmail} · {detail.customerPhone}
                  </p>
                  <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{detail.city || "Cidade não definida"}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${detail.type === "EXTERNAL" ? "bg-[#FFF0E6] text-[#AA4E1C]" : "bg-[#E8F6EB] text-[#185C2E]"}`}>
                      {detail.type === "EXTERNAL" ? "EXTERNO" : "INTERNO"}
                    </span>
                    <span className="inline-flex rounded-full bg-[#fef3c7] px-2.5 py-1 text-xs font-semibold text-[#92400e]">
                      {detail.customerVerified ? "Verificado" : "Verificação pendente"}
                    </span>
                  </div>
                </div>
                {externalOrder ? (
                <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                  <div className="rounded-2xl bg-[var(--color-background-secondary)] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">Detalhes</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--color-text-primary)]">
                      {detail.productDetails || "Sem detalhes informados"}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[var(--color-background-secondary)] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">Quantidade</p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">{detail.requestedQuantity || 1}</p>
                  </div>
                </div>
                ) : null}
                {detail.requestScreenshotUrl ? (
                  <a href={detail.requestScreenshotUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] px-4 py-3 text-sm font-semibold text-[var(--color-text-primary)]">
                    Abrir screenshot do produto
                  </a>
                ) : null}
              </div>
              <Link href={detail.customerId ? `/admin/customers/${detail.customerId}` : "/admin/customers"} className="admin-button-muted">
                Ver perfil completo
              </Link>
            </div>

            {externalOrder ? (
              <div className="mt-5 rounded-[24px] border border-[var(--color-border)] bg-[var(--color-background-tertiary)] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">Pedido enviado pelo cliente</p>
                  {detail.requestInputType === "DESCRIPTION" && (
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "#FEF3C7", color: "#92400E" }}>
                      Descrição manual
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <code className="block truncate rounded-2xl bg-[var(--color-background-secondary)] px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                    {detail.externalCartUrl || "Sem link disponível"}
                  </code>
                  <a href={detail.externalCartUrl || "#"} target="_blank" rel="noreferrer" className={`admin-button-muted ${detail.externalCartUrl ? "" : "pointer-events-none opacity-50"}`}>
                    Abrir link ↗
                  </a>
                </div>
              </div>
            ) : null}
          </section>

          <section className="admin-card p-6">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">
                {externalOrder ? "Cotacao internacional" : "Produtos comprados"}
              </p>
              <h2 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold">
                {externalOrder ? "Itens importados" : "Resumo de produtos locais"}
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-[var(--color-background-tertiary)] text-left text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
                  <tr>
                    {["Produto", "Nome do produto", "Variante", "Quantidade", "Preço unitário", "Subtotal"].map((heading) => (
                      <th key={heading} className="px-4 py-3 font-medium">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.externalItems.map((item) => (
                    <tr key={item.id} className="border-b border-[var(--color-border)] last:border-b-0">
                      <td className="px-4 py-4">
                        {item.imageUrl ? (
                          <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-tertiary)]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              width={56}
                              height={56}
                              className="h-14 w-14 object-cover"
                            />
                          </div>
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(232,67,26,0.1)] text-xl">
                            {detail.type === "EXTERNAL" ? "📦" : "🛍️"}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          <p className="font-medium">{item.name}</p>
                          {item.productCode ? (
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-danger)]">
                              Código físico: {item.productCode}
                            </p>
                          ) : null}
                          {item.productDescription ? (
                            <p className="line-clamp-2 text-xs text-[var(--color-text-secondary)]">
                              {item.productDescription}
                            </p>
                          ) : null}
                          <div className="flex flex-wrap gap-2 text-xs text-[var(--color-text-secondary)]">
                            {item.categoryName ? <span>{item.categoryName}</span> : null}
                            {item.stockLabel ? <span>{item.stockLabel}</span> : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-[var(--color-text-secondary)]">
                        {item.variantLabel || item.details}
                      </td>
                      <td className="px-4 py-4">{item.quantity}</td>
                      <td className="px-4 py-4 font-[family-name:var(--font-sora)]">
                        {formatOrderItemMoney(detail, item.originalPriceUsd)}
                      </td>
                      <td className="px-4 py-4 font-[family-name:var(--font-sora)] font-semibold">
                        {formatOrderItemMoney(detail, item.subtotal ?? item.originalPriceUsd * item.quantity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 rounded-[24px] border border-[var(--color-border)] bg-[var(--color-background-tertiary)] p-4">
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><span>Subtotal dos itens</span><strong>{formatMoney(totals.subtotal)}</strong></div>
                {externalOrder ? (
                <div className="flex items-center justify-between"><span>Frete internacional</span><strong>{formatMoney(totals.freight)}</strong></div>
                ) : null}
                {externalOrder ? <>
                {externalOrder && totals.customs > 0 ? (
                  <div className="flex items-center justify-between"><span>Reservas e taxas</span><strong>{formatMoney(totals.customs)}</strong></div>
                ) : null}
                <div className="flex items-center justify-between"><span>Comissão XDigital</span><strong>{formatMoney(totals.commission)}</strong></div>
                </> : null}
                {!externalOrder && totals.localDelivery > 0 ? (
                  <div className="flex items-center justify-between"><span>Entrega</span><strong>{formatMoney(totals.localDelivery)}</strong></div>
                ) : null}
                {totals.discount > 0 ? (
                  <div className="flex items-center justify-between">
                    <span>Desconto aplicado{detail.couponCode ? `: ${detail.couponCode}` : ""}</span>
                    <strong>- {formatMoney(totals.discount)}</strong>
                  </div>
                ) : null}
              </div>
              <div className="my-4 h-px bg-[var(--color-border)]" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--color-text-secondary)]">Total final</span>
                <strong className="font-[family-name:var(--font-sora)] text-3xl text-[var(--color-danger)]">{formatMoney(totals.total)}</strong>
              </div>
              {detail.type === "EXTERNAL" && ["CREATED", "UNDER_REVIEW", "QUOTED"].includes(currentStatus) ? (
                <div className="mt-4 rounded-2xl border border-[#F1D7A8] bg-[#FFF5D8] px-4 py-3 text-sm text-[#7A5712]">
                  Os valores apresentados podem ainda ser estimados até a cotação ser aprovada pelo cliente.
                </div>
              ) : null}
            </div>
          </section>

          <section className="admin-card p-6">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">Rastreador</p>
              <h2 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold">Estado do ciclo de vida</h2>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[720px]">
                <div className="flex items-center justify-between">
                  {trackingSteps.map((step, index) => {
                    const done = index < currentStepIndex;
                    const active = step === currentStatus;
                    const future = index > currentStepIndex;

                    return (
                      <div key={step} className="flex flex-1 items-center">
                        <div className="flex flex-col items-center text-center">
                          <span
                            className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-semibold ${
                              done
                                ? "border-[var(--color-danger)] bg-[var(--color-danger)] text-white"
                                : active
                                  ? "border-[var(--color-danger)] text-[var(--color-danger)] shadow-[0_0_0_6px_rgba(232,67,26,0.12)]"
                                  : "border-[var(--color-border-strong)] text-[var(--color-text-secondary)]"
                            } ${active ? "animate-pulse" : ""} ${future ? "opacity-45" : ""}`}
                          >
                            {done ? "✓" : active ? "•" : ""}
                          </span>
                          <span className={`mt-3 text-xs font-semibold uppercase tracking-[0.12em] ${future ? "text-[var(--color-text-secondary)] opacity-60" : "text-[var(--color-text-primary)]"}`}>
                            {getTrackingStepLabel(step, detail)}
                          </span>
                        </div>
                        {index < trackingSteps.length - 1 ? (
                          <span className={`mx-2 h-0.5 flex-1 ${done ? "bg-[var(--color-danger)]" : "bg-[var(--color-border)]"}`} />
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 grid grid-flow-col auto-cols-fr gap-2 text-center text-xs text-[var(--color-text-secondary)]">
                  {trackingSteps.map((step) => {
                    const event = history.find((item) => item.id === step.toLowerCase());
                    return (
                      <div key={step}>
                        {event?.date
                          ? new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" }).format(new Date(event.date))
                          : "—"}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          <section ref={trackingRef} className="admin-card p-6">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">
                {pickupOrder ? "Levantamento" : "Entrega"}
              </p>
              <h2 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold">
                {pickupOrder ? "Informação de levantamento" : "Informação de entrega"}
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-[var(--color-text-secondary)]">Modalidade</p>
                <p className="mt-2 text-sm text-[var(--color-text-primary)]">
                  {pickupOrder ? "Levantamento na loja" : "Entrega ao domicílio"}
                </p>
                <p className="mt-4 text-sm font-medium text-[var(--color-text-secondary)]">
                  {pickupOrder ? "Local de entrega ao cliente" : "Morada"}
                </p>
                <p className="mt-2 text-sm text-[var(--color-text-primary)]">{detail.deliveryAddress || "Sem morada completa"}</p>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Referência: {detail.deliveryReference || "Sem referência"}</p>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Destinatário: {detail.customerName} · {detail.customerPhone}</p>
              </div>
              <div>
                {pickupOrder ? (
                  <div className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-background-tertiary)] p-5 text-sm">
                    <p className="font-medium text-[var(--color-text-secondary)]">Estado do levantamento</p>
                    <p className="mt-3 text-[var(--color-text-primary)]">
                      {currentStatus === "READY_FOR_DELIVERY"
                        ? "Pedido pronto para o cliente levantar."
                        : currentStatus === "DELIVERED"
                          ? "Levantamento confirmado."
                          : "Aguardando preparação do pedido."}
                    </p>
                  </div>
                ) : (
                  <>
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">Código de rastreio</span>
                      <input
                        value={trackingCode}
                        onChange={(event) => setTrackingCode(event.target.value)}
                        className="admin-input"
                        placeholder="Adicionar código de rastreio"
                      />
                    </label>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <button type="button" onClick={() => startTransition(async () => saveTracking())} className="admin-button-muted">
                        Guardar rastreio
                      </button>
                      <Link href={`/admin/orders/${orderId}/tracking`} className="admin-button-muted">
                        Gestão completa de rastreio
                      </Link>
                      {detail.trackingUrl ? (
                        <a href={detail.trackingUrl} target="_blank" rel="noreferrer" className="admin-button-muted">
                          Rastrear envio ↗
                        </a>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>

          <section className="admin-card p-6">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">Pagamento</p>
              <h2 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold">Detalhe de pagamento</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><span>Método</span><strong>{humanizePaymentMethod(detail.payment.method)}</strong></div>
                <div className="flex items-center justify-between"><span>Provider</span><strong>{detail.payment.provider || "MANUAL"}</strong></div>
                {detail.payment.providerReference ? (
                  <div className="flex items-center justify-between gap-3"><span>Ref. gateway</span><strong className="break-all text-right">{detail.payment.providerReference}</strong></div>
                ) : null}
                {detail.payment.providerStatus ? (
                  <div className="flex items-center justify-between"><span>Estado gateway</span><strong>{detail.payment.providerStatus}</strong></div>
                ) : null}
                <div className="flex items-center justify-between"><span>Referência</span><strong>{detail.payment.transactionId || "Sem referência"}</strong></div>
                <div className="flex items-center justify-between"><span>Data e hora</span><strong>{detail.payment.paymentDate ? new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" }).format(new Date(detail.payment.paymentDate)) : "Não pago"}</strong></div>
                <div className="flex items-center justify-between"><span>Valor pago</span><strong>{formatMoney(detail.payment.amount)}</strong></div>
                <div className="flex items-center justify-between"><span>Estado</span><strong>{detail.payment.status || "Sem validação"}</strong></div>
              </div>
              <div className="flex flex-col gap-3">
                {detail.payment.receiptUrl ? (
                  <button type="button" onClick={() => setReceiptModalOpen(true)} className="admin-button-muted">
                    Ver comprovativo
                  </button>
                ) : null}
                {cashOnPickup && !isClosedOrderStatus(detail.status) && !isPaymentValidated(detail.payment.status) ? (
                  <div className="rounded-2xl border border-[#F1D7A8] bg-[#FFF5D8] px-4 py-3 text-sm text-[#7A5712]">
                    Cobrar {formatMoney(detail.totalAmount)} ao cliente antes de concluir o levantamento.
                  </div>
                ) : null}
                {!pickupOrder && detail.payment.method === "CASH_ON_DELIVERY" && !isClosedOrderStatus(detail.status) && !isPaymentValidated(detail.payment.status) ? (
                  <div className="rounded-2xl border border-[#F1D7A8] bg-[#FFF5D8] px-4 py-3 text-sm text-[#7A5712]">
                    Cobrar {formatMoney(detail.totalAmount)} ao cliente antes de fechar a entrega.
                  </div>
                ) : null}
                {canValidatePayment(detail) ? (
                  isSuperAdmin ? (
                    <button type="button" onClick={() => router.push(`/admin/payments?orderId=${detail.id}`)} className="admin-button-danger">
                      Ver em pagamentos
                    </button>
                  ) : (
                    <button type="button" onClick={() => startTransition(async () => runAction("handoff", undefined, "PAYMENTS"))} className="admin-button-danger">
                      Enviar para equipa de pagamentos
                    </button>
                  )
                ) : null}
                {detail.payment.notes ? (
                  <div className="rounded-2xl bg-[var(--color-background-tertiary)] px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                    {detail.payment.notes}
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="admin-card p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">Ações rápidas</p>
            <div className="mt-4 flex flex-col gap-3">
              {quickActions.map((action) =>
                "href" in action ? (
                  <Link key={action.label} href={action.href} className="admin-button-danger justify-center">
                    {action.label}
                  </Link>
                ) : action.action === "cancel-order" ? (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => startTransition(async () => runAction(action.action, action.targetStatus, action.targetQueue))}
                    className="rounded-full px-4 py-3 text-sm font-semibold text-[var(--color-danger)]"
                  >
                    {action.label}
                  </button>
                ) : (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => startTransition(async () => runAction(action.action, action.targetStatus, action.targetQueue))}
                    className="admin-button-muted justify-center"
                  >
                    {action.label}
                  </button>
                )
              )}
            </div>
          </section>

          <section className="admin-card p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">Histórico de eventos</p>
            <div className="mt-4 space-y-4">
              {timelineDesc.map((event) => (
                <div key={event.id} className="flex items-start gap-3">
                  <span className="mt-1 h-3 w-3 rounded-full" style={{ backgroundColor: event.iconColor || "#E8431A" }} />
                  <div>
                    <p className="font-medium text-[var(--color-text-primary)]">{event.label}</p>
                    <p className="text-sm text-[var(--color-text-secondary)]">{event.description || humanizeOrderStatus(event.label)}</p>
                    <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                      {event.actor || "Sistema"} · {event.date ? new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" }).format(new Date(event.date)) : "Sem data"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="admin-card p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">Notas internas</p>
            <label className="mt-4 block">
              <textarea
                rows={4}
                value={internalNote}
                onChange={(event) => setInternalNote(event.target.value)}
                className="admin-input min-h-[120px] resize-y"
                placeholder="Adicionar contexto interno para a equipa"
              />
            </label>
            <button type="button" onClick={() => startTransition(async () => saveNote())} className="admin-button-muted mt-3 justify-center">
              Guardar nota
            </button>

            <div className="mt-5 space-y-3">
              {notes.length ? (
                notes.map((note) => (
                  <div key={note.id} className="rounded-2xl bg-[var(--color-background-tertiary)] px-4 py-3">
                    <p className="text-sm text-[var(--color-text-primary)]">{note.content}</p>
                    <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                      {note.author} · {new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" }).format(new Date(note.createdAt))}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--color-text-secondary)]">Sem notas internas registadas.</p>
              )}
            </div>
          </section>
        </aside>
      </div>

      {receiptModalOpen && detail.payment.receiptUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={() => setReceiptModalOpen(false)}>
          <div className="max-w-3xl overflow-hidden rounded-[28px] bg-white" onClick={(event) => event.stopPropagation()}>
            <Image src={detail.payment.receiptUrl} alt="Comprovativo" width={1400} height={1800} className="max-h-[80vh] w-full object-contain" />
          </div>
        </div>
      ) : null}
      <AdminConfirmDialog
        open={cancelDialogOpen}
        title="Cancelar pedido?"
        message={`O pedido ${detail.number} sera cancelado e a equipa deixara de o tratar como ativo.`}
        confirmLabel="Cancelar pedido"
        cancelLabel="Manter pedido"
        danger
        pending={isCancelling}
        onCancel={() => {
          if (!isCancelling) {
            setCancelDialogOpen(false);
          }
        }}
        onConfirm={() => void cancelOrder()}
      />
    </div>
  );
}
