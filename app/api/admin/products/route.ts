import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";
import type { AdminProduct, AdminProductsPageResponse, CreateProductPayload } from "@/lib/admin/types";

function normalizeProduct(product: AdminProduct): AdminProduct {
  return {
    ...product,
    id: String(product.id ?? ""),
    code: product.code ?? null,
    category: product.category
      ? {
          ...product.category,
          id: String(product.category.id ?? ""),
          parentId: product.category.parentId != null ? String(product.category.parentId) : null,
          subcategories: product.category.subcategories ?? [],
        }
      : null,
    gallery: product.gallery ?? [],
    variants: product.variants ?? [],
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = searchParams.get("page") ?? "0";
  const size = searchParams.get("size") ?? "20";
  const status = searchParams.get("status");
  const name = searchParams.get("name");

  const params = new URLSearchParams({ page, size });
  if (status) params.set("status", status);
  if (name) params.set("name", name);

  let response: Response;
  try {
    response = await fetchBackend(request, `/admin/products?${params}`);
  } catch {
    return jsonError("Backend inacessível. Confirma se o servidor Spring Boot está a correr na porta 8080.", 502);
  }

  await relayAuthFailure(response);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const detail = text.slice(0, 200);
    return jsonError(
      `Erro ${response.status} do backend: ${detail || "sem detalhe"}`,
      response.status
    );
  }

  const data = await parseBackendJson<AdminProductsPageResponse>(response);
  return NextResponse.json({
    ...data,
    content: (data?.content ?? []).map(normalizeProduct),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as CreateProductPayload;

  let response: Response;
  try {
    response = await fetchBackend(request, "/admin/products", {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch {
    return jsonError("Backend inacessível.", 502);
  }

  await relayAuthFailure(response);

  if (!response.ok) {
    const error = await response.text();
    return jsonError(error || "Não foi possível criar o produto.", response.status);
  }

  const data = await parseBackendJson<AdminProduct>(response);
  return NextResponse.json(normalizeProduct(data));
}
