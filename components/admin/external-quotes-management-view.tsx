"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { AttentionDot } from "@/components/admin/attention-dot";
import { AdminCardListSkeleton, AdminConfirmDialog, AdminFeedbackDock, AdminStateCard } from "@/components/admin/feedback-state";
import { QuoteIcon } from "@/components/admin/icons";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useAdminLiveRefresh } from "@/hooks/use-admin-live-refresh";
import { adminApiFetch } from "@/lib/admin/api-client";
import { formatDate, formatMoney } from "@/lib/admin/format";
import { isActionRequired, sortOperationalQueue } from "@/lib/admin/operational-queue";
import type { AdminRole } from "@/lib/admin/roles";
import type {
  AdminQuoteDetail,
  AdminQuoteListItem,
  AdminQuoteStatsResponse,
  AdminQuotesFilterState,
} from "@/lib/admin/types";

const STATUS_CARDS = [
  { key: "ALL", label: "Todos", statKey: "all" },
  { key: "UNDER_REVIEW", label: "Por analisar", statKey: "underReview" },
  { key: "DRAFT", label: "Rascunhos", statKey: "draft" },
  { key: "SENT", label: "Enviadas", statKey: "sent" },
] as const;

const STATUS_PILLS = [
  { key: "ALL", label: "Todos" },
  { key: "UNDER_REVIEW", label: "Por analisar" },
  { key: "DRAFT", label: "Rascunho" },
  { key: "SENT", label: "Enviada" },
  { key: "APPROVED", label: "Aprovada" },
  { key: "REJECTED", label: "Recusada" },
] as const;

const STORE_OPTIONS = [
  { key: "ALL", label: "Todas as lojas" },
  { key: "SHEIN", label: "Shein" },
  { key: "TEMU", label: "Temu" },
  { key: "AMAZON", label: "Amazon" },
  { key: "ALI_EXPRESS", label: "AliExpress" },
  { key: "ZARA", label: "Zara" },
  { key: "ASOS", label: "ASOS" },
  { key: "EBAY", label: "eBay" },
  ] as const;

const SORT_OPTIONS = [
  { key: "RECENT", label: "Recente" },
  { key: "URGENT", label: "Mais antigo" },
  { key: "VALUE", label: "Maior valor" },
] as const;

const STATUS_BADGES: Record<string, string> = {
  UNDER_REVIEW: "bg-[#FAEEDA] text-[#633806]",
  DRAFT: "bg-[#EEEDFE] text-[#3C3489]",
  SENT: "bg-[#E6F1FB] text-[#042C53]",
  APPROVED: "bg-[#EAF3DE] text-[#27500A]",
  REJECTED: "bg-[#FCEBEB] text-[#791F1F]",
};

const defaultFilters: AdminQuotesFilterState = {
  status: "ALL",
  search: "",
  store: "ALL",
  sort: "RECENT",
  page: 0,
  size: 10,
};

function buildAction(item: AdminQuoteListItem) {
  if (item.status === "UNDER_REVIEW") {
    return { label: "Analisar e cotar →", href: `/admin/orders/${item.id}/quote` };
  }

  if (item.status === "DRAFT") {
    return { label: "Continuar →", href: `/admin/orders/${item.id}/quote` };
  }

  if (item.status === "SENT") {
    return { label: "Ver cotação", href: `/admin/orders/${item.id}/quote` };
  }

  return {
    label: item.status === "APPROVED" ? "Ver detalhes" : "Ver detalhes",
    href: `/admin/orders/${item.id}`,
  };
}

function quoteNeedsAttention(item: AdminQuoteListItem | AdminQuoteDetail) {
  return isActionRequired(item, "QUOTES");
}

