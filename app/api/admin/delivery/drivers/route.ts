import { NextRequest, NextResponse } from "next/server";

import { fetchDeliveryDrivers } from "@/app/api/admin/delivery/_shared";
import type { DeliveryDriversResponse } from "@/lib/admin/types";

export async function GET(request: NextRequest) {
  const result = await fetchDeliveryDrivers(request);

  if ("error" in result) {
    return result.error;
  }

  const payload: DeliveryDriversResponse = {
    content: result,
  };

  return NextResponse.json(payload);
}
