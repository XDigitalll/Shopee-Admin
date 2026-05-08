"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useAdminLiveRefresh } from "@/hooks/use-admin-live-refresh";
import { adminApiFetch } from "@/lib/admin/api-client";
import { formatMoney, humanizeOrderStatus, humanizePaymentMethod } from "@/lib/admin/format";
import type { ExternalOrderDetail, OrderHistoryEntry } from "@/lib/admin/types";

const STATUS_THEME: Record<string, string> = {
  CREATED: "bg-[#F1EFE8] text-[#444441]",
  UNDER_REVIEW: "bg-[#FAEEDA] text-[#633806]",
  QUOTED: "bg-[#fef3c7] text-[#92400e]",
  APPROVED: "bg-[#d1fae5] text-[#065f46]",
  PENDING_PAYMENT: "bg-[#FAEEDA] text-[#633806]",
  PAID: "bg-[#EAF3DE] text-[#173404]",
  ORDERED: "bg-[#E1F5EE] text-[#085041]",
  SHIPPED: "bg-[#d1fae5] text-[#065f46]",
  IN_TRANSIT: "bg-[#DBEAFE] text-[#1E3A5F]",
  ARRIVED: "bg-[#E0F2FE] text-[#0C4A6E]",
  OUT_FOR_DELIVERY: "bg-[#FDE68A] text-[#854D0E]",
  DELIVERED: "bg-[#EAF3DE] text-[#27500A]",
  CANCELLED: "bg-[#FCEBEB] text-[#791F1F]",
};

function isPaymentValidated(status: string | null | undefined) {
  return ["APPROVED", "PAID", "VALIDATED"].includes(String(status ?? ""));
}

