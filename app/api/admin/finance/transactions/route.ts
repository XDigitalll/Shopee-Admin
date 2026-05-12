import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

type BackendTransaction = {
  id?: number;
  orderNumber?: string;
  customerName?: string;
  method?: string;
  amount?: number;
  commission?: number | null;
  commissionAmount?: number | null;
  status?: string;
};

const METHOD_LABELS: Record<string, string> = {
  MPESA: "M-Pesa",
  EMOLA: "e-Mola",
  VISA: "Visa",
  MASTERCARD: "Mastercard",
  PAYPAL: "PayPal",
  BANK_TRANSFER: "Transferência",
  CASH_ON_DELIVERY: "Entrega",
};

function normalizeStatus(s: string | undefined): "PAID" | "PENDING" | "REFUNDED" {
  if (s === "APPROVED") return "PAID";
  if (s === "REFUNDED") return "REFUNDED";
  return "PENDING";
}

export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams;
  const period = sp.get("period") ?? "month";
  const page = sp.get("page") ?? "0";
  const response = await fetchBackend(
    request,
    `/admin/finance/transactions?period=${period}&page=${page}`
  );
  await relayAuthFailure(response);

  if (!response.ok) {
    return jsonError("Não foi possível carregar transacções.", response.status);
  }

  const raw = await parseBackendJson<BackendTransaction[]>(response);

  const data = raw.map((tx) => ({
    id: String(tx.id ?? Math.random()),
    orderNumber: tx.orderNumber ?? "",
    customer: tx.customerName ?? "",
    totalAmount: Number(tx.amount ?? 0),
    commission: Number(tx.commission ?? tx.commissionAmount ?? 0),
    paymentMethod: METHOD_LABELS[tx.method ?? ""] ?? (tx.method ?? ""),
    status: normalizeStatus(tx.status),
  }));

  return NextResponse.json(data);
}
