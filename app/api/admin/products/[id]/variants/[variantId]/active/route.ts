import { NextRequest, NextResponse } from "next/server";
import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

type Params = { params: Promise<{ id: string; variantId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id, variantId } = await params;
  const { searchParams } = new URL(request.url);
  const active = searchParams.get("active") ?? "true";
  let response: Response;
  try {
    response = await fetchBackend(
      request,
      `/admin/products/${id}/variants/${variantId}/active?active=${active}`,
      { method: "PATCH" }
    );
  } catch {
    return jsonError("Backend inacessivel.", 502);
  }
  await relayAuthFailure(response);
  if (!response.ok) return jsonError("Nao foi possivel alterar estado da variante.", response.status);
  return NextResponse.json(await parseBackendJson(response));
}
