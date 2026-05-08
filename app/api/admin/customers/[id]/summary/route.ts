import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

type Ctx = { params: Promise<{ id: string }> };

type BackendOrdersPage = {
  content?: Array<{
    id?: number;
    type?: "INTERNAL" | "EXTERNAL" | null;
    sourceStore?: string | null;
    totalAmount?: number | null;
    status?: string | null;
    orderDate?: string | null;
  }>;
  totalPages?: number;
  totalElements?: number;
  number?: number;
  size?: number;
};

export async function GET(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const src = new URL(request.url).searchParams;
  const size = src.get("size") ?? "5";

  let ordersResponse: Response;
  let notesResponse: Response;
  try {
    [ordersResponse, notesResponse] = await Promise.all([
      fetchBackend(
        request,
        `/admin/orders/filters?userId=${encodeURIComponent(id)}&page=0&size=${encodeURIComponent(size)}`
      ),
      fetchBackend(request, `/admin/users/${id}/notes`),
    ]);
  } catch {
    return jsonError("Backend inacessível.", 502);
  }

  await Promise.all([relayAuthFailure(ordersResponse), relayAuthFailure(notesResponse)]);

  if (!ordersResponse.ok && !notesResponse.ok) {
    return jsonError("Erro ao carregar resumo do cliente.", ordersResponse.status || notesResponse.status);
  }

  const ordersPayload = ordersResponse.ok
    ? await parseBackendJson<BackendOrdersPage>(ordersResponse)
    : null;
  const notesPayload = notesResponse.ok
    ? await parseBackendJson<unknown[]>(notesResponse)
    : [];

  return NextResponse.json({
    orders: (ordersPayload?.content ?? []).map((order) => ({
      id: Number(order.id ?? 0),
      type: order.type ?? "INTERNAL",
      sourceStore: order.sourceStore ?? null,
      totalAmount: Number(order.totalAmount ?? 0),
      status: order.status ?? "UNDER_REVIEW",
      orderDate: order.orderDate ?? null,
    })),
    notes: notesPayload ?? [],
    totalPages: Number(ordersPayload?.totalPages ?? 1),
    totalElements: Number(ordersPayload?.totalElements ?? 0),
  });
}
