"use client";

import { useEffect, useMemo, useState } from "react";

import { AdminBanner, AdminSectionSkeleton, AdminStateCard } from "@/components/admin/feedback-state";
import { adminApiFetch } from "@/lib/admin/api-client";
import type { AuditLogItem, AuditLogsPageResponse } from "@/lib/admin/types";

const ACTIONS = [
  "",
  "ORDER_CREATED",
  "PAYMENT_CONFIRMED",
  "DELIVERY_PRICE_SET",
  "DELIVERY_PRICE_UPDATED",
  "CUSTOMER_NOTIFIED",
  "COURIER_ASSIGNED",
  "DELIVERY_STARTED",
  "DELIVERY_COMPLETED",
  "ORDER_CANCELLED",
  "ORDER_STATUS_CHANGED",
  "NOTIFICATION_FAILED",
];

const ROLES = ["", "SUPER_ADMIN", "ADMIN", "ORDER_MANAGER", "DELIVERY_MANAGER", "CUSTOMER_SUPPORT", "USER", "DELIVERY_DRIVER", "SYSTEM"];

function formatDate(value: string | null) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function actorLabel(item: AuditLogItem) {
  return item.performedByName || item.performedByEmail || item.performedByCode || "Sistema";
}

export function AuditLogView() {
  const [filters, setFilters] = useState({
    orderCode: "",
    customerCode: "",
    performedBy: "",
    action: "",
    role: "",
    page: 0,
    size: 25,
  });
  const [payload, setPayload] = useState<AuditLogsPageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams({
      page: String(filters.page),
      size: String(filters.size),
    });
    for (const key of ["orderCode", "customerCode", "performedBy", "action", "role"] as const) {
      if (filters[key]) params.set(key, filters[key]);
    }
    return params.toString();
  }, [filters]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    adminApiFetch<AuditLogsPageResponse>(`/api/super-admin/audit?${query}`)
      .then((result) => {
        if (!active) return;
        setPayload(result);
        setError("");
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Nao foi possivel carregar a auditoria.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [query]);

  if (loading && !payload) {
    return <AdminSectionSkeleton title="A carregar auditoria" message="Estamos a ler os eventos globais do sistema." rows={5} />;
  }

  const items = payload?.content ?? [];
  const page = Number(payload?.number ?? filters.page);
  const totalPages = Math.max(1, Number(payload?.totalPages ?? 1));

  return (
    <div className="space-y-6">
      <section className="admin-card px-6 py-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-danger)]">Super Admin</p>
        <h1 className="mt-2 font-[family-name:var(--font-sora)] text-3xl font-semibold text-[var(--color-text-primary)]">
          Logs & Auditoria
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--color-text-secondary)]">
          Consulta global de eventos de pedidos, pagamentos, entregas e acoes administrativas.
        </p>
      </section>

      {error ? <AdminBanner message={error} tone="error" /> : null}

      <section className="admin-card p-5">
        <div className="grid gap-3 xl:grid-cols-5">
          <input className="admin-input" placeholder="Codigo do pedido" value={filters.orderCode} onChange={(event) => setFilters((current) => ({ ...current, orderCode: event.target.value, page: 0 }))} />
          <input className="admin-input" placeholder="Codigo do cliente" value={filters.customerCode} onChange={(event) => setFilters((current) => ({ ...current, customerCode: event.target.value, page: 0 }))} />
          <input className="admin-input" placeholder="Usuario/admin" value={filters.performedBy} onChange={(event) => setFilters((current) => ({ ...current, performedBy: event.target.value, page: 0 }))} />
          <select className="admin-input" value={filters.action} onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value, page: 0 }))}>
            {ACTIONS.map((action) => <option key={action || "all"} value={action}>{action || "Todas as acoes"}</option>)}
          </select>
          <select className="admin-input" value={filters.role} onChange={(event) => setFilters((current) => ({ ...current, role: event.target.value, page: 0 }))}>
            {ROLES.map((role) => <option key={role || "all"} value={role}>{role || "Todos os papeis"}</option>)}
          </select>
        </div>
      </section>

      <section className="admin-card overflow-hidden">
        {items.length === 0 ? (
          <div className="p-5">
            <AdminStateCard title="Sem registros encontrados" message="Ajusta os filtros ou cria uma nova acao de pedido/entrega para aparecer aqui." compact />
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {items.map((item) => (
              <article key={item.id} className="grid gap-4 px-5 py-4 text-sm xl:grid-cols-[170px_170px_1fr_220px_170px]">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">Pedido</p>
                  <p className="mt-1 font-semibold text-[var(--color-text-primary)]">{item.orderCode || `#${item.orderId ?? "--"}`}</p>
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{item.customerCode || "Cliente sem codigo"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">Acao</p>
                  <p className="mt-1 font-semibold text-[var(--color-danger)]">{item.action || "--"}</p>
                </div>
                <div>
                  <p className="font-medium text-[var(--color-text-primary)]">{item.description || "Sem descricao."}</p>
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{item.customerName || "Cliente nao identificado"}</p>
                </div>
                <div>
                  <p className="font-semibold text-[var(--color-text-primary)]">{actorLabel(item)}</p>
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{item.performedByRole || "SYSTEM"} {item.performedByCode ? `- ${item.performedByCode}` : ""}</p>
                </div>
                <p className="text-[var(--color-text-secondary)]">{formatDate(item.createdAt)}</p>
              </article>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-4 text-sm text-[var(--color-text-secondary)]">
          <span>Pagina {page + 1} de {totalPages}</span>
          <div className="flex gap-2">
            <button className="admin-button-muted disabled:opacity-50" disabled={page === 0} onClick={() => setFilters((current) => ({ ...current, page: Math.max(0, current.page - 1) }))}>Anterior</button>
            <button className="admin-button-muted disabled:opacity-50" disabled={page + 1 >= totalPages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>Seguinte</button>
          </div>
        </div>
      </section>
    </div>
  );
}
