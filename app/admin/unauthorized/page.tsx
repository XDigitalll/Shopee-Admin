"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getStoredAdminToken } from "@/lib/admin/api-client";
import { getProfileFromToken } from "@/lib/admin/jwt";
import { getDefaultPathForRole, MODULE_METADATA, type AdminRole } from "@/lib/admin/roles";

export default function UnauthorizedPage() {
  const [role, setRole] = useState<AdminRole | null>(null);

  useEffect(() => {
    const token = getStoredAdminToken();
    setRole(getProfileFromToken(token).role);
  }, []);

  const fallbackPath = getDefaultPathForRole(role);
  const fallbackModule = Object.values(MODULE_METADATA).find((item) => item.path === fallbackPath);
  const fallbackLabel = fallbackModule?.name ?? "módulo disponível";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-background)] p-6">
      <div className="admin-card max-w-lg p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-danger)]">
          Acesso bloqueado
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-sora)] text-3xl font-semibold text-[var(--color-text-primary)]">
          Não tens permissão para este módulo
        </h1>
        <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
          A tua role atual não permite entrar nesta área. Volta para <strong className="text-[var(--color-text-primary)]">{fallbackLabel}</strong> ou autentica-te com uma conta com mais permissões.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={fallbackPath} className="admin-button-danger">
            Ir para {fallbackLabel}
          </Link>
          <Link href="/admin/login" className="admin-button-muted">
            Ir para login
          </Link>
        </div>
      </div>
    </main>
  );
}
