"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { adminApiFetch } from "@/lib/admin/api-client";
import type { CurrencyCode, ExchangeRate, ExchangeRateRequest } from "@/lib/admin/types";

type BaseCurrency = Exclude<CurrencyCode, "MZN">;

const BASE_CURRENCIES: BaseCurrency[] = ["USD", "ZAR"];
const HISTORY_PAGE_SIZE = 5;

const SOURCE_LABEL: Record<string, string> = {
  MANUAL: "Manual",
  API: "Sistema",
  ADMIN_OVERRIDE: "Admin",
};

function isTestActor(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return Boolean(normalized?.endsWith(".test") || normalized?.endsWith("@example.com"));
}

function sourceLabel(rate: ExchangeRate | null | undefined) {
  if (!rate) return "Sem taxa";
  if (isTestActor(rate.createdBy)) return "Seed local";
  return SOURCE_LABEL[rate.source] ?? rate.source;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatRate(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "Sem taxa";
  return new Intl.NumberFormat("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);
}

function sourceClassName(source: string | null | undefined) {
  if (source === "SEED_LOCAL") return "bg-[rgba(245,158,11,0.14)] text-[#b45309]";
  if (source === "API") return "bg-[rgba(37,99,235,0.12)] text-[#1d4ed8]";
  if (source === "ADMIN_OVERRIDE") return "bg-[rgba(232,67,26,0.12)] text-[var(--color-danger)]";
  return "bg-[rgba(22,163,74,0.12)] text-[#15803d]";
}

function StatusChip({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${
        active
          ? "bg-[rgba(22,163,74,0.12)] text-[#15803d]"
          : "bg-[var(--color-background-tertiary)] text-[var(--color-text-secondary)]"
      }`}
    >
      {active ? "Activo" : "Histórico"}
    </span>
  );
}

function RateCard({
  currency,
  rate,
  isLoading,
  error,
}: {
  currency: BaseCurrency;
  rate: ExchangeRate | null;
  isLoading: boolean;
  error: string | null;
}) {
  return (
    <article className="rounded-[22px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--color-danger)]">
            {currency} para MZN
          </p>
          <p className="mt-3 font-[family-name:var(--font-sora)] text-3xl font-semibold text-[var(--color-text-primary)]">
            {isLoading ? "..." : formatRate(rate?.rate)}
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Meticais por 1 {currency}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${sourceClassName(isTestActor(rate?.createdBy) ? "SEED_LOCAL" : rate?.source)}`}>
          {sourceLabel(rate)}
        </span>
      </div>

      {isTestActor(rate?.createdBy) ? (
        <div className="mt-4 rounded-2xl border border-[#FCD34D] bg-[#FFFBEB] px-4 py-3 text-sm font-semibold text-[#92400E]">
          Atenção: esta taxa foi criada por utilizador de teste e não deve ser usada em produção.
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-2xl border border-[rgba(232,67,26,0.2)] bg-[rgba(232,67,26,0.08)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      ) : (
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">Actualizado</dt>
            <dd className="mt-1 font-semibold text-[var(--color-text-primary)]">{formatDate(rate?.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">Criado por</dt>
            <dd className="mt-1 font-semibold text-[var(--color-text-primary)]">
              {isTestActor(rate?.createdBy) ? "Seed local" : rate?.createdBy || "Sistema"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">Notas</dt>
            <dd className="mt-1 text-[var(--color-text-secondary)]">{rate?.notes || "Sem notas registadas."}</dd>
          </div>
        </dl>
      )}
    </article>
  );
}

export function ExchangeRatesPanel() {
  const [activeRates, setActiveRates] = useState<Record<BaseCurrency, ExchangeRate | null>>({
    USD: null,
    ZAR: null,
  });
  const [activeErrors, setActiveErrors] = useState<Record<BaseCurrency, string | null>>({
    USD: null,
    ZAR: null,
  });
  const [history, setHistory] = useState<ExchangeRate[]>([]);
  const [selectedCurrency, setSelectedCurrency] = useState<BaseCurrency>("ZAR");
  const [rate, setRate] = useState("");
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [historyPage, setHistoryPage] = useState(1);

  const sortedHistory = useMemo(
    () =>
      [...history].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [history],
  );
  const historyPageCount = Math.max(1, Math.ceil(sortedHistory.length / HISTORY_PAGE_SIZE));
  const paginatedHistory = useMemo(
    () => sortedHistory.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE),
    [historyPage, sortedHistory],
  );

  useEffect(() => {
    setHistoryPage((current) => Math.min(current, historyPageCount));
  }, [historyPageCount]);

  const loadRates = useCallback(async () => {
    setIsLoading(true);
    setFeedback(null);

    const nextRates: Record<BaseCurrency, ExchangeRate | null> = { USD: null, ZAR: null };
    const nextErrors: Record<BaseCurrency, string | null> = { USD: null, ZAR: null };
    const historyRows: ExchangeRate[] = [];

    await Promise.all(
      BASE_CURRENCIES.map(async (currency) => {
        try {
          nextRates[currency] = await adminApiFetch<ExchangeRate>(
            `/api/admin/exchange-rates/active?baseCurrency=${currency}&targetCurrency=MZN`,
          );
        } catch (error) {
          nextErrors[currency] =
            error instanceof Error ? error.message : `Sem taxa activa para ${currency}/MZN.`;
        }

        try {
          const rows = await adminApiFetch<ExchangeRate[]>(
            `/api/admin/exchange-rates/history?baseCurrency=${currency}&targetCurrency=MZN`,
          );
          historyRows.push(...rows);
        } catch {
          // The active-card error already gives the finance team the actionable state.
        }
      }),
    );

    setActiveRates(nextRates);
    setActiveErrors(nextErrors);
    setHistory(historyRows);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadRates();
  }, [loadRates]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    const numericRate = Number(rate);
    if (!numericRate || numericRate <= 0) {
      setFeedback({ tone: "error", message: "A taxa deve ser maior que zero." });
      return;
    }

    const confirmed = window.confirm(
      `Actualizar o câmbio ${selectedCurrency}/MZN para ${formatRate(numericRate)}? A taxa anterior fica no histórico.`,
    );

    if (!confirmed) return;

    const payload: ExchangeRateRequest = {
      baseCurrency: selectedCurrency,
      targetCurrency: "MZN",
      rate: numericRate,
      source: "MANUAL",
      notes: notes.trim() || undefined,
    };

    const endpoint = activeRates[selectedCurrency]
      ? "/api/admin/exchange-rates/activate"
      : "/api/admin/exchange-rates/create";

    setIsSaving(true);
    try {
      await adminApiFetch<ExchangeRate>(endpoint, {
        method: activeRates[selectedCurrency] ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setRate("");
      setNotes("");
      setFeedback({ tone: "success", message: "Câmbio actualizado com sucesso." });
      await loadRates();
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Não foi possível actualizar o câmbio.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--color-danger)]">
            Câmbio
          </p>
          <h2 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold text-[var(--color-text-primary)]">
            Taxas activas para cotações
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">
            Controla USD e ZAR para MZN com histórico preservado. Cotações antigas mantêm o snapshot da taxa usada.
          </p>
        </div>
        <button type="button" onClick={() => void loadRates()} className="admin-button-muted" disabled={isLoading}>
          {isLoading ? "A carregar" : "Actualizar"}
        </button>
      </div>

      {feedback ? (
        <div
          className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
            feedback.tone === "success"
              ? "border-[#BBF7D0] bg-[#F0FFF4] text-[#166534]"
              : "border-[rgba(232,67,26,0.22)] bg-[rgba(232,67,26,0.08)] text-[var(--color-danger)]"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        {BASE_CURRENCIES.map((currency) => (
          <RateCard
            key={currency}
            currency={currency}
            rate={activeRates[currency]}
            isLoading={isLoading}
            error={activeErrors[currency]}
          />
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
        <form onSubmit={handleSubmit} className="rounded-[22px] border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
            Actualizar taxa
          </p>

          <div className="mt-4 grid gap-4">
            <label className="grid gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
              Moeda base
              <select
                value={selectedCurrency}
                onChange={(event) => setSelectedCurrency(event.target.value as BaseCurrency)}
                className="admin-input"
              >
                <option value="ZAR">ZAR</option>
                <option value="USD">USD</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
              Taxa para MZN
              <input
                type="number"
                min="0"
                step="0.000001"
                inputMode="decimal"
                value={rate}
                onChange={(event) => setRate(event.target.value)}
                className="admin-input"
                placeholder="Ex: 3.650000"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
              Notas
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="admin-input min-h-28 resize-none"
                placeholder="Origem da taxa, referência interna ou observação financeira."
              />
            </label>
          </div>

          <button type="submit" className="admin-button-danger mt-5 w-full justify-center" disabled={isSaving}>
            {isSaving ? "A guardar..." : "Actualizar câmbio"}
          </button>
        </form>

        <div className="overflow-hidden rounded-[22px] border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
                Histórico
              </p>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                Todas as taxas ficam preservadas para auditoria.
              </p>
            </div>
            <span className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-bold text-[var(--color-text-primary)]">
              {sortedHistory.length} registos
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-left text-sm">
              <thead className="bg-[var(--color-background-tertiary)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
                <tr>
                  <th className="px-4 py-3 font-bold">Moeda</th>
                  <th className="px-4 py-3 font-bold">Taxa</th>
                  <th className="px-4 py-3 font-bold">Source</th>
                  <th className="px-4 py-3 font-bold">Estado</th>
                  <th className="px-4 py-3 font-bold">Criado em</th>
                  <th className="px-4 py-3 font-bold">Criado por</th>
                  <th className="px-4 py-3 font-bold">Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[var(--color-text-secondary)]">
                      A carregar histórico...
                    </td>
                  </tr>
                ) : sortedHistory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[var(--color-text-secondary)]">
                      Ainda não há taxas registadas.
                    </td>
                  </tr>
                ) : (
                  paginatedHistory.map((row) => (
                    <tr key={`${row.baseCurrency}-${row.id}`} className="align-top">
                      <td className="px-4 py-3 font-bold text-[var(--color-text-primary)]">
                        {row.baseCurrency} → {row.targetCurrency}
                      </td>
                      <td className="px-4 py-3 font-semibold text-[var(--color-text-primary)]">
                        {formatRate(row.rate)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${sourceClassName(isTestActor(row.createdBy) ? "SEED_LOCAL" : row.source)}`}>
                          {sourceLabel(row)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusChip active={row.active} />
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-secondary)]">{formatDate(row.createdAt)}</td>
                      <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                        {isTestActor(row.createdBy) ? "Seed local" : row.createdBy || "Sistema"}
                      </td>
                      <td className="max-w-[220px] px-4 py-3 text-[var(--color-text-secondary)]">
                        {row.notes || "Sem notas"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!isLoading && sortedHistory.length > HISTORY_PAGE_SIZE ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] px-5 py-3 text-xs text-[var(--color-text-secondary)]">
              <span>
                Página {historyPage} de {historyPageCount}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
                  disabled={historyPage === 1}
                  className="rounded-full border border-[var(--color-border)] px-3 py-1.5 font-bold text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryPage((page) => Math.min(historyPageCount, page + 1))}
                  disabled={historyPage === historyPageCount}
                  className="rounded-full border border-[var(--color-border)] px-3 py-1.5 font-bold text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Seguinte
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
