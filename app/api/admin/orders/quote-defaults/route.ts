import { NextRequest, NextResponse } from "next/server";

import {
  fetchBackend,
  jsonError,
  parseBackendJson,
  relayAuthFailure,
} from "@/app/api/admin/_utils";
import type { QuoteDefaultsResponse } from "@/lib/admin/types";

export async function GET(request: NextRequest) {
  const response = await fetchBackend(request, "/admin/orders/quote-defaults");
  await relayAuthFailure(response);

  if (!response.ok) {
    return jsonError("Não foi possível carregar os defaults da cotação.", response.status);
  }

  const payload = await parseBackendJson<Partial<QuoteDefaultsResponse>>(response);

  return NextResponse.json({
    commissionPercentage: Number(payload?.commissionPercentage ?? 10),
    returnRiskPercentage: Number(payload?.returnRiskPercentage ?? 5),
    operationalCostPercentage: Number(payload?.operationalCostPercentage ?? 0),
    urgentPercentage: 0,
  } satisfies QuoteDefaultsResponse);
}
