import { NextRequest, NextResponse } from "next/server";
import { fetchBackend, forwardXsrfCookie, jsonErrorPayload, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function proxy(request: NextRequest, context: RouteContext, method: "GET" | "POST" | "PATCH" | "PUT") {
  const { path } = await context.params;
  const suffix = path.map(encodeURIComponent).join("/");
  const backendPath = `/admin/payment-submissions/${suffix}${method === "GET" ? new URL(request.url).search : ""}`;
  const backendResponse = await fetchBackend(request, backendPath, {
    method,
    body: method === "GET" ? undefined : await request.text(),
  });
  await relayAuthFailure(backendResponse);
  const payload = await parseBackendJson<unknown>(backendResponse);

  if (!backendResponse.ok) {
    return jsonErrorPayload(payload, backendResponse.status, "Nao foi possivel processar submissao de pagamento.");
  }

  const response = NextResponse.json(payload, { status: backendResponse.status });
  forwardXsrfCookie(backendResponse, response);
  return response;
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxy(request, context, "GET");
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxy(request, context, "POST");
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxy(request, context, "PATCH");
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxy(request, context, "PUT");
}
