import { NextRequest, NextResponse } from "next/server";

import {
  fetchBackend,
  jsonError,
  relayAuthFailure,
} from "@/app/api/admin/_utils";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { reason?: string } | null;

  const response = await fetchBackend(
    request,
    `/admin/payments/${encodeURIComponent(id)}/reject`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reason: body?.reason ?? "",
      }),
    }
  );
  await relayAuthFailure(response);

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as { message?: string } | null;
    return jsonError(errorPayload?.message || "Não foi possível rejeitar o pagamento.", response.status);
  }

  return NextResponse.json(await response.json().catch(() => null));
}
