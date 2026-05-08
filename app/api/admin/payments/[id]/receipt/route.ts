import { NextRequest, NextResponse } from "next/server";

import {
  fetchBackend,
  jsonError,
  parseBackendJson,
  relayAuthFailure,
} from "@/app/api/admin/_utils";
import type { AdminPaymentReceiptResponse } from "@/lib/admin/types";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const response = await fetchBackend(request, `/admin/payments/${encodeURIComponent(id)}/receipt`);
  await relayAuthFailure(response);

  if (!response.ok) {
    return jsonError("Não foi possível carregar o comprovativo.", response.status);
  }

  const payload = await parseBackendJson<AdminPaymentReceiptResponse>(response);
  return NextResponse.json({
    url: payload?.url ?? null,
  });
}
