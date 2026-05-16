"use client";

import type { ReactNode } from "react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { adminApiFetch } from "@/lib/admin/api-client";

type DiscountType = "PERCENTAGE" | "FIXED_AMOUNT";
type AppliesTo = "INTERNAL_PRODUCTS" | "EXTERNAL_ORDERS" | "ALL";

type Coupon = {
  id: number;
  code: string;
  name: string;
  description?: string;
  discountType: DiscountType;
  discountValue: number;
  maxDiscountAmount?: number;
  minimumOrderAmount?: number;
  usageLimit?: number;
  usedCount?: number;
  usageLimitPerUser?: number;
  startsAt?: string;
  expiresAt?: string;
  active: boolean;
  appliesTo: AppliesTo;
  expired?: boolean;
};

type CouponStats = {
  activeCoupons: number;
  expiredCoupons: number;
  usedToday: number;
  totalDiscountGranted: number;
};

type FormState = {
  id?: number;
  code: string;
  name: string;
  description: string;
  discountType: DiscountType;
  discountValue: string;
  maxDiscountAmount: string;
  minimumOrderAmount: string;
  usageLimit: string;
  usageLimitPerUser: string;
  startsAt: string;
  expiresAt: string;
  active: boolean;
  appliesTo: AppliesTo;
};

const emptyForm: FormState = {
  code: "",
  name: "",
  description: "",
  discountType: "PERCENTAGE",
  discountValue: "",
  maxDiscountAmount: "",
  minimumOrderAmount: "",
  usageLimit: "",
  usageLimitPerUser: "",
  startsAt: "",
  expiresAt: "",
  active: true,
  appliesTo: "ALL",
};

function money(value: number | undefined) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "MZN" }).format(Number(value || 0));
}

function dateValue(value?: string) {
  if (!value) return "";
  return value.slice(0, 16);
}

function toApiDate(value: string) {
  return value ? new Date(value).toISOString().slice(0, 19) : undefined;
}

function numberOrNull(value: string) {
  const parsed = Number(value);
  return value.trim() === "" || Number.isNaN(parsed) ? undefined : parsed;
}

function couponToForm(coupon: Coupon): FormState {
  return {
    id: coupon.id,
    code: coupon.code,
    name: coupon.name,
    description: coupon.description || "",
    discountType: coupon.discountType,
    discountValue: String(coupon.discountValue ?? ""),
    maxDiscountAmount: coupon.maxDiscountAmount == null ? "" : String(coupon.maxDiscountAmount),
    minimumOrderAmount: coupon.minimumOrderAmount == null ? "" : String(coupon.minimumOrderAmount),
    usageLimit: coupon.usageLimit == null ? "" : String(coupon.usageLimit),
    usageLimitPerUser: coupon.usageLimitPerUser == null ? "" : String(coupon.usageLimitPerUser),
    startsAt: dateValue(coupon.startsAt),
    expiresAt: dateValue(coupon.expiresAt),
    active: coupon.active,
    appliesTo: coupon.appliesTo,
  };
}

