import type { AdminProduct, AdminProductVariant } from "@/lib/admin/types";

export const LOW_STOCK_THRESHOLD = 5;

function numericStock(value: number | null | undefined) {
  return Number(value ?? 0);
}

export function availableProductStock(product: Pick<AdminProduct, "stock" | "stockAvailable">) {
  return numericStock(product.stockAvailable ?? product.stock);
}

export function isLowStockQuantity(stock: number, threshold = LOW_STOCK_THRESHOLD) {
  return stock > 0 && stock <= threshold;
}

export function isLowStockProduct(product: AdminProduct, threshold = LOW_STOCK_THRESHOLD) {
  if (product.status !== "ACTIVE") {
    return false;
  }

  const variantStocks = product.variants
    ?.filter((variant) => variant.active)
    .map((variant) => numericStock(variant.stockAvailable ?? variant.stock)) ?? [];

  if (variantStocks.length > 0) {
    return variantStocks.some((stock) => isLowStockQuantity(stock, threshold));
  }

  return isLowStockQuantity(availableProductStock(product), threshold);
}

export function isLowStockVariant(variant: AdminProductVariant, threshold = LOW_STOCK_THRESHOLD) {
  return isLowStockQuantity(numericStock(variant.stockAvailable ?? variant.stock), threshold);
}
