"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { AttentionDot } from "@/components/admin/attention-dot";
import { AdminBanner, AdminListLoadingOverlay, AdminSpinner, AdminStateCard, AdminTableSkeleton } from "@/components/admin/feedback-state";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useOrders } from "@/hooks/useOrders";
import { adminApiFetch } from "@/lib/admin/api-client";
import { formatDate, formatMoney, humanizeOrderStatus, humanizePaymentMethod } from "@/lib/admin/format";
import type { OrderQueueStatus } from "@/lib/admin/order-status";
import { isActionRequired, sortOperationalQueue, type OperationalContext } from "@/lib/admin/operational-queue";
import type { AdminModule } from "@/lib/admin/roles";
import type { AdminOrderListItem, OrdersFilterState, OrdersStatsResponse } from "@/lib/admin/types";

type DrawerAction =
  | { label: string; href: string }
  | {
      label: string;
      action: "mark-status" | "mark-ready-for-delivery" | "validate-payment" | "collect-and-close" | "handoff";
      targetStatus?: "ORDERED" | "IN_TRANSIT" | "ARRIVED" | "OUT_FOR_DELIVERY" | "DELIVERED";
      targetQueue?: "PAYMENTS" | "QUOTES" | "DELIVERY" | "EXECUTION";
    };

type ActionFeedback = {
  message: string;
  tone: "success" | "error";
};

const STATUS_CARDS = [
  { key: "ALL", label: "Tudo", subtitle: "Panorama completo da operacao" },
  { key: "ANALYSIS", label: "Analise", subtitle: "Pedidos que ainda exigem proposta ou decisao" },
  { key: "PAYMENT", label: "Pagamento", subtitle: "Pedidos a aguardar pagamento ou comprovativo" },
  { key: "EXECUTION", label: "Execucao", subtitle: "Pedidos pagos ou em andamento logistico" },
  { key: "COMPLETED", label: "Finalizados", subtitle: "Pedidos entregues ou concluidos" },
] as const;

const TYPE_FILTERS = [
  { key: "ALL", label: "Todos" },
  { key: "EXTERNAL", label: "Externos" },
  { key: "INTERNAL", label: "Internos" },
] as const;

const PERIOD_FILTERS = [
  { key: "TODAY", label: "Hoje" },
  { key: "THIS_WEEK", label: "Esta semana" },
] as const;

const PRIORITY_COLORS = {
  HIGH: "#E24B4A",
  MEDIUM: "#EF9F27",
  LOW: "#639922",
} as const;

const STATUS_THEME: Record<string, string> = {
  ANALYSIS: "bg-[#FAEEDA] text-[#633806]",
  PAYMENT: "bg-[#FFF2D6] text-[#8A5A00]",
  EXECUTION: "bg-[#E6F7EE] text-[#0E5B3A]",
  COMPLETED: "bg-[#EAF3DE] text-[#27500A]",
  CREATED: "bg-[#F1EFE8] text-[#444441]",
  UNDER_REVIEW: "bg-[#FAEEDA] text-[#633806]",
  QUOTED: "bg-[#fef3c7] text-[#92400e]",
  APPROVED: "bg-[#d1fae5] text-[#065f46]",
  PENDING_PAYMENT: "bg-[#FAEEDA] text-[#633806]",
  PAYMENT_SUBMITTED: "bg-[#E8F1FE] text-[#1D4ED8]",
  PAYMENT_UNDER_REVIEW: "bg-[#EEEDFE] text-[#3C3489]",
  PAYMENT_REJECTED: "bg-[#FCEBEB] text-[#B42318]",
  PAID: "bg-[#EAF3DE] text-[#173404]",
  READY_FOR_FULFILLMENT: "bg-[#FFF2D6] text-[#8A5A00]",
  PICKING: "bg-[#E6F7EE] text-[#0E5B3A]",
  PREPARING: "bg-[#E6F7EE] text-[#0E5B3A]",
  READY_FOR_DELIVERY: "bg-[#E0F2FE] text-[#0C4A6E]",
  TO_PURCHASE: "bg-[#FFF2D6] text-[#8A5A00]",
  ORDERED: "bg-[#E1F5EE] text-[#085041]",
  PURCHASED: "bg-[#E1F5EE] text-[#085041]",
  IN_TRANSIT: "bg-[#DBEAFE] text-[#1E3A5F]",
  ARRIVED: "bg-[#E0F2FE] text-[#0C4A6E]",
  OUT_FOR_DELIVERY: "bg-[#FDE68A] text-[#854D0E]",
  DELIVERY_FAILED: "bg-[#FCEBEB] text-[#B42318]",
  DELIVERED: "bg-[#EAF3DE] text-[#27500A]",
  CANCELLED: "bg-[#FCEBEB] text-[#791F1F]",
};

const TRACKING_STEPS = [
  "UNDER_REVIEW",
  "QUOTED",
  "PENDING_PAYMENT",
  "PAYMENT_SUBMITTED",
  "PAYMENT_UNDER_REVIEW",
  "PAYMENT_REJECTED",
  "PAID",
  "ORDERED",
  "IN_TRANSIT",
  "DELIVERED",
] as const;

const DELIVERY_TRACKING_STEPS = [
  "ARRIVED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
] as const;

const INTERNAL_DELIVERY_TRACKING_STEPS = [
  "READY_FOR_FULFILLMENT",
  "READY_FOR_DELIVERY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
] as const;

