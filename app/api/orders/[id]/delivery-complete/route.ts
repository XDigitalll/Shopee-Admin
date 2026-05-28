import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, relayAuthFailure } from "@/app/api/admin/_utils";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

async function readBackendMessage(response: Response, fallback: string) {
  const payload = (await response.clone().json().catch(() => null)) as { message?: string; error?: string } | null;
  if (payload?.message) return payload.message;
  if (payload?.error) return payload.error;

  const text = await response.text().catch(() => "");
  return text.trim() || fallback;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  let response: Response;
  try {
    response = await fetchBackend(request, `/admin/delivery/active/${id}/complete`, {
      method: "POST",
    });
    await relayAuthFailure(response);
  } catch {
    return jsonError("Backend inacessivel. Confirma se o Spring Boot esta a correr na porta 8080.", 502);
  }

  if (!response.ok) {
    return jsonError(
      await readBackendMessage(response, "Nao foi possivel concluir a entrega."),
      response.status
    );
  }

  return NextResponse.json({ ok: true });
}
