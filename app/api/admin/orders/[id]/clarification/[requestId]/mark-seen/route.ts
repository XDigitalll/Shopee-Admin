import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, relayAuthFailure } from "@/app/api/admin/_utils";

type RouteContext = {
  params: Promise<{ id: string; requestId: string }>;
};

export async function PATCH(_request: NextRequest, context: RouteContext) {
  const { id, requestId } = await context.params;

  const response = await fetchBackend(
    _request,
    `/admin/orders/${encodeURIComponent(id)}/clarification/${encodeURIComponent(requestId)}/mark-seen`,
    { method: "PATCH" }
  );
  await relayAuthFailure(response);

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as { message?: string } | null;
    return jsonError(
      errorPayload?.message || "Não foi possível marcar como vista.",
      response.status
    );
  }

  return new NextResponse(null, { status: 204 });
}
