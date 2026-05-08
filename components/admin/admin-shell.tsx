"use client";

import { usePathname } from "next/navigation";

import { useAdminAuth } from "@/hooks/useAdminAuth";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { ProtectedRoute } from "@/components/admin/protected-route";
import { getModuleForPath } from "@/lib/admin/roles";

export function AdminShell({
  children,
  counters,
}: {
  children: React.ReactNode;
  counters: {
    orders: number;
    quotes: number;
    payments: number;
    delivery: number;
  };
}) {
  const pathname = usePathname();
  const { hasAccess } = useAdminAuth();
  const routeModule = getModuleForPath(pathname);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-text-primary)]">
        <AdminSidebar counters={counters} />
        <div className="ml-[220px] min-h-screen">
          <AdminTopbar />
          <main className="px-8 py-6">
            {routeModule && !hasAccess(routeModule) ? null : children}
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
