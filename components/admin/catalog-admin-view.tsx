"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";

import { AdminBanner, AdminListLoadingOverlay } from "@/components/admin/feedback-state";
import { ApiError, adminApiFetch, getApiErrorMessage } from "@/lib/admin/api-client";
import type { CatalogImage, CatalogPage, CatalogProduct, CatalogProductVariantDefinition, CatalogPromotion, CatalogTaxonomy } from "@/lib/admin/catalog-types";
import type { QuoteOptionsResponse, ShippingRouteOption } from "@/lib/admin/types";

type Mode = "products" | "categories" | "brands" | "promotions";
type Feedback = { tone: "success" | "error"; message: string } | null;
type FieldErrors = Record<string, string>;
type ProductAction = "draft" | "publish";
type SpecRow = { id: string; key: string; value: string };
type SpecificationField = {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "multiselect" | "boolean" | "measurement";
  required?: boolean;
  options?: string[];
  unit?: string;
  placeholder?: string;
  isVariant?: boolean;
};
type CatalogSpecificationTemplate = { key: string; label: string; fields: SpecificationField[] };
type ImageDraft = { id: string; file: File; previewUrl: string; primary: boolean; status: "ready" | "uploading" | "done" | "error" };
type CatalogAssetType = "BRAND" | "PROMOTION";
type CatalogAssetDraft = { file: File; previewUrl: string; status: "ready" | "uploading" | "done" | "error"; error?: string };

const emptyProduct = {
  name: "",
  shortDescription: "",
  description: "",
  categoryId: "",
  brandId: "",
  promotionId: "",
  supplier: "",
  supplierLink: "",
  supplierLinkVisibleToCustomer: false,
  currency: "ZAR",
  originId: "",
  routeId: "",
  shippingMode: "auto" as "auto" | "custom",
  customsMode: "auto" as "auto" | "custom",
  commissionMode: "auto" as "auto" | "custom",
  supplierPrice: "",
  exchangeRateSnapshot: "",
  shippingCost: "",
  customsCost: "",
  commissionValue: "",
  finalPrice: "",
  pricingMode: "FIXED_PRICE" as "FIXED_PRICE" | "QUOTE_REQUIRED",
  quoteMessage: "O preço poderá variar conforme disponibilidade, câmbio ou fornecedor. Respondemos rapidamente com uma cotação personalizada.",
  quoteResponseDeadline: "Respondemos com o preço final e prazo em até 24 horas.",
  weight: "",
  estimatedDeadline: "",
  active: true,
  featured: false,
  newProduct: false,
  bestSeller: false,
  recommended: true,
  seoTitle: "",
  seoDescription: "",
  templateValues: {} as Record<string, string>,
  variants: [] as CatalogProductVariantDefinition[],
};

type ProductForm = typeof emptyProduct & { id?: number; existingImages?: CatalogImage[] };
type TaxonomyForm = { id?: number; name: string; slug: string; description: string; active: boolean; displayOrder: string; logoUrl?: string; specificationTemplate?: string; parentId: string };
type PromotionForm = {
  id?: number;
  name: string;
  slug: string;
  description: string;
  promotionType: "PERCENTAGE" | "FIXED_AMOUNT" | "LABEL_ONLY" | "BUNDLE_PICK";
  discountPercent: string;
  discountValue: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  imageUrl?: string;
  showAsHighlight: boolean;
  choiceQuantity: string;
  bundlePrice: string;
  fixedVolume: string;
  allowRepeats: boolean;
  maxPerCustomer: string;
  participants: Array<{ productId: number; volume: string }>;
};

const emptyTaxonomyForm: TaxonomyForm = { name: "", slug: "", description: "", active: true, displayOrder: "0", logoUrl: "", specificationTemplate: "", parentId: "" };
const emptyPromotionForm: PromotionForm = {
  name: "",
  slug: "",
  description: "",
  promotionType: "LABEL_ONLY",
  discountPercent: "",
  discountValue: "",
  startsAt: "",
  endsAt: "",
  active: true,
  imageUrl: "",
  showAsHighlight: false,
  choiceQuantity: "2", bundlePrice: "", fixedVolume: "30 ml", allowRepeats: false, maxPerCustomer: "", participants: [],
};

const CATEGORY_DESCRIPTION_LIMIT = 500;
const BRAND_DESCRIPTION_LIMIT = 2000;
const SPECIFICATION_TEMPLATES: CatalogSpecificationTemplate[] = [
  {
    key: "SNEAKERS",
    label: "Sapatilhas",
    fields: [
      { key: "brand", label: "Marca", type: "text" },
      { key: "model", label: "Modelo", type: "text" },
      { key: "gender", label: "Género", type: "select", options: ["Masculino", "Feminino", "Unissexo", "Infantil"] },
      { key: "material", label: "Material", type: "text" },
      { key: "soleType", label: "Tipo de sola", type: "text" },
      { key: "style", label: "Estilo", type: "text" },
      { key: "originCountry", label: "País de origem", type: "text" },
      { key: "size", label: "Tamanhos disponíveis", type: "multiselect", required: true, isVariant: true, options: ["35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46"] },
      { key: "color", label: "Cores disponíveis", type: "multiselect", required: true, isVariant: true, options: ["Preto", "Branco", "Azul", "Vermelho", "Cinzento", "Bege"] },
    ],
  },
  {
    key: "CLOTHING",
    label: "Roupa",
    fields: [
      { key: "brand", label: "Marca", type: "text" },
      { key: "garmentType", label: "Tipo de peça", type: "text" },
      { key: "material", label: "Material", type: "text" },
      { key: "fit", label: "Corte", type: "text" },
      { key: "season", label: "Estação", type: "text" },
      { key: "gender", label: "Género", type: "select", options: ["Masculino", "Feminino", "Unissexo", "Infantil"] },
      { key: "size", label: "Tamanhos", type: "multiselect", required: true, isVariant: true, options: ["XS", "S", "M", "L", "XL", "XXL", "3XL"] },
      { key: "color", label: "Cores", type: "multiselect", isVariant: true, options: ["Preto", "Branco", "Azul", "Vermelho", "Verde", "Cinzento"] },
    ],
  },
  {
    key: "PHONES",
    label: "Telemóveis",
    fields: [
      { key: "brand", label: "Marca", type: "text" },
      { key: "model", label: "Modelo", type: "text" },
      { key: "operatingSystem", label: "Sistema operativo", type: "text" },
      { key: "processor", label: "Processador", type: "text" },
      { key: "screenSize", label: "Tamanho do ecrã", type: "measurement", unit: '"' },
      { key: "simCount", label: "Número de SIM", type: "number" },
      { key: "network", label: "Rede", type: "text" },
      { key: "battery", label: "Capacidade da bateria", type: "measurement", unit: "mAh" },
      { key: "camera", label: "Câmara", type: "text" },
      { key: "condition", label: "Estado", type: "select", options: ["Novo", "Recondicionado", "Usado"] },
      { key: "ram", label: "RAM", type: "multiselect", required: true, isVariant: true, options: ["4 GB", "6 GB", "8 GB", "12 GB", "16 GB"] },
      { key: "storage", label: "Armazenamento", type: "multiselect", required: true, isVariant: true, options: ["64 GB", "128 GB", "256 GB", "512 GB", "1 TB"] },
      { key: "color", label: "Cor", type: "multiselect", isVariant: true, options: ["Preto", "Branco", "Azul", "Dourado", "Prateado"] },
    ],
  },
  {
    key: "COMPUTERS",
    label: "Computadores",
    fields: [
      { key: "brand", label: "Marca", type: "text" },
      { key: "model", label: "Modelo", type: "text" },
      { key: "processor", label: "Processador", type: "text" },
      { key: "graphics", label: "Placa gráfica", type: "text" },
      { key: "screenSize", label: "Tamanho do ecrã", type: "measurement", unit: '"' },
      { key: "operatingSystem", label: "Sistema operativo", type: "text" },
      { key: "keyboardType", label: "Tipo de teclado", type: "text" },
      { key: "condition", label: "Estado", type: "select", options: ["Novo", "Recondicionado", "Usado"] },
      { key: "ram", label: "RAM", type: "multiselect", required: true, isVariant: true, options: ["8 GB", "16 GB", "32 GB", "64 GB"] },
      { key: "storage", label: "Armazenamento", type: "multiselect", required: true, isVariant: true, options: ["256 GB", "512 GB", "1 TB", "2 TB"] },
      { key: "color", label: "Cor", type: "multiselect", isVariant: true, options: ["Preto", "Prateado", "Cinzento", "Branco"] },
    ],
  },
  {
    key: "APPLIANCES",
    label: "Eletrodomésticos",
    fields: [
      { key: "brand", label: "Marca", type: "text" },
      { key: "model", label: "Modelo", type: "text" },
      { key: "type", label: "Tipo", type: "text" },
      { key: "power", label: "Potência", type: "measurement", required: true, unit: "W" },
      { key: "voltage", label: "Voltagem", type: "measurement", required: true, unit: "V" },
      { key: "capacity", label: "Capacidade", type: "measurement", unit: "L" },
      { key: "energyEfficiency", label: "Eficiência energética", type: "text" },
      { key: "dimensions", label: "Dimensões", type: "text" },
      { key: "weight", label: "Peso", type: "measurement", unit: "kg" },
      { key: "warranty", label: "Garantia", type: "text" },
      { key: "color", label: "Cor", type: "multiselect", isVariant: true, options: ["Branco", "Preto", "Prateado", "Cinzento"] },
      { key: "capacityVariant", label: "Capacidade", type: "multiselect", isVariant: true, options: ["10 L", "20 L", "30 L", "50 L"] },
      { key: "voltageVariant", label: "Voltagem", type: "multiselect", isVariant: true, options: ["110 V", "220 V", "Bivolt"] },
      { key: "size", label: "Tamanho", type: "multiselect", isVariant: true, options: ["Pequeno", "Médio", "Grande"] },
    ],
  },
  {
    key: "PERFUMES",
    label: "Perfumes",
    fields: [
      { key: "brand", label: "Marca", type: "text" },
      { key: "fragranceName", label: "Nome da fragrância", type: "text" },
      { key: "gender", label: "Género", type: "select", options: ["Masculino", "Feminino", "Unissexo"] },
      { key: "concentration", label: "Concentração", type: "text" },
      { key: "olfactoryFamily", label: "Família olfativa", type: "text" },
      { key: "originCountry", label: "País de origem", type: "text" },
      { key: "volume", label: "Volume", type: "multiselect", required: true, isVariant: true, options: ["30 ml", "50 ml", "75 ml", "100 ml", "125 ml", "200 ml"] },
    ],
  },
  {
    key: "AUTO_PARTS",
    label: "Peças automóveis",
    fields: [
      { key: "partBrand", label: "Marca da peça", type: "text" },
      { key: "reference", label: "Referência", type: "text" },
      { key: "vehicleBrand", label: "Marca do veículo", type: "text" },
      { key: "vehicleModel", label: "Modelo do veículo", type: "text" },
      { key: "compatibleYear", label: "Ano compatível", type: "text" },
      { key: "engine", label: "Motor", type: "text" },
      { key: "side", label: "Lado", type: "text" },
      { key: "position", label: "Posição", type: "text" },
      { key: "condition", label: "Condição", type: "text" },
      { key: "compatibility", label: "Compatibilidade", type: "text" },
      { key: "sideVariant", label: "Lado", type: "multiselect", isVariant: true, options: ["Esquerdo", "Direito", "Par"] },
      { key: "size", label: "Tamanho", type: "multiselect", isVariant: true, options: ["Pequeno", "Médio", "Grande"] },
      { key: "modelVariant", label: "Modelo", type: "multiselect", isVariant: true, options: [] },
      { key: "referenceVariant", label: "Referência", type: "multiselect", isVariant: true, options: [] },
    ],
  },
  {
    key: "FURNITURE",
    label: "Móveis",
    fields: [
      { key: "material", label: "Material", type: "text" },
      { key: "dimensions", label: "Dimensões", type: "text" },
      { key: "weight", label: "Peso", type: "measurement", unit: "kg" },
      { key: "style", label: "Estilo", type: "text" },
      { key: "finishType", label: "Tipo de acabamento", type: "text" },
      { key: "capacity", label: "Capacidade", type: "text" },
      { key: "assemblyRequired", label: "Montagem necessária", type: "boolean" },
      { key: "color", label: "Cor", type: "multiselect", isVariant: true, options: ["Branco", "Preto", "Castanho", "Natural", "Cinzento"] },
      { key: "size", label: "Tamanho", type: "multiselect", isVariant: true, options: ["Pequeno", "Médio", "Grande"] },
    ],
  },
  {
    key: "ACCESSORIES",
    label: "Acessórios",
    fields: [
      { key: "brand", label: "Marca", type: "text" },
      { key: "material", label: "Material", type: "text" },
      { key: "compatibility", label: "Compatibilidade", type: "text" },
      { key: "type", label: "Tipo", type: "text" },
      { key: "dimensions", label: "Dimensões", type: "text" },
      { key: "color", label: "Cor", type: "multiselect", isVariant: true, options: ["Preto", "Branco", "Azul", "Vermelho", "Cinzento"] },
      { key: "size", label: "Tamanho", type: "multiselect", isVariant: true, options: ["Pequeno", "Médio", "Grande"] },
      { key: "compatibleModel", label: "Modelo compatível", type: "multiselect", isVariant: true, options: [] },
    ],
  },
];