const PICKUP_TRACKING_STEPS = ["PAID", "ORDERED", "DELIVERED"] as const;

const DELIVERY_NEXT_ACTION: Record<
  string,
  {
    label: string;
    targetStatus: "ORDERED" | "IN_TRANSIT" | "ARRIVED" | "OUT_FOR_DELIVERY" | "DELIVERED";
  } | null
> = {
  PAID: { label: "Marcar como encomendado", targetStatus: "ORDERED" },
  ORDERED: { label: "Marcar em trânsito", targetStatus: "IN_TRANSIT" },
  IN_TRANSIT: { label: "Marcar como chegado", targetStatus: "ARRIVED" },
  ARRIVED: { label: "Saiu para entrega", targetStatus: "OUT_FOR_DELIVERY" },
  OUT_FOR_DELIVERY: { label: "Confirmar entrega", targetStatus: "DELIVERED" },
  DELIVERED: null,
};

function isPaymentValidated(status: string | null) {
  return String(status ?? "") === "SUCCESS";
}

function isCashOnDelivery(order: AdminOrderListItem | null) {
  return order?.paymentMethod === "CASH_ON_DELIVERY";
}

function isPickupOrder(order: AdminOrderListItem | null) {
  return order?.type === "INTERNAL" && order?.deliveryMethod === "STORE_PICKUP";
}

function isInternalDeliveryOrder(order: AdminOrderListItem | null) {
  return order?.type === "INTERNAL" && order?.deliveryMethod !== "STORE_PICKUP";
}

function getOperationalStatus(order: AdminOrderListItem | null) {
  return String(order?.orderStatus || order?.fulfillmentStatus || order?.status || "");
}

function getActionErrorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "Nao foi possivel concluir a operacao.";
}

function paymentQueueForOrder(status: string) {
  if (status === "PAYMENT_UNDER_REVIEW") return "UNDER_REVIEW";
  if (status === "PAYMENT_REJECTED") return "REJECTED";
  if (status === "PAYMENT_SUBMITTED") return "SUBMITTED";
  return "AWAITING_SUBMISSION";
}

function getDrawerTrackingSteps(order: AdminOrderListItem | null, mode: "orders" | "delivery") {
  if (isPickupOrder(order)) {
    return PICKUP_TRACKING_STEPS;
  }

  if (isInternalDeliveryOrder(order)) {
    return INTERNAL_DELIVERY_TRACKING_STEPS;
  }

  if (mode === "delivery" && order?.type === "EXTERNAL") {
    return DELIVERY_TRACKING_STEPS;
  }

  return mode === "delivery" ? INTERNAL_DELIVERY_TRACKING_STEPS : TRACKING_STEPS;
}

function getDrawerTrackingStatus(order: AdminOrderListItem | null, mode: "orders" | "delivery") {
  if (!order) {
    return "";
  }

  const status = getOperationalStatus(order);

  if (isPickupOrder(order)) {
    if (["IN_TRANSIT", "ARRIVED", "OUT_FOR_DELIVERY"].includes(status)) {
      return "ORDERED";
    }
    return status;
  }

  if (isInternalDeliveryOrder(order)) {
    if (status === "ORDERED" || status === "ARRIVED") {
      return "READY_FOR_DELIVERY";
    }
    return status;
  }

  return mode === "delivery" ? status : order.uiStatus;
}

function getDrawerTrackingStepLabel(step: string, order: AdminOrderListItem | null) {
  if (isPickupOrder(order)) {
    if (step === "ORDERED") return "Pronto para levantar";
    if (step === "DELIVERED") return "Levantado";
  }

  return humanizeOrderStatus(step);
}

function TypeBadge({ type }: { type: "EXTERNAL" | "INTERNAL" }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        type === "EXTERNAL" ? "bg-[#FFF0E6] text-[#AA4E1C]" : "bg-[#E8F6EB] text-[#185C2E]"
      }`}
    >
      {type === "EXTERNAL" ? "EXT" : "INT"}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        STATUS_THEME[status] ?? "bg-[var(--color-background-tertiary)] text-[var(--color-text-secondary)]"
      }`}
    >
      {humanizeOrderStatus(status)}
    </span>
  );
}

