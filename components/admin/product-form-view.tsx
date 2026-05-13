"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminApiFetch } from "@/lib/admin/api-client";
import type {
  AdminProduct,
  AdminProductCategory,
  AdminProductVariant,
  AdminProductVideo,
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

function variantKey(size: string, color: string): string {
  return `${size.trim()}::${color.trim()}`;
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
  "image/gif",
  "image/bmp",
  "image/tiff",
  "image/svg+xml",
];

const ACCEPTED_IMAGE_INPUT = "image/*";

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

type VariantBuilderType =
  | "COLOR"
  | "SIZE"
  | "COLOR_SIZE"
  | "MODEL"
  | "CAPACITY"
  | "EYEWEAR"
  | "TECH"
  | "CUSTOM";

type BuilderAttribute = {
  id: string;
  name: string;
  values: string;
};

type GeneratedVariantDraft = {
  id: string;
  label: string;
  sku: string;
  purchasePrice: string;
  price: string;
  promotionalPrice: string;
  stock: string;
  active: boolean;
  attributes: Record<string, string>;
  mainImageUrl: string;
  imageFile: File | null;
  imagePreview: string | null;
  error?: string;
};

function calculateVariantProfit(cost: string | number | null | undefined, price: string | number | null | undefined, promo?: string | number | null) {
  const c = Number(cost || 0);
  const p = Number(promo || price || 0);
  return p - c;
}

function calculateVariantMargin(cost: string | number | null | undefined, price: string | number | null | undefined, promo?: string | number | null) {
  const effective = Number(promo || price || 0);
  if (!effective) return 0;
  return (calculateVariantProfit(cost, price, promo) / effective) * 100;
}

const VARIANT_PRESETS: Array<{
  type: VariantBuilderType;
  label: string;
  hint: string;
  attributes: string[];
}> = [
  { type: "COLOR", label: "Apenas cor", hint: "Ex: Preto, Verde, Castanho", attributes: ["Cor"] },
  { type: "SIZE", label: "Apenas tamanho", hint: "Ex: P, M, G", attributes: ["Tamanho"] },
  { type: "COLOR_SIZE", label: "Cor + tamanho", hint: "Gera todas as combinacoes", attributes: ["Cor", "Tamanho"] },
  { type: "MODEL", label: "Modelo / foto", hint: "Ex: Classico, Premium", attributes: ["Modelo"] },
  { type: "CAPACITY", label: "Capacidade", hint: "Ex: 64GB, 128GB", attributes: ["Armazenamento"] },
  { type: "EYEWEAR", label: "Oculos", hint: "Lente e armacao", attributes: ["Cor da lente", "Cor da armacao"] },
  { type: "TECH", label: "Tecnologia", hint: "Armazenamento, RAM e cor", attributes: ["Armazenamento", "RAM", "Cor"] },
  { type: "CUSTOM", label: "Personalizado", hint: "Define os atributos livremente", attributes: [""] },
];

const VISUAL_ATTRIBUTE_PATTERN = /(cor|modelo|design|estampa|lente|armacao|armação)/i;

function presetAttributes(type: VariantBuilderType): BuilderAttribute[] {
  const preset = VARIANT_PRESETS.find((item) => item.type === type) ?? VARIANT_PRESETS[0];
  return preset.attributes.map((name) => ({ id: uid(), name, values: "" }));
}

function splitVariantValues(raw: string): string[] {
  const seen = new Set<string>();
  return raw
    .split(/[,\n;]/)
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeAttributesKey(attributes: Record<string, string>): string {
  return Object.entries(attributes)
    .map(([key, value]) => [key.trim().toLowerCase(), String(value).trim().toLowerCase()] as const)
    .filter(([key, value]) => key && value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}`)
    .join("|");
}

function labelFromAttributes(attributes: Record<string, string>): string {
  return Object.values(attributes).filter(Boolean).join(" / ");
}

function skuFromAttributes(baseSku: string, productName: string, attributes: Record<string, string>): string {
  const base = (baseSku || generateSku(productName) || "VAR").toUpperCase();
  const suffix = Object.values(attributes)
    .map((value) => slugify(String(value)).replace(/-/g, "").toUpperCase().slice(0, 8))
    .filter(Boolean)
    .join("-");
  return `${base}-${suffix}`.replace(/-+/g, "-").slice(0, 60);
}

function buildAttributeCombinations(attributes: Array<{ name: string; values: string[] }>): Record<string, string>[] {
  return attributes.reduce<Record<string, string>[]>(
    (acc, attribute) =>
      acc.flatMap((combo) =>
        attribute.values.map((value) => ({
          ...combo,
          [attribute.name]: value,
        }))
      ),
    [{}]
  );
}

function primaryVisualAttribute(attributes: Record<string, string>): { key: string; value: string } | null {
  const entry = Object.entries(attributes).find(([key]) => VISUAL_ATTRIBUTE_PATTERN.test(key));
  return entry ? { key: entry[0], value: entry[1] } : null;
}

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

  // ── Rich content ──────────────────────────────────────────────────────
  const [shortDescription, setShortDescription] = useState("");
  const [deliveryInfo, setDeliveryInfo] = useState("");
  const [warrantyInfo, setWarrantyInfo] = useState("");
  const [returnPolicy, setReturnPolicy] = useState("");
  const [usageGuide, setUsageGuide] = useState("");
  const [packageItems, setPackageItems] = useState<string[]>([]);

  // ── Edit-mode live variant/video state ────────────────────────────────
  const [editVariants, setEditVariants] = useState<AdminProductVariant[]>([]);
  const [editVideos, setEditVideos] = useState<AdminProductVideo[]>([]);
  const [variantSaving, setVariantSaving] = useState(false);
  const [newVariantAttrs, setNewVariantAttrs] = useState<Array<{ key: string; value: string }>>([{ key: "", value: "" }]);
  const [newVariantPurchasePrice, setNewVariantPurchasePrice] = useState("");
  const [newVariantPrice, setNewVariantPrice] = useState("");
  const [newVariantPromotionalPrice, setNewVariantPromotionalPrice] = useState("");
  const [newVariantStock, setNewVariantStock] = useState("0");
  const [newVariantSku, setNewVariantSku] = useState("");
  const [newVariantImageUrl, setNewVariantImageUrl] = useState("");
  const [newVariantImageFile, setNewVariantImageFile] = useState<File | null>(null);
  const [newVariantImagePreview, setNewVariantImagePreview] = useState<string | null>(null);
  const newVariantImageInputRef = useRef<HTMLInputElement>(null);
  const [variantBuilderType, setVariantBuilderType] = useState<VariantBuilderType>("COLOR");
  const [builderAttrs, setBuilderAttrs] = useState<BuilderAttribute[]>(() => presetAttributes("COLOR"));
  const [builderBasePurchasePrice, setBuilderBasePurchasePrice] = useState(initialDraft?.purchasePrice ?? "");
  const [builderBasePrice, setBuilderBasePrice] = useState(initialDraft?.finalPrice ?? "");
  const [builderBasePromotionalPrice, setBuilderBasePromotionalPrice] = useState("");
  const [builderBaseStock, setBuilderBaseStock] = useState("0");
  const [builderRows, setBuilderRows] = useState<GeneratedVariantDraft[]>([]);
  const [builderFeedback, setBuilderFeedback] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [builderProgress, setBuilderProgress] = useState<{ done: number; total: number } | null>(null);
  const [builderSaving, setBuilderSaving] = useState(false);
  const builderImageInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [newVideoUrl, setNewVideoUrl] = useState("");
  const [newVideoTitle, setNewVideoTitle] = useState("");
  const [videoSaving, setVideoSaving] = useState(false);

  // ── Inline variant edit state ─────────────────────────────────────────
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    attrs: Array<{ key: string; value: string }>;
    sku: string;
    price: string;
    purchasePrice: string;
    promotionalPrice: string;
    stock: string;
    active: boolean;
    imageFile: File | null;
    imagePreview: string | null;
  }>({ attrs: [], sku: "", price: "", purchasePrice: "", promotionalPrice: "", stock: "0", active: true, imageFile: null, imagePreview: null });
  const [editSaving, setEditSaving] = useState(false);
  const [galleryPickerOpen, setGalleryPickerOpen] = useState(false);
  const editImageInputRef = useRef<HTMLInputElement>(null);

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
  const activeVariantStockTotal = editVariants
    .filter((variant) => variant.active)
    .reduce((sum, variant) => sum + (Number(variant.stock) || 0), 0);
  const showBuilderImageControls = ["COLOR", "COLOR_SIZE", "MODEL", "EYEWEAR", "TECH"].includes(variantBuilderType);
  const showBuilderUploadControls = ["MODEL", "EYEWEAR", "TECH"].includes(variantBuilderType);
  const hasLiveVariants = isEdit && editVariants.length > 0;

  function imageSourceLabel(url: string | null | undefined): string {
    if (!url) return "Sem imagem";
    const galleryUrls = new Set(images.flatMap((image) => [image.url, image.thumbnailUrl].filter(Boolean) as string[]));
    return galleryUrls.has(url) ? "Galeria" : "Upload";
  }

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

        setShortDescription(product.shortDescription ?? "");
        setDeliveryInfo(product.deliveryInfo ?? "");
        setWarrantyInfo(product.warrantyInfo ?? "");
        setReturnPolicy(product.returnPolicy ?? "");
        setUsageGuide(product.usageGuide ?? "");
        setPackageItems(product.packageItems ?? []);

        if (product.specifications) {
          const rows = Object.entries(product.specifications).map(([key, value]) => ({
            id: uid(),
            key,
            value,
          }));
          setSpecs(rows);
        }

        setSkuManual(true);
        setSku(generateSku(product.name));
        setSlugManual(Boolean(product.slug));
        setSlug(product.slug ?? slugify(product.name));
        setSeoTitle(product.name);

        // Load live variants and videos
        adminApiFetch<AdminProductVariant[]>(`/api/admin/products/${productId}/variants`)
          .then(setEditVariants)
          .catch(() => {});
        adminApiFetch<AdminProductVideo[]>(`/api/admin/products/${productId}/videos`)
          .then(setEditVideos)
          .catch(() => {});
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

  // ── Package items ─────────────────────────────────────────────────────
  function addPackageItem() {
    setPackageItems((prev) => [...prev, ""]);
  }
  function updatePackageItem(index: number, value: string) {
    setPackageItems((prev) => prev.map((item, i) => (i === index ? value : item)));
  }
  function removePackageItem(index: number) {
    setPackageItems((prev) => prev.filter((_, i) => i !== index));
  }

  // ── Edit-mode variant helpers ─────────────────────────────────────────
  async function handleAddVariant() {
    if (!productId || !newVariantPrice) return;
    setVariantSaving(true);
    try {
      const attributes = newVariantAttrs
        .filter((a) => a.key.trim())
        .reduce<Record<string, string>>((acc, a) => { acc[a.key.trim()] = a.value; return acc; }, {});
      let created = await adminApiFetch<AdminProductVariant>(
        `/api/admin/products/${productId}/variants`,
        {
          method: "POST",
          body: JSON.stringify({
            sku: newVariantSku || undefined,
            purchasePrice: parseFloat(newVariantPurchasePrice) || 0,
            finalPrice: parseFloat(newVariantPrice),
            promotionalPrice: newVariantPromotionalPrice ? parseFloat(newVariantPromotionalPrice) : undefined,
            stock: parseInt(newVariantStock) || 0,
            active: true,
            mainImageUrl: newVariantImageUrl.trim() || undefined,
            attributes,
          }),
        }
      );
      if (newVariantImageFile) {
        created = (await uploadVariantImage(created.id, newVariantImageFile)) ?? created;
      }
      setEditVariants((prev) => [...prev, created]);
      setNewVariantAttrs([{ key: "", value: "" }]);
      setNewVariantPrice("");
      setNewVariantPurchasePrice("");
      setNewVariantPromotionalPrice("");
      setNewVariantStock("0");
      setNewVariantSku("");
      setNewVariantImageUrl("");
      if (newVariantImagePreview?.startsWith("blob:")) URL.revokeObjectURL(newVariantImagePreview);
      setNewVariantImageFile(null);
      setNewVariantImagePreview(null);
    } catch {
      // silent — user sees no change
    } finally {
      setVariantSaving(false);
    }
  }

  function handleNewVariantImageFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Formato invalido. Carrega um ficheiro de imagem.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      alert("Imagem demasiado grande. Maximo 8 MB.");
      return;
    }
    if (newVariantImagePreview?.startsWith("blob:")) URL.revokeObjectURL(newVariantImagePreview);
    setNewVariantImageFile(file);
    setNewVariantImagePreview(URL.createObjectURL(file));
    setNewVariantImageUrl("");
  }

  function applyVariantPreset(type: VariantBuilderType) {
    setVariantBuilderType(type);
    setBuilderAttrs(presetAttributes(type));
    setBuilderRows([]);
    setBuilderFeedback(null);
  }

  function updateBuilderAttr(id: string, field: "name" | "values", value: string) {
    setBuilderAttrs((prev) => prev.map((attr) => (attr.id === id ? { ...attr, [field]: value } : attr)));
  }

  function addColorToBuilderAttr(id: string, colorName: string) {
    setBuilderAttrs((prev) =>
      prev.map((attr) => {
        if (attr.id !== id) return attr;
        const values = splitVariantValues(attr.values);
        if (!values.some((value) => value.toLowerCase() === colorName.toLowerCase())) {
          values.push(colorName);
        }
        return { ...attr, values: values.join(", ") };
      })
    );
  }

  function addBuilderAttr() {
    setBuilderAttrs((prev) => [...prev, { id: uid(), name: "", values: "" }]);
  }

  function removeBuilderAttr(id: string) {
    setBuilderAttrs((prev) => (prev.length <= 1 ? prev : prev.filter((attr) => attr.id !== id)));
  }

  function updateBuilderRow(id: string, patch: Partial<GeneratedVariantDraft>) {
    setBuilderRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch, error: undefined } : row)));
  }

  function removeBuilderRow(id: string) {
    setBuilderRows((prev) => {
      const removed = prev.find((row) => row.id === id);
      if (removed?.imagePreview?.startsWith("blob:")) URL.revokeObjectURL(removed.imagePreview);
      return prev.filter((row) => row.id !== id);
    });
  }

  function generateBuilderVariants() {
    const prepared = builderAttrs
      .map((attr) => ({ name: attr.name.trim(), values: splitVariantValues(attr.values) }))
      .filter((attr) => attr.name);

    if (prepared.length === 0 || prepared.some((attr) => attr.values.length === 0)) {
      setBuilderFeedback({ type: "error", message: "Define pelo menos um atributo e um valor por atributo." });
      return;
    }

    const duplicateAttrNames = new Set<string>();
    const attrNameSeen = new Set<string>();
    prepared.forEach((attr) => {
      const key = attr.name.toLowerCase();
      if (attrNameSeen.has(key)) duplicateAttrNames.add(attr.name);
      attrNameSeen.add(key);
    });
    if (duplicateAttrNames.size > 0) {
      setBuilderFeedback({ type: "error", message: "Existem atributos repetidos. Junta os valores no mesmo campo." });
      return;
    }

    const existingKeys = new Set(editVariants.map((variant) => normalizeAttributesKey(variant.attributes || {})));
    const generatedKeys = new Set<string>();
    const defaultPrice = builderBasePrice || finalPrice || newVariantPrice;
    const defaultPurchasePrice = builderBasePurchasePrice || purchasePrice || newVariantPurchasePrice || "";
    const defaultPromotionalPrice = builderBasePromotionalPrice || "";
    const defaultStock = builderBaseStock || "0";
    const combinations = buildAttributeCombinations(prepared);
    const rows: GeneratedVariantDraft[] = [];
    let skipped = 0;

    combinations.forEach((attributes) => {
      const key = normalizeAttributesKey(attributes);
      if (!key || generatedKeys.has(key) || existingKeys.has(key)) {
        skipped += 1;
        return;
      }
      generatedKeys.add(key);
      rows.push({
        id: uid(),
        label: labelFromAttributes(attributes),
        sku: skuFromAttributes(sku, name, attributes),
        purchasePrice: defaultPurchasePrice,
        price: defaultPrice,
        promotionalPrice: defaultPromotionalPrice,
        stock: defaultStock,
        active: true,
        attributes,
        mainImageUrl: "",
        imageFile: null,
        imagePreview: null,
      });
    });

    setBuilderRows(rows);
    setBuilderFeedback({
      type: rows.length > 0 ? "success" : "info",
      message:
        rows.length > 0
          ? `${rows.length} variantes geradas${skipped ? `, ${skipped} duplicadas ignoradas` : ""}.`
          : "Todas as combinacoes ja existem neste produto.",
    });
  }

  function applyBuilderPriceToAll() {
    if (!builderBasePrice) return;
    setBuilderRows((prev) => prev.map((row) => ({ ...row, price: builderBasePrice })));
  }

  function applyBuilderStockToAll() {
    setBuilderRows((prev) => prev.map((row) => ({ ...row, stock: builderBaseStock || "0" })));
  }

  function handleBuilderImageFile(rowId: string, file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setBuilderFeedback({ type: "error", message: "Formato invalido. Carrega um ficheiro de imagem." });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setBuilderFeedback({ type: "error", message: "Imagem demasiado grande. Maximo 8 MB." });
      return;
    }
    setBuilderRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        if (row.imagePreview?.startsWith("blob:")) URL.revokeObjectURL(row.imagePreview);
        return {
          ...row,
          imageFile: file,
          imagePreview: URL.createObjectURL(file),
          mainImageUrl: "",
          error: undefined,
        };
      })
    );
  }

  function applyImageToVisualGroup(rowId: string) {
    const source = builderRows.find((row) => row.id === rowId);
    if (!source) return;
    const visual = primaryVisualAttribute(source.attributes);
    const imageUrl = source.imagePreview || source.mainImageUrl;
    if (!visual || !imageUrl) return;
    setBuilderRows((prev) =>
      prev.map((row) => {
        const candidate = primaryVisualAttribute(row.attributes);
        if (!candidate || candidate.key !== visual.key || candidate.value !== visual.value) return row;
        return {
          ...row,
          mainImageUrl: source.mainImageUrl,
          imageFile: source.imageFile,
          imagePreview: source.imagePreview,
        };
      })
    );
    setBuilderFeedback({ type: "success", message: `Imagem aplicada a todas as variantes com ${visual.key}: ${visual.value}.` });
  }

  async function uploadVariantImage(variantId: string, file: File) {
    if (!productId) return null;
    const fd = new FormData();
    fd.append("file", file);
    return adminApiFetch<AdminProductVariant>(
      `/api/admin/products/${productId}/variants/${variantId}/image`,
      { method: "POST", body: fd }
    );
  }

  async function saveGeneratedVariants() {
    if (!productId || builderRows.length === 0) return;

    const existingKeys = new Set(editVariants.map((variant) => normalizeAttributesKey(variant.attributes || {})));
    const seenKeys = new Set<string>();
    const seenSkus = new Set<string>();
    const validated = builderRows.map((row) => {
      const key = normalizeAttributesKey(row.attributes);
      const rowSku = row.sku.trim().toLowerCase();
      if (Number(row.purchasePrice) < 0) return { ...row, error: "Custo nao pode ser negativo." };
      if (!row.price || Number(row.price) <= 0) return { ...row, error: "Preco obrigatorio." };
      if (row.promotionalPrice && (Number(row.promotionalPrice) <= 0 || Number(row.promotionalPrice) >= Number(row.price))) {
        return { ...row, error: "Promocao deve ser menor que venda." };
      }
      if (Number(row.stock) < 0) return { ...row, error: "Stock nao pode ser negativo." };
      if (!key) return { ...row, error: "Atributos obrigatorios." };
      if (existingKeys.has(key) || seenKeys.has(key)) return { ...row, error: "Variante duplicada." };
      if (rowSku && seenSkus.has(rowSku)) return { ...row, error: "SKU duplicado nesta criacao." };
      seenKeys.add(key);
      if (rowSku) seenSkus.add(rowSku);
      return { ...row, error: undefined };
    });

    const invalid = validated.filter((row) => row.error);
    if (invalid.length > 0) {
      setBuilderRows(validated);
      setBuilderFeedback({ type: "error", message: "Corrige as variantes marcadas antes de guardar." });
      return;
    }

    setBuilderSaving(true);
    setBuilderProgress({ done: 0, total: validated.length });
    const createdVariants: AdminProductVariant[] = [];
    const failedRows: GeneratedVariantDraft[] = [];

    for (let index = 0; index < validated.length; index += 1) {
      const row = validated[index];
      try {
        let created = await adminApiFetch<AdminProductVariant>(
          `/api/admin/products/${productId}/variants`,
          {
            method: "POST",
            body: JSON.stringify({
              sku: row.sku.trim() || undefined,
              purchasePrice: parseFloat(row.purchasePrice) || 0,
              finalPrice: parseFloat(row.price),
              promotionalPrice: row.promotionalPrice ? parseFloat(row.promotionalPrice) : undefined,
              stock: parseInt(row.stock) || 0,
              active: row.active,
              mainImageUrl: row.mainImageUrl.trim() || undefined,
              attributes: row.attributes,
            }),
          }
        );
        if (row.imageFile) {
          created = (await uploadVariantImage(created.id, row.imageFile)) ?? created;
        }
        createdVariants.push(created);
      } catch (error) {
        failedRows.push({
          ...row,
          error: error instanceof Error ? error.message : "Falha ao criar esta variante.",
        });
      } finally {
        setBuilderProgress({ done: index + 1, total: validated.length });
      }
    }

    setEditVariants((prev) => [...prev, ...createdVariants]);
    setBuilderRows(failedRows);
    setBuilderSaving(false);
    setBuilderProgress(null);
    setBuilderFeedback({
      type: failedRows.length > 0 ? "error" : "success",
      message:
        failedRows.length > 0
          ? `${createdVariants.length} variantes criadas. ${failedRows.length} precisam de revisao.`
          : `${createdVariants.length} variantes guardadas com sucesso.`,
    });
  }

  async function handleDeleteVariant(variantId: string) {
    if (!productId) return;
    const variant = editVariants.find((item) => item.id === variantId);
    const label = variant?.label || variant?.sku || "esta variante";
    const confirmed = window.confirm(`Desejas mesmo eliminar ${label}? Esta acao nao pode ser desfeita.`);
    if (!confirmed) return;
    try {
      await adminApiFetch(`/api/admin/products/${productId}/variants/${variantId}`, {
        method: "DELETE",
      });
      setEditVariants((prev) => prev.filter((v) => v.id !== variantId));
    } catch {
      // silent
    }
  }

  async function handleToggleVariantActive(variant: AdminProductVariant) {
    if (!productId) return;
    try {
      const updated = await adminApiFetch<AdminProductVariant>(
        `/api/admin/products/${productId}/variants/${variant.id}/active?active=${!variant.active}`,
        { method: "PATCH" }
      );
      setEditVariants((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
    } catch {
      // silent
    }
  }

  // ── Inline variant edit helpers ───────────────────────────────────────
  function startEdit(v: AdminProductVariant) {
    const attrs = Object.entries(v.attributes || {}).map(([key, value]) => ({ key, value }));
    setEditForm({
      attrs: attrs.length > 0 ? attrs : [{ key: "", value: "" }],
      sku: v.sku ?? "",
      purchasePrice: String(v.purchasePrice ?? ""),
      price: String(v.finalPrice ?? ""),
      promotionalPrice: String(v.promotionalPrice ?? ""),
      stock: String(v.stock),
      active: v.active,
      imageFile: null,
      imagePreview: v.mainImageUrl ?? null,
    });
    setEditingVariantId(v.id);
    setGalleryPickerOpen(false);
  }

  function cancelEdit() {
    if (editForm.imageFile && editForm.imagePreview) {
      URL.revokeObjectURL(editForm.imagePreview);
    }
    setEditingVariantId(null);
    setGalleryPickerOpen(false);
  }

  function handleEditImageFile(file: File | null) {
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif", "image/bmp", "image/tiff"];
    if (!allowed.includes(file.type)) {
      alert("Formato inválido. Use JPEG, PNG ou WebP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("Imagem demasiado grande. Máximo 5 MB.");
      return;
    }
    if (editForm.imageFile && editForm.imagePreview) {
      URL.revokeObjectURL(editForm.imagePreview);
    }
    setEditForm((prev) => ({ ...prev, imageFile: file, imagePreview: URL.createObjectURL(file) }));
  }

  async function applyVariantImageUrl(variantId: string, mainImageUrl: string | null) {
    if (!productId) return;
    const updated = await adminApiFetch<AdminProductVariant>(
      `/api/admin/products/${productId}/variants/${variantId}/image-url`,
      {
        method: "PATCH",
        body: JSON.stringify({ mainImageUrl }),
      }
    );
    setEditVariants((prev) => prev.map((variant) => (variant.id === updated.id ? updated : variant)));
    setEditForm((prev) => ({ ...prev, imageFile: null, imagePreview: updated.mainImageUrl ?? null }));
  }

  async function handleSelectGalleryImage(url: string) {
    if (!editingVariantId) return;
    try {
      await applyVariantImageUrl(editingVariantId, url);
      setGalleryPickerOpen(false);
    } catch {
      // silent — user can retry
    }
  }

  async function handleRemoveVariantImage() {
    if (!editingVariantId) return;
    try {
      await applyVariantImageUrl(editingVariantId, null);
      setGalleryPickerOpen(false);
    } catch {
      // silent — user can retry
    }
  }

  async function saveEdit() {
    if (!productId || !editingVariantId) return;
    setEditSaving(true);
    try {
      let uploadedUrl: string | null = null;

      if (editForm.imageFile) {
        const fd = new FormData();
        fd.append("file", editForm.imageFile);
        const token = typeof window !== "undefined" ? (localStorage.getItem("shopee_admin_token") ?? "") : "";
        const imgRes = await fetch(
          `/api/admin/products/${productId}/variants/${editingVariantId}/image`,
          { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd }
        );
        if (imgRes.ok) {
          const imgData = (await imgRes.json()) as AdminProductVariant;
          uploadedUrl = imgData.mainImageUrl ?? null;
        }
      }

      const attributes = editForm.attrs
        .filter((a) => a.key.trim())
        .reduce<Record<string, string>>((acc, a) => { acc[a.key.trim()] = a.value; return acc; }, {});

      const payload: Record<string, unknown> = {
        sku: editForm.sku.trim() || undefined,
        purchasePrice: parseFloat(editForm.purchasePrice) || 0,
        finalPrice: parseFloat(editForm.price) || 0,
        promotionalPrice: editForm.promotionalPrice ? parseFloat(editForm.promotionalPrice) : undefined,
        stock: parseInt(editForm.stock) || 0,
        active: editForm.active,
        attributes,
      };

      if (uploadedUrl !== null) {
        payload.mainImageUrl = uploadedUrl;
      } else if (!editForm.imageFile && editForm.imagePreview) {
        payload.mainImageUrl = editForm.imagePreview;
      }

      const updated = await adminApiFetch<AdminProductVariant>(
        `/api/admin/products/${productId}/variants/${editingVariantId}`,
        { method: "PUT", body: JSON.stringify(payload) }
      );

      setEditVariants((prev) => prev.map((v) => (v.id === editingVariantId ? updated : v)));
      if (editForm.imageFile && editForm.imagePreview) URL.revokeObjectURL(editForm.imagePreview);
      setEditingVariantId(null);
    } catch {
      // silent — user retries
    } finally {
      setEditSaving(false);
    }
  }

  // ── Edit-mode video helpers ───────────────────────────────────────────
  async function handleAddVideo() {
    if (!productId || !newVideoUrl.trim()) return;
    setVideoSaving(true);
    try {
      const created = await adminApiFetch<AdminProductVideo>(
        `/api/admin/products/${productId}/videos`,
        {
          method: "POST",
          body: JSON.stringify({
            url: newVideoUrl.trim(),
            title: newVideoTitle.trim() || undefined,
            type: "EXTERNAL_URL",
            active: true,
          }),
        }
      );
      setEditVideos((prev) => [...prev, created]);
      setNewVideoUrl("");
      setNewVideoTitle("");
    } catch {
      // silent
    } finally {
      setVideoSaving(false);
    }
  }

  async function handleDeleteVideo(videoId: number) {
    if (!productId) return;
    try {
      await adminApiFetch(`/api/admin/products/${productId}/videos/${videoId}`, {
        method: "DELETE",
      });
      setEditVideos((prev) => prev.filter((v) => v.id !== videoId));
    } catch {
      // silent
    }
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
    const specsMap = specs.reduce<Record<string, string>>((acc, s) => {
      if (s.key.trim()) acc[s.key.trim()] = s.value;
      return acc;
    }, {});
    return {
      name: name.trim(),
      description: description.trim(),
      shortDescription: shortDescription.trim() || undefined,
      slug: slug.trim() || undefined,
      originalPrice: op || fp,
      purchasePrice: pp || fp,
      profitMargin: profitMargin > 0 ? profitMargin : 0,
      finalPrice: fp,
      categoryId: Number(subcategoryId || categoryId),
      subCategory: undefined,
      weight: weight ? parseFloat(weight) : undefined,
      volume: volume ? parseFloat(volume) : undefined,
      stock: hasLiveVariants ? activeVariantStockTotal : parseInt(stock) || 0,
      active: asActive,
      deliveryInfo: deliveryInfo.trim() || undefined,
      warrantyInfo: warrantyInfo.trim() || undefined,
      returnPolicy: returnPolicy.trim() || undefined,
      usageGuide: usageGuide.trim() || undefined,
      specifications: Object.keys(specsMap).length > 0 ? specsMap : undefined,
      packageItems: packageItems.filter(Boolean).length > 0 ? packageItems.filter(Boolean) : undefined,
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

            {/* Short description */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                Resumo curto{" "}
                <span className="ml-1 font-normal normal-case text-[var(--color-text-secondary)]">(opcional, max. 500 car.)</span>
              </label>
              <textarea
                className="admin-input resize-none text-sm"
                rows={2}
                placeholder="Frase breve que aparece no topo da ficha do produto…"
                value={shortDescription}
                maxLength={500}
                onChange={(e) => setShortDescription(e.target.value)}
              />
              <FieldHint text="Aparece na listagem e no topo da ficha do produto, antes da descricao longa." />
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
            <h2 className="font-[family-name:var(--font-sora)] font-semibold text-base">
              Variantes
            </h2>

            {isEdit ? (
              /* ── Edit mode: professional variant manager ── */
              <div className="flex flex-col gap-4">
                {editVariants.length > 0 && (
                  <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-tertiary)] p-4">
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">Este produto usa preco e stock por variante.</p>
                    <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                      Stock total: <strong>{activeVariantStockTotal}</strong> unidades. O preco global fica apenas como resumo do menor preco activo.
                    </p>
                  </div>
                )}

                {/* Hidden file input for inline edit image upload */}
                <input
                  ref={editImageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/bmp,image/tiff"
                  className="hidden"
                  onChange={(e) => handleEditImageFile(e.target.files?.[0] ?? null)}
                />

                {/* Variant list */}
                {editVariants.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--color-border-strong)] py-10 text-center">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="1.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
                    <p className="text-sm font-semibold text-[var(--color-text-secondary)]">Sem variantes ainda</p>
                    <p className="text-xs text-[var(--color-text-secondary)]">Adiciona a primeira variante abaixo.</p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-[var(--color-border)]">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--color-border)] bg-[var(--color-background-tertiary)]">
                          <th className="w-12 px-3 py-2.5" />
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-text-secondary)]">Variante</th>
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-[var(--color-text-secondary)]">Preço</th>
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-[var(--color-text-secondary)]">Lucro</th>
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-[var(--color-text-secondary)]">Margem</th>
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-[var(--color-text-secondary)]">Stock</th>
                          <th className="px-4 py-2.5 text-center text-xs font-semibold text-[var(--color-text-secondary)]">Estado</th>
                          <th className="px-3 py-2.5 text-right text-xs font-semibold text-[var(--color-text-secondary)]">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {editVariants.map((v) => (
                          <tr
                            key={v.id}
                            className="border-b border-[var(--color-border)] last:border-0 transition-colors"
                            style={{ background: editingVariantId === v.id ? "rgba(232,67,26,0.04)" : undefined }}
                          >
                            {/* Thumbnail — click to open edit for this variant */}
                            <td className="px-3 py-2.5">
                              <button
                                type="button"
                                onClick={() => editingVariantId !== v.id && startEdit(v)}
                                title={v.mainImageUrl ? "Clique para editar" : "Sem imagem — clique para adicionar"}
                                className="group relative h-10 w-10 overflow-hidden rounded-xl border border-[var(--color-border)] transition hover:border-[var(--color-danger)] focus:outline-none"
                              >
                                {v.mainImageUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={v.mainImageUrl} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center bg-[var(--color-background-tertiary)]">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                                  </div>
                                )}
                                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                </div>
                              </button>
                            </td>
                            {/* Label + SKU */}
                            <td className="px-4 py-2.5">
                              <p className="font-semibold text-[var(--color-text-primary)]">{v.label || `#${v.id}`}</p>
                              {v.sku && <p className="mt-0.5 font-mono text-[10px] text-[var(--color-text-secondary)]">{v.sku}</p>}
                              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                                Imagem: {imageSourceLabel(v.mainImageUrl)}
                              </p>
                            </td>
                            {/* Price */}
                            <td className="px-4 py-2.5 text-right font-[family-name:var(--font-sora)] font-semibold text-[var(--color-text-primary)]">
                              {(v.effectivePrice ?? v.finalPrice ?? 0).toFixed(2)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-[family-name:var(--font-sora)] font-semibold text-green-600">
                              {(v.profitAmount ?? calculateVariantProfit(v.purchasePrice, v.effectivePrice ?? v.finalPrice)).toFixed(2)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-[family-name:var(--font-sora)] font-semibold text-[var(--color-text-primary)]">
                              {(v.marginPercentage ?? calculateVariantMargin(v.purchasePrice, v.finalPrice, v.promotionalPrice)).toFixed(1)}%
                            </td>
                            {/* Stock */}
                            <td className="px-4 py-2.5 text-right">
                              <span className={`font-semibold ${v.stock <= 0 ? "text-[var(--color-danger)]" : v.stock <= 5 ? "text-orange-500" : "text-[var(--color-text-primary)]"}`}>
                                {v.stock}
                              </span>
                            </td>
                            {/* Active toggle */}
                            <td className="px-4 py-2.5 text-center">
                              <button
                                onClick={() => handleToggleVariantActive(v)}
                                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${v.active ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                              >
                                {v.active ? "Activo" : "Inactivo"}
                              </button>
                            </td>
                            {/* Actions */}
                            <td className="px-3 py-2.5">
                              <div className="flex items-center justify-end gap-1">
                                {/* Image shortcut */}
                                <button
                                  onClick={() => {
                                    if (editingVariantId !== v.id) startEdit(v);
                                    setGalleryPickerOpen(true);
                                  }}
                                  title="Trocar imagem da variante"
                                  className="flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-background-tertiary)] hover:text-[var(--color-text-primary)]"
                                >
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                                  Img
                                </button>
                                {/* Edit / Cancel */}
                                <button
                                  onClick={() => editingVariantId === v.id ? cancelEdit() : startEdit(v)}
                                  title={editingVariantId === v.id ? "Cancelar edição" : "Editar variante"}
                                  className={`flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-medium transition-colors ${editingVariantId === v.id ? "bg-[rgba(232,67,26,0.1)] text-[var(--color-danger)]" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-background-tertiary)] hover:text-[var(--color-text-primary)]"}`}
                                >
                                  {editingVariantId === v.id ? (
                                    <>
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                      Cancelar
                                    </>
                                  ) : (
                                    <>
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                      Editar
                                    </>
                                  )}
                                </button>
                                {/* Delete */}
                                <button
                                  onClick={() => handleDeleteVariant(v.id)}
                                  title="Remover variante"
                                  className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-red-50 hover:text-[var(--color-danger)]"
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Inline edit panel */}
                    {editingVariantId && (
                      <div className="border-t-4 border-t-[var(--color-danger)] bg-[var(--color-background)] px-5 py-5">
                        <div className="mb-5 flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full bg-[var(--color-danger)]" />
                          <p className="text-sm font-bold text-[var(--color-text-primary)]">Editar variante</p>
                        </div>

                        {/* Attributes */}
                        <div className="mb-3 flex flex-col gap-2">
                          {editForm.attrs.map((attr, idx) => (
                            <div key={idx} className="flex gap-2 items-center">
                              <input
                                className="admin-input py-1.5 text-sm flex-1"
                                placeholder="Atributo (ex: Cor)"
                                value={attr.key}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, attrs: prev.attrs.map((a, i) => i === idx ? { ...a, key: e.target.value } : a) }))}
                              />
                              <input
                                className="admin-input py-1.5 text-sm flex-1"
                                placeholder="Valor (ex: Verde)"
                                value={attr.value}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, attrs: prev.attrs.map((a, i) => i === idx ? { ...a, value: e.target.value } : a) }))}
                              />
                              {editForm.attrs.length > 1 && (
                                <button onClick={() => setEditForm((prev) => ({ ...prev, attrs: prev.attrs.filter((_, i) => i !== idx) }))} className="text-[var(--color-text-secondary)] hover:text-[var(--color-danger)] text-sm">×</button>
                              )}
                            </div>
                          ))}
                          <button onClick={() => setEditForm((prev) => ({ ...prev, attrs: [...prev.attrs, { key: "", value: "" }] }))} className="self-start text-xs text-[var(--color-danger)] hover:underline">+ Atributo</button>
                        </div>

                        {/* SKU / Price / Stock / Active */}
                        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-6">
                          <div>
                            <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">SKU</label>
                            <input className="admin-input py-1.5 text-sm font-mono" value={editForm.sku} onChange={(e) => setEditForm((prev) => ({ ...prev, sku: e.target.value }))} />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">Custo</label>
                            <input type="number" min="0" step="0.01" className="admin-input py-1.5 text-sm" value={editForm.purchasePrice} onChange={(e) => setEditForm((prev) => ({ ...prev, purchasePrice: e.target.value }))} />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">Preço (MZN)</label>
                            <input type="number" min="0" step="0.01" className="admin-input py-1.5 text-sm" value={editForm.price} onChange={(e) => setEditForm((prev) => ({ ...prev, price: e.target.value }))} />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">Stock</label>
                            <input type="number" min="0" className="admin-input py-1.5 text-sm" value={editForm.stock} onChange={(e) => setEditForm((prev) => ({ ...prev, stock: e.target.value }))} />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">Promocao</label>
                            <input type="number" min="0" step="0.01" className="admin-input py-1.5 text-sm" value={editForm.promotionalPrice} onChange={(e) => setEditForm((prev) => ({ ...prev, promotionalPrice: e.target.value }))} />
                          </div>
                          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background-tertiary)] px-3 py-2 text-xs">
                            <p className="text-[var(--color-text-secondary)]">Lucro / margem</p>
                            <p className="font-bold text-green-600">{calculateVariantProfit(editForm.purchasePrice, editForm.price, editForm.promotionalPrice).toFixed(2)}</p>
                            <p className="text-[var(--color-text-secondary)]">{calculateVariantMargin(editForm.purchasePrice, editForm.price, editForm.promotionalPrice).toFixed(1)}%</p>
                          </div>
                          <div className="flex flex-col justify-end">
                            <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">Estado</label>
                            <button
                              onClick={() => setEditForm((prev) => ({ ...prev, active: !prev.active }))}
                              className={`rounded-xl border py-1.5 text-sm font-semibold transition-colors ${editForm.active ? "border-green-300 bg-green-50 text-green-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}
                            >
                              {editForm.active ? "Activo" : "Inactivo"}
                            </button>
                          </div>
                        </div>

                        {/* Image upload */}
                        <div className="mb-4">
                          <label className="mb-2 block text-xs font-semibold text-[var(--color-text-secondary)]">Imagem da variante</label>
                          <div className="flex items-start gap-4">
                            {editForm.imagePreview ? (
                              <div className="relative flex-none">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={editForm.imagePreview} alt="Preview" className="h-20 w-20 rounded-xl object-cover border-2 border-[var(--color-danger)]" />
                                <button
                                  onClick={() => {
                                    if (editForm.imageFile && editForm.imagePreview) URL.revokeObjectURL(editForm.imagePreview);
                                    setEditForm((prev) => ({ ...prev, imageFile: null, imagePreview: null }));
                                  }}
                                  className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-danger)] text-[10px] text-white shadow"
                                >×</button>
                              </div>
                            ) : (
                              <div className="flex h-20 w-20 flex-none items-center justify-center rounded-xl border-2 border-dashed border-[var(--color-border-strong)] bg-[var(--color-background-tertiary)]">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                              </div>
                            )}
                            <div className="flex flex-col gap-2">
                              <button
                                onClick={() => editImageInputRef.current?.click()}
                                className="rounded-xl border border-[var(--color-border-strong)] px-4 py-2 text-xs font-semibold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
                              >
                                {editForm.imagePreview ? "Upload nova imagem" : "Upload nova imagem"}
                              </button>
                              <button
                                onClick={() => setGalleryPickerOpen((open) => !open)}
                                className="rounded-xl border border-[var(--color-border-strong)] px-4 py-2 text-xs font-semibold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
                              >
                                Escolher da galeria do produto
                              </button>
                              {editForm.imagePreview && (
                                <button
                                  onClick={handleRemoveVariantImage}
                                  className="rounded-xl border border-red-200 px-4 py-2 text-xs font-semibold text-[var(--color-danger)] transition-colors hover:bg-red-50"
                                >
                                  Remover imagem da variante
                                </button>
                              )}
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                                Origem: {imageSourceLabel(editForm.imagePreview)}
                              </p>
                              <p className="text-[10px] text-[var(--color-text-secondary)]">JPEG, PNG ou WebP · máx. 5 MB</p>
                              {editForm.imageFile && <p className="text-[10px] font-semibold text-green-600">✓ {editForm.imageFile.name}</p>}
                            </div>
                          </div>
                          {galleryPickerOpen && images.length > 0 && (
                            <div className="mt-3 grid grid-cols-4 gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-tertiary)] p-3 sm:grid-cols-6">
                              {images.map((image) => (
                                <button
                                  key={image.id}
                                  type="button"
                                  onClick={() => handleSelectGalleryImage(image.url)}
                                  className="aspect-square overflow-hidden rounded-xl border border-[var(--color-border)] transition hover:border-[var(--color-danger)]"
                                  title="Usar esta imagem na variante"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={image.thumbnailUrl ?? image.url} alt="" className="h-full w-full object-cover" />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Save / Cancel */}
                        <div className="flex items-center gap-3">
                          <button
                            onClick={saveEdit}
                            disabled={editSaving}
                            className="admin-button-danger py-2 px-5 text-sm disabled:opacity-50"
                          >
                            {editSaving ? "A guardar…" : "Guardar alterações"}
                          </button>
                          <button onClick={cancelEdit} className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Variant builder */}
                <div className="rounded-3xl border border-[var(--color-border-strong)] bg-[var(--color-background-secondary)] p-4 sm:p-5">
                  <div className="mb-4 flex flex-col gap-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">
                      Construtor de variantes
                    </p>
                    <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                      Cria variacoes em lote sem trabalho repetitivo
                    </h3>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      Escolhe um modelo, escreve varios valores por atributo e gera todas as combinacoes.
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-4">
                    {VARIANT_PRESETS.map((preset) => {
                      const selected = preset.type === variantBuilderType;
                      return (
                        <button
                          key={preset.type}
                          type="button"
                          onClick={() => applyVariantPreset(preset.type)}
                          className={`rounded-2xl border p-3 text-left transition ${
                            selected
                              ? "border-[var(--color-danger)] bg-[rgba(232,67,26,0.08)]"
                              : "border-[var(--color-border)] bg-[var(--color-background-tertiary)] hover:border-[var(--color-border-strong)]"
                          }`}
                        >
                          <span className="block text-sm font-semibold text-[var(--color-text-primary)]">{preset.label}</span>
                          <span className="mt-1 block text-xs text-[var(--color-text-secondary)]">{preset.hint}</span>
                        </button>
                      );
                    })}
                  </div>
                  {variantBuilderType === "MODEL" && (
                    <div className="mt-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-tertiary)] px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                      Depois de escrever os modelos e clicar em "Gerar variantes", cada linha tera a coluna Imagem com o botao "Upload" para carregar a foto desse modelo.
                    </div>
                  )}
                  {(variantBuilderType === "COLOR" || variantBuilderType === "COLOR_SIZE") && (
                    <div className="mt-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-tertiary)] px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                      Depois de gerar, associa cada cor a uma foto da galeria principal. Ex: Verde usa a foto verde ja carregada no produto.
                    </div>
                  )}

                  <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_260px]">
                    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-tertiary)] p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                            Atributos e valores
                          </p>
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            Separa valores por virgula, ponto e virgula ou linha.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={addBuilderAttr}
                          className="rounded-full border border-[var(--color-border-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-secondary)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
                        >
                          + Atributo
                        </button>
                      </div>

                      <div className="flex flex-col gap-3">
                        {builderAttrs.map((attr) => {
                          const isColorAttribute = VISUAL_ATTRIBUTE_PATTERN.test(attr.name) && attr.name.toLowerCase().includes("cor");
                          return (
                            <div key={attr.id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-3">
                              <div className="grid gap-2 md:grid-cols-[180px_1fr_auto]">
                                <input
                                  className="admin-input py-2 text-sm"
                                  placeholder="Atributo"
                                  value={attr.name}
                                  onChange={(e) => updateBuilderAttr(attr.id, "name", e.target.value)}
                                />
                                <input
                                  className="admin-input py-2 text-sm"
                                  placeholder="Ex: Preto, Verde, Castanho"
                                  value={attr.values}
                                  onChange={(e) => updateBuilderAttr(attr.id, "values", e.target.value)}
                                />
                                <button
                                  type="button"
                                  onClick={() => removeBuilderAttr(attr.id)}
                                  disabled={builderAttrs.length <= 1}
                                  className="rounded-xl px-3 text-sm text-[var(--color-text-secondary)] hover:bg-red-50 hover:text-[var(--color-danger)] disabled:opacity-40"
                                >
                                  Remover
                                </button>
                              </div>
                              {isColorAttribute && (
                                <div className="mt-3">
                                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                                    Paleta rapida
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {PRESET_COLORS.map((color) => {
                                      const selected = splitVariantValues(attr.values).some((value) => value.toLowerCase() === color.name.toLowerCase());
                                      return (
                                        <button
                                          key={color.name}
                                          type="button"
                                          onClick={() => addColorToBuilderAttr(attr.id, color.name)}
                                          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                            selected
                                              ? "border-[var(--color-danger)] text-[var(--color-danger)]"
                                              : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]"
                                          }`}
                                        >
                                          <span
                                            className="h-4 w-4 rounded-full border border-black/10"
                                            style={{ backgroundColor: color.hex }}
                                          />
                                          {color.name}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-tertiary)] p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                        Valores base
                      </p>
                      <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                        Estes valores entram automaticamente nas variantes quando clicas em gerar.
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-1">
                        <div>
                          <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">Custo base (MZN)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="admin-input py-2 text-sm"
                            value={builderBasePurchasePrice}
                            onChange={(e) => setBuilderBasePurchasePrice(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">Preco base (MZN)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="admin-input py-2 text-sm"
                            value={builderBasePrice}
                            onChange={(e) => setBuilderBasePrice(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">Promocao base</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="admin-input py-2 text-sm"
                            value={builderBasePromotionalPrice}
                            onChange={(e) => setBuilderBasePromotionalPrice(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">Stock base</label>
                          <input
                            type="number"
                            min="0"
                            className="admin-input py-2 text-sm"
                            value={builderBaseStock}
                            onChange={(e) => setBuilderBaseStock(e.target.value)}
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={generateBuilderVariants}
                        className="mt-4 w-full rounded-full bg-[var(--color-danger)] px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
                      >
                        Gerar variantes
                      </button>
                    </div>
                  </div>

                  {builderFeedback && (
                    <div
                      className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                        builderFeedback.type === "error"
                          ? "border-red-200 bg-red-50 text-red-700"
                          : builderFeedback.type === "success"
                            ? "border-green-200 bg-green-50 text-green-700"
                            : "border-[var(--color-border)] bg-[var(--color-background-tertiary)] text-[var(--color-text-secondary)]"
                      }`}
                    >
                      {builderFeedback.message}
                    </div>
                  )}

                  {builderRows.length > 0 && (
                    <div className="mt-5 overflow-hidden rounded-2xl border border-[var(--color-border)]">
                      <div className="flex flex-col gap-2 border-b border-[var(--color-border)] bg-[var(--color-background-tertiary)] p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                            Pre-visualizacao para guardar ({builderRows.length})
                          </p>
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            Confirma identificacao, preco e stock antes de criar as variantes.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={saveGeneratedVariants}
                          disabled={builderSaving}
                          className="rounded-full bg-[var(--color-danger)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {builderSaving && builderProgress
                            ? `A guardar ${builderProgress.done}/${builderProgress.total}`
                            : "Guardar variantes"}
                        </button>
                      </div>

                      <div className="divide-y divide-[var(--color-border)]">
                        {builderRows.map((row) => {
                          const visual = primaryVisualAttribute(row.attributes);
                          const previewUrl = row.imagePreview || row.mainImageUrl;
                          return (
                            <div key={row.id} className={`grid gap-3 p-4 ${row.error ? "bg-red-50/70" : ""}`}>
                              <div className={`grid gap-3 ${showBuilderImageControls ? "xl:grid-cols-[1.2fr_1fr_1fr_auto]" : "xl:grid-cols-[1.4fr_1fr_auto]"}`}>
                                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-3">
                                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                                    Identificacao
                                  </p>
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    <div>
                                      <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">Nome visivel</label>
                                      <input
                                        className="admin-input py-2 text-sm"
                                        value={row.label}
                                        onChange={(e) => updateBuilderRow(row.id, { label: e.target.value })}
                                      />
                                    </div>
                                    <div>
                                      <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">SKU</label>
                                      <input
                                        className="admin-input py-2 text-sm font-mono"
                                        value={row.sku}
                                        onChange={(e) => updateBuilderRow(row.id, { sku: e.target.value })}
                                      />
                                    </div>
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {Object.entries(row.attributes).map(([key, value]) => (
                                      <span key={key} className="rounded-full bg-[var(--color-background-tertiary)] px-2 py-0.5 text-[11px] text-[var(--color-text-secondary)]">
                                        {key}: {value}
                                      </span>
                                    ))}
                                  </div>
                                </div>

                                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-3">
                                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                                    Preco e stock
                                  </p>
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    <div>
                                      <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">Custo</label>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        className="admin-input py-2 text-sm"
                                        value={row.purchasePrice}
                                        onChange={(e) => updateBuilderRow(row.id, { purchasePrice: e.target.value })}
                                      />
                                    </div>
                                    <div>
                                      <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">Venda</label>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        className="admin-input py-2 text-sm"
                                        value={row.price}
                                        onChange={(e) => updateBuilderRow(row.id, { price: e.target.value })}
                                      />
                                    </div>
                                    <div>
                                      <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">Promocao</label>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        className="admin-input py-2 text-sm"
                                        value={row.promotionalPrice}
                                        onChange={(e) => updateBuilderRow(row.id, { promotionalPrice: e.target.value })}
                                      />
                                    </div>
                                    <div>
                                      <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">Stock</label>
                                      <input
                                        type="number"
                                        min="0"
                                        className="admin-input py-2 text-sm"
                                        value={row.stock}
                                        onChange={(e) => updateBuilderRow(row.id, { stock: e.target.value })}
                                      />
                                    </div>
                                  </div>
                                  <div className="mt-3 rounded-xl bg-[var(--color-background-tertiary)] px-3 py-2 text-xs">
                                    <span className="font-semibold text-green-600">
                                      Lucro {calculateVariantProfit(row.purchasePrice, row.price, row.promotionalPrice).toFixed(2)} MZN
                                    </span>
                                    <span className="ml-2 text-[var(--color-text-secondary)]">
                                      Margem {calculateVariantMargin(row.purchasePrice, row.price, row.promotionalPrice).toFixed(1)}%
                                    </span>
                                  </div>
                                  <label className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)]">
                                    <input
                                      type="checkbox"
                                      checked={row.active}
                                      onChange={(e) => updateBuilderRow(row.id, { active: e.target.checked })}
                                    />
                                    Variante activa
                                  </label>
                                </div>

                                {showBuilderImageControls && (
                                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-3">
                                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                                    {showBuilderUploadControls ? "Foto da variante" : "Foto da galeria principal"}
                                  </p>
                                  <label className="text-xs text-[var(--color-text-secondary)]">
                                    {showBuilderUploadControls ? "Imagem" : "Associar imagem existente"}
                                  </label>
                                  <div className="flex items-center gap-2">
                                    {previewUrl ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={previewUrl} alt="" className="h-12 w-12 rounded-lg border border-[var(--color-border)] object-cover" />
                                    ) : (
                                      <div className="h-12 w-12 rounded-lg border border-dashed border-[var(--color-border)]" />
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <select
                                        className="admin-input w-full py-1.5 text-xs"
                                        value={row.mainImageUrl}
                                        onChange={(e) => updateBuilderRow(row.id, { mainImageUrl: e.target.value, imageFile: null, imagePreview: e.target.value || null })}
                                      >
                                        <option value="">Galeria / sem imagem</option>
                                        {images.map((image) => (
                                          <option key={image.id} value={image.url}>
                                            {imageSourceLabel(image.url)}
                                          </option>
                                        ))}
                                      </select>
                                      <input
                                        className={`mt-1 admin-input w-full py-1.5 text-xs ${showBuilderUploadControls ? "" : "hidden"}`}
                                        placeholder="URL da imagem"
                                        value={row.mainImageUrl}
                                        onChange={(e) => updateBuilderRow(row.id, { mainImageUrl: e.target.value, imageFile: null, imagePreview: e.target.value || null })}
                                      />
                                    </div>
                                  </div>
                                  <div className={`flex flex-wrap gap-2 ${showBuilderUploadControls || (visual && previewUrl) ? "" : "hidden"}`}>
                                    <input
                                      ref={(el) => { builderImageInputRefs.current[row.id] = el; }}
                                      type="file"
                                      accept={ACCEPTED_IMAGE_INPUT}
                                      className="hidden"
                                      onChange={(e) => handleBuilderImageFile(row.id, e.target.files?.[0] ?? null)}
                                    />
                                    {showBuilderUploadControls && (
                                      <button type="button" onClick={() => builderImageInputRefs.current[row.id]?.click()} className="text-xs font-semibold text-[var(--color-danger)] hover:underline">
                                        Upload
                                      </button>
                                    )}
                                    {visual && previewUrl && (
                                      <button type="button" onClick={() => applyImageToVisualGroup(row.id)} className="text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-danger)]">
                                        Aplicar por {visual.key.toLowerCase()}
                                      </button>
                                    )}
                                  </div>
                                </div>
                                )}
                                <button
                                  type="button"
                                  onClick={() => removeBuilderRow(row.id)}
                                  className="self-start rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-secondary)] hover:border-red-300 hover:text-red-600"
                                >
                                  Remover
                                </button>
                              </div>
                              {row.error && <p className="text-xs font-semibold text-red-700">{row.error}</p>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Add variant form */}
                <details className="rounded-2xl border border-dashed border-[var(--color-border-strong)] p-4">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                    Adicionar uma variante manual
                  </summary>
                  <div className="mt-4 flex flex-col gap-3">
                  <div className="flex flex-col gap-2">
                    {newVariantAttrs.map((attr, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <input
                          className="admin-input py-1.5 text-sm flex-1"
                          placeholder="Atributo (ex: Cor)"
                          value={attr.key}
                          onChange={(e) => setNewVariantAttrs((prev) => prev.map((a, i) => i === idx ? { ...a, key: e.target.value } : a))}
                        />
                        <input
                          className="admin-input py-1.5 text-sm flex-1"
                          placeholder="Valor (ex: Verde)"
                          value={attr.value}
                          onChange={(e) => setNewVariantAttrs((prev) => prev.map((a, i) => i === idx ? { ...a, value: e.target.value } : a))}
                        />
                        {newVariantAttrs.length > 1 && (
                          <button
                            onClick={() => setNewVariantAttrs((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-danger)]"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={() => setNewVariantAttrs((prev) => [...prev, { key: "", value: "" }])}
                      className="self-start text-xs text-[var(--color-danger)] hover:underline"
                    >
                      + Atributo
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-5">
                    <div>
                      <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">SKU (opcional)</label>
                      <input className="admin-input py-1.5 text-sm font-mono" value={newVariantSku} onChange={(e) => setNewVariantSku(e.target.value)} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">Custo</label>
                      <input type="number" min="0" step="0.01" className="admin-input py-1.5 text-sm" value={newVariantPurchasePrice} onChange={(e) => setNewVariantPurchasePrice(e.target.value)} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">Venda</label>
                      <input type="number" min="0" step="0.01" className="admin-input py-1.5 text-sm" value={newVariantPrice} onChange={(e) => setNewVariantPrice(e.target.value)} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">Promocao</label>
                      <input type="number" min="0" step="0.01" className="admin-input py-1.5 text-sm" value={newVariantPromotionalPrice} onChange={(e) => setNewVariantPromotionalPrice(e.target.value)} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">Stock</label>
                      <input type="number" min="0" className="admin-input py-1.5 text-sm" value={newVariantStock} onChange={(e) => setNewVariantStock(e.target.value)} />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-tertiary)] p-3">
                    <label className="mb-2 block text-xs font-semibold text-[var(--color-text-secondary)]">
                      Foto da variante
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        ref={newVariantImageInputRef}
                        type="file"
                        accept={ACCEPTED_IMAGE_INPUT}
                        className="hidden"
                        onChange={(e) => handleNewVariantImageFile(e.target.files?.[0] ?? null)}
                      />
                      <button
                        type="button"
                        onClick={() => newVariantImageInputRef.current?.click()}
                        className="rounded-full bg-[var(--color-danger)] px-4 py-2 text-xs font-semibold text-white"
                      >
                        Carregar foto
                      </button>
                      {images.length > 0 && (
                        <select
                          className="admin-input max-w-xs py-2 text-xs"
                          value={newVariantImageUrl}
                          onChange={(e) => {
                            setNewVariantImageUrl(e.target.value);
                            setNewVariantImageFile(null);
                            setNewVariantImagePreview(e.target.value || null);
                          }}
                        >
                          <option value="">Escolher da galeria</option>
                          {images.map((image) => (
                            <option key={image.id} value={image.url}>
                              {imageSourceLabel(image.url)}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                      Aceita ficheiros de imagem comuns: JPG, PNG, WebP, GIF, BMP, TIFF, SVG e outros suportados pelo navegador.
                    </p>
                    {newVariantImagePreview && (
                      <div className="mt-3 flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={newVariantImagePreview}
                          alt="Preview"
                          className="h-14 w-14 flex-none rounded-lg object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-[var(--color-text-primary)]">
                            {newVariantImageFile?.name || "Imagem selecionada"}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              if (newVariantImagePreview.startsWith("blob:")) URL.revokeObjectURL(newVariantImagePreview);
                              setNewVariantImageFile(null);
                              setNewVariantImagePreview(null);
                              setNewVariantImageUrl("");
                            }}
                            className="text-xs text-[var(--color-danger)] hover:underline"
                          >
                            Remover imagem
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-[var(--color-text-secondary)]">Imagem da variante (URL, opcional)</label>
                    <input
                      className="admin-input py-1.5 text-sm"
                      placeholder="https://…"
                      value={newVariantImageUrl}
                      onChange={(e) => setNewVariantImageUrl(e.target.value)}
                    />
                    {newVariantImageUrl.trim() && (
                      <div className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-background-tertiary)] p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={newVariantImageUrl.trim()}
                          alt="Preview"
                          className="h-14 w-14 flex-none rounded-lg object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                        <p className="text-xs text-[var(--color-text-secondary)] break-all">{newVariantImageUrl.trim()}</p>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleAddVariant}
                    disabled={variantSaving || !newVariantPrice}
                    className="self-start rounded-full border border-[var(--color-border-strong)] px-4 py-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] transition-colors disabled:opacity-50"
                  >
                    {variantSaving ? "A guardar…" : "+ Adicionar variante"}
                  </button>
                  </div>
                </details>
              </div>
            ) : (
              /* ── Create mode: simple picker (variants saved after product creation) ── */
              <div className="flex flex-col gap-6">
                <p className="text-xs text-[var(--color-text-secondary)]">
                  Guarda o produto primeiro e despois gere as variantes nesta seccao.
                </p>
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

          {/* Package items card */}
          <div className="admin-card p-6 flex flex-col gap-4">
            <h2 className="font-[family-name:var(--font-sora)] font-semibold text-base">
              Conteudo da caixa
            </h2>
            <FieldHint text="Lista o que vem incluido na embalagem (ex: 1x Tenis, 1x Caixa, 2x Palmilhas)." />
            {packageItems.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  className="admin-input py-2 text-sm flex-1"
                  placeholder={`Item ${idx + 1}`}
                  value={item}
                  onChange={(e) => updatePackageItem(idx, e.target.value)}
                />
                <button
                  onClick={() => removePackageItem(idx)}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-secondary)] hover:bg-red-50 hover:text-[var(--color-danger)] transition-colors text-base leading-none"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              onClick={addPackageItem}
              className="self-start rounded-full border border-[var(--color-border-strong)] px-4 py-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] transition-colors"
            >
              + Adicionar item
            </button>
          </div>

          {/* Rich content card */}
          <div className="admin-card p-6 flex flex-col gap-5">
            <h2 className="font-[family-name:var(--font-sora)] font-semibold text-base">
              Informacao adicional
            </h2>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                Entrega e prazo
              </label>
              <textarea
                className="admin-input resize-none text-sm"
                rows={3}
                placeholder="Ex: Entrega em 3-5 dias uteis. Gratis para encomendas acima de 5000 MZN."
                value={deliveryInfo}
                onChange={(e) => setDeliveryInfo(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                Garantia
              </label>
              <textarea
                className="admin-input resize-none text-sm"
                rows={2}
                placeholder="Ex: Garantia de 12 meses contra defeitos de fabrico."
                value={warrantyInfo}
                onChange={(e) => setWarrantyInfo(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                Politica de devolucao
              </label>
              <textarea
                className="admin-input resize-none text-sm"
                rows={2}
                placeholder="Ex: Devolucao aceite em 7 dias apos a entrega, produto sem uso."
                value={returnPolicy}
                onChange={(e) => setReturnPolicy(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                Guia de uso / cuidados
              </label>
              <textarea
                className="admin-input resize-none text-sm"
                rows={3}
                placeholder="Ex: Lavar a 30 graus. Nao usar secador."
                value={usageGuide}
                onChange={(e) => setUsageGuide(e.target.value)}
              />
            </div>
          </div>

          {/* Videos card (edit mode only) */}
          {isEdit && (
            <div className="admin-card p-6 flex flex-col gap-4">
              <h2 className="font-[family-name:var(--font-sora)] font-semibold text-base">
                Videos do produto
              </h2>
              {editVideos.map((video) => (
                <div key={video.id} className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                      {video.title || video.url}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-[var(--color-text-secondary)]">{video.url}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteVideo(video.id)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--color-text-secondary)] hover:bg-red-50 hover:text-[var(--color-danger)] transition-colors text-base leading-none"
                    title="Remover"
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="flex flex-col gap-2">
                <input
                  className="admin-input text-sm"
                  placeholder="URL do video (YouTube, TikTok, externo…)"
                  value={newVideoUrl}
                  onChange={(e) => setNewVideoUrl(e.target.value)}
                />
                <input
                  className="admin-input text-sm"
                  placeholder="Titulo (opcional)"
                  value={newVideoTitle}
                  onChange={(e) => setNewVideoTitle(e.target.value)}
                />
                <button
                  onClick={handleAddVideo}
                  disabled={videoSaving || !newVideoUrl.trim()}
                  className="self-start rounded-full border border-[var(--color-border-strong)] px-4 py-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] transition-colors disabled:opacity-50"
                >
                  {videoSaving ? "A guardar…" : "+ Adicionar video"}
                </button>
              </div>
            </div>
          )}
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
            {hasLiveVariants && (
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-tertiary)] p-3 text-xs text-[var(--color-text-secondary)]">
                <p className="font-semibold text-[var(--color-text-primary)]">Este produto usa stock por variante.</p>
                <p className="mt-1">Stock total calculado: <strong>{activeVariantStockTotal}</strong> unidades.</p>
              </div>
            )}
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
                    disabled={hasLiveVariants}
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
