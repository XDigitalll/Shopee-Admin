"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { AttentionDot } from "@/components/admin/attention-dot";
import { ActionError, AdminBanner, AdminListLoadingOverlay, AdminSpinner, AdminStateCard, AdminTableSkeleton, ProcessingOverlay } from "@/components/admin/feedback-state";
import { WhatsAppPhone } from "@/components/admin/whatsapp-link";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useOrders } from "@/hooks/useOrders";
import { adminApiFetch } from "@/lib/admin/api-client";
import { formatDate, formatMoney, humanizeOrderStatus, humanizePaymentMethod } from "@/lib/admin/format";
import { getOrderActionHint, getPrimaryOrderAction, type AdminOrderAction } from "@/lib/admin/order-actions";
import { buildOrderWhatsAppMessage } from "@/lib/admin/whatsapp";
import type { OrderQueueStatus } from "@/lib/admin/order-status";
import { isActionRequired, sortOperationalQueue, type OperationalContext } from "@/lib/admin/operational-queue";
import type { AdminModule } from "@/lib/admin/roles";
import type { AdminOrderListItem, OrdersFilterState, OrdersStatsResponse } from "@/lib/admin/types";

type DrawerAction = AdminOrderAction;

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
  return ["SUCCESS", "COD_COLLECTED"].includes(String(status ?? ""));
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

function hasAllowedAction(order: AdminOrderListItem | null, action: string) {
  return Boolean(order?.allowedActions?.includes(action));
}

function getOperationalStatus(order: AdminOrderListItem | null) {
  return String(order?.orderStatus || order?.fulfillmentStatus || order?.status || "");
}