const primaryButton = "inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#E8431A] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#CC3315] disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton = "inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-bold text-slate-100 transition hover:border-[#E8431A]/50 hover:text-[#FF8066] disabled:cursor-not-allowed disabled:opacity-60";
const lightSecondaryButton = "inline-flex min-h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 transition hover:border-[#E8431A]/40 hover:text-[#E8431A] disabled:cursor-not-allowed disabled:opacity-60";
const dangerButton = "inline-flex min-h-10 items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-3.5 py-2 text-sm font-bold text-red-700 transition hover:bg-red-100";

const pageCopy = {
  products: {
    eyebrow: "Catálogo por encomenda",
    title: "Produtos do catálogo",
    description: "Produtos previamente selecionados para encomenda internacional.",
    action: "Novo produto",
    emptyTitle: "Ainda não existem produtos no catálogo.",
    emptyDescription: "Adiciona o primeiro produto por encomenda para começar a preencher as Escolhas da ShopeeMz.",
    emptyAction: "Adicionar primeiro produto",
  },
  categories: {
    eyebrow: "Catálogo por encomenda",
    title: "Categorias do catálogo",
    description: "Organiza os produtos por encomenda.",
    action: "Nova categoria",
    emptyTitle: "Ainda não existem categorias do catálogo.",
    emptyDescription: "Cria a primeira categoria para organizar os produtos por encomenda.",
    emptyAction: "Adicionar primeira categoria",
  },
  brands: {
    eyebrow: "Catálogo por encomenda",
    title: "Marcas do catálogo",
    description: "Mantém as marcas usadas nas Escolhas da ShopeeMz.",
    action: "Nova marca",
    emptyTitle: "Ainda não existem marcas do catálogo.",
    emptyDescription: "Adiciona marcas para tornar o catálogo mais claro e pesquisável.",
    emptyAction: "Adicionar primeira marca",
  },
  promotions: {
    eyebrow: "Catálogo por encomenda",
    title: "Promoções do catálogo",
    description: "Gere campanhas visuais e descontos aplicáveis aos produtos por encomenda.",
    action: "Nova promoção",
    emptyTitle: "Ainda não existem promoções do catálogo.",
    emptyDescription: "Cria uma promoção para destacar produtos selecionados no cliente.",
    emptyAction: "Adicionar primeira promoção",
  },
} satisfies Record<Mode, Record<string, string>>;

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat("pt-MZ", { style: "currency", currency: "MZN", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function parseNumber(value: string) {
  return value.trim() ? Number(value) : null;
}

function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function activeRateFor(options: QuoteOptionsResponse | null, currency: string) {
  return (options?.activeRates || []).find((rate) => rate.active && rate.baseCurrency === currency && rate.targetCurrency === "MZN") || null;
}

function routeById(options: QuoteOptionsResponse | null, routeId: string) {
  return (options?.routes || []).find((route) => String(route.id) === routeId) || null;
}

function routeLabel(route: ShippingRouteOption) {
  return `${route.origin?.label || route.origin?.city || "Origem"} → ${route.destination?.label || route.destination?.city || "Destino"}`;
}

function calculateCatalogPricing(form: ProductForm, options: QuoteOptionsResponse | null) {
  const route = routeById(options, form.routeId);
  const currency = form.currency || route?.currencyCode || "";
  const rate = activeRateFor(options, currency);
  const exchangeRate = Number(rate?.rate || form.exchangeRateSnapshot || 0);
  const supplierPrice = Number(form.supplierPrice || 0);
  const productMzn = roundMoney(supplierPrice * exchangeRate);
  const shippingOrigin = Number(route?.shippingFee || 0);
  const shippingMzn = form.shippingMode === "custom"
    ? roundMoney(Number(form.shippingCost || 0))
    : roundMoney(shippingOrigin * exchangeRate);
  const customsType = route?.customsType || "PERCENT";
  const customsValue = Number(route?.customsValue ?? route?.customsPercent ?? 0);
  const automaticCustomsMzn = roundMoney(customsType === "FIXED" ? customsValue : productMzn * (customsValue / 100));
  const customsMzn = form.customsMode === "custom" ? roundMoney(Number(form.customsCost || 0)) : automaticCustomsMzn;
  const commissionPercent = Number(route?.sitePercent || 0);
  const automaticCommissionMzn = roundMoney(productMzn * (commissionPercent / 100));
  const commissionMzn = form.commissionMode === "custom" ? roundMoney(Number(form.commissionValue || 0)) : automaticCommissionMzn;
  const finalMzn = roundMoney(productMzn + shippingMzn + customsMzn + commissionMzn);

  return {
    route,
    rate,
    currency,
    supplierPrice,
    exchangeRate,
    productMzn,
    shippingOrigin,
    shippingMzn,
    customsType,
    customsValue,
    customsMzn,
    commissionPercent,
    commissionMzn,
    finalMzn,
  };
}

function withCatalogPricing(form: ProductForm, options: QuoteOptionsResponse | null) {
  const pricing = calculateCatalogPricing(form, options);
  return {
    ...form,
    currency: pricing.currency || form.currency,
    exchangeRateSnapshot: pricing.exchangeRate > 0 ? String(pricing.exchangeRate) : "",
    shippingCost: form.shippingMode === "custom"
      ? form.shippingCost
      : pricing.shippingMzn > 0 ? String(pricing.shippingMzn) : "",
    customsCost: form.customsMode === "custom" ? form.customsCost : String(pricing.customsMzn),
    commissionValue: form.commissionMode === "custom" ? form.commissionValue : String(pricing.commissionMzn),
    finalPrice: pricing.finalMzn > 0 ? String(pricing.finalMzn) : "",
    estimatedDeadline: form.estimatedDeadline,
  };
}

function promotionOptionLabel(promotion: CatalogPromotion) {
  const today = new Date().toISOString().slice(0, 10);
  if (!promotion.active) return `${promotion.name} — inativa`;
  if (promotion.startsAt && promotion.startsAt > today) return `${promotion.name} — começa em ${promotion.startsAt}`;
  if (promotion.endsAt && promotion.endsAt < today) return `${promotion.name} — terminada`;
  return `${promotion.name} — ativa`;
}

function canApplyPromotionByDefault(promotion: CatalogPromotion) {
  const today = new Date().toISOString().slice(0, 10);
  return promotion.active && (!promotion.endsAt || promotion.endsAt >= today);
}

function promotionValueLabel(promotion: CatalogPromotion) {
  if (promotion.promotionType === "FIXED_AMOUNT") return money(promotion.discountValue);
  if (promotion.promotionType === "PERCENTAGE") return `${promotion.discountPercent ?? 0}%`;
  return "Destaque visual";
}

function specsToRows(specs?: Record<string, string>): SpecRow[] {
  const rows = Object.entries(specs || {}).map(([key, value], index) => ({ id: `${Date.now()}-${index}`, key, value }));
  return rows.length ? rows : [{ id: `${Date.now()}-empty`, key: "", value: "" }];
}

function rowsToSpecs(rows: SpecRow[]) {
  return rows.reduce<Record<string, string>>((acc, row) => {
    if (row.key.trim() && row.value.trim()) acc[row.key.trim()] = row.value.trim();
    return acc;
  }, {});
}

const LEGACY_TEMPLATE_KEYS: Record<string, string> = {
  SAPATILHAS: "SNEAKERS",
  ROUPA: "CLOTHING",
  TELEMOVEIS: "PHONES",
  COMPUTADORES: "COMPUTERS",
  ELETRODOMESTICOS: "APPLIANCES",
  PECAS_AUTOMOVEIS: "AUTO_PARTS",
  MOVEIS: "FURNITURE",
  ACESSORIOS: "ACCESSORIES",
};

const SLUG_TEMPLATE_FALLBACKS: Record<string, string> = {
  sapatilhas: "SNEAKERS",
  sneakers: "SNEAKERS",
  tenis: "SNEAKERS",
  calcado: "SNEAKERS",
  roupa: "CLOTHING",
  vestuario: "CLOTHING",
  moda: "CLOTHING",
  telemoveis: "PHONES",
  smartphones: "PHONES",
  celulares: "PHONES",
  computadores: "COMPUTERS",
  laptops: "COMPUTERS",
  portateis: "COMPUTERS",
  eletrodomesticos: "APPLIANCES",
  electrodomesticos: "APPLIANCES",
};

function normalizeTemplateKey(key?: string | null) {
  if (!key) return "NONE";
  const normalized = key.trim().toUpperCase();
  if (!normalized || normalized === "NONE") return "NONE";
  return LEGACY_TEMPLATE_KEYS[normalized] || normalized;
}

function templateByKey(key?: string | null) {
  const normalized = normalizeTemplateKey(key);
  if (normalized === "NONE") return null;
  return SPECIFICATION_TEMPLATES.find((template) => template.key === normalized) || null;
}

function categoryTemplate(categories: CatalogTaxonomy[], categoryId: string) {
  const category = categories.find((item) => String(item.id) === categoryId);
  const parent = category?.parentId ? categories.find((item) => item.id === category.parentId) : undefined;
  const explicitTemplate = templateByKey(category?.specificationTemplate) || templateByKey(parent?.specificationTemplate);
  if (explicitTemplate || !category?.slug) return explicitTemplate;
  return templateByKey(SLUG_TEMPLATE_FALLBACKS[category.slug]);
}

function variantFor(form: ProductForm, key: string) {
  return form.variants.find((variant) => variant.key === key);
}

function variantValues(form: ProductForm, key: string) {
  return variantFor(form, key)?.values || [];
}

function updateVariant(form: ProductForm, field: SpecificationField, values: string[]) {
  const cleaned = values.map((value) => value.trim()).filter(Boolean);
  const without = form.variants.filter((variant) => variant.key !== field.key);
  if (!cleaned.length) return { ...form, variants: without };
  return {
    ...form,
    variants: [...without, { key: field.key, label: field.label, required: Boolean(field.required), values: cleaned }],
  };
}

function variantFieldsFromForm(form: ProductForm): SpecificationField[] {
  return form.variants.map((variant) => ({
    key: variant.key,
    label: variant.label || variant.key,
    type: "multiselect",
    required: variant.required,
    isVariant: true,
    options: variant.values,
  }));
}

function templateSpecs(form: ProductForm, template: CatalogSpecificationTemplate | null) {
  if (!template) return {};
  return template.fields
    .filter((field) => !field.isVariant)
    .reduce<Record<string, string>>((acc, field) => {
      const value = form.templateValues[field.key];
      if (value) acc[field.key] = field.unit && field.type === "measurement" ? `${value} ${field.unit}` : value;
      return acc;
    }, {});
}

function productToForm(product: CatalogProduct, duplicate = false): ProductForm {
  return {
    ...emptyProduct,
    id: duplicate ? undefined : product.id,
    name: duplicate ? `${product.name} cópia` : product.name,
    shortDescription: product.shortDescription || "",
    description: product.description || "",
    categoryId: product.category?.id ? String(product.category.id) : "",
    brandId: product.brand?.id ? String(product.brand.id) : "",
    promotionId: product.promotion?.id ? String(product.promotion.id) : "",
    supplier: product.supplier || "",
    supplierLink: product.supplierLink || "",
    supplierLinkVisibleToCustomer: Boolean(product.supplierLinkVisibleToCustomer),
    currency: product.currency || "ZAR",
    supplierPrice: String(product.supplierPrice || ""),
    exchangeRateSnapshot: String(product.exchangeRateSnapshot || ""),
    routeId: product.routeId ? String(product.routeId) : "",
    shippingMode: product.shippingMode || "auto",
    customsMode: product.customsMode || "auto",
    commissionMode: product.commissionMode || "auto",
    shippingCost: String(product.shippingCost || ""),
    customsCost: String(product.customsCost || ""),
    commissionValue: String(product.commissionValue || ""),
    finalPrice: String(product.finalPrice || ""),
    pricingMode: product.pricingMode || "FIXED_PRICE",
    quoteMessage: product.quoteMessage || "O preço poderá variar conforme disponibilidade, câmbio ou fornecedor. Respondemos rapidamente com uma cotação personalizada.",
    quoteResponseDeadline: product.quoteResponseDeadline || "Respondemos com o preço final e prazo em até 24 horas.",
    weight: String(product.weight || ""),
    estimatedDeadline: product.estimatedDeadline || "",
    active: duplicate ? false : product.active,
    featured: product.featured,
    newProduct: product.newProduct,
    bestSeller: product.bestSeller,
    recommended: product.recommended,
    seoTitle: product.seoTitle || "",
    seoDescription: product.seoDescription || "",
    templateValues: product.specifications || {},
    variants: product.variants || [],
    existingImages: duplicate ? [] : product.images || [],
  };
}

function buildProductPayload(form: ProductForm, specs: SpecRow[], action: ProductAction, template: CatalogSpecificationTemplate | null = null) {
  return {
    name: form.name,
    shortDescription: form.shortDescription || null,
    description: form.description || null,
    categoryId: form.categoryId ? Number(form.categoryId) : null,
    brandId: form.brandId ? Number(form.brandId) : null,
    promotionId: form.promotionId ? Number(form.promotionId) : null,
    supplier: form.supplier || null,
    supplierLink: form.supplierLink.trim() || null,
    supplierLinkVisibleToCustomer: form.supplierLinkVisibleToCustomer,
    currency: form.currency,
    routeId: form.routeId ? Number(form.routeId) : null,
    shippingMode: form.shippingMode,
    customsMode: form.customsMode,
    commissionMode: form.commissionMode,
    supplierPrice: Number(form.supplierPrice || 0),
    exchangeRateSnapshot: parseNumber(form.exchangeRateSnapshot),
    shippingCost: parseNumber(form.shippingCost),
    customsCost: parseNumber(form.customsCost),
    commissionValue: parseNumber(form.commissionValue),
    finalPrice: form.pricingMode === "QUOTE_REQUIRED" ? null : Number(form.finalPrice || 0),
    pricingMode: form.pricingMode,
    quoteMessage: form.pricingMode === "QUOTE_REQUIRED" ? form.quoteMessage || null : null,
    quoteResponseDeadline: form.pricingMode === "QUOTE_REQUIRED" ? form.quoteResponseDeadline || null : null,
    weight: parseNumber(form.weight),
    estimatedDeadline: form.estimatedDeadline || null,
    active: action === "publish" ? true : form.active && action !== "draft",
    featured: form.featured,
    newProduct: form.newProduct,
    bestSeller: form.bestSeller,
    recommended: form.recommended,
    seoTitle: form.seoTitle || null,
    seoDescription: form.seoDescription || null,
    specifications: { ...templateSpecs(form, template), ...rowsToSpecs(specs) },
    variants: form.variants,
  };
}

function getProductValidationError(form: ProductForm, images: ImageDraft[], action: ProductAction, options: QuoteOptionsResponse | null, template: CatalogSpecificationTemplate | null) {
  if (!form.name.trim()) return "Indica o nome do produto.";
  if (form.pricingMode === "FIXED_PRICE" && !form.currency.trim()) return "Indica a moeda.";
  if (form.pricingMode === "FIXED_PRICE" && !Number(form.supplierPrice || 0)) return "Indica o preço do fornecedor.";
  if (action === "publish" && form.pricingMode === "FIXED_PRICE") {
    const pricing = calculateCatalogPricing(form, options);
    if (!options?.currencies?.some((currency) => currency.active && currency.code === pricing.currency)) {
      return `A moeda ${pricing.currency || "selecionada"} não está activa em Finanças.`;
    }
    if (!pricing.rate || pricing.exchangeRate <= 0) {
      return `Não existe uma taxa de câmbio activa para ${pricing.currency}.`;
    }
    if (!pricing.route) return "Seleciona uma rota de transporte.";
    if (pricing.finalMzn <= 0) return "O preço final calculado não pode ser zero.";
  }
  if (action === "publish") {
    const missingField = template?.fields.find((field) => field.required && (field.isVariant ? variantValues(form, field.key).length === 0 : !form.templateValues[field.key]));
    if (missingField) return `Preenche ${missingField.label}.`;
  }
  if (action === "publish" && !(form.existingImages?.length || images.length)) {
    return "Adiciona pelo menos uma fotografia antes de publicar o produto.";
  }
  return null;
}

function extractFieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof ApiError) || !error.fieldErrors || typeof error.fieldErrors !== "object") {
    return {};
  }

  return Object.entries(error.fieldErrors as Record<string, unknown>).reduce<FieldErrors>((accumulator, [field, message]) => {
    if (typeof message === "string" && message.trim()) {
      accumulator[field] = message.trim();
    }
    return accumulator;
  }, {});
}

