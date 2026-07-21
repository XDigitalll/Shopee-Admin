"use client";

import type { ComponentType, SVGProps } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAdminAuth } from "@/hooks/useAdminAuth";
import { adminApiFetch } from "@/lib/admin/api-client";
import type { ProductAttentionResponse } from "@/lib/admin/types";
import { humanizeRole } from "@/lib/admin/format";
import { canAccessSuperAdmin, MODULE_METADATA, type AdminRole } from "@/lib/admin/roles";
import { canPerform, hasPermission } from "@/lib/admin/permissions";
import {
  BannerIcon,
  BoxIcon,
  ChartIcon,
  DashboardIcon,
  ImageIcon,
  LayersIcon,
  LockIcon,
  OrdersIcon,
  QuoteIcon,
  ShieldIcon,
  UsersIcon,
  WalletIcon,
} from "@/components/admin/icons";

type SidebarCounters = {
  orders: number;
  quotes: number;
  payments: number;
  delivery: number;
  orphanOrders: number;
};

type SidebarCounterKey = keyof SidebarCounters;

type SidebarItem = {
  module: keyof typeof MODULE_METADATA;
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  counterKey?: SidebarCounterKey;
  roles?: AdminRole[];
  indent?: boolean;
  exact?: boolean;
};

const sections = [
  {
    title: "Principal",
    items: [{ module: "dashboard", label: "Dashboard", href: "/admin", icon: DashboardIcon }] satisfies SidebarItem[],
  },
  {
    title: "Gestao",
    items: [
      {
        module: "delivery",
        label: "Entregas",
        href: "/admin/delivery",
        icon: BoxIcon,
        counterKey: "delivery",
        roles: ["DELIVERY_DRIVER", "DELIVERY_MANAGER", "ADMIN", "SUPER_ADMIN"],
      },
      {
        module: "delivery",
        label: "Gerir estafetas",
        href: "/admin/delivery/drivers",
        icon: UsersIcon,
        roles: ["DELIVERY_MANAGER", "ADMIN", "SUPER_ADMIN"],
        indent: true,
      },
      { module: "orders", label: "Pedidos", href: "/admin/orders", icon: OrdersIcon, counterKey: "orders" },
      { module: "quotes", label: "Cotacoes externas", href: "/admin/external-quotes", icon: QuoteIcon, counterKey: "quotes" },
    ] satisfies SidebarItem[],
  },
  {
    title: "Financeiro",
    items: [
      {
        module: "payments",
        label: "Pagamentos manuais",
        href: "/admin/payments",
        icon: WalletIcon,
        counterKey: "payments",
        roles: ["FINANCE_MANAGER", "ADMIN", "SUPER_ADMIN"],
      },
      { module: "finance", label: "Transações PaySuite", href: "/admin/finance/paysuite", icon: WalletIcon, roles: ["FINANCE_MANAGER", "ADMIN", "SUPER_ADMIN"] },
      { module: "finance", label: "Finanças", href: "/admin/finance", icon: ChartIcon, roles: ["FINANCE_MANAGER", "ADMIN", "SUPER_ADMIN"], exact: true },
      { module: "coupons", label: "Cupões", href: "/admin/coupons", icon: WalletIcon, roles: ["FINANCE_MANAGER", "CRM_MANAGER", "ADMIN", "SUPER_ADMIN"] },
    ] satisfies SidebarItem[],
  },
  {
    title: "Catálogo · Loja local",
    items: [
      { module: "products", label: "Produtos locais", href: "/admin/products", icon: BoxIcon },
      { module: "categories", label: "Categorias locais", href: "/admin/categories", icon: LayersIcon },
      { module: "products", label: "Multimedia", href: "/admin/media", icon: ImageIcon },
      { module: "banners", label: "Banners", href: "/admin/banners", icon: BannerIcon },
    ] satisfies SidebarItem[],
  },
  {
    title: "Por encomenda",
    items: [
      { module: "products", label: "Catálogo por encomenda", href: "/admin/catalog/products", icon: BoxIcon },
      { module: "categories", label: "Categorias do catálogo", href: "/admin/catalog/categories", icon: LayersIcon },
      { module: "products", label: "Marcas do catálogo", href: "/admin/catalog/brands", icon: LayersIcon },
      { module: "products", label: "Promoções do catálogo", href: "/admin/catalog/promotions", icon: BannerIcon },
    ] satisfies SidebarItem[],
  },
  {
    title: "CRM & Suporte",
    items: [
      { module: "customers", label: "Clientes", href: "/admin/customers", icon: UsersIcon },
    ] satisfies SidebarItem[],
  },
];

