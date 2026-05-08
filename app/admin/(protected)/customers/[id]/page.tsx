"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { adminApiFetch } from "@/lib/admin/api-client";
import { formatMoney } from "@/lib/admin/format";
import type {
  AdminCustomer,
  CustomerActivity,
  CustomerNote,
  CustomerOrderSummary,
} from "@/lib/admin/types";

// ── Avatar helpers ─────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "#E8431A","#2563EB","#16A34A","#D97706","#7C3AED",
  "#DB2777","#0891B2","#059669","#B45309","#4F46E5",
];

function avatarColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-MZ", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-MZ", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function isTopBuyer(c: AdminCustomer) { return c.orderCount >= 3; }

// ── Status helpers ─────────────────────────────────────────────────────────

const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: "Criado", UNDER_REVIEW: "Em análise", QUOTED: "Cotado",
  APPROVED: "Aprovado", PENDING_PAYMENT: "Aguarda pag.", PAID: "Pago",
  PROCESSING: "A processar", ORDERED: "Encomendado", SHIPPED: "Enviado",
  IN_TRANSIT: "Em trânsito", ARRIVED: "Chegou",
  OUT_FOR_DELIVERY: "A entregar", DELIVERED: "Entregue", CANCELLED: "Cancelado",
};

const ORDER_STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  PAID:       { bg: "#EAF3DE", text: "#173404" },
  DELIVERED:  { bg: "#EAF3DE", text: "#173404" },
  SHIPPED:    { bg: "#DBEAFE", text: "#1E3A5F" },
  IN_TRANSIT: { bg: "#DBEAFE", text: "#1E3A5F" },
  CANCELLED:  { bg: "#FFF5F5", text: "#B42318" },
  PENDING:    { bg: "#F3F4F6", text: "#374151" },
};

function orderStatusStyle(status: string) {
  return ORDER_STATUS_COLOR[status] ?? { bg: "#FEF3C7", text: "#7B3C00" };
}

const ORDER_TYPE_LABEL: Record<string, string> = {
  EXTERNAL: "Ext.",
  INTERNAL: "Int.",
};

const STORE_LABEL: Record<string, string> = {
  SHEIN: "SHEIN", AMAZON: "Amazon", TEMU: "Temu", BASH: "BASH",
  MAKRO: "Makro", MR_PRICE: "Mr Price", ALI_EXPRESS: "AliExpress",
  ALI_BABA: "Alibaba", BUFFALO: "Buffalo", ZARA: "Zara", ASOS: "ASOS", EBAY: "eBay",
};

// ── Icons ──────────────────────────────────────────────────────────────────

function ArrowLeft(p: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}><polyline points="19 12 5 12"/><polyline points="12 5 5 12 12 19"/></svg>;
}
function CheckIcon(p: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}><polyline points="20 6 9 17 4 12"/></svg>;
}
function XIcon(p: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
}
function ChevronLeft(p: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}><polyline points="15 18 9 12 15 6"/></svg>;
}
function ChevronRight(p: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}><polyline points="9 18 15 12 9 6"/></svg>;
}
function MapPinIcon(p: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>;
}
function ShoppingBagIcon(p: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>;
}
function ActivityIcon(p: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
}
function UserIcon(p: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
}
function ExternalLinkIcon(p: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>;
}

// ── Avatar ─────────────────────────────────────────────────────────────────

