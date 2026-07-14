import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, jsonErrorPayload, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

type RouteContext = { params: Promise<{ path?: string[] }> };

async function relay(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;
  const suffix = path.map(encodeURIComponent).join("/");
  const search = new URL(request.url).search;
  const backendPath = `/admin/catalog/${suffix}${search}`;
  const method = request.method.toUpperCase();
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);

  const init: RequestInit & { duplex?: "half" } = { method, headers };
  if (!["GET", "HEAD"].includes(method)) {
    init.body = request.body;
    init.duplex = "half";
  }

  let response: Response;
  try {
    response = await fetchBackend(request, backendPath, init);
  } catch {
    return jsonError("Backend inacessivel.", 502);
  }

  await relayAuthFailure(response);

  if (!response.ok) {
    const payload = await parseBackendJson<unknown>(response);
    return jsonErrorPayload(payload, response.status, "Nao foi possivel concluir a operacao no catalogo.");
  }

  if (response.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  const payload = await parseBackendJson<unknown>(response);
  return NextResponse.json(payload);
}

export async function GET(request: NextRequest, context: RouteContext) {
  return relay(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return relay(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return relay(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return relay(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return relay(request, context);
}
