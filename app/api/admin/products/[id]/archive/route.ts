import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonErrorPayload, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";
import type { AdminProduct } from "@/lib/admin/types";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const response = await fetchBackend(request, `/admin/products/${id}/archive`, { method: "PATCH" });

  await relayAuthFailure(response);

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    return jsonErrorPayload(payload, response.status, "Nao foi possivel arquivar o produto.");
  }

  const data = await parseBackendJson<AdminProduct>(response);
  return NextResponse.json(data);
}
