"use client";

import { useState, useEffect, useCallback } from "react";

import { AdminConfirmDialog, AdminFeedbackDock } from "@/components/admin/feedback-state";
import { adminApiFetch } from "@/lib/admin/api-client";
import { CATEGORY_ICON_OPTIONS, CategoryIcon, getCategoryIconLabel, normalizeCategoryIconKey } from "@/lib/category-icons";
import { useAdminAuth } from "@/hooks/useAdminAuth";

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = {
  id: string;
  name: string;
  slug: string;
  icon: string;
  description: string;
  active: boolean;
  showOnHomepage: boolean;
  productCount: number;
  parentId: string | null;
  subcategories: Category[];
};

type CategoryStats = {
  totalCategories: number;
  totalSubcategories: number;
  totalProducts: number;
};

type FormMode = "create" | "edit" | "subcategory";

type FormState = {
  name: string;
  parentId: string;
  icon: string;
  description: string;
  slug: string;
  active: boolean;
  showOnHomepage: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

// Legacy icon list kept only as migration reference for older category payloads.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const CATEGORY_ICONS = [
  "📱", "💻", "👗", "👠",
  "🏠", "📚", "🎮", "🍕",
  "💄", "⚽", "🎵", "🚗",
  "🌿", "💍", "🧸", "🎁",
];

const EMPTY_FORM: FormState = {
  name: "",
  parentId: "",
  icon: "package",
  description: "",
  slug: "",
  active: true,
  showOnHomepage: false,
};

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── SVG Primitives ───────────────────────────────────────────────────────────

