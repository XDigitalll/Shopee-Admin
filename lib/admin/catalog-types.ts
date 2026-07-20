export type CatalogTaxonomy = {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  logoUrl?: string | null;
  parentId?: number | null;
  parentName?: string | null;
  parentSlug?: string | null;
  specificationTemplate?: string | null;
  active: boolean;
  displayOrder?: number | null;
};

export type CatalogProductVariantDefinition = {
  key: string;
  label: string;
  required: boolean;
  values: string[];
  options?: Array<{
    value: string;
    price?: number | null;
    imageUrl?: string | null;
    available?: boolean | null;
    stock?: number | null;
  }>;
};

export type CatalogPromotionType = "PERCENTAGE" | "FIXED_AMOUNT" | "LABEL_ONLY" | "BUNDLE_PICK";

export type CatalogPromotion = {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  promotionType?: CatalogPromotionType | null;
  discountPercent?: number | null;
  discountValue?: number | null;
  choiceQuantity?: number | null;
  bundlePrice?: number | null;
  fixedVolume?: string | null;
  allowRepeats?: boolean;
  maxPerCustomer?: number | null;
  participants?: Array<{ productId: number; volume: string }>;
  startsAt?: string | null;
  endsAt?: string | null;
  imageUrl?: string | null;
  showAsHighlight?: boolean;
  active: boolean;
};

export type CatalogImage = {
  id: number;
  originalUrl: string;
  thumbnailUrl: string;
  displayOrder: number;
  primaryImage: boolean;
  altText?: string | null;
};

export type CatalogProduct = {
  id: number;
  name: string;
  slug: string;
  shortDescription?: string | null;
  description?: string | null;
  category?: CatalogTaxonomy | null;
  brand?: CatalogTaxonomy | null;
  promotion?: CatalogPromotion | null;
  supplier?: string | null;
  supplierLink?: string | null;
  supplierLinkVisibleToCustomer: boolean;
  currency?: string | null;
  supplierPrice?: number | null;
  exchangeRateSnapshot?: number | null;
  routeId?: number | null;
  shippingMode?: "auto" | "custom" | null;
  customsMode?: "auto" | "custom" | null;
  commissionMode?: "auto" | "custom" | null;
  shippingCost?: number | null;
  customsCost?: number | null;
  commissionValue?: number | null;
  finalPrice?: number | null;
  pricingMode?: "FIXED_PRICE" | "QUOTE_REQUIRED" | null;
  quoteMessage?: string | null;
  quoteResponseDeadline?: string | null;
  weight?: number | null;
  estimatedDeadline?: string | null;
  estimatedDeliveryTime?: string | null;
  active: boolean;
  featured: boolean;
  promotionActive: boolean;
  newProduct: boolean;
  bestSeller: boolean;
  recommended: boolean;
  seoTitle?: string | null;
  seoDescription?: string | null;
  specifications?: Record<string, string>;
  variants?: CatalogProductVariantDefinition[];
  images: CatalogImage[];
  badges: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type CatalogPage<T> = {
  content: T[];
  number?: number;
  page?: number;
  totalPages: number;
  totalElements: number;
};
