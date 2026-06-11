import { NextRequest, NextResponse } from "next/server";
import { fetchBackend, forwardXsrfCookie, jsonErrorPayload, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

export async function GET(request: NextRequest) {
  const backendResponse = await fetchBackend(request, `/admin/payment-submissions${new URL(request.url).search}`);
  await relayAuthFailure(backendResponse);
  const payload = await parseBackendJson<unknown>(backendResponse);

  if (!backendResponse.ok) {
    return jsonErrorPayload(payload, backendResponse.status, "Nao foi possivel carregar submissoes de pagamento.");
  }

  const response = NextResponse.json(payload, { status: backendResponse.status });
  forwardXsrfCookie(backendResponse, response);
  return response;
}

export async function POST(request: NextRequest) {
  const backendResponse = await fetchBackend(request, "/admin/payment-submissions", {
    method: "POST",
    body: await request.text(),
  });
  await relayAuthFailure(backendResponse);
  const payload = await parseBackendJson<unknown>(backendResponse);

  if (!backendResponse.ok) {
    return jsonErrorPayload(payload, backendResponse.status, "Nao foi possivel criar submissao de pagamento.");
  }

  const response = NextResponse.json(payload, { status: backendResponse.status });
  forwardXsrfCookie(backendResponse, response);
  return response;
}
