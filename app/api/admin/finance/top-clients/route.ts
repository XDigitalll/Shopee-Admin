import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

type BackendClient = {
  userId?: number;
  name?: string;
  email?: string;
  totalSpent?: number;
  orderCount?: number;
};

export async function GET(request: NextRequest) {
  const response = await fetchBackend(request, "/admin/finance/top-clients");
  await relayAuthFailure(response);

  if (!response.ok) {
    return jsonError("Não foi possível carregar top clientes.", response.status);
  }

  const raw = await parseBackendJson<BackendClient[]>(response);

  const data = raw.map((c, index) => ({
    rank: index + 1,
    name: c.name ?? c.email ?? "Cliente",
    orderCount: Number(c.orderCount ?? 0),
    totalSpent: Number(c.totalSpent ?? 0),
  }));

  return NextResponse.json(data);
}
