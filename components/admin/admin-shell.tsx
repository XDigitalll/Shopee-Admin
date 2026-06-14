"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useBreakpoint } from "@/hooks/use-breakpoint";
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
    orphanOrders: number;
  };
}) {
  const pathname = usePathname();
  const { hasAccess } = useAdminAuth();
  const breakpoint = useBreakpoint();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const routeModule = getModuleForPath(pathname);
  const isMobile = breakpoint === "mobile";
  const isTablet = breakpoint === "tablet";
  const compactSidebar = isTablet || sidebarCollapsed;

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("smz-admin-sidebar-collapsed");
      if (stored != null) {
        setSidebarCollapsed(stored === "true");
      }
    } catch {}
  }, []);

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("smz-admin-sidebar-collapsed", String(next));
      } catch {}
      return next;
    });
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen overflow-x-hidden bg-[var(--color-background)] text-[var(--color-text-primary)]">
        {isMobile && mobileSidebarOpen ? (
          <button
            type="button"
            aria-label="Fechar menu"
            className="fixed inset-0 z-30 bg-slate-950/55 backdrop-blur-sm"
            onClick={() => setMobileSidebarOpen(false)}
          />
        ) : null}
        <AdminSidebar
          counters={counters}
          collapsed={!isMobile && compactSidebar}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          onToggleCollapsed={toggleSidebarCollapsed}
        />
        <div className={`min-h-screen transition-[margin] duration-200 ${isMobile ? "ml-0" : compactSidebar ? "ml-[76px]" : "ml-[220px]"}`}>
          <AdminTopbar
            sidebarCollapsed={compactSidebar}
            onOpenSidebar={() => setMobileSidebarOpen(true)}
            onToggleSidebar={toggleSidebarCollapsed}
          />
          <main className="admin-main-shell">
            {routeModule && !hasAccess(routeModule) ? null : children}
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
