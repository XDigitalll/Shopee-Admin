"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { AdminStateCard } from "@/components/admin/feedback-state";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { getDefaultPathForRole, getModuleForPath } from "@/lib/admin/roles";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { effectiveRole, hasAccess, isAuthenticated, isLoading } = useAdminAuth();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!isAuthenticated) {
      router.replace("/admin/login");
      return;
    }

    const routeModule = getModuleForPath(pathname);
    if (pathname === "/admin" && !hasAccess("dashboard")) {
      router.replace(getDefaultPathForRole(effectiveRole));
      return;
    }

    if (routeModule && !hasAccess(routeModule)) {
      router.replace("/admin/unauthorized");
    }
  }, [effectiveRole, hasAccess, isAuthenticated, isLoading, pathname, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)]">
        <div className="w-full max-w-xl px-6">
          <AdminStateCard
            title="A preparar o painel"
            message="Estamos a validar a sua sessão e a montar os acessos do seu perfil."
            compact
          />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const routeModule = getModuleForPath(pathname);
  if (routeModule && !hasAccess(routeModule)) {
    return null;
  }

  return <>{children}</>;
}
