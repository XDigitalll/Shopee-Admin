import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";
import type { PaymentSubmissionQueueStats } from "@/lib/admin/types";

export async function GET(request: NextRequest) {
  const response = await fetchBackend(request, "/admin/payments/summary");
  await relayAuthFailure(response);

  if (!response.ok) {
    return jsonError("Nao foi possivel carregar o resumo financeiro.", response.status);
  }

  const payload = await parseBackendJson<PaymentSubmissionQueueStats>(response);
  return NextResponse.json(payload);
}
