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

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const response = await fetchBackend(
    request,
    `/admin/payments/${encodeURIComponent(id)}/notify-client`,
    {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }
  );
  await relayAuthFailure(response);

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as { message?: string } | null;
    return jsonError(errorPayload?.message || "Não foi possível notificar o cliente.", response.status);
  }

  return NextResponse.json(await response.json().catch(() => ({})));
}
