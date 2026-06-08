import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, relayAuthFailure } from "@/app/api/admin/_utils";

export async function PATCH(request: NextRequest) {
  const response = await fetchBackend(request, "/admin/orders/clarifications/mark-all-seen", {
    method: "PATCH",
  });
  await relayAuthFailure(response);

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as { message?: string } | null;
    return jsonError(
      errorPayload?.message || "Não foi possível marcar esclarecimentos como vistos.",
      response.status
    );
  }

  const body = await response.json().catch(() => null);
  return NextResponse.json(body ?? { marked: 0 });
}