function paymentQueueForOrder(status: string) {
  if (status === "PAYMENT_UNDER_REVIEW") return "UNDER_REVIEW";
  if (status === "PAYMENT_REJECTED") return "REJECTED";
  if (status === "PAYMENT_SUBMITTED") return "SUBMITTED";
  return "AWAITING_SUBMISSION";
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

function OrderMobileCard({
  order,
  onSelect,
  operationalContext,
}: {
  order: AdminOrderListItem;
  onSelect: (id: number) => void;
  operationalContext: OperationalContext;
}) {
  const needsAttention = isActionRequired(order, operationalContext);

  return (
    <article
      className={`admin-card p-4 ${needsAttention ? "ring-1 ring-[rgba(249,115,22,0.2)]" : ""}`}
      onClick={() => onSelect(order.id)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 font-[family-name:var(--font-sora)] text-base font-semibold">
            {needsAttention ? <AttentionDot label="Pedido ainda precisa de acao" /> : null}
            {order.number}
          </p>
          <p className="mt-1 truncate text-sm font-medium text-[var(--color-text-primary)]">{order.customer}</p>
          <p className="truncate text-xs text-[var(--color-text-secondary)]">{order.customerEmail || order.sourceStore}</p>
        </div>
        <TypeBadge type={order.type} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">Estado</p>
          <div className="mt-1"><OperationalStatusBadge order={order} /></div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">Valor</p>
          <p className="mt-1 font-[family-name:var(--font-sora)] font-semibold">{formatMoney(order.totalAmount)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">Fila</p>
          <div className="mt-1"><QueueBadge queueStatus={order.queueStatus} /></div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">Data</p>
          <p className="mt-1 text-[var(--color-text-secondary)]">{formatDate(order.createdAt)}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <button type="button" className="admin-button-danger" onClick={(event) => { event.stopPropagation(); onSelect(order.id); }}>
          Abrir pedido
        </button>
        {order.customerPhone ? (
          <WhatsAppPhone
            phone={order.customerPhone}
            message={buildOrderWhatsAppMessage(order.number)}
            stopPropagation
            className="admin-button-muted"
          />
        ) : null}
      </div>
    </article>
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
  const { profile } = useAdminAuth();
  const actionRunner = useAsyncAction({
    onError: (message) => onFeedback({ message, tone: "error" }),
  });
  const isPending = actionRunner.isRunning;
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [purchaseProofFile, setPurchaseProofFile] = useState<File | null>(null);
  const [purchaseSupplierReference, setPurchaseSupplierReference] = useState("");
  const [purchaseModalError, setPurchaseModalError] = useState("");
  const actionRegionRef = useRef<HTMLDivElement | null>(null);
  const paymentValidated = isPaymentValidated(order?.paymentStatus ?? null);
  const cashOnDelivery = isCashOnDelivery(order);
  const backendTrackingSteps = order?.trackingDetailSteps ?? [];
  const orderWhatsAppMessage = order ? buildOrderWhatsAppMessage(order.number) : "";

  function primaryAction(orderItem: AdminOrderListItem | null): DrawerAction | null {
    if (!orderItem) return null;
    return getPrimaryOrderAction(orderItem, profile, { surface: "list", mode }) as DrawerAction | null;
  }

  const action = primaryAction(order);
  const actionHint = getOrderActionHint(order);

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

  async function handleOrderAdvance(targetStatus: "ORDERED" | "IN_TRANSIT" | "ARRIVED" | "READY_FOR_DELIVERY" | "OUT_FOR_DELIVERY" | "DELIVERED") {
    if (!order) return;

    await actionRunner.run(async () => {
      await adminApiFetch(`/api/admin/orders/${order.id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: targetStatus }),
      });
      onActionComplete();
    });
  }

  async function handlePaymentValidation() {
    if (!order) return;

    await actionRunner.run(async () => {
      window.location.assign(`/admin/payments?orderId=${order.id}`);
    });
  }

  async function handlePrepareProduct() {
    if (!order) return;

    await actionRunner.run(async () => {
      await adminApiFetch(`/api/admin/orders/${order.id}/advance`, {
        method: "PATCH",
      });
      onFeedback({ message: "Produto em preparação.", tone: "success" });
      onActionComplete();
    });
  }

  async function handleMarkReadyForDelivery() {
    if (!order) return;

    if (order.type === "EXTERNAL") {
      await handleOrderAdvance("READY_FOR_DELIVERY");
      return;
    }

    await actionRunner.run(async () => {
      await adminApiFetch(`/api/admin/orders/${order.id}/mark-ready-for-delivery`, {
        method: "PATCH",
      });
      onFeedback({ message: order.deliveryMethod === "STORE_PICKUP" ? "Pedido marcado como pronto para levantamento." : "Pedido marcado como pronto para entrega.", tone: "success" });
      onActionComplete();
    });
  }

  function resetPurchaseModal() {
    setPurchaseProofFile(null);
    setPurchaseSupplierReference("");
    setPurchaseModalError("");
  }

  function selectPurchaseProofFile(file: File | null) {
    setPurchaseModalError("");
    if (!file) {
      setPurchaseProofFile(null);
      return;
    }

    const allowed = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
    if (!allowed.includes(file.type)) {
      setPurchaseModalError("Envia uma imagem ou PDF do comprovativo.");
      setPurchaseProofFile(null);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setPurchaseModalError("O ficheiro deve ter no maximo 10MB.");
      setPurchaseProofFile(null);
      return;
    }

    setPurchaseProofFile(file);
  }

  async function submitPurchaseConfirmation({ skipProof }: { skipProof: boolean }) {
    if (!order) return;

    if (skipProof) {
      const confirmed = window.confirm("Tens certeza que queres marcar como comprado sem comprovativo?");
      if (!confirmed) return;
    }

    await actionRunner.run(async () => {
      if (purchaseProofFile && !skipProof) {
        const formData = new FormData();
        formData.append("file", purchaseProofFile);
        formData.append("supplierName", "Fornecedor");
        formData.append("skipProof", "false");
        if (purchaseSupplierReference.trim()) {
          formData.append("supplierOrderReference", purchaseSupplierReference.trim());
        }

        await adminApiFetch(`/api/admin/orders/${order.id}/purchase-confirmation`, {
          method: "POST",
          body: formData,
        });
      } else {
        await adminApiFetch(`/api/admin/orders/${order.id}/purchase-confirmation`, {
          method: "POST",
          body: JSON.stringify({
            skipProof: true,
            supplierName: "Fornecedor",
            supplierOrderReference: purchaseSupplierReference.trim() || null,
          }),
        });
      }

      setPurchaseModalOpen(false);
      resetPurchaseModal();
      onFeedback({ message: "Pedido marcado como comprado.", tone: "success" });
      onActionComplete();
    });
  }

  async function handleMarkInTransit() {
    if (!order) return;

    await actionRunner.run(async () => {
      await adminApiFetch(`/api/admin/orders/${order.id}/mark-in-transit`, {
        method: "PATCH",
      });
      onFeedback({ message: "Pedido marcado como em trânsito internacional.", tone: "success" });
      onActionComplete();
    });
  }

  async function handleMarkArrived() {
    if (!order) return;

    await actionRunner.run(async () => {
      await adminApiFetch(`/api/admin/orders/${order.id}/mark-arrived`, {
        method: "PATCH",
      });
      onFeedback({ message: "Pedido marcado como chegado a sede.", tone: "success" });
      onActionComplete();
    });
  }

  async function handleCollectAndClose(_targetStatus: "DELIVERED") {
    if (!order) return;

    await actionRunner.run(async () => {
      if (order.type === "INTERNAL" && order.paymentMethod === "CASH_ON_DELIVERY") {
        const amountCollected = Number(order.remainingAmountOnDelivery ?? order.totalAmount ?? 0);
        await adminApiFetch(`/api/admin/orders/${order.id}/cod/confirm-cash-collected`, {
          method: "PATCH",
          body: JSON.stringify({
            amountCollected,
            collectorRole: "ADMIN",
            note: "Confirmado no admin.",
            deliveryConfirmation: "Confirmado no admin.",
          }),
        });
        onFeedback({ message: "COD recebido e pedido entregue.", tone: "success" });
        onActionComplete();
        return;
      }

      window.location.assign(`/admin/payments?orderId=${order.id}`);
    });
  }

  async function handleHandoff(targetQueue: "PAYMENTS" | "QUOTES" | "DELIVERY" | "EXECUTION" | "SUPPORT") {
    if (!order) return;

    await actionRunner.run(async () => {
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
    });
  }

  return (
    <>
      {purchaseModalOpen && order ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 px-4 pb-4 pt-6 sm:items-center sm:pb-6"
          onClick={(event) => {
            if (event.target === event.currentTarget && !isPending) {
              setPurchaseModalOpen(false);
              resetPurchaseModal();
            }
          }}
        >
          <div className="w-full max-w-xl rounded-[28px] border border-white/10 bg-[#0d1627] p-6 shadow-2xl">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-400">Compra no fornecedor</p>
              <h2 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold text-white">
                Confirmar compra no fornecedor
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/60">
                Anexa o comprovativo da compra, recibo ou screenshot do fornecedor. Isto ajuda a provar que o pedido ja foi comprado.
              </p>
            </div>

            <div className="mt-5 rounded-[20px] border border-dashed border-white/15 bg-white/[0.04] p-5">
              <input
                id={`purchase-proof-${order.id}`}
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                className="sr-only"
                onChange={(event) => selectPurchaseProofFile(event.target.files?.[0] ?? null)}
              />
              <label htmlFor={`purchase-proof-${order.id}`} className="block cursor-pointer">
                <span className="block text-sm font-semibold text-white/85">Comprovativo da compra</span>
                <span className="mt-1 block text-sm text-white/45">
                  Podes anexar agora ou saltar e adicionar depois.
                </span>
                <span className="mt-4 inline-flex rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80">
                  {purchaseProofFile ? purchaseProofFile.name : "Selecionar ficheiro"}
                </span>
              </label>
              <p className="mt-3 text-xs text-white/35">JPEG, PNG, WebP ou PDF. Maximo 10MB.</p>
            </div>

            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-semibold text-white/80">
                Referencia da compra / numero do pedido no fornecedor
              </span>
              <input
                value={purchaseSupplierReference}
                onChange={(event) => setPurchaseSupplierReference(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-orange-500/60 focus:ring-1 focus:ring-orange-500/30"
                placeholder="Ex: SHEIN 123456, AliExpress 98765..."
              />
            </label>

            {purchaseModalError || actionRunner.error ? (
              <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {purchaseModalError || actionRunner.error}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  if (!isPending) {
                    setPurchaseModalOpen(false);
                    resetPurchaseModal();
                  }
                }}
                disabled={isPending}
                className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void submitPurchaseConfirmation({ skipProof: true })}
                disabled={isPending}
                className="rounded-xl border border-orange-400/25 bg-orange-400/10 px-5 py-2.5 text-sm font-semibold text-orange-100 transition-colors hover:bg-orange-400/15 disabled:opacity-40"
              >
                Saltar por agora
              </button>
              <button
                type="button"
                onClick={() => void submitPurchaseConfirmation({ skipProof: false })}
                disabled={isPending || !purchaseProofFile}
                className="rounded-xl bg-orange-600 px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-orange-500 disabled:opacity-40"
              >
                {isPending ? "A confirmar..." : "Confirmar compra"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <aside className="sticky top-[132px] w-full shrink-0 self-start xl:w-[320px]">
      <div className="admin-card relative p-5">
        <ProcessingOverlay visible={isPending} />
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
                disabled={isPending}
                className="rounded-full border border-[var(--color-border)] px-3 py-1 text-sm text-[var(--color-text-secondary)]"
              >
                ×
              </button>
            </div>

            <dl className="space-y-3 text-sm">
              {[ 
                ["Cliente", order.customer],
                ["Telefone", order.customerPhone || ""],
                ["Tipo", order.type === "EXTERNAL" ? "Externo" : "Interno"],
                ["Loja de origem", order.sourceStore],
                ["Valor", formatMoney(order.totalAmount)],
                ["Fila", humanizeOrderStatus(order.queueStatus)],
                ["Status operacional", order.operationalStatusLabel || humanizeOrderStatus(getOperationalStatus(order))],
                ["Estado do cliente", order.customerDisplayStatus || order.customerStatusLabel || humanizeOrderStatus(order.customerStage)],
                ["Data", formatDate(order.createdAt)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] pb-3">
                  <dt className="text-[var(--color-text-secondary)]">{label}</dt>
                  <dd className="text-right font-medium text-[var(--color-text-primary)]">
                    {label === "Telefone" ? (
                      <WhatsAppPhone phone={order.customerPhone} message={orderWhatsAppMessage} className="justify-end" />
                    ) : (
                      value
                    )}
                  </dd>
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
                    <strong>{order.paymentDisplayStatus ?? (paymentValidated ? "Confirmado" : cashOnDelivery ? "Pagamento na entrega - pendente" : "Pendente")}</strong>
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
                {backendTrackingSteps.map((step, index) => {
                  const done = step.state === "COMPLETED";
                  const active = step.state === "CURRENT";
                  const failed = step.state === "FAILED";

                  return (
                    <div key={step.key} className="flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        <span
                          className="flex h-4 w-4 items-center justify-center rounded-full border-2"
                          style={{
                            borderColor: done || active ? "#E8431A" : failed ? "#B42318" : "var(--color-border-strong)",
                            backgroundColor: done ? "#E8431A" : failed ? "#B42318" : "transparent",
                          }}
                        >
                          {active ? <span className="h-2 w-2 rounded-full" style={{ background: "#E8431A" }} /> : null}
                          {failed && !active ? <span className="text-[9px] text-white">✕</span> : null}
                        </span>
                        {index < backendTrackingSteps.length - 1 ? (
                          <span className="mt-1 h-6 w-px" style={{ backgroundColor: done ? "#E8431A" : "var(--color-border-strong)" }} />
                        ) : null}
                      </div>
                      <span className={`text-sm ${active || failed ? "font-semibold text-[var(--color-text-primary)]" : done ? "text-[var(--color-text-secondary)]" : "text-[var(--color-text-tertiary,var(--color-text-secondary))]"}`}>
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div ref={actionRegionRef} className="mt-6 flex flex-col gap-3">
              <ActionError message={actionRunner.error} />
              {action ? (
                "href" in action ? (
                  <Link
                    href={action.href}
                    data-auto-focus-action="true"
                    aria-disabled={isPending}
                    onClick={(event) => {
                      if (isPending) {
                        event.preventDefault();
                      }
                    }}
                    className={`admin-button-danger justify-center ${isPending ? "pointer-events-none opacity-60" : ""}`}
                  >
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

                      if (action.action === "advance-order") {
                        void handlePrepareProduct();
                        return;
                      }

                      if (action.action === "mark-ready-for-delivery") {
                        void handleMarkReadyForDelivery();
                        return;
                      }

                      if (action.action === "mark-purchased") {
                        resetPurchaseModal();
                        setPurchaseModalOpen(true);
                        return;
                      }

                      if (action.action === "mark-in-transit") {
                        void handleMarkInTransit();
                        return;
                      }

                      if (action.action === "mark-arrived") {
                        void handleMarkArrived();
                        return;
                      }

                      if (action.targetStatus) {
                        void handleOrderAdvance(action.targetStatus);
                      }
                    }}
                    disabled={isPending}
                    className="admin-button-danger justify-center"
                  >
                    {isPending ? <AdminSpinner label="A processar..." /> : action.label}
                  </button>
                )
              ) : null}

              {!action && actionHint ? (
                <p className="rounded-2xl border border-[#BAE6FD] bg-[#F0F9FF] px-4 py-3 text-xs font-medium text-[#0C4A6E]">
                  {actionHint}
                </p>
              ) : null}

              {mode === "delivery" && cashOnDelivery && !paymentValidated && getOperationalStatus(order) !== "OUT_FOR_DELIVERY" && !isPickupOrder(order) ? (
                <button
                  type="button"
                  onClick={() => void handlePaymentValidation()}
                  disabled={isPending}
                  className="admin-button-muted justify-center"
                >
                  {isPending ? <AdminSpinner label="A processar..." /> : "Confirmar cobrança na entrega"}
                </button>
              ) : null}

              <Link
                href={`/admin/orders/${order.id}`}
                data-auto-focus-action={!action ? "true" : undefined}
                aria-disabled={isPending}
                onClick={(event) => {
                  if (isPending) {
                    event.preventDefault();
                  }
                }}
                className={`admin-button-muted justify-center ${isPending ? "pointer-events-none opacity-60" : ""}`}
              >
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
    </>
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

      {error ? (
        <div className="admin-card flex flex-col gap-3 border-[#FCA5A5] bg-[#FEF2F2] p-4 text-[#7F1D1D] sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold">{error}</p>
          <button type="button" onClick={refresh} className="admin-button-muted justify-center">
            Tentar novamente
          </button>
        </div>
      ) : null}

      {notice ? <AdminBanner message={notice} tone="success" /> : null}
      {feedback ? <AdminBanner message={feedback.message} tone={feedback.tone} /> : null}

      {showStatusCards ? (
        <section className="admin-responsive-grid">
          {STATUS_CARDS.map((card) => {
            const active = filters.status === card.key;
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => setFilter("status", card.key)}
                aria-pressed={active}
                className={[
                  "admin-card relative overflow-hidden p-5 text-left transition",
                  active
                    ? "border-[#E8431A] bg-[rgba(232,67,26,0.10)] shadow-[0_0_0_1px_rgba(232,67,26,0.38),0_18px_45px_rgba(232,67,26,0.12)]"
                    : "hover:border-[rgba(232,67,26,0.35)] hover:bg-white/[0.03]",
                ].join(" ")}
              >
                {active ? (
                  <span className="absolute inset-x-0 top-0 h-1 bg-[#E8431A]" />
                ) : null}
                <p className={`text-sm ${active ? "text-[#FFB39F]" : "text-[var(--color-text-secondary)]"}`}>{card.label}</p>
                <strong className={`mt-3 block font-[family-name:var(--font-sora)] text-3xl ${active ? "text-white" : "text-[var(--color-text-primary)]"}`}>
                  {statValues[card.key]}
                </strong>
                <p className={`mt-2 text-sm ${active ? "text-white/80" : "text-[var(--color-text-secondary)]"}`}>{card.subtitle}</p>
              </button>
            );
          })}
        </section>
      ) : null}

      <section className="admin-card p-4 sm:p-5">
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
                className="admin-input min-w-0 pl-11 md:min-w-[280px]"
              />
            </label>
            <input
              type="date"
              value={filters.date}
              onChange={(event) => setFilter("date", event.target.value)}
              className="admin-input min-w-0 md:min-w-[180px]"
            />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="admin-card relative overflow-hidden" aria-busy={isLoading}>
          <div className="admin-mobile-card-list p-3">
            {sortedOrders?.content.map((order) => (
              <OrderMobileCard
                key={order.id}
                order={order}
                onSelect={onSelectOrder}
                operationalContext={operationalContext}
              />
            ))}
            {!sortedOrders?.content.length && !isLoading ? (
              <AdminStateCard
                title="Sem pedidos nesta vista"
                message="Ajuste os filtros ou pesquise outro cliente, loja ou periodo para continuar."
                compact
              />
            ) : null}
            {isLoading && !sortedOrders?.content.length ? (
              <AdminStateCard
                title="A carregar pedidos"
                message="Estamos a actualizar filas, estatisticas e proximas accoes desta operacao."
                tone="loading"
                compact
              />
            ) : null}
          </div>

          <div className="admin-desktop-table admin-table-scroll">
            <table className="admin-orders-table min-w-full">
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
                          {order.customerPhone ? (
                            <WhatsAppPhone
                              phone={order.customerPhone}
                              message={buildOrderWhatsAppMessage(order.number)}
                              stopPropagation
                              className="text-xs text-[var(--color-text-secondary)]"
                            />
                          ) : null}
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

          <div className="flex flex-col gap-3 border-t border-[var(--color-border)] px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-[var(--color-text-secondary)]">
              Pagina {(sortedOrders?.page ?? 0) + 1} de {sortedOrders?.totalPages ?? 1}
            </p>
            <div className="hidden items-center gap-2 sm:flex">
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
            <div className="grid grid-cols-2 gap-2 sm:hidden">
              <button
                type="button"
                onClick={() => setPage(Math.max(0, (sortedOrders?.page ?? 0) - 1))}
                disabled={isLoading || (sortedOrders?.page ?? 0) <= 0}
                className="admin-button-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => setPage(Math.min((sortedOrders?.totalPages ?? 1) - 1, (sortedOrders?.page ?? 0) + 1))}
                disabled={isLoading || (sortedOrders?.page ?? 0) >= (sortedOrders?.totalPages ?? 1) - 1}
                className="admin-button-danger disabled:cursor-not-allowed disabled:opacity-60"
              >
                Seguinte
              </button>
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
      title="Pagamentos manuais"
      eyebrow="Validacao de comprovativos"
      subtitle={`${paymentOrders?.content.length ?? 0} pedido(s) a aguardar comprovativo, validacao ou confirmacao manual`}
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
        "manual-payments-queue.csv"
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
