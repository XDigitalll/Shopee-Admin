import { NextRequest, NextResponse } from "next/server";

import {
  fetchBackend,
  jsonError,
  parseBackendJson,
  relayAuthFailure,
} from "@/app/api/admin/_utils";
import type { AdminPaymentStatsResponse } from "@/lib/admin/types";

export async function GET(request: NextRequest) {
  const response = await fetchBackend(request, "/admin/payments/stats");
  await relayAuthFailure(response);

  if (!response.ok) {
    return jsonError("Não foi possível carregar os totais de pagamentos.", response.status);
  }

  const payload = await parseBackendJson<AdminPaymentStatsResponse>(response);
  return NextResponse.json({
    all: Number(payload?.all ?? 0),
    pending: Number(payload?.pending ?? 0),
    validated: Number(payload?.validated ?? 0),
    rejected: Number(payload?.rejected ?? 0),
    pendingValidationCount: Number(payload?.pendingValidationCount ?? 0),
    validatedTodayAmount: Number(payload?.validatedTodayAmount ?? 0),
  });
}
