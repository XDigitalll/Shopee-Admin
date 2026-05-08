import { NextRequest, NextResponse } from "next/server";

import { getQuoteDetail } from "@/app/api/admin/quotes/_shared";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const result = await getQuoteDetail(request, id);

  if ("error" in result) {
    return result.error;
  }

  return NextResponse.json(result.detail);
}
