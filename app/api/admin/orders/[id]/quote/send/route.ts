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
  const body = await request.text();

  const response = await fetchBackend(request, `/admin/orders/${encodeURIComponent(id)}/quote/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
  });
  await relayAuthFailure(response);

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    return jsonError(errorText || "Nao foi possivel enviar a cotacao ao cliente.", response.status);
  }

  return NextResponse.json(await response.json().catch(() => null));
}
