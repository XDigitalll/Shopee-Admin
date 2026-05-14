import { NextRequest } from "next/server";

import { relayExchangeRateResponse } from "@/app/api/admin/exchange-rates/_shared";

export async function POST(request: NextRequest) {
  return relayExchangeRateResponse(
    request,
    "/admin/exchange-rates/create",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: await request.text(),
    },
    "Nao foi possivel criar a taxa de cambio.",
  );
}
