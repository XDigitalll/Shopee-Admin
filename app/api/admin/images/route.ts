import { NextRequest, NextResponse } from "next/server";
import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";
import type { ImageLibraryPageResponse } from "@/lib/admin/types";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = searchParams.get("page") ?? "0";
  const size = searchParams.get("size") ?? "40";

  let response: Response;
  try {
    response = await fetchBackend(request, `/admin/images?page=${page}&size=${size}`);
  } catch {
    return jsonError("Backend inacessível.", 502);
  }

  await relayAuthFailure(response);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return jsonError(`Erro ${response.status} do backend: ${text.slice(0, 200) || "sem detalhe"}`, response.status);
  }

  const data = await parseBackendJson<ImageLibraryPageResponse>(response);
  return NextResponse.json(data);
}
