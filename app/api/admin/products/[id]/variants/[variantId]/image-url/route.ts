import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, relayAuthFailure } from "@/app/api/admin/_utils";

type Params = { params: Promise<{ id: string; variantId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id, variantId } = await params;
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return jsonError("Corpo da requisicao invalido.", 400);
  }

  let response: Response;
  try {
    response = await fetchBackend(request, `/admin/products/${id}/variants/${variantId}/image-url`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  } catch {
    return jsonError("Backend inacessivel.", 502);
  }

  await relayAuthFailure(response);

  if (!response.ok) {
    const msg = await response.text().catch(() => "Erro desconhecido.");
    return jsonError(msg || "Nao foi possivel actualizar imagem da variante.", response.status);
  }

  return NextResponse.json(await response.json());
}
