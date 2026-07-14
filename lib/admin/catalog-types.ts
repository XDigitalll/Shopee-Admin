export type CatalogTaxonomy = {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  logoUrl?: string | null;
  specificationTemplate?: string | null;
  active: boolean;
  displayOrder?: number | null;
};

export type CatalogProductVariantDefinition = {
  key: string;
  label: string;
  required: boolean;
  values: string[];
};

export type CatalogPromotionType = "PERCENTAGE" | "FIXED_AMOUNT" | "LABEL_ONLY";

export type CatalogPromotion = {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  promotionType?: CatalogPromotionType | null;
  discountPercent?: number | null;
  discountValue?: number | null;
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
  currency?: string | null;
  supplierPrice?: number | null;
  exchangeRateSnapshot?: number | null;
  shippingCost?: number | null;
  customsCost?: number | null;
  commissionValue?: number | null;
  finalPrice: number;
  weight?: number | null;
  estimatedDeadline?: string | null;
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