const superAdminSection = [
  { module: "adminManagement", label: "Gestao de admins", href: "/admin/super-admin/admins", icon: ShieldIcon },
  { module: "audit", label: "Logs & Auditoria", href: "/admin/super-admin/audit", icon: LockIcon },
] satisfies SidebarItem[];

function ChangePasswordModal({
  open,
  mustChangePassword,
  onPasswordChanged,
  onClose,
}: {
  open: boolean;
  mustChangePassword: boolean;
  onPasswordChanged: () => void;
  onClose: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) {
    return null;
  }

  async function submitPasswordChange() {
    if (!mustChangePassword && !currentPassword.trim()) {
      setFeedback({ tone: "error", message: "Informe a senha atual." });
      return;
    }
    if (newPassword.trim().length < 8) {
      setFeedback({ tone: "error", message: "A nova senha deve ter pelo menos 8 caracteres." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setFeedback({ tone: "error", message: "As senhas novas nao coincidem." });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      await adminApiFetch("/api/admin/profile/password", {
        method: "PUT",
        body: JSON.stringify({
          firstAccess: mustChangePassword,
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setFeedback({ tone: "success", message: "Senha alterada com sucesso." });
      onPasswordChanged();
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Nao foi possivel alterar a senha.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 px-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#111827] p-6 text-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#FF8066]">Perfil</p>
        <h2 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold">
          {mustChangePassword ? "Definir nova senha" : "Alterar senha"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-white/60">
          {mustChangePassword
            ? "A tua senha foi redefinida pelo super admin. Escolhe uma senha privada para concluir."
            : "Por seguranca, informa a senha atual antes de escolher uma nova."}
        </p>
        <div className="mt-5 space-y-3">
          {!mustChangePassword ? (
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="admin-input w-full"
              placeholder="Senha atual"
            />
          ) : null}
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="admin-input w-full"
            placeholder="Nova senha"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="admin-input w-full"
            placeholder="Confirmar nova senha"
          />
        </div>
        {feedback ? (
          <div
            className={`mt-4 rounded-[18px] px-4 py-3 text-sm font-medium ${
              feedback.tone === "success"
                ? "bg-[#EAF3DE] text-[#27500A]"
                : "bg-[rgba(232,67,26,0.12)] text-[#FFB09F]"
            }`}
          >
            {feedback.message}
          </div>
        ) : null}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => void submitPasswordChange()}
            disabled={saving}
            className="flex-1 rounded-2xl bg-[#E8431A] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "A guardar..." : "Guardar nova senha"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/75 hover:text-white"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminSidebar({
  counters,
  collapsed = false,
  mobileOpen = false,
  onCloseMobile,
  onToggleCollapsed,
}: {
  counters: SidebarCounters;
  collapsed?: boolean;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  onToggleCollapsed?: () => void;
}) {
  const pathname = usePathname();
  const { effectiveRole, logout, profile } = useAdminAuth();
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [temporaryPasswordCleared, setTemporaryPasswordCleared] = useState(false);
  const [productAttention, setProductAttention] = useState<ProductAttentionResponse>({ count: 0, lowStockCount: 0, outOfStockCount: 0, items: [] });
  const [productAttentionOpen, setProductAttentionOpen] = useState(false);
  const [quoteCustomerRespondedCount, setQuoteCustomerRespondedCount] = useState(0);
  const mustChangePassword = Boolean(profile.mustChangePassword) && !temporaryPasswordCleared;

  useEffect(() => {
    if (!hasPermission(profile, "products")) {
      setProductAttention({ count: 0, lowStockCount: 0, outOfStockCount: 0, items: [] });
      setProductAttentionOpen(false);
      return;
    }

    let cancelled = false;

    async function loadProductAttention() {
      try {
        const payload = await adminApiFetch<ProductAttentionResponse>("/api/admin/products/attention");
        if (!cancelled) {
          setProductAttention({
            count: Number(payload.count ?? 0),
            lowStockCount: Number(payload.lowStockCount ?? 0),
            outOfStockCount: Number(payload.outOfStockCount ?? 0),
            items: payload.items ?? [],
          });
          if ((payload.lowStockCount ?? payload.count ?? 0) <= 0) {
            setProductAttentionOpen(false);
          }
        }
      } catch {
        if (!cancelled) {
          setProductAttention({ count: 0, lowStockCount: 0, outOfStockCount: 0, items: [] });
          setProductAttentionOpen(false);
        }
      }
    }

    void loadProductAttention();

    return () => {
      cancelled = true;
    };
  }, [profile, pathname]);

  useEffect(() => {
    if (!hasPermission(profile, "quotes")) {
      setQuoteCustomerRespondedCount(0);
      return;
    }

    let cancelled = false;

    async function loadQuoteAttention() {
      try {
        const payload = await adminApiFetch<{ customerRespondedCount?: number }>("/api/admin/quotes/stats");
        if (!cancelled) {
          setQuoteCustomerRespondedCount(Number(payload.customerRespondedCount ?? 0));
        }
      } catch {
        if (!cancelled) {
          setQuoteCustomerRespondedCount(0);
        }
      }
    }

    void loadQuoteAttention();

    return () => {
      cancelled = true;
    };
  }, [profile, pathname]);

  function canShowNavItem(item: SidebarItem) {
    if (item.roles && !canPerform(profile, item.roles)) {
      return false;
    }

    return hasPermission(profile, item.module);
  }

  function renderNavItem(item: SidebarItem) {
    if (!canShowNavItem(item)) return null;

    const isActive =
      item.href === "/admin" || item.exact
        ? pathname === item.href
        : pathname === item.href || pathname.startsWith(`${item.href}/`);
    const count = item.counterKey ? counters[item.counterKey] : null;
    const isProductsItem = item.module === "products" && item.href === "/admin/products";
    const isQuotesItem = item.module === "quotes" && item.href === "/admin/external-quotes";
    const productAttentionCount = Number(productAttention.lowStockCount ?? 0);
    const productAttentionTitle = `${productAttentionCount} ${productAttentionCount === 1 ? "produto com" : "produtos com"} stock baixo`;
    const Icon = item.icon;

    return (
      <div key={item.href} className="relative">
        <Link
          href={item.href}
          title={collapsed ? item.label : undefined}
          className={[
            "group flex min-h-11 items-center gap-3 rounded-2xl border-l-2 px-3 py-2.5 transition",
            collapsed ? "justify-center" : "",
            item.indent && !collapsed ? "ml-4 pl-4" : "",
            isActive
              ? "border-[#E8431A] bg-[rgba(232,67,26,0.12)] text-[#FF8066]"
              : "border-transparent text-white/75 hover:bg-white/5 hover:text-white",
          ].join(" ")}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {!collapsed ? <span className="min-w-0 flex-1 text-sm font-medium">{item.label}</span> : null}
          {isProductsItem && productAttentionCount > 0 ? (
            <span
              role="button"
              tabIndex={0}
              aria-label={productAttentionTitle}
              title={productAttentionTitle}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setProductAttentionOpen((open) => !open);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  setProductAttentionOpen((open) => !open);
                }
              }}
              className="min-w-5 shrink-0 rounded-full bg-[#F97316] px-1.5 py-0.5 text-center text-[10px] font-black leading-4 text-white shadow-[0_0_0_4px_rgba(249,115,22,0.16),0_0_14px_rgba(249,115,22,0.55)] outline-none ring-offset-2 ring-offset-[#111827] focus:ring-2 focus:ring-[#FDBA74]"
            >
              {productAttentionCount > 99 ? "99+" : productAttentionCount}
            </span>
          ) : null}
          {isQuotesItem && quoteCustomerRespondedCount > 0 ? (
            <span
              aria-label={`${quoteCustomerRespondedCount} resposta(s) nova(s) de cliente`}
              title={`${quoteCustomerRespondedCount} resposta(s) nova(s) de cliente`}
              className="relative flex h-2.5 w-2.5 shrink-0"
            >
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#E8431A] opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#E8431A]" />
            </span>
          ) : null}
          {typeof count === "number" && count > 0 ? (
            <span className="rounded-full bg-[#E8431A] px-2 py-0.5 text-[11px] font-semibold text-white">
              {collapsed && count > 9 ? "9+" : count}
            </span>
          ) : null}
        </Link>
        {isProductsItem && productAttentionOpen && productAttentionCount > 0 ? (
          <div className="absolute left-full top-0 z-50 ml-3 w-[280px] rounded-2xl border border-white/10 bg-[#111827] p-3 text-white shadow-2xl max-[760px]:left-3 max-[760px]:top-full max-[760px]:mt-2 max-[760px]:ml-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#FDBA74]">{productAttentionTitle}</p>
            <div className="mt-3 space-y-2">
              {productAttention.items.filter((attention) => attention.reason === "Stock baixo").slice(0, 6).map((attention) => (
                <Link
                  key={`${attention.productId}-${attention.reason}`}
                  href={`/admin/products/${attention.productId}/edit`}
                  className="block rounded-xl border border-white/8 bg-white/5 px-3 py-2 transition hover:border-[#F97316]/50 hover:bg-white/8"
                  onClick={() => setProductAttentionOpen(false)}
                >
                  <span className="block truncate text-sm font-semibold text-white">
                    {attention.productName || attention.productCode || `Produto ${attention.productId}`}
                  </span>
                  <span className="mt-0.5 block text-xs text-white/65">{attention.reason}</span>
                </Link>
              ))}
            </div>
            {productAttentionCount > 6 ? (
              <p className="mt-3 text-xs text-white/55">Mais {productAttentionCount - 6} produtos precisam de atencao.</p>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  const visibleSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter(canShowNavItem),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <aside
      className={[
        "admin-sidebar fixed inset-y-0 left-0 z-40 flex flex-col border-r border-white/5 bg-[#111827] text-white transition-[transform,width] duration-200",
        collapsed ? "w-[76px]" : "w-[220px]",
        mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
      ].join(" ")}
    >
      <div className={`border-b border-white/8 ${collapsed ? "px-3 py-4" : "px-5 py-5"}`}>
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(232,67,26,0.14)] text-sm font-black text-[#FF8066]">
            SX
          </div>
          {!collapsed ? <div className="min-w-0">
            <p className="font-[family-name:var(--font-sora)] text-base font-semibold">ShopeeMz Admin</p>
            <span className="mt-2 inline-flex rounded-full bg-[#E8431A] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white">
              {humanizeRole(effectiveRole)}
            </span>
          </div> : null}
          {!collapsed ? (
            <button
              type="button"
              onClick={onCloseMobile}
              className="ml-auto rounded-xl border border-white/10 px-2 py-1 text-lg leading-none text-white/70 md:hidden"
              aria-label="Fechar menu"
            >
              x
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        {visibleSections.map((section) => (
          <div key={section.title} className={collapsed ? "mb-4" : "mb-6"}>
            {!collapsed ? <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
              {section.title}
            </p> : null}
            <nav className="space-y-1">{section.items.map(renderNavItem)}</nav>
          </div>
        ))}

        {canAccessSuperAdmin(profile) ? (
          <div className="mt-8 border-t border-white/8 pt-4">
            {!collapsed ? <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
              Super Admin
            </p> : null}
            <nav className="space-y-1">{superAdminSection.map(renderNavItem)}</nav>
          </div>
        ) : null}

        {counters.orphanOrders > 0 && !collapsed ? (
          <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/8 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.55)]" />
              <span className="min-w-0 flex-1 text-xs font-semibold text-amber-300">Pedido sem fila</span>
              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
                {counters.orphanOrders}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-4 text-amber-400/75">Pedido sem fila operacional</p>
          </div>
        ) : null}
      </div>

      <div className={`border-t border-white/8 ${collapsed ? "px-3 py-4" : "px-4 py-4"}`}>
        <div className={`flex items-center rounded-2xl bg-white/5 p-3 ${collapsed ? "justify-center" : "gap-3"}`}>
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[rgba(232,67,26,0.18)] font-[family-name:var(--font-sora)] text-sm font-semibold text-[#FF8066]">
            {profile.name.slice(0, 2).toUpperCase()}
          </div>
          {!collapsed ? <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{profile.name}</p>
            <p className="truncate text-xs text-white/55">{profile.email || "sem-email@admin"}</p>
          </div> : null}
        </div>
        {!collapsed ? <button
          type="button"
          onClick={() => setPasswordModalOpen(true)}
          className="mt-3 w-full rounded-2xl border border-white/10 px-3 py-2.5 text-sm font-medium text-white/75 transition hover:border-[rgba(232,67,26,0.4)] hover:text-white"
        >
          Alterar senha
        </button> : null}
        <button
          type="button"
          onClick={collapsed ? onToggleCollapsed : () => void logout()}
          className="mt-3 w-full rounded-2xl border border-white/10 px-3 py-2.5 text-sm font-medium text-white/75 transition hover:border-[rgba(232,67,26,0.4)] hover:text-white"
        >
          {collapsed ? ">" : "Terminar sessao"}
        </button>
      </div>
      <ChangePasswordModal
        open={passwordModalOpen}
        mustChangePassword={mustChangePassword}
        onPasswordChanged={() => setTemporaryPasswordCleared(true)}
        onClose={() => setPasswordModalOpen(false)}
      />
    </aside>
  );
}
