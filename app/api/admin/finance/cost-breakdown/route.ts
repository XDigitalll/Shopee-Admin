import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

type BackendCostBreakdown = {
  totalSiteTax?: number;
  totalExternalCommission?: number;
  totalInsurance?: number;
  totalCustoms?: number;
  totalOperationalCost?: number;
};

export async function GET(request: NextRequest) {
  const response = await fetchBackend(request, "/admin/finance/cost-breakdown");
  await relayAuthFailure(response);

  if (!response.ok) {
    return jsonError("Não foi possível carregar a decomposição de custos.", response.status);
  }

  const d = (await parseBackendJson<BackendCostBreakdown>(response)) ?? {};

  return NextResponse.json({
    siteTax: Number(d.totalSiteTax ?? 0),
    externalCommission: Number(d.totalExternalCommission ?? 0),
    insurance: Number(d.totalInsurance ?? 0),
    customs: Number(d.totalCustoms ?? 0),
    operational: Number(d.totalOperationalCost ?? 0),
  });
}
