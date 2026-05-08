import { NextRequest, NextResponse } from "next/server";

import { fetchOrderDetailBundle } from "@/app/api/admin/orders/[id]/_shared";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const result = await fetchOrderDetailBundle(request, id);

  if ("error" in result) {
    return result.error;
  }

  return NextResponse.json(result.history);
}
