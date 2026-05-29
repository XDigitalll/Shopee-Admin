import { NextRequest, NextResponse } from "next/server";
import { fetchBackend, jsonError, relayAuthFailure } from "@/app/api/admin/_utils";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const response = await fetchBackend(
    request,
    `/admin/payments/${encodeURIComponent(id)}/sync`,
    { method: "POST" }
  );
  await relayAuthFailure(response);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    return jsonError(
      payload?.message || "Não foi possível sincronizar o estado do pagamento.",
      response.status
    );
  }

  return NextResponse.json(await response.json().catch(() => ({})));
}
