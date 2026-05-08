import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, relayAuthFailure } from "@/app/api/admin/_utils";

export async function PUT(request: NextRequest) {
  const body: unknown = await request.json();
  const response = await fetchBackend(request, "/admin/categories/reorder", {
    method: "PUT",
    body: JSON.stringify(body),
  });
  await relayAuthFailure(response);

  if (!response.ok) {
    return jsonError("Não foi possível reordenar categorias.", response.status);
  }

  return new NextResponse(null, { status: 204 });
}