function focusCatalogField(field: string) {
  requestAnimationFrame(() => document.getElementById(`catalog-taxonomy-${field}`)?.focus());
}

function Field({ label, helper, children, error }: { label: string; helper?: string; children: ReactNode; error?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-bold text-slate-200">{label}</span>
      {children}
      {helper ? <span className="block text-xs leading-5 text-slate-400">{helper}</span> : null}
      {error ? <span className="block text-xs font-semibold text-[#FF8066]">{error}</span> : null}
    </label>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
      {active ? "Ativo" : "Inativo"}
    </span>
  );
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "SM";
}

function CatalogStatusSwitch({ checked, label, helper, onChange }: { checked: boolean; label: string; helper?: string; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-left outline-none transition hover:border-[#E8431A]/50 focus:ring-4 focus:ring-[#E8431A]/20"
    >
      <span>
        <span className="block text-sm font-bold text-slate-100">{label}</span>
        {helper ? <span className="mt-1 block text-xs leading-5 text-slate-400">{helper}</span> : null}
      </span>
      <span className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition ${checked ? "bg-[#E8431A]" : "bg-slate-700"}`}>
        <span className={`h-5 w-5 rounded-full bg-white transition ${checked ? "translate-x-5" : ""}`} />
      </span>
    </button>
  );
}

function CatalogPageHeader({
  mode,
  search,
  onSearch,
  onReload,
  onCreate,
}: {
  mode: Mode;
  search: string;
  onSearch: (value: string) => void;
  onReload: () => void;
  onCreate: () => void;
}) {
  const copy = pageCopy[mode];
  return (
    <div className="rounded-[28px] border border-white/10 bg-[#111827] p-5 text-white shadow-[0_24px_70px_rgba(2,6,23,0.30)] md:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#FF8066]">{copy.eyebrow}</p>
          <h1 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold text-slate-100 md:text-3xl">{copy.title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{copy.description}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <form
            className="flex min-w-0 gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onReload();
            }}
          >
            <input
              className="admin-input min-w-0 bg-slate-950/60 text-slate-100 placeholder:text-slate-500 sm:w-72"
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder={mode === "products" ? "Pesquisar produto, marca ou fornecedor" : "Pesquisar por nome"}
              aria-label="Pesquisar no catálogo"
            />
            <button className={secondaryButton} type="submit">Pesquisar</button>
          </form>
          <button className={primaryButton} type="button" onClick={onCreate}>{copy.action}</button>
        </div>
      </div>
    </div>
  );
}

function CatalogEmptyState({ mode, onCreate }: { mode: Mode; onCreate: () => void }) {
  const copy = pageCopy[mode];
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-orange-50 text-2xl font-black text-[#E8431A]">+</div>
      <h2 className="mt-5 font-[family-name:var(--font-sora)] text-xl font-semibold text-slate-950">{copy.emptyTitle}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{copy.emptyDescription}</p>
      <button type="button" onClick={onCreate} className={`${primaryButton} mt-5`}>{copy.emptyAction}</button>
    </div>
  );
}

function CatalogModal({
  open,
  title,
  subtitle,
  size = "large",
  children,
  footer,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  size?: "small" | "large";
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 p-3 md:p-6" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-modal-title"
        className={`admin-modal-panel flex w-full flex-col overflow-hidden rounded-[26px] border border-white/10 bg-[#111827] text-white shadow-2xl ${size === "large" ? "max-w-[1180px]" : "max-w-[620px]"}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="shrink-0 border-b border-white/10 px-5 py-4 md:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#FF8066]">Catálogo por encomenda</p>
              <h2 id="catalog-modal-title" className="mt-2 font-[family-name:var(--font-sora)] text-xl font-semibold text-slate-100 md:text-2xl">{title}</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">{subtitle}</p>
            </div>
            <button type="button" onClick={onClose} className="admin-icon-button border-white/10 bg-white/5 text-white" aria-label="Fechar modal">x</button>
          </div>
        </header>
        <div className="admin-modal-body flex-1 px-5 py-5 md:px-6">{children}</div>
        <footer className="admin-modal-footer shrink-0 border-t border-white/10 px-5 py-4 md:px-6">{footer}</footer>
      </section>
    </div>
  );
}

function CatalogPriceSummary({ form, options }: { form: ProductForm; options: QuoteOptionsResponse | null }) {
  const pricing = calculateCatalogPricing(form, options);
  const rows = [
    ["Produto convertido", pricing.productMzn],
    ["Frete", pricing.shippingMzn],
    ["Alfândega", pricing.customsMzn],
    ["Comissão", pricing.commissionMzn],
  ] as const;

  return (
    <div className="rounded-3xl border border-slate-700 bg-slate-950/70 p-4">
      <p className="text-sm font-black text-slate-100">Resumo interno do preço</p>
      <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-3 text-xs leading-5 text-slate-300">
        <p><strong className="text-slate-100">{pricing.supplierPrice || 0} {pricing.currency || "..."}</strong> do fornecedor</p>
        {pricing.rate ? (
          <p>Taxa utilizada: 1 {pricing.currency} = {pricing.exchangeRate} MT · actualizada em {pricing.rate.validFrom?.slice(0, 10) || pricing.rate.createdAt?.slice(0, 10)}</p>
        ) : (
          <p className="font-semibold text-[#FF8066]">Sem taxa activa para {pricing.currency || "a moeda selecionada"}.</p>
        )}
        {pricing.route ? <p>Rota: {pricing.route.name} · {routeLabel(pricing.route)}</p> : <p className="font-semibold text-[#FF8066]">Seleciona uma rota de transporte.</p>}
      </div>
      <div className="mt-3 space-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 text-sm">
            <span className="text-slate-400">{label}</span>
            <span className="font-bold text-slate-100">{money(value)}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-2xl bg-[#E8431A] px-4 py-3">
        <span className="block text-xs font-bold uppercase tracking-[0.16em] text-white/75">Preço final visível ao cliente</span>
        <span className="mt-1 block font-[family-name:var(--font-sora)] text-2xl font-black text-white">{money(pricing.finalMzn)}</span>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">O produto guarda o preço original, a moeda e o snapshot da taxa usada na publicação.</p>
    </div>
  );
}

function CatalogSpecificationsEditor({ rows, onChange }: { rows: SpecRow[]; onChange: (rows: SpecRow[]) => void }) {
  function update(id: string, key: keyof SpecRow, value: string) {
    onChange(rows.map((row) => (row.id === id ? { ...row, [key]: value } : row)));
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="grid gap-2 md:grid-cols-[1fr_1.5fr_auto]">
            <input className="admin-input bg-slate-950/60 text-slate-100" value={row.key} onChange={(event) => update(row.id, "key", event.target.value)} placeholder="Nome da especificação" aria-label="Nome da especificação" />
            <input className="admin-input bg-slate-950/60 text-slate-100" value={row.value} onChange={(event) => update(row.id, "value", event.target.value)} placeholder="Valor" aria-label="Valor da especificação" />
            <button type="button" className={secondaryButton} onClick={() => onChange(rows.length > 1 ? rows.filter((item) => item.id !== row.id) : [{ ...row, key: "", value: "" }])}>Remover</button>
          </div>
        ))}
      </div>
      <button type="button" className={secondaryButton} onClick={() => onChange([...rows, { id: `${Date.now()}-${rows.length}`, key: "", value: "" }])}>+ Adicionar especificação</button>
    </div>
  );
}

function CatalogCategoryTemplateSelect({ value, onChange }: { value?: string; onChange: (value: string) => void }) {
  return (
    <Field label="Template de especificações" helper="Este template define os campos e variantes sugeridos ao criar produtos nesta categoria.">
      <select className="admin-input bg-slate-950/60 text-slate-100" value={normalizeTemplateKey(value)} onChange={(event) => onChange(event.target.value === "NONE" ? "" : event.target.value)}>
        <option value="NONE">Sem template</option>
        {SPECIFICATION_TEMPLATES.map((template) => <option key={template.key} value={template.key}>{template.label}</option>)}
      </select>
    </Field>
  );
}

