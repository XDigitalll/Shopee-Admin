"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminListLoadingOverlay } from "@/components/admin/feedback-state";
import { adminApiFetch } from "@/lib/admin/api-client";
import { formatMoney } from "@/lib/admin/format";
import type {
  AdminCustomer,
  CustomerNote,
  CustomerOrderSummary,
  CustomerStats,
  CustomersPageResponse,
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

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-MZ", { day: "2-digit", month: "short", year: "numeric" });
}

function isTopBuyer(c: AdminCustomer) { return c.orderCount >= 3; }

// ── Icons ──────────────────────────────────────────────────────────────────

function UsersIcon(p: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
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
function SearchIcon(p: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
}
function DownloadIcon(p: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
}

// ── Avatar component ───────────────────────────────────────────────────────

function Avatar({ customer, size = 36 }: { customer: AdminCustomer; size?: number }) {
  const [imgFailed, setImgFailed] = useState(false);
  const color = avatarColor(customer.name);
  const init = initials(customer.name);

  if (customer.avatarUrl && !imgFailed) {
    return (
      <img
        src={customer.avatarUrl}
        alt={customer.name}
        width={size} height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size, flexShrink: 0 }}
        onError={() => setImgFailed(true)}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-full text-white font-black"
      style={{ width: size, height: size, background: color, fontSize: size * 0.35, flexShrink: 0, fontFamily: "'Sora',sans-serif" }}
    >
      {init}
    </div>
  );
}

// ── Invite modal ───────────────────────────────────────────────────────────

function InviteModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (!email.trim()) { setErr("Insere um email."); return; }
    setSaving(true); setErr("");
    try {
      await adminApiFetch("/api/admin/customers/invite", { method: "POST", body: JSON.stringify({ email: email.trim() }) });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao enviar convite.");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-[28px] bg-[var(--color-surface)] p-7 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="mb-4 font-[family-name:var(--font-sora)] text-xl font-semibold">Convidar cliente</h2>
        <p className="mb-5 text-sm text-[var(--color-text-secondary)]">Envia um convite por email para um novo cliente.</p>
        <input
          className="admin-input w-full mb-3"
          type="email" placeholder="email@exemplo.com"
          value={email} onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === "Enter" && void submit()}
          autoFocus
        />
        {err && <p className="mb-3 text-xs text-[var(--color-danger)]">{err}</p>}
        <div className="flex gap-3 mt-2">
          <button type="button" onClick={() => void submit()} disabled={saving} className="admin-button-danger flex-1">
            {saving ? "A enviar…" : "Enviar convite"}
          </button>
          <button type="button" onClick={onClose} className="admin-button-muted px-4">Cancelar</button>
        </div>
      </div>
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
            ? `A conta de ${customer.name} será suspensa. O cliente não conseguirá iniciar sessão.`
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

// ── Stats cards ────────────────────────────────────────────────────────────

