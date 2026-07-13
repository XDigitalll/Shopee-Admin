export type CatalogTaxonomy = {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  active: boolean;
  displayOrder?: number | null;
};

export type CatalogPromotion = {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  discountPercent?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
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
