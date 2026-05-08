import { NextRequest, NextResponse } from "next/server";

type ExportOrder = {
  id: number;
  number: string;
  customer: string;
  type: string;
  totalAmount: number;
  uiStatus: string;
  queueStatus?: string;
  customerStage?: string;
  priorityLabel: string;
  createdAt: string;
  sourceStore: string;
};

function escapeCsv(value: string | number) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const searchParams = new URLSearchParams(url.search);
  searchParams.set("page", "0");
  searchParams.set("size", "500");

  const sourceUrl = new URL(`/api/admin/orders?${searchParams.toString()}`, request.url);
  const response = await fetch(sourceUrl, {
    headers: {
      authorization: request.headers.get("authorization") ?? "",
      cookie: request.headers.get("cookie") ?? "",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json({ message: "Não foi possível exportar pedidos." }, { status: response.status });
  }

  const payload = (await response.json()) as { content?: ExportOrder[] };
  const rows = payload.content ?? [];

  const csv = [
    ["Pedido", "Cliente", "Tipo", "Valor MZN", "Fila", "Estado cliente", "Estado interno", "Prioridade", "Data", "Loja"],
    ...rows.map((row) => [
      row.number,
      row.customer,
      row.type,
      row.totalAmount,
      row.queueStatus ?? "",
      row.customerStage ?? "",
      row.uiStatus,
      row.priorityLabel,
      row.createdAt,
      row.sourceStore,
    ]),
  ]
    .map((line) => line.map(escapeCsv).join(","))
    .join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-export.csv"`,
    },
  });
}
