"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

import { AttentionDot } from "@/components/admin/attention-dot";
import { WhatsAppLink, WhatsAppPhone } from "@/components/admin/whatsapp-link";
import {
  AdminBanner,
  AdminConfirmDialog,
  AdminFeedbackDock,
  AdminSectionSkeleton,
  AdminStateCard,
  AdminTableSkeleton,
} from "@/components/admin/feedback-state";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useAdminLiveRefresh } from "@/hooks/use-admin-live-refresh";
import { adminApiFetch } from "@/lib/admin/api-client";
import { formatMoney, formatRelativePercent, humanizeRole } from "@/lib/admin/format";
import { buildPhoneHref, buildWhatsAppUrl } from "@/lib/admin/whatsapp";
import { isDeliveryActionRequired } from "@/lib/admin/operational-queue";
import { canManageDelivery } from "@/lib/admin/permissions";
import type {
  DeliveryActiveOrder,
  DeliveryDriver,
  DeliveryDriversResponse,
  DeliveryHistoryItem,
  DeliveryHistoryResponse,
  DeliveryOrderItem,
  DeliveryPendingOrder,
  DeliveryStatsResponse,
} from "@/lib/admin/types";

const DELIVERY_TABS = [
  { href: "/admin/delivery", label: "Visao geral" },
  { href: "/admin/delivery/pending", label: "No escritorio" },
  { href: "/admin/delivery/active", label: "Em entrega" },
  { href: "/admin/delivery/history", label: "Historico" },
];

const ISSUE_OPTIONS = [
  { value: "CLIENTE_AUSENTE", label: "Cliente ausente" },
  { value: "ENDERECO_INCORRECTO", label: "Endereco incorrecto" },
  { value: "PEDIDO_DANIFICADO", label: "Pedido danificado" },
  { value: "IMPOSSIVEL_ENTREGAR", label: "Impossivel entregar" },
];

const CLIENT_APP_URL = (process.env.NEXT_PUBLIC_CLIENT_URL || "http://localhost:3000").replace(/\/$/, "");
const READY_FOR_DELIVERY_STATUSES = new Set(["READY_FOR_DELIVERY", "DELIVERY_FAILED"]);
const ESTIMATED_DELIVERY_PRESETS = [
  { label: "30 min", minutes: 30 },
  { label: "45 min", minutes: 45 },
  { label: "1h", minutes: 60 },
  { label: "1h 30", minutes: 90 },
  { label: "2h", minutes: 120 },
];

type FeedbackState = {
  tone: "success" | "error" | "loading";
  message: string;
} | null;

type PendingFormState = {
  deliveryFee: string;
  estimatedDeliveryTime: string;
  notes: string;
  driverId: string;
};

type DeliveryCollectionModalState = {
  order: DeliveryActiveOrder;
  cashConfirmed: boolean;
  transferReference: string;
  transferPayerName: string;
  transferPayerBank: string;
  paymentUrl: string | null;
};

