import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, jsonErrorPayload, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";
import type { ExternalOrderDraft } from "@/lib/admin/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const response = await fetchBackend(_, `/admin/orders/${encodeURIComponent(id)}/quote-draft`);
  await relayAuthFailure(response);
  if (response.status === 204 || response.status === 404) {
    return NextResponse.json(null);
  }
  if (!response.ok) {
    return jsonError("Não foi possível carregar o rascunho.", response.status);
  }
  const payload = await parseBackendJson<ExternalOrderDraft>(response);
  return NextResponse.json(payload ?? null);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);

  const response = await fetchBackend(request, `/admin/orders/${encodeURIComponent(id)}/quote-draft`, {
    method: "PUT",
    body: JSON.stringify(body ?? {}),
    headers: { "Content-Type": "application/json" },
  });
  await relayAuthFailure(response);

  if (!response.ok) {
    const payload = await parseBackendJson<unknown>(response);
    return jsonErrorPayload(payload, response.status, "Não foi possível guardar o rascunho.");
  }

  return NextResponse.json({ saved: true });
}

export async function DELETE(_: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const response = await fetchBackend(_, `/admin/orders/${encodeURIComponent(id)}/quote-draft`, {
    method: "DELETE",
  });
  await relayAuthFailure(response);

  if (!response.ok && response.status !== 404) {
    const payload = await parseBackendJson<unknown>(response);
    return jsonErrorPayload(payload, response.status, "Não foi possível remover o rascunho.");
  }

  return NextResponse.json({ cleared: true });
}
