import { NextRequest, NextResponse } from "next/server";
import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  let response: Response;
  try {
    response = await fetchBackend(request, `/admin/banners/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: await request.text(),
    });
  } catch {
    return jsonError("Backend inacessível.", 502);
  }

  await relayAuthFailure(response);

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    return jsonError(payload?.message || "Erro ao atualizar banner.", response.status);
  }

  return NextResponse.json(await parseBackendJson(response));
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  let response: Response;
  try {
    response = await fetchBackend(request, `/admin/banners/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  } catch {
    return jsonError("Backend inacessível.", 502);
  }

  await relayAuthFailure(response);

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    return jsonError(payload?.message || "Erro ao eliminar banner.", response.status);
  }

  return new NextResponse(null, { status: 204 });
}