type DeliveryCollectionResponse = {
  orderId: number;
  status: string;
  deliveryPaymentStatus: string | null;
  pendingDeliveryAmount: number | null;
  paymentUrl?: string | null;
  checkoutUrl?: string | null;
  message?: string | null;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDuration(minutes: number | null | undefined) {
  if (minutes == null || !Number.isFinite(minutes)) {
    return "—";
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`;
}

function formatSmartDate(value: string | null | undefined) {
  if (!value) {
    return "Pendente";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Data invalida";
  }

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((startOfToday - startOfDate) / 86400000);
  const time = new Intl.DateTimeFormat("pt-PT", { hour: "2-digit", minute: "2-digit" }).format(date);

  if (dayDiff === 0) return `Hoje · ${time}`;
  if (dayDiff === 1) return `Ontem · ${time}`;
  if (dayDiff > 1 && dayDiff < 7) return `ha ${dayDiff} dias`;
  return new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "short" }).format(date);
}

function formatDateTooltip(value: string | null | undefined) {
  return value ? formatDateTime(value) : "Sem registo";
}

function getDurationTone(minutes: number | null | undefined) {
  if (minutes == null || !Number.isFinite(minutes)) {
    return "bg-[var(--color-background-tertiary)] text-[var(--color-text-secondary)]";
  }

  if (minutes <= 45) return "bg-[rgba(21,128,61,0.12)] text-[#86efac]";
  if (minutes <= 120) return "bg-[rgba(245,158,11,0.14)] text-[#facc15]";
  return "bg-[rgba(232,67,26,0.14)] text-[#fb923c]";
}

function resolveDeliveryChargeAmount(order: DeliveryActiveOrder) {
  const candidates = [
    order.remainingAmountOnDelivery,
    order.deliveryFee,
  ];
  const amount = candidates.find((value) => Number(value ?? 0) > 0);
  return Number(amount ?? 0);
}

function isDeliveryPaymentResolved(order: DeliveryActiveOrder) {
  const paymentStatus = String(order.paymentStatus ?? "").toUpperCase();
  const deliveryPaymentStatus = String(order.deliveryPaymentStatus ?? "").toUpperCase();
  return ["SUCCESS", "VALIDATED", "CONFIRMED", "APPROVED", "COD_COLLECTED", "RECEIVED", "PAID"].includes(paymentStatus)
    || ["RECEIVED", "WAIVED", "PAID", "CONFIRMED"].includes(deliveryPaymentStatus);
}

function hasPendingDeliveryCharge(order: DeliveryActiveOrder) {
  const status = String(order.status ?? "").toUpperCase();
  const paymentStatus = String(order.paymentStatus ?? "").toUpperCase();
  const deliveryPaymentStatus = String(order.deliveryPaymentStatus ?? "").toUpperCase();
  return (
    status === "AWAITING_DELIVERY_PAYMENT"
    || deliveryPaymentStatus === "PENDING"
    || paymentStatus === "COD_PENDING"
    || Number(order.remainingAmountOnDelivery ?? 0) > 0
  ) && !isDeliveryPaymentResolved(order);
}

function hasActiveCodPaySuiteCharge(order: DeliveryActiveOrder) {
  const paymentStatus = String(order.paymentStatus ?? "").toUpperCase();
  const method = String(order.codPaymentCollectionMethod ?? "").toUpperCase();
  return method === "PAYSUITE"
    && (paymentStatus === "COD_PAYMENT_REQUESTED" || paymentStatus === "PENDING");
}

function buildDeliveryAddressUrl(orderNumber: string, phone: string | null | undefined) {
  const url = new URL(`${CLIENT_APP_URL}/delivery-address/${encodeURIComponent(orderNumber)}`);
  if (phone) {
    url.searchParams.set("phone", phone);
  }
  return url.toString();
}

function buildWhatsappAddressRequestUrl(orderNumber: string, phone: string | null | undefined) {
  const addressUrl = buildDeliveryAddressUrl(orderNumber, phone);
  const text = `Ola! A tua encomenda ${orderNumber} ja chegou a Maputo. Para combinarmos a entrega, confirma a tua morada ou partilha a localizacao aqui: ${addressUrl}`;
  return buildWhatsAppUrl(phone, text);
}

function DriverContactBadge({
  name,
  phone,
}: {
  name: string | null | undefined;
  phone: string | null | undefined;
}) {
  const href = buildPhoneHref(phone);

  return (
    <span className="rounded-full bg-[#EAF3DE] px-3 py-1 text-xs font-semibold text-[#27500A]">
      Estafeta: {name || "Sem estafeta"}
      {phone ? (
        <>
          {" · "}
          {href ? (
            <a href={href} className="hover:underline">
              {phone}
            </a>
          ) : (
            phone
          )}
          <WhatsAppLink
            phone={phone}
            iconOnly
            className="ml-1 inline-flex align-middle text-[#128C7E]"
          />
        </>
      ) : null}
    </span>
  );
}

function buildWhatsappArrivalNoticeUrl(orderNumber: string, phone: string | null | undefined) {
  const text = `Ola! A tua encomenda ${orderNumber} ja chegou a Maputo. Vamos combinar a entrega contigo pelo telefone informado.`;
  return buildWhatsAppUrl(phone, text);
}

function buildCsv(rows: string[][]) {
  return rows
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

function parseEstimatedDeliveryMinutes(value: string | null | undefined) {
  const hours = Number(value ?? 0);
  if (!Number.isFinite(hours) || hours <= 0) {
    return 0;
  }
  return Math.round(hours * 60);
}

function formatEstimatedDeliveryValue(totalMinutes: number) {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
    return "";
  }
  const hours = totalMinutes / 60;
  return Number.isInteger(hours) ? String(hours) : String(Number(hours.toFixed(2)));
}

function getEstimatedDeliveryParts(value: string | null | undefined) {
  const totalMinutes = parseEstimatedDeliveryMinutes(value);
  return {
    totalMinutes,
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  };
}

function combineEstimatedDeliveryParts(hours: number, minutes: number) {
  const safeHours = Number.isFinite(hours) ? Math.max(0, Math.min(72, Math.floor(hours))) : 0;
  const safeMinutes = Number.isFinite(minutes) ? Math.max(0, Math.min(59, Math.floor(minutes))) : 0;
  return formatEstimatedDeliveryValue(safeHours * 60 + safeMinutes);
}

function isReadyForDeliveryStatus(status: string | null | undefined) {
  return READY_FOR_DELIVERY_STATUSES.has(String(status ?? "").toUpperCase());
}

function exportCsv(filename: string, rows: string[][]) {
  if (typeof window === "undefined") {
    return;
  }

  const blob = new Blob([buildCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function DeliveryPageFrame({
  eyebrow,
  title,
  description,
  children,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const pathname = usePathname();
  const { effectiveRole, profile } = useAdminAuth();
  const deliveryTabs = effectiveRole === "DELIVERY_DRIVER"
    ? DELIVERY_TABS.filter((tab) => tab.href === "/admin/delivery/pending" || tab.href === "/admin/delivery/active" || tab.href === "/admin/delivery/history")
    : DELIVERY_TABS;
  const canManageDrivers = canManageDelivery(profile);

  return (
    <div className="space-y-6">
      <section className="admin-card overflow-hidden">
        <div className="flex flex-col gap-5 border-b border-[var(--color-border)] px-6 py-6 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-danger)]">{eyebrow}</p>
            <h1 className="mt-2 font-[family-name:var(--font-sora)] text-3xl font-semibold text-[var(--color-text-primary)]">
              {title}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-[var(--color-text-secondary)]">{description}</p>
          </div>
          {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
        </div>
        <div className="px-6 py-5">
          <div className="flex flex-wrap gap-2">
            {deliveryTabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  pathname === tab.href
                    ? "border-[#E8431A] bg-[rgba(232,67,26,0.16)] text-[#FF8066] shadow-[0_10px_24px_rgba(232,67,26,0.12)]"
                    : "border-[var(--color-border)] bg-[var(--color-background-secondary)] text-[var(--color-text-secondary)] hover:border-[rgba(232,67,26,0.28)] hover:text-[var(--color-danger)]"
                }`}
              >
                {tab.label}
              </Link>
            ))}
            {canManageDrivers ? (
              <Link
                href="/admin/delivery/drivers"
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  pathname === "/admin/delivery/drivers"
                    ? "border-[#E8431A] bg-[rgba(232,67,26,0.16)] text-[#FF8066] shadow-[0_10px_24px_rgba(232,67,26,0.12)]"
                    : "border-[var(--color-border)] bg-[var(--color-background-secondary)] text-[var(--color-text-secondary)] hover:border-[rgba(232,67,26,0.28)] hover:text-[var(--color-danger)]"
                }`}
              >
                Estafetas
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
  helper,
  accent,
}: {
  label: string;
  value: string;
  helper: string;
  accent: string;
}) {
  return (
    <div className="admin-card p-5">
      <p className="text-sm text-[var(--color-text-secondary)]">{label}</p>
      <p className="mt-4 font-[family-name:var(--font-sora)] text-4xl font-semibold" style={{ color: accent }}>
        {value}
      </p>
      <p className="mt-3 text-sm text-[var(--color-text-secondary)]">{helper}</p>
    </div>
  );
}

function DeliveryMap({ orders }: { orders: DeliveryActiveOrder[] }) {
  const positions = [
    { top: "18%", left: "16%" },
    { top: "34%", left: "54%" },
    { top: "60%", left: "32%" },
    { top: "44%", left: "78%" },
    { top: "70%", left: "68%" },
  ];

  return (
    <div className="admin-card h-full p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">Mapa simples</p>
          <h2 className="mt-2 font-[family-name:var(--font-sora)] text-xl font-semibold">Entregas activas</h2>
        </div>
        <span className="rounded-full bg-[#EAF3DE] px-3 py-1 text-xs font-semibold text-[#27500A]">
          {orders.length} em rota
        </span>
      </div>
      <div className="relative mt-5 h-[320px] overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-[radial-gradient(circle_at_top_left,rgba(232,67,26,0.16),transparent_34%),linear-gradient(180deg,#0f172a_0%,#111827_100%)]">
        <div className="absolute inset-[10%] rounded-[24px] border border-dashed border-white/10" />
        <div className="absolute left-[14%] top-[24%] h-[1px] w-[64%] bg-white/10" />
        <div className="absolute left-[24%] top-[56%] h-[1px] w-[48%] bg-white/10" />
        <div className="absolute left-[30%] top-[18%] h-[58%] w-[1px] bg-white/10" />
        <div className="absolute left-[64%] top-[12%] h-[62%] w-[1px] bg-white/10" />
        {orders.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/70">
            Nao ha entregas activas neste momento.
          </div>
        ) : (
          orders.slice(0, positions.length).map((order, index) => {
            const point = positions[index];
            return (
              <div key={order.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={point}>
                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-[#E8431A] shadow-[0_0_0_6px_rgba(232,67,26,0.16)]">
                  <span className="h-2 w-2 rounded-full bg-white" />
                </div>
                <div className="mt-3 min-w-[160px] rounded-2xl border border-white/10 bg-[rgba(15,23,42,0.82)] px-3 py-2 text-xs text-white/80 shadow-[0_12px_30px_rgba(15,23,42,0.28)]">
                  <p className="font-semibold text-white">{order.driverName || "Estafeta em rota"}</p>
                  <p className="mt-1 truncate">{order.customerName}</p>
                  <p className="mt-1 text-white/55">{formatDuration(order.elapsedMinutes)}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function ActiveDeliveriesList({ orders }: { orders: DeliveryActiveOrder[] }) {
  return (
    <div className="admin-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">Rotas em curso</p>
          <h2 className="mt-2 font-[family-name:var(--font-sora)] text-xl font-semibold">Lista de entregas activas</h2>
        </div>
        <Link href="/admin/delivery/active" className="text-sm font-semibold text-[var(--color-danger)]">
          Ver tudo
        </Link>
      </div>

      <div className="mt-5 space-y-3">
        {orders.slice(0, 5).map((order) => (
          <article key={order.id} className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-[family-name:var(--font-sora)] text-lg font-semibold text-[var(--color-text-primary)]">{order.number}</p>
                <p className="mt-1 text-sm font-medium text-[var(--color-text-primary)]">{order.customerName}</p>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{order.driverName || "Sem estafeta"}</p>
              </div>
              <span className="rounded-full bg-[#EAF3DE] px-3 py-1 text-xs font-semibold text-[#27500A]">
                {formatDuration(order.elapsedMinutes)}
              </span>
            </div>
            <div className="mt-3">
              <DeliveryAddressDetails order={order} compact />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-semibold text-[var(--color-text-primary)]">{formatMoney(order.deliveryFee ?? 0)}</span>
              <Link href="/admin/delivery/active" className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-danger)]">
                Acompanhar
              </Link>
            </div>
          </article>
        ))}

        {orders.length === 0 ? (
          <AdminStateCard title="Sem entregas activas" message="Quando uma rota iniciar, ela aparece aqui com estafeta, contacto e morada." compact />
        ) : null}
      </div>
    </div>
  );
}

function createInitialPendingForms(orders: DeliveryPendingOrder[]) {
  return Object.fromEntries(
    orders.map((order) => [
      order.id,
      {
        deliveryFee: order.deliveryFee != null ? String(order.deliveryFee) : "",
        estimatedDeliveryTime:
          order.estimatedDeliveryHours != null ? String(order.estimatedDeliveryHours) : "",
        notes: order.notes ?? "",
        driverId: order.assignedDriverId ?? "",
      } satisfies PendingFormState,
    ]),
  ) as Record<number, PendingFormState>;
}

export function DeliveryDashboardView() {
  const router = useRouter();
  const { effectiveRole } = useAdminAuth();
  const [stats, setStats] = useState<DeliveryStatsResponse | null>(null);
  const [pending, setPending] = useState<DeliveryPendingOrder[]>([]);
  const [active, setActive] = useState<DeliveryActiveOrder[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async (background = false) => {
    if (effectiveRole === "DELIVERY_DRIVER") {
      return;
    }
    try {
      const [statsPayload, pendingPayload, activePayload] = await Promise.all([
        adminApiFetch<DeliveryStatsResponse>("/api/admin/delivery/stats"),
        adminApiFetch<DeliveryPendingOrder[]>("/api/admin/delivery/pending"),
        adminApiFetch<DeliveryActiveOrder[]>("/api/admin/delivery/active"),
      ]);
      setStats({
        ...statsPayload,
        awaitingAtOffice: pendingPayload.length,
        activeNow: activePayload.length,
      });
      setPending(pendingPayload);
      setActive(activePayload);
      setError("");
    } catch (loadError) {
      if (!background) {
        setError(loadError instanceof Error ? loadError.message : "Nao foi possivel abrir o modulo de entregas.");
      }
    } finally {
      if (!background) {
        setIsLoading(false);
      }
    }
  }, [effectiveRole]);

  useEffect(() => {
    if (effectiveRole === "DELIVERY_DRIVER") {
      router.replace("/admin/delivery/pending");
    }
  }, [effectiveRole, router]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadData(false);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadData]);

  useAdminLiveRefresh(() => loadData(true), { intervalMs: 15_000, minIntervalMs: 5_000 });

  const pendingNeedingAction = useMemo(
    () => pending.filter(isDeliveryActionRequired).slice(0, 5),
    [pending]
  );

  if (isLoading) {
    return (
      <AdminSectionSkeleton
        title="A preparar o modulo de entregas"
        message="Estamos a ler o escritorio, as entregas activas e as metricas do dia para esta equipa."
        rows={4}
      />
    );
  }

  return (
    <DeliveryPageFrame
      eyebrow="Operacao local"
      title="Entregas"
      description="Controla o escritorio, define a taxa local, atribui estafetas e acompanha tudo ate a confirmacao no destino."
      actions={
        <>
          <button
            type="button"
            onClick={() =>
              exportCsv("delivery-dashboard.csv", [
                ["Indicador", "Valor"],
                ["No escritorio aguardando", String(stats?.awaitingAtOffice ?? 0)],
                ["Em entrega agora", String(stats?.activeNow ?? 0)],
                ["Entregues hoje", String(stats?.deliveredToday ?? 0)],
                ["Taxa de sucesso", `${stats?.successRate ?? 0}%`],
              ])
            }
            className="admin-button-muted"
          >
            Exportar
          </button>
          <Link href="/admin/delivery/pending" className="admin-button-danger">
            Atribuir entrega
          </Link>
        </>
      }
    >
      {error ? <AdminBanner message={error} tone="error" /> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Link href="/admin/delivery/pending" className="block">
          <StatCard label="No escritorio aguardando" value={String(stats?.awaitingAtOffice ?? 0)} helper="Abrir lista para taxar e atribuir estafeta." accent="#E8431A" />
        </Link>
        <Link href="/admin/delivery/active" className="block">
          <StatCard label="Em entrega agora" value={String(stats?.activeNow ?? 0)} helper="Abrir lista de rotas activas." accent="#0F766E" />
        </Link>
        <StatCard label="Entregues hoje" value={String(stats?.deliveredToday ?? 0)} helper="Fechos confirmados desde a meia-noite." accent="#639922" />
        <StatCard label="Taxa de sucesso" value={formatRelativePercent(stats?.successRate ?? 0)} helper="Entregas concluídas sem problema reportado." accent="#1D4ED8" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="admin-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">Prioridade imediata</p>
              <h2 className="mt-2 font-[family-name:var(--font-sora)] text-xl font-semibold">Pendentes no escritorio</h2>
            </div>
            <Link href="/admin/delivery/pending" className="text-sm font-semibold text-[var(--color-danger)]">
              Ver tudo
            </Link>
          </div>
          <div className="mt-5 space-y-3">
            {(pendingNeedingAction.length > 0 ? pendingNeedingAction : pending.slice(0, 4)).map((order) => {
              const needsAttention = isDeliveryActionRequired(order);
              return (
              <div key={order.id} className={`relative rounded-[24px] border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-4 ${needsAttention ? "ring-1 ring-[rgba(249,115,22,0.18)]" : ""}`}>
                {needsAttention ? <AttentionDot className="absolute right-4 top-4" label="Entrega ainda precisa de acao" /> : null}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="inline-flex items-center gap-2 font-[family-name:var(--font-sora)] text-lg font-semibold text-[var(--color-text-primary)]">
                      {needsAttention ? <AttentionDot label="Entrega ainda precisa de acao" className="lg:hidden" /> : null}
                      {order.number}
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{order.customerName}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${order.deliveryFee ? "bg-[#EAF3DE] text-[#27500A]" : "bg-[#FAEEDA] text-[#633806]"}`}>
                    {order.deliveryFee ? "Preco definido" : "Falta taxar"}
                  </span>
                </div>
                <div className="mt-3">
                  <DeliveryAddressDetails order={order} compact />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(order.items.length > 0 ? order.items.slice(0, 3).map((i) => i.productName) : order.itemsSummary.slice(0, 3)).map((name) => (
                    <span key={name} className="rounded-full bg-[var(--color-background-tertiary)] px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)]">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
              );
            })}
            {pending.length === 0 ? (
              <AdminStateCard title="Sem fila no escritorio" message="Todos os pedidos locais ja seguiram para a rota ou foram fechados." compact />
            ) : null}
          </div>
        </div>

        <ActiveDeliveriesList orders={active} />
      </div>

      <DeliveryMap orders={active} />
    </DeliveryPageFrame>
  );
}

