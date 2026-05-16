"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

import { AttentionDot } from "@/components/admin/attention-dot";
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
import { isDeliveryActionRequired } from "@/lib/admin/operational-queue";
import type {
  DeliveryActiveOrder,
  DeliveryDriver,
  DeliveryDriversResponse,
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
const READY_FOR_DELIVERY_STATUSES = new Set(["ORDERED", "ARRIVED"]);

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

function normalizeWhatsappPhone(phone: string | null | undefined) {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("258")) return digits;
  if (digits.length === 9) return `258${digits}`;
  return digits;
}

function buildPhoneHref(phone: string | null | undefined) {
  const trimmed = phone?.trim();
  return trimmed ? `tel:${trimmed.replace(/\s/g, "")}` : null;
}

function buildDeliveryAddressUrl(orderNumber: string, phone: string | null | undefined) {
  const url = new URL(`${CLIENT_APP_URL}/delivery-address/${encodeURIComponent(orderNumber)}`);
  if (phone) {
    url.searchParams.set("phone", phone);
  }
  return url.toString();
}

function buildWhatsappAddressRequestUrl(orderNumber: string, phone: string | null | undefined) {
  const whatsappPhone = normalizeWhatsappPhone(phone);
  if (!whatsappPhone) return null;
  const addressUrl = buildDeliveryAddressUrl(orderNumber, phone);
  const text = `Ola! A tua encomenda ${orderNumber} ja chegou a Maputo. Para combinarmos a entrega, confirma a tua morada ou partilha a localizacao aqui: ${addressUrl}`;
  return `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(text)}`;
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
        </>
      ) : null}
    </span>
  );
}

function buildWhatsappArrivalNoticeUrl(orderNumber: string, phone: string | null | undefined) {
  const whatsappPhone = normalizeWhatsappPhone(phone);
  if (!whatsappPhone) return null;
  const text = `Ola! A tua encomenda ${orderNumber} ja chegou a Maputo. Vamos combinar a entrega contigo pelo telefone informado.`;
  return `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(text)}`;
}

