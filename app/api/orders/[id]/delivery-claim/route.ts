import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, relayAuthFailure } from "@/app/api/admin/_utils";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type AssignedDriverPayload = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  let response: Response;
  try {
    response = await fetchBackend(request, `/admin/delivery/pending/${id}/claim`, {
      method: "POST",
    });
    await relayAuthFailure(response);
  } catch {
    return jsonError("Backend inacessivel. Confirma se o Spring Boot esta a correr na porta 8080.", 502);
  }

  if (!response.ok) {
    const backendPayload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
    return jsonError(backendPayload?.message || backendPayload?.error || "Nao foi possivel pegar esta encomenda.", response.status);
  }

  const assignedDriver = (await response.json().catch(() => null)) as AssignedDriverPayload | null;
  const driverId = assignedDriver?.id ?? "";

  return NextResponse.json({ ok: true, driverId, driver: assignedDriver });
}