function OrderItemsTable({ items }: { items: DeliveryOrderItem[] }) {
  return (
    <div className="overflow-hidden rounded-[20px] border border-[var(--color-border)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-background-secondary)]">
            <th className="px-4 py-2 text-left text-xs font-semibold text-[var(--color-text-secondary)]">Produto</th>
            <th className="px-4 py-2 text-left text-xs font-semibold text-[var(--color-text-secondary)]">Origem</th>
            <th className="px-4 py-2 text-center text-xs font-semibold text-[var(--color-text-secondary)]">Qtd</th>
            <th className="px-4 py-2 text-right text-xs font-semibold text-[var(--color-text-secondary)]">Unitario</th>
            <th className="px-4 py-2 text-right text-xs font-semibold text-[var(--color-text-secondary)]">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.productCode ?? index} className="border-b border-[var(--color-border)] last:border-0">
              <td className="px-4 py-2">
                <p className="font-medium text-[var(--color-text-primary)]">{item.productName}</p>
                {item.productCode ? (
                  <p className="text-xs text-[var(--color-text-secondary)]">{item.productCode}</p>
                ) : null}
              </td>
              <td className="px-4 py-2 text-xs font-semibold text-[var(--color-text-secondary)]">{item.originType}</td>
              <td className="px-4 py-2 text-center text-[var(--color-text-secondary)]">{item.quantity}</td>
              <td className="px-4 py-2 text-right text-[var(--color-text-secondary)]">
                {item.unitPrice != null ? formatMoney(item.unitPrice) : "--"}
              </td>
              <td className="px-4 py-2 text-right font-medium text-[var(--color-text-primary)]">
                {item.subtotal != null ? formatMoney(item.subtotal) : "--"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeliveryAddressDetails({
  order,
  compact = false,
}: {
  order: Pick<
    DeliveryPendingOrder | DeliveryActiveOrder,
    | "customerPhone"
    | "recipientPhone"
    | "number"
    | "address"
    | "deliveryCity"
    | "deliveryNeighborhood"
    | "deliveryStreet"
    | "houseNumber"
    | "deliveryReference"
    | "googleMapsLink"
  >;
  compact?: boolean;
}) {
  const phone = order.recipientPhone || order.customerPhone;
  const whatsappAddressUrl = buildWhatsappAddressRequestUrl(order.number, phone);
  const whatsappArrivalUrl = buildWhatsappArrivalNoticeUrl(order.number, phone);
  const missingAddress =
    !order.deliveryCity ||
    !order.deliveryNeighborhood ||
    !order.deliveryStreet ||
    !order.deliveryReference;
  const rows = [
    ["Telefone", phone],
    ["Rua / Av.", order.deliveryStreet],
    ["Numero da casa", order.houseNumber],
    ["Bairro", order.deliveryNeighborhood],
    ["Cidade", order.deliveryCity],
    ["Referencia", order.deliveryReference],
  ].filter(([, value]) => Boolean(value));

  return (
    <div className={`rounded-[20px] border border-[var(--color-border)] bg-[var(--color-background-tertiary)] ${compact ? "p-3" : "p-4"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">Contacto e morada</p>
        {order.googleMapsLink ? (
          <a
            href={order.googleMapsLink}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-danger)]"
          >
            Abrir Google Maps
          </a>
        ) : (
          <span className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-tertiary)]">
            Google Maps nao informado
          </span>
        )}
      </div>
      <p className="mt-3 text-sm font-medium text-[var(--color-text-primary)]">{order.address}</p>
      {rows.length > 0 ? (
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-[var(--color-background-secondary)] px-3 py-2">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">{label}</dt>
              <dd className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">
                {label === "Telefone" && phone ? (
                  <WhatsAppPhone phone={phone} className="text-[var(--color-danger)]" />
                ) : (
                  value
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {missingAddress ? (
        <div className="mt-4 rounded-2xl border border-[rgba(248,113,113,0.35)] bg-[rgba(248,113,113,0.08)] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-danger)]">Morada pendente</p>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            O cliente ainda nao confirmou todos os dados. Quando a encomenda aparecer em Meus pedidos, ele tera o botao para preencher a morada.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {phone ? (
              <a
                href={`tel:${phone}`}
                className="inline-flex rounded-full bg-[var(--color-danger)] px-3 py-2 text-xs font-semibold text-white"
              >
                Ligar cliente
              </a>
            ) : null}
            {whatsappAddressUrl ? (
              <a
                href={whatsappAddressUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-full border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-text-primary)]"
              >
                Pedir endereco por WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      ) : phone || whatsappArrivalUrl ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {phone ? (
            <a
              href={`tel:${phone}`}
              className="inline-flex rounded-full bg-[var(--color-danger)] px-3 py-2 text-xs font-semibold text-white"
            >
              Ligar cliente
            </a>
          ) : null}
          {whatsappArrivalUrl ? (
            <a
              href={whatsappArrivalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex rounded-full border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-text-primary)]"
            >
              Informar chegada por WhatsApp
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function DeliveryPendingView() {
  const { effectiveRole } = useAdminAuth();
  const [orders, setOrders] = useState<DeliveryPendingOrder[]>([]);
  const [drivers, setDrivers] = useState<DeliveryDriver[]>([]);
  const [forms, setForms] = useState<Record<number, PendingFormState>>({});
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const driverMode = effectiveRole === "DELIVERY_DRIVER";

  const loadData = useCallback(async (background = false) => {
    try {
      const ordersPayload = await adminApiFetch<DeliveryPendingOrder[]>("/api/admin/delivery/pending");
      const driversPayload = driverMode
        ? { content: [] }
        : await adminApiFetch<DeliveryDriversResponse>("/api/admin/delivery/drivers");
      setOrders([...ordersPayload].sort((left, right) => Number(isDeliveryActionRequired(right)) - Number(isDeliveryActionRequired(left))));
      setDrivers(driversPayload.content);
      setForms((current) => {
        const next = createInitialPendingForms(ordersPayload);
        return Object.keys(current).length > 0 ? { ...next, ...current } : next;
      });
      if (!background) {
        setFeedback(null);
      }
    } catch (loadError) {
      if (!background) {
        setFeedback({
          tone: "error",
          message: loadError instanceof Error ? loadError.message : "Nao foi possivel carregar a fila do escritorio.",
        });
      }
    } finally {
      if (!background) {
        setLoading(false);
      }
    }
  }, [driverMode]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadData(false);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadData]);

  useAdminLiveRefresh(() => loadData(true), { intervalMs: 15_000, minIntervalMs: 5_000 });

  function updateForm(orderId: number, patch: Partial<PendingFormState>) {
    setForms((current) => ({
      ...current,
      [orderId]: {
        ...current[orderId],
        ...patch,
      },
    }));
  }

  function updateEstimatedDeliveryPart(orderId: number, part: "hours" | "minutes", value: string) {
    const current = getEstimatedDeliveryParts(forms[orderId]?.estimatedDeliveryTime);
    const numericValue = Number(value);
    const nextHours = part === "hours" ? numericValue : current.hours;
    const nextMinutes = part === "minutes" ? numericValue : current.minutes;

    updateForm(orderId, {
      estimatedDeliveryTime: combineEstimatedDeliveryParts(nextHours, nextMinutes),
    });
  }

  function setEstimatedDeliveryPreset(orderId: number, minutes: number) {
    updateForm(orderId, {
      estimatedDeliveryTime: formatEstimatedDeliveryValue(minutes),
    });
  }

  async function defineFee(order: DeliveryPendingOrder) {
    if (!isReadyForDeliveryStatus(order.status)) {
      setFeedback({
        tone: "error",
        message: `${order.number} ainda nao esta pronto para entrega. Aguarda o estado READY_FOR_DELIVERY.`,
      });
      return;
    }

    const form = forms[order.id];
    const fee = Number(form?.deliveryFee ?? 0);
    const estimatedDeliveryMinutes = parseEstimatedDeliveryMinutes(form?.estimatedDeliveryTime);
    if (!Number.isFinite(fee) || fee <= 0) {
      setFeedback({ tone: "error", message: `Define um preco de entrega valido para ${order.number}.` });
      return;
    }

    setBusyId(order.id);
    setFeedback({ tone: "loading", message: `A guardar a taxa local de ${order.number} e a preparar a notificacao do cliente.` });
    try {
      await adminApiFetch(`/api/orders/${order.id}/delivery-fee`, {
        method: "PUT",
        body: JSON.stringify({
          deliveryFee: fee,
          estimatedDeliveryTime: estimatedDeliveryMinutes > 0 ? estimatedDeliveryMinutes / 60 : null,
          notes: form?.notes?.trim() || null,
        }),
      });
      await loadData(true);
      setFeedback({
        tone: "success",
        message: `Taxa definida para ${order.number}. O cliente ja pode ver o valor final e o tempo estimado.`,
      });
    } catch (saveError) {
      setFeedback({
        tone: "error",
        message: saveError instanceof Error ? saveError.message : "Nao foi possivel definir a taxa de entrega.",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function assignDriver(order: DeliveryPendingOrder) {
    if (!isReadyForDeliveryStatus(order.status)) {
      setFeedback({
        tone: "error",
        message: `${order.number} ainda nao esta pronto para atribuir estafeta.`,
      });
      return;
    }

    const driverId = forms[order.id]?.driverId?.trim();
    if (!driverId) {
      setFeedback({ tone: "error", message: `Seleciona um estafeta para ${order.number}.` });
      return;
    }

    setBusyId(order.id);
    setFeedback({ tone: "loading", message: `A atribuir ${order.number} ao estafeta escolhido.` });
    try {
      await adminApiFetch(`/api/orders/${order.id}/assign-driver`, {
        method: "PUT",
        body: JSON.stringify({ driverId }),
      });
      await loadData(true);
      setFeedback({ tone: "success", message: `Entrega ${order.number} atribuida com sucesso.` });
    } catch (saveError) {
      setFeedback({
        tone: "error",
        message: saveError instanceof Error ? saveError.message : "Nao foi possivel atribuir o estafeta.",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function claimDelivery(order: DeliveryPendingOrder) {
    if (!isReadyForDeliveryStatus(order.status)) {
      setFeedback({
        tone: "error",
        message: `${order.number} ainda nao esta pronto para ser pego no escritorio.`,
      });
      return;
    }

    setBusyId(order.id);
    setFeedback({ tone: "loading", message: `A pegar ${order.number} para a tua rota.` });
    try {
      await adminApiFetch(`/api/orders/${order.id}/delivery-claim`, {
        method: "POST",
      });
      await loadData(true);
      setFeedback({ tone: "success", message: `${order.number} ficou atribuido a ti. Define a taxa e inicia a viagem quando estiver pronto.` });
    } catch (saveError) {
      setFeedback({
        tone: "error",
        message: saveError instanceof Error ? saveError.message : "Nao foi possivel pegar esta encomenda.",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function startDelivery(order: DeliveryPendingOrder) {
    if (!isReadyForDeliveryStatus(order.status)) {
      setFeedback({
        tone: "error",
        message: `${order.number} ainda nao esta pronto para sair. Primeiro confirma que esta pronto para entrega.`,
      });
      return;
    }

    setBusyId(order.id);
    setFeedback({ tone: "loading", message: `A iniciar a entrega de ${order.number}.` });
    try {
      await adminApiFetch(`/api/orders/${order.id}/delivery-start`, {
        method: "POST",
      });
      await loadData(true);
      setFeedback({ tone: "success", message: `Entrega ${order.number} enviada para rota.` });
    } catch (saveError) {
      setFeedback({
        tone: "error",
        message: saveError instanceof Error ? saveError.message : "Nao foi possivel iniciar esta entrega.",
      });
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <AdminSectionSkeleton
        title="A montar pedidos no escritorio"
        message="Estamos a reunir taxa local, motoristas disponiveis e fila de saida para entrega."
        rows={4}
      />
    );
  }

  return (
    <DeliveryPageFrame
      eyebrow="No escritorio"
      title={driverMode ? "Encomendas para pegar" : "Pedidos prontos para sair"}
      description={driverMode
        ? "Ve as encomendas disponiveis no escritorio, pega uma para ti, define a taxa e inicia a viagem."
        : "Define o preco local, avisa o cliente, atribui o estafeta e so depois liberta a entrega para OUT_FOR_DELIVERY."}
      actions={<Link href="/admin/delivery/active" className="admin-button-muted">Ver entregas activas</Link>}
    >
      <AdminFeedbackDock feedback={feedback} onClose={() => setFeedback(null)} />

      {orders.length === 0 ? (
        <AdminStateCard
          title={driverMode ? "Sem encomendas disponiveis" : "Sem pedidos no escritorio"}
          message={driverMode ? "Nao ha encomendas no escritorio para pegar neste momento." : "Nao ha encomendas prontas para entrega a aguardar taxa ou saida local."}
        />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const form = forms[order.id] ?? {
              deliveryFee: "",
              estimatedDeliveryTime: "",
              notes: "",
              driverId: "",
            };
            const estimatedDeliveryParts = getEstimatedDeliveryParts(form.estimatedDeliveryTime);
            const isRetry = (order.deliveryAttempt ?? 1) > 1;
            const isReadyForDelivery = isReadyForDeliveryStatus(order.status);
            const hasFee = Number(order.deliveryFee ?? Number(form.deliveryFee || 0)) > 0;
            const feeAlreadyNotified = Boolean(order.deliveryFeeSetAt) && !isRetry;
            const hasDriver = Boolean(order.assignedDriverId);
            const canStart = isReadyForDelivery && hasFee && hasDriver;
            const hasSelectedDriver = Boolean(form.driverId?.trim());
            const startBlockReason = !isReadyForDelivery
              ? "Este pedido ainda nao esta pronto para entrega local."
              : driverMode && !hasDriver
                ? "Pega a encomenda primeiro para ela ficar atribuida a ti."
              : !hasFee
                ? "Define e notifica a taxa de entrega antes de iniciar."
              : !feeAlreadyNotified
                ? "Guarda a taxa e notifica o cliente antes de iniciar."
                  : !driverMode && drivers.length === 0
                    ? "Ainda nao ha estafetas disponiveis para atribuir."
                    : !hasDriver && hasSelectedDriver
                      ? "Clica em \"Atribuir a estafeta\" para confirmar o estafeta escolhido."
                      : !hasDriver
                        ? "Seleciona e atribui um estafeta antes de iniciar a entrega."
                        : "";

            return (
              <section key={order.id} className={`admin-card relative p-5 ${!canStart ? "ring-1 ring-[rgba(249,115,22,0.18)]" : ""}`}>
                {!canStart ? <AttentionDot className="absolute right-5 top-5" label="Falta concluir taxa ou estafeta" /> : null}
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="rounded-full bg-[rgba(232,67,26,0.1)] px-3 py-1 text-xs font-semibold text-[var(--color-danger)]">
                        {!canStart ? <AttentionDot label="Falta concluir taxa ou estafeta" className="mr-2 h-2.5 w-2.5" /> : null}
                        {order.number}
                      </span>
                      <span className="rounded-full bg-[var(--color-background-tertiary)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)]">
                        {order.sourceStore}
                      </span>
                      {!isReadyForDelivery ? (
                        <span className="rounded-full bg-[#FAEEDA] px-3 py-1 text-xs font-semibold text-[#8A5A00]">
                          Ainda nao pronto
                        </span>
                      ) : null}
                      {order.assignedDriverName ? (
                        <DriverContactBadge name={order.assignedDriverName} phone={order.assignedDriverPhone} />
                      ) : null}
                      {isRetry ? (
                        <span className="rounded-full bg-[#FEF3C7] px-3 py-1 text-xs font-semibold text-[#92400E]">
                          {(order.deliveryAttempt ?? 2)}ª via
                        </span>
                      ) : null}
                    </div>
                    {isRetry && order.lastIssueType ? (
                      <div className="rounded-[18px] border border-[rgba(232,67,26,0.2)] bg-[#FFF0EC] px-4 py-3 text-sm text-[#C13210]">
                        Tentativa anterior falhou — motivo: <strong>{ISSUE_OPTIONS.find((o) => o.value === order.lastIssueType)?.label ?? order.lastIssueType}</strong>. Podes alterar o preco antes de reenviar.
                      </div>
                    ) : null}
                    <div>
                      <h2 className="font-[family-name:var(--font-sora)] text-xl font-semibold text-[var(--color-text-primary)]">
                        {order.customerName}
                      </h2>
                      <div className="mt-3">
                        <DeliveryAddressDetails order={order} />
                      </div>
                      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                        Chegada ao escritorio: {formatDateTime(order.officeArrivedAt)}
                      </p>
                    </div>
                    {order.items.length > 0 ? (
                      <OrderItemsTable items={order.items} />
                    ) : order.itemsSummary.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {order.itemsSummary.map((item) => (
                          <span key={item} className="rounded-full bg-[var(--color-background-secondary)] px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)]">
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="grid gap-3 rounded-[20px] border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-4 text-sm sm:grid-cols-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">Subtotal pedido</p>
                        <p className="mt-1 font-semibold text-[var(--color-text-primary)]">{formatMoney(order.baseAmount ?? 0)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">Delivery fee</p>
                        <p className="mt-1 font-semibold text-[var(--color-text-primary)]">{formatMoney(order.deliveryFee ?? 0)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">Total final</p>
                        <p className="mt-1 font-semibold text-[var(--color-danger)]">{formatMoney(order.totalAmount ?? 0)}</p>
                      </div>
                      {order.deliveryFeeSetBy ? (
                        <p className="sm:col-span-3 text-xs text-[var(--color-text-secondary)]">
                          Ultima acao: taxa definida/notificada por {order.deliveryFeeSetBy}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid min-w-full gap-3 xl:min-w-[520px] xl:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">Preco de entrega (MZN)</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.deliveryFee}
                        onChange={(event) => updateForm(order.id, { deliveryFee: event.target.value })}
                        disabled={feeAlreadyNotified}
                        className="admin-input w-full"
                      />
                    </label>
                    <div className="block">
                      <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">Tempo estimado</span>
                      <div className="grid grid-cols-[1fr_1fr] gap-2">
                        <label className="block">
                          <span className="sr-only">Horas</span>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              max="72"
                              step="1"
                              value={estimatedDeliveryParts.hours}
                              onChange={(event) => updateEstimatedDeliveryPart(order.id, "hours", event.target.value)}
                              disabled={feeAlreadyNotified}
                              className="admin-input w-full pr-14"
                            />
                            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[var(--color-text-secondary)]">
                              h
                            </span>
                          </div>
                        </label>
                        <label className="block">
                          <span className="sr-only">Minutos</span>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              max="59"
                              step="5"
                              value={estimatedDeliveryParts.minutes}
                              onChange={(event) => updateEstimatedDeliveryPart(order.id, "minutes", event.target.value)}
                              disabled={feeAlreadyNotified}
                              className="admin-input w-full pr-16"
                            />
                            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[var(--color-text-secondary)]">
                              min
                            </span>
                          </div>
                        </label>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {ESTIMATED_DELIVERY_PRESETS.map((preset) => (
                          <button
                            key={preset.minutes}
                            type="button"
                            onClick={() => setEstimatedDeliveryPreset(order.id, preset.minutes)}
                            disabled={feeAlreadyNotified}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              estimatedDeliveryParts.totalMinutes === preset.minutes
                                ? "border-[#E8431A] bg-[rgba(232,67,26,0.16)] text-[#FF8066]"
                                : "border-[var(--color-border)] bg-[var(--color-background-secondary)] text-[var(--color-text-secondary)] hover:border-[rgba(232,67,26,0.28)] hover:text-[var(--color-danger)]"
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="block xl:col-span-2">
                      <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">Notas operacionais</span>
                      <textarea
                        value={form.notes}
                        onChange={(event) => updateForm(order.id, { notes: event.target.value })}
                        disabled={feeAlreadyNotified}
                        className="admin-input min-h-[88px] w-full resize-none"
                        placeholder="Observacoes para a equipa de entrega ou para o cliente."
                      />
                    </label>
                    <div className="xl:col-span-2 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => void defineFee(order)}
                        disabled={!isReadyForDelivery || (driverMode && !hasDriver) || feeAlreadyNotified || busyId === order.id}
                        className="admin-button-danger disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {feeAlreadyNotified ? "Cliente notificado" : busyId === order.id ? "A guardar..." : "Definir preco e notificar cliente"}
                      </button>

                      {driverMode ? (
                        <button
                          type="button"
                          onClick={() => void claimDelivery(order)}
                          disabled={!isReadyForDelivery || hasDriver || busyId === order.id}
                          className="admin-button-muted disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {hasDriver ? "Ja esta contigo" : busyId === order.id ? "A pegar..." : "Pegar encomenda"}
                        </button>
                      ) : (
                      <div className="flex min-w-[260px] flex-1 gap-3">
                        <select
                          value={form.driverId}
                          onChange={(event) => updateForm(order.id, { driverId: event.target.value })}
                          className="admin-input flex-1"
                        >
                          <option value="">Seleciona o estafeta</option>
                          {drivers.map((driver) => (
                            <option key={driver.id} value={driver.id}>
                              {driver.name} · {humanizeRole("DELIVERY_DRIVER")}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => void assignDriver(order)}
                          disabled={!isReadyForDelivery || !hasFee || busyId === order.id}
                          className="admin-button-muted disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Atribuir a estafeta
                        </button>
                      </div>
                      )}

                      <button
                        type="button"
                        onClick={() => void startDelivery(order)}
                        disabled={!canStart || busyId === order.id}
                        title={!canStart ? startBlockReason : undefined}
                        className="rounded-full bg-[#111827] px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        Mandar para entrega
                      </button>
                    </div>
                    {!canStart && startBlockReason ? (
                      <div className="xl:col-span-2 rounded-[20px] border border-[rgba(232,67,26,0.2)] bg-[#FFF0EC] px-4 py-3 text-sm font-medium text-[#C13210]">
                        Nao podes iniciar ainda: {startBlockReason}
                      </div>
                    ) : null}
                    {feeAlreadyNotified ? (
                      <div className="xl:col-span-2 rounded-[20px] bg-[#EAF3DE] px-4 py-3 text-sm font-medium text-[#27500A]">
                        Cliente ja foi notificado sobre a taxa. Proxima accao: atribuir estafeta, iniciar entrega ou cancelar o pedido.
                      </div>
                    ) : !hasFee ? (
                      <div className="xl:col-span-2 rounded-[20px] bg-[#FAEEDA] px-4 py-3 text-sm font-medium text-[#8A5A00]">
                        Definir preco antes de iniciar.
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </DeliveryPageFrame>
  );
}

export function DeliveryActiveView() {
  const router = useRouter();
  const { effectiveRole } = useAdminAuth();
  const [orders, setOrders] = useState<DeliveryActiveOrder[]>([]);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [problemModal, setProblemModal] = useState<{
    order: DeliveryActiveOrder;
    type: string;
    note: string;
  } | null>(null);
  const [confirmOrder, setConfirmOrder] = useState<DeliveryActiveOrder | null>(null);
  const [collectionModal, setCollectionModal] = useState<DeliveryCollectionModalState | null>(null);
  const [markNotCollectedModal, setMarkNotCollectedModal] = useState<{ order: DeliveryActiveOrder; reason: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadData = useCallback(async (background = false) => {
    try {
      const payload = await adminApiFetch<DeliveryActiveOrder[]>("/api/admin/delivery/active");
      setOrders([...payload].sort((left, right) => Number(isDeliveryActionRequired(right)) - Number(isDeliveryActionRequired(left))));
      if (!background) {
        setFeedback(null);
      }
    } catch (loadError) {
      if (!background) {
        setFeedback({
          tone: "error",
          message: loadError instanceof Error ? loadError.message : "Nao foi possivel carregar as entregas activas.",
        });
      }
    } finally {
      if (!background) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadData(false);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadData]);

  useAdminLiveRefresh(() => loadData(true), { intervalMs: 15_000, minIntervalMs: 5_000 });

  const visibleOrders = useMemo(() => orders, [orders]);

  async function confirmDelivery(order: DeliveryActiveOrder, deliveryNote: string) {
    if (order.status !== "OUT_FOR_DELIVERY" && order.status !== "AWAITING_DELIVERY_PAYMENT") {
      setFeedback({
        tone: "error",
        message: `${order.number} ainda nao saiu do escritorio. Inicia a entrega antes de confirmar.`,
      });
      setConfirmOrder(null);
      return;
    }

    if (hasPendingDeliveryCharge(order)) {
      setFeedback({
        tone: "error",
        message: "Ainda existe valor pendente. Faca a cobranca antes de concluir a entrega.",
      });
      setConfirmOrder(null);
      return;
    }

    setBusyId(order.id);
    setFeedback({ tone: "loading", message: `A confirmar a entrega de ${order.number}.` });
    try {
      await adminApiFetch(`/api/orders/${order.id}/delivery-complete`, {
        method: "POST",
        body: JSON.stringify({ deliveryNote }),
      });
      await loadData(true);
      setFeedback({ tone: "success", message: `Entrega ${order.number} confirmada com sucesso.` });
      setConfirmOrder(null);
      router.refresh();
    } catch (saveError) {
      setFeedback({
        tone: "error",
        message: saveError instanceof Error ? saveError.message : "Nao foi possivel confirmar a entrega.",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function reportProblem() {
    if (!problemModal) {
      return;
    }

    const note = problemModal.note.trim();
    if (!note) {
      setFeedback({ tone: "error", message: "Regista uma nota curta antes de reportar o problema." });
      return;
    }

    setBusyId(problemModal.order.id);
    setFeedback({ tone: "loading", message: `A registar o problema da entrega ${problemModal.order.number}.` });
    try {
      await adminApiFetch(`/api/orders/${problemModal.order.id}/delivery-issue`, {
        method: "POST",
        body: JSON.stringify({
          type: problemModal.type,
          note,
        }),
      });
      await loadData(true);
      setFeedback({ tone: "success", message: `Problema registado para ${problemModal.order.number}. O pedido voltou ao escritorio para nova tentativa.` });
      setProblemModal(null);
    } catch (saveError) {
      setFeedback({
        tone: "error",
        message: saveError instanceof Error ? saveError.message : "Nao foi possivel reportar o problema.",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function startAssignedTrip(order: DeliveryActiveOrder) {
    if (!isReadyForDeliveryStatus(order.status)) {
      setFeedback({
        tone: "error",
        message: `${order.number} ainda nao esta pronto para iniciar viagem.`,
      });
      return;
    }

    setBusyId(order.id);
    setFeedback({ tone: "loading", message: `A iniciar a viagem de ${order.number}.` });
    try {
      await adminApiFetch(`/api/orders/${order.id}/delivery-start`, {
        method: "POST",
      });
      await loadData(true);
      setFeedback({ tone: "success", message: `Viagem ${order.number} iniciada. Boa rota.` });
      router.refresh();
    } catch (saveError) {
      setFeedback({
        tone: "error",
        message: saveError instanceof Error ? saveError.message : "Nao foi possivel iniciar a viagem.",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function markNotCollected() {
    if (!markNotCollectedModal) return;
    const reason = markNotCollectedModal.reason.trim();
    if (!reason) {
      setFeedback({ tone: "error", message: "Informe o motivo pelo qual nao foi possivel cobrar." });
      return;
    }
    setBusyId(markNotCollectedModal.order.id);
    setFeedback({ tone: "loading", message: `A registar cobranca nao realizada para ${markNotCollectedModal.order.number}.` });
    try {
      await adminApiFetch(`/api/admin/orders/${markNotCollectedModal.order.id}/cod/mark-not-collected`, {
        method: "PATCH",
        body: JSON.stringify({ reason }),
      });
      await loadData(true);
      setFeedback({ tone: "success", message: `Cobranca nao realizada registada para ${markNotCollectedModal.order.number}. Pedido voltou ao escritorio.` });
      setMarkNotCollectedModal(null);
      router.refresh();
    } catch (saveError) {
      setFeedback({
        tone: "error",
        message: saveError instanceof Error ? saveError.message : "Nao foi possivel registar cobranca nao realizada.",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function sendPaySuiteDeliveryCharge(order: DeliveryActiveOrder) {
    if (collectionModal?.order.id !== order.id) {
      setFeedback({ tone: "error", message: "Estado do modal incoerente. Fecha e abre de novo." });
      return;
    }
    const chargeAmount = resolveDeliveryChargeAmount(order);
    if (chargeAmount <= 0) {
      setFeedback({ tone: "error", message: `Nao foi possivel determinar o valor a cobrar para ${order.number}. Verifica o pedido.` });
      return;
    }
    setBusyId(order.id);
    setFeedback({ tone: "loading", message: `A preparar link PaySuite para ${order.number}.` });
    try {
      const result = await adminApiFetch<DeliveryCollectionResponse>(`/api/admin/delivery/orders/${order.id}/collection`, {
        method: "POST",
        body: JSON.stringify({
          method: "PAYSUITE",
          amount: chargeAmount,
          paySuiteMethod: "MPESA",
          returnUrl: `${CLIENT_APP_URL}/orders/${order.id}/payment?mode=paysuite&purpose=delivery`,
        }),
      });
      await loadData(true);
      const paymentUrl = result.paymentUrl ?? result.checkoutUrl ?? null;
      if (paymentUrl && typeof navigator !== "undefined") {
        await navigator.clipboard?.writeText(paymentUrl).catch(() => undefined);
      }
      setCollectionModal((current) =>
        current && current.order.id === order.id ? { ...current, paymentUrl } : current,
      );
      setFeedback({ tone: "success", message: "Link de pagamento enviado ao cliente." });
      router.refresh();
    } catch (saveError) {
      setFeedback({
        tone: "error",
        message: saveError instanceof Error ? saveError.message : "Nao foi possivel criar a cobranca PaySuite da entrega.",
      });
    } finally {
      setBusyId(null);
    }
  }
  async function registerManualTransfer(order: DeliveryActiveOrder) {
    const transferReference = collectionModal?.transferReference.trim() ?? "";
    if (!transferReference) {
      setFeedback({ tone: "error", message: "Regista a referencia da transferencia antes de enviar para o financeiro." });
      return;
    }

    setBusyId(order.id);
    setFeedback({ tone: "loading", message: `A abrir cobranca manual para ${order.number}.` });
    try {
      await adminApiFetch<DeliveryCollectionResponse>(`/api/admin/delivery/orders/${order.id}/collection`, {
        method: "POST",
        body: JSON.stringify({
          method: "MANUAL_TRANSFER",
          amount: resolveDeliveryChargeAmount(order),
          transactionReference: transferReference,
          payerName: collectionModal?.transferPayerName.trim() || order.customerName,
          payerBank: collectionModal?.transferPayerBank.trim() || "Transferencia bancaria",
        }),
      });
      await loadData(true);
      setCollectionModal(null);
      setFeedback({ tone: "success", message: `Transferencia registada para ${order.number}. Ficou na fila de pagamentos manuais.` });
      router.push(`/admin/payments?orderId=${order.id}&queue=AWAITING`);
      router.refresh();
    } catch (saveError) {
      setFeedback({
        tone: "error",
        message: saveError instanceof Error ? saveError.message : "Nao foi possivel abrir o fluxo de transferencia.",
      });
    } finally {
      setBusyId(null);
    }
  }
  async function confirmCodCash(order: DeliveryActiveOrder) {
    const amountCollected = resolveDeliveryChargeAmount(order);
    if (!collectionModal?.cashConfirmed || collectionModal.order.id !== order.id) {
      setFeedback({ tone: "error", message: "Confirmo que recebi o dinheiro em maos deve estar assinalado." });
      return;
    }

    if (!Number.isFinite(amountCollected) || amountCollected <= 0) {
      setFeedback({ tone: "error", message: "Nao foi possivel determinar o valor recebido em dinheiro." });
      return;
    }

    setBusyId(order.id);
    setFeedback({ tone: "loading", message: `A confirmar recebimento de dinheiro para ${order.number}.` });
    try {
      await adminApiFetch<DeliveryCollectionResponse>(`/api/admin/delivery/orders/${order.id}/collection`, {
        method: "POST",
        body: JSON.stringify({
          method: "CASH",
          amountCollected,
          amount: amountCollected,
        }),
      });
      setCollectionModal(null);
      // Auto-complete delivery after cash received — consistent with PaySuite flow.
      // deliveryPaymentStatus is now RECEIVED so the BFF pre-check passes.
      try {
        await adminApiFetch(`/api/orders/${order.id}/delivery-complete`, {
          method: "POST",
          body: JSON.stringify({ deliveryNote: "Dinheiro recebido em maos. Entrega concluida." }),
        });
        setFeedback({ tone: "success", message: `Entrega ${order.number} concluida. Dinheiro recebido em maos.` });
      } catch {
        setFeedback({ tone: "success", message: `Dinheiro recebido para ${order.number}. Ja podes confirmar a entrega.` });
      }
      await loadData(true);
      router.refresh();
    } catch (saveError) {
      setFeedback({
        tone: "error",
        message: saveError instanceof Error ? saveError.message : "Nao foi possivel confirmar o pagamento COD.",
      });
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <AdminSectionSkeleton
        title="A abrir entregas activas"
        message="Estamos a seguir as rotas em curso, os estafetas e o tempo desde a saida do escritorio."
        rows={4}
      />
    );
  }

  return (
    <DeliveryPageFrame
      eyebrow="Rotas activas"
      title="Em entrega agora"
      description={effectiveRole === "DELIVERY_DRIVER"
        ? "Aqui entram as viagens atribuidas a ti. Inicia a viagem quando saires e depois fecha ou reporta incidente."
        : "Aqui entram entregas em rota, prontas para acompanhamento, fecho ou reporte de incidente."}
      actions={<Link href="/admin/delivery/history" className="admin-button-muted">Ver historico</Link>}
    >
      <AdminFeedbackDock feedback={feedback} onClose={() => setFeedback(null)} />

      {visibleOrders.length === 0 ? (
        <AdminStateCard
          title="Sem entregas activas"
          message={effectiveRole === "DELIVERY_DRIVER" ? "Nao tens rotas activas neste momento." : "Nao ha entregas em curso agora."}
        />
      ) : (
        <div className="grid gap-4">
          {visibleOrders.map((order) => {
            const isAwaitingPayment = order.status === "AWAITING_DELIVERY_PAYMENT";
            const isOnRoute = order.status === "OUT_FOR_DELIVERY" || isAwaitingPayment;
            const isCod = order.paymentMethod === "CASH_ON_DELIVERY";
            const chargeAmount = resolveDeliveryChargeAmount(order);
            const deliveryChargePending = hasPendingDeliveryCharge(order);
            const activeCodPaySuite = hasActiveCodPaySuiteCharge(order);
            const needsAttention = isDeliveryActionRequired(order);

            return (
            <section key={order.id} className={`admin-card relative p-5 ${needsAttention ? "ring-1 ring-[rgba(249,115,22,0.18)]" : ""}`}>
              {needsAttention ? <AttentionDot className="absolute right-5 top-5" label="Entrega ainda precisa de acao" /> : null}
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-[rgba(232,67,26,0.1)] px-3 py-1 text-xs font-semibold text-[var(--color-danger)]">
                      {needsAttention ? <AttentionDot label="Entrega ainda precisa de acao" className="mr-2 h-2.5 w-2.5" /> : null}
                      {order.number}
                    </span>
                    <DriverContactBadge name={order.driverName} phone={order.driverPhone} />
                    {!isOnRoute ? (
                      <span className="rounded-full bg-[#FAEEDA] px-3 py-1 text-xs font-semibold text-[#8A5A00]">
                        Viagem por iniciar
                      </span>
                    ) : isAwaitingPayment ? (
                      <span className="rounded-full bg-[#EEF2FF] px-3 py-1 text-xs font-semibold text-[#4338CA]">
                        Aguardando pagamento da entrega
                      </span>
                    ) : null}
                    {isCod ? (
                      <span className="rounded-full bg-[#FEF3C7] px-3 py-1 text-xs font-semibold text-[#92400E]">
                        COD
                      </span>
                    ) : null}
                    <span className="rounded-full bg-[var(--color-background-tertiary)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)]">
                      {order.sourceStore}
                    </span>
                    {(order.deliveryAttempt ?? 1) > 1 ? (
                      <span className="rounded-full bg-[#FEF3C7] px-3 py-1 text-xs font-semibold text-[#92400E]">
                        {order.deliveryAttempt}ª via
                      </span>
                    ) : null}
                  </div>
                  <div>
                    <h2 className="font-[family-name:var(--font-sora)] text-xl font-semibold text-[var(--color-text-primary)]">
                      {order.customerName}
                    </h2>
                    <div className="mt-3">
                      <DeliveryAddressDetails order={order} compact />
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-[22px] bg-[var(--color-background-secondary)] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">Saiu do escritorio</p>
                      <p className="mt-2 text-sm font-semibold text-[var(--color-text-primary)]">
                        {isOnRoute ? formatDateTime(order.leftOfficeAt) : "Ainda no escritorio"}
                      </p>
                    </div>
                    <div className="rounded-[22px] bg-[var(--color-background-secondary)] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">Tempo decorrido</p>
                      <p className="mt-2 text-sm font-semibold text-[var(--color-text-primary)]">{formatDuration(order.elapsedMinutes)}</p>
                    </div>
                    <div className="rounded-[22px] bg-[var(--color-background-secondary)] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">Taxa local</p>
                      <p className="mt-2 text-sm font-semibold text-[var(--color-text-primary)]">{formatMoney(order.deliveryFee ?? 0)}</p>
                    </div>
                  </div>
                </div>
                <div className="flex min-w-[280px] flex-col gap-3">
                  {!isOnRoute ? (
                    <button
                      type="button"
                      onClick={() => void startAssignedTrip(order)}
                      disabled={busyId === order.id}
                      className="admin-button-danger justify-center disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busyId === order.id ? "A iniciar..." : "Iniciar viagem"}
                    </button>
                  ) : null}

                  {isOnRoute ? (
                    <>
                      {activeCodPaySuite ? (
                        <>
                          <div className="rounded-[18px] bg-[#EEF2FF] px-4 py-3 text-sm font-medium text-[#4338CA]">
                            <p className="font-semibold">Pagamento em curso (PaySuite)</p>
                            <p className="mt-1 text-xs">Aguarda a confirmacao do cliente antes de cobrar novamente.</p>
                          </div>
                          <a
                            href={`${CLIENT_APP_URL}/orders/${order.id}/payment?mode=paysuite&purpose=delivery`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="admin-button-muted justify-center text-center"
                          >
                            Reenviar link
                          </a>
                        </>
                      ) : (isCod || deliveryChargePending) ? (
                        <button
                          type="button"
                          onClick={() => setCollectionModal({
                            order,
                            cashConfirmed: false,
                            transferReference: "",
                            transferPayerName: "",
                            transferPayerBank: "",
                            paymentUrl: null,
                          })}
                          disabled={busyId === order.id}
                          className="admin-button-danger justify-center disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {busyId === order.id ? "A registar..." : "Cobrar cliente"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setConfirmOrder(order)}
                        disabled={busyId === order.id || deliveryChargePending}
                        className="admin-button-muted justify-center disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Confirmar entrega
                      </button>
                      {deliveryChargePending && !activeCodPaySuite ? (
                        <p className="rounded-[18px] bg-[#EEF2FF] px-4 py-3 text-sm font-medium text-[#4338CA]">
                          Valor pendente: {formatMoney(chargeAmount)}. Resolve a cobranca antes de concluir a entrega.
                        </p>
                      ) : null}
                    </>
                  ) : null}

                  {isOnRoute && !isAwaitingPayment ? (
                    <button
                      type="button"
                      onClick={() => setProblemModal({ order, type: ISSUE_OPTIONS[0].value, note: "" })}
                      className="admin-button-muted justify-center"
                    >
                      Reportar problema
                    </button>
                  ) : null}

                  {isAwaitingPayment ? (
                    <button
                      type="button"
                      onClick={() => setMarkNotCollectedModal({ order, reason: "" })}
                      disabled={busyId === order.id}
                      className="admin-button-muted justify-center disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Nao consegui cobrar
                    </button>
                  ) : null}

                  {!isOnRoute ? (
                    <p className="rounded-[18px] bg-[#FAEEDA] px-4 py-3 text-sm font-medium text-[#8A5A00]">
                      Ja te foi atribuido. Clica em iniciar viagem quando saires do escritorio.
                    </p>
                  ) : null}
                </div>
              </div>
            </section>
            );
          })}
        </div>
      )}

      {collectionModal ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-[rgba(15,23,42,0.58)] px-3 py-4 sm:px-4 sm:py-6" onClick={() => setCollectionModal(null)}>
          <div
            className="admin-modal-panel flex w-full max-w-xl flex-col rounded-[22px] border border-[var(--color-border)] bg-[var(--color-background-secondary)] shadow-[0_24px_80px_rgba(15,23,42,0.22)] sm:rounded-[30px]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="admin-modal-body p-5 sm:p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(232,67,26,0.12)] text-[var(--color-danger)]">
                MT
              </div>
              <h2 className="mt-4 font-[family-name:var(--font-sora)] text-xl font-semibold text-[var(--color-text-primary)]">
                Cobranca da entrega
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
                Escolhe como o cliente vai liquidar a taxa local, saldo pendente ou total de entrega.
              </p>
              <div className="mt-4 rounded-[18px] bg-[var(--color-background-tertiary)] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">Total pendente a cobrar</p>
                <p className="mt-1 font-[family-name:var(--font-sora)] text-2xl font-semibold text-[var(--color-text-primary)]">
                  {formatMoney(resolveDeliveryChargeAmount(collectionModal.order))}
                </p>
                {collectionModal.order.remainingAmountOnDelivery != null &&
                  collectionModal.order.deliveryFee != null &&
                  collectionModal.order.deliveryFee > 0 ? (
                  <div className="mt-2 space-y-1 border-t border-[var(--color-border)] pt-2">
                    <div className="flex justify-between text-xs text-[var(--color-text-secondary)]">
                      <span>Produto pendente</span>
                      <span>{formatMoney(Math.max(0, Number(collectionModal.order.remainingAmountOnDelivery) - Number(collectionModal.order.deliveryFee)))}</span>
                    </div>
                    <div className="flex justify-between text-xs text-[var(--color-text-secondary)]">
                      <span>Taxa de entrega</span>
                      <span>{formatMoney(collectionModal.order.deliveryFee)}</span>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="mt-5 grid gap-3">
                <button
                  type="button"
                  onClick={() => void sendPaySuiteDeliveryCharge(collectionModal.order)}
                  disabled={busyId === collectionModal.order.id}
                  className="admin-button-danger justify-center disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Enviar link PaySuite ao cliente
                </button>
                {collectionModal.paymentUrl ? (
                  <div className="rounded-[18px] border border-[#BFDBFE] bg-[#EFF6FF] p-3 text-sm text-[#1D4ED8]">
                    <p className="font-semibold">Link de pagamento gerado e copiado.</p>
                    <p className="mt-1 text-xs" style={{ color: "#3B82F6" }}>Envia este link ao cliente para ele escolher o método de pagamento.</p>
                    <p className="mt-1 break-all text-xs">{collectionModal.paymentUrl}</p>
                    <a
                      href={collectionModal.paymentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex text-xs font-black underline"
                    >
                      Abrir página de pagamento
                    </a>
                  </div>
                ) : null}
                <div className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-4">
                  <div className="grid gap-3">
                    <input
                      value={collectionModal.transferReference}
                      onChange={(event) =>
                        setCollectionModal((current) =>
                          current ? { ...current, transferReference: event.target.value } : current,
                        )
                      }
                      className="admin-input w-full"
                      placeholder="Referencia da transferencia"
                    />
                    <input
                      value={collectionModal.transferPayerName}
                      onChange={(event) =>
                        setCollectionModal((current) =>
                          current ? { ...current, transferPayerName: event.target.value } : current,
                        )
                      }
                      className="admin-input w-full"
                      placeholder="Nome do pagador"
                    />
                    <input
                      value={collectionModal.transferPayerBank}
                      onChange={(event) =>
                        setCollectionModal((current) =>
                          current ? { ...current, transferPayerBank: event.target.value } : current,
                        )
                      }
                      className="admin-input w-full"
                      placeholder="Banco"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void registerManualTransfer(collectionModal.order)}
                  disabled={busyId === collectionModal.order.id || !collectionModal.transferReference.trim()}
                  className="admin-button-muted justify-center disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Registar transferencia
                </button>
                <div className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-4">
                  <label className="flex items-start gap-3 text-sm font-semibold text-[var(--color-text-primary)]">
                    <input
                      type="checkbox"
                      checked={collectionModal.cashConfirmed}
                      onChange={(event) =>
                        setCollectionModal((current) =>
                          current ? { ...current, cashConfirmed: event.target.checked } : current,
                        )
                      }
                      className="mt-1 h-4 w-4"
                    />
                    <span>Confirmo que recebi o dinheiro em maos</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => void confirmCodCash(collectionModal.order)}
                    disabled={busyId === collectionModal.order.id || !collectionModal.cashConfirmed}
                    className="admin-button-muted mt-3 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Receber em dinheiro
                  </button>
                </div>
              </div>
            </div>
            <div className="admin-modal-footer border-t border-[var(--color-border)] p-4 sm:p-6">
              <button
                type="button"
                onClick={() => setCollectionModal(null)}
                disabled={busyId === collectionModal.order.id}
                className="admin-button-muted w-full justify-center disabled:opacity-60"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <AdminConfirmDialog
        open={Boolean(confirmOrder)}
        title="Confirmar entrega ao cliente?"
        message="Esta acao vai marcar o pedido como entregue e fechar a rota deste estafeta."
        confirmLabel="Confirmar entrega"
        danger
        pending={isPending}
        onCancel={() => setConfirmOrder(null)}
        onConfirm={() => {
          if (!confirmOrder) {
            return;
          }
          startTransition(() => void confirmDelivery(confirmOrder, "Entrega confirmada no modulo de delivery."));
        }}
      />

      <AdminConfirmDialog
        open={Boolean(markNotCollectedModal)}
        title="Marcar cobranca como nao realizada?"
        message="O pedido voltara para DELIVERY_FAILED e sai da lista de entregas activas. Confirma o motivo."
        confirmLabel="Confirmar"
        danger
        pending={busyId === markNotCollectedModal?.order.id}
        onCancel={() => setMarkNotCollectedModal(null)}
        onConfirm={() => void markNotCollected()}
      >
        {markNotCollectedModal ? (
          <textarea
            value={markNotCollectedModal.reason}
            onChange={(event) =>
              setMarkNotCollectedModal((current) =>
                current ? { ...current, reason: event.target.value } : current,
              )
            }
            className="admin-input min-h-[80px] w-full resize-none"
            placeholder="Motivo: cliente ausente, recusou pagar, telefone desligado..."
          />
        ) : null}
      </AdminConfirmDialog>

      <AdminConfirmDialog
        open={Boolean(problemModal)}
        title="Reportar problema na entrega?"
        message="Escolhe o tipo de incidente e regista uma nota curta para a equipa acompanhar."
        confirmLabel="Registar problema"
        pending={busyId === problemModal?.order.id}
        onCancel={() => setProblemModal(null)}
        onConfirm={() => {
          void reportProblem();
        }}
      >
        {problemModal ? (
          <div className="space-y-3">
            <select
              value={problemModal.type}
              onChange={(event) =>
                setProblemModal((current) =>
                  current ? { ...current, type: event.target.value } : current,
                )
              }
              className="admin-input w-full"
            >
              {ISSUE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <textarea
              value={problemModal.note}
              onChange={(event) =>
                setProblemModal((current) =>
                  current ? { ...current, note: event.target.value } : current,
                )
              }
              className="admin-input min-h-[90px] w-full resize-none"
              placeholder="O que aconteceu no local?"
            />
          </div>
        ) : null}
      </AdminConfirmDialog>
    </DeliveryPageFrame>
  );
}

function DeliveryHistoryKpiCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "green" | "amber" | "orange" | "blue" | "neutral";
}) {
  const toneClass = {
    green: "from-[rgba(21,128,61,0.18)] to-[rgba(15,23,42,0.24)] text-[#86efac]",
    amber: "from-[rgba(245,158,11,0.18)] to-[rgba(15,23,42,0.24)] text-[#facc15]",
    orange: "from-[rgba(232,67,26,0.22)] to-[rgba(15,23,42,0.24)] text-[#fb923c]",
    blue: "from-[rgba(56,189,248,0.18)] to-[rgba(15,23,42,0.24)] text-[#7dd3fc]",
    neutral: "from-[rgba(148,163,184,0.14)] to-[rgba(15,23,42,0.24)] text-[var(--color-text-primary)]",
  }[tone];

  return (
    <article className={`group min-h-[132px] rounded-[18px] border border-[rgba(148,163,184,0.16)] bg-gradient-to-br ${toneClass} p-4 shadow-[0_18px_42px_rgba(2,6,23,0.24)] transition duration-200 hover:-translate-y-0.5 hover:border-[rgba(232,67,26,0.32)]`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">{label}</p>
        <span className="h-2 w-2 rounded-full bg-current shadow-[0_0_18px_currentColor]" aria-hidden="true" />
      </div>
      <p className="mt-4 font-[family-name:var(--font-sora)] text-2xl font-semibold tracking-normal text-[var(--color-text-primary)]">{value}</p>
      <p className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)]">{detail}</p>
    </article>
  );
}

function DeliveryHistoryStatusBadge({ item }: { item: DeliveryHistoryItem }) {
  const isDelivered = item.status === "DELIVERED";
  const label = isDelivered ? "Entregue" : "Incidente";
  const classes = isDelivered
    ? "border-[rgba(21,128,61,0.28)] bg-[rgba(21,128,61,0.12)] text-[#86efac]"
    : "border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.14)] text-[#fbbf24]";

  return (
    <span className={`inline-flex items-center justify-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${classes}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_12px_currentColor]" aria-hidden="true" />
      {label}
    </span>
  );
}

function DeliveryMiniTimeline({ item }: { item: DeliveryHistoryItem }) {
  const hasIssue = item.status === "PROBLEM";
  const steps = [
    { label: "Saiu", active: Boolean(item.leftOfficeAt), tone: "bg-[#38bdf8]" },
    { label: hasIssue ? "Incidente" : "Em rota", active: true, tone: hasIssue ? "bg-[#f59e0b]" : "bg-[#f59e0b]" },
    { label: hasIssue ? "Fechado" : "Entregue", active: Boolean(item.deliveredAt) || hasIssue, tone: hasIssue ? "bg-[#fb923c]" : "bg-[#22c55e]" },
  ];

  return (
    <div className="grid grid-cols-3 items-start gap-2">
      {steps.map((step, index) => (
        <div key={step.label} className="relative">
          {index < steps.length - 1 ? (
            <span className="absolute left-[18px] top-[9px] h-px w-[calc(100%+0.5rem)] bg-[var(--color-border-strong)]" aria-hidden="true" />
          ) : null}
          <div className="relative z-10 flex flex-col gap-2">
            <span className={`h-5 w-5 rounded-full border-4 border-[var(--color-background-secondary)] ${step.active ? step.tone : "bg-[var(--color-border-strong)]"} shadow-[0_0_18px_rgba(255,255,255,0.08)]`} />
            <span className="text-[11px] font-semibold text-[var(--color-text-secondary)]">{step.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function DeliveryHistoryRow({
  item,
  expanded,
  onToggle,
}: {
  item: DeliveryHistoryItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const issueLabel = item.issueType ? ISSUE_OPTIONS.find((option) => option.value === item.issueType)?.label ?? item.issueType : "Sem incidente";

  return (
    <article className="group rounded-[20px] border border-[var(--color-border)] bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(19,31,52,0.88))] p-4 shadow-[0_18px_48px_rgba(2,6,23,0.26)] transition duration-200 hover:-translate-y-0.5 hover:border-[rgba(232,67,26,0.3)]">
      <div className="grid gap-5 xl:grid-cols-[1.2fr_1.1fr_0.8fr_auto] xl:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[rgba(232,67,26,0.24)] bg-[rgba(232,67,26,0.1)] px-3 py-1 text-xs font-semibold text-[#fb923c]">
              {item.number}
            </span>
            <DeliveryHistoryStatusBadge item={item} />
          </div>
          <p className="mt-3 truncate font-[family-name:var(--font-sora)] text-lg font-semibold text-[var(--color-text-primary)]">{item.customerName}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--color-text-secondary)]">
            <span>{item.sourceStore || "Shopee X Digital"}</span>
            <span className="text-[var(--color-border-strong)]">/</span>
            <span>Maputo operacional</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-[14px] bg-[rgba(148,163,184,0.08)] px-3 py-2">
            <span className="text-xs text-[var(--color-text-secondary)]">Estafeta</span>
            <span className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{item.driverName || "Nao atribuido"}</span>
          </div>
          <DeliveryMiniTimeline item={item} />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-1">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">Saida</p>
            <p className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]" title={formatDateTooltip(item.leftOfficeAt)}>{formatSmartDate(item.leftOfficeAt)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">Entrega</p>
            <p className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]" title={formatDateTooltip(item.deliveredAt)}>{formatSmartDate(item.deliveredAt)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">Duracao</p>
            <span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getDurationTone(item.durationMinutes)}`}>
              {formatDuration(item.durationMinutes)}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 xl:flex-col xl:items-end">
          <div className="text-left xl:text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">Taxa</p>
            <p className="mt-1 font-[family-name:var(--font-sora)] text-lg font-semibold text-[var(--color-text-primary)]">{formatMoney(item.deliveryFee ?? 0)}</p>
          </div>
          <button type="button" onClick={onToggle} className="rounded-full border border-[var(--color-border-strong)] px-4 py-2 text-xs font-semibold text-[var(--color-text-primary)] transition hover:border-[rgba(232,67,26,0.42)] hover:bg-[rgba(232,67,26,0.08)]">
            {expanded ? "Fechar" : "Detalhes"}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="mt-5 grid gap-3 border-t border-[var(--color-border)] pt-5 md:grid-cols-4">
          <div className="rounded-[14px] bg-[rgba(148,163,184,0.08)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">Registro</p>
            <p className="mt-2 text-sm font-semibold text-[var(--color-text-primary)]">{item.number}</p>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">ID interno #{item.id}</p>
          </div>
          <div className="rounded-[14px] bg-[rgba(148,163,184,0.08)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">Incidente</p>
            <p className="mt-2 text-sm font-semibold text-[var(--color-text-primary)]">{issueLabel}</p>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{item.status === "DELIVERED" ? "Fecho concluido sem problema registado." : "Requer leitura operacional."}</p>
          </div>
          <div className="rounded-[14px] bg-[rgba(148,163,184,0.08)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">Prova</p>
            <p className="mt-2 text-sm font-semibold text-[var(--color-text-primary)]">Associada ao fluxo</p>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Sem anexo adicional neste resumo.</p>
          </div>
          <div className="rounded-[14px] bg-[rgba(148,163,184,0.08)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">SLA</p>
            <p className="mt-2 text-sm font-semibold text-[var(--color-text-primary)]">{formatDuration(item.durationMinutes)}</p>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Calculado entre saida e fecho.</p>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function DeliveryHistoryView() {
  const { effectiveRole } = useAdminAuth();
  const [history, setHistory] = useState<DeliveryHistoryResponse | null>(null);
  const [drivers, setDrivers] = useState<DeliveryDriver[]>([]);
  const [filters, setFilters] = useState({
    driverId: "",
    status: "",
    sourceStore: "",
    period: "",
    page: 0,
    size: 10,
  });
  const [quickSearch, setQuickSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async (background = false) => {
    try {
      const params = new URLSearchParams({
        driverId: filters.driverId,
        status: filters.status,
        sourceStore: filters.sourceStore,
        period: filters.period,
        page: String(filters.page),
        size: String(filters.size),
      });
      const historyPayload = await adminApiFetch<DeliveryHistoryResponse>(`/api/admin/delivery/history?${params.toString()}`);
      const driversPayload = effectiveRole === "DELIVERY_DRIVER"
        ? { content: [] }
        : await adminApiFetch<DeliveryDriversResponse>("/api/admin/delivery/drivers");
      setHistory({
        ...historyPayload,
        content: Array.isArray(historyPayload.content) ? historyPayload.content : [],
        page: Number(historyPayload.page ?? 0),
        size: Number(historyPayload.size ?? filters.size),
        totalElements: Number(historyPayload.totalElements ?? historyPayload.content?.length ?? 0),
        totalPages: Math.max(1, Number(historyPayload.totalPages ?? 1)),
      });
      setDrivers(Array.isArray(driversPayload.content) ? driversPayload.content : []);
      setError("");
    } catch (loadError) {
      if (!background) {
        setError(loadError instanceof Error ? loadError.message : "Nao foi possivel carregar o historico de entregas.");
      }
    } finally {
      if (!background) {
        setLoading(false);
      }
    }
  }, [effectiveRole, filters.driverId, filters.page, filters.period, filters.size, filters.sourceStore, filters.status]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadData(false);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadData]);

  if (loading) {
    return (
      <AdminSectionSkeleton
        title="A carregar historico"
        message="Estamos a compor o registo de entregas concluidas e ocorrencias desta operacao."
        rows={3}
      />
    );
  }

  const historyItems = Array.isArray(history?.content) ? history.content : [];
  const historyPage = Number(history?.page ?? 0);
  const historyTotalPages = Math.max(1, Number(history?.totalPages ?? 1));
  const filteredHistoryItems = historyItems.filter((item) => {
    const term = quickSearch.trim().toLowerCase();
    if (!term) return true;
    return [
      item.number,
      item.customerName,
      item.driverName ?? "",
      item.sourceStore,
      item.issueType ?? "",
      item.status,
    ].join(" ").toLowerCase().includes(term);
  });
  const deliveredCount = historyItems.filter((item) => item.status === "DELIVERED").length;
  const incidentCount = historyItems.filter((item) => item.status === "PROBLEM").length;
  const averageFee = historyItems.length
    ? historyItems.reduce((total, item) => total + Number(item.deliveryFee ?? 0), 0) / historyItems.length
    : 0;
  const durationSamples = historyItems
    .map((item) => item.durationMinutes)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const averageDuration = durationSamples.length
    ? Math.round(durationSamples.reduce((total, value) => total + value, 0) / durationSamples.length)
    : null;
  const todayKey = new Date().toDateString();
  const deliveredToday = historyItems.filter((item) => item.deliveredAt && new Date(item.deliveredAt).toDateString() === todayKey).length;
  const driverWins = historyItems.reduce<Record<string, number>>((acc, item) => {
    const name = item.driverName || "Nao atribuido";
    acc[name] = (acc[name] ?? 0) + 1;
    return acc;
  }, {});
  const bestDriver = Object.entries(driverWins).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Sem dados";
  const hasActiveFilters = Boolean(filters.driverId || filters.status || filters.sourceStore || filters.period || quickSearch);

  return (
    <DeliveryPageFrame
      eyebrow="Historico logistico"
      title="Historico de entregas"
      description="Consulta de entregas concluidas, incidentes e desempenho operacional."
      actions={
        <button
          type="button"
          onClick={() =>
            exportCsv(
              "delivery-history.csv",
              [
                ["Pedido", "Cliente", "Estafeta", "Taxa", "Saiu", "Entregue", "Duracao", "Estado"],
                ...historyItems.map((item) => [
                  item.number,
                  item.customerName,
                  item.driverName ?? "",
                  String(item.deliveryFee ?? 0),
                  item.leftOfficeAt ?? "",
                  item.deliveredAt ?? "",
                  formatDuration(item.durationMinutes),
                  item.status,
                ]),
              ],
            )
          }
          className="admin-button-muted"
        >
          Exportar
        </button>
      }
    >
      {error ? <AdminBanner message={error} tone="error" /> : null}

      <section className="overflow-hidden rounded-[24px] border border-[rgba(148,163,184,0.16)] bg-[radial-gradient(circle_at_top_left,rgba(232,67,26,0.14),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(9,17,31,0.9))] p-5 shadow-[0_24px_70px_rgba(2,6,23,0.3)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#fb923c]">Operacao fechada</p>
            <h2 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold tracking-normal text-[var(--color-text-primary)] md:text-3xl">
              Historico de entregas
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">
              Consulta de entregas concluidas, incidentes e desempenho operacional.
            </p>
          </div>
          <div className="rounded-full border border-[rgba(148,163,184,0.18)] bg-[rgba(15,23,42,0.52)] px-4 py-2 text-sm font-semibold text-[var(--color-text-secondary)]">
            {filteredHistoryItems.length} visiveis · {history?.totalElements ?? 0} no historico
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <DeliveryHistoryKpiCard label="Total concluidas" value={String(history?.totalElements ?? deliveredCount)} detail="Registos no periodo activo" tone="green" />
          <DeliveryHistoryKpiCard label="Taxa media entrega" value={formatMoney(averageFee)} detail="Media da pagina carregada" tone="orange" />
          <DeliveryHistoryKpiCard label="Tempo medio" value={formatDuration(averageDuration)} detail="Entre saida e fecho" tone="blue" />
          <DeliveryHistoryKpiCard label="Entregas hoje" value={String(deliveredToday)} detail="Fechadas nesta data" tone="green" />
          <DeliveryHistoryKpiCard label="Incidentes" value={String(incidentCount)} detail="Ocorrencias visiveis" tone="amber" />
          <DeliveryHistoryKpiCard label="Melhor estafeta" value={bestDriver} detail="Maior volume nesta vista" tone="neutral" />
        </div>
      </section>

      <section className="rounded-[22px] border border-[var(--color-border)] bg-[rgba(15,23,42,0.58)] p-4 shadow-[0_18px_42px_rgba(2,6,23,0.2)]">
        <div className="grid gap-3 xl:grid-cols-[1fr_1fr_1fr_1fr_1.3fr_auto_auto] xl:items-center">
          {effectiveRole === "DELIVERY_DRIVER" ? null : (
            <select
              value={filters.driverId}
              onChange={(event) => setFilters((current) => ({ ...current, driverId: event.target.value, page: 0 }))}
              className="admin-input min-h-12"
            >
              <option value="">Todos os estafetas</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name}
                </option>
              ))}
            </select>
          )}
          <select
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value, page: 0 }))}
            className="admin-input min-h-12"
          >
            <option value="">Todos os estados</option>
            <option value="DELIVERED">Entregue</option>
            <option value="PROBLEM">Com problema</option>
          </select>
          <input
            type="date"
            value={filters.period}
            onChange={(event) => setFilters((current) => ({ ...current, period: event.target.value, page: 0 }))}
            className="admin-input min-h-12"
          />
          <input
            type="text"
            value={filters.sourceStore}
            onChange={(event) => setFilters((current) => ({ ...current, sourceStore: event.target.value, page: 0 }))}
            className="admin-input min-h-12"
            placeholder="Loja origem"
          />
          <input
            type="search"
            value={quickSearch}
            onChange={(event) => setQuickSearch(event.target.value)}
            className="admin-input min-h-12"
            placeholder="Busca rapida por pedido, cliente, estafeta"
          />
          <button
            type="button"
            disabled={!hasActiveFilters}
            onClick={() => {
              setFilters({ driverId: "", status: "", sourceStore: "", period: "", page: 0, size: filters.size });
              setQuickSearch("");
            }}
            className="admin-button-muted min-h-12 justify-center px-4 text-sm disabled:cursor-not-allowed disabled:opacity-45"
          >
            Limpar
          </button>
          <button
            type="button"
            onClick={() =>
              exportCsv(
                "delivery-history.csv",
                [
                  ["Pedido", "Cliente", "Estafeta", "Taxa", "Saiu", "Entregue", "Duracao", "Estado"],
                  ...filteredHistoryItems.map((item) => [
                    item.number,
                    item.customerName,
                    item.driverName ?? "",
                    String(item.deliveryFee ?? 0),
                    item.leftOfficeAt ?? "",
                    item.deliveredAt ?? "",
                    formatDuration(item.durationMinutes),
                    item.status,
                  ]),
                ],
              )
            }
            className="admin-button-danger min-h-12 justify-center px-4 text-sm"
          >
            Exportar
          </button>
        </div>
      </section>

      <section className="space-y-3">
        {!history ? (
          <AdminTableSkeleton columns={4} rows={4} />
        ) : historyItems.length === 0 ? (
          <AdminStateCard title="Sem historico nesta combinacao" message="Ajusta os filtros para ver entregas fechadas ou problemas registados." compact />
        ) : filteredHistoryItems.length === 0 ? (
          <AdminStateCard title="Sem resultado na busca rapida" message="Remove a busca local ou altera os filtros para encontrar outros registos." compact />
        ) : (
          filteredHistoryItems.map((item) => (
            <DeliveryHistoryRow
              key={`${item.id}-${item.status}`}
              item={item}
              expanded={expandedId === item.id}
              onToggle={() => setExpandedId((current) => (current === item.id ? null : item.id))}
            />
          ))
        )}
      </section>

      {history ? (
        <div className="flex flex-col gap-3 rounded-[20px] border border-[var(--color-border)] bg-[rgba(15,23,42,0.54)] px-5 py-4 text-sm text-[var(--color-text-secondary)] md:flex-row md:items-center md:justify-between">
          <span>
            Pagina {historyPage + 1} de {historyTotalPages} · {history?.totalElements ?? 0} registos
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={historyPage === 0}
              onClick={() => setFilters((current) => ({ ...current, page: Math.max(current.page - 1, 0) }))}
              className="admin-button-muted justify-center disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={historyPage + 1 >= historyTotalPages}
              onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}
              className="admin-button-muted justify-center disabled:opacity-50"
            >
              Seguinte
            </button>
          </div>
        </div>
      ) : null}
    </DeliveryPageFrame>
  );
}

function generateTempPassword() {
  return `DX-${Math.random().toString(36).slice(2, 6)}-${Date.now().toString().slice(-4)}`;
}

export function DeliveryDriversView() {
  const { effectiveRole } = useAdminAuth();
  const [drivers, setDrivers] = useState<DeliveryDriver[]>([]);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });

  const allowed =
    effectiveRole != null &&
    ["ORDER_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(effectiveRole);

  const loadDrivers = useCallback(async (background = false) => {
    try {
      const payload = await adminApiFetch<DeliveryDriversResponse>("/api/admin/delivery/drivers");
      setDrivers(payload.content);
      if (!background) {
        setFeedback(null);
      }
    } catch (loadError) {
      if (!background) {
        setFeedback({
          tone: "error",
          message: loadError instanceof Error ? loadError.message : "Nao foi possivel carregar os estafetas.",
        });
      }
    } finally {
      if (!background) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (!allowed) {
        setLoading(false);
        return;
      }
      void loadDrivers(false);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [allowed, loadDrivers]);

  if (!allowed) {
    return <AdminStateCard title="Acesso restrito" message="So gestores de pedidos, admins e super admins podem gerir estafetas." />;
  }

  async function createDriver() {
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const email = form.email.trim();
    if (!firstName || !lastName || !email) {
      setFeedback({ tone: "error", message: "Preenche nome, apelido e email do novo estafeta." });
      return;
    }

    setSaving(true);
    setFeedback({ tone: "loading", message: "A criar o novo estafeta no painel administrativo." });
    try {
      await adminApiFetch("/api/super-admin/admins", {
        method: "POST",
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          phone: form.phone.trim(),
          role: "DELIVERY_DRIVER",
          password: generateTempPassword(),
        }),
      });
      setForm({ firstName: "", lastName: "", email: "", phone: "" });
      await loadDrivers(true);
      setFeedback({ tone: "success", message: "Estafeta criado com sucesso." });
    } catch (saveError) {
      setFeedback({
        tone: "error",
        message: saveError instanceof Error ? saveError.message : "Nao foi possivel criar o estafeta.",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AdminSectionSkeleton
        title="A preparar a equipa de delivery"
        message="Estamos a carregar disponibilidade, volume do dia e taxa de sucesso dos estafetas."
        rows={3}
      />
    );
  }

  return (
    <DeliveryPageFrame
      eyebrow="Equipa"
      title="Gerir estafetas"
      description="Acompanha disponibilidade, volume diario e cria novos perfis DELIVERY_DRIVER usando o endpoint administrativo ja existente."
    >
      <AdminFeedbackDock feedback={feedback} onClose={() => setFeedback(null)} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {drivers.length === 0 ? (
            <AdminStateCard title="Sem estafetas registados" message="Cria o primeiro perfil DELIVERY_DRIVER para comecar a atribuir entregas." />
          ) : (
            drivers.map((driver) => (
              <section key={driver.id} className="admin-card p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[rgba(232,67,26,0.12)] font-[family-name:var(--font-sora)] text-lg font-semibold text-[var(--color-danger)]">
                      {driver.name
                        .split(" ")
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((part) => part[0]?.toUpperCase())
                        .join("")}
                    </div>
                    <div>
                      <h2 className="font-[family-name:var(--font-sora)] text-xl font-semibold text-[var(--color-text-primary)]">{driver.name}</h2>
                      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{driver.email}</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${driver.availability === "AVAILABLE" ? "bg-[#EAF3DE] text-[#27500A]" : driver.availability === "ON_DELIVERY" ? "bg-[#E6F4FF] text-[#0C4A6E]" : "bg-[#F3F4F6] text-[#475569]"}`}>
                    {driver.availability === "AVAILABLE" ? "Disponivel" : driver.availability === "ON_DELIVERY" ? "Em rota" : "Offline"}
                  </span>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-4">
                  <div className="rounded-[22px] bg-[var(--color-background-secondary)] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">Hoje</p>
                    <p className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold text-[var(--color-text-primary)]">{driver.deliveriesToday}</p>
                  </div>
                  <div className="rounded-[22px] bg-[var(--color-background-secondary)] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">Total</p>
                    <p className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold text-[var(--color-text-primary)]">{driver.deliveriesTotal}</p>
                  </div>
                  <div className="rounded-[22px] bg-[var(--color-background-secondary)] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">Sucesso</p>
                    <p className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold text-[#639922]">{formatRelativePercent(driver.successRate)}</p>
                  </div>
                  <div className="rounded-[22px] bg-[var(--color-background-secondary)] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">Telefone</p>
                    {driver.phone ? (
                      <WhatsAppPhone phone={driver.phone} className="mt-2 text-sm font-semibold text-[var(--color-danger)]" />
                    ) : (
                      <p className="mt-2 text-sm font-semibold text-[var(--color-text-primary)]">Sem telefone</p>
                    )}
                  </div>
                </div>
              </section>
            ))
          )}
        </div>

        <aside className="admin-card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">Novo estafeta</p>
          <h2 className="mt-2 font-[family-name:var(--font-sora)] text-xl font-semibold text-[var(--color-text-primary)]">Criar perfil DELIVERY_DRIVER</h2>
          <div className="mt-5 space-y-3">
            <input value={form.firstName} onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))} className="admin-input w-full" placeholder="Primeiro nome" />
            <input value={form.lastName} onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))} className="admin-input w-full" placeholder="Apelido" />
            <input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className="admin-input w-full" placeholder="Email" />
            <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} className="admin-input w-full" placeholder="Telefone" />
            <div className="rounded-[22px] bg-[#FFF0EC] px-4 py-3 text-sm text-[#C13210]">
              A role sera criada automaticamente como <strong>DELIVERY_DRIVER</strong>.
            </div>
            <button type="button" onClick={() => void createDriver()} disabled={saving} className="admin-button-danger w-full justify-center">
              {saving ? "A criar..." : "Criar estafeta"}
            </button>
          </div>
        </aside>
      </div>
    </DeliveryPageFrame>
  );
}