function buildCsv(rows: string[][]) {
  return rows
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\n");
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
  const { effectiveRole } = useAdminAuth();
  const deliveryTabs = effectiveRole === "DELIVERY_DRIVER"
    ? DELIVERY_TABS.filter((tab) => tab.href === "/admin/delivery/pending" || tab.href === "/admin/delivery/active" || tab.href === "/admin/delivery/history")
    : DELIVERY_TABS;
  const canManageDrivers = effectiveRole != null &&
    ["DELIVERY_MANAGER", "ORDER_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(effectiveRole);

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
                  <a href={`tel:${phone}`} className="text-[var(--color-danger)] hover:underline">
                    {phone}
                  </a>
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

  async function defineFee(order: DeliveryPendingOrder) {
    if (!isReadyForDeliveryStatus(order.status)) {
      setFeedback({
        tone: "error",
        message: `${order.number} ainda nao esta pronto para entrega. Aguarda o estado ORDERED ou ARRIVED.`,
      });
      return;
    }

    const form = forms[order.id];
    const fee = Number(form?.deliveryFee ?? 0);
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
          estimatedDeliveryTime: form?.estimatedDeliveryTime ? Number(form.estimatedDeliveryTime) : null,
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
        message: `${order.number} ainda nao esta pronto para sair. Primeiro confirma ORDERED ou chegada ao escritorio.`,
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
          message={driverMode ? "Nao ha encomendas no escritorio para pegar neste momento." : "Nao ha encomendas ORDERED/ARRIVED a aguardar taxa ou saida local."}
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
            const isRetry = (order.deliveryAttempt ?? 1) > 1;
            const isReadyForDelivery = isReadyForDeliveryStatus(order.status);
            const hasFee = Number(order.deliveryFee ?? Number(form.deliveryFee || 0)) > 0;
            const feeAlreadyNotified = Boolean(order.deliveryFeeSetAt) && !isRetry;
            const hasDriver = Boolean(order.assignedDriverId);
            const canStart = isReadyForDelivery && hasFee && hasDriver;
            const hasSelectedDriver = Boolean(form.driverId?.trim());
            const startBlockReason = !isReadyForDelivery
              ? "Este pedido ainda nao esta em ORDERED ou ARRIVED para entrega local."
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
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">Tempo estimado (horas)</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={form.estimatedDeliveryTime}
                        onChange={(event) => updateForm(order.id, { estimatedDeliveryTime: event.target.value })}
                        disabled={feeAlreadyNotified}
                        className="admin-input w-full"
                      />
                    </label>
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
                        Iniciar entrega
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
    if (order.status !== "OUT_FOR_DELIVERY") {
      setFeedback({
        tone: "error",
        message: `${order.number} ainda nao saiu do escritorio. Inicia a entrega antes de confirmar.`,
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
            const isOnRoute = order.status === "OUT_FOR_DELIVERY";
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
                  <button
                    type="button"
                    onClick={() => setConfirmOrder(order)}
                    disabled={!isOnRoute}
                    className="admin-button-danger justify-center disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Confirmar entrega
                  </button>
                  <button
                    type="button"
                    onClick={() => setProblemModal({ order, type: ISSUE_OPTIONS[0].value, note: "" })}
                    disabled={!isOnRoute}
                    className="admin-button-muted justify-center disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Reportar problema
                  </button>
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

  return (
    <DeliveryPageFrame
      eyebrow="Historico"
      title="Entregas fechadas"
      description="Consulta as entregas concluidas ou com incidente, com filtros por estafeta, estado e periodo."
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

      <section className="admin-card p-5">
        <div className="grid gap-3 lg:grid-cols-4">
          {effectiveRole === "DELIVERY_DRIVER" ? null : (
            <select
              value={filters.driverId}
              onChange={(event) => setFilters((current) => ({ ...current, driverId: event.target.value, page: 0 }))}
              className="admin-input"
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
            className="admin-input"
          >
            <option value="">Todos os estados</option>
            <option value="DELIVERED">Entregue</option>
            <option value="PROBLEM">Com problema</option>
          </select>
          <input
            type="date"
            value={filters.period}
            onChange={(event) => setFilters((current) => ({ ...current, period: event.target.value, page: 0 }))}
            className="admin-input"
          />
          <input
            type="text"
            value={filters.sourceStore}
            onChange={(event) => setFilters((current) => ({ ...current, sourceStore: event.target.value, page: 0 }))}
            className="admin-input"
            placeholder="Filtrar por loja de origem"
          />
        </div>
      </section>

      <section className="admin-card overflow-hidden">
        <div className="grid gap-3 bg-[var(--color-background-secondary)] px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)] md:grid-cols-[110px_1.3fr_1fr_120px_130px_130px_110px_120px]">
          <span>ID</span>
          <span>Cliente</span>
          <span>Estafeta</span>
          <span>Taxa</span>
          <span>Saida</span>
          <span>Entrega</span>
          <span>Duracao</span>
          <span>Estado</span>
        </div>
        <div className="p-5">
          {!history ? (
            <AdminTableSkeleton columns={8} rows={4} />
          ) : historyItems.length === 0 ? (
            <AdminStateCard title="Sem historico nesta combinacao" message="Ajusta os filtros para ver entregas fechadas ou problemas registados." compact />
          ) : (
            <div className="space-y-3">
              {historyItems.map((item) => (
                <div key={`${item.id}-${item.status}`} className="grid gap-3 rounded-[24px] border border-[var(--color-border)] bg-[var(--color-background-secondary)] px-4 py-4 text-sm md:grid-cols-[110px_1.3fr_1fr_120px_130px_130px_110px_120px]">
                  <span className="font-semibold text-[var(--color-text-primary)]">{item.number}</span>
                  <div>
                    <p className="font-medium text-[var(--color-text-primary)]">{item.customerName}</p>
                    <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{item.sourceStore}</p>
                  </div>
                  <span className="text-[var(--color-text-secondary)]">{item.driverName || "Nao atribuido"}</span>
                  <span>{formatMoney(item.deliveryFee ?? 0)}</span>
                  <span>{formatDateTime(item.leftOfficeAt)}</span>
                  <span>{formatDateTime(item.deliveredAt)}</span>
                  <span>{formatDuration(item.durationMinutes)}</span>
                  <div className="flex flex-col gap-1">
                    <span className={`rounded-full px-3 py-1 text-center text-xs font-semibold ${item.status === "DELIVERED" ? "bg-[#EAF3DE] text-[#27500A]" : "bg-[#FFF0EC] text-[#C13210]"}`}>
                      {item.status === "DELIVERED" ? "Entregue" : "Problema"}
                    </span>
                    {item.issueType ? (
                      <span className="px-1 text-center text-[10px] text-[var(--color-text-tertiary)]">
                        {ISSUE_OPTIONS.find((o) => o.value === item.issueType)?.label ?? item.issueType}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {history ? (
          <div className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-4 text-sm text-[var(--color-text-secondary)]">
            <span>
              Pagina {historyPage + 1} de {historyTotalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={historyPage === 0}
                onClick={() => setFilters((current) => ({ ...current, page: Math.max(current.page - 1, 0) }))}
                className="admin-button-muted disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={historyPage + 1 >= historyTotalPages}
                onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}
                className="admin-button-muted disabled:opacity-50"
              >
                Seguinte
              </button>
            </div>
          </div>
        ) : null}
      </section>
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
                      <a
                        href={buildPhoneHref(driver.phone) ?? undefined}
                        className="mt-2 inline-flex text-sm font-semibold text-[var(--color-danger)] hover:underline"
                      >
                        {driver.phone}
                      </a>
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
