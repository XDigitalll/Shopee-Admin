import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, relayAuthFailure } from "@/app/api/admin/_utils";
import { addDeliveryIssue } from "@/lib/admin/delivery-meta-store";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const ALLOWED_TYPES = [
  "CLIENTE_AUSENTE",
  "ENDERECO_INCORRECTO",
  "PEDIDO_DANIFICADO",
  "IMPOSSIVEL_ENTREGAR",
] as const;

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const payload = (await request.json().catch(() => null)) as {
    type?: string;
    note?: string | null;
  } | null;

  const type = typeof payload?.type === "string" ? payload.type.trim().toUpperCase() : "";
  const note = typeof payload?.note === "string" ? payload.note.trim() : null;

  if (!ALLOWED_TYPES.includes(type as (typeof ALLOWED_TYPES)[number])) {
    return jsonError("Seleciona um motivo valido para reportar o problema da entrega.", 400);
  }

  if (!note) {
    return jsonError("Regista uma nota curta para a equipa e o cliente perceberem o contexto.", 400);
  }

  try {
    const response = await fetchBackend(request, `/admin/delivery/active/${id}/issue`, {
      method: "POST",
      body: JSON.stringify({ type, note }),
    });
    await relayAuthFailure(response);

    if (!response.ok && ![404, 405, 501].includes(response.status)) {
      const backendPayload = (await response.clone().json().catch(() => null)) as { message?: string; error?: string } | null;
      const backendText = await response.text().catch(() => "");
      return jsonError(
        backendPayload?.message || backendPayload?.error || backendText || "Nao foi possivel registar o problema.",
        response.status
      );
    }
  } catch {
  }

  addDeliveryIssue(Number(id), { type, note });

  return NextResponse.json({
    ok: true,
    type,
    note,
  });
}
