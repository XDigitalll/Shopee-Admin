"use client";

import { useEffect, useRef, useState } from "react";
import { adminApiFetch } from "@/lib/admin/api-client";

type Banner = {
  id: number;
  title: string;
  subtitle: string;
  imageUrl: string;
  ctaText: string;
  ctaUrl: string;
  displayOrder: number;
  active: boolean;
};

const EMPTY: Omit<Banner, "id"> = {
  title: "",
  subtitle: "",
  imageUrl: "",
  ctaText: "",
  ctaUrl: "",
  displayOrder: 1,
  active: true,
};

function BannerIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 9v10" />
    </svg>
  );
}

function EyeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...props}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...props}>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function TrashIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...props}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

function ChevronUpIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}>
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function ChevronDownIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export default function BannersPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Banner | null>(null);
  const [form, setForm] = useState<Omit<Banner, "id">>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [storageImages, setStorageImages] = useState<string[]>([]);
  const [showStoragePicker, setShowStoragePicker] = useState(false);
  const [loadingStorage, setLoadingStorage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await adminApiFetch<Banner[]>("/api/admin/banners");
      setBanners(data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar banners.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    adminApiFetch<Banner[]>("/api/admin/banners")
      .then((data) => setBanners(data ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "Erro ao carregar banners."))
      .finally(() => setLoading(false));
  }, []);

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY, displayOrder: banners.length + 1 });
    setShowForm(true);
    setError("");
    setSuccess("");
  }

  function openEdit(b: Banner) {
    setEditing(b);
    setForm({
      title: b.title,
      subtitle: b.subtitle,
      imageUrl: b.imageUrl,
      ctaText: b.ctaText ?? "",
      ctaUrl: b.ctaUrl ?? "",
      displayOrder: b.displayOrder,
      active: b.active,
    });
    setShowForm(true);
    setError("");
    setSuccess("");
  }

  async function openStoragePicker() {
    setShowStoragePicker(true);
    if (storageImages.length > 0) return;
    setLoadingStorage(true);
    try {
      const data = await adminApiFetch<string[]>("/api/admin/banners/storage-images");
      setStorageImages(data ?? []);
    } catch {
      setStorageImages([]);
    } finally {
      setLoadingStorage(false);
    }
  }

  async function handleImageFile(file: File) {
    setUploadingImage(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/banners", {
        method: "POST",
        body: fd,
      });
      const data = await res.json() as { url?: string; message?: string };
      if (!res.ok) throw new Error(data.message || "Erro ao carregar imagem.");
      setForm((f) => ({ ...f, imageUrl: data.url ?? "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar imagem.");
    } finally {
      setUploadingImage(false);
    }
  }

  async function save() {
    if (!form.title.trim() || !form.imageUrl.trim()) {
      setError("Título e URL da imagem são obrigatórios.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editing) {
        await adminApiFetch(`/api/admin/banners/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(form),
        });
        setSuccess("Banner atualizado.");
      } else {
        await adminApiFetch("/api/admin/banners", {
          method: "POST",
          body: JSON.stringify(form),
        });
        setSuccess("Banner criado.");
      }
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao guardar banner.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(b: Banner) {
    try {
      await adminApiFetch(`/api/admin/banners/${b.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...b, active: !b.active }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao alterar estado.");
    }
  }

  async function deleteBanner(id: number) {
    setDeletingId(id);
    try {
      await adminApiFetch(`/api/admin/banners/${id}`, { method: "DELETE" });
      setSuccess("Banner eliminado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao eliminar banner.");
    } finally {
      setDeletingId(null);
    }
  }

  async function moveOrder(b: Banner, direction: "up" | "down") {
    const sorted = [...banners].sort((a, b) => a.displayOrder - b.displayOrder);
    const idx = sorted.findIndex((x) => x.id === b.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const other = sorted[swapIdx];
    const newOrder = b.displayOrder;
    const otherOrder = other.displayOrder;

    try {
      await Promise.all([
        adminApiFetch(`/api/admin/banners/${b.id}`, {
          method: "PUT",
          body: JSON.stringify({ ...b, displayOrder: otherOrder }),
        }),
        adminApiFetch(`/api/admin/banners/${other.id}`, {
          method: "PUT",
          body: JSON.stringify({ ...other, displayOrder: newOrder }),
        }),
      ]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao reordenar.");
    }
  }

  const sorted = [...banners].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="sticky top-[88px] z-10 rounded-[28px] border border-[var(--color-border)] bg-[color:var(--color-surface-overlay)]/95 px-6 py-5 backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">
              Marketing
            </p>
            <div className="mt-1 flex items-center gap-3">
              <BannerIcon className="h-6 w-6 text-[var(--color-danger)]" />
              <h1 className="font-[family-name:var(--font-sora)] text-3xl font-semibold">
                Banners da página inicial
              </h1>
            </div>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              {sorted.filter((b) => b.active).length} activos · {sorted.length} total
            </p>
          </div>
          <button type="button" onClick={openNew} className="admin-button-danger">
            + Novo banner
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-[24px] border border-[rgba(232,67,26,0.18)] bg-[rgba(232,67,26,0.08)] px-5 py-4 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}
      {success && !showForm && (
        <div className="rounded-[24px] border border-[rgba(22,101,52,0.14)] bg-[rgba(22,163,74,0.08)] px-5 py-4 text-sm text-[#166534]">
          {success}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <section className="admin-card p-6">
          <h2 className="mb-5 font-[family-name:var(--font-sora)] text-xl font-semibold">
            {editing ? "Editar banner" : "Novo banner"}
          </h2>

          {error && (
            <div className="mb-4 rounded-[20px] border border-[rgba(232,67,26,0.18)] bg-[rgba(232,67,26,0.08)] px-4 py-3 text-sm text-[var(--color-danger)]">
              {error}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">
                Título *
              </label>
              <input
                className="admin-input w-full"
                placeholder="Ex: Compra no mundo, recebe em Moçambique"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">
                Subtítulo
              </label>
              <input
                className="admin-input w-full"
                placeholder="Ex: Amazon, Shein, Temu — tratamos de tudo"
                value={form.subtitle}
                onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
              />
            </div>

            <div className="md:col-span-2">
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-semibold text-[var(--color-text-secondary)]">
                  Imagem do banner *
                </label>
                <span className="text-[11px] text-[var(--color-text-tertiary)]">
                  Tamanho ideal: 1920 × 600 px · Máx. 5 MB · JPG / PNG / WEBP
                </span>
              </div>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleImageFile(file);
                  e.target.value = "";
                }}
              />

              {/* Upload area */}
              <div
                className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[20px] border-2 border-dashed p-6 text-center transition hover:border-[var(--color-danger)]"
                style={{ borderColor: form.imageUrl ? "var(--color-border)" : "var(--color-border-strong)" }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) void handleImageFile(file);
                }}
              >
                {uploadingImage ? (
                  <p className="text-sm text-[var(--color-text-secondary)]">A carregar imagem…</p>
                ) : form.imageUrl ? (
                  <div className="w-full overflow-hidden rounded-[14px]" style={{ height: 160 }}>
                    <img
                      src={form.imageUrl}
                      alt="preview"
                      className="h-full w-full object-cover"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                  </div>
                ) : (
                  <>
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-background-secondary)]">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-6 w-6 text-[var(--color-text-secondary)]">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                        Clica ou arrasta uma imagem aqui
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
                        Dimensões recomendadas: 1920 × 600 px — máx. 5 MB
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Actions row */}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {form.imageUrl ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs font-semibold text-[var(--color-danger)] hover:underline"
                  >
                    Trocar imagem
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void openStoragePicker()}
                  className="text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-danger)] hover:underline"
                >
                  Escolher do storage
                </button>
                <span className="text-xs text-[var(--color-text-tertiary)]">ou cola uma URL:</span>
                <input
                  className="admin-input flex-1 py-1.5 text-xs"
                  placeholder="https://…"
                  value={form.imageUrl}
                  onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                />
              </div>

              {/* Storage image picker */}
              {showStoragePicker && (
                <div className="mt-3 rounded-[20px] border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-semibold text-[var(--color-text-primary)]">
                      Imagens no storage
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowStoragePicker(false)}
                      className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
                    >
                      Fechar
                    </button>
                  </div>
                  {loadingStorage ? (
                    <p className="py-4 text-center text-xs text-[var(--color-text-secondary)]">A carregar…</p>
                  ) : storageImages.length === 0 ? (
                    <p className="py-4 text-center text-xs text-[var(--color-text-secondary)]">
                      Nenhuma imagem encontrada no storage.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                      {storageImages.map((url) => (
                        <button
                          key={url}
                          type="button"
                          onClick={() => {
                            setForm((f) => ({ ...f, imageUrl: url }));
                            setShowStoragePicker(false);
                          }}
                          className="overflow-hidden rounded-[12px] border-2 transition hover:border-[var(--color-danger)]"
                          style={{
                            borderColor: form.imageUrl === url ? "var(--color-danger)" : "transparent",
                            height: 64,
                          }}
                        >
                          <img
                            src={url}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">
                Texto do botão (opcional)
              </label>
              <input
                className="admin-input w-full"
                placeholder="Ex: Ver ofertas"
                value={form.ctaText}
                onChange={(e) => setForm((f) => ({ ...f, ctaText: e.target.value }))}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">
                Link do botão (opcional)
              </label>
              <input
                className="admin-input w-full"
                placeholder="Ex: /store"
                value={form.ctaUrl}
                onChange={(e) => setForm((f) => ({ ...f, ctaUrl: e.target.value }))}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]">
                Ordem de exibição
              </label>
              <input
                type="number"
                min={1}
                className="admin-input w-full"
                value={form.displayOrder}
                onChange={(e) => setForm((f) => ({ ...f, displayOrder: Number(e.target.value) }))}
              />
            </div>

            <div className="flex items-end pb-1">
              <label className="flex cursor-pointer items-center gap-3">
                <div
                  className="relative h-6 w-11 cursor-pointer rounded-full transition-colors"
                  style={{ background: form.active ? "#E8431A" : "#6B7280" }}
                  onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
                >
                  <div
                    className="absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform"
                    style={{ left: form.active ? "calc(100% - 20px)" : "4px" }}
                  />
                </div>
                <span className="text-sm font-medium text-[var(--color-text-primary)]">
                  {form.active ? "Activo" : "Inactivo"}
                </span>
              </label>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="admin-button-danger"
            >
              {saving ? "A guardar..." : editing ? "Guardar alterações" : "Criar banner"}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setError(""); }}
              className="admin-button-muted"
            >
              Cancelar
            </button>
          </div>
        </section>
      )}

      {/* Banner list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-[24px] bg-[var(--color-background-secondary)]" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="admin-card flex flex-col items-center justify-center py-16 text-center">
          <BannerIcon className="mb-3 h-10 w-10 text-[var(--color-text-tertiary)]" />
          <p className="font-semibold text-[var(--color-text-primary)]">Sem banners</p>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Cria o primeiro banner para personalizar a página inicial.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((b, idx) => (
            <div
              key={b.id}
              className="admin-card flex flex-col gap-4 p-4 md:flex-row md:items-center"
              style={{ opacity: b.active ? 1 : 0.6 }}
            >
              {/* Thumbnail */}
              <div
                className="shrink-0 overflow-hidden rounded-[16px] bg-[var(--color-background-secondary)]"
                style={{ width: 120, height: 72 }}
              >
                {b.imageUrl ? (
                  <img
                    src={b.imageUrl}
                    alt={b.title}
                    className="h-full w-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <BannerIcon className="h-6 w-6 text-[var(--color-text-tertiary)]" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[var(--color-background-secondary)] px-2 py-0.5 text-xs font-semibold text-[var(--color-text-secondary)]">
                    #{b.displayOrder}
                  </span>
                  <p className="font-[family-name:var(--font-sora)] font-semibold text-[var(--color-text-primary)]">
                    {b.title}
                  </p>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      b.active
                        ? "bg-[#EAF3DE] text-[#173404]"
                        : "bg-[var(--color-background-secondary)] text-[var(--color-text-secondary)]"
                    }`}
                  >
                    {b.active ? "Activo" : "Inactivo"}
                  </span>
                </div>
                {b.subtitle && (
                  <p className="mt-1 truncate text-sm text-[var(--color-text-secondary)]">
                    {b.subtitle}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-1">
                {/* Reorder */}
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => void moveOrder(b, "up")}
                  className="rounded-xl p-2 text-[var(--color-text-secondary)] transition hover:bg-[var(--color-background-secondary)] disabled:opacity-30"
                  title="Mover para cima"
                >
                  <ChevronUpIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={idx === sorted.length - 1}
                  onClick={() => void moveOrder(b, "down")}
                  className="rounded-xl p-2 text-[var(--color-text-secondary)] transition hover:bg-[var(--color-background-secondary)] disabled:opacity-30"
                  title="Mover para baixo"
                >
                  <ChevronDownIcon className="h-4 w-4" />
                </button>

                {/* Toggle active */}
                <button
                  type="button"
                  onClick={() => void toggleActive(b)}
                  className="rounded-xl p-2 text-[var(--color-text-secondary)] transition hover:bg-[var(--color-background-secondary)]"
                  title={b.active ? "Desactivar" : "Activar"}
                >
                  {b.active ? <EyeIcon className="h-4 w-4" /> : <EyeOffIcon className="h-4 w-4" />}
                </button>

                {/* Edit */}
                <button
                  type="button"
                  onClick={() => openEdit(b)}
                  className="admin-button-muted py-1.5 px-3 text-xs"
                >
                  Editar
                </button>

                {/* Delete */}
                <button
                  type="button"
                  onClick={() => void deleteBanner(b.id)}
                  disabled={deletingId === b.id}
                  className="rounded-xl p-2 text-[var(--color-danger)] transition hover:bg-[rgba(232,67,26,0.08)] disabled:opacity-50"
                  title="Eliminar"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
