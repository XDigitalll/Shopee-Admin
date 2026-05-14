import { NextRequest } from "next/server";

import { relayExchangeRateResponse } from "@/app/api/admin/exchange-rates/_shared";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const baseCurrency = url.searchParams.get("baseCurrency") || "ZAR";
  const targetCurrency = url.searchParams.get("targetCurrency") || "MZN";

  return relayExchangeRateResponse(
    request,
    `/admin/exchange-rates/active?baseCurrency=${encodeURIComponent(baseCurrency)}&targetCurrency=${encodeURIComponent(targetCurrency)}`,
    {},
    "Nao foi possivel carregar a taxa activa.",
  );
}
