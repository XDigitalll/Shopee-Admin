import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, relayAuthFailure } from "@/app/api/admin/_utils";
import { saveDeliveryAssignment, saveDeliveryAssignmentSnapshot } from "@/lib/admin/delivery-meta-store";

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

  saveDeliveryAssignment(Number(id), {
    driverId,
    driverName: assignedDriver?.name ?? "Estafeta",
    driverEmail: assignedDriver?.email ?? null,
    driverPhone: assignedDriver?.phone ?? null,
  });

  const snapshot = await fetchPendingSnapshot(request, Number(id)).catch(() => null);
  if (snapshot) {
    saveDeliveryAssignmentSnapshot(Number(id), {
      ...snapshot,
      driverId,
      driverName: assignedDriver?.name ?? "Estafeta",
      driverEmail: assignedDriver?.email ?? null,
      driverPhone: assignedDriver?.phone ?? null,
      assignedDriverId: driverId,
      assignedDriverName: assignedDriver?.name ?? "Estafeta",
      assignedDriverEmail: assignedDriver?.email ?? null,
      assignedDriverPhone: assignedDriver?.phone ?? null,
    });
  }

  return NextResponse.json({ ok: true, driverId, driver: assignedDriver });
}

async function fetchPendingSnapshot(request: NextRequest, orderId: number) {
  const response = await fetchBackend(request, "/admin/delivery/pending");
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  const list = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { content?: unknown[] }).content)
      ? (payload as { content: unknown[] }).content
      : [];

  const found = list.find((item) => item && typeof item === "object" && Number((item as { id?: unknown }).id) === orderId);
  return found && typeof found === "object" ? (found as Record<string, unknown>) : null;
}
