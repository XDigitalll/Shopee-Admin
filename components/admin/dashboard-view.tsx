"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { AttentionDot } from "@/components/admin/attention-dot";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useAdminLiveRefresh } from "@/hooks/use-admin-live-refresh";
import { adminApiFetch } from "@/lib/admin/api-client";
import {
  formatDate,
  formatMoney,
  formatRelativePercent,
  humanizeOrderStatus,
} from "@/lib/admin/format";
import { MODULE_METADATA, type AdminModule } from "@/lib/admin/roles";
import type {
  PendingQuote,
  RecentOrder,
  TodayStatsResponse,
  WeeklyRevenueItem,
} from "@/lib/admin/types";
import {
  ArrowRightIcon,
  ArrowUpIcon,
  getModuleIcon,
} from "@/components/admin/icons";

function statusClass(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === "RECEIVED") return "bg-[#F1EFE8] text-[#444441]";
  if (normalized === "PRICING") return "bg-[#FAEEDA] text-[#633806]";
  if (normalized === "AWAITING_PAYMENT") return "bg-[#FFF2D6] text-[#8A5A00]";
  if (normalized === "CONFIRMED") return "bg-[#EAF3DE] text-[#173404]";
  if (normalized === "PROCESSING") return "bg-[#E6F7EE] text-[#0E5B3A]";
  if (normalized === "ON_THE_WAY") return "bg-[#DBEAFE] text-[#1E3A5F]";
  if (normalized === "COMPLETED") return "bg-[#EAF3DE] text-[#27500A]";
  if (normalized === "UNDER_REVIEW") return "bg-[#FAEEDA] text-[#633806]";
  if (normalized === "QUOTED") return "bg-[#fef3c7] text-[#92400e]";
  if (normalized === "PAID") return "bg-[#EAF3DE] text-[#173404]";
  if (["ORDERED", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(normalized)) {
    return "bg-[#d1fae5] text-[#065f46]";
  }

  return "bg-[var(--color-background-tertiary)] text-[var(--color-text-secondary)]";
}

function typeClass(type: RecentOrder["type"]) {
  return type === "EXTERNAL" ? "bg-[#fff0e8] text-[#a14416]" : "bg-[#e6f6ec] text-[#14532d]";
}

