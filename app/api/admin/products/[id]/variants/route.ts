import { NextRequest, NextResponse } from "next/server";
import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  let response: Response;
  try {
    response = await fetchBackend(request, `/admin/products/${id}/variants`);
  } catch {
    return jsonError("Backend inacessivel.", 502);
  }
  await relayAuthFailure(response);
  if (!response.ok) return jsonError("Nao foi possivel listar variantes.", response.status);
  return NextResponse.json(await parseBackendJson(response));
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  let response: Response;
  try {
    response = await fetchBackend(request, `/admin/products/${id}/variants`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return jsonError("Backend inacessivel.", 502);
  }
  await relayAuthFailure(response);
  if (!response.ok) return jsonError("Nao foi possivel criar variante.", response.status);
  return NextResponse.json(await parseBackendJson(response));
}
