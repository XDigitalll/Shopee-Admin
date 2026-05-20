"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAdminAuth } from "@/hooks/useAdminAuth";
import { formatFullDate } from "@/lib/admin/format";
import { getModuleForPath, MODULE_METADATA } from "@/lib/admin/roles";
import { canManageCatalog, canManageOrders } from "@/lib/admin/permissions";
import { PlusIcon, QuoteIcon } from "@/components/admin/icons";

export function AdminTopbar() {
  const { profile } = useAdminAuth();
  const pathname = usePathname();
  const today = formatFullDate(new Date());
  const currentModule = getModuleForPath(pathname);
  const moduleTitle = currentModule ? MODULE_METADATA[currentModule].name : "Dashboard";

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-white/95 px-8 py-4 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-danger)]">
              Painel administrativo
            </p>
            <h1 className="font-[family-name:var(--font-sora)] text-xl font-semibold text-[var(--color-text-primary)]">
              {moduleTitle}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-[var(--color-text-secondary)] lg:block">{today}</span>
          {canManageCatalog(profile) ? (
            <Link href="/admin/products/new" className="admin-button-muted">
              <PlusIcon className="h-4 w-4" />
              Novo produto
            </Link>
          ) : null}
          {canManageOrders(profile) ? (
            <Link href="/admin/orders" className="admin-button-danger">
              <QuoteIcon className="h-4 w-4" />
              Analisar pedido
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
