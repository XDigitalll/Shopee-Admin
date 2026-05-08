"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminApiFetch } from "@/lib/admin/api-client";
import type {
  AdminProduct,
  AdminProductCategory,
  CreateProductPayload,
  ImageLibraryItem,
} from "@/lib/admin/types";
import { ImagePickerModal } from "@/components/admin/image-picker-modal";

// ── Helpers ───────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function generateSku(name: string): string {
  return name
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .map((w) => w.slice(0, 3))
    .join("-")
    .slice(0, 24);
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ── Constants ─────────────────────────────────────────────────────────────

const ALL_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

const PRESET_COLORS = [
  { name: "Preto", hex: "#111111" },
  { name: "Branco", hex: "#FFFFFF" },
  { name: "Cinzento", hex: "#9CA3AF" },
  { name: "Vermelho", hex: "#EF4444" },
  { name: "Laranja", hex: "#F97316" },
  { name: "Amarelo", hex: "#EAB308" },
  { name: "Verde", hex: "#22C55E" },
  { name: "Azul", hex: "#3B82F6" },
  { name: "Rosa", hex: "#EC4899" },
];

const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
];

// ── Local types ───────────────────────────────────────────────────────────

interface FormImage {
  id: string;
  url: string;
  thumbnailUrl?: string;
  isPrimary: boolean;
  displayOrder: number;
  file?: File;
  pending: boolean;
  libraryImageId?: number;
}

interface ColorVariant {
  id: string;
  name: string;
  hex: string;
}

interface SpecRow {
  id: string;
  key: string;
  value: string;
}

interface FormErrors {
  name?: string;
  finalPrice?: string;
  categoryId?: string;
  images?: string;
}

type ProductDraftSnapshot = {
  name: string;
  description: string;
  finalPrice: string;
  originalPrice: string;
  purchasePrice: string;
  sku: string;
  weight: string;
  volume: string;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  showOnHomepage: boolean;
  featured: boolean;
  scheduledAt: string;
  categoryId: string;
  subcategoryId: string;
  stock: string;
  minStock: string;
  manageStock: boolean;
  allowOutOfStock: boolean;
  seoTitle: string;
  seoDescription: string;
  slug: string;
  variantsEnabled: boolean;
  selectedSizes: string[];
  selectedColors: ColorVariant[];
  variantStock: Record<string, string>;
  specs: SpecRow[];
};

// ── Props ─────────────────────────────────────────────────────────────────

interface ProductFormViewProps {
  productId?: string;
}

const PRODUCT_DRAFT_STORAGE_KEY = "shopee_admin_product_draft_v1";

function readStoredProductDraft(): ProductDraftSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PRODUCT_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ProductDraftSnapshot;
  } catch {
    window.localStorage.removeItem(PRODUCT_DRAFT_STORAGE_KEY);
    return null;
  }
}

// ── Component ─────────────────────────────────────────────────────────────