function buildDetailActions(detail: AdminQuoteDetail, role: AdminRole | null) {
  if (detail.status === "UNDER_REVIEW") {
    return {
      primary: { label: "Analisar e cotar", href: `/admin/orders/${detail.id}/quote` },
      secondary: { label: "Ver link", href: detail.externalCartUrl || "#" },
      danger: { label: "Recusar", action: "reject" as const },
    };
  }

  if (detail.status === "DRAFT") {
    return {
      primary: { label: "Continuar cotação", href: `/admin/orders/${detail.id}/quote` },
      secondary: { label: "Ver link", href: detail.externalCartUrl || "#" },
      danger: { label: "Descartar rascunho", action: "discard" as const },
    };
  }

  if (detail.status === "SENT") {
    return {
      primary: { label: "Ver cotação enviada", href: `/admin/orders/${detail.id}/quote` },
      secondary: { label: "Reenviar", href: `/admin/orders/${detail.id}/quote` },
      danger: { label: "Cancelar cotação", action: "reject" as const },
    };
  }

  if (detail.status === "APPROVED") {
    return {
      primary: { label: "Ver detalhes completos", href: `/admin/orders/${detail.id}` },
      secondary: role === "SUPER_ADMIN"
        ? { label: "Ver em pagamentos", href: `/admin/payments?orderId=${detail.id}` }
        : undefined,
      danger: null,
    };
  }

  return {
    primary: null,
    secondary: { label: "Ver motivo", action: "reason" as const },
    danger: null,
  };
}

