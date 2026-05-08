import { NextRequest, NextResponse } from "next/server";
import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

export async function GET(request: NextRequest) {
  let response: Response;
  try {
    response = await fetchBackend(request, "/admin/banners");
  } catch {
    return jsonError("Backend inacessível.", 502);
  }
  await relayAuthFailure(response);
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    return jsonError(payload?.message || "Erro ao carregar banners.", response.status);
  }
  return NextResponse.json(await parseBackendJson(response));
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  // multipart upload → forward as-is to /admin/banners/upload-image
  if (contentType.includes("multipart/form-data")) {
    let response: Response;
    try {
      response = await fetchBackend(request, "/admin/banners/upload-image", {
        method: "POST",
        body: await request.arrayBuffer(),
      });
    } catch {
      return jsonError("Backend inacessível.", 502);
    }
    await relayAuthFailure(response);
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      return jsonError(payload?.message || "Erro ao carregar imagem.", response.status);
    }
    return NextResponse.json(await parseBackendJson(response));
  }

  // JSON → create banner
  let response: Response;
  try {
    response = await fetchBackend(request, "/admin/banners", {
      method: "POST",
      body: await request.text(),
    });
  } catch {
    return jsonError("Backend inacessível.", 502);
  }
  await relayAuthFailure(response);
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    return jsonError(payload?.message || "Erro ao criar banner.", response.status);
  }
  return NextResponse.json(await parseBackendJson(response));
}
