"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { AdminBanner, AdminCardListSkeleton, AdminFeedbackDock } from "@/components/admin/feedback-state";
import { useAdminLiveRefresh } from "@/hooks/use-admin-live-refresh";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { adminApiFetch } from "@/lib/admin/api-client";
import { formatMoney, humanizePaymentMethod } from "@/lib/admin/format";
import type {
  AwaitingPaymentSubmissionsPage,
  PaymentAwaitingSubmission,
  PaymentSubmission,
  PaymentSubmissionQueue,
  PaymentSubmissionQueueStats,
  PaymentSubmissionsPage,
} from "@/lib/admin/types";

const QUEUES: Array<{
  key: PaymentSubmissionQueue;
  label: string;
  empty: string;
  needsAction: boolean;
}> = [
  { key: "AWAITING_SUBMISSION", label: "Aguardando submissao", empty: "Nenhum pagamento pendente", needsAction: false },
  { key: "SUBMITTED", label: "Submetidos", empty: "Nenhum pagamento submetido", needsAction: true },
  { key: "UNDER_REVIEW", label: "Em revisao", empty: "Nenhum pagamento em revisao", needsAction: true },
  { key: "APPROVED", label: "Aprovados", empty: "Nenhum pagamento aprovado", needsAction: false },
  { key: "REJECTED", label: "Rejeitados", empty: "Nenhum pagamento rejeitado", needsAction: false },
  { key: "SUSPICIOUS", label: "Suspeitos", empty: "Nenhum pagamento suspeito", needsAction: true },
  { key: "REQUEST_NEW_PROOF", label: "Novo comprovativo", empty: "Nenhum pedido de novo comprovativo", needsAction: false },
];

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "Submetido",
  UNDER_REVIEW: "Em revisao",
  APPROVED: "Aprovado",
  REJECTED: "Rejeitado",
  FLAGGED: "Suspeito",
  REQUEST_NEW_PROOF: "Novo comprovativo",
};

const RISK_LABELS: Record<string, string> = {
  DUPLICATE_REFERENCE: "Referencia duplicada",
  AMOUNT_MISMATCH: "Valor diferente",
  PAYER_PHONE_USED_IN_MULTIPLE_ORDERS: "Telefone repetido",
  MISSING_PROOF: "Comprovativo ausente",
  PAYMENT_OUTSIDE_EXPECTED_TIME: "Fora do tempo esperado",
};