function exportAsCsv(items: AdminQuoteListItem[]) {
  const lines = [
    ["ID", "Cliente", "Loja", "Estado", "Valor estimado", "Criado em"].join(","),
    ...items.map((item) =>
      [
        item.orderNumber,
        `"${item.customerName.replaceAll('"', '""')}"`,
        item.storeLabel,
        item.status,
        item.estimatedValue,
        item.createdAt,
      ].join(",")
    ),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "external-quotes.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function ExternalQuotesManagementView() {
  const { effectiveRole, hasAccess } = useAdminAuth();
  const [filters, setFilters] = useState(defaultFilters);
  const [quotes, setQuotes] = useState<AdminQuoteListItem[]>([]);
  const [pageMeta, setPageMeta] = useState({ page: 0, totalPages: 1, totalElements: 0 });
  const [stats, setStats] = useState<AdminQuoteStatsResponse | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<AdminQuoteDetail | null>(null);
  const [confirmAction, setConfirmAction] = useState<"reject" | "discard" | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error" | "loading"; message: string } | null>(null);
  const [shouldFocusActions, setShouldFocusActions] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasLoadedListRef = useRef(false);
  const detailActionsRef = useRef<HTMLDivElement | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const visibleQuotes = useMemo(
    () => sortOperationalQueue(quotes, "QUOTES", filters.sort === "RECENT" ? "DESC" : "ASC"),
    [filters.sort, quotes]
  );

  useAdminLiveRefresh(() => setRefreshKey((value) => value + 1), {
    enabled: hasAccess("quotes"),
    intervalMs: 10_000,
    minIntervalMs: 4_000,
    runOnMount: false,
  });

  useEffect(() => {
    if (!hasAccess("quotes")) {
      return;
    }

    let cancelled = false;
    const params = new URLSearchParams({
      status: filters.status,
      search: filters.search,
      store: filters.store,
      sort: filters.sort,
      page: String(filters.page),
      size: String(filters.size),
    });

    const loader = async () => {
      try {
        if (hasLoadedListRef.current) {
          setIsRefreshing(true);
        } else {
          setIsLoading(true);
        }

        const [listPayload, statsPayload] = await Promise.all([
          adminApiFetch<{
            content: AdminQuoteListItem[];
            totalPages: number;
            totalElements: number;
            page: number;
            size: number;
          }>(`/api/admin/quotes?${params.toString()}`),
          adminApiFetch<AdminQuoteStatsResponse>("/api/admin/quotes/stats"),
        ]);

        if (cancelled) {
          return;
        }

        const orderedContent = sortOperationalQueue(
          listPayload.content,
          "QUOTES",
          filters.sort === "RECENT" ? "DESC" : "ASC"
        );
        setQuotes(orderedContent);
        setPageMeta({
          page: listPayload.page,
          totalPages: listPayload.totalPages,
          totalElements: listPayload.totalElements,
        });
        setStats(statsPayload);
        setSelectedId((current) =>
          orderedContent.some((item) => item.id === current) ? current : orderedContent[0]?.id ?? null
        );
        hasLoadedListRef.current = true;
        setError("");
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar as cotações.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    };

    void loader();
    return () => {
      cancelled = true;
    };
  }, [filters, hasAccess, refreshKey]);

  useEffect(() => {
    let cancelled = false;

    if (!selectedId || !hasAccess("quotes") || !quotes.length) {
      queueMicrotask(() => {
        if (!cancelled) {
          setSelectedDetail(null);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    const loader = async () => {
      try {
        const payload = await adminApiFetch<AdminQuoteDetail>(`/api/admin/quotes/${selectedId}`);
        if (!cancelled) {
          setSelectedDetail(payload);
        }
      } catch {
        if (!cancelled) {
          setSelectedDetail(null);
        }
      }
    };

    void loader();
    return () => {
      cancelled = true;
    };
  }, [hasAccess, quotes.length, refreshKey, selectedId]);

  useEffect(() => {
    if (!shouldFocusActions || !selectedDetail || selectedDetail.id !== selectedId) {
      return;
    }

    detailActionsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    detailActionsRef.current?.focus({ preventScroll: true });
    setShouldFocusActions(false);
  }, [selectedDetail, selectedId, shouldFocusActions]);

  if (!hasAccess("quotes")) {
    return null;
  }

  async function refreshSelected() {
    if (!selectedId) {
      return;
    }

    const [detailPayload, statsPayload, listPayload] = await Promise.all([
      adminApiFetch<AdminQuoteDetail>(`/api/admin/quotes/${selectedId}`),
      adminApiFetch<AdminQuoteStatsResponse>("/api/admin/quotes/stats"),
      adminApiFetch<{ content: AdminQuoteListItem[]; page: number; totalPages: number; totalElements: number }>(
        `/api/admin/quotes?${new URLSearchParams({
          status: filters.status,
          search: filters.search,
          store: filters.store,
          sort: filters.sort,
          page: String(filters.page),
          size: String(filters.size),
        }).toString()}`
      ),
    ]);

    setSelectedDetail(detailPayload);
    setStats(statsPayload);
    setQuotes(sortOperationalQueue(listPayload.content, "QUOTES", filters.sort === "RECENT" ? "DESC" : "ASC"));
    setPageMeta({
      page: listPayload.page,
      totalPages: listPayload.totalPages,
      totalElements: listPayload.totalElements,
    });
  }

  function selectQuote(id: number, focusActions = false) {
    setSelectedId(id);
    if (focusActions) {
      setShouldFocusActions(true);
    }
  }

  async function handleDangerAction(action: "reject" | "discard" | "reason") {
    if (!selectedDetail) {
      return;
    }

    if (action === "reason") {
      window.alert(selectedDetail.rejectReason || "Esta cotação foi recusada.");
      return;
    }

    setConfirmAction(action);
    /*
    startTransition(async () => {
      try {
        if (action === "reject") {
          await adminApiFetch(`/api/admin/orders/${selectedDetail.id}/status`, {
            method: "PUT",
            body: JSON.stringify({ status: "CANCELLED" }),
          });
        }

        if (action === "discard") {
          await adminApiFetch(`/api/admin/orders/${selectedDetail.id}/quote/draft`, {
            method: "DELETE",
          });
        }

        await refreshSelected();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Não foi possível concluir a ação.");
      }
    });
    */
  }

  async function confirmDangerAction() {
    if (!selectedDetail || !confirmAction) {
      return;
    }

    startTransition(async () => {
      try {
        setFeedback({
          tone: "loading",
          message:
            confirmAction === "reject"
              ? `A recusar ${selectedDetail.orderNumber}.`
              : `A descartar o rascunho de ${selectedDetail.orderNumber}.`,
        });

        if (confirmAction === "reject") {
          await adminApiFetch(`/api/admin/orders/${selectedDetail.id}/cancel`, { method: "PUT" });
        }

        if (confirmAction === "discard") {
          await adminApiFetch(`/api/admin/orders/${selectedDetail.id}/quote/draft`, {
            method: "DELETE",
          });
        }

        await refreshSelected();
        setConfirmAction(null);
        setFeedback({
          tone: "success",
          message: confirmAction === "reject" ? "Pedido recusado com sucesso." : "Rascunho descartado.",
        });
      } catch (actionError) {
        const message = actionError instanceof Error ? actionError.message : "Nao foi possivel concluir a acao.";
        setError(message);
        setFeedback({ tone: "error", message });
      }
    });
  }

  const detailActions = selectedDetail ? buildDetailActions(selectedDetail, effectiveRole) : null;

  return (
    <div className="space-y-6">
      <AdminFeedbackDock feedback={feedback} onClose={() => setFeedback(null)} />
      <section className="sticky top-[88px] z-10 rounded-[28px] border border-[var(--color-border)] bg-[color:var(--color-surface-overlay)]/95 px-6 py-5 backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-danger)]">
              Pedidos por link
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="font-[family-name:var(--font-sora)] text-3xl font-semibold text-[var(--color-text-primary)]">
                Cotações externas
              </h1>
              <span className="rounded-full bg-[#FFF0D8] px-3 py-1 text-sm font-semibold text-[#A16207]">
                {stats?.pendingAnalysis ?? 0} pendente(s) de análise
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => exportAsCsv(quotes)} className="admin-button-muted">
              Exportar
            </button>
            <Link href="/admin/orders/external/new" className="admin-button-danger">
              + Criar cotação manual
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        {STATUS_CARDS.map((card) => {
          const active = filters.status === card.key;
          const value = Number(stats?.[card.statKey] ?? 0);
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => setFilters((current) => ({ ...current, status: card.key, page: 0 }))}
              className={`admin-card p-5 text-left transition ${
                active ? "border-[#E8431A] bg-[#FFF0E6]" : ""
              }`}
            >
              <p className="text-sm text-[var(--color-text-secondary)]">{card.label}</p>
              <strong className="mt-3 block font-[family-name:var(--font-sora)] text-3xl text-[var(--color-text-primary)]">
                {value}
              </strong>
            </button>
          );
        })}
      </section>

      <section className="admin-card p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {STATUS_PILLS.map((pill) => (
              <button
                key={pill.key}
                type="button"
                onClick={() => setFilters((current) => ({ ...current, status: pill.key, page: 0 }))}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                  filters.status === pill.key
                    ? "border-[#E8431A] bg-[#FFF0E6] text-[#E8431A]"
                    : "border-[var(--color-border)] bg-[var(--color-background-tertiary)] text-[var(--color-text-secondary)]"
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            {isRefreshing ? (
              <span className="text-sm text-[var(--color-text-secondary)]">A actualizar...</span>
            ) : null}
            <input
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value, page: 0 }))}
              placeholder="Pesquisar por ID, cliente ou loja"
              className="admin-input min-w-[280px]"
            />
            <select
              value={filters.store}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  store: event.target.value as AdminQuotesFilterState["store"],
                  page: 0,
                }))
              }
              className="admin-input min-w-[180px]"
            >
              {STORE_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={filters.sort}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  sort: event.target.value as AdminQuotesFilterState["sort"],
                  page: 0,
                }))
              }
              className="admin-input min-w-[180px]"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-[24px] border border-[rgba(232,67,26,0.18)] bg-[rgba(232,67,26,0.08)] px-5 py-4 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              <AdminStateCard
                title="A carregar cotacoes externas"
                message="Estamos a montar a fila de analise, os estados e os resumos de cada pedido por link."
                tone="loading"
                compact
              />
              <AdminCardListSkeleton rows={3} />
            </div>
          ) : null}

          {!isLoading && !visibleQuotes.length ? (
            <div className="admin-card p-8 text-sm text-[var(--color-text-secondary)]">
              Nenhuma cotação encontrada para os filtros activos.
            </div>
          ) : null}

          {visibleQuotes.map((quote) => {
            const action = buildAction(quote);
            const active = selectedId === quote.id;
            const needsAttention = quoteNeedsAttention(quote);

            return (
              <article
                key={quote.id}
                role="button"
                tabIndex={0}
                onClick={() => selectQuote(quote.id, true)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectQuote(quote.id, true);
                  }
                }}
                className={`admin-card relative cursor-pointer overflow-hidden border-l-[3px] border-l-transparent transition ${active ? "border-[#E8431A]" : ""} ${needsAttention ? "ring-1 ring-[rgba(249,115,22,0.18)]" : ""}`}
              >
                {needsAttention ? <AttentionDot className="absolute right-5 top-5" /> : null}
                <div className="flex flex-col gap-4 px-5 py-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(232,67,26,0.12)] font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--color-danger)]">
                        {quote.customerInitials}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          {needsAttention ? <AttentionDot label="Esta cotacao ainda precisa de acao" className="lg:hidden" /> : null}
                          <span className="font-[family-name:var(--font-sora)] text-xl font-semibold text-[var(--color-text-primary)]">
                            {quote.orderNumber}
                          </span>
                          <span className="rounded-full bg-[#E6F1FB] px-2.5 py-1 text-xs font-semibold text-[#0B63A6]">
                            {quote.storeLabel}
                          </span>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGES[quote.status]}`}>
                            {STATUS_PILLS.find((item) => item.key === quote.status)?.label ?? quote.status}
                          </span>
                        </div>
                        <p className="mt-2 font-medium text-[var(--color-text-primary)]">{quote.customerName}</p>
                        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{quote.timeAgoLabel}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[24px] bg-[var(--color-background-tertiary)] p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <code className="block truncate rounded-2xl bg-[var(--color-background-secondary)] px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                        {quote.externalCartUrl || "Sem link original disponível"}
                      </code>
                      <a
                        href={quote.externalCartUrl || "#"}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="admin-button-muted whitespace-nowrap"
                      >
                        Abrir ↗
                      </a>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {quote.itemChips.map((chip) => (
                        <span
                          key={chip}
                          className="rounded-full bg-[var(--color-background-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)]"
                        >
                          {chip}
                        </span>
                      ))}
                      {quote.remainingItems > 0 ? (
                        <span className="rounded-full bg-[var(--color-background-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
                          +{quote.remainingItems} itens
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
                          Valor estimado
                        </p>
                        <strong className="font-[family-name:var(--font-sora)] text-xl text-[var(--color-text-primary)]">
                          {formatMoney(quote.estimatedValue)}
                        </strong>
                      </div>

                      <Link
                        href={action.href}
                        onClick={(event) => event.stopPropagation()}
                        className="text-sm font-semibold text-[var(--color-danger)]"
                      >
                        {action.label}
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}

          {pageMeta.totalPages > 1 ? (
            <div className="admin-card flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <p className="text-sm text-[var(--color-text-secondary)]">
                Página {pageMeta.page + 1} de {pageMeta.totalPages}
              </p>
              <div className="flex items-center gap-2">
                {Array.from({ length: pageMeta.totalPages }).map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setFilters((current) => ({ ...current, page: index }))}
                    className={`h-10 min-w-10 rounded-full px-3 text-sm font-medium transition ${
                      pageMeta.page === index
                        ? "bg-[var(--color-danger)] text-white"
                        : "bg-[var(--color-background-tertiary)] text-[var(--color-text-secondary)]"
                    }`}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <aside className="sticky top-[132px] self-start">
          <div className="admin-card min-h-[420px] p-5">
            {!selectedDetail ? (
              <div className="flex min-h-[360px] flex-col items-center justify-center text-center text-sm text-[var(--color-text-secondary)]">
                <QuoteIcon className="h-10 w-10 text-[var(--color-text-secondary)]" />
                <p className="mt-4">Seleccione uma cotação para ver os detalhes</p>
              </div>
            ) : (
              <>
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">
                      Cotação seleccionada
                    </p>
                    <h2 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold">
                      <span className="inline-flex items-center gap-3">
                        {selectedDetail.orderNumber}
                        {quoteNeedsAttention(selectedDetail) ? (
                          <AttentionDot label="Esta cotacao ainda precisa de acao" />
                        ) : null}
                      </span>
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(null);
                      setSelectedDetail(null);
                      setShouldFocusActions(false);
                    }}
                    className="rounded-full border border-[var(--color-border)] px-3 py-1 text-sm text-[var(--color-text-secondary)]"
                  >
                    ×
                  </button>
                </div>

                <section className="space-y-3 border-b border-[var(--color-border)] pb-4 text-sm">
                  {[
                    ["Loja", selectedDetail.storeLabel],
                    ["Data de submissão", formatDate(selectedDetail.createdAt)],
                    ["Estado", STATUS_PILLS.find((item) => item.key === selectedDetail.status)?.label ?? selectedDetail.status],
                    ["Validade", selectedDetail.validityDate ? formatDate(selectedDetail.validityDate) : "Sem validade definida"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-4">
                      <span className="text-[var(--color-text-secondary)]">{label}</span>
                      <strong className="text-right text-[var(--color-text-primary)]">{value}</strong>
                    </div>
                  ))}
                </section>

                <section className="border-b border-[var(--color-border)] py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">
                    Itens
                  </p>
                  <div className="mt-3 space-y-3">
                    {selectedDetail.items.map((item) => (
                      <div key={item.id} className="flex items-start justify-between gap-4 text-sm">
                        <div>
                          <p className="font-medium text-[var(--color-text-primary)]">{item.name}</p>
                          <p className="text-[var(--color-text-secondary)]">Qtd. {item.quantity}</p>
                        </div>
                        <strong className="font-[family-name:var(--font-sora)] text-[var(--color-text-primary)]">
                          {formatMoney(item.amount)}
                        </strong>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">
                    Resumo financeiro
                  </p>
                  <div className="mt-3 space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[var(--color-text-secondary)]">Itens</span>
                      <strong>{formatMoney(selectedDetail.financialSummary.items)}</strong>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[var(--color-text-secondary)]">Frete e taxas</span>
                      <strong>{formatMoney(selectedDetail.financialSummary.freightAndTaxes)}</strong>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[var(--color-text-secondary)]">Comissão</span>
                      <strong>{formatMoney(selectedDetail.financialSummary.commission)}</strong>
                    </div>
                    <div className="flex items-center justify-between gap-3 pt-2">
                      <span className="text-[var(--color-text-secondary)]">Total</span>
                      <strong className="font-[family-name:var(--font-sora)] text-2xl text-[#E8431A]">
                        {formatMoney(selectedDetail.financialSummary.total)}
                      </strong>
                    </div>
                  </div>
                </section>

                <div ref={detailActionsRef} tabIndex={-1} className="mt-4 flex flex-col gap-3 outline-none">
                  {detailActions?.primary ? (
                    <Link href={detailActions.primary.href} className="admin-button-danger justify-center">
                      {detailActions.primary.label}
                    </Link>
                  ) : null}

                  {detailActions?.secondary ? (
                    (() => {
                      const secondaryAction = detailActions.secondary;
                      return "href" in secondaryAction ? (
                        (() => {
                        const secondaryHref = secondaryAction.href ?? "#";
                        const opensExternally = secondaryHref.startsWith("http");

                        return (
                          <a
                            href={secondaryHref}
                            target={opensExternally ? "_blank" : undefined}
                            rel={opensExternally ? "noreferrer" : undefined}
                            className="admin-button-muted justify-center"
                          >
                            {secondaryAction.label}
                          </a>
                        );
                      })()
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          if (secondaryAction.action) {
                            void handleDangerAction(secondaryAction.action);
                          }
                        }}
                        className="admin-button-muted justify-center"
                      >
                        {secondaryAction.label}
                      </button>
                    );
                    })()
                  ) : null}

                  {detailActions?.danger ? (
                    <button
                      type="button"
                      onClick={() => void handleDangerAction(detailActions.danger.action)}
                      disabled={isPending}
                      className="rounded-full border border-[rgba(226,75,74,0.3)] px-4 py-3 text-sm font-semibold text-[#B42318] transition hover:bg-[rgba(252,235,235,0.8)]"
                    >
                      {isPending ? "A processar..." : detailActions.danger.label}
                    </button>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
      <AdminConfirmDialog
        open={Boolean(confirmAction && selectedDetail)}
        title={confirmAction === "discard" ? "Descartar rascunho?" : "Recusar pedido?"}
        message={
          confirmAction === "discard"
            ? `O rascunho da cotacao ${selectedDetail?.orderNumber ?? ""} sera removido. O pedido continua disponivel para nova analise.`
            : `O pedido ${selectedDetail?.orderNumber ?? ""} sera recusado e deixara de aparecer como cotacao activa.`
        }
        confirmLabel={confirmAction === "discard" ? "Descartar rascunho" : "Recusar pedido"}
        cancelLabel="Voltar"
        danger
        pending={isPending}
        onCancel={() => {
          if (!isPending) {
            setConfirmAction(null);
          }
        }}
        onConfirm={() => void confirmDangerAction()}
      />
    </div>
  );
}
