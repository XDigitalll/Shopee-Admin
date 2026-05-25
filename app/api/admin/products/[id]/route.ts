import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, jsonErrorPayload, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";
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
  let message = fallback;
  if (detail.trim()) {
    try {
      const payload = JSON.parse(detail) as { message?: string; error?: string };
      message = payload.message || payload.error || fallback;
    } catch {
      message = detail.slice(0, 200);
    }
  }

  return jsonError(message, response.status);
}

async function relayBackendError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null);
  return jsonErrorPayload(payload, response.status, fallback);
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
    return relayBackendError(response, "Nao foi possivel actualizar o produto.");
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
    return relayBackendError(response, "Nao foi possivel remover o produto.");
  }

  return new NextResponse(null, { status: 204 });
}