function OperationalStatusBadge({ order }: { order: AdminOrderListItem }) {
  const status = getOperationalStatus(order);

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        STATUS_THEME[status] ?? "bg-[var(--color-background-tertiary)] text-[var(--color-text-secondary)]"
      }`}
    >
      {order.operationalStatusLabel || order.nextActionLabel || humanizeOrderStatus(status)}
    </span>
  );
}

function QueueBadge({ queueStatus }: { queueStatus: Exclude<OrderQueueStatus, "ALL"> }) {
  return <StatusBadge status={queueStatus} />;
}

function PriorityBadge({
  priority,
  label,
}: {
  priority: keyof typeof PRIORITY_COLORS;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PRIORITY_COLORS[priority] }} />
      {label}
    </span>
  );
}

function OrdersDrawer({
  order,
  onClose,
  onActionComplete,
  shouldFocusAction,
  onActionFocused,
  mode,
  onFeedback,
}: {
  order: AdminOrderListItem | null;
  onClose: () => void;
  onActionComplete: () => void;
  shouldFocusAction: boolean;
  onActionFocused: () => void;
  mode: "orders" | "delivery";
  onFeedback: (feedback: ActionFeedback) => void;
}) {
  const { effectiveRole } = useAdminAuth();
  const [isPending, startTransition] = useTransition();
  const actionRegionRef = useRef<HTMLDivElement | null>(null);
  const trackingSteps = getDrawerTrackingSteps(order, mode);
  const paymentValidated = isPaymentValidated(order?.paymentStatus ?? null);
  const cashOnDelivery = isCashOnDelivery(order);
  const currentTrackingStatus = getDrawerTrackingStatus(order, mode);
  const currentStepIndex = trackingSteps.findIndex((step) => step === currentTrackingStatus);

  function primaryAction(orderItem: AdminOrderListItem | null): DrawerAction | null {
    if (!orderItem) return null;

    const status = getOperationalStatus(orderItem);

    if (isPickupOrder(orderItem)) {
      if (status === "PAID") {
        return { label: "Marcar pronto para levantamento", action: "mark-status", targetStatus: "ORDERED" };
      }

      if (["ORDERED", "IN_TRANSIT", "ARRIVED", "OUT_FOR_DELIVERY"].includes(status)) {
        if (isCashOnDelivery(orderItem) && !isPaymentValidated(orderItem.paymentStatus)) {
          return { label: "Confirmar cobrança e levantamento", action: "collect-and-close", targetStatus: "DELIVERED" };
        }

        return { label: "Confirmar levantamento", action: "mark-status", targetStatus: "DELIVERED" };
      }

      if (status === "DELIVERED") {
        return { label: "Ver detalhes completos", href: `/admin/orders/${orderItem.id}` };
      }

      return null;
    }

    if (mode === "delivery") {
      if (orderItem.deliveryMethod === "STORE_PICKUP") {
        return null;
      }

      if (isCashOnDelivery(orderItem) && !isPaymentValidated(orderItem.paymentStatus) && status === "OUT_FOR_DELIVERY") {
        return { label: "Confirmar cobrança e entrega", action: "collect-and-close", targetStatus: "DELIVERED" };
      }

      const deliveryAction = DELIVERY_NEXT_ACTION[status] ?? null;
      return deliveryAction
        ? { label: deliveryAction.label, action: "mark-status", targetStatus: deliveryAction.targetStatus }
        : null;
    }

    if (orderItem.uiStatus === "UNDER_REVIEW" || (orderItem.type === "EXTERNAL" && orderItem.uiStatus === "CREATED")) {
      return { label: "Analisar e cotar", href: `/admin/orders/${orderItem.id}/quote` };
    }
    if (orderItem.uiStatus === "QUOTED") {
      return { label: "Ver cotacao enviada", href: `/admin/orders/${orderItem.id}/quote` };
    }
    if (["APPROVED", "PENDING_PAYMENT", "PAYMENT_SUBMITTED", "PAYMENT_UNDER_REVIEW", "PAYMENT_REJECTED"].includes(orderItem.uiStatus)) {
      return effectiveRole === "SUPER_ADMIN"
        ? { label: orderItem.uiStatus === "PAYMENT_REJECTED" ? "Ver submissao financeira" : "Ver em pagamentos", href: `/admin/payments?orderId=${orderItem.id}&queue=${paymentQueueForOrder(orderItem.uiStatus)}` }
        : { label: "Enviar para equipa de pagamentos", action: "handoff", targetQueue: "PAYMENTS" };
    }
    if (isInternalDeliveryOrder(orderItem) && status === "READY_FOR_FULFILLMENT") {
      return { label: "Preparar produto", action: "mark-ready-for-delivery" };
    }
    if (isInternalDeliveryOrder(orderItem) && ["PICKING", "PREPARING"].includes(status)) {
      return { label: "Mandar para entrega", action: "mark-ready-for-delivery" };
    }
    if (isInternalDeliveryOrder(orderItem) && status === "READY_FOR_DELIVERY") {
      return { label: "Ver em entregas", href: "/admin/delivery/pending" };
    }
    if (orderItem.uiStatus === "PAID") {
      return { label: "Marcar como encomendado", action: "mark-status", targetStatus: "ORDERED" };
    }
    if (orderItem.type === "EXTERNAL" && status === "ORDERED") {
      return { label: "Marcar em transito", action: "mark-status", targetStatus: "IN_TRANSIT" };
    }
    if (orderItem.type === "EXTERNAL" && status === "IN_TRANSIT") {
      return { label: "Marcar como chegado a sede", action: "mark-status", targetStatus: "ARRIVED" };
    }
    if (orderItem.type === "EXTERNAL" && status === "ARRIVED") {
      return effectiveRole === "SUPER_ADMIN"
        ? { label: "Mandar para entrega", action: "handoff", targetQueue: "DELIVERY" }
        : { label: "Enviar para equipa de delivery", action: "handoff", targetQueue: "DELIVERY" };
    }
    if (orderItem.type === "EXTERNAL" && status === "READY_FOR_DELIVERY") {
      return { label: "Ver em entregas", href: "/admin/delivery/pending" };
    }
    if (orderItem.uiStatus === "DELIVERED") {
      return { label: "Ver recibo", href: `/admin/orders/${orderItem.id}` };
    }

    return null;
  }

  const action = primaryAction(order);

  useEffect(() => {
    if (!order || !shouldFocusAction) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const target = actionRegionRef.current?.querySelector<HTMLElement>("[data-auto-focus-action='true']");
      if (!target) {
        return;
      }

      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      onActionFocused();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [action, onActionFocused, order, shouldFocusAction]);

  async function handleOrderAdvance(targetStatus: "ORDERED" | "IN_TRANSIT" | "ARRIVED" | "OUT_FOR_DELIVERY" | "DELIVERED") {
    if (!order) return;

    startTransition(async () => {
      try {
        await adminApiFetch(`/api/admin/orders/${order.id}/status`, {
          method: "PUT",
          body: JSON.stringify({ status: targetStatus }),
        });
        onActionComplete();
      } catch (error) {
        onFeedback({ message: getActionErrorMessage(error), tone: "error" });
      }
    });
  }

  async function handlePaymentValidation() {
    if (!order) return;

    startTransition(async () => {
      try {
        await adminApiFetch(`/api/admin/orders/${order.id}/payment/validate`, {
          method: "PUT",
        });
        onActionComplete();
      } catch (error) {
        onFeedback({ message: getActionErrorMessage(error), tone: "error" });
      }
    });
  }

  async function handleMarkReadyForDelivery() {
    if (!order) return;

    startTransition(async () => {
      try {
        await adminApiFetch(`/api/admin/orders/${order.id}/mark-ready-for-delivery`, {
          method: "PATCH",
        });
        onFeedback({ message: "Pedido marcado como pronto para entrega.", tone: "success" });
        onActionComplete();
      } catch (error) {
        onFeedback({ message: getActionErrorMessage(error), tone: "error" });
      }
    });
  }

  async function handleCollectAndClose(targetStatus: "DELIVERED") {
    if (!order) return;

    startTransition(async () => {
      try {
        await adminApiFetch(`/api/admin/orders/${order.id}/payment/validate`, {
          method: "PUT",
        });
        await adminApiFetch(`/api/admin/orders/${order.id}/status`, {
          method: "PUT",
          body: JSON.stringify({ status: targetStatus }),
        });
        onActionComplete();
      } catch (error) {
        onFeedback({ message: getActionErrorMessage(error), tone: "error" });
      }
    });
  }

  async function handleHandoff(targetQueue: "PAYMENTS" | "QUOTES" | "DELIVERY" | "EXECUTION") {
    if (!order) return;

    startTransition(async () => {
      try {
        await adminApiFetch(`/api/admin/orders/${order.id}/handoff`, {
          method: "PATCH",
          body: JSON.stringify({
            targetQueue,
            note: "Encaminhado pela fila de pedidos",
          }),
        });

        onFeedback({
          message:
            targetQueue === "PAYMENTS"
              ? "Pedido enviado para a equipa de pagamentos."
              : targetQueue === "DELIVERY"
                ? "Pedido enviado para a equipa de delivery."
                : targetQueue === "QUOTES"
                  ? "Pedido enviado para a equipa de cotacoes."
                  : "Pedido enviado para a equipa de execucao.",
          tone: "success",
        });
        onActionComplete();
      } catch (error) {
        onFeedback({ message: getActionErrorMessage(error), tone: "error" });
      }
    });
  }

  return (
    <aside className="sticky top-[132px] w-full shrink-0 self-start xl:w-[320px]">
      <div className="admin-card p-5">
        {order ? (
          <>
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-danger)]">
                  Pedido seleccionado
                </p>
                <h3 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold">
                  {order.number}
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-[var(--color-border)] px-3 py-1 text-sm text-[var(--color-text-secondary)]"
              >
                ×
              </button>
            </div>

            <dl className="space-y-3 text-sm">
              {[ 
                ["Cliente", order.customer],
                ["Tipo", order.type === "EXTERNAL" ? "Externo" : "Interno"],
                ["Loja de origem", order.sourceStore],
                ["Valor", formatMoney(order.totalAmount)],
                ["Fila", humanizeOrderStatus(order.queueStatus)],
                ["Status operacional", order.operationalStatusLabel || humanizeOrderStatus(getOperationalStatus(order))],
                ["Estado do cliente", order.customerStatusLabel || humanizeOrderStatus(order.customerStage)],
                ["Data", formatDate(order.createdAt)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] pb-3">
                  <dt className="text-[var(--color-text-secondary)]">{label}</dt>
                  <dd className="text-right font-medium text-[var(--color-text-primary)]">{value}</dd>
                </div>
              ))}
            </dl>

            {mode === "delivery" ? (
              <div className="mt-6 rounded-[24px] border border-[var(--color-border)] bg-[var(--color-background-tertiary)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">
                  Pagamento e entrega
                </p>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[var(--color-text-secondary)]">Modalidade</span>
                    <strong>{order.deliveryMethod === "STORE_PICKUP" ? "Levantamento" : "Delivery"}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[var(--color-text-secondary)]">Pagamento</span>
                    <strong>{humanizePaymentMethod(order.paymentMethod)}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[var(--color-text-secondary)]">Estado do pagamento</span>
                    <strong>{paymentValidated ? "Confirmado" : cashOnDelivery ? "Por cobrar" : "Pendente"}</strong>
                  </div>
                  {cashOnDelivery ? (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[var(--color-text-secondary)]">Valor a cobrar</span>
                      <strong>{formatMoney(order.totalAmount)}</strong>
                    </div>
                  ) : null}
                </div>
                {cashOnDelivery && !paymentValidated ? (
                  <div className="mt-4 rounded-2xl border border-[#F1D7A8] bg-[#FFF5D8] px-4 py-3 text-sm text-[#7A5712]">
                    {isPickupOrder(order)
                      ? `Cobrar ${formatMoney(order.totalAmount)} antes de concluir o levantamento.`
                      : `O delivery deve cobrar ${formatMoney(order.totalAmount)} antes de fechar a entrega.`}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-6">
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-danger)]">
                Rastreador
              </p>
              <div className="space-y-3">
                {trackingSteps.map((step, index) => {
                  const done = currentStepIndex >= index && currentStepIndex !== -1;
                  const active = currentTrackingStatus === step;

                  return (
                    <div key={step} className="flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        <span
                          className="flex h-4 w-4 items-center justify-center rounded-full border-2"
                          style={{
                            borderColor: done ? "#E8431A" : "var(--color-border-strong)",
                            backgroundColor: done ? "#E8431A" : "transparent",
                          }}
                        >
                          {active ? <span className="text-[10px] text-white">→</span> : null}
                        </span>
                        {index < trackingSteps.length - 1 ? (
                          <span className="mt-1 h-6 w-px" style={{ backgroundColor: done ? "#E8431A" : "var(--color-border-strong)" }} />
                        ) : null}
                      </div>
                      <span className={`text-sm ${active ? "font-semibold text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]"}`}>
                        {getDrawerTrackingStepLabel(step, order)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div ref={actionRegionRef} className="mt-6 flex flex-col gap-3">
              {action ? (
                "href" in action ? (
                  <Link href={action.href} data-auto-focus-action="true" className="admin-button-danger justify-center">
                    {action.label}
                  </Link>
                ) : (
                  <button
                    type="button"
                    data-auto-focus-action="true"
                    onClick={() => {
                      if (action.action === "validate-payment") {
                        void handlePaymentValidation();
                        return;
                      }

                      if (action.action === "collect-and-close") {
                        void handleCollectAndClose("DELIVERED");
                        return;
                      }

                      if (action.action === "handoff" && action.targetQueue) {
                        void handleHandoff(action.targetQueue);
                        return;
                      }

                      if (action.action === "mark-ready-for-delivery") {
                        void handleMarkReadyForDelivery();
                        return;
                      }

                      if (action.targetStatus) {
                        void handleOrderAdvance(action.targetStatus);
                      }
                    }}
                    disabled={isPending}
                    className="admin-button-danger justify-center"
                  >
                    {isPending ? "A processar..." : action.label}
                  </button>
                )
              ) : null}

              {mode === "delivery" && cashOnDelivery && !paymentValidated && getOperationalStatus(order) !== "OUT_FOR_DELIVERY" && !isPickupOrder(order) ? (
                <button
                  type="button"
                  onClick={() => void handlePaymentValidation()}
                  disabled={isPending}
                  className="admin-button-muted justify-center"
                >
                  {isPending ? "A processar..." : "Confirmar cobrança na entrega"}
                </button>
              ) : null}

              <Link href={`/admin/orders/${order.id}`} data-auto-focus-action={!action ? "true" : undefined} className="admin-button-muted justify-center">
                Ver detalhes completos
              </Link>
            </div>
          </>
        ) : (
          <div className="py-16 text-center text-sm text-[var(--color-text-secondary)]">
            Seleciona um pedido na tabela para ver detalhes aqui.
          </div>
        )}
      </div>
    </aside>
  );
}

type SharedViewProps = {
  requiredModule: AdminModule;
  title: string;
  eyebrow: string;
  subtitle: string;
  filters: OrdersFilterState;
  orders: { content: AdminOrderListItem[]; page: number; totalPages: number; totalElements: number } | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string;
  notice: string;
  selectedOrder: AdminOrderListItem | null;
  onSelectOrder: (id: number | null) => void;
  shouldFocusAction: boolean;
  onActionFocused: () => void;
  setFilter: <K extends keyof OrdersFilterState>(key: K, value: OrdersFilterState[K]) => void;
  setSearch: (value: string) => void;
  setPage: (page: number) => void;
  refresh: () => void;
  handleExport: () => Promise<void>;
  statValues: Record<(typeof STATUS_CARDS)[number]["key"], number>;
  showStatusCards: boolean;
  showExternalCreate: boolean;
  lockedType?: OrdersFilterState["type"] | null;
  drawerMode?: "orders" | "delivery";
  operationalContext: OperationalContext;
};

function SharedOrdersView({
  requiredModule,
  title,
  eyebrow,
  subtitle,
  filters,
  orders,
  isLoading,
  isRefreshing,
  error,
  notice,
  selectedOrder,
  onSelectOrder,
  shouldFocusAction,
  onActionFocused,
  setFilter,
  setSearch,
  setPage,
  refresh,
  handleExport,
  statValues,
  showStatusCards,
  showExternalCreate,
  lockedType = null,
  drawerMode = "orders",
  operationalContext,
}: SharedViewProps) {
  const { hasAccess } = useAdminAuth();
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const sortedOrders = useMemo(
    () => orders
      ? { ...orders, content: sortOperationalQueue(orders.content, operationalContext) }
      : null,
    [operationalContext, orders]
  );

  if (!hasAccess(requiredModule)) {
    return null;
  }

  return (
    <div className="space-y-6">
      <section className="sticky top-[88px] z-10 rounded-[28px] border border-[var(--color-border)] bg-[color:var(--color-surface-overlay)]/95 px-6 py-5 backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-danger)]">
              {eyebrow}
            </p>
            <h1 className="mt-2 font-[family-name:var(--font-sora)] text-3xl font-semibold text-[var(--color-text-primary)]">
              {title}
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => void handleExport()} className="admin-button-muted">
              Exportar CSV
            </button>
            {showExternalCreate ? (
              <Link href="/admin/orders/external/new" className="admin-button-danger">
                Novo pedido externo
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {error ? <AdminBanner message={error} tone="error" /> : null}

      {notice ? <AdminBanner message={notice} tone="success" /> : null}
      {feedback ? <AdminBanner message={feedback.message} tone={feedback.tone} /> : null}

      {showStatusCards ? (
        <section className="grid gap-4 xl:grid-cols-5">
          {STATUS_CARDS.map((card) => {
            const active = filters.status === card.key;
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => setFilter("status", card.key)}
                className={`admin-card p-5 text-left transition ${active ? "border-[#E8431A] bg-[#FFF0EC]" : ""}`}
              >
                <p className="text-sm text-[var(--color-text-secondary)]">{card.label}</p>
                <strong className="mt-3 block font-[family-name:var(--font-sora)] text-3xl text-[var(--color-text-primary)]">
                  {statValues[card.key]}
                </strong>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{card.subtitle}</p>
              </button>
            );
          })}
        </section>
      ) : null}

      <section className="admin-card p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-2">
              {TYPE_FILTERS.map((item) => {
                const disabled = lockedType !== null && lockedType !== item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    disabled={disabled}
                    onClick={() => setFilter("type", item.key)}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      filters.type === item.key
                        ? "bg-[var(--color-danger)] text-white"
                        : "bg-[var(--color-background-tertiary)] text-[var(--color-text-secondary)]"
                    } ${disabled ? "opacity-40" : ""}`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            <span className="hidden h-8 w-px bg-[var(--color-border)] xl:block" />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setFilter("period", "ALL")}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  filters.period === "ALL"
                    ? "bg-[var(--color-danger)] text-white"
                    : "bg-[var(--color-background-tertiary)] text-[var(--color-text-secondary)]"
                }`}
              >
                Tudo
              </button>
              {PERIOD_FILTERS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter("period", item.key)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    filters.period === item.key
                      ? "bg-[var(--color-danger)] text-white"
                      : "bg-[var(--color-background-tertiary)] text-[var(--color-text-secondary)]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            {isRefreshing ? <AdminSpinner label="A actualizar dados..." /> : null}
            <label className="relative block">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[var(--color-text-secondary)]">
                🔍
              </span>
              <input
                value={filters.search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Pesquisar por ID, cliente ou loja"
                className="admin-input min-w-[280px] pl-11"
              />
            </label>
            <input
              type="date"
              value={filters.date}
              onChange={(event) => setFilter("date", event.target.value)}
              className="admin-input min-w-[180px]"
            />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="admin-card relative overflow-hidden" aria-busy={isLoading}>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-[var(--color-background-tertiary)] text-left text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
                <tr>
                  {["Numero do pedido", "Cliente", "Tipo", "Valor em MZN", "Status operacional", "Fila", "Proxima acao", "Prioridade", "Data", "Accao"].map((heading) => (
                    <th key={heading} className="px-6 py-4 font-medium">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedOrders?.content.map((order) => {
                  const needsAttention = isActionRequired(order, operationalContext);
                  return (
                  <tr
                    key={order.id}
                    onClick={() => onSelectOrder(order.id)}
                    className={`cursor-pointer border-b border-[var(--color-border)] transition hover:bg-[var(--color-background-tertiary)] ${needsAttention ? "bg-[rgba(249,115,22,0.035)]" : ""}`}
                  >
                    <td className="px-6 py-4 font-[family-name:var(--font-sora)] text-base font-semibold text-[var(--color-text-primary)]">
                      <span className="inline-flex items-center gap-2">
                        {needsAttention ? <AttentionDot label="Pedido ainda precisa de acao" /> : null}
                        {order.number}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(232,67,26,0.1)] text-sm font-semibold text-[var(--color-danger)]">
                          {order.customerInitials}
                        </div>
                        <div>
                          <p className="font-medium text-[var(--color-text-primary)]">{order.customer}</p>
                          <p className="text-sm text-[var(--color-text-secondary)]">
                            {order.customerEmail || order.sourceStore}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4"><TypeBadge type={order.type} /></td>
                    <td className="px-6 py-4 font-[family-name:var(--font-sora)] text-base font-semibold">
                      {formatMoney(order.totalAmount)}
                    </td>
                    <td className="px-6 py-4"><OperationalStatusBadge order={order} /></td>
                    <td className="px-6 py-4"><QueueBadge queueStatus={order.queueStatus} /></td>
                    <td className="px-6 py-4">
                      <span
                        title={order.actionReason || order.nextActionLabel || "Sem acao pendente"}
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                          order.actionRequired
                            ? "bg-[#FFF1D6] text-[#9A5B00]"
                            : "bg-[var(--color-background-tertiary)] text-[var(--color-text-secondary)]"
                        }`}
                      >
                        {order.nextActionLabel || "Sem acao"}
                      </span>
                    </td>
                    <td className="px-6 py-4"><PriorityBadge priority={order.priority} label={order.priorityLabel} /></td>
                    <td className="px-6 py-4 text-sm text-[var(--color-text-secondary)]">{formatDate(order.createdAt)}</td>
                    <td className="px-6 py-4 text-sm font-medium text-[var(--color-danger)]">Ver →</td>
                  </tr>
                  );
                })}
                {!sortedOrders?.content.length && !isLoading ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-8">
                      <AdminStateCard
                        title="Sem pedidos nesta vista"
                        message="Ajuste os filtros ou pesquise outro cliente, loja ou periodo para continuar."
                        compact
                      />
                    </td>
                  </tr>
                ) : null}
                {isLoading && !sortedOrders?.content.length ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-8">
                      <div className="space-y-4">
                        <AdminStateCard
                          title="A carregar pedidos"
                          message="Estamos a actualizar filas, estatisticas e proximas accoes desta operacao."
                          tone="loading"
                          compact
                        />
                        <AdminTableSkeleton columns={5} rows={3} />
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-[var(--color-border)] px-6 py-4 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-[var(--color-text-secondary)]">
              Pagina {(sortedOrders?.page ?? 0) + 1} de {sortedOrders?.totalPages ?? 1}
            </p>
            <div className="flex items-center gap-2">
              {Array.from({ length: sortedOrders?.totalPages ?? 1 }).map((_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setPage(index)}
                  disabled={isLoading}
                  className={`h-10 min-w-10 rounded-full px-3 text-sm font-medium transition ${
                    (sortedOrders?.page ?? 0) === index
                      ? "bg-[var(--color-danger)] text-white"
                      : "bg-[var(--color-background-tertiary)] text-[var(--color-text-secondary)]"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          </div>
          <AdminListLoadingOverlay
            visible={isLoading && Boolean(sortedOrders?.content.length)}
            title="A carregar pedidos"
            message="Estamos a buscar a pagina selecionada."
          />
        </section>

        <OrdersDrawer
          order={selectedOrder}
          onClose={() => onSelectOrder(null)}
          onActionComplete={refresh}
          shouldFocusAction={shouldFocusAction}
          onActionFocused={onActionFocused}
          mode={drawerMode}
          onFeedback={setFeedback}
        />
      </div>
    </div>
  );
}

function buildExport(params: URLSearchParams, filename: string) {
  return async () => {
    const response = await fetch(`/api/admin/orders/export?${params.toString()}`, {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Nao foi possivel exportar CSV.");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };
}

function buildStatValues(stats: OrdersStatsResponse | null) {
  return {
    ALL: stats?.total ?? 0,
    ANALYSIS: stats?.analysis ?? 0,
    PAYMENT: stats?.payment ?? 0,
    EXECUTION: stats?.execution ?? 0,
    COMPLETED: stats?.completed ?? 0,
  };
}

function filterDeliveryOrders(
  orders: { content: AdminOrderListItem[]; page: number; totalPages: number; totalElements: number } | null
) {
  if (!orders) {
    return null;
  }

  const content = orders.content.filter((item) => {
    const status = getOperationalStatus(item);

    if (item.type === "INTERNAL") {
      return item.queueStatus === "DELIVERY" && item.deliveryMethod !== "STORE_PICKUP";
    }
    // External orders only enter delivery after the order team marks them as arrived at the company.
    return item.type === "EXTERNAL" && (status === "ARRIVED" || status === "OUT_FOR_DELIVERY");
  });

  return {
    ...orders,
    content,
    page: 0,
    totalElements: content.length,
    totalPages: 1,
  };
}

export function OrdersManagementView() {
  const { hasAccess } = useAdminAuth();
  const { filters, orders, stats, isLoading, isRefreshing, error, setFilter, setSearch, setPage, refresh } =
    useOrders();
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [shouldFocusAction, setShouldFocusAction] = useState(false);
  const [notice] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }

    const storedNotice = window.sessionStorage.getItem("admin_orders_notice") || "";
    if (storedNotice) {
      window.sessionStorage.removeItem("admin_orders_notice");
    }
    return storedNotice;
  });

  const selectedOrder = useMemo(
    () => orders?.content.find((item) => item.id === selectedOrderId) ?? null,
    [orders, selectedOrderId]
  );

  if (!hasAccess("orders")) {
    return null;
  }

  return (
    <SharedOrdersView
      requiredModule="orders"
      title="Centro de pedidos"
      eyebrow="Operacoes"
      subtitle={`${orders?.totalElements ?? 0} pedido(s) em filas de analise, pagamento ou execucao`}
      filters={filters}
      orders={orders}
      isLoading={isLoading}
      isRefreshing={isRefreshing}
      error={error}
      notice={notice}
      selectedOrder={selectedOrder}
      onSelectOrder={(id) => {
        setSelectedOrderId(id);
        setShouldFocusAction(id !== null);
      }}
      shouldFocusAction={shouldFocusAction}
      onActionFocused={() => setShouldFocusAction(false)}
      setFilter={setFilter}
      setSearch={setSearch}
      setPage={setPage}
      refresh={refresh}
      handleExport={buildExport(
        new URLSearchParams({
          status: filters.status,
          type: filters.type,
          period: filters.period,
          search: filters.search,
          date: filters.date,
        }),
        "orders-export.csv"
      )}
      statValues={buildStatValues(stats)}
      showStatusCards
      showExternalCreate
      drawerMode="orders"
      operationalContext="ORDERS"
    />
  );
}

export function ExternalQuotesView() {
  const { hasAccess } = useAdminAuth();
  const { filters, orders, stats, isLoading, isRefreshing, error, setFilter, setSearch, setPage, refresh } =
    useOrders({ status: "ANALYSIS", type: "EXTERNAL" });
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [shouldFocusAction, setShouldFocusAction] = useState(false);

  const selectedOrder = useMemo(
    () => orders?.content.find((item) => item.id === selectedOrderId) ?? null,
    [orders, selectedOrderId]
  );

  if (!hasAccess("quotes")) {
    return null;
  }

  return (
    <SharedOrdersView
      requiredModule="quotes"
      title="Compras internacionais"
      eyebrow="Analise e proposta"
      subtitle={`${orders?.totalElements ?? 0} pedido(s) externos para cotar ou acompanhar proposta`}
      filters={filters}
      orders={orders}
      isLoading={isLoading}
      isRefreshing={isRefreshing}
      error={error}
      notice=""
      selectedOrder={selectedOrder}
      onSelectOrder={(id) => {
        setSelectedOrderId(id);
        setShouldFocusAction(id !== null);
      }}
      shouldFocusAction={shouldFocusAction}
      onActionFocused={() => setShouldFocusAction(false)}
      setFilter={setFilter}
      setSearch={setSearch}
      setPage={setPage}
      refresh={refresh}
      handleExport={buildExport(
        new URLSearchParams({
          status: filters.status,
          type: "EXTERNAL",
          period: filters.period,
          search: filters.search,
          date: filters.date,
        }),
        "external-quotes.csv"
      )}
      statValues={buildStatValues(stats)}
      showStatusCards={false}
      showExternalCreate
      lockedType="EXTERNAL"
      drawerMode="orders"
      operationalContext="QUOTES"
    />
  );
}

export function PaymentsQueueView() {
  const { hasAccess } = useAdminAuth();
  const { filters, orders, stats, isLoading, isRefreshing, error, setFilter, setSearch, setPage, refresh } =
    useOrders({ status: "PAYMENT" });
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [shouldFocusAction, setShouldFocusAction] = useState(false);

  const paymentOrders = useMemo(
    () =>
      orders
        ? {
            ...orders,
            content: orders.content.filter(
              (item) => item.queueStatus === "PAYMENT" || item.uiStatus === "PAID"
            ),
          }
        : null,
    [orders]
  );

  const selectedOrder = useMemo(
    () => paymentOrders?.content.find((item) => item.id === selectedOrderId) ?? null,
    [paymentOrders, selectedOrderId]
  );

  if (!hasAccess("payments")) {
    return null;
  }

  return (
    <SharedOrdersView
      requiredModule="payments"
      title="Pagamentos"
      eyebrow="Validacoes"
      subtitle={`${paymentOrders?.content.length ?? 0} pedido(s) a aguardar comprovativo, validacao ou confirmacao`}
      filters={filters}
      orders={paymentOrders}
      isLoading={isLoading}
      isRefreshing={isRefreshing}
      error={error}
      notice=""
      selectedOrder={selectedOrder}
      onSelectOrder={(id) => {
        setSelectedOrderId(id);
        setShouldFocusAction(id !== null);
      }}
      shouldFocusAction={shouldFocusAction}
      onActionFocused={() => setShouldFocusAction(false)}
      setFilter={setFilter}
      setSearch={setSearch}
      setPage={setPage}
      refresh={refresh}
      handleExport={buildExport(
        new URLSearchParams({
          status: filters.status,
          type: filters.type,
          period: filters.period,
          search: filters.search,
          date: filters.date,
        }),
        "payments-queue.csv"
      )}
      statValues={buildStatValues(stats)}
      showStatusCards={false}
      showExternalCreate={false}
      drawerMode="orders"
      operationalContext="PAYMENTS"
    />
  );
}

export function DeliveryManagementView() {
  const { hasAccess } = useAdminAuth();
  const { filters, orders, isLoading, isRefreshing, error, setFilter, setSearch, setPage, refresh } =
    useOrders({ status: "DELIVERY", size: 250 });
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [shouldFocusAction, setShouldFocusAction] = useState(false);

  const deliveryOrders = useMemo(() => filterDeliveryOrders(orders), [orders]);
  const selectedOrder = useMemo(
    () => deliveryOrders?.content.find((item) => item.id === selectedOrderId) ?? null,
    [deliveryOrders, selectedOrderId]
  );

  if (!hasAccess("delivery")) {
    return null;
  }

  return (
    <SharedOrdersView
      requiredModule="delivery"
      title="Delivery"
      eyebrow="Operacao de entrega"
      subtitle={`${deliveryOrders?.content.length ?? 0} pedido(s) em expedicao, entrega ou fecho final`}
      filters={filters}
      orders={deliveryOrders}
      isLoading={isLoading}
      isRefreshing={isRefreshing}
      error={error}
      notice=""
      selectedOrder={selectedOrder}
      onSelectOrder={(id) => {
        setSelectedOrderId(id);
        setShouldFocusAction(id !== null);
      }}
      shouldFocusAction={shouldFocusAction}
      onActionFocused={() => setShouldFocusAction(false)}
      setFilter={setFilter}
      setSearch={setSearch}
      setPage={setPage}
      refresh={refresh}
      handleExport={buildExport(
        new URLSearchParams({
          status: filters.status,
          type: filters.type,
          period: filters.period,
          search: filters.search,
          date: filters.date,
        }),
        "delivery-operations.csv"
      )}
      statValues={buildStatValues(null)}
      showStatusCards={false}
      showExternalCreate={false}
      drawerMode="delivery"
      operationalContext="DELIVERY"
    />
  );
}
