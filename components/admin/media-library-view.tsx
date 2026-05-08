"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { adminApiFetch } from "@/lib/admin/api-client";
import type { ImageLibraryItem, ImageLibraryPageResponse } from "@/lib/admin/types";

function TrashIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>;
}

export function MediaLibraryView() {
  const [items, setItems] = useState<ImageLibraryItem[]>([]);
  const [page, setPage] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [preview, setPreview] = useState<ImageLibraryItem | null>(null);

  const showToast = (type: "ok" | "err", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const data = await adminApiFetch<ImageLibraryPageResponse>(
        `/api/admin/images?page=${p}&size=40`
      );
      setItems(data?.content ?? []);
      setTotalElements(data?.totalElements ?? 0);
      setTotalPages(Math.max(data?.totalPages ?? 1, 1));
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "Erro ao carregar imagens.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    adminApiFetch<ImageLibraryPageResponse>(`/api/admin/images?page=${page}&size=40`)
      .then((data) => {
        setItems(data?.content ?? []);
        setTotalElements(data?.totalElements ?? 0);
        setTotalPages(Math.max(data?.totalPages ?? 1, 1));
      })
      .catch((e) => {
        showToast("err", e instanceof Error ? e.message : "Erro ao carregar imagens.");
      })
      .finally(() => setLoading(false));
  }, [page]);

  async function handleDelete(img: ImageLibraryItem) {
    if (!confirm(`Eliminar esta imagem do produto "${img.productName}"? A imagem será removida do Supabase.`)) return;
    setDeletingId(img.id);
    try {
      await adminApiFetch(`/api/admin/images/${img.id}`, { method: "DELETE" });
      showToast("ok", "Imagem eliminada.");
      void load(page);
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "Erro ao eliminar imagem.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 rounded-2xl px-5 py-3 text-sm font-semibold shadow-xl"
          style={{ background: toast.type === "ok" ? "#D1FAE5" : "#FEE2E2", color: toast.type === "ok" ? "#065F46" : "#991B1B" }}
        >
          {toast.msg}
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={() => setPreview(null)}
        >
          <div className="relative max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            <img src={preview.originalUrl} alt={preview.productName} className="w-full rounded-2xl object-contain max-h-[80vh]" />
            <div className="mt-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-white">{preview.productName}</p>
                <Link
                  href={`/admin/products/${preview.productId}/edit`}
                  className="text-xs underline"
                  style={{ color: "#E8431A" }}
                  onClick={() => setPreview(null)}
                >
                  Ir para o produto →
                </Link>
              </div>
              <button
                type="button"
                onClick={() => { void handleDelete(preview); setPreview(null); }}
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold"
                style={{ background: "#FEE2E2", color: "#991B1B" }}
              >
                <TrashIcon /> Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: "#F8F9FA", fontFamily: "'Sora',sans-serif" }}>
            Biblioteca de imagens
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: "#9CA3AF" }}>
            {totalElements} imagem{totalElements !== 1 ? "ns" : ""} em todos os produtos
          </p>
        </div>
        <Link
          href="/admin/products/new"
          className="rounded-2xl px-4 py-2.5 text-sm font-bold text-white transition"
          style={{ background: "#E8431A" }}
        >
          + Novo produto
        </Link>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-2xl" style={{ background: "#1F2937" }} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-2xl py-20"
          style={{ background: "#111827", color: "#4B5563" }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          <p className="text-sm font-medium">Nenhuma imagem encontrada.</p>
          <p className="text-xs">Adicione imagens ao criar ou editar produtos.</p>
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
          {items.map((img) => {
            const isDeleting = deletingId === img.id;
            return (
              <div
                key={img.id}
                className="group relative aspect-square overflow-hidden rounded-2xl border transition"
                style={{ background: "#1F2937", borderColor: "#1F2937", opacity: isDeleting ? 0.4 : 1 }}
              >
                <img
                  src={img.thumbnailUrl}
                  alt={img.productName}
                  className="h-full w-full cursor-zoom-in object-cover transition-transform duration-300 group-hover:scale-105"
                  onClick={() => setPreview(img)}
                />
                {img.primaryImage && (
                  <span
                    className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                    style={{ background: "#E8431A" }}
                  >
                    Principal
                  </span>
                )}
                {/* Hover overlay */}
                <div
                  className="absolute inset-0 flex flex-col justify-end gap-1 p-2 opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ background: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%)" }}
                >
                  <Link
                    href={`/admin/products/${img.productId}/edit`}
                    className="truncate text-[11px] font-semibold text-white underline"
                    title={img.productName}
                  >
                    {img.productName}
                  </Link>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => void handleDelete(img)}
                    className="flex items-center gap-1 self-start rounded-lg px-2 py-1 text-[11px] font-semibold transition disabled:opacity-50"
                    style={{ background: "rgba(239,68,68,0.85)", color: "white" }}
                  >
                    <TrashIcon />
                    {isDeleting ? "..." : "Eliminar"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs" style={{ color: "#6B7280" }}>Página {page + 1} de {totalPages}</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-xl px-3 py-2 text-xs font-semibold transition disabled:opacity-40"
              style={{ background: "#1F2937", color: "#D1D5DB" }}
            >
              ← Anterior
            </button>
            <button
              type="button"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-xl px-3 py-2 text-xs font-semibold transition disabled:opacity-40"
              style={{ background: "#1F2937", color: "#D1D5DB" }}
            >
              Seguinte →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
