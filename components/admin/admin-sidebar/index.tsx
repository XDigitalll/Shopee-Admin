"use client";

import type { ComponentType, SVGProps } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAdminAuth } from "@/hooks/useAdminAuth";
import { humanizeRole } from "@/lib/admin/format";
import { canAccessSuperAdmin, MODULE_METADATA, type AdminRole } from "@/lib/admin/roles";
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
        href: "/admin/delivery/pending",
        icon: BoxIcon,
        counterKey: "delivery",
        roles: ["DELIVERY_DRIVER", "DELIVERY_MANAGER", "ORDER_MANAGER", "ADMIN", "SUPER_ADMIN"],
      },
      {
        module: "delivery",
        label: "Gerir estafetas",
        href: "/admin/delivery/drivers",
        icon: UsersIcon,
        roles: ["ORDER_MANAGER", "ADMIN", "SUPER_ADMIN"],
        indent: true,
      },
      { module: "orders", label: "Pedidos", href: "/admin/orders", icon: OrdersIcon, counterKey: "orders" },
      { module: "quotes", label: "Cotacoes externas", href: "/admin/external-quotes", icon: QuoteIcon, counterKey: "quotes" },
      { module: "payments", label: "Pagamentos", href: "/admin/payments", icon: WalletIcon, counterKey: "payments" },
    ] satisfies SidebarItem[],
  },
  {
    title: "Catalogo",
    items: [
      { module: "products", label: "Produtos", href: "/admin/products", icon: BoxIcon },
      { module: "categories", label: "Categorias", href: "/admin/categories", icon: LayersIcon },
      { module: "products", label: "Multimedia", href: "/admin/media", icon: ImageIcon },
      { module: "banners", label: "Banners", href: "/admin/banners", icon: BannerIcon },
    ] satisfies SidebarItem[],
  },
  {
    title: "CRM & Suporte",
    items: [
      { module: "customers", label: "Clientes", href: "/admin/customers", icon: UsersIcon },
      { module: "finance", label: "Finanças", href: "/admin/finance", icon: ChartIcon },
      { module: "coupons", label: "Cupões", href: "/admin/coupons", icon: WalletIcon, roles: ["FINANCE_MANAGER", "ADMIN", "SUPER_ADMIN"] },
    ] satisfies SidebarItem[],
  },
];

const superAdminSection = [
  { module: "adminManagement", label: "Gestao de admins", href: "/admin/super-admin/admins", icon: ShieldIcon },
  { module: "audit", label: "Logs & Auditoria", href: "/admin/super-admin/audit", icon: LockIcon },
] satisfies SidebarItem[];

export function AdminSidebar({
  counters,
}: {
  counters: SidebarCounters;
}) {
  const pathname = usePathname();
  const { effectiveRole, hasAccess, logout, profile } = useAdminAuth();

  function renderNavItem(item: SidebarItem) {
    if (item.roles && (!effectiveRole || !item.roles.includes(effectiveRole))) {
      return null;
    }

    const isActive =
      item.href === "/admin"
        ? pathname === "/admin"
        : pathname === item.href || pathname.startsWith(`${item.href}/`);
    const allowed = hasAccess(item.module);
    if (!allowed) {
      return null;
    }
    const count = item.counterKey ? counters[item.counterKey] : null;
    const Icon = item.icon;

    return (
      <Link
        key={item.href}
        href={item.href}
        className={[
          "group flex items-center gap-3 rounded-2xl border-l-2 px-3 py-2.5 transition",
          item.indent ? "ml-4 pl-4" : "",
          isActive
            ? "border-[#E8431A] bg-[rgba(232,67,26,0.12)] text-[#FF8066]"
            : "border-transparent text-white/75 hover:bg-white/5 hover:text-white",
        ].join(" ")}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 text-sm font-medium">{item.label}</span>
        {typeof count === "number" ? (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              count > 0 ? "bg-[#E8431A] text-white" : "bg-white/10 text-white/80"
            }`}
          >
            {count}
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <aside className="admin-sidebar fixed inset-y-0 left-0 z-30 flex w-[220px] flex-col border-r border-white/5 bg-[#111827] text-white">
      <div className="border-b border-white/8 px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(232,67,26,0.14)] text-sm font-black text-[#FF8066]">
            SX
          </div>
          <div>
            <p className="font-[family-name:var(--font-sora)] text-base font-semibold">ShopeeX Admin</p>
            <span className="mt-2 inline-flex rounded-full bg-[#E8431A] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white">
              {humanizeRole(effectiveRole)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section) => (
          <div key={section.title} className="mb-6">
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
              {section.title}
            </p>
            <nav className="space-y-1">{section.items.map(renderNavItem)}</nav>
          </div>
        ))}

        {canAccessSuperAdmin(effectiveRole) ? (
          <div className="mt-8 border-t border-white/8 pt-4">
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
              Super Admin
            </p>
            <nav className="space-y-1">{superAdminSection.map(renderNavItem)}</nav>
          </div>
        ) : null}
      </div>

      <div className="border-t border-white/8 px-4 py-4">
        <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[rgba(232,67,26,0.18)] font-[family-name:var(--font-sora)] text-sm font-semibold text-[#FF8066]">
            {profile.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{profile.name}</p>
            <p className="truncate text-xs text-white/55">{profile.email || "sem-email@admin"}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="mt-3 w-full rounded-2xl border border-white/10 px-3 py-2.5 text-sm font-medium text-white/75 transition hover:border-[rgba(232,67,26,0.4)] hover:text-white"
        >
          Terminar sessao
        </button>
      </div>
    </aside>
  );
}
