"use client";

import { useEffect, useRef, useState } from "react";
import { adminApiFetch } from "@/lib/admin/api-client";
import type { ImageLibraryItem, ImageLibraryPageResponse } from "@/lib/admin/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (images: ImageLibraryItem[]) => void;
  multi?: boolean;
}

export function ImagePickerModal({ open, onClose, onSelect, multi = true }: Props) {
  const [items, setItems] = useState<ImageLibraryItem[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    adminApiFetch<ImageLibraryPageResponse>(`/api/admin/images?page=${page}&size=40`)
      .then((data) => {
        setItems(data?.content ?? []);
        setTotalPages(Math.max(data?.totalPages ?? 1, 1));
        setHasLoaded(true);
      })
      .catch(() => {
        setHasLoaded(true);
      })
      .finally(() => setLoading(false));
  }, [page, open]);

  function handleClose() {
    setSelected(new Set());
    setItems([]);
    setPage(0);
    setTotalPages(1);
    setHasLoaded(false);
    setLoading(false);
    onClose();
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (!multi) next.clear();
        next.add(id);
      }
      return next;
    });
  }

  function confirm() {
    const picked = items.filter((img) => selected.has(img.id));
    onSelect(picked);
    handleClose();
  }

  if (!open) return null;

  const showLoading = loading || !hasLoaded;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={(e) => { if (e.target === overlayRef.current) handleClose(); }}
    >
      <div
        className="flex w-full max-w-4xl flex-col overflow-hidden rounded-3xl shadow-2xl"
        style={{ background: "#111827", maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: "#1F2937" }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: "#F9FAFB" }}>Biblioteca de imagens</h2>
            <p className="mt-0.5 text-xs" style={{ color: "#6B7280" }}>
              {selected.size > 0 ? `${selected.size} seleccionada${selected.size !== 1 ? "s" : ""}` : "Clique para seleccionar"}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold transition"
            style={{ color: "#6B7280", background: "#1F2937" }}
          >
            ×
          </button>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {showLoading ? (
            <div className="grid grid-cols-5 gap-3">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="aspect-square animate-pulse rounded-2xl" style={{ background: "#1F2937" }} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2" style={{ color: "#4B5563" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <p className="text-sm font-medium">Nenhuma imagem na biblioteca ainda.</p>
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-3">
              {items.map((img) => {
                const isSelected = selected.has(img.id);
                return (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => toggle(img.id)}
                    className="group relative aspect-square overflow-hidden rounded-2xl border-2 transition-all"
                    style={{
                      borderColor: isSelected ? "#E8431A" : "#1F2937",
                      boxShadow: isSelected ? "0 0 0 2px rgba(232,67,26,0.3)" : "none",
                    }}
                    title={img.productName}
                  >
                    <img
                      src={img.thumbnailUrl}
                      alt={img.productName}
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                    {/* Product label */}
                    <div
                      className="absolute bottom-0 left-0 right-0 truncate px-2 py-1 text-[10px] font-semibold opacity-0 transition-opacity group-hover:opacity-100"
                      style={{ background: "rgba(0,0,0,0.75)", color: "#F9FAFB" }}
                    >
                      {img.productName}
                    </div>
                    {/* Checkmark */}
                    {isSelected && (
                      <div
                        className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-xs font-black text-white"
                        style={{ background: "#E8431A" }}
                      >
                        ✓
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination + footer */}
        <div
          className="flex items-center justify-between border-t px-6 py-4 gap-4"
          style={{ borderColor: "#1F2937" }}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-xl px-3 py-2 text-xs font-semibold transition disabled:opacity-40"
              style={{ background: "#1F2937", color: "#D1D5DB" }}
            >
              ← Anterior
            </button>
            <span className="text-xs" style={{ color: "#6B7280" }}>
              {page + 1} / {totalPages}
            </span>
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
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-2xl px-4 py-2.5 text-sm font-semibold transition"
              style={{ background: "#1F2937", color: "#9CA3AF" }}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={selected.size === 0}
              onClick={confirm}
              className="rounded-2xl px-5 py-2.5 text-sm font-bold text-white transition disabled:opacity-40"
              style={{ background: "#E8431A" }}
            >
              Usar {selected.size > 0 ? `${selected.size} ` : ""}seleccionada{selected.size !== 1 ? "s" : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
