"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { AdminConfirmDialog, AdminSectionSkeleton } from "@/components/admin/feedback-state";
import { WhatsAppPhone } from "@/components/admin/whatsapp-link";
import { useAdminLiveRefresh } from "@/hooks/use-admin-live-refresh";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { adminApiFetch } from "@/lib/admin/api-client";
import { formatDate, formatMoney, humanizeOrderStatus } from "@/lib/admin/format";
import { buildOrderWhatsAppMessage } from "@/lib/admin/whatsapp";
import { canManageFinance, canManageOrders } from "@/lib/admin/permissions";
import type {
  ExchangeRate,
  ClarificationField,
  ExternalOrderDetail,
  ExternalOrderDraft,
  OrderHistoryEntry,
  QuoteSendOptions,
  QuoteSendResponse,
  QuoteDefaultsResponse,
  QuoteSubmissionPayload,
} from "@/lib/admin/types";

type QuoteCurrency = "USD" | "ZAR";

const QUOTE_STORAGE_KEYS = {
  currency: "xdigital_quote_currency",
  commissionPercentage: "xdigital_quote_commissionPercentage",
  returnRiskPercentage: "xdigital_quote_returnRiskPercentage",
  operationalCostPercentage: "xdigital_quote_operationalCostPercentage",
} as const;

type QuoteSummary = {
  productValue: number;
  shippingValue: number;
  subtotalConverted: number;
  returnRiskValue: number;
  operationalCostValue: number;
  siteBaseValue: number;
  siteFeeValue: number;
  totalFinal: number;
  margin: number;
  lowMargin: boolean;
};

function getErrorStatus(error: unknown) {
  return error && typeof error === "object" && "status" in error
    ? Number((error as { status?: unknown }).status)
    : null;
}

function getStatusTheme(status: string) {
  return status === "EXTERNAL"
    ? "bg-[#FFF0E6] text-[#AA4E1C]"
    : "bg-[#E8F6EB] text-[#185C2E]";
}

