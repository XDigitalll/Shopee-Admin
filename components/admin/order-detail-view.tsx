"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useAdminLiveRefresh } from "@/hooks/use-admin-live-refresh";
import { AdminConfirmDialog, AdminSectionSkeleton } from "@/components/admin/feedback-state";
import { WhatsAppPhone } from "@/components/admin/whatsapp-link";
import { adminApiFetch } from "@/lib/admin/api-client";
import { formatMoney, humanizeOrderStatus, humanizePaymentMethod } from "@/lib/admin/format";
import { getAvailableOrderActions, getOrderActionHint, getPrimaryOrderAction, type AdminOrderAction } from "@/lib/admin/order-actions";
import { canPerform } from "@/lib/admin/permissions";
import { buildOrderWhatsAppMessage } from "@/lib/admin/whatsapp";
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
  "PAYMENT_ON_DELIVERY_PENDING",
  "PAID",
  "READY_FOR_DELIVERY",
  "DELIVERED",
] as const;

const INTERNAL_DELIVERY_STATUS_STEPS = [
  "CREATED",
  "PENDING_PAYMENT",
  "PAYMENT_ON_DELIVERY_PENDING",
  "PAID",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
] as const;

type TrackableStatus =
  | (typeof STANDARD_STATUS_STEPS)[number]
  | (typeof EXTERNAL_STATUS_STEPS)[number]
  | (typeof PICKUP_STATUS_STEPS)[number]
  | (typeof INTERNAL_DELIVERY_STATUS_STEPS)[number];
type DetailAction = AdminOrderAction;

type DetailActionCommand = Extract<DetailAction, { action: string }>;

const STATUS_THEME: Record<string, string> = {
  CREATED: "bg-[#F1EFE8] text-[#444441]",
  UNDER_REVIEW: "bg-[#FAEEDA] text-[#633806]",
  QUOTED: "bg-[#fef3c7] text-[#92400e]",
  APPROVED: "bg-[#d1fae5] text-[#065f46]",
  PENDING_PAYMENT: "bg-[#FAEEDA] text-[#633806]",
  PAYMENT_ON_DELIVERY_PENDING: "bg-[#E0F2FE] text-[#0C4A6E]",
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

function isClosedOrderStatus(status: string | null | undefined) {
  return ["CANCELLED", "FAILED", "DELIVERED"].includes(String(status ?? ""));
}

function isPickupOrder(detail: ExternalOrderDetail) {
  return detail.type === "INTERNAL" && detail.deliveryMethod === "STORE_PICKUP";
}

function isInternalDeliveryOrder(detail: ExternalOrderDetail) {
  return detail.type === "INTERNAL" && detail.deliveryMethod !== "STORE_PICKUP";
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
    if (step === "PAYMENT_ON_DELIVERY_PENDING") return "Pagar na entrega";
    if (step === "PAID") return "Pagamento confirmado";
    if (step === "READY_FOR_DELIVERY") return "Pronto para levantamento";
    if (step === "DELIVERED") return "Levantado";
  }
  if (detail && isInternalDeliveryOrder(detail)) {
    if (step === "PAYMENT_ON_DELIVERY_PENDING") return "Pagar na entrega";
    if (step === "PAID") return "Pago";
    if (step === "OUT_FOR_DELIVERY") return "A caminho";
  }
  if (step === "TO_PURCHASE") return "Comprar no fornecedor";

  return humanizeOrderStatus(step);
}

