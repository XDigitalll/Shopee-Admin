import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";
import type { WeeklyRevenueItem } from "@/lib/admin/types";

type DailySalesDTO = {
  date: string;
  total: number;
};

export async function GET(request: NextRequest) {
  const response = await fetchBackend(request, "/admin/dashboard/sales-last-7-days");
  await relayAuthFailure(response);

  if (!response.ok) {
    return jsonError("Não foi possível carregar o gráfico semanal.", response.status);
  }

  const payload = await parseBackendJson<DailySalesDTO[]>(response);
  const today = new Date().toISOString().slice(0, 10);

  const result: WeeklyRevenueItem[] = (payload ?? []).map((item) => ({
    date: item.date,
    label: new Intl.DateTimeFormat("pt-PT", { weekday: "short" }).format(new Date(item.date)),
    total: Number(item.total ?? 0),
    isToday: item.date === today,
  }));

  return NextResponse.json(result);
}
