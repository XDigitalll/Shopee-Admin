"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAdminAuth } from "@/hooks/useAdminAuth";
import { formatFullDate } from "@/lib/admin/format";
import { getModuleForPath, MODULE_METADATA } from "@/lib/admin/roles";
import { canManageCatalog, canManageOrders } from "@/lib/admin/permissions";
import { PlusIcon, QuoteIcon } from "@/components/admin/icons";

export function AdminTopbar({
  sidebarCollapsed = false,
  onOpenSidebar,
  onToggleSidebar,
}: {
  sidebarCollapsed?: boolean;
  onOpenSidebar?: () => void;
  onToggleSidebar?: () => void;
}) {
  const { profile } = useAdminAuth();
  const pathname = usePathname();
  const today = formatFullDate(new Date());
  const currentModule = getModuleForPath(pathname);
  const moduleTitle = currentModule ? MODULE_METADATA[currentModule].name : "Dashboard";

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-surface-overlay)] px-4 py-3 backdrop-blur-xl sm:px-5 lg:px-8">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenSidebar}
            className="admin-icon-button md:hidden"
            aria-label="Abrir menu"
          >
            <span className="block h-0.5 w-5 rounded-full bg-current" />
            <span className="block h-0.5 w-5 rounded-full bg-current" />
            <span className="block h-0.5 w-5 rounded-full bg-current" />
          </button>
          <button
            type="button"
            onClick={onToggleSidebar}
            className="admin-icon-button hidden md:inline-flex"
            aria-label={sidebarCollapsed ? "Expandir menu" : "Compactar menu"}
            title={sidebarCollapsed ? "Expandir menu" : "Compactar menu"}
          >
            <span className="text-lg leading-none">{sidebarCollapsed ? ">" : "<"}</span>
          </button>
          <div>
            <p className="hidden text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-danger)] sm:block">
              Painel administrativo
            </p>
            <h1 className="truncate font-[family-name:var(--font-sora)] text-lg font-semibold text-[var(--color-text-primary)] sm:text-xl">
              {moduleTitle}
            </h1>
          </div>
        </div>
        <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
          <span className="hidden text-sm text-[var(--color-text-secondary)] lg:block">{today}</span>
          {canManageCatalog(profile) ? (
            <Link href="/admin/products/new" className="admin-button-muted hidden sm:inline-flex">
              <PlusIcon className="h-4 w-4" />
              Novo produto
            </Link>
          ) : null}
          {canManageOrders(profile) ? (
            <Link href="/admin/orders" className="admin-button-danger whitespace-nowrap">
              <QuoteIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Analisar pedido</span>
              <span className="sm:hidden">Pedidos</span>
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
