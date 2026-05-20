"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminListLoadingOverlay } from "@/components/admin/feedback-state";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { adminApiFetch } from "@/lib/admin/api-client";
import type { AdminProduct, AdminProductsPageResponse, ProductStatus } from "@/lib/admin/types";
import { formatMoney } from "@/lib/admin/format";
import { canManageCatalog } from "@/lib/admin/permissions";

// ─── Icons ────────────────────────────────────────────────────────────────────

function PlusIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
}
function EditIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>;
}
function TrashIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>;
}
function SearchIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m16 16 4 4" /></svg>;
}
function ChevronLeft() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>;
}
function ChevronRight() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>;
}
function PackageIcon() {
  return <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>;
}
function TableIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>;
}
function GridIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<ProductStatus, string> = {
  ACTIVE:       "Activo",
  INACTIVE:     "Inactivo",
  OUT_OF_STOCK: "Sem stock",
  DRAFT:        "Rascunho",
  BLOCKED:      "Bloqueado",
  ARCHIVED:     "Arquivado",
};

const STATUS_COLORS: Record<ProductStatus, { bg: string; text: string }> = {
  ACTIVE:       { bg: "#D1FAE5", text: "#065F46" },
  INACTIVE:     { bg: "#FEF3C7", text: "#92400E" },
  OUT_OF_STOCK: { bg: "#FEE2E2", text: "#991B1B" },
  DRAFT:        { bg: "#EDE9FE", text: "#5B21B6" },
  BLOCKED:      { bg: "#FEE2E2", text: "#7F1D1D" },
  ARCHIVED:     { bg: "#F3F4F6", text: "#6B7280" },
};

function StatusBadge({ status }: { status: ProductStatus }) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.INACTIVE;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ background: c.bg, color: c.text }}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

const STATUS_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "ALL",          label: "Todos" },
  { value: "DRAFT",        label: "Rascunhos" },
  { value: "ACTIVE",       label: "Activos" },
  { value: "INACTIVE",     label: "Inactivos" },
  { value: "OUT_OF_STOCK", label: "Sem stock" },
  { value: "ARCHIVED",     label: "Arquivados" },
];