function readStoredNumber(key: string, fallback: number) {
  if (typeof window === "undefined") {
    return fallback;
  }

  const raw = window.localStorage.getItem(key);
  if (raw == null || raw === "") {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatInputNumber(value: number) {
  return value === 0 ? "" : String(value);
}

function formatRate(value: number) {
  return value.toLocaleString("pt-MZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

function isQuoteCurrency(value: string): value is QuoteCurrency {
  return value === "USD" || value === "ZAR";
}

const compactNumberInputClass =
  "admin-input h-11 max-w-[220px] rounded-2xl px-3 py-2 text-sm";

const CLARIFICATION_FIELDS: Array<{ value: ClarificationField; label: string }> = [
  { value: "SIZE", label: "Tamanho" },
  { value: "COLOR", label: "Cor" },
  { value: "MODEL", label: "Modelo" },
  { value: "STORAGE", label: "Memória/capacidade" },
  { value: "LINK", label: "Link correto" },
  { value: "PHOTO", label: "Fotos ou capturas de ecrã" },
  { value: "OTHER", label: "Outro detalhe" },
];

const CLARIFICATION_LABELS: Record<string, string> = {
  SIZE: "Tamanho",
  COLOR: "Cor",
  MODEL: "Modelo",
  QUANTITY: "Quantidade",
  STORAGE: "Memória/capacidade",
  LINK: "Link correto",
  PHOTO: "Fotos ou capturas de ecrã",
  OTHER: "Outro detalhe",
};

function buildAutomaticValidityDate() {
  return new Date().toISOString().slice(0, 10);
}

function persistQuoteDefaults(draft: ExternalOrderDraft) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(QUOTE_STORAGE_KEYS.currency, draft.currency || "ZAR");
  window.localStorage.setItem(
    QUOTE_STORAGE_KEYS.commissionPercentage,
    String(draft.commissionPercentage)
  );
  window.localStorage.setItem(
    QUOTE_STORAGE_KEYS.returnRiskPercentage,
    String(draft.returnRiskPercentage)
  );
  window.localStorage.setItem(
    QUOTE_STORAGE_KEYS.operationalCostPercentage,
    String(draft.operationalCostPercentage)
  );
}

function buildSummary(draft: ExternalOrderDraft): QuoteSummary {
  const productValue = Number(draft.baseAmount || 0) * Number(draft.exchangeRate || 0);
  const shippingValue = Number(draft.shippingFee || 0) * Number(draft.exchangeRate || 0);
  const subtotalConverted = productValue + shippingValue;
  const returnRiskValue = productValue * (Number(draft.returnRiskPercentage || 0) / 100);
  const operationalCostValue = productValue * (Number(draft.operationalCostPercentage || 0) / 100);
  const siteBaseValue = productValue + returnRiskValue + operationalCostValue;
  const siteFeeValue = siteBaseValue * (Number(draft.commissionPercentage || 0) / 100);
  const totalFinal = siteBaseValue + siteFeeValue + shippingValue;
  const margin = totalFinal > 0 ? (siteFeeValue / totalFinal) * 100 : 0;

  return {
    productValue,
    shippingValue,
    subtotalConverted,
    returnRiskValue,
    operationalCostValue,
    siteBaseValue,
    siteFeeValue,
    totalFinal,
    margin,
    lowMargin: margin < 5,
  };
}

function withComputedTotals(draft: ExternalOrderDraft) {
  const summary = buildSummary(draft);

  return {
    ...draft,
    totalFinal: Number(summary.totalFinal.toFixed(2)),
  };
}

function buildQuoteSharePreview(orderNumber: string, total: number, quoteUrl = "https://shopeemz.xdigitalmz.com/quote/...") {
  return `Ola 👋 A tua cotacao da ShopeeMz ja esta pronta.

Pedido: ${orderNumber}
Total: ${formatMoney(total)}
Validade: ate 24h

Ve e confirma aqui:
${quoteUrl}`;
}

function buildDraft(
  detail: ExternalOrderDetail,
  defaults: QuoteDefaultsResponse
): ExternalOrderDraft {
  const fallbackBaseAmount =
    Number(detail.suggestedBaseAmount || 0) ||
    detail.externalItems.reduce(
      (sum, item) => sum + Number(item.originalPriceUsd || 0) * Number(item.quantity || 1),
      0
    );

  return withComputedTotals({
    exchangeRate: 0,
    baseAmount: Number(fallbackBaseAmount || 0),
    shippingFee: 0,
    currency: (typeof window !== "undefined" ? window.localStorage.getItem(QUOTE_STORAGE_KEYS.currency) : null) || "ZAR",
    commissionPercentage: readStoredNumber(
      QUOTE_STORAGE_KEYS.commissionPercentage,
      Number(defaults.commissionPercentage || 10)
    ),
    returnRiskPercentage: readStoredNumber(
      QUOTE_STORAGE_KEYS.returnRiskPercentage,
      Number(defaults.returnRiskPercentage || 5)
    ),
    operationalCostPercentage: readStoredNumber(
      QUOTE_STORAGE_KEYS.operationalCostPercentage,
      Number(defaults.operationalCostPercentage || 0)
    ),
    urgentPercentage: 0,
    urgentAmount: 0,
    totalFinal: 0,
    notes: "",
    validityDate: "",
  });
}

function normalizeDraft(
  rawDraft: ExternalOrderDraft | null,
  detail: ExternalOrderDetail,
  defaults: QuoteDefaultsResponse
) {
  const baseDraft = buildDraft(detail, defaults);
  if (!rawDraft) {
    return baseDraft;
  }

  return withComputedTotals({
    ...baseDraft,
    ...rawDraft,
    exchangeRate: Number(rawDraft.exchangeRate || baseDraft.exchangeRate),
    commissionPercentage: Number(
      rawDraft.commissionPercentage ||
        readStoredNumber(QUOTE_STORAGE_KEYS.commissionPercentage, baseDraft.commissionPercentage)
    ),
    returnRiskPercentage: Number(
      rawDraft.returnRiskPercentage ||
        readStoredNumber(QUOTE_STORAGE_KEYS.returnRiskPercentage, baseDraft.returnRiskPercentage)
    ),
    operationalCostPercentage: Number(
      rawDraft.operationalCostPercentage ||
        readStoredNumber(QUOTE_STORAGE_KEYS.operationalCostPercentage, baseDraft.operationalCostPercentage)
    ),
    urgentPercentage: 0,
    urgentAmount: 0,
    currency: rawDraft.currency || (typeof window !== "undefined" ? window.localStorage.getItem(QUOTE_STORAGE_KEYS.currency) : null) || baseDraft.currency,
  });
}

export function ExternalOrderQuoteView({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { profile } = useAdminAuth();
  const [detail, setDetail] = useState<ExternalOrderDetail | null>(null);
  const [history, setHistory] = useState<OrderHistoryEntry[]>([]);
  const [draft, setDraft] = useState<ExternalOrderDraft | null>(null);
  const [activeRate, setActiveRate] = useState<ExchangeRate | null>(null);
  const [activeRateError, setActiveRateError] = useState("");
  const [isRateLoading, setIsRateLoading] = useState(false);
  const [useManualExchangeRate, setUseManualExchangeRate] = useState(false);
  const [error, setError] = useState("");
  const [quoteSendOpen, setQuoteSendOpen] = useState(false);
  const [quoteSendOptions, setQuoteSendOptions] = useState<QuoteSendOptions>({
    sendWhatsapp: true,
    sendEmail: true,
    copyOnly: false,
    validHours: 24,
  });
  const [quoteSendResult, setQuoteSendResult] = useState<QuoteSendResponse | null>(null);
  const [quoteLinkCopied, setQuoteLinkCopied] = useState(false);
  const [refuseDialogOpen, setRefuseDialogOpen] = useState(false);
  const [isRefusing, setIsRefusing] = useState(false);
  const [clarificationOpen, setClarificationOpen] = useState(false);
  const [clarificationFields, setClarificationFields] = useState<ClarificationField[]>(["SIZE"]);
  const [clarificationMessage, setClarificationMessage] = useState(
    "Precisamos confirmar alguns detalhes antes de preparar a tua cotação."
  );
  const [clarificationValidationError, setClarificationValidationError] = useState("");
  const [clarificationToast, setClarificationToast] = useState("");
  const [isRequestingClarification, setIsRequestingClarification] = useState(false);
  const [isPending, startTransition] = useTransition();
  const canSubmitQuote = canManageOrders(profile);
  const canUseManualExchangeRate = canManageFinance(profile);

  async function refreshQuoteData() {
    const [detailPayload, historyPayload, defaultsPayload] = await Promise.all([
      adminApiFetch<ExternalOrderDetail>(`/api/admin/orders/${orderId}`),
      adminApiFetch<OrderHistoryEntry[]>(`/api/admin/orders/${orderId}/history`),
      adminApiFetch<QuoteDefaultsResponse>("/api/admin/orders/quote-defaults"),
    ]);

    setDetail(detailPayload);
    setHistory(historyPayload);
    setDraft((currentDraft) =>
      currentDraft
        ? withComputedTotals({
            ...normalizeDraft(detailPayload.quoteDraft, detailPayload, defaultsPayload),
            ...currentDraft,
          })
        : normalizeDraft(detailPayload.quoteDraft, detailPayload, defaultsPayload)
    );
    setError("");
  }

  useAdminLiveRefresh(refreshQuoteData, { intervalMs: 8_000 });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [detailPayload, historyPayload, defaultsPayload] = await Promise.all([
          adminApiFetch<ExternalOrderDetail>(`/api/admin/orders/${orderId}`),
          adminApiFetch<OrderHistoryEntry[]>(`/api/admin/orders/${orderId}/history`),
          adminApiFetch<QuoteDefaultsResponse>("/api/admin/orders/quote-defaults"),
        ]);

        if (!cancelled) {
          setDetail(detailPayload);
          setHistory(historyPayload);
          setDraft(normalizeDraft(detailPayload.quoteDraft, detailPayload, defaultsPayload));
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Nao foi possivel carregar este pedido."
          );
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  useEffect(() => {
    if (!draft?.currency || !isQuoteCurrency(draft.currency)) {
      setActiveRate(null);
      setActiveRateError("Moeda de cotacao invalida.");
      return;
    }

    let cancelled = false;
    const currency = draft.currency;

    async function loadActiveRate() {
      setIsRateLoading(true);
      setActiveRateError("");

      try {
        const rate = await adminApiFetch<ExchangeRate>(
          `/api/admin/exchange-rates/active?baseCurrency=${currency}&targetCurrency=MZN`
        );

        if (cancelled) return;
        setActiveRate(rate);
        setDraft((current) => {
          if (!current || useManualExchangeRate || current.currency !== currency) {
            return current;
          }
          return withComputedTotals({ ...current, exchangeRate: Number(rate.rate || 0) });
        });
      } catch (rateError) {
        if (cancelled) return;
        setActiveRate(null);
        setActiveRateError(getErrorStatus(rateError) === 403
          ? "Sem permissao para consultar taxa de cambio."
          : `Configure a taxa ${currency} → MZN em Finanças antes de enviar esta cotação.`);
        if (!useManualExchangeRate) {
          setDraft((current) =>
            current && current.currency === currency
              ? withComputedTotals({ ...current, exchangeRate: 0 })
              : current
          );
        }
      } finally {
        if (!cancelled) {
          setIsRateLoading(false);
        }
      }
    }

    void loadActiveRate();
    return () => {
      cancelled = true;
    };
  }, [draft?.currency, useManualExchangeRate]);

  useEffect(() => {
    if (canUseManualExchangeRate) return;
    setUseManualExchangeRate(false);
  }, [canUseManualExchangeRate]);

  useEffect(() => {
    if (!clarificationToast) return;

    const timer = window.setTimeout(() => setClarificationToast(""), 3500);
    return () => window.clearTimeout(timer);
  }, [clarificationToast]);

  function updateDraft(next: Partial<ExternalOrderDraft>) {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      return withComputedTotals({ ...current, ...next });
    });
  }

  const summary = useMemo(() => {
    if (!draft) {
      return buildSummary(
        withComputedTotals({
          exchangeRate: 0,
          baseAmount: 0,
          shippingFee: 0,
          currency: "ZAR",
          commissionPercentage: 0,
          returnRiskPercentage: 0,
          operationalCostPercentage: 0,
          urgentPercentage: 0,
          urgentAmount: 0,
          totalFinal: 0,
          notes: "",
          validityDate: "",
        })
      );
    }

    return buildSummary(draft);
  }, [draft]);

  async function saveDraft() {
    if (!draft) return;

    try {
      persistQuoteDefaults(draft);
      await adminApiFetch(`/api/admin/orders/${orderId}/quote/draft`, {
        method: "PUT",
        body: JSON.stringify(draft),
      });
      setError("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Nao foi possivel guardar o rascunho.");
    }
  }

  function toggleClarificationField(field: ClarificationField) {
    setClarificationValidationError("");
    setClarificationFields((current) =>
      current.includes(field)
        ? current.filter((item) => item !== field)
        : [...current, field]
    );
  }

  async function requestClarification() {
    if (!detail) return;

    if (clarificationFields.length === 0) {
      setClarificationValidationError("Seleciona pelo menos uma informação para pedir ao cliente.");
      return;
    }

    setIsRequestingClarification(true);
    try {
      await adminApiFetch(`/api/admin/orders/${orderId}/clarification-request`, {
        method: "POST",
        body: JSON.stringify({
          message: clarificationMessage,
          fields: clarificationFields,
        }),
      });
      await refreshQuoteData();
      setClarificationOpen(false);
      setClarificationValidationError("");
      setClarificationToast("Pedido de detalhes enviado ao cliente.");
      setError("");
    } catch (clarificationError) {
      setError(
        clarificationError instanceof Error
          ? clarificationError.message
          : "Nao foi possivel pedir detalhes ao cliente."
      );
    } finally {
      setIsRequestingClarification(false);
    }
  }

  async function sendQuote(options: QuoteSendOptions) {
    if (!detail || !draft) return;

    if (detail.needsClarification || detail.activeClarificationRequest?.status === "PENDING") {
      setError("Aguarde a resposta do cliente antes de enviar a cotacao.");
      return;
    }

    const isUpdate = Boolean(detail.latestQuoteSentAt);
    const currency = isQuoteCurrency(draft.currency) ? draft.currency : "ZAR";
    const exchangeRateToUse = useManualExchangeRate
      ? Number(draft.exchangeRate || 0)
      : Number(activeRate?.rate || 0);

    if (!useManualExchangeRate && !activeRate) {
      setError(`Configure a taxa ${currency} → MZN em Finanças antes de enviar esta cotação.`);
      return;
    }

    if (useManualExchangeRate && exchangeRateToUse <= 0) {
      setError("Informe um câmbio manual maior que zero antes de enviar a cotação.");
      return;
    }

    try {
      persistQuoteDefaults(draft);

      const payload: QuoteSubmissionPayload = {
        baseAmount: Number(draft.baseAmount || 0),
        shippingFee: Number(draft.shippingFee || 0),
        currency,
        commissionPercentage: Number(draft.commissionPercentage || 0),
        returnRiskPercentage: Number(draft.returnRiskPercentage || 0),
        operationalCostPercentage: Number(draft.operationalCostPercentage || 0),
        urgentPercentage: 0,
        urgentAmount: 0,
        notes: draft.notes,
        validityDate: buildAutomaticValidityDate(),
      };

      if (useManualExchangeRate) {
        payload.exchangeRate = exchangeRateToUse;
      }

      await adminApiFetch(`/api/admin/orders/${orderId}/quote`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const result = await adminApiFetch<QuoteSendResponse>(`/api/admin/orders/${orderId}/quote/send`, {
        method: "POST",
        body: JSON.stringify(options),
      });

      setQuoteSendResult(result);
      setQuoteSendOpen(true);
      setQuoteLinkCopied(false);
      await refreshQuoteData();

      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          "admin_quotes_notice",
          isUpdate
            ? "Cotacao actualizada com sucesso."
            : "Cotacao enviada ao cliente com sucesso."
        );
        if (options.sendWhatsapp && result.whatsappUrl) {
          window.open(result.whatsappUrl, "_blank", "noopener,noreferrer");
        }
      }

      router.refresh();
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : isUpdate
            ? "Nao foi possivel actualizar a cotacao."
            : "Nao foi possivel enviar a cotacao."
      );
    }
  }

  async function refuseOrder() {
    setIsRefusing(true);
    try {
      await adminApiFetch(`/api/admin/orders/${orderId}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      setError("");
      setRefuseDialogOpen(false);
      router.push("/admin/external-quotes");
      router.refresh();
    } catch (refuseError) {
      setError(
        refuseError instanceof Error ? refuseError.message : "Nao foi possivel recusar este pedido."
      );
    } finally {
      setIsRefusing(false);
    }
  }

  if (!detail || !draft) {
    return (
      <AdminSectionSkeleton
        title={error ? "Nao foi possivel abrir este pedido externo" : "A carregar pedido externo"}
        message={error || "Estamos a preparar os dados do cliente, o rascunho da cotacao e o historico desta analise."}
        rows={3}
      />
    );
  }

  const selectedCurrency = isQuoteCurrency(draft.currency) ? draft.currency : "ZAR";
  const activeRateValue = Number(activeRate?.rate || 0);
  const manualRateValue = Number(draft.exchangeRate || 0);
  const screenshotUrls = detail.requestScreenshotUrls.length
    ? detail.requestScreenshotUrls
    : detail.requestScreenshotUrl
      ? [detail.requestScreenshotUrl]
      : [];
  const pendingClarification =
    Boolean(detail.needsClarification) || detail.activeClarificationRequest?.status === "PENDING";
  const answeredClarification =
    detail.latestClarificationRequest?.status === "ANSWERED" ? detail.latestClarificationRequest : null;
  const canSendQuote =
    !isPending &&
    !isRateLoading &&
    !pendingClarification &&
    (useManualExchangeRate ? manualRateValue > 0 : activeRateValue > 0);
  const orderWhatsAppMessage = buildOrderWhatsAppMessage(detail.number);
  const quotePreviewMessage = buildQuoteSharePreview(detail.number, summary.totalFinal, quoteSendResult?.quoteUrl);
  const displayedQuoteSentAt = quoteSendResult?.quoteSentAt || detail.quoteSentAt || detail.latestQuoteSentAt || null;
  const displayedQuoteExpiresAt = quoteSendResult?.quoteTokenExpiresAt || detail.quoteTokenExpiresAt || null;

  async function copyQuoteLink() {
    if (!quoteSendResult?.quoteUrl || typeof navigator === "undefined") return;
    await navigator.clipboard.writeText(quoteSendResult.quoteUrl);
    setQuoteLinkCopied(true);
  }

  return (
    <div className="space-y-6">
      {clarificationToast ? (
        <div
          className="fixed bottom-6 right-6 z-[60] rounded-2xl px-5 py-3 text-sm font-semibold shadow-xl"
          style={{ background: "#D1FAE5", color: "#065F46" }}
          role="status"
          aria-live="polite"
        >
          {clarificationToast}
        </div>
      ) : null}

      <section className="sticky top-[88px] z-10 rounded-[28px] border border-[var(--color-border)] bg-[color:var(--color-surface-overlay)]/95 px-6 py-5 backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
              <Link href="/admin/external-quotes" className="text-[var(--color-danger)]">
                &larr; Cotações externas
              </Link>
              <span>/</span>
              <span>Analisar pedido externo</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="font-[family-name:var(--font-sora)] text-3xl font-semibold">
                Analise e cotacao de pedido externo
              </h1>
              <span className="font-[family-name:var(--font-sora)] text-xl font-semibold text-[var(--color-danger)]">
                {detail.number}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {detail.customerId ? (
              <Link href={`/admin/customers/${detail.customerId}`} className="admin-button-muted">
                Ver cliente
              </Link>
            ) : (
              <button type="button" disabled className="admin-button-muted opacity-60">
                Ver cliente
              </button>
            )}
            {canSubmitQuote ? (
              <button
                type="button"
                onClick={() => setClarificationOpen(true)}
                className="admin-button-muted"
              >
                Pedir detalhes ao cliente
              </button>
            ) : null}
            {canSubmitQuote ? (
              <button
                type="button"
                onClick={() => setRefuseDialogOpen(true)}
                className="rounded-full px-4 py-3 text-sm font-semibold text-[var(--color-danger)]"
              >
                Recusar pedido
              </button>
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
                    .map((item) => item[0]?.toUpperCase())
                    .join("")}
                </div>
                <div>
                  <h2 className="font-[family-name:var(--font-sora)] text-2xl font-semibold">
                    {detail.customerName}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                    <span>{detail.customerEmail}</span>
                    <span aria-hidden="true">·</span>
                    <WhatsAppPhone phone={detail.customerPhone} message={orderWhatsAppMessage} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusTheme(detail.type)}`}
                    >
                      EXTERNO
                    </span>
                    <span className="inline-flex rounded-full bg-[#fef3c7] px-2.5 py-1 text-xs font-semibold text-[#92400e]">
                      {detail.customerVerified ? "Contacto verificado" : "Verificacao pendente"}
                    </span>
                    {pendingClarification ? (
                      <span className="inline-flex rounded-full bg-[#FFE4E6] px-2.5 py-1 text-xs font-semibold text-[#9F1239]">
                        Aguardando resposta do cliente
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-[24px] border border-[var(--color-border)] bg-[var(--color-background-tertiary)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">
                Pedido enviado pelo cliente
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
                <div className="rounded-2xl bg-[var(--color-background-secondary)] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">Detalhes</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--color-text-primary)]">
                    {detail.cleanDescription || detail.productDetails || "Sem detalhes escritos; valida pelo link ou screenshot."}
                  </p>
                </div>
                <div className="rounded-2xl bg-[var(--color-background-secondary)] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">Quantidade</p>
                  <p className="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">{detail.requestedQuantity || 1}</p>
                </div>
              </div>
              {screenshotUrls.length ? (
                <div className="mt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
                    Fotos do pedido
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {screenshotUrls.map((url, index) => (
                      <a
                        key={`${url}-${index}`}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="block overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)]"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`Foto ${index + 1} enviada pelo cliente`}
                          className="h-52 w-full object-contain"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <code className="block truncate rounded-2xl bg-[var(--color-background-secondary)] px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                  {detail.externalCartUrl || "Sem link disponivel"}
                </code>
                <a
                  href={detail.externalCartUrl || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className={`admin-button-muted whitespace-nowrap ${detail.externalCartUrl ? "" : "pointer-events-none opacity-50"}`}
                >
                  Abrir link
                </a>
              </div>
              {detail.detectedLinks?.length ? (
                <div className="mt-3 rounded-2xl bg-[var(--color-background-secondary)] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
                    Links detectados
                  </p>
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
              <div className="mt-4 rounded-2xl bg-[#EAF4FF] px-4 py-3 text-sm text-[#113A64]">
                Usa o link, os detalhes e o screenshot como a mesma fonte do pedido antes de fechar a cotacao.
              </div>
            </div>
          </section>

          {pendingClarification ? (
            <section className="admin-card border-[#FBCFE8] bg-[#FFF1F2] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9F1239]">
                Aguardando cliente
              </p>
              <h2 className="mt-2 font-[family-name:var(--font-sora)] text-xl font-semibold text-[#881337]">
                A cotacao esta bloqueada ate o cliente responder
              </h2>
              <p className="mt-2 text-sm text-[#9F1239]">
                {detail.activeClarificationRequest?.message ||
                  "Foi enviado um pedido de detalhes ao cliente."}
              </p>
              {detail.activeClarificationRequest?.requestedFields?.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {detail.activeClarificationRequest.requestedFields.map((field) => (
                    <span
                      key={field}
                      className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#9F1239]"
                    >
                      {CLARIFICATION_LABELS[field] || field}
                    </span>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {answeredClarification ? (
            <section className="admin-card p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">
                Respostas do cliente
              </p>
              <h2 className="mt-2 font-[family-name:var(--font-sora)] text-xl font-semibold">
                Detalhes enviados para cotacao
              </h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {answeredClarification.requestedFields
                  .filter((field) => field !== "PHOTO")
                  .map((field) => (
                    <div
                      key={field}
                      className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-tertiary)] px-4 py-3"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
                        {CLARIFICATION_LABELS[field] || field}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm font-semibold text-[var(--color-text-primary)]">
                        {answeredClarification.answers?.[field] || "Sem resposta"}
                      </p>
                    </div>
                  ))}
              </div>
              {answeredClarification.photoUrls?.length ? (
                <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-tertiary)] px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                  Fotos adicionadas: {answeredClarification.photoUrls.length}
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="admin-card p-6">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">
                Custos e comissao
              </p>
              <h2 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold">
                Modelo de cotacao
              </h2>
              <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                Os valores usam a taxa activa da area Financeira, percentagens
                e preview automatico em MZN.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">
                  Moeda base
                </span>
                <select
                  value={draft.currency}
                  onChange={(event) =>
                    updateDraft({
                      currency: event.target.value,
                      exchangeRate: useManualExchangeRate ? draft.exchangeRate : 0,
                    })
                  }
                  className="admin-input"
                >
                  <option value="ZAR">ZAR — Rand sul-africano</option>
                  <option value="USD">USD — Dólar americano</option>
                </select>
              </label>

              <div className="rounded-[22px] border border-[var(--color-border)] bg-[var(--color-background-tertiary)] px-4 py-4">
                <p className="text-sm font-medium text-[var(--color-text-secondary)]">
                  Taxa de cambio
                </p>
                {isRateLoading ? (
                  <p className="mt-2 text-sm font-semibold text-[var(--color-text-primary)]">
                    A carregar taxa ativa das Finanças...
                  </p>
                ) : activeRate ? (
                  <>
                    <p className="mt-2 font-[family-name:var(--font-sora)] text-lg font-semibold text-[var(--color-text-primary)]">
                      Taxa ativa das Finanças: {formatRate(activeRateValue)} MZN por 1 {selectedCurrency}
                    </p>
                    <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                      Esta taxa vem da área Financeira e fica guardada como snapshot nesta cotação.
                    </p>
                  </>
                ) : (
                  <div className="mt-2 rounded-2xl border border-[#F1D7A8] bg-[#FFF5D8] px-4 py-3 text-sm text-[#7A5712]">
                    <p className="font-semibold">
                      {activeRateError || `Configure a taxa ${selectedCurrency} → MZN em Finanças antes de enviar esta cotação.`}
                    </p>
                    {canUseManualExchangeRate ? <Link href="/admin/finance" className="mt-3 inline-flex rounded-full bg-white px-3 py-2 text-xs font-semibold text-[#7A5712]">
                      Ir para Finanças
                    </Link> : null}
                  </div>
                )}

                {canUseManualExchangeRate ? (
                  <div className="mt-4 space-y-3 border-t border-[var(--color-border)] pt-4">
                    <label className="flex items-center gap-3 text-sm font-semibold text-[var(--color-text-primary)]">
                      <input
                        type="checkbox"
                        checked={useManualExchangeRate}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setUseManualExchangeRate(checked);
                          if (!checked) {
                            updateDraft({ exchangeRate: activeRateValue });
                          }
                        }}
                      />
                      Usar câmbio manual
                    </label>
                    {useManualExchangeRate ? (
                      <input
                        type="number"
                        min="0.01"
                        step="0.0001"
                        value={formatInputNumber(draft.exchangeRate)}
                        onChange={(event) =>
                          updateDraft({ exchangeRate: Number(event.target.value || 0) })
                        }
                        placeholder="Ex.: 4.50"
                        className={compactNumberInputClass}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">
                  Valor do produto na moeda de origem
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formatInputNumber(draft.baseAmount)}
                  onChange={(event) =>
                    updateDraft({ baseAmount: Number(event.target.value || 0) })
                  }
                  className={compactNumberInputClass}
                />
                <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                  Equivale a {formatMoney(summary.productValue)} com a taxa ativa.
                </p>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">
                  Taxa de envio África do Sul → Maputo (na moeda de origem)
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formatInputNumber(draft.shippingFee)}
                  onChange={(event) =>
                    updateDraft({ shippingFee: Number(event.target.value || 0) })
                  }
                  className={compactNumberInputClass}
                />
                <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                  Equivale a {formatMoney(summary.shippingValue)} com a taxa ativa.
                </p>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">
                  Reserva de risco (%)
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formatInputNumber(draft.returnRiskPercentage)}
                  onChange={(event) =>
                    updateDraft({
                      returnRiskPercentage: Number(event.target.value || 0),
                    })
                  }
                  className={compactNumberInputClass}
                />
                <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                  Calculada apenas sobre o valor do produto.
                </p>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">
                  Taxa das alfândegas sul-africana (%)
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formatInputNumber(draft.operationalCostPercentage)}
                  onChange={(event) =>
                    updateDraft({
                      operationalCostPercentage: Number(event.target.value || 0),
                    })
                  }
                  className={compactNumberInputClass}
                />
                <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                  Se ficar vazio, o sistema assume 0%.
                </p>
              </label>

              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">
                  Percentagem do site (%)
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formatInputNumber(draft.commissionPercentage)}
                  onChange={(event) =>
                    updateDraft({
                      commissionPercentage: Number(event.target.value || 0),
                    })
                  }
                  className={compactNumberInputClass}
                />
                <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                  Cobrada sobre o valor do produto ajustado, sem incluir transporte.
                </p>
              </label>
            </div>

            <section className="mt-5 rounded-[24px] border border-[var(--color-border)] bg-[var(--color-background-tertiary)] p-5">
              <div className="flex items-center justify-between gap-3">
                <strong className="font-[family-name:var(--font-sora)] text-lg">
                  Resumo da cotacao
                </strong>
                <span className="inline-flex rounded-full bg-[rgba(232,67,26,0.1)] px-3 py-1 text-xs font-semibold text-[var(--color-danger)]">
                  Cliente ve em MZN
                </span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--color-background-secondary)] px-4 py-3 text-sm">
                  <span>Produto</span>
                  <strong>{formatMoney(summary.productValue)}</strong>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--color-background-secondary)] px-4 py-3 text-sm">
                  <span>Envio África do Sul → Maputo</span>
                  <strong>{formatMoney(summary.shippingValue)}</strong>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--color-background-secondary)] px-4 py-3 text-sm">
                  <span>Subtotal convertido</span>
                  <strong>{formatMoney(summary.subtotalConverted)}</strong>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--color-background-secondary)] px-4 py-3 text-sm">
                  <span>Reserva de risco</span>
                  <strong>{formatMoney(summary.returnRiskValue)}</strong>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--color-background-secondary)] px-4 py-3 text-sm">
                  <span>Taxa das alfândegas sul-africana</span>
                  <strong>{formatMoney(summary.operationalCostValue)}</strong>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--color-background-secondary)] px-4 py-3 text-sm">
                  <span>Taxa do site</span>
                  <strong>{formatMoney(summary.siteFeeValue)}</strong>
                </div>
              </div>
            </section>

            <label className="mt-5 block">
              <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">
                Notas para o cliente
              </span>
              <textarea
                value={draft.notes}
                onChange={(event) => updateDraft({ notes: event.target.value })}
                rows={4}
                className="admin-input min-h-[120px] resize-y"
              />
            </label>
          </section>

          <section className="admin-card p-6">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">
                Historico
              </p>
              <h2 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold">
                Linha do tempo do pedido
              </h2>
            </div>

            <div className="space-y-4">
              {history.map((event, index) => (
                <div key={event.id} className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] ${
                        event.state === "done"
                          ? "border-[var(--color-danger)] bg-[var(--color-danger)] text-white"
                          : event.state === "current"
                            ? "border-[var(--color-danger)] text-[var(--color-danger)]"
                            : "border-dashed border-[var(--color-border-strong)] text-transparent opacity-50"
                      }`}
                    >
                      {event.state === "done" ? "✓" : event.state === "current" ? "➜" : "•"}
                    </span>
                    {index < history.length - 1 ? (
                      <span
                        className={`mt-1 h-8 w-px ${
                          event.state === "future"
                            ? "bg-[var(--color-border)] opacity-40"
                            : "bg-[var(--color-danger)]"
                        }`}
                      />
                    ) : null}
                  </div>
                  <div className={event.state === "future" ? "opacity-55" : ""}>
                    <p
                      className={`font-medium ${
                        event.state === "current"
                          ? "text-[var(--color-danger)]"
                          : "text-[var(--color-text-primary)]"
                      }`}
                    >
                      {event.label}
                    </p>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      {event.date ? formatDate(event.date) : "Aguardando"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="sticky top-[132px] self-start">
          <div className="admin-card p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">
              Resumo da cotacao
            </p>
            <h2 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold">
              Valores finais
            </h2>

            <div className="mt-5 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--color-text-secondary)]">Produto convertido</span>
                <strong>{formatMoney(summary.productValue)}</strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--color-text-secondary)]">Envio África do Sul → Maputo</span>
                <strong>{formatMoney(summary.shippingValue)}</strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--color-text-secondary)]">Subtotal convertido</span>
                <strong>{formatMoney(summary.subtotalConverted)}</strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--color-text-secondary)]">Reserva de risco</span>
                <strong>{formatMoney(summary.returnRiskValue)}</strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--color-text-secondary)]">Taxa das alfândegas sul-africana</span>
                <strong>{formatMoney(summary.operationalCostValue)}</strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--color-text-secondary)]">Taxa do site</span>
                <strong>{formatMoney(summary.siteFeeValue)}</strong>
              </div>
            </div>

            <div className="my-5 h-px bg-[var(--color-border)]" />

            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-[var(--color-text-secondary)]">Total final</span>
              <strong className="font-[family-name:var(--font-sora)] text-3xl text-[var(--color-danger)]">
                {formatMoney(summary.totalFinal)}
              </strong>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-sm text-[var(--color-text-secondary)]">Margem estimada</span>
              <strong className="text-lg font-semibold text-[#15803D]">
                {summary.margin.toFixed(2)}%
              </strong>
            </div>

            {summary.lowMargin ? (
              <div className="mt-4 rounded-2xl border border-[#F1D7A8] bg-[#FFF5D8] px-4 py-3 text-sm text-[#7A5712]">
                A margem caiu abaixo de 5%. Revê a taxa do site, o cambio ou os
                custos antes de enviar.
              </div>
            ) : null}

            <p className="mt-5 text-sm text-[var(--color-text-secondary)]">
              A validade da cotacao sera gerada automaticamente ao enviar.
            </p>

            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                disabled={!canSubmitQuote || !canSendQuote}
                onClick={() => {
                  setQuoteSendResult(null);
                  setQuoteLinkCopied(false);
                  setQuoteSendOpen(true);
                }}
                className="admin-button-danger justify-center"
              >
                {isPending
                  ? "A enviar..."
                  : pendingClarification
                    ? "Aguardando resposta"
                  : detail.latestQuoteSentAt
                    ? "Actualizar cotacao"
                    : "Enviar cotacao ao cliente"}
              </button>
              <button
                type="button"
                disabled={!canSubmitQuote}
                onClick={() =>
                  startTransition(async () => {
                    await saveDraft();
                  })
                }
                className="admin-button-muted justify-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                Guardar rascunho
              </button>
              {canSubmitQuote ? (
                <button
                  type="button"
                  onClick={() => setRefuseDialogOpen(true)}
                  className="text-sm font-semibold text-[var(--color-danger)]"
                >
                  Recusar pedido
                </button>
              ) : null}
              {!canSubmitQuote ? <p className="text-xs text-[var(--color-text-secondary)]">Sem permissao para enviar ou alterar cotacoes.</p> : null}
              {pendingClarification ? (
                <p className="text-xs font-semibold text-[#9F1239]">
                  O cliente precisa responder aos detalhes pedidos antes do envio da cotacao.
                </p>
              ) : null}
            </div>

            {(detail.quoteSentAt || quoteSendResult) ? (
              <div className="mt-6 rounded-2xl border border-[#BFE8C8] bg-[#F0FFF4] px-4 py-4 text-sm text-[#14532D]">
                <p className="font-semibold">Cotacao enviada</p>
                <p className="mt-1">
                  {displayedQuoteSentAt ? formatDate(displayedQuoteSentAt) : "Data indisponivel"}
                  {displayedQuoteExpiresAt
                    ? ` · Valida ate ${formatDate(displayedQuoteExpiresAt)}`
                    : ""}
                </p>
                {quoteSendResult?.channels?.length ? (
                  <p className="mt-1">Canais: {quoteSendResult.channels.join(", ")}</p>
                ) : null}
                {quoteSendResult?.quoteUrl ? (
                  <div className="mt-3 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => void copyQuoteLink()}
                      className="admin-button-muted justify-center"
                    >
                      {quoteLinkCopied ? "Link copiado" : "Copiar link da cotacao"}
                    </button>
                    {quoteSendResult.whatsappUrl ? (
                      <a
                        href={quoteSendResult.whatsappUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="admin-button-danger justify-center"
                      >
                        Abrir WhatsApp
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-8 border-t border-[var(--color-border)] pt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">
                Ultimos pedidos do cliente
              </p>
              <div className="mt-4 space-y-3">
                {detail.recentCustomerOrders.length ? (
                  detail.recentCustomerOrders.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl bg-[var(--color-background-tertiary)] px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <strong className="font-[family-name:var(--font-sora)]">
                          {item.number}
                        </strong>
                        <span className="text-xs text-[var(--color-text-secondary)]">
                          {formatDate(item.createdAt)}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                        <span className="text-[var(--color-text-secondary)]">
                          {humanizeOrderStatus(item.status)}
                        </span>
                        <strong>{formatMoney(item.totalAmount)}</strong>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    Sem outros pedidos recentes para este cliente.
                  </p>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>
      {clarificationOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-6 py-5">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">
                  PEDIR DETALHES AO CLIENTE
                </p>
                <h2 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold text-[var(--color-text-primary)]">
                  Que informações faltam?
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
                  Seleciona os detalhes que o cliente precisa confirmar antes de preparares a cotação.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isRequestingClarification) setClarificationOpen(false);
                }}
                className="admin-button-muted shrink-0 px-4 py-2 text-sm"
              >
                Fechar
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {CLARIFICATION_FIELDS.map((field) => (
                  <label
                    key={field.value}
                    className="flex cursor-pointer items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-tertiary)] px-4 py-3 text-sm font-semibold text-[var(--color-text-primary)]"
                  >
                    <input
                      type="checkbox"
                      checked={clarificationFields.includes(field.value)}
                      onChange={() => toggleClarificationField(field.value)}
                      className="h-4 w-4 shrink-0 accent-[var(--color-danger)]"
                    />
                    <span>{field.label}</span>
                  </label>
                ))}
              </div>

              {clarificationValidationError ? (
                <p className="mt-3 text-sm font-semibold text-[var(--color-danger)]" role="alert">
                  {clarificationValidationError}
                </p>
              ) : null}

              <label className="mt-5 block">
                <span className="mb-2 block text-sm font-semibold text-[var(--color-text-primary)]">
                  Mensagem para o cliente
                </span>
                <textarea
                  value={clarificationMessage}
                  onChange={(event) => setClarificationMessage(event.target.value)}
                  rows={4}
                  className="admin-input min-h-[104px] resize-y"
                  placeholder="Ex.: Precisamos confirmar o tamanho e a cor antes de preparar a cotação."
                />
              </label>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-[var(--color-border)] px-6 py-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={isRequestingClarification}
                onClick={() => setClarificationOpen(false)}
                className="admin-button-muted justify-center disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isRequestingClarification}
                onClick={() => void requestClarification()}
                className="admin-button-danger justify-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isRequestingClarification ? "A enviar..." : "Enviar pedido de detalhes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <AdminConfirmDialog
        open={refuseDialogOpen}
        title="Recusar pedido?"
        message={`O pedido ${detail.number} sera marcado como recusado. Esta acao fica registada no historico do cliente.`}
        confirmLabel="Recusar pedido"
        cancelLabel="Manter pedido"
        danger
        pending={isRefusing}
        onCancel={() => {
          if (!isRefusing) {
            setRefuseDialogOpen(false);
          }
        }}
        onConfirm={() => void refuseOrder()}
      />
      {quoteSendOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="w-full max-w-2xl rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">
                  Enviar cotacao
                </p>
                <h2 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold">
                  Escolher canais do cliente
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isPending) setQuoteSendOpen(false);
                }}
                className="rounded-full px-3 py-2 text-sm font-semibold text-[var(--color-text-secondary)]"
              >
                Fechar
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                ["sendWhatsapp", "WhatsApp"],
                ["sendEmail", "Email"],
                ["copyOnly", "Copiar link apenas"],
              ].map(([key, label]) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-tertiary)] px-4 py-3 text-sm font-semibold"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(quoteSendOptions[key as keyof QuoteSendOptions])}
                    onChange={(event) =>
                      setQuoteSendOptions((current) => ({
                        ...current,
                        [key]: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 accent-[var(--color-danger)]"
                  />
                  {label}
                </label>
              ))}
            </div>

            <label className="mt-5 block max-w-[220px]">
              <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">
                Validade em horas
              </span>
              <input
                type="number"
                min={1}
                max={168}
                value={quoteSendOptions.validHours}
                onChange={(event) =>
                  setQuoteSendOptions((current) => ({
                    ...current,
                    validHours: Math.max(1, Math.min(168, Number(event.target.value || 24))),
                  }))
                }
                className="admin-input h-11 rounded-2xl px-3 py-2 text-sm"
              />
            </label>

            <div className="mt-5 rounded-2xl bg-[var(--color-background-tertiary)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-danger)]">
                Preview WhatsApp
              </p>
              <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--color-text-primary)]">
                {quotePreviewMessage}
              </pre>
            </div>

            {quoteSendResult ? (
              <div className="mt-5 rounded-2xl border border-[#BFE8C8] bg-[#F0FFF4] px-4 py-3 text-sm text-[#14532D]">
                <p className="font-semibold">Cotacao enviada.</p>
                <p className="mt-1">Email: {quoteSendResult.emailSent ? "enviado" : "nao enviado ou sem email"}</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <button type="button" onClick={() => void copyQuoteLink()} className="admin-button-muted justify-center">
                    {quoteLinkCopied ? "Link copiado" : "Copiar link da cotacao"}
                  </button>
                  {quoteSendResult.whatsappUrl ? (
                    <a href={quoteSendResult.whatsappUrl} target="_blank" rel="noreferrer" className="admin-button-danger justify-center">
                      Abrir WhatsApp
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setQuoteSendOpen(false)}
                className="admin-button-muted justify-center disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isPending || (!quoteSendOptions.sendWhatsapp && !quoteSendOptions.sendEmail && !quoteSendOptions.copyOnly)}
                onClick={() =>
                  startTransition(async () => {
                    await sendQuote(quoteSendOptions);
                  })
                }
                className="admin-button-danger justify-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? "A enviar..." : "Enviar cotacao ao cliente"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
