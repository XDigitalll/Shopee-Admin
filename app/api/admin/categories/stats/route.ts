import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

type BackendStats = {
  totalCategories?: number;
  activeCategories?: number;
  rootCategories?: number;
  subcategories?: number;
  visibleOnHomepage?: number;
};

export async function GET(request: NextRequest) {
  const response = await fetchBackend(request, "/admin/categories/stats");
  await relayAuthFailure(response);

  if (!response.ok) {
    return jsonError("Não foi possível carregar estatísticas de categorias.", response.status);
  }

  const s = await parseBackendJson<BackendStats>(response);

  return NextResponse.json({
    totalCategories: Number(s.rootCategories ?? s.totalCategories ?? 0),
    totalSubcategories: Number(s.subcategories ?? 0),
    totalProducts: 0,
  });
}
