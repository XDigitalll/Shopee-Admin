import { NextRequest, NextResponse } from "next/server";

import {
  fetchBackend,
  jsonError,
  parseBackendJson,
  relayAuthFailure,
} from "@/app/api/admin/_utils";
import type { QuoteOptionsResponse } from "@/lib/admin/types";

export async function GET(request: NextRequest) {
  const response = await fetchBackend(request, "/admin/quotes/options");
  await relayAuthFailure(response);

  if (!response.ok) {
    return jsonError("Nao foi possivel carregar opcoes de cotacao.", response.status);
  }

  const payload = await parseBackendJson<QuoteOptionsResponse>(response);
  return NextResponse.json(payload);
}
