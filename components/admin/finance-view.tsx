"use client";

import { useState, useEffect, useCallback } from "react";

import { formatMoney } from "@/lib/admin/format";
import { adminApiFetch } from "@/lib/admin/api-client";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { ExchangeRatesPanel } from "@/components/admin/exchange-rates-panel";
import {
  ArrowUpIcon,
  ChartIcon,
  OrdersIcon,
  UsersIcon,
  WalletIcon,
} from "@/components/admin/icons";

// Types

type FinancePeriod = "week" | "month" | "quarter" | "year";

type FinanceStats = {
  totalRevenue: number;
  todayRevenue: number;
  totalRevenueDelta: number;
  commissionsEarned: number;
  commissionsEarnedDelta: number;
  paidOrders: number;
  paidOrdersDelta: number;
  avgTicket: number;
  avgTicketDelta: number;
  totalMerchandise: number;
  todayMerchandise: number;
  totalSiteRevenue: number;
  todaySiteRevenue: number;
  totalDelivery: number;
  todayDelivery: number;
  totalMargin: number;
  todayMargin: number;
  siteSharePct: number;
  todaySiteSharePct: number;
  paidOrdersToday: number;
  internalSales: number;
  externalSales: number;
  internalSalesToday: number;
  externalSalesToday: number;
  paidInternalOrders: number;
  paidExternalOrders: number;
};

type FinanceChartItem = {
  date: string;
  label: string;
  revenue: number;
  commission: number;
  isToday: boolean;
};

type FinanceTransaction = {
  id: string;
  orderNumber: string;
  customer: string;
  totalAmount: number;
  commission: number;
  paymentMethod: string;
  status: "PAID" | "PENDING" | "REFUNDED";
};

type FinanceKPIs = {
  avgMargin: number;
  avgMarginTrend: "up" | "down" | "neutral";
  conversionRate: number;
  conversionRateTrend: "up" | "down" | "neutral";
  avgQuoteTime: number;
  avgQuoteTimeTrend: "up" | "down" | "neutral";
  cancelledOrders: number;
  cancelledOrdersTrend: "up" | "down" | "neutral";
};

type TopClient = {
  rank: number;
  name: string;
  orderCount: number;
  totalSpent: number;
};

type PaymentMethodStat = {
  method: string;
  percentage: number;
  amount: number;
};

type RevenueByType = {
  external: number;
  internal: number;
  commissions: number;
};

type CostBreakdown = {
  siteTax: number;
  externalCommission: number;
  insurance: number;
  customs: number;
  operational: number;
};

type FinanceOverviewResponse = {
  stats: FinanceStats;
  chart: FinanceChartItem[];
  transactions: FinanceTransaction[];
  kpis: FinanceKPIs;
  topClients: TopClient[];
  methods: PaymentMethodStat[];
  revenueByType: RevenueByType;
  costBreakdown: CostBreakdown;
};

type TreasuryEntry = {
  id: string;
  label: string;
  account: string;
  kind: "WITHDRAWAL" | "EXPENSE";
  note?: string;
  amount: number;
  addedAt: string;
};

const TREASURY_STORAGE_KEY = "xdigital_finance_treasury_entries";

// Constants

const PERIOD_OPTIONS: { value: FinancePeriod; label: string }[] = [
  { value: "week", label: "Esta semana" },
  { value: "month", label: "Este mês" },
  { value: "quarter", label: "Este trimestre" },
  { value: "year", label: "Este ano" },
];

const METHOD_COLORS: Record<string, string> = {
  "M-Pesa": "#639922",
  "e-Mola": "#378ADD",
  "Visa": "#534AB7",
  "Mastercard": "#854F0B",
};

const TREASURY_ACCOUNTS = [
  "Caixa principal",
  "Banco BCI",
  "Banco Millennium",
  "M-Pesa",
  "e-Mola",
];

const AVATAR_COLORS = ["#E8431A", "#639922", "#378ADD", "#534AB7", "#854F0B"];

const MONTH_LABEL = (() => {
  const raw = new Intl.DateTimeFormat("pt-PT", {
    month: "long",
    year: "numeric",
  }).format(new Date());
  return raw.charAt(0).toUpperCase() + raw.slice(1);
})();

// Helpers

