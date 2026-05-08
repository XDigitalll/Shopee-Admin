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
  const page = src.get("page") ?? "0";
  const size = src.get("size") ?? "8";

  let response: Response;
  try {
    response = await fetchBackend(
      request,
      `/admin/orders/filters?userId=${encodeURIComponent(id)}&page=${encodeURIComponent(page)}&size=${encodeURIComponent(size)}`
    );
  } catch {
    return jsonError("Backend inacessivel.", 502);
  }

  await relayAuthFailure(response);
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    return jsonError(payload?.message || "Erro ao carregar pedidos.", response.status);
  }

  const payload = await parseBackendJson<BackendOrdersPage>(response);

  return NextResponse.json({
    content: (payload?.content ?? []).map((order) => ({
      id: Number(order.id ?? 0),
      type: order.type ?? "INTERNAL",
      sourceStore: order.sourceStore ?? null,
      totalAmount: Number(order.totalAmount ?? 0),
      status: order.status ?? "UNDER_REVIEW",
      orderDate: order.orderDate ?? null,
    })),
    totalPages: Number(payload?.totalPages ?? 1),
    totalElements: Number(payload?.totalElements ?? 0),
    page: Number(payload?.number ?? page),
    size: Number(payload?.size ?? size),
  });
}
