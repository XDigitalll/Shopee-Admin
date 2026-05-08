import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

type BackendMethod = {
  method?: string;
  amount?: number;
  percentage?: number;
  count?: number;
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

export async function GET(request: NextRequest) {
  const response = await fetchBackend(request, "/admin/finance/payment-methods");
  await relayAuthFailure(response);

  if (!response.ok) {
    return jsonError("Não foi possível carregar métodos de pagamento.", response.status);
  }

  const raw = await parseBackendJson<BackendMethod[]>(response);

  const data = raw.map((m) => ({
    method: METHOD_LABELS[m.method ?? ""] ?? (m.method ?? ""),
    amount: Number(m.amount ?? 0),
    percentage: Number(m.percentage ?? 0),
  }));

  return NextResponse.json(data);
}