function DeltaChip({ value }: { value: number }) {
  const pos = value >= 0;
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
        pos
          ? "bg-[rgba(22,163,74,0.12)] text-[#15803d]"
          : "bg-[rgba(220,38,38,0.1)] text-[#dc2626]"
      }`}
    >
      <ArrowUpIcon
        className={`h-3 w-3 ${pos ? "" : "rotate-180"}`}
      />
      {Math.abs(value).toFixed(1)}%
    </div>
  );
}

function txStatusStyle(status: FinanceTransaction["status"]) {
  if (status === "PAID") return "bg-[#EAF3DE] text-[#173404]";
  if (status === "PENDING") return "bg-[#FAEEDA] text-[#633806]";
  return "bg-[#FCEBEB] text-[#791F1F]";
}

function txStatusLabel(status: FinanceTransaction["status"]) {
  if (status === "PAID") return "Pago";
  if (status === "PENDING") return "Pendente";
  return "Reembolsado";
}

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-danger)]">
      {children}
    </p>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-1 font-[family-name:var(--font-sora)] text-xl font-semibold text-[var(--color-text-primary)]">
      {children}
    </h2>
  );
}

function PulseDot() {
  return (
    <div className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-danger)]" />
  );
}

// Metric Cards

function MetricCards({
  data,
  isLoading,
}: {
  data: FinanceStats | null;
  isLoading: boolean;
}) {
  if (isLoading || !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="admin-card animate-pulse p-5">
            <div className="h-24 rounded-2xl bg-[var(--color-background-tertiary)]" />
          </div>
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: "Receita total",
      value: formatMoney(data.totalRevenue),
      delta: data.totalRevenueDelta,
      Icon: WalletIcon,
      bg: "rgba(232,67,26,0.1)",
      fg: "#E8431A",
    },
    {
      label: "Comissões ganhas",
      value: formatMoney(data.commissionsEarned),
      delta: data.commissionsEarnedDelta,
      Icon: ChartIcon,
      bg: "rgba(99,153,34,0.12)",
      fg: "#639922",
    },
    {
      label: "Pedidos pagos",
      value: new Intl.NumberFormat("pt-PT").format(data.paidOrders),
      delta: data.paidOrdersDelta,
      Icon: OrdersIcon,
      bg: "rgba(232,67,26,0.1)",
      fg: "#E8431A",
    },
    {
      label: "Ticket médio",
      value: formatMoney(data.avgTicket),
      delta: data.avgTicketDelta,
      Icon: UsersIcon,
      bg: "rgba(55,138,221,0.12)",
      fg: "#378ADD",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <article key={c.label} className="admin-card p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
              {c.label}
            </p>
            <div
              className="rounded-xl p-2.5"
              style={{ background: c.bg, color: c.fg }}
            >
              <c.Icon className="h-4 w-4" />
            </div>
          </div>
          <h3 className="mt-3 font-[family-name:var(--font-sora)] text-2xl font-semibold text-[var(--color-text-primary)]">
            {c.value}
          </h3>
          <div className="mt-3">
            <DeltaChip value={c.delta} />
          </div>
        </article>
      ))}
    </div>
  );
}

// Bar Chart

function BarChart({
  items,
  isLoading,
}: {
  items: FinanceChartItem[] | null;
  isLoading: boolean;
}) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    setAnimated(false);
    const t = setTimeout(() => setAnimated(true), 80);
    return () => clearTimeout(t);
  }, [items]);

  const max = Math.max(
    ...(items?.flatMap((i) => [i.revenue, i.commission]) ?? [1]),
    1,
  );
  const weekTotal = (items ?? []).reduce((s, i) => s + i.revenue, 0);

  return (
    <section className="admin-card p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <SectionEyebrow>Receita</SectionEyebrow>
          <SectionTitle>Últimos 7 dias</SectionTitle>
        </div>
        {isLoading && <PulseDot />}
      </div>

      {items && items.length > 0 ? (
        <>
          <div className="flex h-[168px] items-end gap-2 rounded-[18px] bg-[var(--color-background-tertiary)] p-4">
            {items.map((item) => (
              <div
                key={item.date}
                className="flex flex-1 flex-col items-center"
              >
                <div className="flex w-full flex-1 items-end gap-0.5">
                  <div
                    className="flex-1 rounded-t-[6px] transition-all duration-700 ease-out"
                    style={{
                      height: animated
                        ? `${Math.max((item.revenue / max) * 100, 4)}%`
                        : "0%",
                      background: item.isToday ? "#1A2744" : "#E8431A",
                    }}
                  />
                  <div
                    className="flex-1 rounded-t-[6px] transition-all duration-700 ease-out"
                    style={{
                      height: animated
                        ? `${Math.max((item.commission / max) * 100, 4)}%`
                        : "0%",
                      background: item.isToday ? "#1A2744" : "#639922",
                      transitionDelay: "60ms",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-2 flex gap-2">
            {items.map((item) => (
              <div
                key={item.date}
                className="flex-1 text-center text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--color-text-secondary)]"
              >
                {item.label}
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-5">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-sm bg-[#E8431A]" />
              <span className="text-xs text-[var(--color-text-secondary)]">
                Receita total
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-sm bg-[#639922]" />
              <span className="text-xs text-[var(--color-text-secondary)]">
                Comissão
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-sm bg-[#1A2744]" />
              <span className="text-xs text-[var(--color-text-secondary)]">
                Hoje
              </span>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-background-tertiary)] px-4 py-3">
            <span className="text-sm text-[var(--color-text-secondary)]">
              Total da semana
            </span>
            <strong className="font-[family-name:var(--font-sora)] text-lg text-[var(--color-text-primary)]">
              {formatMoney(weekTotal)}
            </strong>
          </div>
        </>
      ) : (
        <div className="flex h-[168px] items-center justify-center rounded-[18px] bg-[var(--color-background-tertiary)]">
          <p className="text-sm text-[var(--color-text-secondary)]">
            {isLoading ? "A carregar…" : "Sem dados para este período."}
          </p>
        </div>
      )}
    </section>
  );
}

// Donut Chart

function DonutChart({
  data,
  isLoading,
}: {
  data: RevenueByType | null;
  isLoading: boolean;
}) {
  const total = data ? data.external + data.internal + data.commissions : 0;
  const extPct = total > 0 ? data!.external / total : 0.6;
  const intPct = total > 0 ? data!.internal / total : 0.3;
  const comPct = total > 0 ? data!.commissions / total : 0.1;

  const r = 40;
  const C = 2 * Math.PI * r;

  const slices = [
    {
      color: "#E8431A",
      pct: extPct,
      length: extPct * C,
      label: "Pedidos externos",
      value: data?.external ?? 0,
    },
    {
      color: "#639922",
      pct: intPct,
      length: intPct * C,
      label: "Pedidos internos",
      value: data?.internal ?? 0,
    },
    {
      color: "#378ADD",
      pct: comPct,
      length: comPct * C,
      label: "Comissões",
      value: data?.commissions ?? 0,
    },
  ];

  return (
    <section className="admin-card p-6">
      <div className="mb-5">
        <SectionEyebrow>Distribuição</SectionEyebrow>
        <SectionTitle>Receita por tipo</SectionTitle>
      </div>

      {isLoading ? (
        <div className="flex h-[220px] items-center justify-center">
          <div className="h-32 w-32 animate-pulse rounded-full bg-[var(--color-background-tertiary)]" />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-6">
          <svg viewBox="0 0 110 110" className="h-36 w-36">
            <g transform="rotate(-90 55 55)">
              <circle
                cx="55"
                cy="55"
                r={r}
                fill="none"
                stroke="#f5f7fa"
                strokeWidth="14"
              />
              {slices.map((s, i) => {
                const offset = slices
                  .slice(0, i)
                  .reduce((sum, prev) => sum + prev.length, 0);
                return (
                  <circle
                    key={s.label}
                    cx="55"
                    cy="55"
                    r={r}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="14"
                    strokeLinecap="butt"
                    strokeDasharray={`${s.length} ${C - s.length}`}
                    strokeDashoffset={`${-offset}`}
                  />
                );
              })}
            </g>
            <text
              x="55"
              y="51"
              textAnchor="middle"
              fontSize="8"
              fill="#5b6478"
              fontWeight="500"
            >
              Total
            </text>
            <text
              x="55"
              y="63"
              textAnchor="middle"
              fontSize="7.5"
              fill="#0f172a"
              fontWeight="700"
            >
              {total > 0
                ? `${Math.round(extPct * 100)}% ext`
                : "—"}
            </text>
          </svg>

          <div className="w-full space-y-3">
            {slices.map((s) => (
              <div
                key={s.label}
                className="flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: s.color }}
                  />
                  <span className="text-sm text-[var(--color-text-secondary)]">
                    {s.label}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--color-text-primary)]">
                    {Math.round(s.pct * 100)}%
                  </span>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    {data ? formatMoney(s.value) : "—"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// Transactions Table

function TransactionsTable({
  transactions,
  isLoading,
}: {
  transactions: FinanceTransaction[] | null;
  isLoading: boolean;
}) {
  const heads = [
    "Nº Pedido",
    "Cliente",
    "Valor total",
    "Comissão",
    "Método",
    "Estado",
  ];

  return (
    <section className="admin-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-5">
        <div>
          <SectionEyebrow>Movimentos</SectionEyebrow>
          <SectionTitle>Transacções recentes</SectionTitle>
        </div>
        {isLoading && <PulseDot />}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left">
          <thead className="border-b border-[var(--color-border)] text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
            <tr>
              {heads.map((h) => (
                <th key={h} className="px-6 py-4 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-[var(--color-border)]">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-6 py-4">
                      <div className="h-4 animate-pulse rounded-lg bg-[var(--color-background-tertiary)]" />
                    </td>
                  ))}
                </tr>
              ))}

            {!isLoading &&
              (transactions ?? []).map((tx) => (
                <tr
                  key={tx.id}
                  className="border-b border-[var(--color-border)] transition-colors last:border-b-0 hover:bg-[var(--color-background-tertiary)]/60"
                >
                  <td className="px-6 py-4 font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--color-text-primary)]">
                    {tx.orderNumber}
                  </td>
                  <td className="px-6 py-4 text-sm text-[var(--color-text-secondary)]">
                    {tx.customer}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-[var(--color-text-primary)]">
                    {formatMoney(tx.totalAmount)}
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold text-[#639922]">
                    {formatMoney(tx.commission)}
                  </td>
                  <td className="px-6 py-4 text-sm text-[var(--color-text-secondary)]">
                    {tx.paymentMethod}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${txStatusStyle(tx.status)}`}
                    >
                      {txStatusLabel(tx.status)}
                    </span>
                  </td>
                </tr>
              ))}

            {!isLoading && !transactions?.length && (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-10 text-center text-sm text-[var(--color-text-secondary)]"
                >
                  Nenhuma transacção encontrada para este período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// KPI Cards

function KPICards({
  data,
  isLoading,
}: {
  data: FinanceKPIs | null;
  isLoading: boolean;
}) {
  if (isLoading || !data) {
    return (
      <section className="admin-card p-6">
        <div className="mb-5">
          <SectionEyebrow>Performance</SectionEyebrow>
          <SectionTitle>Indicadores chave</SectionTitle>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-[18px] bg-[var(--color-background-tertiary)]"
            />
          ))}
        </div>
      </section>
    );
  }

  const kpis = [
    {
      label: "Margem média",
      value: `${data.avgMargin.toFixed(1)}%`,
      trend: data.avgMarginTrend,
      trendText:
        data.avgMarginTrend === "up"
          ? "Margem a subir"
          : data.avgMarginTrend === "down"
            ? "Margem a descer"
            : "Margem estável",
      invertPositive: false,
    },
    {
      label: "Taxa de conversão",
      value: `${data.conversionRate.toFixed(1)}%`,
      trend: data.conversionRateTrend,
      trendText:
        data.conversionRateTrend === "up"
          ? "Conversão a subir"
          : data.conversionRateTrend === "down"
            ? "Conversão a descer"
            : "Conversão estável",
      invertPositive: false,
    },
    {
      label: "Tempo médio de cotação",
      value: `${data.avgQuoteTime.toFixed(1)}h`,
      trend: data.avgQuoteTimeTrend,
      trendText:
        data.avgQuoteTimeTrend === "down"
          ? "Tempo a melhorar"
          : data.avgQuoteTimeTrend === "up"
            ? "Tempo a aumentar"
            : "Tempo estável",
      invertPositive: true,
    },
    {
      label: "Pedidos cancelados",
      value: String(data.cancelledOrders),
      trend: data.cancelledOrdersTrend,
      trendText:
        data.cancelledOrdersTrend === "down"
          ? "Cancelamentos a baixar"
          : data.cancelledOrdersTrend === "up"
            ? "Cancelamentos a subir"
            : "Cancelamentos estáveis",
      invertPositive: true,
    },
  ];

  return (
    <section className="admin-card p-6">
      <div className="mb-5">
        <SectionEyebrow>Performance</SectionEyebrow>
        <SectionTitle>Indicadores chave</SectionTitle>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {kpis.map((kpi) => {
          const isGood = kpi.invertPositive
            ? kpi.trend === "down"
            : kpi.trend === "up";
          const isBad = kpi.invertPositive
            ? kpi.trend === "up"
            : kpi.trend === "down";

          return (
            <div
              key={kpi.label}
              className="rounded-[18px] bg-[var(--color-background-tertiary)] p-4"
            >
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
                {kpi.label}
              </p>
              <p className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold text-[var(--color-text-primary)]">
                {kpi.value}
              </p>
              <p
                className={`mt-1.5 text-xs font-medium ${
                  isGood
                    ? "text-[#15803d]"
                    : isBad
                      ? "text-[#dc2626]"
                      : "text-[var(--color-text-secondary)]"
                }`}
              >
                {kpi.trendText}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// Top Clients

function TopClients({
  clients,
  isLoading,
}: {
  clients: TopClient[] | null;
  isLoading: boolean;
}) {
  return (
    <section className="admin-card p-6">
      <div className="mb-5">
        <SectionEyebrow>Ranking</SectionEyebrow>
        <SectionTitle>Melhores clientes</SectionTitle>
      </div>

      <div className="space-y-3">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-[60px] animate-pulse rounded-[16px] bg-[var(--color-background-tertiary)]"
              />
            ))
          : (clients ?? []).map((client) => (
              <div
                key={client.rank}
                className="flex items-center gap-4 rounded-[16px] border border-[var(--color-border)] bg-[var(--color-background-tertiary)] px-4 py-3"
              >
                <span className="w-4 shrink-0 text-center font-[family-name:var(--font-sora)] text-sm font-bold text-[var(--color-text-secondary)]">
                  {client.rank}
                </span>
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{
                    background:
                      AVATAR_COLORS[(client.rank - 1) % AVATAR_COLORS.length],
                  }}
                >
                  {initials(client.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                    {client.name}
                  </p>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    {client.orderCount} pedido(s)
                  </p>
                </div>
                <strong className="shrink-0 font-[family-name:var(--font-sora)] text-sm text-[var(--color-danger)]">
                  {formatMoney(client.totalSpent)}
                </strong>
              </div>
            ))}

        {!clients?.length && !isLoading && (
          <p className="rounded-[16px] border border-dashed border-[var(--color-border-strong)] px-4 py-6 text-center text-sm text-[var(--color-text-secondary)]">
            Sem dados de clientes para este período.
          </p>
        )}
      </div>
    </section>
  );
}

// Payment Methods

function PaymentMethods({
  methods,
  isLoading,
}: {
  methods: PaymentMethodStat[] | null;
  isLoading: boolean;
}) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    setAnimated(false);
    const t = setTimeout(() => setAnimated(true), 150);
    return () => clearTimeout(t);
  }, [methods]);

  return (
    <section className="admin-card p-6">
      <div className="mb-5">
        <SectionEyebrow>Pagamentos</SectionEyebrow>
        <SectionTitle>Métodos de pagamento</SectionTitle>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-[18px] bg-[var(--color-background-tertiary)]"
              />
            ))
          : (methods ?? []).map((m) => {
              const color = METHOD_COLORS[m.method] ?? "#E8431A";
              return (
                <div
                  key={m.method}
                  className="rounded-[18px] bg-[var(--color-background-tertiary)] p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                      {m.method}
                    </span>
                    <span
                      className="font-[family-name:var(--font-sora)] text-sm font-bold"
                      style={{ color }}
                    >
                      {m.percentage}%
                    </span>
                  </div>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
                    <div
                      className="h-full rounded-full transition-all duration-1000 ease-out"
                      style={{
                        width: animated ? `${m.percentage}%` : "0%",
                        background: color,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                    {formatMoney(m.amount)}
                  </p>
                </div>
              );
            })}
      </div>
    </section>
  );
}

