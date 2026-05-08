import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

type BackendChartItem = {
  date?: string;
  revenue?: number;
  commission?: number;
  orders?: number;
};

const TODAY = new Date().toISOString().slice(0, 10);

function formatLabel(dateStr: string) {
  try {
    return new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "short" }).format(
      new Date(dateStr + "T00:00:00")
    );
  } catch {
    return dateStr;
  }
}

export async function GET(request: NextRequest) {
  const period = new URL(request.url).searchParams.get("period") ?? "month";
  const response = await fetchBackend(request, `/admin/finance/chart?period=${period}`);
  await relayAuthFailure(response);

  if (!response.ok) {
    return jsonError("Não foi possível carregar dados do gráfico.", response.status);
  }

  const raw = await parseBackendJson<BackendChartItem[]>(response);

  const data = raw.map((item) => ({
    date: item.date ?? "",
    label: formatLabel(item.date ?? ""),
    revenue: Number(item.revenue ?? 0),
    commission: Number(item.commission ?? 0),
    isToday: item.date === TODAY,
  }));

  return NextResponse.json(data);
}
