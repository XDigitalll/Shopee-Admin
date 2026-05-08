import { NextRequest, NextResponse } from "next/server";
import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

type Params = { params: Promise<{ id: string; videoId: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  const { id, videoId } = await params;
  const body = await request.json();
  let response: Response;
  try {
    response = await fetchBackend(request, `/admin/products/${id}/videos/${videoId}`, {
      method: "PUT",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return jsonError("Backend inacessivel.", 502);
  }
  await relayAuthFailure(response);
  if (!response.ok) return jsonError("Nao foi possivel actualizar video.", response.status);
  return NextResponse.json(await parseBackendJson(response));
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id, videoId } = await params;
  let response: Response;
  try {
    response = await fetchBackend(request, `/admin/products/${id}/videos/${videoId}`, {
      method: "DELETE",
    });
  } catch {
    return jsonError("Backend inacessivel.", 502);
  }
  await relayAuthFailure(response);
  if (!response.ok) return jsonError("Nao foi possivel remover video.", response.status);
  return new NextResponse(null, { status: 204 });
}
