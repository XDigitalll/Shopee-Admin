import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";
import type { AdminProduct, AdminProductCategory, CreateProductPayload } from "@/lib/admin/types";

type Params = { params: Promise<{ id: string }> };

function normalizeCategory(cat: AdminProductCategory | null | undefined): AdminProductCategory | null {
  if (!cat) return null;
  return {
    ...cat,
    id: String(cat.id ?? ""),
    parentId: cat.parentId != null ? String(cat.parentId) : null,
    subcategories: [],
  };
}

function normalizeProduct(product: AdminProduct): AdminProduct {
  return {
    ...product,
    id: String(product.id ?? ""),
    code: product.code ?? null,
    category: normalizeCategory(product.category),
    gallery: (product.gallery ?? []).map((image) => ({
      ...image,
      id: String(image.id ?? ""),
      thumbnailUrl: image.thumbnailUrl ?? null,
      displayOrder: image.displayOrder ?? 0,
    })),
    variants: (product.variants ?? []).map((variant) => ({
      ...variant,
      id: String(variant.id ?? ""),
    })),
  };
}

async function backendError(response: Response, fallback: string) {
  const detail = await response.text().catch(() => "");
  const message = detail.trim()
    ? `Erro ${response.status} do backend: ${detail.slice(0, 200)}`
    : fallback;

  return jsonError(message, response.status);
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;

  let response: Response;
  try {
    response = await fetchBackend(request, `/admin/products/${id}`);
  } catch {
    return jsonError("Backend inacessivel. Confirma se o servidor Spring Boot esta a correr na porta 8080.", 502);
  }

  await relayAuthFailure(response);

  if (!response.ok) {
    return backendError(response, "Produto nao encontrado.");
  }

  const data = await parseBackendJson<AdminProduct>(response);
  return NextResponse.json(normalizeProduct(data));
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await request.json() as CreateProductPayload;

  let response: Response;
  try {
    response = await fetchBackend(request, `/admin/products/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  } catch {
    return jsonError("Backend inacessivel.", 502);
  }

  await relayAuthFailure(response);

  if (!response.ok) {
    return backendError(response, "Nao foi possivel actualizar o produto.");
  }

  const data = await parseBackendJson<AdminProduct>(response);
  return NextResponse.json(normalizeProduct(data));
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;

  let response: Response;
  try {
    response = await fetchBackend(request, `/admin/products/${id}`, { method: "DELETE" });
  } catch {
    return jsonError("Backend inacessivel.", 502);
  }

  await relayAuthFailure(response);

  if (!response.ok) {
    return backendError(response, "Nao foi possivel remover o produto.");
  }

  const data = await parseBackendJson<AdminProduct>(response);
  return NextResponse.json(normalizeProduct(data));
}