function CatalogMultiSelect({ field, values, onChange }: { field: SpecificationField; values: string[]; onChange: (values: string[]) => void }) {
  const [customValue, setCustomValue] = useState("");
  function toggle(value: string) {
    onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {(field.options || []).map((option) => {
          const selected = values.includes(option);
          return (
            <button
              key={option}
              type="button"
              className={`rounded-xl border px-3 py-2 text-sm font-bold ${selected ? "border-[#E8431A] bg-[#E8431A] text-white" : "border-slate-700 bg-slate-950/60 text-slate-200"}`}
              onClick={() => toggle(option)}
            >
              {option}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <input className="admin-input bg-slate-950/60 text-slate-100" value={customValue} onChange={(event) => setCustomValue(event.target.value)} placeholder="Adicionar valor" />
        <button
          type="button"
          className={secondaryButton}
          onClick={() => {
            const value = customValue.trim();
            if (!value || values.includes(value)) return;
            onChange([...values, value]);
            setCustomValue("");
          }}
        >
          Adicionar
        </button>
      </div>
      {values.length ? <p className="text-xs text-slate-400">{values.join(", ")}</p> : null}
    </div>
  );
}

function CatalogMeasurementField({ field, value, onChange }: { field: SpecificationField; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex gap-2">
      <input type="number" className="admin-input bg-slate-950/60 text-slate-100" value={value} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder || "0"} />
      <span className="inline-flex min-w-14 items-center justify-center rounded-2xl border border-slate-700 bg-slate-950/60 px-3 text-sm font-bold text-slate-300">{field.unit}</span>
    </div>
  );
}

function CatalogDynamicSpecifications({ template, form, onChange }: { template: CatalogSpecificationTemplate | null; form: ProductForm; onChange: (form: ProductForm) => void }) {
  if (!template) {
    const existingVariants = variantFieldsFromForm(form);
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 p-4">
          <p className="text-sm font-black text-slate-100">Nenhum template definido</p>
          <p className="mt-1 text-sm leading-6 text-slate-300">Escolhe uma categoria com template para carregar campos automáticos. Usa &quot;Outras especificações&quot; para adicionar campos manualmente.</p>
        </div>
        {existingVariants.length ? (
          <div>
            <p className="text-sm font-black text-slate-100">Variantes guardadas</p>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              {existingVariants.map((field) => (
                <Field key={field.key} label={field.label} helper={field.required ? "Obrigatório para encomendar" : undefined}>
                  <CatalogMultiSelect field={field} values={variantValues(form, field.key)} onChange={(values) => onChange(updateVariant(form, field, values))} />
                </Field>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  const specs = template.fields.filter((field) => !field.isVariant);
  const variants = template.fields.filter((field) => field.isVariant);
  const perfumeTemplate = template.key === "PERFUMES";

  function updateSpec(key: string, value: string) {
    onChange({ ...form, templateValues: { ...form.templateValues, [key]: value } });
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-black text-slate-100">Especificações da categoria</p>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {specs.map((field) => (
            <Field key={field.key} label={field.label} helper={field.required ? "Obrigatório" : undefined}>
              {field.type === "select" ? (
                <select className="admin-input bg-slate-950/60 text-slate-100" value={form.templateValues[field.key] || ""} onChange={(event) => updateSpec(field.key, event.target.value)}>
                  <option value="">Seleciona</option>
                  {(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : field.type === "measurement" ? (
                <CatalogMeasurementField field={field} value={form.templateValues[field.key] || ""} onChange={(value) => updateSpec(field.key, value)} />
              ) : field.type === "boolean" ? (
                <select className="admin-input bg-slate-950/60 text-slate-100" value={form.templateValues[field.key] || ""} onChange={(event) => updateSpec(field.key, event.target.value)}>
                  <option value="">Seleciona</option>
                  <option value="Sim">Sim</option>
                  <option value="Não">Não</option>
                </select>
              ) : (
                <input className="admin-input bg-slate-950/60 text-slate-100" value={form.templateValues[field.key] || ""} onChange={(event) => updateSpec(field.key, event.target.value)} placeholder={field.placeholder} />
              )}
            </Field>
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm font-black text-slate-100">Variantes</p>
        {perfumeTemplate ? (
          <CatalogPerfumeVariants form={form} onChange={onChange} />
        ) : <div className="mt-3 grid gap-4 md:grid-cols-2">
          {variants.map((field) => (
            <Field key={field.key} label={field.label} helper={field.required ? "Obrigatório para encomendar" : undefined}>
              <CatalogMultiSelect field={field} values={variantValues(form, field.key)} onChange={(values) => onChange(updateVariant(form, field, values))} />
            </Field>
          ))}
        </div>}
      </div>
    </div>
  );
}

function CatalogPerfumeVariants({ form, onChange }: { form: ProductForm; onChange: (form: ProductForm) => void }) {
  const definition = form.variants.find((variant) => variant.key === "volume");
  const options = definition?.options || [];
  const suggestions = ["30 ml", "50 ml", "75 ml", "100 ml", "125 ml", "200 ml"];
  const commit = (next: typeof options) => onChange({
    ...form,
    variants: [
      ...form.variants.filter((variant) => variant.key !== "volume"),
      { key: "volume", label: "Volume", required: true, values: next.map((item) => item.value), options: next },
    ],
  });
  const add = (value: string) => {
    if (!value || options.some((option) => option.value.toLowerCase() === value.toLowerCase())) return;
    commit([...options, { value, price: null, imageUrl: "", available: true, stock: null }]);
  };
  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        {suggestions.map((value) => <button key={value} type="button" className="rounded-xl border border-slate-600 px-3 py-2 text-xs font-bold text-slate-200" onClick={() => add(value)}>+ {value}</button>)}
        <button type="button" className="rounded-xl border border-orange-500 px-3 py-2 text-xs font-bold text-orange-400" onClick={() => { const value = window.prompt("Indica o volume, por exemplo 60 ml"); if (value) add(value.trim()); }}>+ Volume personalizado</button>
      </div>
      {options.map((option, index) => (
        <div key={`${option.value}-${index}`} className="grid gap-3 rounded-2xl border border-slate-700 bg-slate-950/50 p-4 md:grid-cols-[1fr_1fr_2fr_auto_auto] md:items-end">
          <Field label="Volume"><input className="admin-input bg-slate-950/60 text-slate-100" value={option.value} onChange={(event) => commit(options.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} /></Field>
          <Field label="Preço em MZN"><input type="number" min="0.01" step="0.01" className="admin-input bg-slate-950/60 text-slate-100" value={option.price ?? ""} onChange={(event) => commit(options.map((item, itemIndex) => itemIndex === index ? { ...item, price: event.target.value ? Number(event.target.value) : null } : item))} /></Field>
          <Field label="Fotografia da variante (URL)"><input className="admin-input bg-slate-950/60 text-slate-100" value={option.imageUrl || ""} onChange={(event) => commit(options.map((item, itemIndex) => itemIndex === index ? { ...item, imageUrl: event.target.value } : item))} /></Field>
          <CatalogStatusSwitch label="Disponível" checked={option.available !== false} onChange={(available) => commit(options.map((item, itemIndex) => itemIndex === index ? { ...item, available } : item))} />
          <button type="button" className="rounded-xl border border-red-500 px-3 py-3 text-sm font-bold text-red-400" onClick={() => commit(options.filter((_, itemIndex) => itemIndex !== index))}>Remover</button>
          {option.imageUrl ? <img src={option.imageUrl} alt={option.value} className="h-20 w-20 rounded-xl object-cover" /> : null}
        </div>
      ))}
      {!options.length ? <p className="text-sm text-amber-300">Adiciona pelo menos um volume com preço, fotografia e disponibilidade.</p> : null}
    </div>
  );
}

function CatalogImageUploader({
  existingImages,
  drafts,
  onChange,
}: {
  existingImages?: CatalogImage[];
  drafts: ImageDraft[];
  onChange: (drafts: ImageDraft[]) => void;
}) {
  const [fileError, setFileError] = useState("");
  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const accepted = Array.from(files).filter((file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size <= 8 * 1024 * 1024);
    const rejected = files.length - accepted.length;
    setFileError(rejected ? `${rejected} fotografia(s) ignorada(s). Usa JPG, PNG ou WEBP com até 8 MB.` : "");
    const next = accepted.map((file, index) => ({
      id: `${file.name}-${file.lastModified}-${index}-${crypto.randomUUID()}`,
      file,
      previewUrl: URL.createObjectURL(file),
      primary: !existingImages?.length && drafts.length === 0 && index === 0,
      status: "ready" as const,
    }));
    onChange([...drafts, ...next]);
  }

  function move(id: string, direction: -1 | 1) {
    const index = drafts.findIndex((draft) => draft.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= drafts.length) return;
    const next = [...drafts];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-4">
      <label
        className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-[#E8431A]/55 bg-[#E8431A]/8 px-6 py-8 text-center outline-none transition hover:bg-[#E8431A]/12 focus-within:ring-4 focus-within:ring-[#E8431A]/20"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          addFiles(event.dataTransfer.files);
        }}
      >
        <span className="text-lg font-black text-slate-100">Arrasta fotografias para aqui</span>
        <span className="mt-2 text-sm leading-6 text-slate-400">JPG, PNG ou WEBP até 8 MB. Também podes clicar para selecionar.</span>
        <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { addFiles(event.target.files); event.currentTarget.value = ""; }} />
      </label>
      {fileError ? <p role="alert" className="rounded-xl border border-red-700/50 bg-red-950/40 px-4 py-3 text-sm font-semibold text-red-200">{fileError}</p> : null}

      {existingImages?.length ? (
        <div>
          <p className="mb-2 text-sm font-bold text-slate-200">Fotografias atuais</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {existingImages.map((image) => (
              <div key={image.id} className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950">
                <img src={image.thumbnailUrl || image.originalUrl} alt={image.altText || "Fotografia do produto"} className="h-32 w-full object-cover" />
                <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-300">
                  <span>Ordem {image.displayOrder}</span>
                  {image.primaryImage ? <span className="font-bold text-[#FF8066]">Principal</span> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {drafts.length ? (
        <div>
          <p className="mb-2 text-sm font-bold text-slate-200">Novas fotografias</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {drafts.map((draft, index) => (
              <div key={draft.id} className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950">
                <img src={draft.previewUrl} alt={draft.file.name} className="h-32 w-full object-cover" />
                <div className="space-y-2 p-3">
                  <p className="truncate text-xs font-bold text-slate-100">{draft.file.name}</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="rounded-xl border border-slate-700 px-2 py-1 text-xs font-bold text-slate-200" onClick={() => onChange(drafts.map((item) => ({ ...item, primary: item.id === draft.id })))}>Principal</button>
                    <button type="button" className="rounded-xl border border-slate-700 px-2 py-1 text-xs font-bold text-slate-200 disabled:opacity-40" disabled={index === 0} onClick={() => move(draft.id, -1)}>Subir</button>
                    <button type="button" className="rounded-xl border border-slate-700 px-2 py-1 text-xs font-bold text-slate-200 disabled:opacity-40" disabled={index === drafts.length - 1} onClick={() => move(draft.id, 1)}>Descer</button>
                    <button type="button" className="rounded-xl border border-red-700/60 px-2 py-1 text-xs font-bold text-red-200" onClick={() => onChange(drafts.filter((item) => item.id !== draft.id))}>Remover</button>
                  </div>
                  <p className="text-xs text-slate-500">{draft.primary ? "Imagem principal" : "Pronta para envio"}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CatalogAssetUploader({
  value,
  draft,
  label,
  helperText,
  aspectRatio = "free",
  onSelect,
  onRemove,
}: {
  value?: string | null;
  draft?: CatalogAssetDraft | null;
  label: string;
  helperText?: string;
  aspectRatio?: "square" | "wide" | "free";
  onSelect: (draft: CatalogAssetDraft) => void;
  onRemove: () => void;
}) {
  const visibleUrl = draft?.previewUrl || value || "";
  const aspectClass = aspectRatio === "square" ? "aspect-square" : aspectRatio === "wide" ? "aspect-[8/3]" : "min-h-[180px]";

  function selectFile(file: File | null | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      onSelect({ file, previewUrl: "", status: "error", error: "Imagem inválida. Usa JPG, PNG ou WEBP." });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      onSelect({ file, previewUrl: "", status: "error", error: "A imagem excede o limite de 8 MB." });
      return;
    }
    onSelect({ file, previewUrl: URL.createObjectURL(file), status: "ready" });
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-bold text-slate-200">{label}</p>
        {helperText ? <p className="mt-1 text-xs leading-5 text-slate-400">{helperText}</p> : null}
      </div>
      <label
        className={`flex ${aspectClass} cursor-pointer flex-col items-center justify-center overflow-hidden rounded-3xl border border-dashed border-[#E8431A]/55 bg-[#E8431A]/8 px-5 py-6 text-center transition hover:bg-[#E8431A]/12 focus-within:ring-4 focus-within:ring-[#E8431A]/20`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          selectFile(event.dataTransfer.files?.[0]);
        }}
      >
        {visibleUrl ? (
          <img src={visibleUrl} alt={label} className="h-full max-h-72 w-full object-contain" />
        ) : (
          <span>
            <span className="block text-base font-black text-slate-100">Arrasta a imagem para aqui</span>
            <span className="mt-2 block text-sm leading-6 text-slate-400">ou clica para selecionar</span>
            <span className="mt-1 block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">PNG, JPG ou WEBP</span>
          </span>
        )}
        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => selectFile(event.target.files?.[0])} />
      </label>
      {draft?.status === "uploading" ? <p className="text-sm font-semibold text-slate-300">A carregar imagem...</p> : null}
      {draft?.status === "done" ? <p className="text-sm font-semibold text-emerald-300">Imagem carregada com sucesso.</p> : null}
      {draft?.error ? <p className="text-sm font-semibold text-[#FF8066]">{draft.error}</p> : null}
      {visibleUrl ? (
        <div className="flex flex-wrap gap-2">
          <label className={`${secondaryButton} cursor-pointer`}>
            Substituir
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => selectFile(event.target.files?.[0])} />
          </label>
          <button type="button" className={secondaryButton} onClick={onRemove}>Remover</button>
        </div>
      ) : null}
    </div>
  );
}

function CatalogProductModal({
  open,
  form,
  specs,
  images,
  categories,
  brands,
  promotions,
  quoteOptions,
  saving,
  feedback,
  onChange,
  onSpecsChange,
  onImagesChange,
  onSubmit,
  onClose,
}: {
  open: boolean;
  form: ProductForm;
  specs: SpecRow[];
  images: ImageDraft[];
  categories: CatalogTaxonomy[];
  brands: CatalogTaxonomy[];
  promotions: CatalogPromotion[];
  quoteOptions: QuoteOptionsResponse | null;
  saving: boolean;
  feedback: Feedback;
  onChange: (form: ProductForm) => void;
  onSpecsChange: (rows: SpecRow[]) => void;
  onImagesChange: (drafts: ImageDraft[]) => void;
  onSubmit: (action: ProductAction) => void;
  onClose: () => void;
}) {
  const pricing = calculateCatalogPricing(form, quoteOptions);
  const activeCurrencies = (quoteOptions?.currencies || []).filter((currency) => currency.active && currency.code !== "MZN");
  const routes = quoteOptions?.routes || [];
  const originLocations = Array.from(new Map(routes.map((route) => [route.origin.id, route.origin])).values());
  const selectedOriginId = form.originId || (pricing.route?.origin?.id ? String(pricing.route.origin.id) : "");
  const routeOptions = selectedOriginId
    ? routes.filter((route) => String(route.origin.id) === selectedOriginId)
    : routes;
  const selectedCategory = categories.find((category) => String(category.id) === String(form.categoryId));
  const activeTemplate = normalizeTemplateKey(selectedCategory?.specificationTemplate);
  const selectedTemplate = categoryTemplate(categories, form.categoryId);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    console.debug("[CatalogProductModal]", {
      categoryId: form.categoryId,
      selectedCategory,
      specificationTemplate: selectedCategory?.specificationTemplate,
      activeTemplate,
    });
  }, [activeTemplate, form.categoryId, selectedCategory]);

  function updatePricedForm(nextForm: ProductForm) {
    onChange(withCatalogPricing(nextForm, quoteOptions));
  }

  function updateCategory(categoryId: string) {
    if (form.categoryId && form.categoryId !== categoryId && (Object.keys(form.templateValues).length || form.variants.length)) {
      const confirmed = window.confirm("Ao mudar de categoria, algumas especificações e variantes poderão ser removidas. Deseja continuar?");
      if (!confirmed) return;
    }
    onChange({ ...form, categoryId, templateValues: {}, variants: [] });
  }

  return (
    <CatalogModal
      open={open}
      title={form.id ? "Editar produto por encomenda" : "Adicionar produto por encomenda"}
      subtitle="Cria um produto para o catálogo “Escolhas da ShopeeMz”. O cliente verá apenas o preço final em Meticais."
      onClose={onClose}
      footer={
        <div className="space-y-3">
          {feedback ? <AdminBanner tone={feedback.tone} message={feedback.message} /> : null}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" className={secondaryButton} onClick={onClose}>Cancelar</button>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" className={secondaryButton} disabled={saving} onClick={() => onSubmit("draft")}>{saving ? "A guardar..." : "Guardar rascunho"}</button>
              <button type="button" className={primaryButton} disabled={saving} onClick={() => onSubmit("publish")}>{saving ? "A publicar..." : "Publicar produto"}</button>
            </div>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {feedback ? <AdminBanner tone={feedback.tone} message={feedback.message} /> : null}

        <section className="rounded-3xl border border-slate-700 bg-slate-900/70 p-4">
          <h3 className="font-[family-name:var(--font-sora)] text-lg font-semibold text-slate-100">Informação principal</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Field label="Nome do produto"><input className="admin-input bg-slate-950/60 text-slate-100" value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} required /></Field>
            <Field label="Categoria / subcategoria" helper="As subcategorias aparecem agrupadas dentro da categoria principal."><select className="admin-input bg-slate-950/60 text-slate-100" value={form.categoryId} onChange={(event) => updateCategory(event.target.value)}><option value="">Sem categoria</option>{categories.filter((item) => !item.parentId).flatMap((parent) => [<option key={parent.id} value={parent.id}>{parent.name}</option>, ...categories.filter((child) => child.parentId === parent.id).map((child) => <option key={child.id} value={child.id}>　↳ {child.name}</option>)])}</select></Field>
            <Field label="Marca"><select className="admin-input bg-slate-950/60 text-slate-100" value={form.brandId} onChange={(event) => onChange({ ...form, brandId: event.target.value })}><option value="">Sem marca</option>{brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="Modelo de comercialização" helper="Define se o cliente paga o preço publicado ou solicita uma cotação."><select className="admin-input bg-slate-950/60 text-slate-100" value={form.pricingMode} onChange={(event) => { const pricingMode = event.target.value as ProductForm["pricingMode"]; onChange({ ...form, pricingMode, promotionId: pricingMode === "QUOTE_REQUIRED" ? "" : form.promotionId }); }}><option value="FIXED_PRICE">Preço definido</option><option value="QUOTE_REQUIRED">Preço sob consulta</option></select></Field>
            <Field label="Fornecedor"><input className="admin-input bg-slate-950/60 text-slate-100" value={form.supplier} onChange={(event) => onChange({ ...form, supplier: event.target.value })} /></Field>
            <Field label="Link do fornecedor">
              <input className="admin-input bg-slate-950/60 text-slate-100" value={form.supplierLink} onChange={(event) => onChange({ ...form, supplierLink: event.target.value })} />
              <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm text-slate-300">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-orange-500"
                  checked={form.supplierLinkVisibleToCustomer}
                  onChange={(event) => onChange({ ...form, supplierLinkVisibleToCustomer: event.target.checked })}
                />
                <span>
                  <strong className="block text-slate-100">Mostrar este link ao cliente</strong>
                  Desmarcado, o link fica visível apenas para a equipa administrativa.
                </span>
              </label>
            </Field>
            {form.pricingMode === "FIXED_PRICE" ? <Field label="Campanha promocional" helper="Associa este produto a uma campanha ativa do catálogo. Campanhas terminadas aparecem bloqueadas.">
              <select className="admin-input bg-slate-950/60 text-slate-100" value={form.promotionId} onChange={(event) => onChange({ ...form, promotionId: event.target.value })}>
                <option value="">Sem campanha</option>
                {promotions.map((item) => (
                  <option key={item.id} value={item.id} disabled={!canApplyPromotionByDefault(item)}>
                    {promotionOptionLabel(item)}
                  </option>
                ))}
              </select>
            </Field> : null}
          </div>
          {form.pricingMode === "QUOTE_REQUIRED" ? <div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Mensagem ao cliente"><textarea className="admin-input min-h-28 resize-y bg-slate-950/60 text-slate-100" value={form.quoteMessage} onChange={(event) => onChange({ ...form, quoteMessage: event.target.value })} maxLength={500} /></Field><Field label="Prazo médio para resposta"><input className="admin-input bg-slate-950/60 text-slate-100" value={form.quoteResponseDeadline} onChange={(event) => onChange({ ...form, quoteResponseDeadline: event.target.value })} placeholder="Respondemos com o preço final e prazo em até 24 horas." maxLength={120} /></Field></div> : null}
          <div className="mt-4">
            <Field label="Descrição curta"><textarea className="admin-input min-h-24 resize-y bg-slate-950/60 text-slate-100" value={form.shortDescription} onChange={(event) => onChange({ ...form, shortDescription: event.target.value })} /></Field>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-700 bg-slate-900/70 p-4">
          <h3 className="font-[family-name:var(--font-sora)] text-lg font-semibold text-slate-100">Fotografias</h3>
          <p className="mt-1 text-sm text-slate-400">Pelo menos uma imagem é obrigatória para publicar.</p>
          <div className="mt-4"><CatalogImageUploader existingImages={form.existingImages} drafts={images} onChange={onImagesChange} /></div>
        </section>

        {form.pricingMode === "FIXED_PRICE" ? <section className="rounded-3xl border border-slate-700 bg-slate-900/70 p-4">
          <h3 className="font-[family-name:var(--font-sora)] text-lg font-semibold text-slate-100">Preço e importação</h3>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Moeda">
                <select className="admin-input bg-slate-950/60 text-slate-100" value={form.currency} onChange={(event) => updatePricedForm({ ...form, currency: event.target.value, routeId: "" })}>
                  <option value="">Seleciona a moeda</option>
                  {activeCurrencies.map((currency) => <option key={currency.id} value={currency.code}>{currency.code} - {currency.name}</option>)}
                </select>
              </Field>
              <Field label="Preço do fornecedor"><input type="number" min="0" step="0.01" className="admin-input bg-slate-950/60 text-slate-100" value={form.supplierPrice} onChange={(event) => updatePricedForm({ ...form, supplierPrice: event.target.value })} /></Field>
              <Field label="País de origem">
                <select className="admin-input bg-slate-950/60 text-slate-100" value={selectedOriginId} onChange={(event) => updatePricedForm({ ...form, originId: event.target.value, routeId: "" })}>
                  <option value="">Seleciona a origem</option>
                  {originLocations.map((location) => <option key={location.id} value={location.id}>{location.label}</option>)}
                </select>
              </Field>
              <Field label="Rota de transporte">
                <select
                  className="admin-input bg-slate-950/60 text-slate-100"
                  value={form.routeId}
                  onChange={(event) => {
                    const route = routeById(quoteOptions, event.target.value);
                    updatePricedForm({ ...form, originId: route?.origin?.id ? String(route.origin.id) : form.originId, routeId: event.target.value, currency: route?.currencyCode || form.currency, shippingMode: "auto", customsMode: "auto", commissionMode: "auto" });
                  }}
                >
                  <option value="">Seleciona a rota</option>
                  {routeOptions.map((route) => <option key={route.id} value={route.id}>{route.name} - {routeLabel(route)} - {route.currencyCode}</option>)}
                </select>
              </Field>
              <Field label="Tempo estimado de chegada" helper="Prazo que o cliente verá na página do produto. Exemplo: 10–20 dias.">
                <input
                  className="admin-input bg-slate-950/60 text-slate-100"
                  value={form.estimatedDeadline}
                  onChange={(event) => onChange({ ...form, estimatedDeadline: event.target.value })}
                  placeholder={pricing.route?.estimatedDaysLabel || "Ex.: 10–20 dias"}
                  maxLength={80}
                />
              </Field>
              <Field label="Peso"><input type="number" min="0" step="0.01" className="admin-input bg-slate-950/60 text-slate-100" value={form.weight} onChange={(event) => updatePricedForm({ ...form, weight: event.target.value })} /></Field>
              <Field label="Frete">
                <select className="admin-input bg-slate-950/60 text-slate-100" value={form.shippingMode} onChange={(event) => updatePricedForm({ ...form, shippingMode: event.target.value as ProductForm["shippingMode"] })}>
                  <option value="auto">Automático pela rota</option>
                  <option value="custom">Valor personalizado</option>
                </select>
              </Field>
              {form.shippingMode === "custom" ? <Field label="Frete personalizado em MZN"><input type="number" min="0" step="0.01" className="admin-input bg-slate-950/60 text-slate-100" value={form.shippingCost} onChange={(event) => updatePricedForm({ ...form, shippingCost: event.target.value })} /></Field> : null}
              <Field label="Taxa utilizada"><input readOnly className="admin-input bg-slate-950/60 text-slate-300" value={pricing.exchangeRate > 0 ? `1 ${pricing.currency} = ${pricing.exchangeRate} MT` : "Sem taxa activa"} /></Field>
              <Field label="Alfândega"><select className="admin-input bg-slate-950/60 text-slate-100" value={form.customsMode} onChange={(event) => updatePricedForm({ ...form, customsMode: event.target.value as ProductForm["customsMode"] })}><option value="auto">Automática pela rota</option><option value="custom">Valor personalizado</option></select></Field>
              {form.customsMode === "custom" ? <Field label="Alfândega personalizada em MZN"><input type="number" min="0" step="0.01" className="admin-input bg-slate-950/60 text-slate-100" value={form.customsCost} onChange={(event) => updatePricedForm({ ...form, customsCost: event.target.value })} /></Field> : <Field label="Alfândega calculada"><input readOnly className="admin-input bg-slate-950/60 text-slate-300" value={pricing.route ? (pricing.customsType === "FIXED" ? money(pricing.customsMzn) : `${pricing.customsValue}% (${money(pricing.customsMzn)})`) : "Seleciona uma rota"} /></Field>}
              <Field label="Comissão"><select className="admin-input bg-slate-950/60 text-slate-100" value={form.commissionMode} onChange={(event) => updatePricedForm({ ...form, commissionMode: event.target.value as ProductForm["commissionMode"] })}><option value="auto">Automática pela rota</option><option value="custom">Valor personalizado</option></select></Field>
              {form.commissionMode === "custom" ? <Field label="Comissão personalizada em MZN"><input type="number" min="0" step="0.01" className="admin-input bg-slate-950/60 text-slate-100" value={form.commissionValue} onChange={(event) => updatePricedForm({ ...form, commissionValue: event.target.value })} /></Field> : <Field label="Comissão calculada"><input readOnly className="admin-input bg-slate-950/60 text-slate-300" value={pricing.route ? `${pricing.commissionPercent}% (${money(pricing.commissionMzn)})` : "Seleciona uma rota"} /></Field>}
            </div>
            <CatalogPriceSummary form={form} options={quoteOptions} />
          </div>
        </section> : null}

        <section className="rounded-3xl border border-slate-700 bg-slate-900/70 p-4">
          <h3 className="font-[family-name:var(--font-sora)] text-lg font-semibold text-slate-100">Conteúdo</h3>
          <div className="mt-4 space-y-4">
            <Field label="Descrição completa"><textarea className="admin-input min-h-36 resize-y bg-slate-950/60 text-slate-100" value={form.description} onChange={(event) => onChange({ ...form, description: event.target.value })} /></Field>
            <div>
              <p className="mb-2 text-sm font-bold text-slate-200">Especificações estruturadas</p>
              <CatalogDynamicSpecifications template={selectedTemplate} form={form} onChange={onChange} />
              <p className="mb-2 mt-4 text-sm font-bold text-slate-200">Outras especificações</p>
              <CatalogSpecificationsEditor rows={specs} onChange={onSpecsChange} />
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-700 bg-slate-900/70 p-4">
          <h3 className="font-[family-name:var(--font-sora)] text-lg font-semibold text-slate-100">Visibilidade</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <CatalogStatusSwitch label="Produto ativo" checked={form.active} onChange={(checked) => onChange({ ...form, active: checked })} />
            <CatalogStatusSwitch label="Mostrar na página inicial" checked={form.featured} onChange={(checked) => onChange({ ...form, featured: checked })} />
            <CatalogStatusSwitch label="Marcar como novidade" checked={form.newProduct} onChange={(checked) => onChange({ ...form, newProduct: checked })} />
            <CatalogStatusSwitch label="Marcar como mais vendido" checked={form.bestSeller} onChange={(checked) => onChange({ ...form, bestSeller: checked })} />
            <CatalogStatusSwitch label="Recomendado pela ShopeeMz" checked={form.recommended} onChange={(checked) => onChange({ ...form, recommended: checked })} />
            {form.pricingMode === "FIXED_PRICE" ? <CatalogStatusSwitch label="Produto em promoção" checked={Boolean(form.promotionId)} helper="Escolhe uma campanha ativa na secção principal." onChange={(checked) => onChange({ ...form, promotionId: checked ? form.promotionId : "" })} /> : null}
          </div>
        </section>
      </div>
    </CatalogModal>
  );
}

function CatalogCategoryModal({
  open,
  mode,
  form,
  logoDraft,
  saving,
  feedback,
  fieldErrors = {},
  onChange,
  onLogoDraftChange,
  onSubmit,
  onClose,
  categories,
}: {
  open: boolean;
  mode: "categories" | "brands";
  form: TaxonomyForm;
  logoDraft?: CatalogAssetDraft | null;
  saving: boolean;
  feedback: Feedback;
  fieldErrors?: FieldErrors;
  onChange: (form: TaxonomyForm) => void;
  onLogoDraftChange: (draft: CatalogAssetDraft | null) => void;
  onSubmit: () => void;
  onClose: () => void;
  categories: CatalogTaxonomy[];
}) {
  const isBrand = mode === "brands";
  const descriptionLimit = isBrand ? BRAND_DESCRIPTION_LIMIT : CATEGORY_DESCRIPTION_LIMIT;
  const descriptionLength = form.description.length;
  const descriptionError = fieldErrors.description || (descriptionLength > descriptionLimit ? `A descrição deve ter no máximo ${descriptionLimit.toLocaleString("pt-MZ")} caracteres.` : undefined);
  return (
    <CatalogModal
      open={open}
      size="small"
      title={form.id ? (isBrand ? "Editar marca do catálogo" : "Editar categoria do catálogo") : (isBrand ? "Nova marca do catálogo" : "Nova categoria do catálogo")}
      subtitle={isBrand ? "Mantém a marca visível e clara para os produtos por encomenda." : "Organiza os produtos por encomenda em grupos fáceis de encontrar."}
      onClose={onClose}
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <button type="button" className={secondaryButton} onClick={onClose}>Cancelar</button>
          <button type="button" className={primaryButton} disabled={saving} onClick={onSubmit}>{saving ? "A guardar..." : "Guardar"}</button>
        </div>
      }
    >
      <div className="space-y-4">
        {feedback ? <AdminBanner tone={feedback.tone} message={feedback.message} /> : null}
        <Field label="Nome" error={fieldErrors.name}><input id="catalog-taxonomy-name" className="admin-input bg-slate-950/60 text-slate-100" value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value, slug: form.slug || slugify(event.target.value) })} /></Field>
        {!isBrand ? <Field label="Categoria principal" helper="Deixa sem seleção para criar uma categoria principal; seleciona uma categoria para criar uma subcategoria."><select className="admin-input bg-slate-950/60 text-slate-100" value={form.parentId} onChange={(event) => onChange({ ...form, parentId: event.target.value })}><option value="">Categoria principal</option>{categories.filter((item) => !item.parentId && item.id !== form.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field> : null}
        <Field label="Descrição" helper={`${descriptionLength.toLocaleString("pt-MZ")} / ${descriptionLimit.toLocaleString("pt-MZ")} caracteres`} error={descriptionError}>
          <textarea id="catalog-taxonomy-description" maxLength={descriptionLimit} className="admin-input min-h-28 resize-y bg-slate-950/60 text-slate-100" value={form.description} onChange={(event) => onChange({ ...form, description: event.target.value })} />
        </Field>
        {!isBrand ? <CatalogCategoryTemplateSelect value={form.specificationTemplate} onChange={(specificationTemplate) => onChange({ ...form, specificationTemplate })} /> : null}
        {isBrand ? (
          <CatalogAssetUploader
            label="Logótipo da marca"
            helperText="Carrega um ficheiro do computador. O URL final é preenchido automaticamente após o upload."
            aspectRatio="square"
            value={form.logoUrl}
            draft={logoDraft}
            onSelect={onLogoDraftChange}
            onRemove={() => {
              onLogoDraftChange(null);
              onChange({ ...form, logoUrl: "" });
            }}
          />
        ) : null}
        {!isBrand ? <Field label="Ordem de apresentação" helper="Categorias com número menor aparecem primeiro."><input type="number" className="admin-input bg-slate-950/60 text-slate-100" value={form.displayOrder} onChange={(event) => onChange({ ...form, displayOrder: event.target.value })} /></Field> : null}
        <details className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
          <summary className="cursor-pointer text-sm font-bold text-slate-200">Opções avançadas</summary>
          <div className="mt-3 space-y-3">
            <Field label="Slug"><input className="admin-input bg-slate-950/60 text-slate-100" value={form.slug} onChange={(event) => onChange({ ...form, slug: event.target.value })} placeholder={slugify(form.name) || "gerado automaticamente"} /></Field>
            {isBrand ? <Field label="URL externa do logótipo"><input className="admin-input bg-slate-950/60 text-slate-100" value={form.logoUrl || ""} onChange={(event) => onChange({ ...form, logoUrl: event.target.value })} /></Field> : null}
          </div>
        </details>
        <CatalogStatusSwitch label={isBrand ? "Marca ativa" : "Categoria ativa"} checked={form.active} onChange={(checked) => onChange({ ...form, active: checked })} />
      </div>
    </CatalogModal>
  );
}

function CatalogPromotionModal({
  open,
  form,
  imageDraft,
  saving,
  feedback,
  onChange,
  onImageDraftChange,
  onSubmit,
  onClose,
  products,
}: {
  open: boolean;
  form: PromotionForm;
  imageDraft?: CatalogAssetDraft | null;
  saving: boolean;
  feedback: Feedback;
  onChange: (form: PromotionForm) => void;
  onImageDraftChange: (draft: CatalogAssetDraft | null) => void;
  onSubmit: () => void;
  onClose: () => void;
  products: CatalogProduct[];
}) {
  return (
    <CatalogModal
      open={open}
      size="small"
      title={form.id ? "Editar promoção do catálogo" : "Nova promoção do catálogo"}
      subtitle="Cria campanhas que podem ser aplicadas a vários produtos do catálogo."
      onClose={onClose}
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <button type="button" className={secondaryButton} onClick={onClose}>Cancelar</button>
          <button type="button" className={primaryButton} disabled={saving} onClick={onSubmit}>{saving ? "A guardar..." : "Guardar promoção"}</button>
        </div>
      }
    >
      <div className="space-y-4">
        {feedback ? <AdminBanner tone={feedback.tone} message={feedback.message} /> : null}
        <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4 text-sm leading-6 text-slate-300">
          Exemplos: Black Friday, Lançamento, Volta às aulas, Semana ShopeeMz ou Oferta especial.
        </div>
        <Field label="Nome da promoção"><input className="admin-input bg-slate-950/60 text-slate-100" value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value, slug: form.slug || slugify(event.target.value) })} /></Field>
        <Field label="Descrição curta"><textarea className="admin-input min-h-24 resize-y bg-slate-950/60 text-slate-100" value={form.description} onChange={(event) => onChange({ ...form, description: event.target.value })} /></Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Tipo da promoção">
            <select className="admin-input bg-slate-950/60 text-slate-100" value={form.promotionType} onChange={(event) => onChange({ ...form, promotionType: event.target.value as PromotionForm["promotionType"] })}>
              <option value="PERCENTAGE">Percentagem</option>
              <option value="FIXED_AMOUNT">Valor fixo</option>
              <option value="LABEL_ONLY">Apenas destaque visual</option>
              <option value="BUNDLE_PICK">Escolha os teus perfumes</option>
            </select>
          </Field>
          {form.promotionType === "PERCENTAGE" ? (
            <Field label="Valor do desconto (%)"><input type="number" min="0" max="100" step="0.01" className="admin-input bg-slate-950/60 text-slate-100" value={form.discountPercent} onChange={(event) => onChange({ ...form, discountPercent: event.target.value })} /></Field>
          ) : null}
          {form.promotionType === "FIXED_AMOUNT" ? (
            <Field label="Valor do desconto (MZN)"><input type="number" min="0" step="0.01" className="admin-input bg-slate-950/60 text-slate-100" value={form.discountValue} onChange={(event) => onChange({ ...form, discountValue: event.target.value })} /></Field>
          ) : null}
          {form.promotionType === "LABEL_ONLY" ? (
            <div className="rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-300">Esta campanha adiciona destaque visual e badge, sem alterar automaticamente o preço.</div>
          ) : null}
          <Field label="Data de início"><input type="date" className="admin-input bg-slate-950/60 text-slate-100" value={form.startsAt} onChange={(event) => onChange({ ...form, startsAt: event.target.value })} /></Field>
          <Field label="Data de fim"><input type="date" className="admin-input bg-slate-950/60 text-slate-100" value={form.endsAt} onChange={(event) => onChange({ ...form, endsAt: event.target.value })} /></Field>
          {form.promotionType === "BUNDLE_PICK" ? <>
            <Field label="Quantidade exata"><input type="number" min="2" className="admin-input bg-slate-950/60 text-slate-100" value={form.choiceQuantity} onChange={(event) => onChange({ ...form, choiceQuantity: event.target.value })} /></Field>
            <Field label="Preço total em MZN"><input type="number" min="0.01" step="0.01" className="admin-input bg-slate-950/60 text-slate-100" value={form.bundlePrice} onChange={(event) => onChange({ ...form, bundlePrice: event.target.value })} /></Field>
            <Field label="Volume fixo"><select className="admin-input bg-slate-950/60 text-slate-100" value={form.fixedVolume} onChange={(event) => onChange({ ...form, fixedVolume: event.target.value, participants: [] })}>{["30 ml", "50 ml", "75 ml", "100 ml", "125 ml", "200 ml"].map((value) => <option key={value}>{value}</option>)}</select></Field>
            <Field label="Limite por cliente"><input type="number" min="1" className="admin-input bg-slate-950/60 text-slate-100" value={form.maxPerCustomer} onChange={(event) => onChange({ ...form, maxPerCustomer: event.target.value })} /></Field>
            <div className="md:col-span-2"><CatalogStatusSwitch label="Permitir repetir o mesmo perfume" checked={form.allowRepeats} onChange={(allowRepeats) => onChange({ ...form, allowRepeats })} /></div>
            <div className="space-y-2 md:col-span-2"><p className="text-sm font-bold text-slate-200">Perfumes elegíveis de {form.fixedVolume}</p>{products.filter((product) => product.active && product.variants?.some((variant) => variant.key === "volume" && variant.options?.some((option) => option.value === form.fixedVolume && option.available !== false))).map((product) => { const checked = form.participants.some((item) => item.productId === product.id); const option = product.variants?.find((variant) => variant.key === "volume")?.options?.find((item) => item.value === form.fixedVolume); return <label key={product.id} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-700 p-3"><input type="checkbox" checked={checked} onChange={(event) => onChange({ ...form, participants: event.target.checked ? [...form.participants, { productId: product.id, volume: form.fixedVolume }] : form.participants.filter((item) => item.productId !== product.id) })} />{option?.imageUrl ? <img src={option.imageUrl} className="h-12 w-12 rounded-lg object-cover" alt="" /> : null}<span className="text-sm text-slate-100">{product.name} · {form.fixedVolume} · {money(Number(option?.price || 0))}</span></label>; })}</div>
          </> : null}
        </div>
        <CatalogAssetUploader
          label="Imagem ou banner da promoção"
          helperText="Formato recomendado: 1600 × 600 px. Pode ser usado em campanhas, cards promocionais, cabeçalhos e partilha futura."
          aspectRatio="wide"
          value={form.imageUrl}
          draft={imageDraft}
          onSelect={onImageDraftChange}
          onRemove={() => {
            onImageDraftChange(null);
            onChange({ ...form, imageUrl: "" });
          }}
        />
        <details className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
          <summary className="cursor-pointer text-sm font-bold text-slate-200">Opções avançadas</summary>
          <div className="mt-3 space-y-3">
            <Field label="Slug"><input className="admin-input bg-slate-950/60 text-slate-100" value={form.slug} onChange={(event) => onChange({ ...form, slug: event.target.value })} /></Field>
            <Field label="URL externa da imagem"><input className="admin-input bg-slate-950/60 text-slate-100" value={form.imageUrl || ""} onChange={(event) => onChange({ ...form, imageUrl: event.target.value })} /></Field>
          </div>
        </details>
        <CatalogStatusSwitch label="Promoção ativa" checked={form.active} onChange={(checked) => onChange({ ...form, active: checked })} />
        <CatalogStatusSwitch label="Mostrar como destaque" helper="Permite usar esta campanha como destaque visual explícito; não publica automaticamente na home." checked={form.showAsHighlight} onChange={(checked) => onChange({ ...form, showAsHighlight: checked })} />
      </div>
    </CatalogModal>
  );
}

function CatalogProductList({
  products,
  totalElements,
  page,
  totalPages,
  onPageChange,
  onEdit,
  onDuplicate,
  onToggle,
  onDelete,
}: {
  products: CatalogProduct[];
  totalElements: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onEdit: (product: CatalogProduct) => void;
  onDuplicate: (product: CatalogProduct) => void;
  onToggle: (product: CatalogProduct) => void;
  onDelete: (product: CatalogProduct) => void;
}) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-bold text-slate-700">{totalElements} produto{totalElements === 1 ? "" : "s"} no catálogo por encomenda</p>
        <p className="text-xs font-semibold text-slate-500">Página {Math.min(page + 1, Math.max(totalPages, 1))} de {Math.max(totalPages, 1)}</p>
      </div>
      <div className="divide-y divide-slate-100">
        {products.map((product) => (
          <article key={product.id} className="grid gap-4 p-4 lg:grid-cols-[112px_1fr_auto]">
            <img src={product.images?.[0]?.thumbnailUrl || "/placeholder.png"} alt={product.name} className="h-28 w-28 rounded-2xl bg-slate-100 object-cover" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-[family-name:var(--font-sora)] text-lg font-semibold text-slate-950">{product.name}</h2>
                <StatusPill active={product.active} />
                {product.badges?.map((badge) => <span key={badge} className="rounded-full bg-orange-50 px-2 py-1 text-xs font-bold text-[#E8431A]">{badge}</span>)}
              </div>
              <p className="mt-1 text-sm text-slate-500">{product.category?.name || "Sem categoria"} · {product.brand?.name || "Sem marca"} · {product.estimatedDeadline || "Sem prazo"}</p>
              <p className="mt-2 font-[family-name:var(--font-sora)] text-xl font-black text-slate-950">{product.pricingMode === "QUOTE_REQUIRED" ? "Preço sob consulta" : money(Number(product.finalPrice || 0))}</p>
              <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{product.shortDescription || "Sem descrição curta."}</p>
            </div>
            <div className="flex flex-wrap content-start gap-2 lg:justify-end">
              <button type="button" className={lightSecondaryButton} onClick={() => onEdit(product)}>Editar</button>
              <button type="button" className={lightSecondaryButton} onClick={() => onDuplicate(product)}>Duplicar</button>
              <button type="button" className={lightSecondaryButton} onClick={() => onToggle(product)}>{product.active ? "Desativar" : "Ativar"}</button>
              <button type="button" className={dangerButton} onClick={() => onDelete(product)}>Eliminar</button>
              <a href={`/catalogo/${product.slug}`} target="_blank" className={lightSecondaryButton} rel="noreferrer">Ver página</a>
            </div>
          </article>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-4">
        <button type="button" className={lightSecondaryButton} disabled={page <= 0} onClick={() => onPageChange(page - 1)}>Anterior</button>
        <button type="button" className={lightSecondaryButton} disabled={page + 1 >= totalPages} onClick={() => onPageChange(page + 1)}>Seguinte</button>
      </div>
    </div>
  );
}

function CatalogTaxonomyList({
  mode,
  items,
  products,
  onEdit,
  onDelete,
}: {
  mode: "categories" | "brands";
  items: CatalogTaxonomy[];
  products: CatalogProduct[];
  onEdit: (item: CatalogTaxonomy) => void;
  onDelete: (item: CatalogTaxonomy) => void;
}) {
  const productCount = (id: number) => {
    if (mode === "brands") return products.filter((product) => product.brand?.id === id).length;
    const categoryIds = new Set([id, ...items.filter((item) => item.parentId === id).map((item) => item.id)]);
    return products.filter((product) => product.category?.id && categoryIds.has(product.category.id)).length;
  };
  const orderedItems = mode === "categories"
    ? items.filter((item) => !item.parentId).flatMap((parent) => [parent, ...items.filter((item) => item.parentId === parent.id)])
    : items;
  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
      <div className="admin-table-scroll">
        <table className="w-full min-w-[760px] text-left">
          <thead className="bg-slate-50 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
            <tr>
              {mode === "brands" ? <th className="px-4 py-3">Logótipo</th> : null}
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Produtos</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Ordem</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orderedItems.map((item) => (
              <tr key={item.id}>
                {mode === "brands" ? (
                  <td className="px-4 py-4">
                    {item.logoUrl ? (
                      <img src={item.logoUrl} alt={`Logótipo ${item.name}`} className="h-12 w-12 rounded-2xl border border-slate-100 bg-slate-50 object-contain p-1" />
                    ) : (
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-sm font-black text-[#FF8066]">{initials(item.name)}</span>
                    )}
                  </td>
                ) : null}
                <td className="px-4 py-4">
                  <p className={`font-bold text-slate-950 ${item.parentId ? "pl-5" : ""}`}>{item.parentId ? "↳ " : ""}{item.name}</p>
                  <p className={`text-sm text-slate-500 ${item.parentId ? "pl-5" : ""}`}>{item.parentName ? `${item.parentName} / ` : ""}{item.slug}</p>
                </td>
                <td className="px-4 py-4 text-sm font-bold text-slate-700">{productCount(item.id)}</td>
                <td className="px-4 py-4"><StatusPill active={item.active} /></td>
                <td className="px-4 py-4 text-sm text-slate-600">{item.displayOrder ?? 0}</td>
                <td className="px-4 py-4">
                  <div className="flex justify-end gap-2">
                    <button type="button" className={lightSecondaryButton} onClick={() => onEdit(item)}>Editar</button>
                    <button type="button" className={dangerButton} onClick={() => onDelete(item)}>Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CatalogPromotionList({ items, onEdit, onDelete }: { items: CatalogPromotion[]; onEdit: (item: CatalogPromotion) => void; onDelete: (item: CatalogPromotion) => void }) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
      <div className="admin-table-scroll">
        <table className="w-full min-w-[760px] text-left">
          <thead className="bg-slate-50 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
            <tr>
              <th className="px-4 py-3">Imagem</th>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Período</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-4">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={`Imagem ${item.name}`} className="h-14 w-28 rounded-2xl border border-slate-100 bg-slate-50 object-cover" />
                  ) : (
                    <span className="flex h-14 w-28 items-center justify-center rounded-2xl bg-orange-50 text-xs font-black uppercase tracking-[0.12em] text-[#E8431A]">Campanha</span>
                  )}
                </td>
                <td className="px-4 py-4">
                  <p className="font-bold text-slate-950">{item.name}</p>
                  <p className="text-sm text-slate-500">{item.slug}</p>
                </td>
                <td className="px-4 py-4 text-sm font-bold text-slate-700">{promotionValueLabel(item)}</td>
                <td className="px-4 py-4 text-sm text-slate-600">{item.startsAt || "Sem início"} · {item.endsAt || "Sem fim"}</td>
                <td className="px-4 py-4"><StatusPill active={item.active} /></td>
                <td className="px-4 py-4">
                  <div className="flex justify-end gap-2">
                    <button type="button" className={lightSecondaryButton} onClick={() => onEdit(item)}>Editar</button>
                    <button type="button" className={dangerButton} onClick={() => onDelete(item)}>Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CatalogAdminView({ mode }: { mode: Mode }) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [categories, setCategories] = useState<CatalogTaxonomy[]>([]);
  const [brands, setBrands] = useState<CatalogTaxonomy[]>([]);
  const [promotions, setPromotions] = useState<CatalogPromotion[]>([]);
  const [quoteOptions, setQuoteOptions] = useState<QuoteOptionsResponse | null>(null);
  const [productForm, setProductForm] = useState<ProductForm>(emptyProduct);
  const [taxonomyForm, setTaxonomyForm] = useState<TaxonomyForm>(emptyTaxonomyForm);
  const [promotionForm, setPromotionForm] = useState<PromotionForm>(emptyPromotionForm);
  const [specRows, setSpecRows] = useState<SpecRow[]>(specsToRows());
  const [imageDrafts, setImageDrafts] = useState<ImageDraft[]>([]);
  const [brandLogoDraft, setBrandLogoDraft] = useState<CatalogAssetDraft | null>(null);
  const [promotionImageDraft, setPromotionImageDraft] = useState<CatalogAssetDraft | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [modalFeedback, setModalFeedback] = useState<Feedback>(null);
  const [taxonomyFieldErrors, setTaxonomyFieldErrors] = useState<FieldErrors>({});
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [taxonomyModalOpen, setTaxonomyModalOpen] = useState(false);
  const [promotionModalOpen, setPromotionModalOpen] = useState(false);

  const taxonomyItems = mode === "categories" ? categories : brands;
  const hasData = mode === "products" ? products.length > 0 : mode === "promotions" ? promotions.length > 0 : taxonomyItems.length > 0;

  const filteredTaxonomyItems = useMemo(() => {
    if (!search.trim()) return taxonomyItems;
    const needle = search.trim().toLowerCase();
    return taxonomyItems.filter((item) => `${item.name} ${item.slug} ${item.description || ""}`.toLowerCase().includes(needle));
  }, [search, taxonomyItems]);

  const filteredPromotions = useMemo(() => {
    if (!search.trim()) return promotions;
    const needle = search.trim().toLowerCase();
    return promotions.filter((item) => `${item.name} ${item.slug} ${item.description || ""}`.toLowerCase().includes(needle));
  }, [search, promotions]);

  async function load(nextPage = page) {
    setLoading(true);
    setFeedback(null);
    try {
      const [productPage, categoryList, brandList, promotionList] = await Promise.all([
        adminApiFetch<CatalogPage<CatalogProduct>>(`/api/admin/catalog/products?page=${nextPage}&size=20${search ? `&search=${encodeURIComponent(search)}` : ""}`),
        adminApiFetch<CatalogTaxonomy[]>("/api/admin/catalog/categories"),
        adminApiFetch<CatalogTaxonomy[]>("/api/admin/catalog/brands"),
        adminApiFetch<CatalogPromotion[]>("/api/admin/catalog/promotions"),
      ]);
      const options = mode === "products" ? await adminApiFetch<QuoteOptionsResponse>("/api/admin/quotes/options") : quoteOptions;
      setProducts(productPage.content || []);
      setTotalPages(productPage.totalPages || 1);
      setTotalElements(productPage.totalElements || productPage.content?.length || 0);
      setCategories(categoryList || []);
      setBrands(brandList || []);
      setPromotions(promotionList || []);
      if (mode === "products") setQuoteOptions(options);
    } catch (error) {
      setFeedback({ tone: "error", message: getApiErrorMessage(error) || "Não foi possível carregar o catálogo." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void load(0), 0);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function resetProductModal() {
    setProductForm(emptyProduct);
    setSpecRows(specsToRows());
    setImageDrafts([]);
    setModalFeedback(null);
  }

  function updateTaxonomyForm(nextForm: TaxonomyForm) {
    setTaxonomyForm(nextForm);
    setTaxonomyFieldErrors({});
  }

  function openCreate() {
    setFeedback(null);
    setModalFeedback(null);
    setTaxonomyFieldErrors({});
    if (mode === "products") {
      resetProductModal();
      setProductModalOpen(true);
    } else if (mode === "promotions") {
      setPromotionForm(emptyPromotionForm);
      setPromotionImageDraft(null);
      setPromotionModalOpen(true);
    } else {
      setTaxonomyForm(emptyTaxonomyForm);
      setBrandLogoDraft(null);
      setTaxonomyModalOpen(true);
    }
  }

  function editProduct(product: CatalogProduct, duplicate = false) {
    let form = productToForm(product, duplicate);
    if (!form.routeId && quoteOptions?.routes?.length) {
      const rate = Number(product.exchangeRateSnapshot || 0);
      const matchingRoutes = quoteOptions.routes.filter((route) => route.currencyCode === product.currency);
      const route = matchingRoutes.find((item) => item.estimatedDaysLabel && item.estimatedDaysLabel === product.estimatedDeadline)
        || matchingRoutes.find((item) => Math.abs(Number(item.shippingFee || 0) * rate - Number(product.shippingCost || 0)) < 0.02)
        || (matchingRoutes.length === 1 ? matchingRoutes[0] : undefined);
      if (route) {
        const autoForm = withCatalogPricing({ ...form, routeId: String(route.id), originId: String(route.origin.id), shippingMode: "auto", customsMode: "auto", commissionMode: "auto" }, quoteOptions);
        form = {
          ...form,
          routeId: String(route.id),
          originId: String(route.origin.id),
          shippingMode: Math.abs(Number(autoForm.shippingCost || 0) - Number(product.shippingCost || 0)) < 0.02 ? "auto" : "custom",
          customsMode: Math.abs(Number(autoForm.customsCost || 0) - Number(product.customsCost || 0)) < 0.02 ? "auto" : "custom",
          commissionMode: Math.abs(Number(autoForm.commissionValue || 0) - Number(product.commissionValue || 0)) < 0.02 ? "auto" : "custom",
        };
      }
    }
    setProductForm(form);
    setSpecRows(specsToRows(product.specifications));
    setImageDrafts([]);
    setModalFeedback(null);
    setProductModalOpen(true);
  }

  async function uploadProductImages(productId: number, drafts: ImageDraft[]) {
    if (!drafts.length) return;
    for (const draft of drafts) {
      const body = new FormData();
      body.append("files", draft.file);
      await adminApiFetch(`/api/admin/catalog/products/${productId}/images`, { method: "POST", body });
      setImageDrafts((current) => current.filter((item) => item.id !== draft.id));
    }
  }

  async function uploadCatalogAsset(type: CatalogAssetType, draft: CatalogAssetDraft) {
    const body = new FormData();
    body.append("file", draft.file);
    const payload = await adminApiFetch<{ url?: string }>(`/api/admin/catalog/assets?type=${type}`, { method: "POST", body });
    if (!payload?.url) {
      throw new Error("Não foi possível carregar a imagem. Tenta novamente.");
    }
    return payload.url;
  }

  async function saveProduct(action: ProductAction) {
    const pricedForm = withCatalogPricing(productForm, quoteOptions);
    const template = categoryTemplate(categories, pricedForm.categoryId);
    const validationError = getProductValidationError(pricedForm, imageDrafts, action, quoteOptions, template);
    if (validationError) {
      setModalFeedback({ tone: "error", message: validationError });
      return;
    }

    setSaving(true);
    setModalFeedback(null);
    try {
      setProductForm(pricedForm);
      const payload = buildProductPayload(pricedForm, specRows, action, template);
      const saved = await adminApiFetch<CatalogProduct>(`/api/admin/catalog/products${pricedForm.id ? `/${pricedForm.id}` : ""}`, {
        method: pricedForm.id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      const productId = pricedForm.id || saved?.id;
      if (productId && imageDrafts.length) {
        await uploadProductImages(productId, imageDrafts);
      }
      setProductModalOpen(false);
      resetProductModal();
      setFeedback({ tone: "success", message: action === "publish" ? "Produto publicado." : "Rascunho guardado." });
      await load(page);
    } catch (error) {
      setModalFeedback({ tone: "error", message: getApiErrorMessage(error) || "Não foi possível guardar o produto." });
    } finally {
      setSaving(false);
    }
  }

  async function toggleProduct(product: CatalogProduct) {
    setFeedback(null);
    try {
      const form = productToForm(product);
      const template = categoryTemplate(categories, form.categoryId);
      await adminApiFetch(`/api/admin/catalog/products/${product.id}`, {
        method: "PUT",
        body: JSON.stringify(buildProductPayload({ ...form, active: !product.active }, specsToRows(product.specifications), !product.active ? "publish" : "draft", template)),
      });
      await load(page);
    } catch (error) {
      setFeedback({ tone: "error", message: getApiErrorMessage(error) || "Não foi possível alterar o estado do produto." });
    }
  }

  async function saveTaxonomy() {
    setTaxonomyFieldErrors({});
    if (!taxonomyForm.name.trim()) {
      setTaxonomyFieldErrors({ name: "Indica o nome." });
      setModalFeedback({ tone: "error", message: "Indica o nome." });
      focusCatalogField("name");
      return;
    }
    const descriptionLimit = mode === "brands" ? BRAND_DESCRIPTION_LIMIT : CATEGORY_DESCRIPTION_LIMIT;
    if (taxonomyForm.description.length > descriptionLimit) {
      setTaxonomyFieldErrors({ description: `A descrição deve ter no máximo ${descriptionLimit.toLocaleString("pt-MZ")} caracteres.` });
      setModalFeedback({ tone: "error", message: "Revê os campos destacados antes de continuar." });
      focusCatalogField("description");
      return;
    }
    const canRetryBrandLogoUpload = mode === "brands" && Boolean(taxonomyForm.id && brandLogoDraft?.status === "error" && brandLogoDraft.previewUrl);
    if (mode === "brands" && brandLogoDraft?.status === "error" && !canRetryBrandLogoUpload) {
      setModalFeedback({ tone: "error", message: brandLogoDraft.error || "Seleciona um logótipo válido." });
      return;
    }
    setSaving(true);
    setModalFeedback(null);
    const endpoint = mode === "categories" ? "categories" : "brands";
    const payload = {
      name: taxonomyForm.name,
      slug: taxonomyForm.slug || slugify(taxonomyForm.name) || null,
      description: taxonomyForm.description || null,
      logoUrl: mode === "brands" ? taxonomyForm.logoUrl || null : null,
      specificationTemplate: mode === "categories" ? taxonomyForm.specificationTemplate || null : null,
      parentId: mode === "categories" && taxonomyForm.parentId ? Number(taxonomyForm.parentId) : null,
      active: taxonomyForm.active,
      displayOrder: Number(taxonomyForm.displayOrder || 0),
    };
    try {
      const saved = await adminApiFetch<CatalogTaxonomy>(`/api/admin/catalog/${endpoint}${taxonomyForm.id ? `/${taxonomyForm.id}` : ""}`, {
        method: taxonomyForm.id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      if (mode === "categories" && taxonomyForm.specificationTemplate) {
        const expectedTemplate = normalizeTemplateKey(taxonomyForm.specificationTemplate);
        const receivedTemplate = normalizeTemplateKey(saved.specificationTemplate);
        if (expectedTemplate !== "NONE" && receivedTemplate !== expectedTemplate) {
          setModalFeedback({ tone: "error", message: "A categoria foi guardada, mas o template não foi devolvido pelo backend. Reabre e tenta novamente." });
          return;
        }
      }
      if (mode === "brands" && brandLogoDraft && (brandLogoDraft.status === "ready" || canRetryBrandLogoUpload)) {
        setBrandLogoDraft({ ...brandLogoDraft, status: "uploading" });
        try {
          const logoUrl = await uploadCatalogAsset("BRAND", brandLogoDraft);
          setBrandLogoDraft({ ...brandLogoDraft, status: "done" });
          await adminApiFetch(`/api/admin/catalog/brands/${saved.id}`, {
            method: "PUT",
            body: JSON.stringify({ ...payload, logoUrl }),
          });
        } catch (error) {
          setTaxonomyForm({ ...taxonomyForm, id: saved.id });
          setBrandLogoDraft({ ...brandLogoDraft, status: "error", error: getApiErrorMessage(error) || "Não foi possível carregar a imagem. Tenta novamente." });
          setModalFeedback({ tone: "error", message: "A marca foi criada, mas o logótipo não foi carregado. Tenta novamente." });
          return;
        }
      }
      setTaxonomyModalOpen(false);
      setTaxonomyForm(emptyTaxonomyForm);
      setBrandLogoDraft(null);
      setFeedback({ tone: "success", message: mode === "categories" ? "Categoria guardada." : "Marca guardada." });
      await load(page);
    } catch (error) {
      const fieldErrors = extractFieldErrors(error);
      if (Object.keys(fieldErrors).length) {
        setTaxonomyFieldErrors(fieldErrors);
        setModalFeedback({ tone: "error", message: getApiErrorMessage(error) || "Dados inválidos." });
        focusCatalogField(fieldErrors.description ? "description" : Object.keys(fieldErrors)[0]);
      } else {
        setModalFeedback({ tone: "error", message: getApiErrorMessage(error) || "Não foi possível guardar." });
      }
    } finally {
      setSaving(false);
    }
  }

  async function savePromotion() {
    if (!promotionForm.name.trim()) {
      setModalFeedback({ tone: "error", message: "Indica o nome da promoção." });
      return;
    }
    if (promotionForm.startsAt && promotionForm.endsAt && promotionForm.endsAt < promotionForm.startsAt) {
      setModalFeedback({ tone: "error", message: "A data de fim não pode ser anterior à data de início." });
      return;
    }
    if (promotionForm.promotionType === "PERCENTAGE") {
      const value = Number(promotionForm.discountPercent);
      if (Number.isNaN(value) || value < 0 || value > 100) {
        setModalFeedback({ tone: "error", message: "A percentagem deve estar entre 0 e 100." });
        return;
      }
    }
    if (promotionForm.promotionType === "FIXED_AMOUNT") {
      const value = Number(promotionForm.discountValue);
      if (Number.isNaN(value) || value <= 0) {
        setModalFeedback({ tone: "error", message: "O valor fixo deve ser maior que zero." });
        return;
      }
    }
    if (promotionForm.promotionType === "BUNDLE_PICK" && (Number(promotionForm.choiceQuantity) < 2 || Number(promotionForm.bundlePrice) <= 0 || !promotionForm.fixedVolume || promotionForm.participants.length === 0)) {
      setModalFeedback({ tone: "error", message: "Define quantidade mínima de 2, preço total, volume fixo e pelo menos um perfume participante." });
      return;
    }
    if (promotionImageDraft?.status === "error") {
      setModalFeedback({ tone: "error", message: promotionImageDraft.error || "Seleciona uma imagem válida." });
      return;
    }
    setSaving(true);
    setModalFeedback(null);
    const payload = {
      name: promotionForm.name,
      slug: promotionForm.slug || slugify(promotionForm.name) || null,
      description: promotionForm.description || null,
      promotionType: promotionForm.promotionType,
      discountPercent: promotionForm.promotionType === "PERCENTAGE" ? Number(promotionForm.discountPercent || 0) : null,
      discountValue: promotionForm.promotionType === "FIXED_AMOUNT" ? Number(promotionForm.discountValue || 0) : null,
      choiceQuantity: promotionForm.promotionType === "BUNDLE_PICK" ? Number(promotionForm.choiceQuantity) : null,
      bundlePrice: promotionForm.promotionType === "BUNDLE_PICK" ? Number(promotionForm.bundlePrice) : null,
      fixedVolume: promotionForm.promotionType === "BUNDLE_PICK" ? promotionForm.fixedVolume : null,
      allowRepeats: promotionForm.promotionType === "BUNDLE_PICK" && promotionForm.allowRepeats,
      maxPerCustomer: promotionForm.promotionType === "BUNDLE_PICK" && promotionForm.maxPerCustomer ? Number(promotionForm.maxPerCustomer) : null,
      participants: promotionForm.promotionType === "BUNDLE_PICK" ? promotionForm.participants : [],
      startsAt: promotionForm.startsAt || null,
      endsAt: promotionForm.endsAt || null,
      imageUrl: promotionForm.imageUrl || null,
      showAsHighlight: promotionForm.showAsHighlight,
      active: promotionForm.active,
    };
    try {
      const saved = await adminApiFetch<CatalogPromotion>(`/api/admin/catalog/promotions${promotionForm.id ? `/${promotionForm.id}` : ""}`, {
        method: promotionForm.id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      if (promotionImageDraft?.status === "ready") {
        setPromotionImageDraft({ ...promotionImageDraft, status: "uploading" });
        try {
          const imageUrl = await uploadCatalogAsset("PROMOTION", promotionImageDraft);
          setPromotionImageDraft({ ...promotionImageDraft, status: "done" });
          await adminApiFetch(`/api/admin/catalog/promotions/${saved.id}`, {
            method: "PUT",
            body: JSON.stringify({ ...payload, imageUrl }),
          });
        } catch (error) {
          setPromotionForm({ ...promotionForm, id: saved.id });
          setPromotionImageDraft({ ...promotionImageDraft, status: "error", error: getApiErrorMessage(error) || "Não foi possível carregar a imagem. Tenta novamente." });
          setModalFeedback({ tone: "error", message: "A promoção foi guardada, mas a imagem não foi carregada. Podes tentar novamente sem perder o registo." });
          return;
        }
      }
      setPromotionModalOpen(false);
      setPromotionForm(emptyPromotionForm);
      setPromotionImageDraft(null);
      setFeedback({ tone: "success", message: "Promoção guardada." });
      await load(page);
    } catch (error) {
      setModalFeedback({ tone: "error", message: getApiErrorMessage(error) || "Não foi possível guardar a promoção." });
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(endpoint: string, id: number, label: string) {
    if (!window.confirm(`Eliminar "${label}"?`)) return;
    setFeedback(null);
    try {
      await adminApiFetch(`/api/admin/catalog/${endpoint}/${id}`, { method: "DELETE" });
      setFeedback({ tone: "success", message: "Registo eliminado." });
      await load(page);
    } catch (error) {
      setFeedback({ tone: "error", message: getApiErrorMessage(error) || "Não foi possível eliminar." });
    }
  }

  function changePage(nextPage: number) {
    setPage(nextPage);
    void load(nextPage);
  }

  return (
    <div className="space-y-6">
      <CatalogPageHeader
        mode={mode}
        search={search}
        onSearch={setSearch}
        onReload={() => {
          setPage(0);
          void load(0);
        }}
        onCreate={openCreate}
      />

      {feedback ? <AdminBanner tone={feedback.tone} message={feedback.message} /> : null}

      <div className="relative">
        {loading ? <AdminListLoadingOverlay visible title="A carregar catálogo" message="Estamos a buscar produtos, categorias, marcas e promoções." /> : null}
        {!loading && !hasData ? <CatalogEmptyState mode={mode} onCreate={openCreate} /> : null}
        {!loading && hasData && mode === "products" ? (
          <CatalogProductList
            products={products}
            totalElements={totalElements}
            page={page}
            totalPages={totalPages}
            onPageChange={changePage}
            onEdit={(product) => editProduct(product)}
            onDuplicate={(product) => editProduct(product, true)}
            onToggle={(product) => void toggleProduct(product)}
            onDelete={(product) => void deleteItem("products", product.id, product.name)}
          />
        ) : null}
        {!loading && hasData && (mode === "categories" || mode === "brands") ? (
          <CatalogTaxonomyList
            mode={mode}
            items={filteredTaxonomyItems}
            products={products}
            onEdit={(item) => {
              setTaxonomyForm({ id: item.id, name: item.name, slug: item.slug, description: item.description || "", active: item.active, displayOrder: String(item.displayOrder || 0), logoUrl: item.logoUrl || "", specificationTemplate: item.specificationTemplate || "", parentId: item.parentId ? String(item.parentId) : "" });
              setBrandLogoDraft(null);
              setModalFeedback(null);
              setTaxonomyFieldErrors({});
              setTaxonomyModalOpen(true);
            }}
            onDelete={(item) => void deleteItem(mode, item.id, item.name)}
          />
        ) : null}
        {!loading && hasData && mode === "promotions" ? (
          <CatalogPromotionList
            items={filteredPromotions}
            onEdit={(item) => {
              setPromotionForm({
                id: item.id,
                name: item.name,
                slug: item.slug,
                description: item.description || "",
                promotionType: item.promotionType || "LABEL_ONLY",
                discountPercent: String(item.discountPercent || ""),
                discountValue: String(item.discountValue || ""),
                startsAt: item.startsAt || "",
                endsAt: item.endsAt || "",
                active: item.active,
                imageUrl: item.imageUrl || "",
                showAsHighlight: Boolean(item.showAsHighlight),
                choiceQuantity: String(item.choiceQuantity || 2),
                bundlePrice: String(item.bundlePrice || ""),
                fixedVolume: item.fixedVolume || "30 ml",
                allowRepeats: Boolean(item.allowRepeats),
                maxPerCustomer: String(item.maxPerCustomer || ""),
                participants: item.participants || [],
              });
              setPromotionImageDraft(null);
              setModalFeedback(null);
              setPromotionModalOpen(true);
            }}
            onDelete={(item) => void deleteItem("promotions", item.id, item.name)}
          />
        ) : null}
      </div>

      <CatalogProductModal
        open={productModalOpen}
        form={productForm}
        specs={specRows}
        images={imageDrafts}
        categories={categories}
        brands={brands}
        promotions={promotions}
        quoteOptions={quoteOptions}
        saving={saving}
        feedback={modalFeedback}
        onChange={setProductForm}
        onSpecsChange={setSpecRows}
        onImagesChange={setImageDrafts}
        onSubmit={(action) => void saveProduct(action)}
        onClose={() => {
          if (!saving) setProductModalOpen(false);
        }}
      />

      <CatalogCategoryModal
        open={taxonomyModalOpen}
        mode={mode === "brands" ? "brands" : "categories"}
        form={taxonomyForm}
        logoDraft={brandLogoDraft}
        saving={saving}
        feedback={modalFeedback}
        fieldErrors={taxonomyFieldErrors}
        onChange={updateTaxonomyForm}
        onLogoDraftChange={setBrandLogoDraft}
        onSubmit={() => void saveTaxonomy()}
        onClose={() => {
          if (!saving) setTaxonomyModalOpen(false);
        }}
        categories={categories}
      />

      <CatalogPromotionModal
        open={promotionModalOpen}
        form={promotionForm}
        imageDraft={promotionImageDraft}
        saving={saving}
        feedback={modalFeedback}
        onChange={setPromotionForm}
        onImageDraftChange={setPromotionImageDraft}
        onSubmit={() => void savePromotion()}
        onClose={() => {
          if (!saving) setPromotionModalOpen(false);
        }}
        products={products}
      />
    </div>
  );
}
