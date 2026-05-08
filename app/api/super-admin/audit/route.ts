import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";
import type { AuditLogsPageResponse } from "@/lib/admin/types";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const backendParams = new URLSearchParams();

  for (const key of ["orderCode", "customerCode", "performedBy", "action", "role", "page", "size"]) {
    const value = searchParams.get(key);
    if (value) {
      backendParams.set(key, value);
    }
  }

  let response: Response;
  try {
    response = await fetchBackend(request, `/admin/orders/audit?${backendParams.toString()}`);
  } catch {
    return jsonError("Backend inacessivel. Confirma se o Spring Boot esta a correr na porta 8080.", 502);
  }

  await relayAuthFailure(response);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
    return jsonError(payload?.message || payload?.error || "Nao foi possivel carregar a auditoria.", response.status);
  }

  const payload = await parseBackendJson<AuditLogsPageResponse>(response);
  return NextResponse.json({
    content: payload?.content ?? [],
    totalElements: Number(payload?.totalElements ?? 0),
    totalPages: Number(payload?.totalPages ?? 1),
    number: Number(payload?.number ?? 0),
    size: Number(payload?.size ?? 25),
  });
}
