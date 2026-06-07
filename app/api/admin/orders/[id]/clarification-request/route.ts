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
    `/admin/orders/${encodeURIComponent(id)}/clarification-request`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    }
  );
  await relayAuthFailure(response);

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
    return jsonError(
      errorPayload?.message || errorPayload?.error || "Nao foi possivel pedir detalhes ao cliente.",
      response.status
    );
  }

  const payload = await response.json().catch(() => null);
  return NextResponse.json(payload ?? {});
}
