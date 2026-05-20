import { NextRequest, NextResponse } from "next/server";

import {
  fetchBackend,
  jsonError,
  parseBackendJson,
  relayAuthFailure,
} from "@/app/api/admin/_utils";
import type { AdminPaymentListItem, AdminPaymentsPageResponse } from "@/lib/admin/types";

type BackendPage<T> = {
  content?: T[];
  number?: number;
  size?: number;
  totalElements?: number;
  totalPages?: number;
};

function normalizePagePayload(
  payload: BackendPage<Partial<AdminPaymentListItem>> | Array<Partial<AdminPaymentListItem>> | null,
) {
  if (Array.isArray(payload)) {
    const content = payload.map(mapItem);
    return {
      content,
      page: 0,
      size: content.length || 10,
      totalElements: content.length,
      totalPages: content.length > 0 ? 1 : 0,
    } satisfies AdminPaymentsPageResponse;
  }

  return {
    content: (payload?.content ?? []).map(mapItem),
    page: Number(payload?.number ?? 0),
    size: Number(payload?.size ?? 10),
    totalElements: Number(payload?.totalElements ?? 0),
    totalPages: Number(payload?.totalPages ?? 0),
  } satisfies AdminPaymentsPageResponse;
}

function mapItem(item: Partial<AdminPaymentListItem>): AdminPaymentListItem {
  return {
    id: Number(item.id ?? 0),
    status: String(item.status ?? "PENDING") as AdminPaymentListItem["status"],
    receiptSubmitted: Boolean(item.receiptSubmitted ?? false),
    orderId: Number(item.orderId ?? 0),
    orderNumber: String(item.orderNumber ?? ""),
    customerId: item.customerId == null ? null : Number(item.customerId),
    customerName: String(item.customerName ?? "Cliente"),
    customerEmail: item.customerEmail ?? null,
    customerPhone: item.customerPhone ?? null,
    method: item.method ?? null,
    amount: Number(item.amount ?? 0),
    submittedAt: item.submittedAt ?? null,
    reviewedAt: item.reviewedAt ?? null,
    paymentDate: item.paymentDate ?? null,
    transactionId: item.transactionId ?? null,
    payerName: item.payerName ?? null,
    payerPhone: item.payerPhone ?? null,
    notes: item.notes ?? null,
    adminNote: item.adminNote ?? null,
    orderItems: item.orderItems ?? [],
    allowedActions: item.allowedActions,
  };
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const searchParams = new URLSearchParams();

  for (const key of ["status", "method", "period", "search", "page", "size"]) {
    const value = url.searchParams.get(key);
    if (value) {
      searchParams.set(key, value);
    }
  }

  const response = await fetchBackend(request, `/admin/payments?${searchParams.toString()}`);
  await relayAuthFailure(response);

  if (!response.ok) {
    return jsonError("Não foi possível carregar a lista de pagamentos.", response.status);
  }

  const payload = await parseBackendJson<
    BackendPage<Partial<AdminPaymentListItem>> | Array<Partial<AdminPaymentListItem>>
  >(response);
  const result = normalizePagePayload(payload);

  return NextResponse.json(result);
}
