import { NextRequest } from "next/server";

import { jsonError } from "@/app/api/admin/_utils";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  void request;

  return jsonError(
    `Fluxo de pagamento legado desativado para o pedido ${id}. Use /admin/payments?orderId=${encodeURIComponent(id)}.`,
    410
  );
}
