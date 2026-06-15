import { NextRequest, NextResponse } from "next/server";

import {
  fetchBackend,
  jsonError,
  jsonErrorPayload,
  parseBackendJson,
  relayAuthFailure,
} from "@/app/api/admin/_utils";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    amountCollected?: number | string;
    collectedBy?: string | null;
    collectorRole?: string | null;
    note?: string | null;
    receivedAt?: string | null;
    cashLocation?: string | null;
    deliveryConfirmation?: string | null;
  } | null;
  const amountCollected = Number(body?.amountCollected ?? 0);

  if (!Number.isFinite(amountCollected) || amountCollected <= 0) {
    return jsonError("Informe o valor COD recebido.", 400);
  }

  const response = await fetchBackend(
    request,
    `/admin/orders/${encodeURIComponent(id)}/cod/confirm-cash-collected`,
    {
      method: "PATCH",
      body: JSON.stringify({
        ...body,
        amountCollected,
        collectorRole: body?.collectorRole ?? "ADMIN",
        deliveryConfirmation: body?.deliveryConfirmation ?? "Confirmado no admin.",
      }),
      headers: { "Content-Type": "application/json" },
    }
  );
  await relayAuthFailure(response);

  if (!response.ok) {
    const payload = await parseBackendJson<unknown>(response);
    return jsonErrorPayload(payload, response.status, "Nao foi possivel confirmar o COD recebido.");
  }

  return NextResponse.json(await parseBackendJson<unknown>(response));
}
