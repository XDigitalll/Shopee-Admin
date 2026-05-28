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

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const payload = (await request.json().catch(() => null)) as { driverId?: string; driverUserId?: number } | null;
  const driverId = typeof payload?.driverId === "string" ? payload.driverId.trim() : "";
  const parsedDriverUserId = Number(driverId);
  const driverUserId = typeof payload?.driverUserId === "number" && Number.isFinite(payload.driverUserId)
    ? payload.driverUserId
    : parsedDriverUserId;

  if (!driverId) {
    return jsonError("Seleciona um estafeta antes de atribuir a entrega.", 400);
  }

  let response: Response;
  try {
    response = await fetchBackend(request, `/admin/orders/${id}/assign-driver`, {
      method: "PUT",
      body: JSON.stringify({
        driverId,
        driverUserId: Number.isFinite(driverUserId) ? driverUserId : undefined,
      }),
    });
    await relayAuthFailure(response);
  } catch {
    return jsonError("Backend inacessivel. Confirma se o Spring Boot esta a correr na porta 8080.", 502);
  }

  if (!response.ok) {
    const backendPayload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
    return jsonError(backendPayload?.message || backendPayload?.error || "Nao foi possivel atribuir o estafeta.", response.status);
  }

  const assignedDriver = (await response.json().catch(() => null)) as AssignedDriverPayload | null;
  const assignedDriverId = assignedDriver?.id ?? driverId;

  return NextResponse.json({ ok: true, driverId: assignedDriverId, driver: assignedDriver });
}