function AvatarDisplay({ customer, size = 72 }: { customer: AdminCustomer; size?: number }) {
  const [imgFailed, setImgFailed] = useState(false);
  const color = avatarColor(customer.name);
  const init = initials(customer.name);

  if (customer.avatarUrl && !imgFailed) {
    return (
      <img
        src={customer.avatarUrl}
        alt={customer.name}
        width={size} height={size}
        className="rounded-full object-cover ring-4 ring-white shadow-md"
        style={{ width: size, height: size, flexShrink: 0 }}
        onError={() => setImgFailed(true)}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-full text-white font-black ring-4 ring-white shadow-md"
      style={{ width: size, height: size, background: color, fontSize: size * 0.33, flexShrink: 0, fontFamily: "'Sora',sans-serif" }}
    >
      {init}
    </div>
  );
}

// ── Suspend modal ──────────────────────────────────────────────────────────

function SuspendModal({ customer, onClose, onDone }: { customer: AdminCustomer; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const isSuspending = !customer.suspended;

  async function submit() {
    setSaving(true); setErr("");
    try {
      await adminApiFetch(`/api/admin/customers/${customer.id}/suspend`, {
        method: "PUT",
        body: JSON.stringify({ reason, suspend: isSuspending }),
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao alterar estado.");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-[28px] bg-[var(--color-surface)] p-7 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="mb-2 font-[family-name:var(--font-sora)] text-xl font-semibold">
          {isSuspending ? "Suspender conta" : "Reactivar conta"}
        </h2>
        <p className="mb-5 text-sm text-[var(--color-text-secondary)]">
          {isSuspending
            ? `A conta de ${customer.name} será suspensa.`
            : `A conta de ${customer.name} será reactivada.`}
        </p>
        {isSuspending && (
          <textarea
            className="admin-input w-full mb-3 resize-none"
            rows={3} placeholder="Motivo (opcional)"
            value={reason} onChange={e => setReason(e.target.value)}
          />
        )}
        {err && <p className="mb-3 text-xs text-[var(--color-danger)]">{err}</p>}
        <div className="flex gap-3">
          <button
            type="button" onClick={() => void submit()} disabled={saving}
            className="flex-1 rounded-[16px] py-2.5 text-sm font-bold text-white transition"
            style={{ background: isSuspending ? "#E8431A" : "#16A34A" }}
          >
            {saving ? "A processar…" : isSuspending ? "Confirmar suspensão" : "Confirmar reactivação"}
          </button>
          <button type="button" onClick={onClose} className="admin-button-muted px-4">Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ── Orders tab ─────────────────────────────────────────────────────────────

function OrdersTab({ customerId }: { customerId: number }) {
  const [orders, setOrders] = useState<CustomerOrderSummary[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const load = useCallback(async (p = 0) => {
    setLoading(true);
    try {
      const data = await adminApiFetch<{ content: CustomerOrderSummary[]; totalPages: number }>(
        `/api/admin/customers/${customerId}/orders?page=${p}&size=8`
      );
      setOrders(data?.content ?? []);
      setTotalPages(data?.totalPages ?? 1);
      setPage(p);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [customerId]);

  useEffect(() => {
    void load(0);
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-2 p-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-[16px] bg-[var(--color-background-secondary)]" />
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ShoppingBagIcon className="mb-3 h-10 w-10 text-[var(--color-text-tertiary)]" />
        <p className="font-semibold text-[var(--color-text-secondary)]">Sem pedidos</p>
        <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Este cliente ainda não fez nenhum pedido.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div
        className="grid items-center gap-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] rounded-[14px]"
        style={{ gridTemplateColumns: "60px 1fr 120px 140px 120px", background: "var(--color-background-secondary)", color: "var(--color-text-tertiary)" }}
      >
        <span>#ID</span>
        <span>Tipo / Loja</span>
        <span>Data</span>
        <span className="text-right">Total</span>
        <span className="text-center">Estado</span>
      </div>

      {orders.map(o => {
        const st = orderStatusStyle(o.status);
        return (
          <div
            key={o.id}
            className="grid cursor-pointer items-center gap-2 rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 transition hover:border-[#E8431A]/30 hover:bg-[rgba(232,67,26,0.03)]"
            style={{ gridTemplateColumns: "60px 1fr 120px 140px 120px" }}
            onClick={() => router.push(`/admin/orders/${o.id}`)}
          >
            <span className="font-[family-name:var(--font-sora)] text-sm font-bold" style={{ color: "#E8431A" }}>#{o.id}</span>
            <div>
              <span className="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>
                {ORDER_TYPE_LABEL[o.type] ?? o.type}
                {o.sourceStore ? ` · ${STORE_LABEL[o.sourceStore] ?? o.sourceStore}` : ""}
              </span>
            </div>
            <span className="text-xs text-[var(--color-text-secondary)]">{fmtDate(o.orderDate)}</span>
            <span className="text-right font-[family-name:var(--font-sora)] text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>
              {formatMoney(o.totalAmount)}
            </span>
            <div className="flex justify-center">
              <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: st.bg, color: st.text }}>
                {ORDER_STATUS_LABEL[o.status] ?? o.status}
              </span>
            </div>
          </div>
        );
      })}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-1 pt-2">
          <button
            type="button" disabled={page === 0}
            onClick={() => void load(page - 1)}
            className="rounded-xl p-1.5 disabled:opacity-30 hover:bg-[var(--color-background-secondary)]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i).map(n => (
            <button
              key={n} type="button"
              onClick={() => void load(n)}
              className="flex h-7 w-7 items-center justify-center rounded-xl text-xs font-semibold transition"
              style={{ background: n === page ? "#E8431A" : "transparent", color: n === page ? "white" : "var(--color-text-secondary)" }}
            >
              {n + 1}
            </button>
          ))}
          <button
            type="button" disabled={page >= totalPages - 1}
            onClick={() => void load(page + 1)}
            className="rounded-xl p-1.5 disabled:opacity-30 hover:bg-[var(--color-background-secondary)]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Activity tab ───────────────────────────────────────────────────────────

const ACTIVITY_ICON_MAP: Record<string, string> = {
  REGISTER: "👤",
  ORDER_CREATED: "🛒",
  PAYMENT: "💳",
  DELIVERY: "📦",
  CANCELLED: "❌",
};

const ACTIVITY_COLOR_MAP: Record<string, { dot: string; bg: string }> = {
  REGISTER:      { dot: "#2563EB", bg: "#DBEAFE" },
  ORDER_CREATED: { dot: "#E8431A", bg: "#FFF0EC" },
  PAYMENT:       { dot: "#16A34A", bg: "#EAF3DE" },
  DELIVERY:      { dot: "#7C3AED", bg: "#EDE9FE" },
  CANCELLED:     { dot: "#B42318", bg: "#FFF5F5" },
};

function ActivityTab({ customerId }: { customerId: number }) {
  const [activities, setActivities] = useState<CustomerActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApiFetch<CustomerActivity[]>(`/api/admin/customers/${customerId}/activity`)
      .then(d => setActivities(d ?? []))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [customerId]);

  if (loading) {
    return (
      <div className="space-y-3 p-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <div className="h-8 w-8 animate-pulse rounded-full bg-[var(--color-background-secondary)]" />
            <div className="flex-1 space-y-1.5 pt-1">
              <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--color-background-secondary)]" />
              <div className="h-2.5 w-1/3 animate-pulse rounded bg-[var(--color-background-secondary)]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ActivityIcon className="mb-3 h-10 w-10 text-[var(--color-text-tertiary)]" />
        <p className="text-sm text-[var(--color-text-secondary)]">Sem actividade registada.</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-4 top-4 bottom-4 w-px bg-[var(--color-border)]" />
      <div className="space-y-1">
        {activities.map((a, idx) => {
          const colors = ACTIVITY_COLOR_MAP[a.type] ?? { dot: "#6B7280", bg: "#F3F4F6" };
          const emoji = ACTIVITY_ICON_MAP[a.type] ?? a.icon ?? "•";
          return (
            <div key={a.id} className={`flex gap-4 ${idx > 0 ? "pt-4" : ""}`}>
              {/* Dot */}
              <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm" style={{ background: colors.bg }}>
                {emoji}
              </div>
              {/* Content */}
              <div className="flex-1 pb-0">
                <p className="text-sm font-medium leading-5" style={{ color: "var(--color-text-primary)" }}>{a.description}</p>
                <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{fmtDateTime(a.date)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

type Tab = "orders" | "activity";

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const customerId = Number(id);

  const [customer, setCustomer] = useState<AdminCustomer | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [tab, setTab] = useState<Tab>("orders");
  const [notes, setNotes] = useState<CustomerNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const [suspendModal, setSuspendModal] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function toast(msg: string, ok: boolean) {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setFeedback({ msg, ok });
    feedbackTimer.current = setTimeout(() => setFeedback(null), 3500);
  }

  // ── Load customer ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!customerId) return;
    adminApiFetch<AdminCustomer>(`/api/admin/customers/${customerId}`)
      .then(d => setCustomer(d))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [customerId]);

  // ── Load notes ────────────────────────────────────────────────────────
  const loadNotes = useCallback(async () => {
    setNotesLoading(true);
    try {
      const data = await adminApiFetch<CustomerNote[]>(`/api/admin/customers/${customerId}/notes`);
      setNotes(data ?? []);
    } catch {
      // ignore
    } finally {
      setNotesLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  // ── Actions ───────────────────────────────────────────────────────────
  async function handleVerify() {
    if (!customer) return;
    setVerifying(true);
    try {
      await adminApiFetch(`/api/admin/customers/${customer.id}/verify`, { method: "PUT" });
      setCustomer(prev => prev ? { ...prev, emailVerified: true, verificationCompleted: true } : prev);
      toast("Conta verificada com sucesso.", true);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao verificar.", false);
    } finally { setVerifying(false); }
  }

  async function submitNote() {
    if (!customer || !note.trim()) return;
    setSavingNote(true);
    try {
      await adminApiFetch(`/api/admin/customers/${customer.id}/notes`, {
        method: "POST",
        body: JSON.stringify({ content: note.trim() }),
      });
      setNote("");
      await loadNotes();
    } catch { /* ignore */ } finally { setSavingNote(false); }
  }

  // ── Loading / not found ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-8 w-40 animate-pulse rounded-xl bg-[var(--color-background-secondary)]" />
        <div className="h-48 animate-pulse rounded-[28px] bg-[var(--color-background-secondary)]" />
        <div className="grid grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-24 animate-pulse rounded-[24px] bg-[var(--color-background-secondary)]" />)}
        </div>
      </div>
    );
  }

  if (notFound || !customer) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <UserIcon className="mb-4 h-12 w-12 text-[var(--color-text-tertiary)]" />
        <p className="font-[family-name:var(--font-sora)] text-xl font-semibold">Cliente não encontrado</p>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">O perfil solicitado não existe ou foi removido.</p>
        <button type="button" onClick={() => router.back()} className="admin-button-muted mt-6">
          ← Voltar
        </button>
      </div>
    );
  }

  const top = isTopBuyer(customer);
  const avgTicket = customer.orderCount > 0 ? customer.totalOrderValue / customer.orderCount : 0;
  const color = avatarColor(customer.name);

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => router.push("/admin/customers")}
          className="flex items-center gap-1.5 rounded-[12px] px-3 py-1.5 font-medium text-[var(--color-text-secondary)] transition hover:bg-[var(--color-background-secondary)] hover:text-[var(--color-text-primary)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Clientes
        </button>
        <span className="text-[var(--color-text-tertiary)]">/</span>
        <span className="font-medium text-[var(--color-text-primary)] truncate max-w-[200px]">{customer.name}</span>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`rounded-[20px] border px-5 py-3.5 text-sm font-medium ${feedback.ok ? "border-[#BBF7D0] bg-[#F0FFF4] text-[#166534]" : "border-[rgba(232,67,26,0.2)] bg-[rgba(232,67,26,0.07)] text-[var(--color-danger)]"}`}>
          {feedback.msg}
        </div>
      )}

      {/* Profile header card */}
      <div className="admin-card overflow-hidden">
        {/* Top color strip */}
        <div className="h-24 w-full" style={{ background: `linear-gradient(135deg, ${color}22 0%, ${color}44 100%)` }} />
        <div className="relative px-6 pb-6">
          {/* Avatar overlapping strip */}
          <div className="absolute -top-10">
            <AvatarDisplay customer={customer} size={80} />
          </div>

          {/* Suspended banner */}
          {customer.suspended && (
            <div className="mb-3 mt-2 flex items-center gap-2 rounded-[14px] border border-[rgba(232,67,26,0.3)] bg-[rgba(232,67,26,0.07)] px-4 py-2.5 text-sm font-semibold text-[var(--color-danger)]">
              ⚠️ Esta conta está suspensa
            </div>
          )}

          {/* Name + badges row */}
          <div className="flex flex-col gap-3 pt-12 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-[family-name:var(--font-sora)] text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
                  {customer.name}
                </h1>
                {top && (
                  <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: "#FAEEDA", color: "#B45309" }}>⭐ Top comprador</span>
                )}
                {customer.suspended && (
                  <span className="rounded-full bg-[#FFF5F5] px-2.5 py-0.5 text-xs font-bold text-[var(--color-danger)]">SUSPENSO</span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">{customer.email}</p>
              {customer.phoneNumber && (
                <p className="mt-0.5 text-sm text-[var(--color-text-tertiary)]">{customer.phoneNumber}</p>
              )}
              {customer.alternativePhoneNumber && (
                <p className="text-xs text-[var(--color-text-tertiary)]">Alt: {customer.alternativePhoneNumber}</p>
              )}
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-1.5 shrink-0">
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${customer.emailVerified ? "bg-[#EAF3DE] text-[#173404]" : "bg-[var(--color-background-secondary)] text-[var(--color-text-secondary)]"}`}>
                {customer.emailVerified ? <CheckIcon className="h-3 w-3" /> : <XIcon className="h-3 w-3" />}
                {customer.emailVerified ? "Email verificado" : "Email não verificado"}
              </span>
              {customer.phoneVerified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#EAF3DE] px-2.5 py-1 text-xs font-semibold text-[#173404]">
                  <CheckIcon className="h-3 w-3" />
                  Telefone verificado
                </span>
              )}
              <span className="inline-flex rounded-full bg-[var(--color-background-secondary)] px-2.5 py-1 text-xs text-[var(--color-text-secondary)]">
                Membro desde {fmtDate(customer.createdAt)}
              </span>
              {customer.provider && customer.provider !== "LOCAL" && (
                <span className="inline-flex rounded-full bg-[var(--color-background-secondary)] px-2.5 py-1 text-xs text-[var(--color-text-secondary)]">
                  via {customer.provider}
                </span>
              )}
            </div>
          </div>

          {/* Profile completion */}
          {customer.profileCompletionPercentage < 100 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-[var(--color-text-tertiary)]">Perfil completo</span>
                <span className="text-xs font-semibold" style={{ color: customer.profileCompletionPercentage >= 70 ? "#16A34A" : "#B45309" }}>
                  {customer.profileCompletionPercentage}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-[var(--color-background-secondary)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${customer.profileCompletionPercentage}%`,
                    background: customer.profileCompletionPercentage >= 70 ? "#16A34A" : "#E8431A",
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="admin-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Pedidos</p>
          <p className="mt-1 font-[family-name:var(--font-sora)] text-3xl font-black" style={{ color: "var(--color-text-primary)" }}>{customer.orderCount}</p>
        </div>
        <div className="admin-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Total gasto</p>
          <p className="mt-1 font-[family-name:var(--font-sora)] text-xl font-black" style={{ color: "#E8431A" }}>{formatMoney(customer.totalOrderValue)}</p>
        </div>
        <div className="admin-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Ticket médio</p>
          <p className="mt-1 font-[family-name:var(--font-sora)] text-xl font-black" style={{ color: "var(--color-text-primary)" }}>{formatMoney(avgTicket)}</p>
        </div>
        <div className="admin-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Último pedido</p>
          <p className="mt-1 text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{fmtDate(customer.lastOrderDate)}</p>
        </div>
      </div>

      {/* Main content + sidebar */}
      <div className="flex gap-4 items-start">
        {/* Left: tabs */}
        <div className="min-w-0 flex-1">
          {/* Tab bar */}
          <div className="mb-4 flex gap-1 rounded-[18px] p-1" style={{ background: "var(--color-background-secondary)" }}>
            {([
              { key: "orders" as Tab, label: "Pedidos", icon: ShoppingBagIcon },
              { key: "activity" as Tab, label: "Actividade", icon: ActivityIcon },
            ]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-[14px] py-2.5 text-sm font-semibold transition"
                style={{
                  background: tab === key ? "var(--color-surface)" : "transparent",
                  color: tab === key ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                  boxShadow: tab === key ? "0 1px 4px rgba(0,0,0,0.06)" : "none",
                }}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="admin-card p-5">
            {tab === "orders" && <OrdersTab customerId={customer.id} />}
            {tab === "activity" && <ActivityTab customerId={customer.id} />}
          </div>
        </div>

        {/* Right: sidebar */}
        <div className="hidden shrink-0 xl:flex xl:flex-col xl:gap-4" style={{ width: 280, position: "sticky", top: 180 }}>
          {/* Delivery address */}
          <div className="admin-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <MapPinIcon className="h-4 w-4 text-[var(--color-danger)]" />
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Morada de entrega</p>
            </div>
            {customer.hasDeliveryAddress ? (
              <div className="space-y-2">
                <div className="rounded-[14px] border-2 p-3 text-xs leading-5" style={{ borderColor: "#E8431A", color: "var(--color-text-primary)" }}>
                  {customer.formattedDeliveryAddress || [
                    customer.deliveryCity,
                    customer.deliveryNeighborhood,
                    customer.deliveryStreet,
                    customer.houseNumber,
                  ].filter(Boolean).join(", ") || "—"}
                </div>
                {customer.deliveryReference && (
                  <p className="text-xs text-[var(--color-text-tertiary)]">Ref: {customer.deliveryReference}</p>
                )}
                {customer.googleMapsLink && (
                  <a
                    href={customer.googleMapsLink}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] hover:underline"
                  >
                    <ExternalLinkIcon className="h-3 w-3" />
                    Ver no mapa
                  </a>
                )}
              </div>
            ) : (
              <p className="text-xs text-[var(--color-text-tertiary)]">Sem morada registada.</p>
            )}
          </div>

          {/* Internal notes */}
          <div className="admin-card p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Notas internas</p>
            {notesLoading ? (
              <div className="space-y-2">
                {[1,2].map(i => <div key={i} className="h-12 animate-pulse rounded-[12px] bg-[var(--color-background-secondary)]" />)}
              </div>
            ) : notes.length === 0 ? (
              <p className="mb-3 text-xs text-[var(--color-text-tertiary)]">Sem notas.</p>
            ) : (
              <div className="mb-3 max-h-64 space-y-2 overflow-y-auto">
                {notes.map(n => (
                  <div key={n.id} className="rounded-[12px] bg-[var(--color-background-secondary)] p-3">
                    <p className="text-xs leading-5" style={{ color: "var(--color-text-primary)" }}>{n.content}</p>
                    <p className="mt-1 text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
                      {n.authorName} · {fmtDate(n.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <textarea
              className="admin-input w-full resize-none text-xs"
              rows={2} placeholder="Nova nota interna…"
              value={note} onChange={e => setNote(e.target.value)}
            />
            <button
              type="button"
              onClick={() => void submitNote()}
              disabled={savingNote || !note.trim()}
              className="admin-button-danger mt-2 w-full py-2 text-xs"
            >
              {savingNote ? "A guardar…" : "Guardar nota"}
            </button>
          </div>

          {/* Actions */}
          <div className="admin-card flex flex-col gap-2 p-5">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Acções</p>
            {!customer.emailVerified && (
              <button
                type="button"
                onClick={() => void handleVerify()}
                disabled={verifying}
                className="admin-button-muted w-full"
              >
                <CheckIcon className="inline h-4 w-4 mr-1.5" />
                {verifying ? "A verificar…" : "Verificar conta"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setSuspendModal(true)}
              className="rounded-[16px] border border-[var(--color-border)] py-2.5 text-sm font-semibold transition hover:bg-[rgba(232,67,26,0.06)] w-full"
              style={{ color: customer.suspended ? "#16A34A" : "#E8431A" }}
            >
              {customer.suspended ? "Reactivar conta" : "Suspender conta"}
            </button>
          </div>
        </div>
      </div>

      {/* Suspend modal */}
      {suspendModal && (
        <SuspendModal
          customer={customer}
          onClose={() => setSuspendModal(false)}
          onDone={() => {
            const wasSuspended = customer.suspended;
            setSuspendModal(false);
            setCustomer(prev => prev ? { ...prev, suspended: !wasSuspended } : prev);
            toast(wasSuspended ? "Conta reactivada." : "Conta suspensa.", true);
          }}
        />
      )}
    </div>
  );
}
