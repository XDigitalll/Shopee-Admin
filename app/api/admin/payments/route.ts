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

const paysuiteFeePercentage = Number(process.env.PAYSUITE_FEE_PERCENTAGE ?? "6");

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
  const amount = Number(item.amount ?? 0);
  const provider = item.provider ?? null;
  const providerReference = item.providerReference ?? null;
  const status = String(item.status ?? "PENDING") as AdminPaymentListItem["status"];
  const providerFee = resolveProviderFee(item, amount, provider, providerReference, status);
  const providerNetAmount = resolveProviderNetAmount(item, amount, providerFee);
  const providerFeePercentage = resolveProviderFeePercentage(item, amount, providerFee);

  return {
    id: Number(item.id ?? 0),
    status,
    receiptSubmitted: Boolean(item.receiptSubmitted ?? false),
    orderId: Number(item.orderId ?? 0),
    orderNumber: String(item.orderNumber ?? ""),
    customerId: item.customerId == null ? null : Number(item.customerId),
    customerName: String(item.customerName ?? "Cliente"),
    customerEmail: item.customerEmail ?? null,
    customerPhone: item.customerPhone ?? null,
    method: item.method ?? null,
    provider,
    providerReference,
    providerStatus: item.providerStatus ?? null,
    checkoutUrl: item.checkoutUrl ?? null,
    expectedAmount: item.expectedAmount == null ? null : Number(item.expectedAmount),
    providerFee,
    providerNetAmount,
    providerFeePercentage,
    providerTransactionType: item.providerTransactionType ?? null,
    amount,
    submittedAt: item.submittedAt ?? null,
    reviewedAt: item.reviewedAt ?? null,
    paymentDate: item.paymentDate ?? null,
    transactionId: item.transactionId ?? null,
    payerName: item.payerName ?? null,
    payerPhone: item.payerPhone ?? null,
    notes: item.notes ?? null,
    adminNote: item.adminNote ?? null,
    orderItems: item.orderItems ?? [],
  };
}

function isPaySuitePayment(provider: unknown, providerReference: unknown) {
  return String(provider ?? "").toUpperCase() === "PAYSUITE" || Boolean(providerReference);
}

function isConfirmedStatus(status: AdminPaymentListItem["status"]) {
  return status === "VALIDATED" || status === "SUCCESS";
}

function resolveProviderFee(
  item: Partial<AdminPaymentListItem>,
  amount: number,
  provider: unknown,
  providerReference: unknown,
  status: AdminPaymentListItem["status"],
) {
  const rawFee = item.providerFee == null ? null : Number(item.providerFee);
  if (rawFee != null && rawFee > 0) return rawFee;

  const rawNet = item.providerNetAmount == null ? null : Number(item.providerNetAmount);
  if (rawNet != null && rawNet > 0 && amount > rawNet) {
    return roundMoney(amount - rawNet);
  }

  if (amount > 0 && isConfirmedStatus(status) && isPaySuitePayment(provider, providerReference) && paysuiteFeePercentage > 0) {
    return roundMoney(amount * (paysuiteFeePercentage / 100));
  }

  return rawFee;
}

function resolveProviderNetAmount(item: Partial<AdminPaymentListItem>, amount: number, providerFee: number | null) {
  const rawNet = item.providerNetAmount == null ? null : Number(item.providerNetAmount);
  if (rawNet != null && rawNet > 0 && (providerFee == null || providerFee <= 0)) return rawNet;
  if (providerFee != null && providerFee > 0) return roundMoney(Math.max(amount - providerFee, 0));
  return rawNet;
}

function resolveProviderFeePercentage(
  item: Partial<AdminPaymentListItem>,
  amount: number,
  providerFee: number | null,
) {
  const rawPercentage = item.providerFeePercentage == null ? null : Number(item.providerFeePercentage);
  if (rawPercentage != null && rawPercentage > 0) return rawPercentage;
  if (amount > 0 && providerFee != null && providerFee > 0) {
    return Number(((providerFee / amount) * 100).toFixed(4));
  }
  return rawPercentage;
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
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
