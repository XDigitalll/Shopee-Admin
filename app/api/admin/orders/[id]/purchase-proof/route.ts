import { NextRequest, NextResponse } from "next/server";

import {
  fetchBackend,
  jsonErrorPayload,
  parseBackendJson,
  relayAuthFailure,
} from "@/app/api/admin/_utils";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const backendResponse = await fetchBackend(request, `/admin/orders/${encodeURIComponent(id)}/purchase-proof`, {
    method: "POST",
    body: request.body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  await relayAuthFailure(backendResponse);

  if (!backendResponse.ok) {
    const payload = await parseBackendJson<unknown>(backendResponse);
    if (backendResponse.status >= 500) {
      console.warn("PURCHASE_CONFIRMATION_FAILED", {
        orderId: id,
        format: "multipart",
        hasFile: true,
        errorClass: `HTTP_${backendResponse.status}`,
      });
      return NextResponse.json({ message: "Nao conseguimos confirmar agora. Tenta novamente." }, { status: backendResponse.status });
    }
    return jsonErrorPayload(payload, backendResponse.status, "Nao conseguimos confirmar agora. Tenta novamente.");
  }

  const payload = await parseBackendJson<unknown>(backendResponse);
  return NextResponse.json(payload);
}