function buildPrimaryAction(detail: ExternalOrderDetail, isSuperAdmin: boolean): DetailAction | null {
  const status = detail.status;
  const pickupOrder = isPickupOrder(detail);

  if (status === "UNDER_REVIEW" || (detail.type === "EXTERNAL" && status === "CREATED")) {
    return { label: "Analisar e cotar", href: `/admin/orders/${detail.id}/quote` };
  }
  if (status === "PENDING_PAYMENT") {
    return isSuperAdmin
      ? { label: "Ver transação PaySuite", href: `/admin/finance/paysuite` }
      : { label: "Enviar para equipa de pagamentos", action: "handoff", targetQueue: "PAYMENTS" };
  }

  if (pickupOrder) {
    if (hasAllowedAction(detail, "MARK_READY_FOR_PICKUP")) {
      return { label: "Marcar pronto para levantamento", action: "mark-ready-for-delivery" };
    }
    if (hasAllowedAction(detail, "CONFIRM_PICKUP")) {
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
    if (status === "OUT_FOR_DELIVERY") {
      return { label: "Confirmar entrega", action: "mark-status", targetStatus: "DELIVERED" };
    }
    return null;
  }

  if (status === "TO_PURCHASE" || status === "PAID") {
    return { label: "Enviar comprovativo de compra", action: "purchase-proof" };
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
  if (status === "OUT_FOR_DELIVERY") {
    return { label: "Confirmar entrega", action: "mark-status", targetStatus: "DELIVERED" };
  }
  return null;
}

function buildQuickActions(detail: ExternalOrderDetail, isSuperAdmin: boolean) {
  const status = detail.status;
  const pickupOrder = isPickupOrder(detail);
  const actions: DetailAction[] = [];

  if (detail.type === "EXTERNAL" && ["CREATED", "UNDER_REVIEW"].includes(status)) {
    actions.push({ label: "Analisar e cotar", href: `/admin/orders/${detail.id}/quote` });
  }
  if (status === "PENDING_PAYMENT") {
    actions.push(isSuperAdmin
      ? { label: "Ver transação PaySuite", href: `/admin/finance/paysuite` }
      : { label: "Enviar para equipa de pagamentos", action: "handoff", targetQueue: "PAYMENTS" });
  }

  if (pickupOrder) {
    if (hasAllowedAction(detail, "MARK_READY_FOR_PICKUP")) {
      actions.push({ label: "Marcar pronto para levantamento", action: "mark-ready-for-delivery" });
    }
    if (hasAllowedAction(detail, "CONFIRM_PICKUP")) {
      actions.push({ label: "Confirmar levantamento", action: "mark-status", targetStatus: "DELIVERED" });
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
    if (status === "OUT_FOR_DELIVERY") {
      actions.push({ label: "Confirmar entrega", action: "mark-status", targetStatus: "DELIVERED" });
    }
  } else {
    if (status === "TO_PURCHASE" || status === "PAID") {
      actions.push({ label: "Enviar comprovativo de compra", action: "purchase-proof" });
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
    if (status === "OUT_FOR_DELIVERY") {
      actions.push({ label: "Confirmar entrega", action: "mark-status", targetStatus: "DELIVERED" });
    }
  }

  if (!isClosedOrderStatus(status)) {
    actions.push({ label: "Cancelar pedido", action: "cancel-order" });
  }
  return actions;
}

export function OrderDetailView({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { effectiveRole, profile } = useAdminAuth();
  const isSuperAdmin = effectiveRole === "SUPER_ADMIN";
  const canConfirmDeliveryPayment = ["FINANCE_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(String(effectiveRole ?? ""));
  const canConfirmCodPayment = ["DELIVERY_DRIVER", "DELIVERY_MANAGER", "FINANCE_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(String(effectiveRole ?? ""));
  const trackingRef = useRef<HTMLDivElement | null>(null);
  const [detail, setDetail] = useState<ExternalOrderDetail | null>(null);
  const [history, setHistory] = useState<OrderHistoryEntry[]>([]);
  const [trackingCode, setTrackingCode] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [notes, setNotes] = useState<InternalOrderNote[]>([]);
  const [error, setError] = useState("");
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [correctionDialogOpen, setCorrectionDialogOpen] = useState(false);
  const [correctionNote, setCorrectionNote] = useState("");
  const [isRequestingCorrection, setIsRequestingCorrection] = useState(false);
  const [confirmPurchaseOpen, setConfirmPurchaseOpen] = useState(false);
  const [publishProofOpen, setPublishProofOpen] = useState(false);
  const [purchaseProofFile, setPurchaseProofFile] = useState<File | null>(null);
  const [purchaseProofPreviewUrl, setPurchaseProofPreviewUrl] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [supplierPurchaseAmount, setSupplierPurchaseAmount] = useState("");
  const [supplierOrderReference, setSupplierOrderReference] = useState("");
  const [purchaseNote, setPurchaseNote] = useState("");
  const [confirmPurchaseError, setConfirmPurchaseError] = useState("");
  const [publishProofError, setPublishProofError] = useState("");
  const [isConfirmingPurchase, setIsConfirmingPurchase] = useState(false);
  const [isPublishingProof, setIsPublishingProof] = useState(false);
  const [isConfirmingDeliveryPayment, setIsConfirmingDeliveryPayment] = useState(false);
  const [codAmountCollected, setCodAmountCollected] = useState("");
  const [codNotCollectedReason, setCodNotCollectedReason] = useState("");
  const [proofSendWhatsapp, setProofSendWhatsapp] = useState(false);
  const [proofSendEmail, setProofSendEmail] = useState(false);
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

  useEffect(() => {
    const req = detail?.activeClarificationRequest;
    if (req?.status === "ANSWERED" && req.adminSeenAt == null && req.id && detail?.id) {
      adminApiFetch(
        `/api/admin/orders/${detail.id}/clarification/${req.id}/mark-seen`,
        { method: "PATCH" }
      ).catch(() => undefined);
    }
  }, [detail?.activeClarificationRequest?.id, detail?.activeClarificationRequest?.status, detail?.activeClarificationRequest?.adminSeenAt, detail?.id]);

  useEffect(() => {
    if (!purchaseProofFile || !purchaseProofFile.type.startsWith("image/")) {
      setPurchaseProofPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(purchaseProofFile);
    setPurchaseProofPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [purchaseProofFile]);

  const totals = useMemo(() => (detail ? buildTotals(detail) : null), [detail]);
  const primaryAction = detail ? getPrimaryOrderAction(detail, profile, { surface: "detail", mode: "orders", usePurchaseProof: true }) as DetailAction | null : null;
  const quickActions = detail ? getAvailableOrderActions(detail, profile, { surface: "detail", mode: "orders", usePurchaseProof: true }) as DetailAction[] : [];
  const actionHint = getOrderActionHint(detail);
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
  const orderWhatsAppMessage = detail ? buildOrderWhatsAppMessage(detail.number) : "";
  const hasDeliveryBalance = Boolean(
    detail &&
      (detail.codEnabled || detail.depositRequired || Number(detail.remainingAmountOnDelivery ?? 0) > 0) &&
      detail.deliveryPaymentStatus !== "RECEIVED"
  );
  const isCodOrder = detail?.type === "INTERNAL" && detail.paymentMethod === "CASH_ON_DELIVERY";
  const canCollectCodNow = Boolean(
    isCodOrder &&
      detail &&
      ["READY_FOR_DELIVERY", "OUT_FOR_DELIVERY"].includes(detail.status) &&
      detail.deliveryPaymentStatus !== "RECEIVED"
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

    if (action === "purchase-proof") {
      setConfirmPurchaseOpen(true);
      return;
    }

    setError("");
    try {
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

      if (action === "advance-order") {
        await adminApiFetch(`/api/admin/orders/${detail.id}/advance`, {
          method: "PATCH",
        });
        await refreshData();
        return;
      }

      if (action === "mark-ready-for-delivery") {
        if (detail.type === "EXTERNAL") {
          await adminApiFetch(`/api/admin/orders/${detail.id}/status`, {
            method: "PUT",
            body: JSON.stringify({ status: "READY_FOR_DELIVERY" }),
          });
          await refreshData();
          return;
        }

        await adminApiFetch(`/api/admin/orders/${detail.id}/mark-ready-for-delivery`, {
          method: "PATCH",
        });
        await refreshData();
        return;
      }

      if (action === "collect-and-deliver") {
        router.push(`/admin/finance/paysuite`);
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

  async function confirmDeliveryPayment() {
    if (!detail) return;

    setIsConfirmingDeliveryPayment(true);
    setError("");
    try {
      await adminApiFetch(`/api/admin/orders/${detail.id}/delivery-payment/confirm`, { method: "PATCH" });
      await refreshData();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Nao foi possivel confirmar o dinheiro recebido.");
    } finally {
      setIsConfirmingDeliveryPayment(false);
    }
  }

  async function confirmCodCollected() {
    if (!detail) return;

    const amountCollected = Number(codAmountCollected || detail.remainingAmountOnDelivery || detail.totalAmount || 0);
    setIsConfirmingDeliveryPayment(true);
    setError("");
    try {
      await adminApiFetch(`/api/admin/orders/${detail.id}/cod/confirm-collected`, {
        method: "PATCH",
        body: JSON.stringify({ amountCollected }),
      });
      setCodAmountCollected("");
      await refreshData();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Nao foi possivel confirmar o COD recebido.");
    } finally {
      setIsConfirmingDeliveryPayment(false);
    }
  }

  async function markCodNotCollected() {
    if (!detail) return;

    setIsConfirmingDeliveryPayment(true);
    setError("");
    try {
      await adminApiFetch(`/api/admin/orders/${detail.id}/cod/mark-not-collected`, {
        method: "PATCH",
        body: JSON.stringify({ reason: codNotCollectedReason }),
      });
      setCodNotCollectedReason("");
      await refreshData();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Nao foi possivel marcar COD como nao recebido.");
    } finally {
      setIsConfirmingDeliveryPayment(false);
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

  async function requestCustomerCorrection() {
    if (!detail || !correctionNote.trim()) return;

    setIsRequestingCorrection(true);
    setError("");
    try {
      await adminApiFetch(`/api/admin/orders/${detail.id}/request-correction`, {
        method: "PATCH",
        body: JSON.stringify({ note: correctionNote.trim() }),
      });
      setCorrectionDialogOpen(false);
      setCorrectionNote("");
      await refreshData();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Nao foi possivel pedir correcao ao cliente.");
    } finally {
      setIsRequestingCorrection(false);
    }
  }

  function selectPurchaseProofFile(file: File | null) {
    setPublishProofError("");
    if (!file) {
      setPurchaseProofFile(null);
      return;
    }

    const allowed = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
    if (!allowed.includes(file.type)) {
      setPublishProofError("Envia uma imagem ou PDF do comprovativo.");
      setPurchaseProofFile(null);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPublishProofError("O ficheiro deve ter no maximo 10MB.");
      setPurchaseProofFile(null);
      return;
    }
    setPurchaseProofFile(file);
  }

  async function confirmPurchase() {
    if (!detail || !supplierName.trim()) return;

    setIsConfirmingPurchase(true);
    setConfirmPurchaseError("");
    setError("");
    try {
      await adminApiFetch(`/api/admin/orders/${detail.id}/purchase-confirmation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierName: supplierName.trim(),
          amount: supplierPurchaseAmount.trim() || null,
          supplierOrderReference: supplierOrderReference.trim() || null,
          note: purchaseNote.trim() || null,
        }),
      });
      setConfirmPurchaseOpen(false);
      setSupplierName("");
      setSupplierPurchaseAmount("");
      setSupplierOrderReference("");
      setPurchaseNote("");
      await refreshData();
    } catch (actionError) {
      setConfirmPurchaseError(actionError instanceof Error ? actionError.message : "Nao foi possivel confirmar a compra.");
    } finally {
      setIsConfirmingPurchase(false);
    }
  }

  async function publishPurchaseProof() {
    if (!detail || !purchaseProofFile) return;

    setIsPublishingProof(true);
    setPublishProofError("");
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", purchaseProofFile);
      formData.append("sendWhatsapp", String(proofSendWhatsapp));
      formData.append("sendEmail", String(proofSendEmail));

      await adminApiFetch(`/api/admin/orders/${detail.id}/purchase-proof/publish`, {
        method: "POST",
        body: formData,
      });
      setPublishProofOpen(false);
      setPurchaseProofFile(null);
      setProofSendWhatsapp(false);
      setProofSendEmail(false);
      await refreshData();
    } catch (actionError) {
      setPublishProofError(actionError instanceof Error ? actionError.message : "Nao foi possivel enviar o comprovativo.");
    } finally {
      setIsPublishingProof(false);
    }
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
  const externalOrder = detail.type === "EXTERNAL";
  const canManageOrderActions = canPerform(profile, ["ORDER_MANAGER", "ADMIN", "SUPER_ADMIN"]);
  const screenshotUrls = detail.requestScreenshotUrls.length
    ? detail.requestScreenshotUrls
    : detail.requestScreenshotUrl
      ? [detail.requestScreenshotUrl]
      : [];
  const canConfirmPurchase = externalOrder
    && canManageOrderActions
    && ["PAID", "TO_PURCHASE"].includes(currentStatus)
    && !detail.purchaseConfirmedAt;
  const canPublishProof = externalOrder
    && canManageOrderActions
    && (currentStatus as string) === "PURCHASED"
    && !!detail.purchaseConfirmedAt
    && !detail.purchaseProofUrl;

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="sticky top-[68px] z-10 rounded-[20px] border border-[var(--color-border)] bg-[color:var(--color-surface-overlay)]/95 px-4 py-4 backdrop-blur-xl sm:top-[88px] sm:rounded-[28px] sm:px-6 sm:py-5">
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
              <h1 className="font-[family-name:var(--font-sora)] text-2xl font-semibold sm:text-3xl">Detalhe do pedido</h1>
              <span className="font-[family-name:var(--font-sora)] text-lg font-semibold text-[var(--color-danger)] sm:text-xl">
                {detail.number}
              </span>
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_THEME[currentStatus] ?? "bg-[var(--color-background-tertiary)] text-[var(--color-text-secondary)]"}`}>
                {pickupOrder && currentStatus === "DELIVERED" ? "Levantado" : humanizeOrderStatus(currentStatus)}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <button type="button" onClick={() => window.print()} className="admin-button-muted">
              Exportar PDF
            </button>
            {detail.type === "EXTERNAL" && detail.customerEditable ? (
              <button type="button" onClick={() => setCorrectionDialogOpen(true)} className="admin-button-muted">
                Pedir correcao ao cliente
              </button>
            ) : null}
            {canConfirmPurchase ? (
              <button type="button" onClick={() => setConfirmPurchaseOpen(true)} className="admin-button-danger">
                Confirmar compra no fornecedor
              </button>
            ) : null}
            {canPublishProof ? (
              <button type="button" onClick={() => setPublishProofOpen(true)} className="admin-button-danger">
                Enviar comprovativo ao cliente
              </button>
            ) : null}
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
            {!primaryAction && actionHint ? (
              <p className="rounded-2xl border border-[#BAE6FD] bg-[#F0F9FF] px-4 py-3 text-xs font-medium text-[#0C4A6E]">
                {actionHint}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-[24px] border border-[rgba(232,67,26,0.18)] bg-[rgba(232,67,26,0.08)] px-5 py-4 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      ) : null}

      {detail.needsCustomerCorrection ? (
        <div className="rounded-[24px] border border-[#F1D7A8] bg-[#FFF5D8] px-5 py-4 text-sm text-[#7A5712]">
          <p className="font-semibold">Correcao pedida ao cliente</p>
          <p className="mt-1">{detail.customerCorrectionNote || "Aguardamos atualizacao das informacoes deste pedido."}</p>
        </div>
      ) : null}

      {detail.purchaseConfirmedAt && !detail.purchaseProofUrl ? (
        <div className="rounded-[24px] border border-[#B7DFC4] bg-[#F1FBF4] px-5 py-4 text-sm text-[#14532D]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-semibold">Compra sem comprovativo anexado</p>
              <p className="mt-1">
                {detail.supplierName ? `Loja: ${detail.supplierName}. ` : ""}
                {detail.purchaseConfirmedAt
                  ? `Confirmado em ${new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" }).format(new Date(detail.purchaseConfirmedAt))}.`
                  : ""}
              </p>
              {detail.supplierPurchaseAmount != null ? (
                <p className="mt-1">Valor final pago: {formatMoney(detail.supplierPurchaseAmount)}</p>
              ) : null}
              <p className="mt-2 text-xs text-[#166534]/70">Compra marcada sem comprovativo. Deve ser anexado depois.</p>
            </div>
            <button type="button" onClick={() => setPublishProofOpen(true)} className="admin-button-muted justify-center">
              Adicionar comprovativo de compra
            </button>
          </div>
        </div>
      ) : null}

      {detail.purchaseProofUrl ? (
        <div className="rounded-[24px] border border-[#B7DFC4] bg-[#F1FBF4] px-5 py-4 text-sm text-[#14532D]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-semibold">Comprovativo enviado ao cliente</p>
              <p className="mt-1">
                {detail.supplierName ? `Loja: ${detail.supplierName}. ` : ""}
                {detail.purchaseProofUploadedAt
                  ? `Enviado em ${new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" }).format(new Date(detail.purchaseProofUploadedAt))}.`
                  : "Disponivel para o cliente."}
              </p>
              {detail.supplierPurchaseAmount != null ? (
                <p className="mt-1">Valor final pago: {formatMoney(detail.supplierPurchaseAmount)}</p>
              ) : null}
            </div>
            <a href={detail.purchaseProofUrl} target="_blank" rel="noreferrer" className="admin-button-muted justify-center">
              Ver comprovativo
            </a>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4 sm:space-y-6">
          <section className="admin-card p-4 sm:p-6">
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
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                    <span>{detail.customerEmail}</span>
                    <span aria-hidden="true">·</span>
                    <WhatsAppPhone phone={detail.customerPhone} message={orderWhatsAppMessage} />
                  </div>
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
                      {detail.cleanDescription || detail.productDetails || "Sem detalhes informados"}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[var(--color-background-secondary)] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">Quantidade</p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">{detail.requestedQuantity || 1}</p>
                  </div>
                </div>
                ) : null}
                {screenshotUrls.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {screenshotUrls.map((url, index) => (
                      <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] px-4 py-3 text-sm font-semibold text-[var(--color-text-primary)]">
                        Abrir foto {index + 1}
                      </a>
                    ))}
                  </div>
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
                {detail.detectedLinks?.length ? (
                  <div className="mt-3 rounded-2xl bg-[var(--color-background-secondary)] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">Links detectados</p>
                    <div className="mt-2 space-y-1">
                      {detail.detectedLinks.map((link) => (
                        <a key={link} href={link} target="_blank" rel="noreferrer" className="block truncate text-sm font-semibold text-[var(--color-danger)]">
                          {link}
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}
                {detail.originalRawMessage ? (
                  <details className="mt-3 rounded-2xl bg-[var(--color-background-secondary)] px-4 py-3">
                    <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
                      Ver mensagem original
                    </summary>
                    <p className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">
                      {detail.originalRawMessage}
                    </p>
                  </details>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="admin-card p-4 sm:p-6">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">
                {externalOrder ? "Cotacao internacional" : "Produtos comprados"}
              </p>
              <h2 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold">
                {externalOrder ? "Itens importados" : "Resumo de produtos locais"}
              </h2>
            </div>

            <div className="admin-table-scroll">
              <table className="min-w-[680px] lg:min-w-full">
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

          <section className="admin-card admin-tracker p-4 sm:p-6">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">Rastreador</p>
              <h2 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold">Estado do ciclo de vida</h2>
            </div>

            <div className="admin-tracker-scroll">
              <div className="admin-tracker-steps">
                <div className="admin-tracker-row flex items-center justify-between">
                  {trackingSteps.map((step, index) => {
                    const done = index < currentStepIndex;
                    const active = step === currentStatus;
                    const future = index > currentStepIndex;

                    return (
                      <div key={step} className="admin-tracker-item flex flex-1 items-center">
                        <div className="admin-tracker-marker flex flex-col items-center text-center">
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
                          <span className={`admin-tracker-line mx-2 h-0.5 flex-1 ${done ? "bg-[var(--color-danger)]" : "bg-[var(--color-border)]"}`} />
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <div className="admin-tracker-dates mt-6 grid grid-flow-col auto-cols-fr gap-2 text-center text-xs text-[var(--color-text-secondary)]">
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
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                  <span>Destinatário: {detail.customerName}</span>
                  <span aria-hidden="true">·</span>
                  <WhatsAppPhone phone={detail.customerPhone} message={orderWhatsAppMessage} />
                </div>
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
                <div className="flex items-center justify-between"><span>Método escolhido</span><strong>{humanizePaymentMethod(detail.paymentMethod ?? detail.payment.method)}</strong></div>
                {detail.payment.method && detail.payment.method !== detail.paymentMethod ? (
                  <div className="flex items-center justify-between"><span>Meio de pagamento</span><strong>{humanizePaymentMethod(detail.payment.method)}</strong></div>
                ) : null}
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
                {(detail.codEnabled || detail.depositRequired || Number(detail.remainingAmountOnDelivery ?? 0) > 0) ? (
                  <>
                    <div className="flex items-center justify-between"><span>Sinal pago</span><strong>{formatMoney(Number(detail.depositAmount ?? 0))}</strong></div>
                    <div className="flex items-center justify-between"><span>Saldo por receber na entrega</span><strong>{formatMoney(Number(detail.remainingAmountOnDelivery ?? 0))}</strong></div>
                    <div className="flex items-center justify-between"><span>Dinheiro na entrega</span><strong>{detail.deliveryPaymentStatus || "PENDING"}</strong></div>
                  </>
                ) : null}
              </div>
              <div className="flex flex-col gap-3">
                {canCollectCodNow && canConfirmCodPayment ? (
                  <div className="space-y-3">
                    <label className="block text-xs font-semibold text-[var(--color-text-secondary)]" htmlFor="cod-amount-collected">
                      Valor COD recebido
                    </label>
                    <input
                      id="cod-amount-collected"
                      type="number"
                      min="0"
                      step="0.01"
                      value={codAmountCollected}
                      onChange={(event) => setCodAmountCollected(event.target.value)}
                      placeholder={String(detail.remainingAmountOnDelivery ?? detail.totalAmount ?? 0)}
                      className="admin-input w-full"
                    />
                    <button
                      type="button"
                      onClick={() => void confirmCodCollected()}
                      disabled={isConfirmingDeliveryPayment}
                      className="admin-button-danger w-full justify-center disabled:opacity-60"
                    >
                      {isConfirmingDeliveryPayment ? "A confirmar..." : "Confirmar COD recebido e entregar"}
                    </button>
                    <label className="block text-xs font-semibold text-[var(--color-text-secondary)]" htmlFor="cod-not-collected-reason">
                      Motivo se nao recebeu
                    </label>
                    <textarea
                      id="cod-not-collected-reason"
                      value={codNotCollectedReason}
                      onChange={(event) => setCodNotCollectedReason(event.target.value)}
                      rows={3}
                      className="admin-input w-full resize-none"
                    />
                    <button
                      type="button"
                      onClick={() => void markCodNotCollected()}
                      disabled={isConfirmingDeliveryPayment || !codNotCollectedReason.trim()}
                      className="admin-button-muted w-full justify-center disabled:opacity-60"
                    >
                      Marcar COD nao recebido
                    </button>
                  </div>
                ) : hasDeliveryBalance && !isCodOrder && canConfirmDeliveryPayment ? (
                  <button
                    type="button"
                    onClick={() => void confirmDeliveryPayment()}
                    disabled={isConfirmingDeliveryPayment}
                    className="admin-button-danger justify-center disabled:opacity-60"
                  >
                    {isConfirmingDeliveryPayment ? "A confirmar..." : "Confirmar dinheiro recebido na entrega"}
                  </button>
                ) : null}
                {detail.payment.checkoutUrl ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-[var(--color-text-secondary)]">Checkout URL</p>
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard.writeText(detail.payment.checkoutUrl ?? "")}
                      className="admin-button-muted w-full justify-center"
                    >
                      Copiar link de pagamento
                    </button>
                  </div>
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

        <aside className="space-y-4 sm:space-y-6 xl:sticky xl:top-[96px] xl:h-fit">
          <section className="admin-card p-4 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">Ações rápidas</p>
            <div className="mt-4 flex flex-col gap-2 sm:gap-3">
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
              {quickActions.length === 0 && actionHint ? (
                <p className="rounded-2xl border border-[#BAE6FD] bg-[#F0F9FF] px-4 py-3 text-xs font-medium text-[#0C4A6E]">
                  {actionHint}
                </p>
              ) : null}
            </div>
          </section>

          <section className="admin-card p-4 sm:p-6">
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

          <section className="admin-card p-4 sm:p-6">
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

      {correctionDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="w-full max-w-lg rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">Pedido de correcao</p>
            <h2 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold text-[var(--color-text-primary)]">
              Pedir correcao ao cliente
            </h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Explica de forma simples o que precisa ser corrigido antes de continuar a cotacao.
            </p>
            <label className="mt-5 block">
              <span className="mb-2 block text-sm font-semibold text-[var(--color-text-primary)]">
                O que o cliente precisa corrigir?
              </span>
              <textarea
                rows={5}
                value={correctionNote}
                onChange={(event) => setCorrectionNote(event.target.value)}
                className="admin-input min-h-[140px] resize-y"
                placeholder="Ex: Precisamos que indiques a cor e o tamanho correto."
              />
            </label>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  if (!isRequestingCorrection) {
                    setCorrectionDialogOpen(false);
                  }
                }}
                className="admin-button-muted justify-center"
                disabled={isRequestingCorrection}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void requestCustomerCorrection()}
                className="admin-button-danger justify-center disabled:opacity-60"
                disabled={isRequestingCorrection || !correctionNote.trim()}
              >
                {isRequestingCorrection ? "A enviar..." : "Enviar pedido de correcao"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmPurchaseOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-4 pt-6 sm:items-center sm:pb-6"
          style={{ animation: "overlay-in 0.18s ease both", background: "rgba(0,0,0,0.72)" }}
          onClick={(e) => { if (e.target === e.currentTarget && !isConfirmingPurchase) setConfirmPurchaseOpen(false); }}
        >
          <div
            className="w-full max-w-lg overflow-y-auto rounded-[28px] p-6"
            style={{
              animation: "modal-in 0.22s cubic-bezier(0.34,1.06,0.64,1) both",
              background: "#0d1627",
              border: "1px solid rgba(255,255,255,0.07)",
              boxShadow: "0 32px 80px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04) inset",
              maxHeight: "92vh",
            }}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-400">Passo 1 de 2</p>
            <h2 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold text-white">
              Confirmar compra no fornecedor
            </h2>
            <p className="mt-2 text-sm text-white/50">
              Regista onde e quanto pagaste. O cliente ainda nao sera notificado — isso acontece no proximo passo.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-white/80">Loja onde foi comprado *</span>
                <input
                  value={supplierName}
                  onChange={(event) => setSupplierName(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-orange-500/60 focus:ring-1 focus:ring-orange-500/30"
                  placeholder="Ex: Shein, Amazon, Temu"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-white/80">Valor final pago</span>
                <input
                  value={supplierPurchaseAmount}
                  onChange={(event) => setSupplierPurchaseAmount(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-orange-500/60 focus:ring-1 focus:ring-orange-500/30"
                  inputMode="decimal"
                  placeholder="Opcional"
                />
              </label>
            </div>

            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-semibold text-white/80">Referencia do fornecedor</span>
              <input
                value={supplierOrderReference}
                onChange={(event) => setSupplierOrderReference(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-orange-500/60 focus:ring-1 focus:ring-orange-500/30"
                placeholder="Opcional"
              />
            </label>

            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-semibold text-white/80">Nota interna</span>
              <textarea
                rows={3}
                value={purchaseNote}
                onChange={(event) => setPurchaseNote(event.target.value)}
                className="w-full resize-y rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-orange-500/60 focus:ring-1 focus:ring-orange-500/30"
                placeholder="Opcional"
              />
            </label>

            {confirmPurchaseError ? (
              <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {confirmPurchaseError}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => { if (!isConfirmingPurchase) setConfirmPurchaseOpen(false); }}
                disabled={isConfirmingPurchase}
                className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmPurchase()}
                disabled={isConfirmingPurchase || !supplierName.trim()}
                className="rounded-xl px-6 py-2.5 text-sm font-bold text-white transition-all disabled:opacity-40"
                style={{
                  background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
                  boxShadow: isConfirmingPurchase ? "none" : "0 0 20px rgba(249,115,22,0.35)",
                }}
              >
                {isConfirmingPurchase ? "A confirmar..." : "Confirmar compra"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {publishProofOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-4 pt-6 sm:items-center sm:pb-6"
          style={{ animation: "overlay-in 0.18s ease both", background: "rgba(0,0,0,0.72)" }}
          onClick={(e) => { if (e.target === e.currentTarget && !isPublishingProof) setPublishProofOpen(false); }}
        >
          <div
            className="w-full max-w-lg overflow-y-auto rounded-[28px] p-6"
            style={{
              animation: "modal-in 0.22s cubic-bezier(0.34,1.06,0.64,1) both",
              background: "#0d1627",
              border: "1px solid rgba(255,255,255,0.07)",
              boxShadow: "0 32px 80px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04) inset",
              maxHeight: "92vh",
            }}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-400">Passo 2 de 2</p>
            <h2 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold text-white">
              Enviar comprovativo ao cliente
            </h2>
            <p className="mt-2 text-sm text-white/50">
              Anexa o comprovativo real da compra. O cliente sera notificado pelo Portal e pelos canais que escolheres.
            </p>

            <div
              className="mt-5 rounded-[20px] p-5 text-center"
              style={{ background: "rgba(255,255,255,0.04)", border: "1.5px dashed rgba(255,255,255,0.12)" }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                selectPurchaseProofFile(event.dataTransfer.files?.[0] ?? null);
              }}
            >
              <input
                id="publish-proof-file"
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                className="sr-only"
                onChange={(event) => selectPurchaseProofFile(event.target.files?.[0] ?? null)}
              />
              <label htmlFor="publish-proof-file" className="cursor-pointer">
                <span className="block font-semibold text-white/80">
                  {purchaseProofFile ? purchaseProofFile.name : "Selecionar comprovativo"}
                </span>
                <span className="mt-1 block text-sm text-white/40">
                  PNG, JPG, WebP ou PDF. Maximo 10MB.
                </span>
              </label>
              {purchaseProofPreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={purchaseProofPreviewUrl}
                  alt="Preview do comprovativo"
                  className="mx-auto mt-4 max-h-48 rounded-xl object-contain"
                  style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                />
              ) : purchaseProofFile?.type === "application/pdf" ? (
                <div className="mx-auto mt-4 max-w-xs rounded-xl px-4 py-3 text-sm font-semibold text-white/60" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
                  PDF selecionado
                </div>
              ) : null}
            </div>

            <div className="mt-5 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/40">Canais de envio</p>
              <div className="rounded-[16px] px-4 py-3" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Portal ShopeeMz</p>
                    <p className="text-xs text-white/40">Notificacao in-app — sempre enviada</p>
                  </div>
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white text-xs font-bold">✓</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setProofSendWhatsapp(!proofSendWhatsapp)}
                className="w-full rounded-[16px] px-4 py-3 text-left transition-colors"
                style={{
                  background: proofSendWhatsapp ? "rgba(37,211,102,0.1)" : "rgba(255,255,255,0.04)",
                  border: proofSendWhatsapp ? "1px solid rgba(37,211,102,0.3)" : "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">WhatsApp</p>
                    <p className="text-xs text-white/40">Mensagem automatica via WhatsApp</p>
                  </div>
                  <div className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold transition-colors ${proofSendWhatsapp ? "bg-green-500 text-white" : "border border-white/20 text-transparent"}`}>
                    {proofSendWhatsapp ? "✓" : ""}
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setProofSendEmail(!proofSendEmail)}
                className="w-full rounded-[16px] px-4 py-3 text-left transition-colors"
                style={{
                  background: proofSendEmail ? "rgba(99,102,241,0.1)" : "rgba(255,255,255,0.04)",
                  border: proofSendEmail ? "1px solid rgba(99,102,241,0.3)" : "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Email</p>
                    <p className="text-xs text-white/40">Notificacao por email ao cliente</p>
                  </div>
                  <div className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold transition-colors ${proofSendEmail ? "bg-indigo-500 text-white" : "border border-white/20 text-transparent"}`}>
                    {proofSendEmail ? "✓" : ""}
                  </div>
                </div>
              </button>
            </div>

            {publishProofError ? (
              <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {publishProofError}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => { if (!isPublishingProof) setPublishProofOpen(false); }}
                disabled={isPublishingProof}
                className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void publishPurchaseProof()}
                disabled={isPublishingProof || !purchaseProofFile}
                className="rounded-xl px-6 py-2.5 text-sm font-bold text-white transition-all disabled:opacity-40"
                style={{
                  background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
                  boxShadow: isPublishingProof ? "none" : "0 0 20px rgba(249,115,22,0.35)",
                }}
              >
                {isPublishingProof ? "A publicar..." : "Publicar comprovativo"}
              </button>
            </div>
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
