"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import {
  AdminConfirmDialog,
  AdminFeedbackDock,
  AdminSectionSkeleton,
  AdminStateCard,
} from "@/components/admin/feedback-state";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { adminApiFetch } from "@/lib/admin/api-client";
import { formatMoney } from "@/lib/admin/format";
import type { ExternalOrderDetail, TrackingHistoryEntry } from "@/lib/admin/types";

const ALLOWED_ROLES = new Set(["ORDER_MANAGER", "ADMIN", "SUPER_ADMIN"]);
const CARRIER_OPTIONS = [
  { value: "", label: "Selecionar transportador" },
  { value: "DHL", label: "DHL" },
  { value: "FEDEX", label: "FedEx" },
  { value: "CTT", label: "CTT" },
  { value: "OTHER", label: "Outro" },
] as const;

type TrackingForm = {
  trackingCode: string;
  carrier: "" | "DHL" | "FEDEX" | "CTT" | "OTHER";
  estimatedDelivery: string;
  trackingUrl: string;
};

function toDateInput(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}

function formatHistoryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function OrderTrackingView({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { effectiveRole, isLoading: authLoading } = useAdminAuth();
  const [detail, setDetail] = useState<ExternalOrderDetail | null>(null);
  const [history, setHistory] = useState<TrackingHistoryEntry[]>([]);
  const [form, setForm] = useState<TrackingForm>({
    trackingCode: "",
    carrier: "",
    estimatedDelivery: "",
    trackingUrl: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const allowed = ALLOWED_ROLES.has(effectiveRole ?? "");

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!allowed) {
      router.replace("/admin/unauthorized");
    }
  }, [allowed, authLoading, router]);

  useEffect(() => {
    if (!allowed) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const [detailPayload, historyPayload] = await Promise.all([
          adminApiFetch<ExternalOrderDetail>(`/api/admin/orders/${orderId}`),
          adminApiFetch<TrackingHistoryEntry[]>(`/api/admin/orders/${orderId}/tracking-history`),
        ]);

        if (cancelled) {
          return;
        }

        setDetail(detailPayload);
        setHistory(historyPayload);
        setForm({
          trackingCode: detailPayload.trackingCode ?? "",
          carrier: detailPayload.trackingCarrier ?? "",
          estimatedDelivery: toDateInput(detailPayload.estimatedDelivery),
          trackingUrl: detailPayload.trackingUrl ?? "",
        });
      } catch (error) {
        if (!cancelled) {
          setFeedback({
            tone: "error",
            message: error instanceof Error ? error.message : "Nao foi possivel carregar o rastreio deste pedido.",
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [allowed, orderId]);

  const destinationSummary = useMemo(() => {
    if (!detail) {
      return "";
    }

    return [detail.customerName, detail.customerPhone].filter(Boolean).join(" · ");
  }, [detail]);

  async function refreshHistory() {
    const payload = await adminApiFetch<TrackingHistoryEntry[]>(`/api/admin/orders/${orderId}/tracking-history`);
    setHistory(payload);
  }

  async function saveTracking() {
    const payload = await adminApiFetch<{
      trackingCode: string;
      carrier: TrackingForm["carrier"];
      estimatedDelivery: string;
      trackingUrl: string;
    }>(`/api/admin/orders/${orderId}/tracking`, {
      method: "PUT",
      body: JSON.stringify(form),
    });

    setForm({
      trackingCode: payload.trackingCode ?? "",
      carrier: payload.carrier ?? "",
      estimatedDelivery: payload.estimatedDelivery ?? "",
      trackingUrl: payload.trackingUrl ?? "",
    });

    setDetail((current) =>
      current
        ? {
            ...current,
            trackingCode: payload.trackingCode ?? "",
            trackingCarrier: payload.carrier ?? "",
            estimatedDelivery: payload.estimatedDelivery ?? null,
            trackingUrl: payload.trackingUrl || current.trackingUrl,
          }
        : current
    );
    await refreshHistory();
    setFeedback({ tone: "success", message: "Rastreio guardado com sucesso." });
  }

  async function confirmDelivered() {
    await adminApiFetch(`/api/admin/orders/${orderId}/status`, {
      method: "PUT",
      body: JSON.stringify({ status: "DELIVERED" }),
    });
    router.push(`/admin/orders/${orderId}`);
  }

  if (authLoading || isLoading) {
    return (
      <AdminSectionSkeleton
        title="A carregar rastreio e entrega"
        message="Estamos a reunir dados do pedido, atualizacoes de rastreio e informacao final de entrega."
        rows={3}
      />
    );
  }

  if (!allowed) {
    return null;
  }

  if (!detail) {
    return (
      <AdminStateCard
        title="Nao foi possivel abrir esta vista"
        message="Recarregue a pagina ou volte ao detalhe do pedido para tentar novamente."
        tone="error"
        compact
      />
    );
  }

  return (
    <div className="space-y-6">
      <AdminFeedbackDock feedback={feedback} onClose={() => setFeedback(null)} />

      <section className="sticky top-[88px] z-10 rounded-[28px] border border-[var(--color-border)] bg-[color:var(--color-surface-overlay)]/95 px-6 py-5 backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
              <Link href={`/admin/orders/${orderId}`} className="text-[var(--color-danger)]">
                ← Pedido {detail.number}
              </Link>
              <span>/</span>
              <span>Rastreio e entrega</span>
            </div>
            <h1 className="mt-2 font-[family-name:var(--font-sora)] text-3xl font-semibold text-[var(--color-text-primary)]">
              Rastreio e entrega
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="rounded-2xl bg-[var(--color-danger)] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Confirmar entrega ao cliente
          </button>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="admin-card p-6">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">Pedido</p>
              <h2 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold">Dados principais</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[24px] bg-[var(--color-background-tertiary)] p-5">
                <p className="text-sm font-medium text-[var(--color-text-secondary)]">Cliente</p>
                <p className="mt-2 text-lg font-semibold text-[var(--color-text-primary)]">{detail.customerName}</p>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{detail.customerEmail || "Sem email"}</p>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{detail.customerPhone || "Sem telefone"}</p>
              </div>
              <div className="rounded-[24px] bg-[var(--color-background-tertiary)] p-5">
                <p className="text-sm font-medium text-[var(--color-text-secondary)]">Entrega</p>
                <p className="mt-2 text-sm text-[var(--color-text-primary)]">{detail.deliveryAddress || "Sem morada completa"}</p>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Referencia: {detail.deliveryReference || "Sem referencia"}</p>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Destinatario: {destinationSummary || "Sem destinatario"}</p>
              </div>
            </div>
            <div className="mt-5 rounded-[24px] bg-[var(--color-background-tertiary)] p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-[var(--color-text-secondary)]">Itens resumidos</p>
                <strong className="font-[family-name:var(--font-sora)] text-sm text-[var(--color-text-primary)]">
                  {formatMoney(detail.totalAmount)}
                </strong>
              </div>
              <div className="mt-4 space-y-3">
                {detail.externalItems.length ? (
                  detail.externalItems.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-4 rounded-2xl bg-[var(--color-background-secondary)] px-4 py-3">
                      <div>
                        <p className="font-medium text-[var(--color-text-primary)]">{item.name}</p>
                        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{item.details || "Sem variantes detalhadas"}</p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="font-semibold text-[var(--color-text-primary)]">x{item.quantity}</p>
                        <p className="mt-1 text-[var(--color-text-secondary)]">
                          {formatMoney(Number(item.originalPriceUsd || 0) * Number(item.quantity || 1))}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-[var(--color-border)] px-4 py-5 text-sm text-[var(--color-text-secondary)]">
                    Ainda nao existem itens resumidos para este pedido.
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="admin-card p-6">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">Rastreio</p>
                <h2 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold">Atualizar envio</h2>
              </div>
              {form.trackingUrl ? (
                <a href={form.trackingUrl} target="_blank" rel="noreferrer" className="admin-button-muted">
                  Abrir rastreio ↗
                </a>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">Codigo de rastreio</span>
                <input
                  value={form.trackingCode}
                  onChange={(event) => setForm((current) => ({ ...current, trackingCode: event.target.value }))}
                  className="admin-input"
                  placeholder="Ex.: DHL-445920-MZ"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">Transportador</span>
                <select
                  value={form.carrier}
                  onChange={(event) => setForm((current) => ({ ...current, carrier: event.target.value as TrackingForm["carrier"] }))}
                  className="admin-input"
                >
                  {CARRIER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">Data estimada de entrega</span>
                <input
                  type="date"
                  value={form.estimatedDelivery}
                  onChange={(event) => setForm((current) => ({ ...current, estimatedDelivery: event.target.value }))}
                  className="admin-input"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">Link externo de rastreio</span>
                <input
                  value={form.trackingUrl}
                  onChange={(event) => setForm((current) => ({ ...current, trackingUrl: event.target.value }))}
                  className="admin-input"
                  placeholder="https://..."
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => startTransition(() => void saveTracking())}
                className="rounded-2xl bg-[var(--color-danger)] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              >
                {isPending ? "A guardar..." : "Guardar rastreio"}
              </button>
              <Link href={`/admin/orders/${orderId}`} className="admin-button-muted">
                Voltar ao pedido
              </Link>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="admin-card p-6">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">Historico</p>
              <h2 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold">Atualizacoes de rastreio</h2>
            </div>

            {history.length ? (
              <div className="space-y-4">
                {history.map((entry, index) => (
                  <div key={entry.id} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-danger)]" />
                      {index < history.length - 1 ? (
                        <span className="mt-1 h-full min-h-10 w-px bg-[var(--color-border)]" />
                      ) : null}
                    </div>
                    <div className="pb-2">
                      <p className="text-sm font-semibold text-[var(--color-text-primary)]">{entry.description}</p>
                      <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{formatHistoryDate(entry.date)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--color-border)] px-4 py-5 text-sm text-[var(--color-text-secondary)]">
                Ainda nao existem atualizacoes de rastreio para mostrar.
              </div>
            )}
          </section>
        </aside>
      </div>

      <AdminConfirmDialog
        open={confirmOpen}
        title="Confirmar entrega ao cliente?"
        message="Esta acao vai marcar o pedido como entregue e redirecionar de volta ao detalhe do pedido."
        confirmLabel="Confirmar entrega"
        danger
        pending={isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => startTransition(() => void confirmDelivered())}
      />
    </div>
  );
}
