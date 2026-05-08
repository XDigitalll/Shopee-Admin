import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/app/api/admin/_utils";
import { getQuotesPage } from "@/app/api/admin/quotes/_shared";
import type { AdminQuotesFilterState } from "@/lib/admin/types";

function readFilters(request: NextRequest): AdminQuotesFilterState {
  const { searchParams } = new URL(request.url);

  return {
    status: (searchParams.get("status") as AdminQuotesFilterState["status"]) || "ALL",
    search: searchParams.get("search") ?? "",
    store: (searchParams.get("store") as AdminQuotesFilterState["store"]) || "ALL",
    sort: (searchParams.get("sort") as AdminQuotesFilterState["sort"]) || "RECENT",
    page: Number(searchParams.get("page") ?? "0"),
    size: Number(searchParams.get("size") ?? "10"),
  };
}

export async function GET(request: NextRequest) {
  try {
    const payload = await getQuotesPage(request, readFilters(request));
    return NextResponse.json(payload);
  } catch (error) {
    const status = Number(error instanceof Error ? error.message : 500);
    return jsonError("Não foi possível carregar as cotações externas.", Number.isFinite(status) ? status : 500);
  }
}