const METHOD_LABELS: Record<string, string> = {
  MPESA: "MPESA",
  EMOLA: "EMOLA",
  BANK_TRANSFER: "BANK",
  VISA_MANUAL: "VISA",
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Sem registo";
  try {
    return new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

function pageFrom<T>(payload: { content?: T[]; page?: number; number?: number; size?: number; totalElements?: number; totalPages?: number } | T[] | null) {
  if (Array.isArray(payload)) {
    return { content: payload, page: 0, size: payload.length, totalElements: payload.length, totalPages: payload.length ? 1 : 0 };
  }
  return {
    content: payload?.content ?? [],
    page: Number(payload?.page ?? payload?.number ?? 0),
    size: Number(payload?.size ?? 10),
    totalElements: Number(payload?.totalElements ?? payload?.content?.length ?? 0),
    totalPages: Number(payload?.totalPages ?? 0),
  };
}

function queueCount(stats: PaymentSubmissionQueueStats | null, queue: PaymentSubmissionQueue) {
  if (!stats) return 0;
  if (queue === "AWAITING_SUBMISSION") return stats.awaitingSubmission;
  if (queue === "SUBMITTED") return stats.submitted;
  if (queue === "UNDER_REVIEW") return stats.underReview;
  if (queue === "APPROVED") return stats.approved;
  if (queue === "REJECTED") return stats.rejected;
  if (queue === "REQUEST_NEW_PROOF") return Number(stats.requestNewProof ?? 0);
  return stats.suspicious;
}

function methodBadge(method: string | null | undefined) {
  const value = method || "UNKNOWN";
  const label = METHOD_LABELS[value] ?? humanizePaymentMethod(value).toUpperCase();
  const className =
    value === "MPESA" ? "bg-[#EAF3DE] text-[#27500A]"
      : value === "EMOLA" ? "bg-[#E8F1FE] text-[#1D4ED8]"
      : value === "BANK_TRANSFER" ? "bg-[#FFF2D6] text-[#8A5A00]"
      : "bg-[#EEEDFE] text-[#3C3489]";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-black ${className}`}>{label}</span>;
}

function statusBadge(status: string) {
  const className =
    status === "APPROVED" ? "bg-[#EAF3DE] text-[#166534]"
      : status === "REJECTED" ? "bg-[#FCEBEB] text-[#B42318]"
      : status === "FLAGGED" ? "bg-[#FFF1F2] text-[#BE123C]"
      : status === "REQUEST_NEW_PROOF" ? "bg-[#EFF6FF] text-[#1D4ED8]"
      : status === "UNDER_REVIEW" ? "bg-[#EEEDFE] text-[#3C3489]"
      : "bg-[#FAEEDA] text-[#9A5B00]";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${className}`}>{STATUS_LABELS[status] ?? status}</span>;
}

function riskChips(flags: string[] = []) {
  if (!flags.length) {
    return <span className="rounded-full bg-[#EAF3DE] px-2.5 py-1 text-xs font-semibold text-[#166534]">Sem alertas</span>;
  }
  return flags.map((flag) => (
    <span key={flag} className="rounded-full bg-[#FFF1D6] px-2.5 py-1 text-xs font-semibold text-[#9A5B00]">
      {RISK_LABELS[flag] ?? flag}
    </span>
  ));
}

function difference(submission: PaymentSubmission) {
  return Number(submission.amount ?? 0) - Number(submission.expectedAmount ?? 0);
}

function proofKind(submission: PaymentSubmission) {
  const type = submission.proofType?.toLowerCase() || "";
  const url = submission.proofUrl?.toLowerCase() || "";
  if (type.includes("pdf") || url.endsWith(".pdf")) return "pdf";
  if (type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(url)) return "image";
  return submission.proofUrl ? "file" : "none";
}

function ActionDot({ visible }: { visible: boolean }) {
  return visible ? <span className="h-2.5 w-2.5 rounded-full bg-[#F97316]" aria-label="Precisa de accao" /> : null;
}

function AwaitingCard({ item }: { item: PaymentAwaitingSubmission }) {
  return (
    <article className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--color-danger)]">Aguardando cliente</p>
          <h3 className="mt-2 font-[family-name:var(--font-sora)] text-lg font-semibold text-[var(--color-text-primary)]">
            Pedido {item.orderCode || `#${item.orderId}`}
          </h3>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{item.customerName || item.customerEmail || "Cliente sem nome"}</p>
        </div>
        <span className="rounded-full bg-[#FAEEDA] px-3 py-1 text-xs font-bold text-[#9A5B00]">Pendente</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Info label="Valor esperado" value={formatMoney(item.expectedAmount ?? 0)} />
        <Info label="Criado em" value={formatDateTime(item.orderDate)} />
        <Info label="Estado" value={item.orderStatus || "PENDING_PAYMENT"} />
      </div>
      <Link href={`/admin/orders/${item.orderId}`} className="mt-4 inline-flex rounded-2xl border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)]">
        Abrir pedido
      </Link>
    </article>
  );
}

function Info({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="rounded-2xl bg-[var(--color-background-tertiary)] px-4 py-3">
      <p className="text-xs font-semibold text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-[var(--color-text-primary)]">{value || "Sem registo"}</p>
    </div>
  );
}