export function ProductFormView({ productId }: ProductFormViewProps) {
  const router = useRouter();
  const isEdit = Boolean(productId);
  const [initialDraft] = useState<ProductDraftSnapshot | null>(() =>
    !productId ? readStoredProductDraft() : null
  );

  // ── Data loading ──────────────────────────────────────────────���───────
  const [loading, setLoading] = useState(isEdit);
  const [categories, setCategories] = useState<AdminProductCategory[]>([]);

  // ── Core fields ───────────────────────────────────────────────────────
  const [name, setName] = useState(initialDraft?.name ?? "");
  const [description, setDescription] = useState(initialDraft?.description ?? "");
  const [finalPrice, setFinalPrice] = useState(initialDraft?.finalPrice ?? "");
  const [originalPrice, setOriginalPrice] = useState(initialDraft?.originalPrice ?? "");
  const [purchasePrice, setPurchasePrice] = useState(initialDraft?.purchasePrice ?? "");
  const [sku, setSku] = useState(initialDraft?.sku ?? "");
  const [weight, setWeight] = useState(initialDraft?.weight ?? "");
  const [volume, setVolume] = useState(initialDraft?.volume ?? "");
  const [skuManual, setSkuManual] = useState(Boolean(initialDraft?.sku));
  const [slugManual, setSlugManual] = useState(Boolean(initialDraft?.slug));

  // ── Status & visibility ───────────────────────────────────────────────
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE" | "ARCHIVED">(initialDraft?.status ?? "ACTIVE");
  const [showOnHomepage, setShowOnHomepage] = useState(Boolean(initialDraft?.showOnHomepage));
  const [featured, setFeatured] = useState(Boolean(initialDraft?.featured));
  const [scheduledAt, setScheduledAt] = useState(initialDraft?.scheduledAt ?? "");

  // ── Category ──────────────────────────────────────────────────────────
  const [categoryId, setCategoryId] = useState(initialDraft?.categoryId ?? "");
  const [subcategoryId, setSubcategoryId] = useState(initialDraft?.subcategoryId ?? "");

  // ── Stock ─────────────────────────────────────────────────────────────
  const [stock, setStock] = useState(initialDraft?.stock ?? "0");
  const [minStock, setMinStock] = useState(initialDraft?.minStock ?? "5");
  const [manageStock, setManageStock] = useState(initialDraft?.manageStock ?? true);
  const [allowOutOfStock, setAllowOutOfStock] = useState(Boolean(initialDraft?.allowOutOfStock));

  // ── SEO ───────────────────────────────────────────────────────────────
  const [seoTitle, setSeoTitle] = useState(initialDraft?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(initialDraft?.seoDescription ?? "");
  const [slug, setSlug] = useState(initialDraft?.slug ?? "");

  // ── Images ───────────────────────────────────────────────────────────
  const [images, setImages] = useState<FormImage[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Variants ─────────────────────────────────────────────────────────
  const [variantsEnabled, setVariantsEnabled] = useState(Boolean(initialDraft?.variantsEnabled));
  const [selectedSizes, setSelectedSizes] = useState<string[]>(initialDraft?.selectedSizes ?? []);
  const [selectedColors, setSelectedColors] = useState<ColorVariant[]>(initialDraft?.selectedColors ?? []);
  const [variantStock, setVariantStock] = useState<Record<string, string>>(initialDraft?.variantStock ?? {});
  const [newColorName, setNewColorName] = useState("");
  const [newColorHex, setNewColorHex] = useState("#000000");

  // ── Specs ─────────────────────────────────────────────────────────────
  const [specs, setSpecs] = useState<SpecRow[]>(initialDraft?.specs ?? []);

  // ── UI state ──────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [draftToast, setDraftToast] = useState<{ type: "ok" | "err"; msg: string } | null>(
    initialDraft ? { type: "ok", msg: "Rascunho restaurado neste navegador." } : null
  );

  const descRef = useRef<HTMLTextAreaElement>(null);

  // ── Derived values ────────────────────────────────────────────────────
  const fp = parseFloat(finalPrice) || 0;
  const op = parseFloat(originalPrice) || 0;
  const pp = parseFloat(purchasePrice) || 0;
  const discountPct = op > 0 && fp > 0 && op > fp ? Math.round((1 - fp / op) * 100) : 0;
  const marginValue = fp - pp;
  const marginPct = pp > 0 ? (marginValue / pp) * 100 : 0;

  const subcategories =
    categoryId
      ? (categories.find((c) => c.id === categoryId)?.subcategories ?? [])
      : [];

  const selectedCategory =
    categories.find((c) => c.id === categoryId)?.name ?? "Por definir";
  const selectedSubcategory =
    subcategories.find((sc) => sc.id === subcategoryId)?.name ?? "";
  const effectiveCategoryLabel = selectedSubcategory || selectedCategory;
  const totalStockUnits = variantsEnabled
    ? Object.values(variantStock).reduce((sum, value) => sum + (parseInt(value, 10) || 0), 0)
    : parseInt(stock, 10) || 0;
  const readinessItems = [
    { label: "Nome", done: name.trim().length >= 3 },
    { label: "Categoria", done: Boolean(categoryId || subcategoryId) },
    { label: "Preço", done: fp > 0 },
    { label: "Imagens", done: images.length > 0 },
  ];
  const completedReadiness = readinessItems.filter((item) => item.done).length;

  const variantKeys = buildVariantKeys(selectedSizes, selectedColors);

  const buildDraftSnapshot = useCallback(
    (): ProductDraftSnapshot => ({
      name,
      description,
      finalPrice,
      originalPrice,
      purchasePrice,
      sku,
      weight,
      volume,
      status,
      showOnHomepage,
      featured,
      scheduledAt,
      categoryId,
      subcategoryId,
      stock,
      minStock,
      manageStock,
      allowOutOfStock,
      seoTitle,
      seoDescription,
      slug,
      variantsEnabled,
      selectedSizes,
      selectedColors,
      variantStock,
      specs,
    }),
    [
      name,
      description,
      finalPrice,
      originalPrice,
      purchasePrice,
      sku,
      weight,
      volume,
      status,
      showOnHomepage,
      featured,
      scheduledAt,
      categoryId,
      subcategoryId,
      stock,
      minStock,
      manageStock,
      allowOutOfStock,
      seoTitle,
      seoDescription,
      slug,
      variantsEnabled,
      selectedSizes,
      selectedColors,
      variantStock,
      specs,
    ]
  );

  // ── Auto-derive slug & SKU from name ─────────────────────────────────
  const handleNameChange = useCallback(
    (value: string) => {
      setName(value);
      if (!skuManual) setSku(generateSku(value));
      if (!slugManual) setSlug(slugify(value));
    },
    [skuManual, slugManual]
  );

  // ── Load categories ───────────────────────────────────────────────────
  useEffect(() => {
    adminApiFetch<AdminProductCategory[]>("/api/admin/categories")
      .then(setCategories)
      .catch(() => {});
  }, []);

  // ── Load existing product (edit mode) ────────────────────────────────
  useEffect(() => {
    if (!productId) return;

    adminApiFetch<AdminProduct>(`/api/admin/products/${productId}`)
      .then((product) => {
        setName(product.name ?? "");
        setDescription(product.description ?? "");
        setFinalPrice(String(product.finalPrice ?? ""));
        setOriginalPrice(String(product.originalPrice ?? ""));
        setPurchasePrice(String(product.purchasePrice ?? ""));
        setStock(String(product.stock ?? 0));
        setWeight(product.weight != null ? String(product.weight) : "");
        setVolume(product.volume != null ? String(product.volume) : "");

        const derivedStatus =
          product.status === "ARCHIVED"
            ? "ARCHIVED"
            : product.status === "INACTIVE"
            ? "INACTIVE"
            : "ACTIVE";
        setStatus(derivedStatus);

        if (product.category) {
          const catParentId = product.category.parentId != null ? String(product.category.parentId) : null;
          const catId = String(product.category.id);
          if (catParentId) {
            // produto pertence a subcategoria — restaurar pai + filho
            setCategoryId(catParentId);
            setSubcategoryId(catId);
          } else {
            setCategoryId(catId);
          }
        }

        const gallery: FormImage[] = (product.gallery ?? []).map((img) => ({
          id: String(img.id),
          url: img.originalUrl,
          thumbnailUrl: img.thumbnailUrl ?? undefined,
          isPrimary: img.primaryImage,
          displayOrder: img.displayOrder,
          pending: false,
        }));
        setImages(gallery);

        const variants = product.variants ?? [];
        if (variants.length > 0) {
          setVariantsEnabled(true);
          const sizes = [...new Set(variants.map((v) => v.size).filter(Boolean) as string[])];
          const colorMap = new Map<string, string>();
          variants.forEach((v) => {
            if (v.color) colorMap.set(v.color, v.color);
          });
          setSelectedSizes(sizes);
          setSelectedColors(
            [...colorMap.keys()].map((c) => ({ id: uid(), name: c, hex: "#888888" }))
          );
          const stockMap: Record<string, string> = {};
          variants.forEach((v) => {
            const key = variantKey(v.size ?? "", v.color ?? "");
            stockMap[key] = String(v.stock ?? 0);
          });
          setVariantStock(stockMap);
        }

        setSkuManual(true);
        setSku(generateSku(product.name));
        setSlugManual(true);
        setSlug(slugify(product.name));
        setSeoTitle(product.name);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Nao foi possivel carregar o produto.";
        setLoadError(message);
      })
      .finally(() => setLoading(false));
  }, [productId]);

  useEffect(() => {
    if (!draftToast) return;
    const timer = window.setTimeout(() => setDraftToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [draftToast]);

  // ── Toolbar for description ───────────────────────────────────────────
  function insertMd(before: string, after = "") {
    const ta = descRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = description.substring(start, end);
    const next =
      description.substring(0, start) + before + selected + after + description.substring(end);
    setDescription(next);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + before.length, end + before.length);
    }, 0);
  }

  // ── Image handlers ────────────────────────────────────────────────────
  const handleFilesSelected = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files).filter(
        (f) =>
          ACCEPTED_IMAGE_TYPES.includes(f.type) &&
          f.size <= 5 * 1024 * 1024
      );
      if (arr.length === 0) return;

      if (!productId) {
        // Create mode: store locally
        const newImgs: FormImage[] = arr.map((file, i) => ({
          id: uid(),
          url: URL.createObjectURL(file),
          isPrimary: images.length === 0 && i === 0,
          displayOrder: images.length + i,
          file,
          pending: true,
        }));
        setImages((prev) => [...prev, ...newImgs]);
      } else {
        // Edit mode: upload immediately
        setUploadingImages(true);
        try {
          const fd = new FormData();
          arr.forEach((f) => fd.append("files", f));
          const updated = await fetch(`/api/admin/products/${productId}/images`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${localStorage.getItem("shopee_admin_token") ?? ""}`,
            },
            body: fd,
          }).then((r) => r.json()) as AdminProduct;
          const gallery: FormImage[] = (updated.gallery ?? []).map((img) => ({
            id: String(img.id),
            url: img.originalUrl,
            thumbnailUrl: img.thumbnailUrl ?? undefined,
            isPrimary: img.primaryImage,
            displayOrder: img.displayOrder,
            pending: false,
          }));
          setImages(gallery);
        } catch {
          // silent — user can retry
        } finally {
          setUploadingImages(false);
        }
      }
    },
    [productId, images.length]
  );

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function handleDropZone(e: React.DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) handleFilesSelected(e.dataTransfer.files);
  }

  async function handlePickFromLibrary(picked: ImageLibraryItem[]) {
    if (picked.length === 0) return;

    if (!productId) {
      // Create mode: store as non-pending library images (no file, use URL directly)
      const newImgs: FormImage[] = picked.map((item, i) => ({
        id: `lib-${item.id}`,
        url: item.originalUrl,
        thumbnailUrl: item.thumbnailUrl,
        isPrimary: images.length === 0 && i === 0,
        displayOrder: images.length + i,
        pending: false,
        libraryImageId: item.id,
      }));
      setImages((prev) => [...prev, ...newImgs]);
    } else {
      // Edit mode: call reuse endpoint for each picked image
      setUploadingImages(true);
      try {
        let updated: AdminProduct | null = null;
        for (const item of picked) {
          const res = await adminApiFetch<AdminProduct>(
            `/api/admin/products/${productId}/images/reuse/${item.id}`,
            { method: "POST" }
          );
          updated = res;
        }
        if (updated) {
          const gallery: FormImage[] = (updated.gallery ?? []).map((img) => ({
            id: String(img.id),
            url: img.originalUrl,
            thumbnailUrl: img.thumbnailUrl ?? undefined,
            isPrimary: img.primaryImage,
            displayOrder: img.displayOrder,
            pending: false,
          }));
          setImages(gallery);
        }
      } catch {
        // silent
      } finally {
        setUploadingImages(false);
      }
    }
  }

  async function handleRemoveImage(img: FormImage, index: number) {
    if (!img.pending && productId) {
      try {
        await adminApiFetch(`/api/admin/products/${productId}/images/${img.id}`, {
          method: "DELETE",
        });
      } catch {
        return;
      }
    }
    if (img.pending && img.url.startsWith("blob:")) {
      URL.revokeObjectURL(img.url);
    }
    setImages((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (img.isPrimary && next.length > 0) next[0].isPrimary = true;
      return next;
    });
  }

  // Image drag reorder
  function handleImgDragStart(e: React.DragEvent, index: number) {
    setDragFromIndex(index);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleImgDragOverThumb(e: React.DragEvent, index: number) {
    e.preventDefault();
    setDragOverIndex(index);
  }

  async function handleImgDrop(e: React.DragEvent, dropIndex: number) {
    e.preventDefault();
    if (dragFromIndex === null || dragFromIndex === dropIndex) {
      setDragFromIndex(null);
      setDragOverIndex(null);
      return;
    }
    const next = [...images];
    const [moved] = next.splice(dragFromIndex, 1);
    next.splice(dropIndex, 0, moved);
    next.forEach((img, i) => {
      img.displayOrder = i;
      img.isPrimary = i === 0;
    });
    setImages(next);
    setDragFromIndex(null);
    setDragOverIndex(null);

    if (productId) {
      const ids = next.filter((i) => !i.pending).map((i) => i.id);
      if (ids.length > 0) {
        await adminApiFetch(`/api/admin/products/${productId}/images`, {
          method: "PATCH",
          body: JSON.stringify({ imageIds: ids }),
        }).catch(() => {});
      }
    }
  }

  // ── Variants ─────────────────────────────────────────────────────────
  function toggleSize(size: string) {
    setSelectedSizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]
    );
  }

  function togglePresetColor(color: { name: string; hex: string }) {
    setSelectedColors((prev) => {
      const exists = prev.find((c) => c.name === color.name);
      return exists
        ? prev.filter((c) => c.name !== color.name)
        : [...prev, { id: uid(), ...color }];
    });
  }

  function addCustomColor() {
    if (!newColorName.trim()) return;
    setSelectedColors((prev) => [
      ...prev,
      { id: uid(), name: newColorName.trim(), hex: newColorHex },
    ]);
    setNewColorName("");
    setNewColorHex("#000000");
  }

  function removeColor(id: string) {
    setSelectedColors((prev) => prev.filter((c) => c.id !== id));
  }

  function setVariantStockValue(key: string, value: string) {
    setVariantStock((prev) => ({ ...prev, [key]: value }));
  }

  // ── Specs ─────────────────────────────────────────────────────────────
  function addSpec() {
    setSpecs((prev) => [...prev, { id: uid(), key: "", value: "" }]);
  }

  function updateSpec(id: string, field: "key" | "value", value: string) {
    setSpecs((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  }

  function removeSpec(id: string) {
    setSpecs((prev) => prev.filter((s) => s.id !== id));
  }

  // ── Validation ────────────────────────────────────────────────────────
  function validate(): boolean {
    const errs: FormErrors = {};
    if (name.trim().length < 3) errs.name = "O nome deve ter pelo menos 3 caracteres.";
    if (!fp || fp <= 0) errs.finalPrice = "O preço de venda deve ser maior que zero.";
    if (!categoryId && !subcategoryId) errs.categoryId = "Seleccione uma categoria ou subcategoria.";
    if (images.length === 0) errs.images = "Adicione pelo menos uma imagem.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // ── Submit helpers ────────────────────────────────────────────────────
  function buildPayload(asActive: boolean): CreateProductPayload {
    const profitMargin = fp - pp;
    return {
      name: name.trim(),
      description: description.trim(),
      originalPrice: op || fp,
      purchasePrice: pp || fp,
      profitMargin: profitMargin > 0 ? profitMargin : 0,
      finalPrice: fp,
      categoryId: Number(subcategoryId || categoryId),
      subCategory: undefined,
      weight: weight ? parseFloat(weight) : undefined,
      volume: volume ? parseFloat(volume) : undefined,
      stock: parseInt(stock) || 0,
      active: asActive,
    };
  }

  async function uploadPendingImages(newProductId: string) {
    const fileImages = images.filter((i) => i.pending && i.file);
    if (fileImages.length > 0) {
      const fd = new FormData();
      fileImages.forEach((i) => fd.append("files", i.file!));
      await fetch(`/api/admin/products/${newProductId}/images`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("shopee_admin_token") ?? ""}`,
        },
        body: fd,
      });
    }

    const libraryImages = images.filter((i) => !i.pending && i.libraryImageId != null);
    for (const img of libraryImages) {
      await adminApiFetch(
        `/api/admin/products/${newProductId}/images/reuse/${img.libraryImageId}`,
        { method: "POST" }
      ).catch(() => {});
    }
  }

  async function handleSave(asDraft: boolean) {
    const setter = asDraft ? setSavingDraft : setSaving;
    setter(true);

    try {
      if (asDraft) {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            PRODUCT_DRAFT_STORAGE_KEY,
            JSON.stringify(buildDraftSnapshot())
          );
        }
        setDraftToast({
          type: "ok",
          msg: "Rascunho guardado neste navegador. Podes continuar depois.",
        });
        setErrors({});
        return;
      }

      if (!validate()) return;
      const payload = buildPayload(!asDraft);

      if (isEdit) {
        await adminApiFetch<AdminProduct>(`/api/admin/products/${productId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        const created = await adminApiFetch<AdminProduct>("/api/admin/products", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        await uploadPendingImages(created.id);
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(PRODUCT_DRAFT_STORAGE_KEY);
        }
      }

      router.push("/admin/products?saved=1");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao guardar produto.";
      setErrors((prev) => ({ ...prev, name: msg }));
    } finally {
      setter(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-[var(--color-text-secondary)] text-sm">A carregar produto…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-[400px] max-w-xl flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm font-semibold text-[var(--color-danger)]">Não foi possível carregar o produto.</p>
        <p className="text-xs leading-5 text-[var(--color-text-secondary)]">{loadError}</p>
        <a href="/admin/products" className="admin-button-muted text-sm py-2 px-4">← Voltar à lista</a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1320px]">
      {draftToast && (
        <div
          className="mb-4 rounded-2xl px-4 py-3 text-sm font-medium"
          style={{
            background: draftToast.type === "ok" ? "#D1FAE5" : "#FEE2E2",
            color: draftToast.type === "ok" ? "#065F46" : "#991B1B",
          }}
        >
          {draftToast.msg}
        </div>
      )}
      <div className="mb-5 rounded-[28px] border border-[rgba(232,67,26,0.16)] bg-[linear-gradient(135deg,rgba(255,240,236,0.96),rgba(255,255,255,0.78))] p-5 shadow-[0_24px_60px_rgba(232,67,26,0.08)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.36em] text-[var(--color-danger)]">
              Dados do produto
            </p>
            <h1 className="mt-2 font-[family-name:var(--font-sora)] text-3xl font-semibold text-slate-950 sm:text-4xl">
              {isEdit ? "Refinar produto com clareza" : "Montar um produto pronto para vender"}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-[15px]">
              Organiza primeiro o essencial: nome comercial, categoria, preço, galeria e detalhes de entrega.
              O painel já te mostra o que falta para publicares com confiança.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <HeroStat label="Categoria" value={effectiveCategoryLabel} />
            <HeroStat label="Galeria" value={`${images.length} imagem${images.length === 1 ? "" : "ns"}`} />
            <HeroStat label="Preço" value={fp > 0 ? `${fp.toFixed(2)} MZN` : "Por definir"} accent />
            <HeroStat label="Stock" value={`${totalStockUnits} un.`} />
          </div>
        </div>
      </div>
      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="sticky top-[68px] z-10 mb-6 flex items-center justify-between gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] px-5 py-3 shadow-sm">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href="/admin/products"
            className="text-[var(--color-text-secondary)] hover:text-[var(--color-danger)] transition-colors text-sm"
          >
            ← Produtos
          </Link>
          <span className="text-[var(--color-text-secondary)]">/</span>
          <span className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
            {isEdit ? "Editar produto" : "Novo produto"}
          </span>
          {isEdit && productId && (
            <span className="ml-2 text-xs text-[var(--color-text-secondary)] font-mono">
              #{productId}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isEdit && slug && (
            <a
              href={`${typeof window !== "undefined" ? "" : ""}/product/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="admin-button-muted text-sm py-2 px-4"
            >
              Pré-visualizar ↗
            </a>
          )}
          <button
            onClick={() => handleSave(true)}
            disabled={savingDraft || saving}
            className="admin-button-muted text-sm py-2 px-4 disabled:opacity-50"
          >
            {savingDraft ? "A guardar…" : "Guardar rascunho"}
          </button>
          <button
            onClick={() => handleSave(false)}
            disabled={saving || savingDraft}
            className="admin-button-danger text-sm py-2 px-4 disabled:opacity-60"
          >
            {saving ? (isEdit ? "A actualizar…" : "A publicar…") : (isEdit ? "Actualizar produto" : "Publicar produto")}
          </button>
        </div>
      </div>

      {/* ── Two-column layout ─────────────────────────────────────────── */}
      <div className="flex flex-col items-start gap-6 xl:flex-row">
        {/* ── Left column ───────────────────────────────���───────────── */}
        <div className="flex-1 min-w-0 flex flex-col gap-5">
          {/* Info card */}
          <div className="admin-card p-6 flex flex-col gap-5">
            <div className="rounded-2xl border border-[rgba(232,67,26,0.12)] bg-[rgba(255,240,236,0.55)] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-danger)]">
                    Preenchimento guiado
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">
                    Começa pelo nome, explica o produto de forma comercial e fecha com preço, imagens e dados operacionais.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {readinessItems.map((item) => (
                    <span
                      key={item.label}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        item.done
                          ? "bg-[rgba(99,153,34,0.12)] text-[#3B6D11]"
                          : "bg-[var(--color-background)] text-[var(--color-text-secondary)]"
                      }`}
                    >
                      {item.done ? "OK" : "Falta"} {item.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <h2 className="font-[family-name:var(--font-sora)] font-semibold text-base">
              Informação do produto
            </h2>

            {/* Name */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                Nome comercial
              </label>
              <input
                className={`admin-input text-lg font-semibold ${errors.name ? "border-[var(--color-danger)]" : ""}`}
                placeholder="Ex: Tenis casual branco unissexo"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
              />
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <FieldHint text="Usa um nome claro, vendavel e facil de pesquisar pelo cliente." />
                <span className="text-[11px] text-[var(--color-text-secondary)]">{name.trim().length}/120</span>
              </div>
              {errors.name && (
                <p className="mt-1 text-xs text-[var(--color-danger)]">{errors.name}</p>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                Descrição
              </label>
              <div className="overflow-hidden rounded-[18px] border border-[var(--color-border)] bg-[var(--color-background-tertiary)]">
                <div className="flex gap-1 border-b border-[var(--color-border)] px-3 py-2">
                  <ToolbarBtn label="B" title="Negrito" onClick={() => insertMd("**", "**")} bold />
                  <ToolbarBtn label="I" title="Itálico" onClick={() => insertMd("*", "*")} italic />
                  <ToolbarBtn label="≡" title="Lista" onClick={() => insertMd("\n- ")} />
                </div>
                <textarea
                  ref={descRef}
                  className="w-full resize-none bg-transparent p-4 text-sm leading-relaxed outline-none text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)]"
                  rows={6}
                  placeholder="Descreva o produto…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <FieldHint text="Explica o que o produto oferece, materiais, beneficios e o que o cliente recebe." />
            </div>

            {/* Prices row */}
            <div className="grid gap-4 lg:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                  Preço de venda (MZN)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={`admin-input font-[family-name:var(--font-sora)] font-semibold ${errors.finalPrice ? "border-[var(--color-danger)]" : ""}`}
                  placeholder="0.00"
                  value={finalPrice}
                  onChange={(e) => setFinalPrice(e.target.value)}
                />
                <FieldHint text="Valor final mostrado ao cliente." />
                {errors.finalPrice && (
                  <p className="mt-1 text-xs text-[var(--color-danger)]">{errors.finalPrice}</p>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                  Preço original (MZN)
                  {discountPct > 0 && (
                    <span className="ml-2 rounded-full bg-[var(--color-danger)] px-2 py-0.5 text-[10px] font-bold text-white">
                      -{discountPct}%
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="admin-input font-[family-name:var(--font-sora)]"
                  placeholder="0.00"
                  value={originalPrice}
                  onChange={(e) => setOriginalPrice(e.target.value)}
                />
                <FieldHint text="Usa para comunicar promocao ou preco anterior." />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                  Custo interno (MZN)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="admin-input font-[family-name:var(--font-sora)]"
                  placeholder="0.00"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                />
                <FieldHint text="Ajuda a acompanhar margem e qualidade da precificacao." />
              </div>
            </div>

            {/* SKU */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                SKU{" "}
                <span className="ml-1 font-normal normal-case text-[var(--color-text-secondary)]">
                  (gerado automaticamente)
                </span>
              </label>
              <input
                className="admin-input font-mono text-sm"
                placeholder="SKU-001"
                value={sku}
                onChange={(e) => {
                  setSkuManual(true);
                  setSku(e.target.value);
                }}
              />
              <FieldHint text="Podes ajustar manualmente o codigo se o stock fisico usar outro padrao." />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-tertiary)] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                  Organizacao comercial
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                      Categoria principal
                    </label>
                    <select
                      className={`admin-input text-sm ${errors.categoryId ? "border-[var(--color-danger)]" : ""}`}
                      value={categoryId}
                      onChange={(e) => {
                        setCategoryId(e.target.value);
                        setSubcategoryId("");
                      }}
                    >
                      <option value="">Seleccione uma categoria</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                      Subcategoria
                    </label>
                    <select
                      className="admin-input text-sm"
                      value={subcategoryId}
                      onChange={(e) => setSubcategoryId(e.target.value)}
                      disabled={subcategories.length === 0}
                    >
                      <option value="">{subcategories.length > 0 ? "Nenhuma" : "Escolha a categoria primeiro"}</option>
                      {subcategories.map((sc) => (
                        <option key={sc.id} value={sc.id}>
                          {sc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {errors.categoryId && (
                  <p className="mt-2 text-xs text-[var(--color-danger)]">{errors.categoryId}</p>
                )}
              </div>

              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-tertiary)] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                  Logistica base
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                      Peso (kg)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="admin-input text-sm"
                      placeholder="0.00"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                      Volume (m3)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      className="admin-input text-sm"
                      placeholder="0.000"
                      value={volume}
                      onChange={(e) => setVolume(e.target.value)}
                    />
                  </div>
                </div>
                <FieldHint text="Preenche quando a equipa precisar de calcular transporte e armazenagem." />
              </div>
            </div>
          </div>

          {/* Gallery card */}
          <div className="admin-card p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-[family-name:var(--font-sora)] font-semibold text-base">
                Galeria de imagens
              </h2>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
                style={{ borderColor: "var(--color-border-strong)", color: "var(--color-text-secondary)" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                Seleccionar da biblioteca
              </button>
            </div>
            {errors.images && (
              <p className="text-xs text-[var(--color-danger)]">{errors.images}</p>
            )}

            {/* Drop zone */}
            <div
              className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[var(--color-border-strong)] bg-[var(--color-background-tertiary)] py-10 transition-colors hover:border-[var(--color-danger)] hover:bg-[rgba(232,67,26,0.04)]"
              onDragOver={handleDragOver}
              onDrop={handleDropZone}
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadIcon />
              <div className="text-center">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                  Arraste imagens ou clique para seleccionar
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
                  PNG, JPG, WEBP — máximo 5 MB cada
                </p>
              </div>
              {uploadingImages && (
                <p className="text-xs text-[var(--color-danger)]">A fazer upload…</p>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(",")}
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleFilesSelected(e.target.files)}
            />

            {/* Thumbnails grid */}
            {images.length > 0 && (
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 lg:grid-cols-6">
                {images.map((img, idx) => (
                  <div
                    key={img.id}
                    draggable
                    onDragStart={(e) => handleImgDragStart(e, idx)}
                    onDragOver={(e) => handleImgDragOverThumb(e, idx)}
                    onDrop={(e) => handleImgDrop(e, idx)}
                    onDragLeave={() => setDragOverIndex(null)}
                    className={`relative aspect-square cursor-grab overflow-hidden rounded-xl border-2 transition-all ${
                      img.isPrimary
                        ? "border-[var(--color-danger)]"
                        : "border-[var(--color-border)]"
                    } ${dragOverIndex === idx ? "scale-105 border-[var(--color-danger)] opacity-80" : ""}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    {img.isPrimary && (
                      <span className="absolute bottom-1 left-1 rounded-md bg-[var(--color-danger)] px-1.5 py-0.5 text-[9px] font-bold text-white">
                        PRINCIPAL
                      </span>
                    )}
                    {img.pending && (
                      <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-yellow-400" title="Aguarda upload" />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveImage(img, idx);
                      }}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white text-xs leading-none hover:bg-[var(--color-danger)] transition-colors"
                      title="Remover"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            {images.length > 0 && (
              <p className="text-xs text-[var(--color-text-secondary)]">
                Arraste para reordenar. A primeira imagem é a principal.
              </p>
            )}
          </div>

          {/* Variants card */}
          <div className="admin-card p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <h2 className="font-[family-name:var(--font-sora)] font-semibold text-base">
                Variantes
              </h2>
              <Toggle value={variantsEnabled} onChange={setVariantsEnabled} label="Activar variantes" />
            </div>

            {variantsEnabled && (
              <div className="flex flex-col gap-6">
                {/* Sizes */}
                <div>
                  <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                    Tamanhos
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ALL_SIZES.map((size) => (
                      <button
                        key={size}
                        onClick={() => toggleSize(size)}
                        className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-all border ${
                          selectedSizes.includes(size)
                            ? "border-[var(--color-danger)] bg-[var(--color-danger)] text-white"
                            : "border-[var(--color-border-strong)] text-[var(--color-text-secondary)] hover:border-[var(--color-danger)]"
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Colors */}
                <div>
                  <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                    Cores
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    {PRESET_COLORS.map((color) => {
                      const active = selectedColors.some((c) => c.name === color.name);
                      return (
                        <button
                          key={color.name}
                          onClick={() => togglePresetColor(color)}
                          title={color.name}
                          className={`relative h-8 w-8 rounded-full border-2 transition-all ${
                            active
                              ? "border-[var(--color-danger)] scale-110"
                              : "border-[var(--color-border-strong)] hover:scale-110"
                          }`}
                          style={{ backgroundColor: color.hex }}
                        >
                          {active && (
                            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white drop-shadow">
                              ✓
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Selected custom colors */}
                  {selectedColors.filter((c) => !PRESET_COLORS.some((p) => p.name === c.name)).map((color) => (
                    <div key={color.id} className="mb-2 flex items-center gap-2">
                      <span
                        className="h-5 w-5 rounded-full border border-[var(--color-border)]"
                        style={{ backgroundColor: color.hex }}
                      />
                      <span className="text-sm text-[var(--color-text-primary)]">{color.name}</span>
                      <button
                        onClick={() => removeColor(color.id)}
                        className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-danger)]"
                      >
                        ×
                      </button>
                    </div>
                  ))}

                  {/* Add custom color */}
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="color"
                      value={newColorHex}
                      onChange={(e) => setNewColorHex(e.target.value)}
                      className="h-8 w-10 cursor-pointer rounded-lg border border-[var(--color-border)] bg-transparent p-0.5"
                    />
                    <input
                      className="admin-input py-2 text-sm"
                      placeholder="Nome da cor personalizada"
                      value={newColorName}
                      onChange={(e) => setNewColorName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addCustomColor()}
                    />
                    <button
                      onClick={addCustomColor}
                      className="shrink-0 rounded-full border border-[var(--color-border-strong)] px-3 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:border-[var(--color-danger)] transition-colors"
                    >
                      + Adicionar
                    </button>
                  </div>
                </div>

                {/* Variant stock table */}
                {variantKeys.length > 0 && (
                  <div>
                    <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                      Stock por variante
                    </p>
                    <div className="overflow-hidden rounded-2xl border border-[var(--color-border)]">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[var(--color-border)] bg-[var(--color-background-tertiary)]">
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-text-secondary)]">
                              Variante
                            </th>
                            <th className="px-4 py-2.5 text-right text-xs font-semibold text-[var(--color-text-secondary)]">
                              Stock
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {variantKeys.map((vk) => (
                            <tr
                              key={vk.key}
                              className="border-b border-[var(--color-border)] last:border-0"
                            >
                              <td className="px-4 py-2.5 text-[var(--color-text-primary)] font-medium">
                                {vk.label}
                              </td>
                              <td className="px-4 py-2 text-right">
                                <input
                                  type="number"
                                  min="0"
                                  className="w-20 rounded-xl border border-[var(--color-border)] bg-[var(--color-background-tertiary)] px-3 py-1.5 text-right text-sm font-[family-name:var(--font-sora)] font-semibold outline-none focus:border-[rgba(232,67,26,0.4)] focus:ring-2 focus:ring-[rgba(232,67,26,0.12)]"
                                  value={variantStock[vk.key] ?? "0"}
                                  onChange={(e) => setVariantStockValue(vk.key, e.target.value)}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Specs card */}
          <div className="admin-card p-6 flex flex-col gap-4">
            <h2 className="font-[family-name:var(--font-sora)] font-semibold text-base">
              Especificações
            </h2>
            {specs.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-[var(--color-border)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] bg-[var(--color-background-tertiary)]">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-text-secondary)]">
                        Atributo
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-text-secondary)]">
                        Valor
                      </th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {specs.map((spec) => (
                      <tr key={spec.id} className="border-b border-[var(--color-border)] last:border-0">
                        <td className="px-3 py-2">
                          <input
                            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background-tertiary)] px-3 py-1.5 text-sm outline-none focus:border-[rgba(232,67,26,0.4)]"
                            placeholder="Ex: Material"
                            value={spec.key}
                            onChange={(e) => updateSpec(spec.id, "key", e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background-tertiary)] px-3 py-1.5 text-sm outline-none focus:border-[rgba(232,67,26,0.4)]"
                            placeholder="Ex: Algodão 100%"
                            value={spec.value}
                            onChange={(e) => updateSpec(spec.id, "value", e.target.value)}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <button
                            onClick={() => removeSpec(spec.id)}
                            className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--color-text-secondary)] hover:bg-red-50 hover:text-[var(--color-danger)] transition-colors text-base leading-none"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button
              onClick={addSpec}
              className="self-start rounded-full border border-[var(--color-border-strong)] px-4 py-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] transition-colors"
            >
              + Adicionar especificação
            </button>
          </div>
        </div>

        {/* ── Right sidebar ───────────────────────────────────────────── */}
        <div className="w-full shrink-0 flex flex-col gap-5 xl:sticky xl:top-[168px] xl:w-[320px]">
          {/* Status card */}
          <div className="admin-card p-5 flex flex-col gap-4">
            <h3 className="font-[family-name:var(--font-sora)] font-semibold text-sm">
              Estado e publicação
            </h3>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                Estado
              </label>
              <select
                className="admin-input text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
              >
                <option value="ACTIVE">Activo</option>
                <option value="INACTIVE">Inactivo</option>
                <option value="ARCHIVED">Arquivado</option>
              </select>
            </div>
            <Toggle value={showOnHomepage} onChange={setShowOnHomepage} label="Mostrar na homepage" />
            <Toggle value={featured} onChange={setFeatured} label="Produto em destaque" />
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                Publicar a partir de (opcional)
              </label>
              <input
                type="datetime-local"
                className="admin-input text-sm"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
          </div>

          {/* Category card */}
          <div className="admin-card p-5 flex flex-col gap-4">
            <h3 className="font-[family-name:var(--font-sora)] font-semibold text-sm">
              Prontidao para publicar
            </h3>
            <div className="rounded-2xl bg-[var(--color-background-tertiary)] p-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                    Checklist
                  </p>
                  <p className="mt-1 font-[family-name:var(--font-sora)] text-3xl font-semibold text-[var(--color-text-primary)]">
                    {completedReadiness}/{readinessItems.length}
                  </p>
                </div>
                <span className="rounded-full bg-[rgba(232,67,26,0.08)] px-3 py-1 text-xs font-semibold text-[var(--color-danger)]">
                  {effectiveCategoryLabel}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              {readinessItems.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-2xl border border-[var(--color-border)] px-3 py-2 text-sm"
                >
                  <span className="text-[var(--color-text-primary)]">{item.label}</span>
                  <span className={item.done ? "text-[#3B6D11]" : "text-[var(--color-text-secondary)]"}>
                    {item.done ? "Pronto" : "Pendente"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Stock card */}
          <div className="admin-card p-5 flex flex-col gap-4">
            <h3 className="font-[family-name:var(--font-sora)] font-semibold text-sm">
              Stock
            </h3>
            <Toggle value={manageStock} onChange={setManageStock} label="Gerir stock" />
            {manageStock && (
              <>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                    Quantidade em stock
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="admin-input font-[family-name:var(--font-sora)] font-semibold text-sm"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                    Stock mínimo para alerta
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="admin-input text-sm"
                    value={minStock}
                    onChange={(e) => setMinStock(e.target.value)}
                  />
                </div>
              </>
            )}
            <Toggle
              value={allowOutOfStock}
              onChange={setAllowOutOfStock}
              label="Permitir compra sem stock"
            />
          </div>

          {/* SEO card */}
          <div className="admin-card p-5 flex flex-col gap-4">
            <h3 className="font-[family-name:var(--font-sora)] font-semibold text-sm">SEO</h3>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                Título SEO
              </label>
              <input
                className="admin-input text-sm"
                placeholder={name || "Título da página"}
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                <span>Meta description</span>
                <span
                  className={
                    seoDescription.length > 160
                      ? "text-[var(--color-danger)]"
                      : seoDescription.length > 140
                      ? "text-yellow-500"
                      : "text-[var(--color-text-secondary)]"
                  }
                >
                  {seoDescription.length}/160
                </span>
              </label>
              <textarea
                className="admin-input resize-none text-sm"
                rows={3}
                placeholder="Descrição para motores de busca…"
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value.slice(0, 160))}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                Slug
              </label>
              <input
                className="admin-input font-mono text-sm"
                value={slug}
                onChange={(e) => {
                  setSlugManual(true);
                  setSlug(slugify(e.target.value));
                }}
              />
              {slug && (
                <p className="mt-1.5 break-all text-[10px] text-[var(--color-text-secondary)]">
                  …/product/<span className="text-[var(--color-danger)] font-mono">{slug}</span>
                </p>
              )}
            </div>
          </div>

          {/* Pricing card */}
          <div className="admin-card p-5 flex flex-col gap-4">
            <h3 className="font-[family-name:var(--font-sora)] font-semibold text-sm">
              Preço e margem
            </h3>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                Custo do produto (MZN)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="admin-input font-[family-name:var(--font-sora)] text-sm"
                placeholder="0.00"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                Preço de venda (MZN)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="admin-input font-[family-name:var(--font-sora)] font-semibold text-sm"
                placeholder="0.00"
                value={finalPrice}
                onChange={(e) => setFinalPrice(e.target.value)}
              />
            </div>

            {pp > 0 && fp > 0 && (
              <div
                className={`rounded-2xl p-3 ${
                  marginValue >= 0
                    ? "bg-[rgba(59,109,17,0.08)]"
                    : "bg-[rgba(232,67,26,0.08)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
                    Margem
                  </span>
                  <span
                    className={`font-[family-name:var(--font-sora)] text-sm font-bold ${
                      marginValue >= 0 ? "text-[#3B6D11]" : "text-[var(--color-danger)]"
                    }`}
                  >
                    {marginValue >= 0 ? "+" : ""}
                    {marginValue.toFixed(2)} MZN
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-[var(--color-text-secondary)]">Percentagem</span>
                  <span
                    className={`font-[family-name:var(--font-sora)] text-xs font-semibold ${
                      marginValue >= 0 ? "text-[#3B6D11]" : "text-[var(--color-danger)]"
                    }`}
                  >
                    {marginValue >= 0 ? "+" : ""}
                    {marginPct.toFixed(1)}%
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ImagePickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handlePickFromLibrary}
        multi
      />
    </div>
  );
}

// ── Variant key helpers ───────────────────────────────────────────────────

function variantKey(size: string, color: string) {
  return `${size}|${color}`;
}

function buildVariantKeys(
  sizes: string[],
  colors: ColorVariant[]
): Array<{ key: string; label: string }> {
  if (sizes.length === 0 && colors.length === 0) return [];
  if (sizes.length === 0) {
    return colors.map((c) => ({ key: variantKey("", c.name), label: c.name }));
  }
  if (colors.length === 0) {
    return sizes.map((s) => ({ key: variantKey(s, ""), label: s }));
  }
  const result: Array<{ key: string; label: string }> = [];
  for (const s of sizes) {
    for (const c of colors) {
      result.push({ key: variantKey(s, c.name), label: `${s} — ${c.name}` });
    }
  }
  return result;
}

// ── Tiny sub-components ───────────────────────────────────────────────────

function HeroStat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
        {label}
      </p>
      <p
        className={`mt-2 font-[family-name:var(--font-sora)] text-sm font-semibold ${
          accent ? "text-[var(--color-danger)]" : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function FieldHint({ text }: { text: string }) {
  return <p className="mt-1.5 text-xs leading-5 text-[var(--color-text-secondary)]">{text}</p>;
}

function Toggle({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex items-center justify-between gap-3 text-sm text-[var(--color-text-primary)]"
    >
      <span>{label}</span>
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
          value ? "bg-[var(--color-danger)]" : "bg-[var(--color-border-strong)]"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            value ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}

function ToolbarBtn({
  label,
  title,
  onClick,
  bold,
  italic,
}: {
  label: string;
  title: string;
  onClick: () => void;
  bold?: boolean;
  italic?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="rounded-lg px-2.5 py-1 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-background)] hover:text-[var(--color-text-primary)] transition-colors"
      style={{ fontWeight: bold ? 700 : 400, fontStyle: italic ? "italic" : "normal" }}
    >
      {label}
    </button>
  );
}

function UploadIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-[var(--color-text-secondary)]"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
