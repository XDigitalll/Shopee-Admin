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

  const response = await fetchBackend(
    request,
    `/admin/orders/${encodeURIComponent(id)}/payment/approve`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    }
  );
  await relayAuthFailure(response);

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null) as { message?: string } | null;
    return jsonError(errorPayload?.message || "Não foi possível validar o pagamento.", response.status);
  }

  return NextResponse.json(await response.json().catch(() => null));
}
