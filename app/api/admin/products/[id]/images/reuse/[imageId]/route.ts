import { NextRequest, NextResponse } from "next/server";
import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";
import type { AdminProduct } from "@/lib/admin/types";

type Params = { params: Promise<{ id: string; imageId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { id, imageId } = await params;

  let response: Response;
  try {
    response = await fetchBackend(request, `/admin/products/${id}/images/reuse/${imageId}`, { method: "POST" });
  } catch {
    return jsonError("Backend inacessível.", 502);
  }

  await relayAuthFailure(response);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return jsonError(`Erro ${response.status}: ${text.slice(0, 200) || "sem detalhe"}`, response.status);
  }

  const data = await parseBackendJson<AdminProduct>(response);
  return NextResponse.json(data);
}
