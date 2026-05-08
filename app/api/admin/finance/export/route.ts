import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

type BackendStats = {
  totalRevenue?: number;
  todayRevenue?: number;
  totalOrders?: number;
  totalCommission?: number;
  totalDelivery?: number;
};

type BackendTransaction = {
  orderNumber?: string;
  customerName?: string;
  amount?: number;
  method?: string;
  status?: string;
  date?: string;
};

function escapeCsv(value: string | number) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

export async function GET(request: NextRequest) {
  const period = new URL(request.url).searchParams.get("period") ?? "month";

  const [statsResponse, transactionsResponse] = await Promise.all([
    fetchBackend(request, `/admin/finance/stats?period=${period}`),
    fetchBackend(request, `/admin/finance/transactions?period=${period}&page=0`),
  ]);

  await relayAuthFailure(statsResponse);

  if (!statsResponse.ok && !transactionsResponse.ok) {
    return jsonError("Nao foi possivel exportar o relatorio financeiro.", statsResponse.status);
  }

  const stats = statsResponse.ok
    ? ((await parseBackendJson<BackendStats>(statsResponse)) ?? {})
    : {};
  const transactions = transactionsResponse.ok
    ? ((await parseBackendJson<BackendTransaction[]>(transactionsResponse)) ?? [])
    : [];

  const summaryRows = [
    ["Periodo", period],
    ["Receita total", Number(stats.totalRevenue ?? 0)],
    ["Receita hoje", Number(stats.todayRevenue ?? 0)],
    ["Pedidos pagos", Number(stats.totalOrders ?? 0)],
    ["Comissoes", Number(stats.totalCommission ?? 0)],
    ["Entregas", Number(stats.totalDelivery ?? 0)],
  ];

  const lines = [
    "Relatorio financeiro XDigital",
    "",
    "Resumo,Valor",
    ...summaryRows.map(([label, value]) => `${escapeCsv(label)},${escapeCsv(value)}`),
    "",
    "Transaccoes recentes",
    "Pedido,Cliente,Valor,Metodo,Estado,Data",
    ...transactions.map((tx) =>
      [
        tx.orderNumber ?? "",
        tx.customerName ?? "",
        Number(tx.amount ?? 0),
        tx.method ?? "",
        tx.status ?? "",
        tx.date ?? "",
      ]
        .map(escapeCsv)
        .join(","),
    ),
  ];

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="relatorio-financeiro-${period}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
