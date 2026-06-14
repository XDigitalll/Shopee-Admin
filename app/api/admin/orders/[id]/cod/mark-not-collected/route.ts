import { NextRequest, NextResponse } from "next/server";

import {
  fetchBackend,
  jsonError,
  jsonErrorPayload,
  parseBackendJson,
  relayAuthFailure,
} from "@/app/api/admin/_utils";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { reason?: string } | null;
  const reason = String(body?.reason ?? "").trim();

  if (!reason) {
    return jsonError("Informe o motivo para marcar COD como nao recebido.", 400);
  }

  const response = await fetchBackend(
    request,
    `/admin/orders/${encodeURIComponent(id)}/cod/mark-not-collected`,
    {
      method: "PATCH",
      body: JSON.stringify({ reason }),
      headers: { "Content-Type": "application/json" },
    }
  );
  await relayAuthFailure(response);

  if (!response.ok) {
    const payload = await parseBackendJson<unknown>(response);
    return jsonErrorPayload(payload, response.status, "Nao foi possivel marcar COD como nao recebido.");
  }

  return NextResponse.json(await parseBackendJson<unknown>(response));
}
