import { NextRequest, NextResponse } from "next/server";
import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  let response: Response;
  try {
    response = await fetchBackend(request, `/admin/users/${id}/notes`);
  } catch {
    return jsonError("Backend inacessível.", 502);
  }
  await relayAuthFailure(response);
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    return jsonError(payload?.message || "Erro ao carregar notas.", response.status);
  }
  return NextResponse.json(await parseBackendJson(response));
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  let response: Response;
  try {
    response = await fetchBackend(request, `/admin/users/${id}/notes`, {
      method: "POST",
      body: await request.text(),
    });
  } catch {
    return jsonError("Backend inacessível.", 502);
  }
  await relayAuthFailure(response);
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    return jsonError(payload?.message || "Erro ao guardar nota.", response.status);
  }
  return NextResponse.json(await parseBackendJson(response));
}