export function ProductsListView() {
  const { profile } = useAdminAuth();
  const router = useRouter();
  const canWriteCatalog = canManageCatalog(profile);

  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "gallery">("table");
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const PAGE_SIZE = 20;

  const showToast = (type: "ok" | "err", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), size: String(PAGE_SIZE) });
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (search.trim()) params.set("name", search.trim());

      const data = await adminApiFetch<AdminProductsPageResponse>(
        `/api/admin/products?${params}`
      );
      setProducts(data?.content ?? []);
      setTotalElements(data?.totalElements ?? 0);
      setTotalPages(Math.max(data?.totalPages ?? 1, 1));
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "Não foi possível carregar os produtos.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE) });
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    if (search.trim()) params.set("name", search.trim());

    adminApiFetch<AdminProductsPageResponse>(`/api/admin/products?${params}`)
      .then((data) => {
        setProducts(data?.content ?? []);
        setTotalElements(data?.totalElements ?? 0);
        setTotalPages(Math.max(data?.totalPages ?? 1, 1));
      })
      .catch((e) => {
        showToast("err", e instanceof Error ? e.message : "Não foi possível carregar os produtos.");
      })
      .finally(() => setLoading(false));
  }, [page, search, statusFilter]);

  const handleDelete = async (product: AdminProduct) => {
    if (!confirm(`Eliminar "${product.name}"? Esta acção não pode ser desfeita.`)) return;
    setDeletingId(product.id);
    try {
      await adminApiFetch(`/api/admin/products/${product.id}`, { method: "DELETE" });
      showToast("ok", `"${product.name}" eliminado.`);
      void load(page);
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "Erro ao eliminar produto.");
    } finally {
      setDeletingId(null);
    }
  };

  const handlePublish = async (product: AdminProduct) => {
    setPublishingId(product.id);
    try {
      await adminApiFetch(`/api/admin/products/${product.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "ACTIVE" }),
      });
      showToast("ok", `"${product.name}" publicado e visível na loja.`);
      void load(page);
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "Erro ao publicar produto.");
    } finally {
      setPublishingId(null);
    }
  };

  const primaryImage = (p: AdminProduct) =>
    p.gallery?.find((g) => g.primaryImage)?.thumbnailUrl ??
    p.gallery?.[0]?.thumbnailUrl ??
    p.gallery?.[0]?.originalUrl ??
    null;

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 rounded-2xl px-5 py-3 text-sm font-semibold shadow-xl"
          style={{
            background: toast.type === "ok" ? "#D1FAE5" : "#FEE2E2",
            color: toast.type === "ok" ? "#065F46" : "#991B1B",
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: "#F8F9FA", fontFamily: "'Sora',sans-serif" }}>
            Produtos
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: "#9CA3AF" }}>
            {totalElements} produto{totalElements !== 1 ? "s" : ""} no catálogo
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: "#374151" }}>
            <button
              type="button"
              onClick={() => setViewMode("gallery")}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition"
              style={{ background: viewMode === "gallery" ? "#E8431A" : "#1F2937", color: viewMode === "gallery" ? "white" : "#9CA3AF" }}
              title="Vista em galeria"
            >
              <GridIcon /> Galeria
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition"
              style={{ background: viewMode === "table" ? "#E8431A" : "#1F2937", color: viewMode === "table" ? "white" : "#9CA3AF" }}
              title="Vista em tabela"
            >
              <TableIcon /> Tabela
            </button>
          </div>
          {canWriteCatalog ? (
            <Link
              href="/admin/products/new"
              className="inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold text-white transition"
              style={{ background: "#E8431A" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#C0360F")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#E8431A")}
            >
              <PlusIcon />
              Novo produto
            </Link>
          ) : null}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-3 flex items-center" style={{ color: "#6B7280" }}>
            <SearchIcon />
          </span>
          <input
            type="search"
            placeholder="Pesquisar por nome ou codigo do produto..."
            value={search}
            onChange={(e) => {
              setLoading(true);
              setPage(0);
              setSearch(e.target.value);
            }}
            className="w-full rounded-xl border py-2.5 pl-9 pr-4 text-sm outline-none focus:ring-2"
            style={{
              background: "#1F2937",
              borderColor: "#374151",
              color: "#F9FAFB",
            }}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setLoading(true);
                setPage(0);
                setStatusFilter(opt.value);
              }}
              className="rounded-xl px-3 py-2 text-xs font-semibold transition"
              style={{
                background: statusFilter === opt.value ? "#E8431A" : "#1F2937",
                color: statusFilter === opt.value ? "white" : "#9CA3AF",
                border: `1px solid ${statusFilter === opt.value ? "#E8431A" : "#374151"}`,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="relative" aria-busy={loading}>
      {loading && products.length === 0 ? (
        viewMode === "gallery" ? (
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse overflow-hidden rounded-2xl" style={{ background: "#111827" }}>
                <div className="h-44 w-full" style={{ background: "#1F2937" }} />
                <div className="p-3 space-y-2">
                  <div className="h-3 w-3/4 rounded" style={{ background: "#1F2937" }} />
                  <div className="h-2.5 w-1/2 rounded" style={{ background: "#1F2937" }} />
                  <div className="h-3 w-1/3 rounded" style={{ background: "#1F2937" }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border" style={{ background: "#111827", borderColor: "#1F2937" }}>
            <div className="space-y-px">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse" style={{ background: "#111827" }}>
                  <div className="h-12 w-12 rounded-xl flex-shrink-0" style={{ background: "#1F2937" }} />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-48 rounded" style={{ background: "#1F2937" }} />
                    <div className="h-2.5 w-24 rounded" style={{ background: "#1F2937" }} />
                  </div>
                  <div className="h-3 w-16 rounded" style={{ background: "#1F2937" }} />
                </div>
              ))}
            </div>
          </div>
        )
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 rounded-2xl border" style={{ color: "#4B5563", background: "#111827", borderColor: "#1F2937" }}>
          <PackageIcon />
          <p className="text-sm font-medium">Nenhum produto encontrado.</p>
          <Link
            href="/admin/products/new"
            className="mt-1 text-xs font-semibold underline"
            style={{ color: "#E8431A" }}
          >
            Criar o primeiro produto
          </Link>
        </div>
      ) : viewMode === "gallery" ? (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
          {products.map((product) => {
            const img = primaryImage(product);
            const isDeleting = deletingId === product.id;
            return (
              <div
                key={product.id}
                className="group overflow-hidden rounded-2xl border flex flex-col"
                style={{ background: "#111827", borderColor: "#1F2937", opacity: isDeleting ? 0.5 : 1 }}
              >
                {/* Image */}
                <div className="relative h-44 w-full overflow-hidden flex-shrink-0" style={{ background: "#1F2937" }}>
                  {img ? (
                    <img src={img} alt={product.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center" style={{ color: "#374151" }}>
                      <PackageIcon />
                    </div>
                  )}
                  {/* Status overlay */}
                  <div className="absolute top-2 left-2">
                    <StatusBadge status={product.status} />
                  </div>
                  <div className="absolute bottom-2 left-2 rounded-lg bg-black/70 px-2 py-1 font-mono text-[11px] font-bold text-white">
                    {product.code || `#${product.id}`}
                  </div>
                  {/* Quick actions on hover */}
                  <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "rgba(0,0,0,0.55)" }}>
                    {(product.status === "DRAFT" || product.status === "INACTIVE") && (
                      <button
                        type="button"
                        disabled={publishingId === product.id}
                        onClick={() => void handlePublish(product)}
                        className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:opacity-50"
                        style={{ background: "#065F46", color: "#D1FAE5" }}
                      >
                        {publishingId === product.id ? "..." : "▶ Publicar"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => router.push(`/admin/products/${product.id}/edit`)}
                      className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                      style={{ background: "#1F2937", color: "#D1D5DB" }}
                    >
                      <EditIcon />
                    </button>
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => void handleDelete(product)}
                      className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
                      style={{ background: "#1F2937", color: "#EF4444" }}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>

                {/* Info */}
                <div className="flex flex-col gap-1 p-3 flex-1">
                  <p className="truncate text-sm font-semibold leading-tight" style={{ color: "#F9FAFB" }}>
                    {product.name}
                  </p>
                  <p className="font-mono text-[11px] font-semibold" style={{ color: "#6B7280" }}>
                    {product.code || `#${product.id}`}
                  </p>
                  {product.category?.name && (
                    <span className="inline-block rounded-full px-2 py-0.5 text-xs w-fit" style={{ background: "#1F2937", color: "#9CA3AF" }}>
                      {product.category.name}
                    </span>
                  )}
                  <div className="flex items-center justify-between mt-auto pt-2">
                    <span className="text-sm font-black" style={{ color: "#E8431A" }}>
                      {formatMoney(product.finalPrice)}
                    </span>
                    <span
                      className="text-xs font-semibold"
                      style={{ color: product.stock <= 0 ? "#EF4444" : product.stock <= 5 ? "#F59E0B" : "#6B7280" }}
                    >
                      {product.stock} un.
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border" style={{ background: "#111827", borderColor: "#1F2937" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid #1F2937" }}>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#6B7280" }}>Codigo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#6B7280" }}>Produto</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider sm:table-cell" style={{ color: "#6B7280" }}>Categoria</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: "#6B7280" }}>Preço</th>
                <th className="hidden px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider md:table-cell" style={{ color: "#6B7280" }}>Stock</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider" style={{ color: "#6B7280" }}>Estado</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: "#6B7280" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product, i) => {
                const img = primaryImage(product);
                const isDeleting = deletingId === product.id;
                return (
                  <tr
                    key={product.id}
                    style={{
                      borderTop: i > 0 ? "1px solid #1F2937" : "none",
                      background: isDeleting ? "#1F2937" : "transparent",
                    }}
                  >
                    <td className="px-4 py-3 align-middle">
                      <span className="rounded-lg px-2 py-1 font-mono text-xs font-bold" style={{ background: "#1F2937", color: "#D1D5DB" }}>
                        {product.code || `#${product.id}`}
                      </span>
                    </td>

                    {/* Product name + image */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl"
                          style={{ background: "#1F2937" }}
                        >
                          {img ? (
                            <img src={img} alt={product.name} className="h-full w-full object-cover" />
                          ) : (
                            <span style={{ color: "#4B5563" }}>
                              <PackageIcon />
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate max-w-[180px] font-semibold" style={{ color: "#F9FAFB" }}>
                            {product.name}
                          </p>
                          <p className="text-xs" style={{ color: "#6B7280" }}>
                            {product.source || "LOCAL"} {product.subCategory ? `• ${product.subCategory}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <span className="text-xs" style={{ color: "#9CA3AF" }}>
                        {product.category?.name ?? "—"}
                      </span>
                    </td>

                    {/* Price */}
                    <td className="px-4 py-3 text-right">
                      <span className="font-bold" style={{ color: "#E8431A" }}>
                        {formatMoney(product.finalPrice)}
                      </span>
                    </td>

                    {/* Stock */}
                    <td className="hidden px-4 py-3 text-center md:table-cell">
                      <span
                        className="font-semibold"
                        style={{ color: product.stock <= 0 ? "#EF4444" : product.stock <= 5 ? "#F59E0B" : "#9CA3AF" }}
                      >
                        {product.stock}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={product.status} />
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {(product.status === "DRAFT" || product.status === "INACTIVE") && (
                          <button
                            type="button"
                            disabled={publishingId === product.id}
                            onClick={() => void handlePublish(product)}
                            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:opacity-50"
                            style={{ background: "#065F46", color: "#D1FAE5" }}
                            onMouseEnter={(e) => { if (publishingId !== product.id) e.currentTarget.style.background = "#047857"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "#065F46"; }}
                          >
                            {publishingId === product.id ? "..." : "▶ Publicar"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => router.push(`/admin/products/${product.id}/edit`)}
                          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition"
                          style={{ background: "#1F2937", color: "#D1D5DB" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "#374151"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "#1F2937"; }}
                        >
                          <EditIcon />
                          Editar
                        </button>
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => void handleDelete(product)}
                          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50"
                          style={{ background: "#1F2937", color: "#EF4444" }}
                          onMouseEnter={(e) => { if (!isDeleting) e.currentTarget.style.background = "#374151"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "#1F2937"; }}
                        >
                          <TrashIcon />
                          {isDeleting ? "..." : "Eliminar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs" style={{ color: "#6B7280" }}>
            Página {page + 1} de {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={loading || page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold transition disabled:opacity-40"
              style={{ background: "#1F2937", color: "#D1D5DB" }}
            >
              <ChevronLeft /> Anterior
            </button>
            <button
              type="button"
              disabled={loading || page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold transition disabled:opacity-40"
              style={{ background: "#1F2937", color: "#D1D5DB" }}
            >
              Seguinte <ChevronRight />
            </button>
          </div>
        </div>
      )}
      <AdminListLoadingOverlay
        visible={loading && products.length > 0}
        title="A carregar produtos"
        message="Estamos a buscar a pagina de produtos."
      />
      </div>
    </div>
  );
}