export function CouponsManagementView() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [stats, setStats] = useState<CouponStats | null>(null);
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const filteredCoupons = useMemo(() => {
    return coupons.filter((coupon) => {
      if (filter === "active") return coupon.active && !coupon.expired;
      if (filter === "inactive") return !coupon.active;
      if (filter === "expired") return Boolean(coupon.expired);
      if (filter === "percentage") return coupon.discountType === "PERCENTAGE";
      if (filter === "fixed") return coupon.discountType === "FIXED_AMOUNT";
      return true;
    });
  }, [coupons, filter]);

  const load = async () => {
    setLoading(true);
    try {
      const [couponPayload, statsPayload] = await Promise.all([
        adminApiFetch<Coupon[]>("/api/admin/coupons"),
        adminApiFetch<CouponStats>("/api/admin/coupons/stats"),
      ]);
      setCoupons(couponPayload);
      setStats(statsPayload);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Não foi possível carregar cupões." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openCreate = () => {
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (coupon: Coupon) => {
    setForm(couponToForm(coupon));
    setModalOpen(true);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const payload = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      discountType: form.discountType,
      discountValue: numberOrNull(form.discountValue),
      maxDiscountAmount: numberOrNull(form.maxDiscountAmount),
      minimumOrderAmount: numberOrNull(form.minimumOrderAmount),
      usageLimit: numberOrNull(form.usageLimit),
      usageLimitPerUser: numberOrNull(form.usageLimitPerUser),
      startsAt: toApiDate(form.startsAt),
      expiresAt: toApiDate(form.expiresAt),
      active: form.active,
      appliesTo: form.appliesTo,
    };
    try {
      await adminApiFetch<Coupon>(form.id ? `/api/admin/coupons/${form.id}` : "/api/admin/coupons", {
        method: form.id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      setModalOpen(false);
      setMessage({ type: "success", text: form.id ? "Cupão atualizado." : "Cupão criado." });
      await load();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Não foi possível guardar o cupão." });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (coupon: Coupon) => {
    if (coupon.active && !window.confirm(`Desativar o cupão ${coupon.code}?`)) return;
    try {
      await adminApiFetch<Coupon>(`/api/admin/coupons/${coupon.id}/${coupon.active ? "deactivate" : "activate"}`, {
        method: "PATCH",
      });
      await load();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Não foi possível alterar o estado." });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--color-danger)]">Marketing</p>
          <h1 className="font-[family-name:var(--font-sora)] text-2xl font-semibold text-[var(--color-text-primary)]">Cupões</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Campanhas com limites, validade, descontos e regras por tipo de pedido.</p>
        </div>
        <button type="button" onClick={openCreate} className="rounded-2xl bg-[var(--color-danger)] px-4 py-3 text-sm font-bold text-white">
          Criar cupão
        </button>
      </div>

      {message ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${message.type === "success" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
          {message.text}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Ativos" value={stats?.activeCoupons ?? 0} />
        <StatCard label="Expirados" value={stats?.expiredCoupons ?? 0} />
        <StatCard label="Usados hoje" value={stats?.usedToday ?? 0} />
        <StatCard label="Desconto concedido" value={money(stats?.totalDiscountGranted)} />
      </div>

      <div className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap gap-2">
          {[
            ["all", "Todos"],
            ["active", "Ativos"],
            ["inactive", "Inativos"],
            ["expired", "Expirados"],
            ["percentage", "Percentagem"],
            ["fixed", "Valor fixo"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-full px-3 py-2 text-xs font-bold ${filter === value ? "bg-[var(--color-danger)] text-white" : "bg-[var(--color-background-secondary)] text-[var(--color-text-secondary)]"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">
              <tr>
                <th className="px-3 py-3">Código</th>
                <th className="px-3 py-3">Desconto</th>
                <th className="px-3 py-3">Aplica-se a</th>
                <th className="px-3 py-3">Uso</th>
                <th className="px-3 py-3">Estado</th>
                <th className="px-3 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="px-3 py-6 text-[var(--color-text-secondary)]" colSpan={6}>A carregar cupões...</td></tr>
              ) : filteredCoupons.length === 0 ? (
                <tr><td className="px-3 py-6 text-[var(--color-text-secondary)]" colSpan={6}>Nenhum cupão encontrado.</td></tr>
              ) : filteredCoupons.map((coupon) => (
                <tr key={coupon.id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-4">
                    <p className="font-[family-name:var(--font-sora)] font-semibold text-[var(--color-text-primary)]">{coupon.code}</p>
                    <p className="text-xs text-[var(--color-text-secondary)]">{coupon.name}</p>
                  </td>
                  <td className="px-3 py-4">{coupon.discountType === "PERCENTAGE" ? `${coupon.discountValue}%` : money(coupon.discountValue)}</td>
                  <td className="px-3 py-4">{coupon.appliesTo === "ALL" ? "Todos" : coupon.appliesTo === "INTERNAL_PRODUCTS" ? "Produtos internos" : "Pedidos externos"}</td>
                  <td className="px-3 py-4">{coupon.usedCount || 0}{coupon.usageLimit ? ` / ${coupon.usageLimit}` : ""}</td>
                  <td className="px-3 py-4"><Status coupon={coupon} /></td>
                  <td className="px-3 py-4 text-right">
                    <button type="button" onClick={() => openEdit(coupon)} className="mr-2 rounded-xl border border-[var(--color-border)] px-3 py-2 text-xs font-bold">Editar</button>
                    <button type="button" onClick={() => void toggleActive(coupon)} className="rounded-xl border border-[var(--color-border)] px-3 py-2 text-xs font-bold">
                      {coupon.active ? "Desativar" : "Ativar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <form onSubmit={submit} className="admin-card max-h-[92vh] w-full max-w-3xl overflow-y-auto p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-[family-name:var(--font-sora)] text-xl font-semibold text-[var(--color-text-primary)]">{form.id ? "Editar cupão" : "Criar cupão"}</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="admin-button-muted px-4 py-2 text-sm">Fechar</button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Código do cupão"><input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className="admin-input" placeholder="Ex: MAPUTO10" /></Field>
              <Field label="Nome da campanha"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="admin-input" placeholder="Ex: Promoção Maputo" /></Field>
              <Field label="Tipo de desconto"><select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value as DiscountType })} className="admin-input"><option value="PERCENTAGE">Percentagem (%)</option><option value="FIXED_AMOUNT">Valor fixo (MZN)</option></select></Field>
              <Field label={form.discountType === "PERCENTAGE" ? "Valor do desconto (%)" : "Valor do desconto (MZN)"}><input required type="number" min="0" step="0.01" value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} className="admin-input" placeholder={form.discountType === "PERCENTAGE" ? "Ex: 10" : "Ex: 500"} /></Field>
              <Field label="Desconto máximo (MZN)"><input type="number" min="0" step="0.01" value={form.maxDiscountAmount} onChange={(e) => setForm({ ...form, maxDiscountAmount: e.target.value })} className="admin-input" placeholder="Ex: 1000" /></Field>
              <Field label="Pedido mínimo (MZN)"><input type="number" min="0" step="0.01" value={form.minimumOrderAmount} onChange={(e) => setForm({ ...form, minimumOrderAmount: e.target.value })} className="admin-input" placeholder="Ex: 2500" /></Field>
              <Field label="Usos totais"><input type="number" min="0" value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} className="admin-input" placeholder="Ex: 100" /></Field>
              <Field label="Usos por cliente"><input type="number" min="0" value={form.usageLimitPerUser} onChange={(e) => setForm({ ...form, usageLimitPerUser: e.target.value })} className="admin-input" placeholder="Ex: 1" /></Field>
              <Field label="Começa em"><input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className="admin-input" /></Field>
              <Field label="Termina em"><input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className="admin-input" /></Field>
              <Field label="Aplicar em"><select value={form.appliesTo} onChange={(e) => setForm({ ...form, appliesTo: e.target.value as AppliesTo })} className="admin-input"><option value="ALL">Todos os pedidos</option><option value="INTERNAL_PRODUCTS">Produtos internos</option><option value="EXTERNAL_ORDERS">Pedidos externos</option></select></Field>
              <label className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-tertiary)] px-4 py-3 text-sm font-semibold text-[var(--color-text-primary)]"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-4 w-4 accent-[var(--color-danger)]" />Ativo</label>
              <Field label="Descrição interna"><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="admin-input min-h-24 md:col-span-2" placeholder="Notas sobre a campanha" /></Field>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setModalOpen(false)} className="admin-button-muted">Cancelar</button>
              <button type="submit" disabled={saving} className="admin-button-danger disabled:opacity-60">
                {saving ? "A guardar..." : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="rounded-[22px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">{label}</p>
      <p className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold text-[var(--color-text-primary)]">{value}</p>
    </article>
  );
}

function Status({ coupon }: { coupon: Coupon }) {
  const className = coupon.expired
    ? "bg-amber-100 text-amber-700"
    : coupon.active
      ? "bg-green-100 text-green-700"
      : "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${className}`}>{coupon.expired ? "Expirado" : coupon.active ? "Ativo" : "Inativo"}</span>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-[var(--color-text-primary)]">
      <span className="mb-2 block">{label}</span>
      {children}
    </label>
  );
}
