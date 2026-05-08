import { NextRequest } from "next/server";

import { jsonError } from "@/app/api/admin/_utils";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PUT(request: NextRequest, context: RouteContext) {
  await context.params;
  void request;
  return jsonError("A suspensão temporária ainda não foi implementada no backend actual.", 501);
}
