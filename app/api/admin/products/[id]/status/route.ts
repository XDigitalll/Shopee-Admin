import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";
import type { AdminProduct } from "@/lib/admin/types";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const { status } = await request.json() as { status: string };

  const response = await fetchBackend(
    request,
    `/admin/products/${id}/status?status=${encodeURIComponent(status)}`,
    { method: "PATCH" }
  );
  await relayAuthFailure(response);

  if (!response.ok) {
    return jsonError("Não foi possível alterar o estado do produto.", response.status);
  }

  const data = await parseBackendJson<AdminProduct>(response);
  return NextResponse.json(data);
}
