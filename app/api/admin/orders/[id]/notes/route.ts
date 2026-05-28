import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, jsonErrorPayload, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";
import type { InternalOrderNote } from "@/lib/admin/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const response = await fetchBackend(_, `/admin/orders/${encodeURIComponent(id)}/notes`);
  await relayAuthFailure(response);
  if (!response.ok) {
    return jsonError("Não foi possível carregar as notas.", response.status);
  }
  const payload = await parseBackendJson<InternalOrderNote[]>(response);
  return NextResponse.json(payload ?? []);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { content?: string } | null;
  const content = String(body?.content ?? "").trim();

  if (!content) {
    return NextResponse.json({ message: "A nota não pode estar vazia." }, { status: 400 });
  }

  const response = await fetchBackend(request, `/admin/orders/${encodeURIComponent(id)}/notes`, {
    method: "POST",
    body: JSON.stringify({ content }),
    headers: { "Content-Type": "application/json" },
  });
  await relayAuthFailure(response);

  if (!response.ok) {
    const payload = await parseBackendJson<unknown>(response);
    return jsonErrorPayload(payload, response.status, "Não foi possível guardar a nota.");
  }

  const note = await parseBackendJson<InternalOrderNote>(response);
  return NextResponse.json({ notes: [note] });
}
