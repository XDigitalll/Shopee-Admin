import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";
import type { AdminProduct } from "@/lib/admin/types";

type Params = { params: Promise<{ id: string; imageId: string }> };

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id, imageId } = await params;

  const response = await fetchBackend(request, `/admin/products/${id}/images/${imageId}`, {
    method: "DELETE",
  });
  await relayAuthFailure(response);

  if (!response.ok) {
    return jsonError("Não foi possível remover a imagem.", response.status);
  }

  const data = await parseBackendJson<AdminProduct>(response);
  return NextResponse.json(data);
}
