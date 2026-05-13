import { NextRequest, NextResponse } from "next/server";

import {
  fetchBackend,
  jsonError,
  parseBackendJson,
  relayAuthFailure,
} from "@/app/api/admin/_utils";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const TARGET_QUEUES = ["QUOTES", "PAYMENTS", "DELIVERY", "EXECUTION", "SUPPORT"] as const;

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    targetQueue?: string;
    note?: string;
  } | null;

  if (!body || !TARGET_QUEUES.includes(String(body.targetQueue) as (typeof TARGET_QUEUES)[number])) {
    return jsonError("A fila destino e obrigatoria ou invalida.", 400);
  }

  if (body?.note && body.note.length > 500) {
    return jsonError("A nota deve ter no maximo 500 caracteres.", 400);
  }

  const targetQueue = body.targetQueue as (typeof TARGET_QUEUES)[number];
  const response = await fetchBackend(request, `/admin/orders/${encodeURIComponent(id)}/handoff`, {
    method: "PATCH",
    body: JSON.stringify({
      targetQueue,
      note: body.note?.trim() || undefined,
    }),
    headers: {
      "Content-Type": "application/json",
    },
  });
  await relayAuthFailure(response);

  const payload = await parseBackendJson<unknown>(response);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : "Nao foi possivel enviar o pedido para a equipa destino.";
    return jsonError(message, response.status);
  }

  return NextResponse.json(payload);
}
