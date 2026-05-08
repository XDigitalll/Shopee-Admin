import { NextRequest, NextResponse } from "next/server";

import { fetchActiveDeliveryOrders } from "@/app/api/admin/delivery/_shared";

export async function GET(request: NextRequest) {
  const result = await fetchActiveDeliveryOrders(request);

  if ("error" in result) {
    return result.error;
  }

  return NextResponse.json(result);
}
