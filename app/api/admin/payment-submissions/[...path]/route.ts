import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonErrorPayload, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

type RouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

function backendPath(path: string[]) {
  return `/admin/payment-submissions/${path.map(encodeURIComponent).join("/")}`;
}

async function forward(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const url = new URL(request.url);
  const target = `${backendPath(path)}${url.search}`;
  const init: RequestInit = { method: request.method };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
  }

  const response = await fetchBackend(request, target, init);
  await relayAuthFailure(response);

  const payload = await parseBackendJson<unknown>(response);

  if (!response.ok) {
    return jsonErrorPayload(payload, response.status, "Nao foi possivel processar a submissao de pagamento.");
  }

  return NextResponse.json(payload);
}

export async function GET(request: NextRequest, context: RouteContext) {
  return forward(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return forward(request, context);
}
