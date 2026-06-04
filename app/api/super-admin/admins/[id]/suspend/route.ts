import { NextRequest } from "next/server";

import { fetchBackend, jsonError, relayAuthFailure } from "@/app/api/admin/_utils";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const incoming = await request.json().catch(() => null);
  const response = await fetchBackend(request, `/super-admin/admins/${encodeURIComponent(id)}/suspend`, {
    method: "PUT",
    body: JSON.stringify(incoming ?? {}),
  });

  await relayAuthFailure(response);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    return jsonError(payload?.message || "Nao foi possivel suspender o administrador.", response.status);
  }

  return Response.json(await response.json().catch(() => null));
}