function DashboardIntro({
  stats,
  quotes,
}: {
  stats: TodayStatsResponse | null;
  quotes: PendingQuote[] | null;
}) {
  const pendingOrders = stats?.badges.orders ?? 0;
  const pendingQuotes = stats?.badges.quotes ?? 0;

  return (
    <section className="admin-card p-6">
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-danger)]">
            Visao geral
          </p>
          <h2 className="mt-2 font-[family-name:var(--font-sora)] text-3xl font-semibold">
            O que precisa de atencao agora
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-text-secondary)]">
            Este painel foi organizado para mostrar primeiro o que exige acao imediata:
            pedidos pendentes, cotacoes por responder e pagamentos que precisam de validacao.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-[22px] bg-[var(--color-background-tertiary)] p-4">
              <p className="text-sm text-[var(--color-text-secondary)]">Pedidos a acompanhar</p>
              <strong className="mt-2 block font-[family-name:var(--font-sora)] text-3xl">
                {pendingOrders}
              </strong>
            </div>
            <div className="rounded-[22px] bg-[var(--color-background-tertiary)] p-4">
              <p className="text-sm text-[var(--color-text-secondary)]">Cotacoes em aberto</p>
              <strong className="mt-2 block font-[family-name:var(--font-sora)] text-3xl">
                {pendingQuotes}
              </strong>
            </div>
            <a href="/admin/finance/paysuite" className="rounded-[22px] bg-[var(--color-background-tertiary)] p-4 block hover:bg-[var(--color-background-secondary)] transition">
              <p className="text-sm text-[var(--color-text-secondary)]">Transações PaySuite</p>
              <strong className="mt-2 block font-[family-name:var(--font-sora)] text-3xl text-[var(--color-danger)]">Ver →</strong>
            </a>
          </div>
        </div>

        <div className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-background-tertiary)] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">
            Prioridade imediata
          </p>
          <h3 className="mt-2 font-[family-name:var(--font-sora)] text-xl font-semibold">
            Proxima fila de trabalho
          </h3>
          <div className="mt-4 space-y-3">
            {(quotes ?? []).slice(0, 3).map((quote) => (
              <div
                key={quote.id}
                className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface-overlay)] px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[var(--color-text-primary)]">
                      {quote.customer}
                    </p>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      {quote.store} · {quote.itemCount} item(ns)
                    </p>
                  </div>
                  <strong className="font-[family-name:var(--font-sora)] text-sm">
                    {formatMoney(quote.estimatedValue)}
                  </strong>
                </div>
              </div>
            ))}

            {!quotes?.length ? (
              <p className="rounded-[18px] border border-dashed border-[var(--color-border-strong)] px-4 py-4 text-sm text-[var(--color-text-secondary)]">
                Nao ha cotacoes pendentes neste momento.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricCards({ data }: { data: TodayStatsResponse | null }) {
  if (!data) {
    return (
      <div className="grid gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="admin-card animate-pulse p-5">
            <div className="h-24 rounded-2xl bg-[var(--color-background-tertiary)]" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-danger)]">
          Numeros de hoje
        </p>
        <h2 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold">
          Resumo rapido do dia
        </h2>
      </div>
      <div className="grid gap-4 xl:grid-cols-4">
        {data.metrics.map((metric) => {
          const Icon = getModuleIcon(metric.icon);
          return (
            <article key={metric.id} className="admin-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-[var(--color-text-secondary)]">{metric.label}</p>
                  <h3 className="mt-3 font-[family-name:var(--font-sora)] text-3xl font-semibold text-[var(--color-text-primary)]">
                    {metric.id.includes("Revenue") || metric.id === "margin"
                      ? formatMoney(metric.value)
                      : new Intl.NumberFormat("pt-PT").format(metric.value)}
                  </h3>
                </div>
                <div className="rounded-2xl bg-[rgba(232,67,26,0.1)] p-3 text-[var(--color-danger)]">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[rgba(22,163,74,0.12)] px-3 py-1 text-sm font-medium text-[var(--color-success)]">
                <ArrowUpIcon className="h-4 w-4" />
                {formatRelativePercent(metric.delta)}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function QuickActions() {
  const { hasAccess } = useAdminAuth();

  const modules = [
    "orders",
    "quotes",
    "payments",
    "products",
  ] satisfies AdminModule[];

  return (
    <section className="admin-card p-6">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-danger)]">
          Atalhos
        </p>
        <h2 className="mt-2 font-[family-name:var(--font-sora)] text-xl font-semibold">
          Ir direto ao modulo certo
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {modules.map((moduleName) => {
          const metadata = MODULE_METADATA[moduleName];
          const Icon = getModuleIcon(metadata.icon);
          const allowed = hasAccess(moduleName);

          return (
            <Link
              key={moduleName}
              href={allowed ? metadata.path : "/admin/unauthorized"}
              className={`rounded-[22px] border p-4 transition ${
                allowed
                  ? "border-[var(--color-border)] bg-[var(--color-background-tertiary)] hover:border-[rgba(232,67,26,0.35)]"
                  : "border-[var(--color-border)] bg-[var(--color-background-tertiary)] opacity-50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="rounded-2xl bg-[rgba(232,67,26,0.1)] p-3 text-[var(--color-danger)] w-fit">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-semibold text-[var(--color-text-primary)]">
                    {metadata.name}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
                    {metadata.description}
                  </p>
                </div>
                <ArrowRightIcon className="mt-1 h-4 w-4 text-[var(--color-danger)]" />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function RecentOrdersTable({ orders }: { orders: RecentOrder[] | null }) {
  return (
    <section className="admin-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-danger)]">
            Actividade recente
          </p>
          <h2 className="mt-2 font-[family-name:var(--font-sora)] text-xl font-semibold">
            Ultimos pedidos
          </h2>
        </div>
        <Link href="/admin/orders" className="text-sm font-medium text-[var(--color-danger)]">
          Ver todos
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left">
          <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
            <tr>
              {["Numero", "Cliente", "Tipo", "Valor", "Estado", "Data", "Accao"].map((heading) => (
                <th key={heading} className="px-6 py-4 font-medium">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(orders ?? []).map((order) => (
              <tr key={order.id} className="border-b border-[var(--color-border)] last:border-b-0">
                <td className="px-6 py-4 font-semibold text-[var(--color-text-primary)]">{order.number}</td>
                <td className="px-6 py-4 text-sm text-[var(--color-text-secondary)]">{order.customer}</td>
                <td className="px-6 py-4">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${typeClass(order.type)}`}>
                    {order.type === "EXTERNAL" ? "EXT" : "INT"}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm font-medium text-[var(--color-text-primary)]">
                  {formatMoney(order.totalAmount)}
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(order.status)}`}>
                    {humanizeOrderStatus(order.status)}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-[var(--color-text-secondary)]">{formatDate(order.createdAt)}</td>
                <td className="px-6 py-4">
                  <Link href={order.actionHref} className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-danger)]">
                    {order.actionLabel}
                    <ArrowRightIcon className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            ))}
            {!orders?.length ? (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-sm text-[var(--color-text-secondary)]">
                  Nenhum pedido recente encontrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function WeeklyRevenueCard({ items }: { items: WeeklyRevenueItem[] | null }) {
  const max = Math.max(...(items?.map((item) => item.total) ?? [1]), 1);
  const total = (items ?? []).reduce((sum, item) => sum + item.total, 0);

  return (
    <section className="admin-card p-6">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-danger)]">
          Receita
        </p>
        <h2 className="mt-2 font-[family-name:var(--font-sora)] text-xl font-semibold">
          Ultimos 7 dias
        </h2>
      </div>

      <div className="flex h-[210px] items-end gap-3 rounded-[24px] bg-[var(--color-background-tertiary)] p-4">
        {(items ?? []).map((item) => {
          const height = Math.max((item.total / max) * 100, 10);
          return (
            <div key={item.date} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex h-full w-full items-end justify-center">
                <div
                  className="w-full rounded-t-[16px]"
                  style={{
                    height: `${height}%`,
                    background: item.isToday ? "#94a3b8" : "#E8431A",
                  }}
                />
              </div>
              <div className="text-center text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">
                {item.label}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-tertiary)] px-4 py-3">
        <span className="text-sm text-[var(--color-text-secondary)]">Total da semana</span>
        <strong className="mt-1 block font-[family-name:var(--font-sora)] text-xl text-[var(--color-text-primary)]">
          {formatMoney(total)}
        </strong>
      </div>
    </section>
  );
}

function PendingQuotes({ quotes }: { quotes: PendingQuote[] | null }) {
  return (
    <section className="admin-card p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-danger)]">
            Cotacoes
          </p>
          <h2 className="mt-2 font-[family-name:var(--font-sora)] text-xl font-semibold">
            Pendentes
          </h2>
        </div>
        <Link href="/admin/orders" className="text-sm font-medium text-[var(--color-danger)]">
          Abrir pedidos
        </Link>
      </div>

      <div className="space-y-3">
        {(quotes ?? []).slice(0, 4).map((quote) => (
          <article
            key={quote.id}
            className="relative rounded-[20px] border border-[var(--color-border)] bg-[var(--color-background-tertiary)] p-4 ring-1 ring-[rgba(249,115,22,0.18)]"
          >
            <AttentionDot className="absolute right-4 top-4" label="Cotacao pendente no dashboard" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="inline-flex max-w-full items-center gap-2 truncate font-semibold text-[var(--color-text-primary)]">
                  <AttentionDot label="Cotacao pendente no dashboard" className="lg:hidden" />
                  {quote.customer}
                </h3>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {quote.store} · {quote.itemCount} item(ns)
                </p>
              </div>
              <strong className="font-[family-name:var(--font-sora)] text-sm">
                {formatMoney(quote.estimatedValue)}
              </strong>
            </div>
          </article>
        ))}

        {!quotes?.length ? (
          <div className="rounded-[20px] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-background-tertiary)] px-4 py-8 text-center text-sm text-[var(--color-text-secondary)]">
            Sem cotacoes pendentes neste momento.
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function DashboardView() {
  const [stats, setStats] = useState<TodayStatsResponse | null>(null);
  const [orders, setOrders] = useState<RecentOrder[] | null>(null);
  const [revenue, setRevenue] = useState<WeeklyRevenueItem[] | null>(null);
  const [quotes, setQuotes] = useState<PendingQuote[] | null>(null);
  const [error, setError] = useState("");
  const { effectiveRole, hasAccess } = useAdminAuth();

  const canSeeOrders = hasAccess("orders");
  const canSeeQuotes = hasAccess("quotes");
  const canSeePayments = hasAccess("payments");
  const canSeeProducts = hasAccess("products");
  const canSeeRevenue = hasAccess("finance") || effectiveRole === "ANALYST";

  async function refreshDashboardData() {
    const tasks = await Promise.allSettled([
      adminApiFetch<TodayStatsResponse>("/api/admin/stats/today"),
      canSeeOrders
        ? adminApiFetch<RecentOrder[]>("/api/admin/orders?mode=dashboardRecent&limit=5")
        : Promise.resolve([]),
      canSeeRevenue
        ? adminApiFetch<WeeklyRevenueItem[]>("/api/admin/stats/weekly-revenue")
        : Promise.resolve([]),
      canSeeQuotes
        ? adminApiFetch<PendingQuote[]>("/api/admin/orders?mode=pendingQuotes&limit=5")
        : Promise.resolve([]),
    ]);

    const [statsResult, ordersResult, revenueResult, quotesResult] = tasks;
    const messages: string[] = [];

    if (statsResult.status === "fulfilled") {
      setStats(statsResult.value);
    } else {
      messages.push(
        statsResult.reason instanceof Error
          ? statsResult.reason.message
          : "Nao foi possivel actualizar os indicadores principais."
      );
    }

    if (ordersResult.status === "fulfilled") {
      setOrders(ordersResult.value);
    } else {
      setOrders([]);
      messages.push(
        ordersResult.reason instanceof Error
          ? ordersResult.reason.message
          : "Nao foi possivel actualizar os ultimos pedidos."
      );
    }

    if (revenueResult.status === "fulfilled") {
      setRevenue(revenueResult.value);
    } else {
      setRevenue([]);
      messages.push(
        revenueResult.reason instanceof Error
          ? revenueResult.reason.message
          : "Nao foi possivel actualizar a receita semanal."
      );
    }

    if (quotesResult.status === "fulfilled") {
      setQuotes(quotesResult.value);
    } else {
      setQuotes([]);
      messages.push(
        quotesResult.reason instanceof Error
          ? quotesResult.reason.message
          : "Nao foi possivel actualizar a fila de cotacoes."
      );
    }

    setError(messages[0] ?? "");
  }

  useAdminLiveRefresh(refreshDashboardData, {
    intervalMs: 30_000,
    enabled: Boolean(effectiveRole),
    minIntervalMs: 10_000,
  });

  const showRevenue = useMemo(() => canSeeRevenue, [canSeeRevenue]);

  return (
    <div className="space-y-8">
      {error ? (
        <div className="rounded-[24px] border border-[rgba(232,67,26,0.18)] bg-[rgba(232,67,26,0.08)] px-5 py-4 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      ) : null}

      <DashboardIntro stats={stats} quotes={quotes} />
      <MetricCards data={stats} />

      <div className={`grid gap-6 ${showRevenue ? "xl:grid-cols-[1.2fr_0.8fr]" : "xl:grid-cols-1"}`}>
        {canSeeOrders ? <RecentOrdersTable orders={orders} /> : <QuickActions />}
        {showRevenue ? <WeeklyRevenueCard items={revenue} /> : null}
      </div>

      {canSeeQuotes || canSeeProducts ? (
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          {canSeeQuotes ? <PendingQuotes quotes={quotes} /> : <QuickActions />}
          {canSeeProducts || canSeeOrders || canSeeQuotes || canSeePayments ? <QuickActions /> : null}
        </div>
      ) : null}
    </div>
  );
}