function IconChevronDown({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IconX({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function IconPlus({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconSearch({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function IconChevronUp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none ${
        checked ? "bg-[#E8431A]" : "bg-[var(--color-border-strong)]"
      }`}
    >
      <span
        className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

// ─── Stats Cards ──────────────────────────────────────────────────────────────

function StatsCards({
  stats,
  isLoading,
}: {
  stats: CategoryStats | null;
  isLoading: boolean;
}) {
  if (isLoading || !stats) {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="admin-card animate-pulse p-5">
            <div className="h-16 rounded-xl bg-[var(--color-background-tertiary)]" />
          </div>
        ))}
      </div>
    );
  }

  const items = [
    { label: "Categorias principais", value: stats.totalCategories, color: "#E8431A" },
    { label: "Subcategorias", value: stats.totalSubcategories, color: "#639922" },
    { label: "Produtos catalogados", value: stats.totalProducts, color: "#378ADD" },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {items.map((c) => (
        <article key={c.label} className="admin-card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
            {c.label}
          </p>
          <p
            className="mt-2 font-[family-name:var(--font-sora)] text-3xl font-semibold"
            style={{ color: c.color }}
          >
            {new Intl.NumberFormat("pt-PT").format(c.value)}
          </p>
        </article>
      ))}
    </div>
  );
}

// ─── Category Form Panel ──────────────────────────────────────────────────────

function CategoryFormPanel({
  mode,
  categories,
  initial,
  onClose,
  onSaved,
}: {
  mode: FormMode;
  categories: Category[];
  initial: Partial<FormState> & { id?: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM, ...initial });
  const [slugManualEdited, setSlugManualEdited] = useState(
    Boolean(initial.slug),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const titles: Record<FormMode, string> = {
    create: "Nova categoria",
    edit: "Editar categoria",
    subcategory: "Nova subcategoria",
  };
  const CATEGORY_ICONS = CATEGORY_ICON_OPTIONS;

  function setName(name: string) {
    setForm((p) => ({
      ...p,
      name,
      slug: slugManualEdited ? p.slug : toSlug(name),
    }));
  }

  function setSlug(slug: string) {
    setSlugManualEdited(true);
    setForm((p) => ({ ...p, slug }));
  }

  async function save() {
    if (!form.name.trim()) {
      setError("O nome da categoria é obrigatório.");
      return;
    }
    if (mode === "subcategory" && !form.parentId) {
      setError("Seleccione uma categoria pai.");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const body = {
        name: form.name.trim(),
        parentId: form.parentId || null,
        icon: normalizeCategoryIconKey(form.icon),
        description: form.description,
        slug: form.slug || toSlug(form.name),
        active: form.active,
        showOnHomepage: form.showOnHomepage,
      };
      if (initial.id) {
        await adminApiFetch(`/api/admin/categories/${initial.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      } else {
        await adminApiFetch("/api/admin/categories", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      onSaved();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Erro ao guardar categoria.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="admin-card flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-danger)]">
            Catálogo
          </p>
          <h3 className="font-[family-name:var(--font-sora)] text-base font-semibold text-[var(--color-text-primary)]">
            {titles[mode]}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl p-1.5 text-[var(--color-text-secondary)] transition hover:bg-[var(--color-background-tertiary)] hover:text-[var(--color-text-primary)]"
        >
          <IconX className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div
        className="flex flex-col gap-4 overflow-y-auto px-5 py-5"
        style={{ maxHeight: "calc(100vh - 230px)" }}
      >
        {error && (
          <div className="rounded-[14px] border border-[rgba(232,67,26,0.2)] bg-[rgba(232,67,26,0.07)] px-4 py-3 text-sm text-[var(--color-danger)]">
            {error}
          </div>
        )}

        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-[var(--color-text-primary)]">
            Nome{" "}
            <span className="text-[var(--color-danger)]">*</span>
          </label>
          <input
            className="admin-input"
            placeholder="Ex: Tecnologia"
            value={form.name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* Parent category */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-[var(--color-text-primary)]">
            Categoria pai
            {mode === "subcategory" && (
              <span className="text-[var(--color-danger)]"> *</span>
            )}
          </label>
          <div className="relative">
            <select
              className="admin-input appearance-none pr-9"
              value={form.parentId}
              onChange={(e) =>
                setForm((p) => ({ ...p, parentId: e.target.value }))
              }
            >
              <option value="">Nenhuma (categoria principal)</option>
              {categories
                .filter((c) => !c.parentId)
                .map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {getCategoryIconLabel(cat.icon)} · {cat.name}
                  </option>
                ))}
            </select>
            <IconChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-secondary)]" />
          </div>
        </div>

        {/* Icon picker */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-[var(--color-text-primary)]">
            Ícone
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {CATEGORY_ICONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setForm((p) => ({ ...p, icon: option.key }))}
                className={`flex min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-left transition ${
                  normalizeCategoryIconKey(form.icon) === option.key
                    ? "border-2 border-[#E8431A] bg-[rgba(232,67,26,0.08)]"
                    : "border border-[var(--color-border)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-background-tertiary)]"
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-background-secondary)] text-[var(--color-text-primary)]">
                  <CategoryIcon icon={option.key} className="h-5 w-5" />
                </span>
                <span className="min-w-0 truncate text-sm font-medium text-[var(--color-text-primary)]">
                  {option.label}
                </span>
              </button>
            ))}
          </div>
          {form.icon && (
            <p className="text-xs text-[var(--color-text-secondary)]">
              Seleccionado:{" "}
              <span className="inline-flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
                <CategoryIcon icon={form.icon} className="h-4 w-4" />
                {getCategoryIconLabel(form.icon)}
              </span>
            </p>
          )}
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-[var(--color-text-primary)]">
            Descrição
          </label>
          <textarea
            className="admin-input resize-none"
            rows={3}
            placeholder="Breve descrição da categoria…"
            value={form.description}
            onChange={(e) =>
              setForm((p) => ({ ...p, description: e.target.value }))
            }
          />
        </div>

        {/* Slug */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-[var(--color-text-primary)]">
            Slug
          </label>
          <input
            className="admin-input font-mono text-sm"
            placeholder="ex: tecnologia"
            value={form.slug}
            onChange={(e) => setSlug(e.target.value)}
          />
          {form.slug && (
            <p className="break-all rounded-xl bg-[var(--color-background-tertiary)] px-3 py-2 text-xs">
              <span className="text-[var(--color-text-secondary)]">
                xdigital.co.mz/categorias/
              </span>
              <span className="font-semibold text-[var(--color-text-primary)]">
                {form.slug}
              </span>
            </p>
          )}
        </div>

        {/* Toggles */}
        <div className="flex flex-col gap-0 overflow-hidden rounded-[18px] border border-[var(--color-border)] bg-[var(--color-background-tertiary)]">
          <div className="flex items-center justify-between gap-3 px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">
                Categoria activa
              </p>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Visível na loja
              </p>
            </div>
            <Toggle
              checked={form.active}
              onChange={(v) => setForm((p) => ({ ...p, active: v }))}
            />
          </div>
          <div className="h-px bg-[var(--color-border)]" />
          <div className="flex items-center justify-between gap-3 px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">
                Mostrar na homepage
              </p>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Destaque na página inicial
              </p>
            </div>
            <Toggle
              checked={form.showOnHomepage}
              onChange={(v) =>
                setForm((p) => ({ ...p, showOnHomepage: v }))
              }
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-col gap-2 border-t border-[var(--color-border)] px-5 py-4">
        <button
          type="button"
          onClick={() => void save()}
          disabled={isSaving}
          className="admin-button-danger w-full justify-center disabled:opacity-60"
        >
          {isSaving ? "A guardar…" : "Guardar categoria"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="admin-button-muted w-full justify-center"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── Subcategory Row ──────────────────────────────────────────────────────────

function SubcategoryRow({
  sub,
  onEdit,
  onConfirmDelete,
  confirmDeleteId,
  onDelete,
  isDeleting,
}: {
  sub: Category;
  onEdit: (sub: Category) => void;
  onConfirmDelete: (id: string | null) => void;
  confirmDeleteId: string | null;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}) {
  const isConfirming = confirmDeleteId === sub.id;

  return (
    <div className="group flex items-center gap-3 rounded-[13px] px-3 py-2.5 transition hover:bg-[var(--color-background-secondary)]">
      <div
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: sub.active ? "#639922" : "#9ca3af" }}
      />
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-background-tertiary)] text-[var(--color-text-primary)]">
        <CategoryIcon icon={sub.icon} className="h-4 w-4" />
      </span>
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--color-text-primary)]">
        {sub.name}
      </p>
      <span className="shrink-0 rounded-full bg-[var(--color-background-secondary)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text-secondary)]">
        {sub.productCount} prod.
      </span>

      {isConfirming ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            disabled={isDeleting}
            onClick={() => onDelete(sub.id)}
            className="rounded-lg bg-[rgba(220,38,38,0.1)] px-2.5 py-1 text-xs font-semibold text-[#dc2626] transition hover:bg-[rgba(220,38,38,0.2)] disabled:opacity-50"
          >
            {isDeleting ? "…" : "Confirmar"}
          </button>
          <button
            type="button"
            onClick={() => onConfirmDelete(null)}
            className="rounded-lg bg-[var(--color-background-tertiary)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-secondary)] transition"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={() => onEdit(sub)}
            className="rounded-lg px-2.5 py-1 text-xs font-medium text-[var(--color-text-secondary)] transition hover:bg-[var(--color-background-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={() => onConfirmDelete(sub.id)}
            className="rounded-lg px-2.5 py-1 text-xs font-medium text-[var(--color-text-secondary)] transition hover:bg-[rgba(220,38,38,0.08)] hover:text-[#dc2626]"
          >
            Remover
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Category Card ────────────────────────────────────────────────────────────

function CategoryCard({
  cat,
  isSelected,
  isExpanded,
  isReorderMode,
  isFirst,
  isLast,
  onToggleExpand,
  onSelect,
  onEdit,
  onAddSub,
  onDelete,
  onMoveUp,
  onMoveDown,
  confirmDeleteId,
  onConfirmDelete,
  isDeleting,
}: {
  cat: Category;
  isSelected: boolean;
  isExpanded: boolean;
  isReorderMode: boolean;
  isFirst: boolean;
  isLast: boolean;
  onToggleExpand: () => void;
  onSelect: () => void;
  onEdit: (cat: Category) => void;
  onAddSub: (parentId: string) => void;
  onDelete: (id: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  confirmDeleteId: string | null;
  onConfirmDelete: (id: string | null) => void;
  isDeleting: boolean;
}) {
  const isConfirming = confirmDeleteId === cat.id;

  return (
    <div
      className={`overflow-hidden rounded-[20px] border transition-all duration-200 ${
        isSelected
          ? "border-[#E8431A] shadow-[0_0_0_3px_rgba(232,67,26,0.1)]"
          : "border-[var(--color-border)] hover:border-[var(--color-border-strong)]"
      } bg-[var(--color-background-secondary)]`}
      onClick={onSelect}
    >
      {/* Header row */}
      <div className="group flex items-center gap-3 px-4 py-3.5">
        {/* Expand arrow OR reorder controls */}
        {isReorderMode ? (
          <div className="flex shrink-0 flex-col gap-0.5">
            <button
              type="button"
              disabled={isFirst}
              onClick={(e) => {
                e.stopPropagation();
                onMoveUp();
              }}
              className="rounded p-0.5 text-[var(--color-text-secondary)] transition hover:bg-[var(--color-background-tertiary)] disabled:opacity-25"
            >
              <IconChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={isLast}
              onClick={(e) => {
                e.stopPropagation();
                onMoveDown();
              }}
              className="rounded p-0.5 text-[var(--color-text-secondary)] transition hover:bg-[var(--color-background-tertiary)] disabled:opacity-25"
            >
              <IconChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            className="shrink-0 rounded-lg p-1 text-[var(--color-text-secondary)] transition hover:bg-[var(--color-background-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            <IconChevronDown
              className={`h-4 w-4 transition-transform duration-300 ${
                isExpanded ? "rotate-180" : ""
              }`}
            />
          </button>
        )}

        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-background-tertiary)] text-[var(--color-text-primary)]">
          <CategoryIcon icon={cat.icon} className="h-5 w-5" />
        </span>

        <p className="min-w-0 flex-1 truncate font-semibold text-[var(--color-text-primary)]">
          {cat.name}
        </p>

        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-[var(--color-background-tertiary)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-text-secondary)]">
            {cat.productCount} prod.
          </span>
          {cat.subcategories.length > 0 && (
            <span className="rounded-full bg-[var(--color-background-tertiary)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-text-secondary)]">
              {cat.subcategories.length} sub
            </span>
          )}
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              cat.active
                ? "bg-[#EAF3DE] text-[#173404]"
                : "bg-[#F1EFE8] text-[#444441]"
            }`}
          >
            {cat.active ? "Activa" : "Inactiva"}
          </span>
        </div>

        {/* Action buttons (hover reveal) */}
        {!isReorderMode &&
          (isConfirming ? (
            <div
              className="flex shrink-0 items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => onDelete(cat.id)}
                className="rounded-lg bg-[rgba(220,38,38,0.1)] px-2.5 py-1.5 text-xs font-semibold text-[#dc2626] transition hover:bg-[rgba(220,38,38,0.18)] disabled:opacity-50"
              >
                {isDeleting ? "…" : "Confirmar remoção"}
              </button>
              <button
                type="button"
                onClick={() => onConfirmDelete(null)}
                className="rounded-lg bg-[var(--color-background-tertiary)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div
              className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => onEdit(cat)}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition hover:bg-[var(--color-background-tertiary)] hover:text-[var(--color-text-primary)]"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => onAddSub(cat.id)}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition hover:bg-[var(--color-background-tertiary)] hover:text-[var(--color-text-primary)]"
              >
                + Sub
              </button>
              <button
                type="button"
                onClick={() => onConfirmDelete(cat.id)}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition hover:bg-[rgba(220,38,38,0.08)] hover:text-[#dc2626]"
              >
                Remover
              </button>
            </div>
          ))}
      </div>

      {/* Subcategories (expand/collapse) */}
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight: isExpanded ? "900px" : "0px" }}
      >
        <div className="mx-4 mb-4 rounded-[16px] bg-[var(--color-background-tertiary)] p-2">
          {cat.subcategories.length > 0 ? (
            cat.subcategories.map((sub) => (
              <SubcategoryRow
                key={sub.id}
                sub={sub}
                onEdit={onEdit}
                onConfirmDelete={onConfirmDelete}
                confirmDeleteId={confirmDeleteId}
                onDelete={onDelete}
                isDeleting={isDeleting}
              />
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-[var(--color-text-secondary)]">
              Sem subcategorias.
            </p>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddSub(cat.id);
            }}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-[12px] border border-dashed border-[var(--color-border-strong)] px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition hover:border-[rgba(232,67,26,0.4)] hover:text-[var(--color-danger)]"
          >
            <IconPlus className="h-3.5 w-3.5" />
            Adicionar subcategoria
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────

export function CategoriesView() {
  const { hasAccess } = useAdminAuth();

  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState<CategoryStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Form panel
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [formInitial, setFormInitial] = useState<
    Partial<FormState> & { id?: string }
  >({});

  // Delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Reorder mode
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [isSavingOrder, setIsSavingOrder] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [catsData, statsData] = await Promise.all([
        adminApiFetch<Category[]>("/api/admin/categories"),
        adminApiFetch<CategoryStats>("/api/admin/categories/stats"),
      ]);
      setCategories(catsData);
      setStats(statsData);
      setOrderedIds(catsData.map((c) => c.id));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Erro ao carregar categorias.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadData]);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openCreate() {
    setFormMode("create");
    setFormInitial({});
    setFormOpen(true);
  }

  function openEdit(cat: Category) {
    setFormMode("edit");
    setFormInitial({
      id: cat.id,
      name: cat.name,
      icon: cat.icon,
      description: cat.description,
      slug: cat.slug,
      active: cat.active,
      showOnHomepage: cat.showOnHomepage,
      parentId: cat.parentId ?? "",
    });
    setFormOpen(true);
  }

  function openAddSub(parentId: string) {
    setFormMode("subcategory");
    setFormInitial({ parentId });
    setFormOpen(true);
  }

  async function handleDelete(id: string) {
    setIsDeleting(true);
    setDeleteError("");
    try {
      await adminApiFetch(`/api/admin/categories/${id}`, {
        method: "DELETE",
      });
      setConfirmDeleteId(null);
      await loadData();
    } catch (e) {
      setDeleteError(
        e instanceof Error
          ? e.message
          : "Não foi possível remover. Verifique se existem produtos associados.",
      );
      setConfirmDeleteId(null);
    } finally {
      setIsDeleting(false);
    }
  }

  function moveCategory(index: number, dir: "up" | "down") {
    setOrderedIds((prev) => {
      const arr = [...prev];
      const swapIdx = dir === "up" ? index - 1 : index + 1;
      if (swapIdx < 0 || swapIdx >= arr.length) return prev;
      [arr[index], arr[swapIdx]] = [arr[swapIdx], arr[index]];
      return arr;
    });
  }

  async function saveOrder() {
    setIsSavingOrder(true);
    try {
      await adminApiFetch("/api/admin/categories/reorder", {
        method: "PUT",
        body: JSON.stringify({ ids: orderedIds }),
      });
      setIsReorderMode(false);
      await loadData();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Erro ao guardar ordem.",
      );
    } finally {
      setIsSavingOrder(false);
    }
  }

  // Build displayed list
  const displayedCategories = (() => {
    const base = isReorderMode
      ? (orderedIds
          .map((id) => categories.find((c) => c.id === id))
          .filter(Boolean) as Category[])
      : categories;

    if (!search.trim()) return base;
    const q = search.toLowerCase();
    return base.filter(
      (cat) =>
        cat.name.toLowerCase().includes(q) ||
        cat.subcategories.some((s) => s.name.toLowerCase().includes(q)),
    );
  })();

  const totalCount =
    categories.length +
    categories.reduce((s, c) => s + c.subcategories.length, 0);

  if (!hasAccess("categories")) return null;

  return (
    <div className="space-y-6">
      {/* Page controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="font-[family-name:var(--font-sora)] text-2xl font-semibold text-[var(--color-text-primary)]">
            Categorias
          </h2>
          {!isLoading && (
            <span className="rounded-full bg-[var(--color-background-tertiary)] px-3 py-0.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--color-text-secondary)]">
              {totalCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isReorderMode ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setIsReorderMode(false);
                  setOrderedIds(categories.map((c) => c.id));
                }}
                className="admin-button-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void saveOrder()}
                disabled={isSavingOrder}
                className="admin-button-danger disabled:opacity-60"
              >
                {isSavingOrder ? "A guardar…" : "Guardar ordem"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setIsReorderMode(true);
                  setSearch("");
                  setFormOpen(false);
                }}
                className="admin-button-muted"
              >
                Reorganizar
              </button>
              <button
                type="button"
                onClick={openCreate}
                className="admin-button-danger"
              >
                <IconPlus className="h-4 w-4" />
                Nova categoria
              </button>
            </>
          )}
        </div>
      </div>

      {/* Errors */}
      {/* Stats */}
      <StatsCards stats={stats} isLoading={isLoading} />

      {/* Body: tree + panel */}
      <div className="flex items-start gap-6">
        {/* Tree */}
        <div className="min-w-0 flex-1 space-y-4">
          {/* Search bar */}
          {!isReorderMode && (
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-secondary)]" />
              <input
                className="admin-input pl-10"
                placeholder="Pesquisar categorias e subcategorias…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}

          {isReorderMode && (
            <div className="flex items-center gap-3 rounded-[16px] border border-[rgba(232,67,26,0.2)] bg-[rgba(232,67,26,0.05)] px-4 py-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0 text-[var(--color-danger)]">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Use as setas para reordenar as categorias. Clique em{" "}
                <strong className="text-[var(--color-text-primary)]">Guardar ordem</strong>{" "}
                para confirmar.
              </p>
            </div>
          )}

          {/* Category cards */}
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="admin-card animate-pulse p-4">
                  <div className="h-12 rounded-xl bg-[var(--color-background-tertiary)]" />
                </div>
              ))}
            </div>
          ) : displayedCategories.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-[var(--color-border-strong)] px-6 py-14 text-center">
              <p className="text-sm text-[var(--color-text-secondary)]">
                {search
                  ? "Nenhuma categoria encontrada para esta pesquisa."
                  : "Ainda não há categorias. Clique em \"Nova categoria\" para começar."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayedCategories.map((cat, idx) => (
                <CategoryCard
                  key={cat.id}
                  cat={cat}
                  isSelected={selectedId === cat.id}
                  isExpanded={expandedIds.has(cat.id)}
                  isReorderMode={isReorderMode}
                  isFirst={idx === 0}
                  isLast={idx === displayedCategories.length - 1}
                  onToggleExpand={() => toggleExpand(cat.id)}
                  onSelect={() =>
                    setSelectedId(selectedId === cat.id ? null : cat.id)
                  }
                  onEdit={openEdit}
                  onAddSub={openAddSub}
                  onDelete={(id) => void handleDelete(id)}
                  onMoveUp={() => moveCategory(idx, "up")}
                  onMoveDown={() => moveCategory(idx, "down")}
                  confirmDeleteId={confirmDeleteId}
                  onConfirmDelete={setConfirmDeleteId}
                  isDeleting={isDeleting}
                />
              ))}
            </div>
          )}
        </div>

        {/* Form panel */}
        {formOpen && (
          <div className="w-80 shrink-0 sticky top-20">
            <CategoryFormPanel
              mode={formMode}
              categories={categories.filter((c) => !c.parentId)}
              initial={formInitial}
              onClose={() => setFormOpen(false)}
              onSaved={async () => {
                setFormOpen(false);
                setIsLoading(true);
                await loadData();
              }}
            />
          </div>
        )}
      </div>
      <AdminFeedbackDock
        feedback={error || deleteError ? { tone: "error", message: error || deleteError } : null}
        onClose={() => {
          setError("");
          setDeleteError("");
        }}
      />
      <AdminConfirmDialog
        open={confirmDeleteId !== null}
        title="Remover categoria?"
        message="Esta acao remove a categoria selecionada. Se existirem dependencias, o sistema vai bloquear e mostrar o motivo."
        confirmLabel="Confirmar remocao"
        danger
        pending={isDeleting}
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          if (!confirmDeleteId) return;
          void handleDelete(confirmDeleteId);
        }}
      />
    </div>
  );
}