function StatsCards({ stats }: { stats: CustomerStats | null }) {
  const cards = [
    { label: "Total de clientes", value: stats?.total ?? "—", color: "#374151", bg: "var(--color-background-secondary)" },
    { label: "Verificados", value: stats?.verified ?? "—", color: "#16A34A", bg: "#EAF3DE" },
    { label: "Novos este mês", value: stats?.newThisMonth ?? "—", color: "#2563EB", bg: "#DBEAFE" },
    { label: "Top compradores", value: stats?.topBuyers ?? "—", color: "#B45309", bg: "#FAEEDA" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map(card => (
        <div key={card.label} className="rounded-[24px] p-5" style={{ background: card.bg }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: card.color, opacity: 0.7 }}>
            {card.label}
          </p>
          <p className="mt-1.5 font-[family-name:var(--font-sora)] text-3xl font-black" style={{ color: card.color }}>
            {stats ? card.value : <span className="inline-block h-8 w-16 animate-pulse rounded-lg bg-current opacity-10" />}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Side panel ─────────────────────────────────────────────────────────────

type PanelState = {
  customer: AdminCustomer | null;
  orders: CustomerOrderSummary[];
  notes: CustomerNote[];
  notesLoaded: boolean;
  loadingOrders: boolean;
};

function SidePanel({
  state, onClose, onVerify, onSuspend, onNoteAdded,
}: {
  state: PanelState;
  onClose: () => void;
  onVerify: (id: number) => void;
  onSuspend: (c: AdminCustomer) => void;
  onNoteAdded: (id: number) => void;
}) {
  const router = useRouter();
  const { customer, orders, notes, notesLoaded, loadingOrders } = state;
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  async function submitNote() {
    if (!customer || !note.trim()) return;
    setSavingNote(true);
    try {
      await adminApiFetch(`/api/admin/customers/${customer.id}/notes`, {
        method: "POST",
        body: JSON.stringify({ content: note.trim() }),
      });
      setNote("");
      onNoteAdded(customer.id);
    } catch { /* ignore */ } finally { setSavingNote(false); }
  }

  if (!customer) {
    return (
      <aside className="flex flex-col items-center justify-center py-20 text-center">
        <UsersIcon className="mb-3 h-12 w-12 text-[var(--color-text-tertiary)]" />
        <p className="font-semibold text-[var(--color-text-primary)]">Seleccione um cliente</p>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">para ver o perfil</p>
      </aside>
    );
  }

  const top = isTopBuyer(customer);
  const avgTicket = customer.orderCount > 0
    ? (customer.totalOrderValue / customer.orderCount)
    : 0;

  return (
    <aside className="flex flex-col gap-0 overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-5 pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar customer={customer} size={48} />
          <div className="min-w-0">
            <p className="font-[family-name:var(--font-sora)] font-bold leading-tight truncate" style={{ color: "var(--color-text-primary)" }}>
              {customer.name}
            </p>
            <p className="text-xs truncate" style={{ color: "var(--color-text-secondary)" }}>{customer.email}</p>
            {customer.phoneNumber && <p className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>{customer.phoneNumber}</p>}
          </div>
        </div>
        <button type="button" onClick={onClose} className="mt-0.5 rounded-full p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-background-secondary)]">
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5 px-5 pb-4">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${customer.emailVerified ? "bg-[#EAF3DE] text-[#173404]" : "bg-[var(--color-background-secondary)] text-[var(--color-text-secondary)]"}`}>
          {customer.emailVerified ? <CheckIcon className="h-3 w-3" /> : <XIcon className="h-3 w-3" />}
          {customer.emailVerified ? "Verificado" : "Não verificado"}
        </span>
        {customer.suspended && (
          <span className="inline-flex rounded-full bg-[#FFF5F5] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--color-danger)]">Suspenso</span>
        )}
        {top && (
          <span className="inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: "#FAEEDA", color: "#B45309" }}>⭐ Top comprador</span>
        )}
        {customer.accountStatus === "GUEST" && (
          <span className="inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: "#F3E8FF", color: "#6D28D9" }}>GUEST</span>
        )}
        {customer.accountStatus === "INCOMPLETO" && (
          <span className="inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: "#FEF3C7", color: "#92400E" }}>INCOMPLETO</span>
        )}
        {customer.accountStatus === "VERIFICADO" && !customer.suspended && (
          <span className="inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: "#ECFDF5", color: "#065F46" }}>VERIFICADO</span>
        )}
        <span className="inline-flex rounded-full bg-[var(--color-background-secondary)] px-2.5 py-0.5 text-[11px] text-[var(--color-text-secondary)]">
          Membro desde {fmtDate(customer.createdAt)}
        </span>
      </div>

      <div className="mx-5 border-t border-[var(--color-border)]" />

      {/* Summary */}
      <div className="grid grid-cols-2 gap-2 p-5">
        <div className="rounded-[16px] bg-[var(--color-background-secondary)] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Pedidos</p>
          <p className="mt-0.5 font-[family-name:var(--font-sora)] text-xl font-black" style={{ color: "var(--color-text-primary)" }}>{customer.orderCount}</p>
        </div>
        <div className="rounded-[16px] bg-[var(--color-background-secondary)] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Total gasto</p>
          <p className="mt-0.5 font-[family-name:var(--font-sora)] text-base font-black" style={{ color: "#E8431A" }}>
            {formatMoney(customer.totalOrderValue)}
          </p>
        </div>
        <div className="rounded-[16px] bg-[var(--color-background-secondary)] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Ticket médio</p>
          <p className="mt-0.5 font-[family-name:var(--font-sora)] text-base font-black" style={{ color: "var(--color-text-primary)" }}>
            {formatMoney(avgTicket)}
          </p>
        </div>
        <div className="rounded-[16px] bg-[var(--color-background-secondary)] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">Cidade</p>
          <p className="mt-0.5 text-sm font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>{customer.city || customer.deliveryCity || "—"}</p>
        </div>
      </div>

      <div className="mx-5 border-t border-[var(--color-border)]" />

      {/* Recent orders */}
      <div className="p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Últimos pedidos</p>
        {loadingOrders ? (
          <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 animate-pulse rounded-[12px] bg-[var(--color-background-secondary)]" />)}</div>
        ) : orders.length === 0 ? (
          <p className="text-xs text-[var(--color-text-tertiary)]">Sem pedidos.</p>
        ) : (
          <div className="space-y-1.5">
            {orders.slice(0, 5).map(o => {
              const st = orderStatusStyle(o.status);
              return (
                <div key={o.id} className="flex items-center justify-between rounded-[12px] bg-[var(--color-background-secondary)] px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-[family-name:var(--font-sora)] text-xs font-bold" style={{ color: "#E8431A" }}>#{o.id}</span>
                    <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{o.type === "EXTERNAL" ? "EXT" : "INT"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-[family-name:var(--font-sora)] text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(o.totalAmount)}</span>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: st.bg, color: st.text }}>
                      {ORDER_STATUS_LABEL[o.status] ?? o.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delivery address */}
      {customer.hasDeliveryAddress && (
        <>
          <div className="mx-5 border-t border-[var(--color-border)]" />
          <div className="p-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Morada de entrega</p>
            <div className="rounded-[14px] border-2 p-3 text-xs leading-5" style={{ borderColor: "#E8431A", color: "var(--color-text-primary)" }}>
              {customer.formattedDeliveryAddress || "—"}
            </div>
          </div>
        </>
      )}

      {/* Internal notes */}
      <div className="mx-5 border-t border-[var(--color-border)]" />
      <div className="p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Notas internas</p>
        {!notesLoaded ? (
          <div className="h-8 animate-pulse rounded-lg bg-[var(--color-background-secondary)]" />
        ) : notes.length === 0 ? (
          <p className="mb-3 text-xs text-[var(--color-text-tertiary)]">Sem notas.</p>
        ) : (
          <div className="mb-3 space-y-2">
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

      <div className="mx-5 border-t border-[var(--color-border)]" />

      {/* Actions */}
      <div className="flex flex-col gap-2 p-5">
        <button
          type="button"
          onClick={() => router.push(`/admin/customers/${customer.id}`)}
          className="admin-button-danger w-full"
        >
          Ver perfil completo →
        </button>
        {!customer.emailVerified && (
          <button
            type="button"
            onClick={() => onVerify(customer.id)}
            className="admin-button-muted w-full"
          >
            <CheckIcon className="inline h-4 w-4 mr-1.5" />
            Verificar conta
          </button>
        )}
        <button
          type="button"
          onClick={() => onSuspend(customer)}
          className="rounded-[16px] border border-[var(--color-border)] py-2.5 text-sm font-semibold transition hover:bg-[rgba(232,67,26,0.06)]"
          style={{ color: customer.suspended ? "#16A34A" : "#E8431A" }}
        >
          {customer.suspended ? "Reactivar conta" : "Suspender conta"}
        </button>
      </div>
    </aside>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

type PillFilter = "ALL" | "VERIFIED" | "UNVERIFIED" | "TOP" | "NEW";

type CustomerPanelSummaryResponse = {
  orders: CustomerOrderSummary[];
  notes: CustomerNote[];
  totalPages: number;
  totalElements: number;
};

export default function CustomersPage() {
  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalElements, setTotalElements] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const [pill, setPill] = useState<PillFilter>("ALL");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sort, setSort] = useState("recent");

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [panel, setPanel] = useState<PanelState>({
    customer: null, orders: [], notes: [], notesLoaded: false, loadingOrders: false,
  });

  const [showInvite, setShowInvite] = useState(false);
  const [suspendTarget, setSuspendTarget] = useState<AdminCustomer | null>(null);
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load stats ────────────────────────────────────────────────────────
  useEffect(() => {
    adminApiFetch<CustomerStats>("/api/admin/customers/stats")
      .then(d => setStats(d))
      .catch(() => null);
  }, []);

  // ── Load list ─────────────────────────────────────────────────────────
  const fetchCustomersPage = useCallback(async (p = 0) => {
    const params = new URLSearchParams({ sort, page: String(p), size: "10" });
    if (search) params.set("search", search);
    if (pill === "VERIFIED")   params.set("verified", "true");
    if (pill === "UNVERIFIED") params.set("verified", "false");
    if (pill === "TOP")        params.set("sort", "orders");
    if (pill === "NEW")        params.set("sort", "recent");

    return adminApiFetch<CustomersPageResponse>(`/api/admin/customers?${params}`);
  }, [search, sort, pill]);

  const loadCustomers = useCallback(async (p = 0) => {
    setLoading(true);
    try {
      const data = await fetchCustomersPage(p);
      setCustomers(data?.content ?? []);
      setTotalPages(data?.totalPages ?? 1);
      setTotalElements(data?.totalElements ?? 0);
      setPage(p);
    } catch { /* keep existing list */ } finally { setLoading(false); }
  }, [fetchCustomersPage]);

  useEffect(() => {
    void loadCustomers(0);
  }, [loadCustomers]);

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setPanel({
      customer: null,
      orders: [],
      notes: [],
      notesLoaded: false,
      loadingOrders: false,
    });
  }, []);

  const openCustomerPanel = useCallback((customer: AdminCustomer | null) => {
    if (!customer) {
      clearSelection();
      return;
    }

    setSelectedId(customer.id);
    setPanel({
      customer,
      orders: [],
      notes: [],
      notesLoaded: false,
      loadingOrders: true,
    });
  }, [clearSelection]);

  // ── Load panel details when selection changes ─────────────────────────
  useEffect(() => {
    if (selectedId === null) return;
    const customer = customers.find(c => c.id === selectedId) ?? null;
    if (!customer) return;

    adminApiFetch<CustomerPanelSummaryResponse>(`/api/admin/customers/${selectedId}/summary?size=5`)
      .then((payload) => {
      setPanel(prev => ({
        ...prev,
        orders: payload?.orders ?? [],
        notes: payload?.notes ?? [],
        notesLoaded: true,
        loadingOrders: false,
      }));
    }).catch(() => {
      setPanel(prev => ({
        ...prev,
        orders: [],
        notes: [],
        notesLoaded: true,
        loadingOrders: false,
      }));
    });
  }, [selectedId, customers]);

  // ── Search debounce ───────────────────────────────────────────────────
  function handleSearchInput(v: string) {
    setSearchInput(v);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setLoading(true);
      setSearch(v.trim());
    }, 400);
  }

  // ── Actions ───────────────────────────────────────────────────────────
  async function handleVerify(id: number) {
    try {
      await adminApiFetch(`/api/admin/customers/${id}/verify`, { method: "PUT" });
      setPanel((prev) => prev.customer?.id === id
        ? { ...prev, customer: { ...prev.customer, emailVerified: true, verificationCompleted: true } }
        : prev);
      setFeedback({ msg: "Conta verificada.", ok: true });
      await loadCustomers(page);
    } catch (e) {
      setFeedback({ msg: e instanceof Error ? e.message : "Erro.", ok: false });
    }
  }

  async function handleExport() {
    try {
      const res = await fetch("/api/admin/customers/export");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "clientes.csv"; a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  }

  function showFeedback(msg: string, ok: boolean) {
    setFeedback({ msg, ok });
    setTimeout(() => setFeedback(null), 3500);
  }

  const PILLS: { key: PillFilter; label: string }[] = [
    { key: "ALL",        label: "Todos" },
    { key: "VERIFIED",   label: "Verificados" },
    { key: "UNVERIFIED", label: "Não verificados" },
    { key: "TOP",        label: "Top compradores" },
    { key: "NEW",        label: "Novos" },
  ];

  const pageNumbers = Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i);

  return (
    <div className="space-y-5">
      {/* Header */}
      <section className="sticky top-[88px] z-10 rounded-[28px] border border-[var(--color-border)] bg-[color:var(--color-surface-overlay)]/95 px-6 py-5 backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">CRM</p>
            <div className="mt-1 flex items-center gap-3">
              <UsersIcon className="h-6 w-6 text-[var(--color-danger)]" />
              <h1 className="font-[family-name:var(--font-sora)] text-3xl font-semibold">Clientes</h1>
            </div>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              {totalElements > 0 ? `${totalElements} cliente${totalElements !== 1 ? "s" : ""} registado${totalElements !== 1 ? "s" : ""}` : "A carregar…"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void handleExport()} className="admin-button-muted flex items-center gap-2">
              <DownloadIcon className="h-4 w-4" />
              Exportar CSV
            </button>
            <button type="button" onClick={() => setShowInvite(true)} className="admin-button-danger">
              + Convidar cliente
            </button>
          </div>
        </div>
      </section>

      {/* Feedback */}
      {feedback && (
        <div className={`rounded-[20px] border px-5 py-3.5 text-sm font-medium ${feedback.ok ? "border-[#BBF7D0] bg-[#F0FFF4] text-[#166534]" : "border-[rgba(232,67,26,0.2)] bg-[rgba(232,67,26,0.07)] text-[var(--color-danger)]"}`}>
          {feedback.msg}
        </div>
      )}

      {/* Stats */}
      <StatsCards stats={stats} />

      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {PILLS.map(p => (
            <button
              key={p.key}
              type="button"
              onClick={() => { setLoading(true); setPill(p.key); setPage(0); }}
              className="rounded-full px-3.5 py-1.5 text-xs font-semibold transition"
              style={{
                background: pill === p.key ? "#E8431A" : "var(--color-background-secondary)",
                color: pill === p.key ? "white" : "var(--color-text-secondary)",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
            <input
              className="admin-input w-56 pl-10 pr-3 text-sm"
              placeholder="Nome, email ou telefone…"
              value={searchInput}
              onChange={e => handleSearchInput(e.target.value)}
            />
          </div>
          <select
            className="admin-input text-sm py-2"
            value={sort}
            onChange={e => { setLoading(true); setSort(e.target.value); setPage(0); }}
          >
            <option value="recent">Recente</option>
            <option value="totalSpent">Maior gasto</option>
            <option value="orders">Mais pedidos</option>
            <option value="az">A–Z</option>
          </select>
        </div>
      </div>

      {/* Main content: table + panel */}
      <div className="flex gap-4 items-start">
        {/* Table */}
        <div className="min-w-0 flex-1">
          <div className="admin-card relative overflow-hidden" aria-busy={loading}>
            {/* Table head */}
            <div
              className="grid items-center gap-2 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{
                gridTemplateColumns: "2fr 1fr 80px 110px 80px 110px 64px",
                background: "var(--color-background-secondary)",
                color: "var(--color-text-tertiary)",
              }}
            >
              <span>Cliente</span>
              <span>Telefone</span>
              <span className="text-center">Pedidos</span>
              <span className="text-right">Total gasto</span>
              <span className="text-center">Verif.</span>
              <span>Membro desde</span>
              <span />
            </div>

            {/* Rows */}
            {loading && customers.length === 0 ? (
              <div className="divide-y divide-[var(--color-border)]">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                    <div className="h-9 w-9 animate-pulse rounded-full bg-[var(--color-background-secondary)]" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-36 animate-pulse rounded bg-[var(--color-background-secondary)]" />
                      <div className="h-2.5 w-48 animate-pulse rounded bg-[var(--color-background-secondary)]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : customers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <UsersIcon className="mb-3 h-10 w-10 text-[var(--color-text-tertiary)]" />
                <p className="font-semibold text-[var(--color-text-secondary)]">Sem clientes encontrados</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {customers.map(c => {
                  const selected = selectedId === c.id;
                  const top = isTopBuyer(c);
                  return (
                    <div
                      key={c.id}
                      onClick={() => (selected ? clearSelection() : openCustomerPanel(c))}
                      className="grid cursor-pointer items-center gap-2 px-4 py-3 transition"
                      style={{
                        gridTemplateColumns: "2fr 1fr 80px 110px 80px 110px 64px",
                        background: selected ? "rgba(232,67,26,0.14)" : undefined,
                        boxShadow: selected ? "inset 3px 0 0 #E8431A" : undefined,
                        opacity: c.suspended ? 0.6 : 1,
                      }}
                      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = "var(--color-background-secondary)"; }}
                      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = ""; }}
                    >
                      {/* Customer col */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar customer={c} size={34} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-[family-name:var(--font-sora)] text-sm font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>{c.name}</span>
                            {top && <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ background: "#FAEEDA", color: "#B45309" }}>TOP</span>}
                            {c.suspended && <span className="rounded-full bg-[#FFF5F5] px-1.5 py-0.5 text-[9px] font-bold text-[var(--color-danger)]">SUSPENSO</span>}
                            {c.accountStatus === "GUEST" && <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ background: "#F3E8FF", color: "#6D28D9" }}>GUEST</span>}
                            {c.accountStatus === "INCOMPLETO" && <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ background: "#FEF3C7", color: "#92400E" }}>INCOMPLETO</span>}
                          </div>
                          <p className="truncate text-xs text-[var(--color-text-tertiary)]">{c.email}</p>
                        </div>
                      </div>

                      {/* Phone */}
                      <span className="text-xs text-[var(--color-text-secondary)] truncate">{c.phoneNumber || "—"}</span>

                      {/* Orders */}
                      <span className="text-center font-[family-name:var(--font-sora)] text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>{c.orderCount}</span>

                      {/* Total */}
                      <span className="text-right font-[family-name:var(--font-sora)] text-sm font-bold" style={{ color: "#E8431A" }}>{formatMoney(c.totalOrderValue)}</span>

                      {/* Verified */}
                      <div className="flex justify-center">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.emailVerified ? "bg-[#EAF3DE] text-[#173404]" : "bg-[var(--color-background-secondary)] text-[var(--color-text-tertiary)]"}`}>
                          {c.emailVerified ? <CheckIcon className="h-2.5 w-2.5" /> : <XIcon className="h-2.5 w-2.5" />}
                          {c.emailVerified ? "Sim" : "Não"}
                        </span>
                      </div>

                      {/* Since */}
                      <span className="text-xs text-[var(--color-text-secondary)]">{fmtDate(c.createdAt)}</span>

                      {/* Action */}
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          if (selected) {
                            clearSelection();
                            return;
                          }
                          openCustomerPanel(c);
                        }}
                        className="justify-self-end rounded-[12px] px-2.5 py-1.5 text-xs font-semibold transition hover:bg-[rgba(232,67,26,0.1)]"
                        style={{ color: "#E8431A" }}
                      >
                        Ver →
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-[var(--color-border)] px-4 py-3">
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  Página {page + 1} de {totalPages}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={loading || page === 0}
                    onClick={() => void loadCustomers(page - 1)}
                    className="rounded-xl p-1.5 disabled:opacity-30 hover:bg-[var(--color-background-secondary)]"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {pageNumbers.map(n => (
                    <button
                      key={n}
                      type="button"
                      disabled={loading}
                      onClick={() => void loadCustomers(n)}
                      className="flex h-7 w-7 items-center justify-center rounded-xl text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                      style={{
                        background: n === page ? "#E8431A" : "transparent",
                        color: n === page ? "white" : "var(--color-text-secondary)",
                      }}
                    >
                      {n + 1}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={loading || page >= totalPages - 1}
                    onClick={() => void loadCustomers(page + 1)}
                    className="rounded-xl p-1.5 disabled:opacity-30 hover:bg-[var(--color-background-secondary)]"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
            <AdminListLoadingOverlay
              visible={loading && customers.length > 0}
              title="A carregar clientes"
              message="Estamos a buscar a pagina de clientes."
            />
          </div>
        </div>

        {/* Side panel */}
        <div
          className="hidden shrink-0 xl:block"
          style={{ width: 290, position: "sticky", top: 180, maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}
        >
          <div className="admin-card overflow-hidden">
            <SidePanel
              key={panel.customer?.id ?? "empty"}
              state={panel}
              onClose={clearSelection}
              onVerify={id => void handleVerify(id)}
              onSuspend={c => setSuspendTarget(c)}
              onNoteAdded={id => {
                adminApiFetch<CustomerPanelSummaryResponse>(`/api/admin/customers/${id}/summary?size=5`)
                  .then(payload => setPanel(prev => ({
                    ...prev,
                    orders: payload?.orders ?? prev.orders,
                    notes: payload?.notes ?? [],
                    notesLoaded: true,
                  })))
                  .catch(() => null);
              }}
            />
          </div>
        </div>
      </div>

      {/* Modals */}
      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onDone={() => { setShowInvite(false); showFeedback("Convite enviado.", true); }}
        />
      )}
      {suspendTarget && (
        <SuspendModal
          customer={suspendTarget}
          onClose={() => setSuspendTarget(null)}
          onDone={() => {
            const nextSuspended = !suspendTarget.suspended;
            const msg = suspendTarget.suspended ? "Conta reactivada." : "Conta suspensa.";
            setPanel((prev) => prev.customer?.id === suspendTarget.id
              ? { ...prev, customer: { ...prev.customer, suspended: nextSuspended } }
              : prev);
            setSuspendTarget(null);
            showFeedback(msg, true);
            void loadCustomers(page);
          }}
        />
      )}
    </div>
  );
}
