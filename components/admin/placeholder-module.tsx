"use client";

import Link from "next/link";

import { useAdminAuth } from "@/hooks/useAdminAuth";
import { humanizeRole } from "@/lib/admin/format";

export function PlaceholderModule({
  title,
  moduleName,
  description,
}: {
  title: string;
  moduleName: string;
  description: string;
}) {
  const { effectiveRole } = useAdminAuth();

  return (
    <section className="admin-card p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-danger)]">{moduleName}</p>
      <h2 className="mt-3 font-[family-name:var(--font-sora)] text-3xl font-semibold text-[var(--color-text-primary)]">
        {title}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">{description}</p>
      <p className="mt-6 text-sm text-[var(--color-text-secondary)]">
        Role ativa: <strong className="text-[var(--color-text-primary)]">{humanizeRole(effectiveRole)}</strong>
      </p>
      <Link href="/admin" className="admin-button-muted mt-6">
        Voltar ao dashboard
      </Link>
    </section>
  );
}
