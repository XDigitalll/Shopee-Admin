import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";
import type { AdminProductVariant } from "@/lib/admin/types";

type Params = { params: Promise<{ id: string; variantId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { id, variantId } = await params;

  let body: ArrayBuffer;
  try {
    body = await request.arrayBuffer();
  } catch {
    return jsonError("Corpo da requisicao invalido.", 400);
  }

  let response: Response;
  try {
    response = await fetchBackend(request, `/admin/products/${id}/variants/${variantId}/image`, {
      method: "POST",
      body,
      cache: "no-store",
    });
  } catch {
    return jsonError("Backend inacessivel.", 502);
  }

  await relayAuthFailure(response);

  if (!response.ok) {
    const msg = await response.text().catch(() => "Erro desconhecido.");
    return jsonError(msg || "Nao foi possivel fazer upload da imagem.", response.status);
  }

  return NextResponse.json(await parseBackendJson<AdminProductVariant>(response));
}
