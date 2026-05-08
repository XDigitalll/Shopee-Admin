import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

type BackendCategory = {
  id?: number;
  name?: string;
  slug?: string;
  icon?: string;
  description?: string;
  active?: boolean;
  showOnHomepage?: boolean;
  productCount?: number;
  parentId?: number | null;
  subcategories?: BackendCategory[];
};

function normalize(c: BackendCategory): object {
  return {
    ...c,
    id: String(c.id ?? ""),
    parentId: c.parentId != null ? String(c.parentId) : null,
    subcategories: (c.subcategories ?? []).map(normalize),
  };
}

export async function GET(request: NextRequest) {
  const response = await fetchBackend(request, "/admin/categories");
  await relayAuthFailure(response);

  if (!response.ok) {
    return jsonError("Não foi possível carregar categorias.", response.status);
  }

  const data = await parseBackendJson<BackendCategory[]>(response);
  return NextResponse.json(data.map(normalize));
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const response = await fetchBackend(request, "/admin/categories", {
    method: "POST",
    body: JSON.stringify(body),
  });
  await relayAuthFailure(response);

  if (!response.ok) {
    const error = await response.text();
    return jsonError(error || "Não foi possível criar categoria.", response.status);
  }

  const data = await parseBackendJson<BackendCategory>(response);
  return NextResponse.json(normalize(data));
}