function HighlightNewPayment({ submission, onOpen }: { submission: PaymentSubmission | null; onOpen: () => void }) {
  if (!submission) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-[28px] border border-[#F97316] bg-[#FFF7ED] p-5 text-left shadow-[0_18px_50px_rgba(249,115,22,0.18)] animate-pulse"
    >
      <p className="text-xs font-black uppercase tracking-[0.2em] text-[#C2410C]">Novo pagamento recebido</p>
      <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-[family-name:var(--font-sora)] text-xl font-semibold text-[#431407]">
            Novo comprovativo recebido de {submission.customerName || submission.payerName || "cliente"}
          </h2>
          <p className="mt-1 text-sm text-[#9A3412]">
            Pedido {submission.orderCode || `#${submission.orderId}`} - {formatMoney(submission.amount ?? 0)} - {humanizePaymentMethod(submission.paymentMethod)}
          </p>
        </div>
        <span className="rounded-full bg-[#E8431A] px-4 py-2 text-sm font-black text-white">Abrir revisão</span>
      </div>
    </button>
  );
}

function SubmissionCard({
  item,
  selected,
  onClick,
}: {
  item: PaymentSubmission;
  selected: boolean;
  onClick: () => void;
}) {
  const flags = item.riskFlags ?? [];
  const actionRequired = ["SUBMITTED", "UNDER_REVIEW", "FLAGGED"].includes(item.status);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-[24px] border bg-[var(--color-background-secondary)] p-5 text-left transition ${
        selected ? "border-[var(--color-danger)] shadow-[0_18px_50px_rgba(232,67,26,0.12)]" : flags.length ? "border-[#F59E0B]" : "border-[var(--color-border)]"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ActionDot visible={actionRequired} />
            <p className="truncate font-[family-name:var(--font-sora)] text-lg font-semibold text-[var(--color-text-primary)]">
              Pedido {item.orderCode || `#${item.orderId}`}
            </p>
          </div>
          <p className="mt-1 truncate text-sm text-[var(--color-text-secondary)]">
            {item.customerName || item.payerName || "Cliente sem nome"} {item.customerPhone ? `- ${item.customerPhone}` : item.payerPhone ? `- ${item.payerPhone}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {methodBadge(item.paymentMethod)}
          {statusBadge(item.status)}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <Info label="Cliente" value={item.customerName || item.payerName} />
        <Info label="Telefone" value={item.customerPhone || item.payerPhone} />
        <Info label="Email" value={item.customerEmail} />
        <Info label="Cidade" value={item.customerCity} />
        <Info label="Tipo" value={item.orderType === "EXTERNAL" ? "EXT" : item.orderType === "INTERNAL" ? "INT" : item.orderType} />
        <Info label="Itens" value={item.itemCount ?? 0} />
        <Info label="Valor esperado" value={formatMoney(item.expectedAmount ?? 0)} />
        <Info label="Valor submetido" value={formatMoney(item.amount ?? 0)} />
        <Info label="Referencia" value={item.transactionReference || "Sem referencia"} />
        <Info label="Submetido" value={formatDateTime(item.submittedAt)} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">{riskChips(flags)}</div>
      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-[var(--color-text-secondary)]">
        <span>{item.proofUrl ? "Comprovativo disponivel" : "Sem comprovativo"}</span>
        <span>Dif.: {formatMoney(difference(item))}</span>
      </div>
    </button>
  );
}

function SubmissionDrawer({
  submission,
  isLoading,
  note,
  setNote,
  onClose,
  onAction,
  busyAction,
  canDecide,
}: {
  submission: PaymentSubmission | null;
  isLoading: boolean;
  note: string;
  setNote: (value: string) => void;
  onClose: () => void;
  onAction: (action: "review" | "approve" | "reject" | "flag" | "request-new-proof") => void;
  busyAction: string | null;
  canDecide: boolean;
}) {
  const proof = submission ? proofKind(submission) : "none";
  const canStartReview = submission !== null && (submission.status === "SUBMITTED" || submission.status === "FLAGGED");
  const canDecideOnReview = submission !== null && submission.status === "UNDER_REVIEW";

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-2xl flex-col border-l border-[var(--color-border)] bg-[var(--color-background-secondary)] shadow-[0_0_80px_rgba(0,0,0,0.24)]">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-6 py-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--color-danger)]">Analise financeira</p>
          <h2 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold text-[var(--color-text-primary)]">
            {submission ? `Submissao #${submission.id}` : "Detalhe"}
          </h2>
        </div>
        <button type="button" onClick={onClose} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
          Fechar
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {isLoading ? (
          <AdminCardListSkeleton rows={2} />
        ) : submission ? (
          <div className="space-y-5">
            <section className="rounded-[24px] border border-[var(--color-border)] p-5">
              <div className="flex flex-wrap items-center gap-2">
                {methodBadge(submission.paymentMethod)}
                {statusBadge(submission.status)}
                {submission.riskFlags?.length ? <span className="rounded-full bg-[#FFF1F2] px-2.5 py-1 text-xs font-black text-[#BE123C]">Suspeito</span> : null}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Info label="Pedido" value={submission.orderCode || `#${submission.orderId}`} />
                <Info label="Tipo" value={submission.orderType === "EXTERNAL" ? "EXT" : submission.orderType === "INTERNAL" ? "INT" : submission.orderType} />
                <Info label="Itens" value={submission.itemCount ?? 0} />
                <Info label="Criado em" value={formatDateTime(submission.orderCreatedAt)} />
                <Info label="Cliente" value={submission.customerName || submission.payerName} />
                <Info label="Telefone principal" value={submission.customerPhone} />
                <Info label="Telefone comunicacao" value={submission.customerCommunicationPhone} />
                <Info label="Email" value={submission.customerEmail} />
                <Info label="Cidade" value={submission.customerCity} />
                <Info label="Valor esperado" value={formatMoney(submission.expectedAmount ?? 0)} />
                <Info label="Valor enviado" value={formatMoney(submission.amount ?? 0)} />
                <Info label="Diferenca" value={formatMoney(difference(submission))} />
                <Info label="Metodo" value={humanizePaymentMethod(submission.paymentMethod)} />
                <Info label="Telefone" value={submission.payerPhone} />
                <Info label="Referencia" value={submission.transactionReference} />
                <Info label="Banco" value={submission.payerBank} />
                <Info label="Submetido" value={formatDateTime(submission.submittedAt)} />
                <Info label="Revisto por" value={submission.reviewedBy} />
              </div>
            </section>

            <section className="rounded-[24px] border border-[var(--color-border)] p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-[family-name:var(--font-sora)] text-lg font-semibold">Comprovativo</h3>
                {submission.proofUrl ? (
                  <a href={submission.proofUrl} target="_blank" rel="noreferrer" download className="admin-button-muted">
                    Abrir / download
                  </a>
                ) : null}
              </div>
              <div className="mt-4 overflow-hidden rounded-[20px] border border-[var(--color-border)] bg-[var(--color-background-tertiary)]">
                {proof === "image" && submission.proofUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={submission.proofUrl} alt="Comprovativo de pagamento" className="max-h-[520px] w-full object-contain" />
                ) : proof === "pdf" && submission.proofUrl ? (
                  <iframe src={submission.proofUrl} title="Comprovativo PDF" className="h-[520px] w-full" />
                ) : proof === "file" && submission.proofUrl ? (
                  <div className="p-6 text-sm text-[var(--color-text-secondary)]">Ficheiro disponivel para abertura externa.</div>
                ) : (
                  <div className="p-6 text-sm text-[var(--color-text-secondary)]">Nenhum comprovativo anexado.</div>
                )}
              </div>
            </section>

            <section className="rounded-[24px] border border-[var(--color-border)] p-5">
              <h3 className="font-[family-name:var(--font-sora)] text-lg font-semibold">Histórico do cliente</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Info label="Pedidos anteriores" value={submission.customerPreviousOrders ?? 0} />
                <Info label="Pagamentos aprovados" value={submission.customerApprovedPayments ?? 0} />
                <Info label="Risco acumulado" value={submission.customerRiskFlags ?? 0} />
              </div>
            </section>

            <section className="rounded-[24px] border border-[var(--color-border)] p-5">
              <h3 className="font-[family-name:var(--font-sora)] text-lg font-semibold">Risk flags</h3>
              <div className="mt-3 flex flex-wrap gap-2">{riskChips(submission.riskFlags)}</div>
            </section>

            <section className="rounded-[24px] border border-[var(--color-border)] p-5">
              <h3 className="font-[family-name:var(--font-sora)] text-lg font-semibold">Historico</h3>
              <div className="mt-4 space-y-3">
                {(submission.orderHistory ?? []).length ? (submission.orderHistory ?? []).map((entry, index) => (
                  <div key={`${entry.id ?? index}`} className="rounded-2xl bg-[var(--color-background-tertiary)] px-4 py-3">
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">{entry.action || "Evento"}</p>
                    <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{entry.description || "Sem descricao"}</p>
                    <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                      {formatDateTime(entry.createdAt ?? null)} - {entry.performedByName || entry.performedByEmail || "Sistema"}
                    </p>
                  </div>
                )) : <p className="text-sm text-[var(--color-text-secondary)]">Sem historico disponivel.</p>}
              </div>
            </section>

            <section className="rounded-[24px] border border-[var(--color-border)] p-5">
              <label className="block">
                <span className="text-sm font-semibold">Nota da revisao</span>
                <textarea value={note} onChange={(event) => setNote(event.target.value)} className="admin-input mt-2 min-h-24 w-full" placeholder="Motivo, referencia interna ou instrucao para o cliente." />
              </label>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => onAction("review")} disabled={!canStartReview || Boolean(busyAction)} className="admin-button-muted justify-center">
                  {busyAction === "review" ? "A iniciar..." : "Iniciar revisao"}
                </button>
                <button type="button" onClick={() => onAction("approve")} disabled={!canDecideOnReview || !canDecide || Boolean(busyAction)} className="admin-button-danger justify-center">
                  {busyAction === "approve" ? "A aprovar..." : "Aprovar pagamento"}
                </button>
                <button type="button" onClick={() => onAction("reject")} disabled={!canDecideOnReview || !canDecide || Boolean(busyAction)} className="admin-button-muted justify-center">
                  {busyAction === "reject" ? "A rejeitar..." : "Rejeitar"}
                </button>
                <button type="button" onClick={() => onAction("flag")} disabled={!canDecideOnReview || Boolean(busyAction)} className="admin-button-muted justify-center">
                  {busyAction === "flag" ? "A marcar..." : "Marcar suspeito"}
                </button>
                <button type="button" onClick={() => onAction("request-new-proof")} disabled={!canDecideOnReview || !canDecide || Boolean(busyAction)} className="admin-button-muted justify-center sm:col-span-2">
                  {busyAction === "request-new-proof" ? "A solicitar..." : "Pedir novo comprovativo"}
                </button>
              </div>
              {!canDecide ? <p className="mt-3 text-xs text-[var(--color-text-secondary)]">A tua role permite acompanhar a fila, mas a decisao final exige SUPER_ADMIN ou FINANCE_MANAGER.</p> : null}
            </section>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-text-secondary)]">Seleciona uma submissao para abrir a analise.</p>
        )}
      </div>
    </aside>
  );
}

