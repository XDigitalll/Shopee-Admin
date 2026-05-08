import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/app/api/admin/_utils";
import { getQuoteStats } from "@/app/api/admin/quotes/_shared";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await getQuoteStats(request));
  } catch (error) {
    const status = Number(error instanceof Error ? error.message : 500);
    return jsonError("Não foi possível carregar os totais das cotações.", Number.isFinite(status) ? status : 500);
  }
}