// Revenue Breakdown

function RevenueBreakdown({ data, isLoading }: { data: FinanceStats | null; isLoading: boolean }) {
  if (isLoading || !data) {
    return (
      <div className="grid gap-6 xl:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="admin-card animate-pulse p-6">
            <div className="h-52 rounded-2xl bg-[var(--color-background-tertiary)]" />
          </div>
        ))}
      </div>
    );
  }

  const panels = [
    {
      title: "Facturação acumulada",
      copy: "Tudo o que foi confirmado e pago em MZN.",
      lead: data.totalRevenue,
      chips: [
        { label: "Mercadoria comprada", value: data.totalMerchandise },
        { label: "Taxa do site", value: data.totalSiteRevenue },
        { label: "Entrega", value: data.totalDelivery },
        { label: "Margem estimada", value: data.totalMargin, accent: true },
      ],
    },
    {
      title: "Facturação de hoje",
      copy: "Leitura do que entrou hoje com base na data real do pagamento.",
      lead: data.todayRevenue,
      chips: [
        { label: "Mercadoria hoje", value: data.todayMerchandise },
        { label: "Taxa do site hoje", value: data.todaySiteRevenue },
        { label: "Entrega hoje", value: data.todayDelivery },
        { label: "Margem hoje", value: data.todayMargin, accent: true },
      ],
    },
  ];

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {panels.map((p) => (
        <article key={p.title} className="admin-card p-6">
          <div className="mb-4">
            <SectionEyebrow>Receita</SectionEyebrow>
            <SectionTitle>{p.title}</SectionTitle>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{p.copy}</p>
          </div>
          <div className="mb-4 rounded-[18px] bg-[var(--color-background-tertiary)] px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
              Entrada total
            </p>
            <p className="mt-1 font-[family-name:var(--font-sora)] text-2xl font-semibold text-[var(--color-text-primary)]">
              {formatMoney(p.lead)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {p.chips.map((chip) => (
              <div
                key={chip.label}
                className={`rounded-[14px] border px-4 py-3 ${
                  chip.accent
                    ? "border-[rgba(232,67,26,0.22)] bg-[rgba(232,67,26,0.06)]"
                    : "border-[var(--color-border)] bg-[var(--color-background-tertiary)]"
                }`}
              >
                <p className="text-[11px] font-medium text-[var(--color-text-secondary)]">{chip.label}</p>
                <p
                  className={`mt-1 font-[family-name:var(--font-sora)] text-sm font-semibold ${
                    chip.accent ? "text-[var(--color-danger)]" : "text-[var(--color-text-primary)]"
                  }`}
                >
                  {formatMoney(chip.value)}
                </p>
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

// Key Percentages + Channel Split

function KeyPercentagesAndChannels({ data, isLoading }: { data: FinanceStats | null; isLoading: boolean }) {
  if (isLoading || !data) {
    return (
      <div className="grid gap-6 xl:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="admin-card animate-pulse p-6">
            <div className="h-44 rounded-2xl bg-[var(--color-background-tertiary)]" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {/* Percentagens chave */}
      <article className="admin-card p-6">
        <div className="mb-4">
          <SectionEyebrow>Métricas</SectionEyebrow>
          <SectionTitle>Percentagens chave</SectionTitle>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Mostra quanto da facturação está a vir da taxa do site.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Peso da taxa no total", value: `${data.siteSharePct.toFixed(2)}%` },
            { label: "Peso da taxa hoje", value: `${data.todaySiteSharePct.toFixed(2)}%` },
            { label: "Ticket médio", value: formatMoney(data.avgTicket) },
            { label: "Pedidos pagos hoje", value: String(data.paidOrdersToday) },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-background-tertiary)] px-4 py-3"
            >
              <p className="text-[11px] font-medium text-[var(--color-text-secondary)]">{item.label}</p>
              <p className="mt-1 font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--color-text-primary)]">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </article>

      {/* Loja vs encomendas */}
      <article className="admin-card p-6">
        <div className="mb-4">
          <SectionEyebrow>Canais</SectionEyebrow>
          <SectionTitle>Loja vs encomendas</SectionTitle>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Ajuda a perceber qual canal está a puxar o caixa.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[
            {
              label: "Loja interna",
              total: data.internalSales,
              today: data.internalSalesToday,
              orders: data.paidInternalOrders,
              color: "#639922",
            },
            {
              label: "Encomendas externas",
              total: data.externalSales,
              today: data.externalSalesToday,
              orders: data.paidExternalOrders,
              color: "#E8431A",
            },
          ].map((ch) => (
            <div
              key={ch.label}
              className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-background-tertiary)] px-4 py-4"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
                {ch.label}
              </p>
              <p
                className="mt-2 font-[family-name:var(--font-sora)] text-lg font-semibold"
                style={{ color: ch.color }}
              >
                {formatMoney(ch.total)}
              </p>
              <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                Hoje: <span className="font-semibold text-[var(--color-text-primary)]">{formatMoney(ch.today)}</span>
              </p>
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                Pedidos pagos: <span className="font-semibold text-[var(--color-text-primary)]">{ch.orders}</span>
              </p>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}

// Guidance Sections

function GuidanceSections() {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {/* Guia de moedas */}
      <article className="admin-card p-6">
        <div className="mb-4">
          <SectionEyebrow>Referência</SectionEyebrow>
          <SectionTitle>Guia de moedas</SectionTitle>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Uma referência simples para toda a equipa usar a mesma leitura.
          </p>
        </div>
        <div className="space-y-3">
          {[
            {
              badge: "MZN",
              title: "Preço final para caixa e vendas",
              copy: "Tudo o que aparece nesta página como facturação, taxa do site, entrega e margem está em metical.",
            },
            {
              badge: "ZAR",
              title: "Custo de compra em fornecedores da África do Sul",
              copy: "Use apenas em orçamentos e compras. Quando entra no painel financeiro, já deve estar convertido para MZN.",
            },
            {
              badge: "USD",
              title: "Custo de compra em links externos e fontes em dólar",
              copy: "Bom para o time de compras. Para a equipa comercial e de caixa, a referência oficial continua a ser o MZN.",
            },
          ].map((c) => (
            <div
              key={c.badge}
              className="flex gap-3 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-background-tertiary)] px-4 py-3"
            >
              <span className="mt-0.5 shrink-0 rounded-md bg-[rgba(232,67,26,0.1)] px-2 py-0.5 text-xs font-bold text-[var(--color-danger)]">
                {c.badge}
              </span>
              <div>
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">{c.title}</p>
                <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">{c.copy}</p>
              </div>
            </div>
          ))}
        </div>
      </article>

      {/* Fluxo de leitura */}
      <article className="admin-card p-6">
        <div className="mb-4">
          <SectionEyebrow>Equipa</SectionEyebrow>
          <SectionTitle>Fluxo de leitura recomendado</SectionTitle>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Padrão recomendado para reduzir dúvidas no trabalho diário.
          </p>
        </div>
        <div className="space-y-3">
          {[
            {
              step: "1",
              title: "Vendas e caixa",
              copy: "Olhar sempre para MZN em facturação total, facturação de hoje e ticket médio.",
            },
            {
              step: "2",
              title: "Custos de compra",
              copy: "Consultar ZAR ou USD apenas na fase de cotação e compra ao fornecedor.",
            },
            {
              step: "3",
              title: "Avaliar margem",
              copy: "Usar margem estimada para perceber quanto sobra depois da mercadoria.",
            },
            {
              step: "4",
              title: "Ler canais",
              copy: "Separar loja interna e encomendas externas para saber onde a equipa está a vender melhor.",
            },
          ].map((s) => (
            <div
              key={s.step}
              className="flex gap-3 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-background-tertiary)] px-4 py-3"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-danger)] text-xs font-bold text-white">
                {s.step}
              </span>
              <div>
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">{s.title}</p>
                <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">{s.copy}</p>
              </div>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}

// Cost Breakdown

const TREASURY_ACCENT_COLORS = ["#E8431A", "#639922", "#378ADD", "#534AB7", "#854F0B"];

const TREASURY_KIND_META: Record<
  TreasuryEntry["kind"],
  { label: string; chipClassName: string }
> = {
  WITHDRAWAL: {
    label: "Retirada",
    chipClassName: "bg-[rgba(232,67,26,0.12)] text-[var(--color-danger)]",
  },
  EXPENSE: {
    label: "Despesa",
    chipClassName: "bg-[rgba(55,138,221,0.12)] text-[#378ADD]",
  },
};

function CostBreakdownSection({
  data,
  isLoading,
}: {
  data: CostBreakdown | null;
  isLoading: boolean;
}) {
  const [entries, setEntries] = useState<TreasuryEntry[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem(TREASURY_STORAGE_KEY) ?? "[]");
    } catch {
      return [];
    }
  });
  const [label, setLabel] = useState("");
  const [account, setAccount] = useState(TREASURY_ACCOUNTS[0]);
  const [kind, setKind] = useState<TreasuryEntry["kind"]>("WITHDRAWAL");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState("");

  function saveEntries(next: TreasuryEntry[]) {
    setEntries(next);
    localStorage.setItem(TREASURY_STORAGE_KEY, JSON.stringify(next));
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(amount.replace(",", "."));
    if (!label.trim()) {
      setFormError("Insere uma descrição.");
      return;
    }
    if (isNaN(parsed) || parsed <= 0) {
      setFormError("Insere um valor válido.");
      return;
    }

    setFormError("");
    saveEntries([
      ...entries,
      {
        id: crypto.randomUUID(),
        label: label.trim(),
        account,
        kind,
        note: note.trim() || undefined,
        amount: parsed,
        addedAt: new Date().toISOString(),
      },
    ]);
    setLabel("");
    setAccount(TREASURY_ACCOUNTS[0]);
    setKind("WITHDRAWAL");
    setNote("");
    setAmount("");
  }

  function handleRemove(id: string) {
    saveEntries(entries.filter((entry) => entry.id !== id));
  }

  const totalTreasuryOut = entries.reduce((sum, entry) => sum + entry.amount, 0);
  const costItems = [
    {
      label: "Taxa do site",
      copy: "Comissão cobrada a todos os pedidos confirmados.",
      value: data?.siteTax ?? 0,
      color: "#E8431A",
    },
    {
      label: "Comissão de pedidos externos",
      copy: "Comissão XDigital aplicada nas cotações de encomendas externas.",
      value: data?.externalCommission ?? 0,
      color: "#378ADD",
    },
    {
      label: "Seguro e risco",
      copy: "Provisão para cobrir devoluções e risco de perda em encomendas.",
      value: data?.insurance ?? 0,
      color: "#534AB7",
    },
    {
      label: "Alfândegas",
      copy: "Custos de importação pagos convertidos para metical.",
      value: data?.customs ?? 0,
      color: "#854F0B",
    },
    {
      label: "Taxa das alfândegas sul-africana",
      copy: "Taxa das alfândegas sul-africana provisionada nas cotações externas.",
      value: data?.operational ?? 0,
      color: "#639922",
    },
  ];

  const controlledBase = (data?.siteTax ?? 0) + (data?.externalCommission ?? 0);
  const reservedCost =
    (data?.insurance ?? 0) + (data?.customs ?? 0) + (data?.operational ?? 0);
  const estimatedAvailable = controlledBase - reservedCost - totalTreasuryOut;
  const lastEntry = entries.length > 0 ? entries[entries.length - 1] : null;

  return (
    <section className="space-y-4">
      <div>
        <SectionEyebrow>Tesouraria</SectionEyebrow>
        <SectionTitle>Custos e retiradas sob controlo</SectionTitle>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Junta a leitura da operação com o registo de saídas para controlar caixa, contas e retiradas num só lugar.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="admin-card animate-pulse p-5">
                <div className="h-20 rounded-xl bg-[var(--color-background-tertiary)]" />
              </div>
            ))
          : costItems.map((item) => (
              <article key={item.label} className="admin-card p-5">
                <div
                  className="mb-3 h-1.5 w-10 rounded-full"
                  style={{ background: item.color }}
                />
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
                  {item.label}
                </p>
                <p className="mt-2 font-[family-name:var(--font-sora)] text-xl font-semibold text-[var(--color-text-primary)]">
                  {formatMoney(item.value)}
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
                  {item.copy}
                </p>
              </article>
            ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            label: "Base controlada",
            value: controlledBase,
            copy: "Taxa do site e comissões externas acumuladas.",
            tone: "text-[var(--color-text-primary)]",
          },
          {
            label: "Saídas registadas",
            value: totalTreasuryOut,
            copy: "Movimentos manuais de retirada e despesa.",
            tone: "text-[var(--color-danger)]",
          },
          {
            label: "Saldo estimado",
            value: estimatedAvailable,
            copy: lastEntry
              ? `Último movimento em ${new Date(lastEntry.addedAt).toLocaleDateString("pt-PT")}.`
              : "Sem movimentos manuais registados.",
            tone: estimatedAvailable >= 0 ? "text-[#15803d]" : "text-[#dc2626]",
          },
        ].map((item) => (
          <article key={item.label} className="admin-card p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
              {item.label}
            </p>
            <p className={`mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold ${item.tone}`}>
              {formatMoney(item.value)}
            </p>
            <p className="mt-1.5 text-xs text-[var(--color-text-secondary)]">
              {item.copy}
            </p>
          </article>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <article className="admin-card p-6">
          <div className="mb-4">
            <SectionEyebrow>Registo</SectionEyebrow>
            <SectionTitle>Lançar retirada ou despesa</SectionTitle>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Cada lançamento fica guardado localmente neste browser para apoiar fecho de caixa e controlo bancário.
            </p>
          </div>
          <form onSubmit={handleAdd} className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]">
                Descrição
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Ex: Retirada para fornecedor, combustível, caixa pequena"
                className="admin-input w-full text-sm"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]">
                  Conta
                </label>
                <select
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  className="admin-input w-full text-sm"
                >
                  {TREASURY_ACCOUNTS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]">
                  Tipo
                </label>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as TreasuryEntry["kind"])}
                  className="admin-input w-full text-sm"
                >
                  <option value="WITHDRAWAL">Retirada</option>
                  <option value="EXPENSE">Despesa</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]">
                Nota interna
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Opcional: referência, responsável, observações"
                className="admin-input min-h-[92px] w-full resize-none py-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]">
                Valor (MZN)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="admin-input w-full text-sm"
              />
            </div>
            {formError && (
              <p className="text-xs text-[var(--color-danger)]">{formError}</p>
            )}
            <button type="submit" className="admin-button-danger w-full">
              Guardar movimento
            </button>
          </form>
        </article>

        <article className="admin-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-5">
            <div>
              <SectionEyebrow>Movimentos</SectionEyebrow>
              <SectionTitle>Retiradas e despesas</SectionTitle>
            </div>
            {totalTreasuryOut > 0 && (
              <div className="text-right">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
                  Total
                </p>
                <p className="font-[family-name:var(--font-sora)] text-lg font-semibold text-[var(--color-danger)]">
                  {formatMoney(totalTreasuryOut)}
                </p>
              </div>
            )}
          </div>

          {entries.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-[var(--color-text-secondary)]">
              Nenhum movimento registado. Usa o formulário ao lado para começar o controlo de caixa.
            </div>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {entries.map((entry, i) => (
                <li key={entry.id} className="flex items-start gap-4 px-6 py-4">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{
                      background:
                        TREASURY_ACCENT_COLORS[i % TREASURY_ACCENT_COLORS.length],
                    }}
                  >
                    {(i + 1).toString().padStart(2, "0")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                        {entry.label}
                      </p>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${TREASURY_KIND_META[entry.kind].chipClassName}`}
                      >
                        {TREASURY_KIND_META[entry.kind].label}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                      {entry.account} • {new Date(entry.addedAt).toLocaleDateString("pt-PT", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                    {entry.note && (
                      <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                        {entry.note}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-start gap-2">
                    <span className="font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--color-text-primary)]">
                      {formatMoney(entry.amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemove(entry.id)}
                      className="rounded-lg p-1.5 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-background-tertiary)] hover:text-[var(--color-danger)]"
                      aria-label="Remover"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>
    </section>
  );
}

export function FinanceView() {
  const { hasAccess } = useAdminAuth();
  const [period, setPeriod] = useState<FinancePeriod>("month");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [stats, setStats] = useState<FinanceStats | null>(null);
  const [chart, setChart] = useState<FinanceChartItem[] | null>(null);
  const [transactions, setTransactions] = useState<FinanceTransaction[] | null>(null);
  const [kpis, setKpis] = useState<FinanceKPIs | null>(null);
  const [topClients, setTopClients] = useState<TopClient[] | null>(null);
  const [methods, setMethods] = useState<PaymentMethodStat[] | null>(null);
  const [revenueByType, setRevenueByType] = useState<RevenueByType | null>(null);
  const [costBreakdown, setCostBreakdown] = useState<CostBreakdown | null>(null);

  const loadAll = useCallback(async (p: FinancePeriod) => {
    setIsLoading(true);
    setError("");
    try {
      const payload = await adminApiFetch<FinanceOverviewResponse>(`/api/admin/finance/overview?period=${p}`);

      setStats(payload.stats);
      setChart(payload.chart);
      setTransactions(payload.transactions);
      setKpis(payload.kpis);
      setTopClients(payload.topClients);
      setMethods(payload.methods);
      setRevenueByType(payload.revenueByType);
      setCostBreakdown(payload.costBreakdown);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível carregar os dados financeiros.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll(period);
  }, [loadAll, period]);

  async function handleExport() {
    try {
      const res = await fetch(`/api/admin/finance/export?period=${period}&format=csv`);
      if (!res.ok) throw new Error("Falha ao exportar relatório.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-financeiro-${period}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // fail silently — server likely not implemented yet
    }
  }

  async function handleStatement() {
    try {
      const res = await fetch(`/api/admin/finance/statement?period=${period}`);
      if (!res.ok) throw new Error("Falha ao gerar extracto.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `extracto-${period}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // fail silently — server likely not implemented yet
    }
  }

  if (!hasAccess("finance")) return null;

  return (
    <div className="space-y-6">
      {/* Controls bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm font-medium text-[var(--color-text-secondary)]">
          {MONTH_LABEL}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as FinancePeriod)}
              className="admin-input appearance-none py-2.5 pr-9 text-sm"
              style={{ minWidth: "158px" }}
            >
              {PERIOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-secondary)]"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>

          <button
            type="button"
            onClick={() => void handleExport()}
            className="admin-button-muted"
          >
            Exportar relatório
          </button>

          <button
            type="button"
            onClick={() => void handleStatement()}
            className="admin-button-danger"
          >
            Gerar extracto
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-[18px] border border-[rgba(232,67,26,0.18)] bg-[rgba(232,67,26,0.07)] px-5 py-4 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}

      <ExchangeRatesPanel />

      <MetricCards data={stats} isLoading={isLoading} />

      <RevenueBreakdown data={stats} isLoading={isLoading} />

      <KeyPercentagesAndChannels data={stats} isLoading={isLoading} />

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <BarChart items={chart} isLoading={isLoading} />
        <DonutChart data={revenueByType} isLoading={isLoading} />
      </div>

      <TransactionsTable transactions={transactions} isLoading={isLoading} />

      <div className="grid gap-6 xl:grid-cols-2">
        <KPICards data={kpis} isLoading={isLoading} />
        <TopClients clients={topClients} isLoading={isLoading} />
      </div>

      <PaymentMethods methods={methods} isLoading={isLoading} />

      <CostBreakdownSection data={costBreakdown} isLoading={isLoading} />

      <GuidanceSections />
    </div>
  );
}

