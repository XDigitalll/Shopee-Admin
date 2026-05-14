import { NextRequest } from "next/server";

import { relayExchangeRateResponse } from "@/app/api/admin/exchange-rates/_shared";

export async function PATCH(request: NextRequest) {
  return relayExchangeRateResponse(
    request,
    "/admin/exchange-rates/activate",
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: await request.text(),
    },
    "Nao foi possivel actualizar a taxa de cambio.",
  );
}
