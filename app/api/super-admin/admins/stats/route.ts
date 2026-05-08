import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";
import { computeManagedAdminStats, mapManagedAdminsPage } from "@/app/api/super-admin/admins/_shared";

export async function GET(request: NextRequest) {
  let response: Response;

  try {
    response = await fetchBackend(request, "/super-admin/admins");
  } catch {
    return jsonError("Backend inacessivel.", 502);
  }

  await relayAuthFailure(response);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    return jsonError(payload?.message || "Nao foi possivel carregar as estatisticas dos administradores.", response.status);
  }

  const payload = await parseBackendJson<unknown>(response);
  return NextResponse.json(computeManagedAdminStats(mapManagedAdminsPage(payload).content));
}
