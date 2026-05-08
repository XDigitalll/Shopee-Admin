import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body: unknown = await request.json();
  const response = await fetchBackend(request, `/admin/categories/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  await relayAuthFailure(response);

  if (!response.ok) {
    const error = await response.text();
    return jsonError(error || "Não foi possível actualizar categoria.", response.status);
  }

  const data = await parseBackendJson<unknown>(response);
  return NextResponse.json(data);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const response = await fetchBackend(request, `/admin/categories/${id}`, { method: "DELETE" });
  await relayAuthFailure(response);

  if (!response.ok) {
    const error = await response.text();
    return jsonError(error || "Não foi possível apagar categoria.", response.status);
  }

  return new NextResponse(null, { status: 204 });
}