export function PaymentsManagementView() {
  const { hasAccess, effectiveRole } = useAdminAuth();
  const searchParams = useSearchParams();
  const initialQueue = (searchParams.get("queue") || "SUBMITTED") as PaymentSubmissionQueue;
  const initialSearch = searchParams.get("orderId") || "";
  const [activeQueue, setActiveQueue] = useState<PaymentSubmissionQueue>(
    QUEUES.some((queue) => queue.key === initialQueue) ? initialQueue : "SUBMITTED"
  );
  const [stats, setStats] = useState<PaymentSubmissionQueueStats | null>(null);
  const [submissionsPage, setSubmissionsPage] = useState<PaymentSubmissionsPage | null>(null);
  const [awaitingPage, setAwaitingPage] = useState<AwaitingPaymentSubmissionsPage | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<PaymentSubmission | null>(null);
  const [search, setSearch] = useState(initialSearch);
  const [note, setNote] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [newPayment, setNewPayment] = useState<PaymentSubmission | null>(null);
  const previousSubmittedCountRef = useRef<number | null>(null);

  const canDecide = effectiveRole === "SUPER_ADMIN" || effectiveRole === "FINANCE_MANAGER";

  async function load(queue = activeQueue, options: { silent?: boolean } = {}) {
    if (!options.silent) setIsLoading(true);
    setError("");
    try {
      const queueStats = await adminApiFetch<PaymentSubmissionQueueStats>("/api/admin/payment-submissions/queues");
      const previousSubmitted = previousSubmittedCountRef.current;
      if (previousSubmitted !== null && queueStats.submitted > previousSubmitted) {
        const latest = await adminApiFetch<PaymentSubmissionsPage>("/api/admin/payment-submissions?queue=SUBMITTED&page=0&size=1");
        const latestItem = pageFrom<PaymentSubmission>(latest).content[0] ?? null;
        setNewPayment(latestItem);
        setFeedback({
          tone: "success",
          message: `Novo comprovativo recebido de ${latestItem?.customerName || latestItem?.payerName || "cliente"}.`,
        });
        if (process.env.NODE_ENV !== "production") {
          try {
            const audio = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=");
            void audio.play().catch(() => null);
          } catch {}
        }
      }
      previousSubmittedCountRef.current = queueStats.submitted;
      setStats(queueStats);
      if (queue === "AWAITING_SUBMISSION") {
        const list = await adminApiFetch<AwaitingPaymentSubmissionsPage>("/api/admin/payment-submissions/awaiting?page=0&size=50");
        setAwaitingPage(pageFrom<PaymentAwaitingSubmission>(list));
        setSubmissionsPage(null);
      } else {
        const list = await adminApiFetch<PaymentSubmissionsPage>(`/api/admin/payment-submissions?queue=${queue}&page=0&size=50`);
        setSubmissionsPage(pageFrom<PaymentSubmission>(list));
        setAwaitingPage(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Nao foi possivel carregar a fila financeira.");
    } finally {
      if (!options.silent) setIsLoading(false);
    }
  }

  useEffect(() => {
    if (hasAccess("payments")) {
      void load(activeQueue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQueue, hasAccess]);

  useAdminLiveRefresh(
    () => load(activeQueue, { silent: true }),
    { enabled: hasAccess("payments"), intervalMs: 8_000, minIntervalMs: 4_000, runOnMount: false }
  );

  async function openDetail(id: number) {
    setSelectedId(id);
    setIsDetailLoading(true);
    setNote("");
    try {
      const detail = await adminApiFetch<PaymentSubmission>(`/api/admin/payment-submissions/${id}`);
      setSelected(detail);
      setNote(detail.reviewNote || "");
    } catch (detailError) {
      setFeedback({ tone: "error", message: detailError instanceof Error ? detailError.message : "Nao foi possivel abrir a submissao." });
    } finally {
      setIsDetailLoading(false);
    }
  }

  async function handleAction(action: "review" | "approve" | "reject" | "flag" | "request-new-proof") {
    if (!selected) return;
    if ((action === "reject" || action === "request-new-proof") && !note.trim()) {
      setFeedback({ tone: "error", message: action === "reject" ? "Indica o motivo da rejeição." : "Indica o motivo para pedir novo comprovativo." });
      return;
    }
    const critical = action === "approve" || action === "reject" || action === "flag" || action === "request-new-proof";
    if (critical) {
      const ok = window.confirm(
        action === "approve"
          ? "Confirmar aprovação deste pagamento?"
          : action === "reject"
            ? "Confirmar rejeição deste pagamento?"
            : action === "flag"
              ? "Marcar este pagamento como suspeito?"
              : "Pedir novo comprovativo ao cliente?"
      );
      if (!ok) return;
    }
    setBusyAction(action);
    try {
      const updated = await adminApiFetch<PaymentSubmission>(`/api/admin/payment-submissions/${selected.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ note: note.trim() || null }),
      });
      setSelected(updated);
      setFeedback({
        tone: "success",
        message:
          action === "approve" ? "Pagamento aprovado"
            : action === "reject" ? "Pagamento rejeitado"
            : action === "flag" ? "Pagamento marcado como suspeito"
            : action === "request-new-proof" ? "Novo comprovativo solicitado"
            : "Revisao iniciada",
      });
      await load(activeQueue);
    } catch (actionError) {
      setFeedback({ tone: "error", message: actionError instanceof Error ? actionError.message : "Nao foi possivel processar a acao." });
    } finally {
      setBusyAction(null);
    }
  }

  const filteredSubmissions = useMemo(() => {
    const query = search.trim().toLowerCase();
    const content = submissionsPage?.content ?? [];
    if (!query) return content;
    return content.filter((item) => [
      item.orderCode,
      item.orderId,
      item.payerName,
      item.payerPhone,
      item.transactionReference,
      item.paymentMethod,
    ].some((value) => String(value ?? "").toLowerCase().includes(query)));
  }, [search, submissionsPage]);

  const filteredAwaiting = useMemo(() => {
    const query = search.trim().toLowerCase();
    const content = awaitingPage?.content ?? [];
    if (!query) return content;
    return content.filter((item) => [
      item.orderCode,
      item.orderId,
      item.customerName,
      item.customerEmail,
    ].some((value) => String(value ?? "").toLowerCase().includes(query)));
  }, [awaitingPage, search]);

  if (!hasAccess("payments")) {
    return null;
  }

  return (
    <div className="space-y-6">
      <section className="sticky top-[88px] z-10 rounded-[28px] border border-[var(--color-border)] bg-[color:var(--color-surface-overlay)]/95 px-6 py-5 backdrop-blur-xl">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-danger)]">Financeiro operacional</p>
            <h1 className="mt-2 font-[family-name:var(--font-sora)] text-3xl font-semibold text-[var(--color-text-primary)]">Validação de pagamentos</h1>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Fila semi-manual para rever submissões, comprovativos e riscos antes de marcar pedidos como pagos.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="admin-input min-w-[280px]" placeholder="Pesquisar pedido, telefone ou referencia" />
            <button type="button" onClick={() => void load()} className="admin-button-muted">Actualizar</button>
          </div>
        </div>
      </section>

      {error ? <AdminBanner tone="error" message={error} /> : null}

      <HighlightNewPayment
        submission={newPayment}
        onOpen={() => {
          if (!newPayment?.id) return;
          setNewPayment(null);
          void openDetail(newPayment.id);
        }}
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        {QUEUES.map((queue) => {
          const active = activeQueue === queue.key;
          const count = queueCount(stats, queue.key);
          return (
            <button
              key={queue.key}
              type="button"
              onClick={() => setActiveQueue(queue.key)}
              aria-pressed={active}
              className={`admin-card p-4 text-left transition ${
                active
                  ? "border-[var(--color-warning)] bg-[color:var(--color-surface-overlay)] shadow-[0_0_0_1px_rgba(245,158,11,0.9)]"
                  : "hover:border-[var(--color-border-strong)]"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">{queue.label}</p>
                <div className="flex items-center gap-2">
                  {active ? (
                    <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-warning)] shadow-[0_0_0_4px_rgba(245,158,11,0.16)]" aria-label="Categoria selecionada" />
                  ) : null}
                  <ActionDot visible={queue.needsAction && count > 0} />
                </div>
              </div>
              <p className="mt-3 font-[family-name:var(--font-sora)] text-3xl font-semibold text-[var(--color-text-primary)]">{count}</p>
            </button>
          );
        })}
      </section>

      <section className="relative min-h-[420px]">
        {isLoading ? (
          <AdminCardListSkeleton rows={4} />
        ) : activeQueue === "AWAITING_SUBMISSION" ? (
          <div className="space-y-4">
            {filteredAwaiting.length ? filteredAwaiting.map((item) => <AwaitingCard key={item.orderId} item={item} />) : <AdminBanner message={QUEUES.find((q) => q.key === activeQueue)?.empty || "Fila vazia"} />}
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="space-y-4">
              {filteredSubmissions.length ? filteredSubmissions.map((item) => (
                <SubmissionCard key={item.id} item={item} selected={selectedId === item.id} onClick={() => void openDetail(item.id)} />
              )) : <AdminBanner message={QUEUES.find((q) => q.key === activeQueue)?.empty || "Fila vazia"} />}
            </div>
            <div className="hidden xl:block">
              <div className="sticky top-[210px] rounded-[28px] border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-5">
                <p className="font-[family-name:var(--font-sora)] text-lg font-semibold text-[var(--color-text-primary)]">Painel de revisão</p>
                <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">Seleciona uma submissão para abrir o drawer com comprovativo, riscos, histórico e ações financeiras.</p>
              </div>
            </div>
          </div>
        )}
      </section>

      {selectedId ? (
        <SubmissionDrawer
          submission={selected}
          isLoading={isDetailLoading}
          note={note}
          setNote={setNote}
          onClose={() => {
            setSelectedId(null);
            setSelected(null);
          }}
          onAction={handleAction}
          busyAction={busyAction}
          canDecide={canDecide}
        />
      ) : null}

      <AdminFeedbackDock feedback={feedback} onClose={() => setFeedback(null)} />
    </div>
  );
}