export function OrderPaymentReviewView({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<ExternalOrderDetail | null>(null);
  const [history, setHistory] = useState<OrderHistoryEntry[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const detailPayload = await adminApiFetch<ExternalOrderDetail>(`/api/admin/orders/${orderId}`);

        if (!cancelled) {
          setDetail(detailPayload);
          setHistory(detailPayload.history ?? []);
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Nao foi possivel carregar o pagamento.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const currentStatus = detail?.status ?? "";
  const canValidate = Boolean(
    detail?.payment.status && !isPaymentValidated(detail.payment.status)
  ) || currentStatus === "PENDING_PAYMENT";

  const paymentTimeline = useMemo(
    () =>
      history.filter((event) =>
        ["quoted", "approved", "pending_payment", "paid", "ordered"].includes(event.id)
      ),
    [history]
  );

  async function refreshData() {
    const detailPayload = await adminApiFetch<ExternalOrderDetail>(`/api/admin/orders/${orderId}`);

    setDetail(detailPayload);
    setHistory(detailPayload.history ?? []);
    setError("");
  }

  useAdminLiveRefresh(refreshData, { intervalMs: 15_000, minIntervalMs: 5_000 });

  async function validatePayment() {
    setError("");
    setSuccess("");
    try {
      await adminApiFetch(`/api/admin/orders/${orderId}/payment/validate`, { method: "PUT" });
      setSuccess("Pagamento validado com sucesso.");
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel validar o pagamento.");
    }
  }

  if (!detail) {
    return (
      <section className="admin-card p-8">
        <p className="text-sm text-[var(--color-text-secondary)]">
          {error || "A carregar validacao de pagamento..."}
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="sticky top-[88px] z-10 rounded-[28px] border border-[var(--color-border)] bg-[color:var(--color-surface-overlay)]/95 px-6 py-5 backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
              <Link href="/admin/orders" className="text-[var(--color-danger)]">
                ← Pedidos
              </Link>
              <span>/</span>
              <span>Validacao de pagamento</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="font-[family-name:var(--font-sora)] text-3xl font-semibold">
                Validacao de pagamento
              </h1>
              <span className="font-[family-name:var(--font-sora)] text-xl font-semibold text-[var(--color-danger)]">
                {detail.number}
              </span>
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                  STATUS_THEME[currentStatus] ?? "bg-[var(--color-background-tertiary)] text-[var(--color-text-secondary)]"
                }`}
              >
                {humanizeOrderStatus(currentStatus)}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={detail.customerId ? `/admin/customers/${detail.customerId}` : "/admin/customers"}
              className="admin-button-muted"
            >
              Ver cliente
            </Link>
            <Link href={`/admin/orders/${detail.id}`} className="admin-button-muted">
              Ver pedido completo
            </Link>
            {canValidate ? (
              <button
                type="button"
                onClick={() => startTransition(async () => validatePayment())}
                className="admin-button-danger"
              >
                {isPending ? "A validar..." : "Validar pagamento"}
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

      {success ? (
        <div className="rounded-[24px] border border-[rgba(22,101,52,0.14)] bg-[rgba(22,163,74,0.08)] px-5 py-4 text-sm text-[#166534]">
          {success}
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
                    .map((part) => part[0]?.toUpperCase())
                    .join("")}
                </div>
                <div>
                  <h2 className="font-[family-name:var(--font-sora)] text-2xl font-semibold">
                    {detail.customerName}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                    {detail.customerEmail || "Sem email"} · {detail.customerPhone}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        detail.type === "EXTERNAL" ? "bg-[#FFF0E6] text-[#AA4E1C]" : "bg-[#E8F6EB] text-[#185C2E]"
                      }`}
                    >
                      {detail.type === "EXTERNAL" ? "EXTERNO" : "INTERNO"}
                    </span>
                    <span className="inline-flex rounded-full bg-[#fef3c7] px-2.5 py-1 text-xs font-semibold text-[#92400e]">
                      {detail.customerVerified ? "Verificado" : "Verificacao pendente"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-background-tertiary)] px-5 py-4 text-sm">
                <p className="text-[var(--color-text-secondary)]">Total do pedido</p>
                <strong className="mt-2 block font-[family-name:var(--font-sora)] text-3xl text-[var(--color-danger)]">
                  {formatMoney(detail.payment.amount || detail.totalAmount)}
                </strong>
              </div>
            </div>
          </section>

          <section className="admin-card p-6">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">
                Pagamento recebido
              </p>
              <h2 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold">
                Revisao do comprovativo e da referencia
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-background-tertiary)] p-5">
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--color-text-secondary)]">Metodo</span>
                    <strong>{humanizePaymentMethod(detail.payment.method)}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--color-text-secondary)]">Referencia</span>
                    <strong>{detail.payment.transactionId || "Sem referencia"}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--color-text-secondary)]">Estado da validacao</span>
                    <strong>{detail.payment.status || "Pendente"}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--color-text-secondary)]">Valor pago</span>
                    <strong className="font-[family-name:var(--font-sora)]">
                      {formatMoney(detail.payment.amount || detail.totalAmount)}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--color-text-secondary)]">Submetido em</span>
                    <strong>
                      {detail.payment.submittedAt
                        ? new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" }).format(
                            new Date(detail.payment.submittedAt)
                          )
                        : "Sem registo"}
                    </strong>
                  </div>
                </div>
                {detail.payment.method === "CASH_ON_DELIVERY" && !isPaymentValidated(detail.payment.status) ? (
                  <div className="mt-4 rounded-2xl border border-[#F1D7A8] bg-[#FFF5D8] px-4 py-3 text-sm text-[#7A5712]">
                    Este pagamento deve ser confirmado pelo delivery quando cobrar ao cliente.
                  </div>
                ) : null}
              </div>

              <div className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-background-tertiary)] p-5">
                <p className="text-sm font-medium text-[var(--color-text-secondary)]">Check rapido</p>
                <div className="mt-4 space-y-3 text-sm">
                  {[
                    {
                      label: "Valor cobre o total do pedido",
                      ok: (detail.payment.amount || 0) >= detail.totalAmount,
                    },
                    {
                      label: "Referencia de transaccao preenchida",
                      ok: Boolean(detail.payment.transactionId),
                    },
                    {
                      label: "Metodo de pagamento identificado",
                      ok: Boolean(detail.payment.method),
                    },
                    {
                      label: "Cliente com contacto disponivel",
                      ok: Boolean(detail.customerPhone || detail.customerEmail),
                    },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-3">
                      <span>{item.label}</span>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          item.ok ? "bg-[#EAF3DE] text-[#173404]" : "bg-[#FCEBEB] text-[#791F1F]"
                        }`}
                      >
                        {item.ok ? "OK" : "Rever"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {detail.payment.notes ? (
              <div className="mt-4 rounded-[24px] border border-[var(--color-border)] bg-[var(--color-background-tertiary)] p-5 text-sm text-[var(--color-text-secondary)]">
                <p className="font-medium text-[var(--color-text-primary)]">Notas do pagamento</p>
                <p className="mt-2">{detail.payment.notes}</p>
              </div>
            ) : null}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="admin-card p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">
              Proximas accoes
            </p>
            <div className="mt-4 flex flex-col gap-3">
              {canValidate ? (
                <button
                  type="button"
                  onClick={() => startTransition(async () => validatePayment())}
                  className="admin-button-danger justify-center"
                >
                  {isPending ? "A validar..." : "Confirmar pagamento"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => router.push(`/admin/orders/${detail.id}`)}
                className="admin-button-muted justify-center"
              >
                Voltar ao detalhe
              </button>
              {detail.status === "UNDER_REVIEW" ? (
                <Link href={`/admin/orders/${detail.id}/quote`} className="admin-button-muted justify-center">
                  Abrir cotacao
                </Link>
              ) : null}
            </div>
          </section>

          <section className="admin-card p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">
              Linha do pagamento
            </p>
            <div className="mt-4 space-y-4">
              {paymentTimeline.map((event) => (
                <div key={event.id} className="flex items-start gap-3">
                  <span
                    className={`mt-1 h-3 w-3 rounded-full ${
                      event.state === "done"
                        ? "bg-[var(--color-danger)]"
                        : event.state === "current"
                          ? "bg-[#94a3b8]"
                          : "border border-dashed border-[var(--color-border-strong)] bg-transparent"
                    }`}
                  />
                  <div>
                    <p className="font-medium text-[var(--color-text-primary)]">{event.label}</p>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      {event.date
                        ? new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" }).format(
                            new Date(event.date)
                          )
                        : "Sem data"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
