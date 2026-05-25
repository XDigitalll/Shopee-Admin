import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";
import type { ProductAttentionResponse } from "@/lib/admin/types";

export async function GET(request: NextRequest) {
  let response: Response;
  try {
    response = await fetchBackend(request, "/admin/products/attention");
  } catch {
    return jsonError("Backend inacessivel.", 502);
  }

  await relayAuthFailure(response);

  if (!response.ok) {
    return jsonError("Nao foi possivel carregar alertas de produtos.", response.status);
  }

  const data = await parseBackendJson<ProductAttentionResponse>(response);
  return NextResponse.json({
    count: Number(data?.count ?? 0),
    items: data?.items ?? [],
  });
}
