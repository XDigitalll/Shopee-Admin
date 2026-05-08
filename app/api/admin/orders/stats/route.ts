import { NextRequest, NextResponse } from "next/server";

import {
  fetchBackend,
  jsonError,
  parseBackendJson,
  relayAuthFailure,
} from "@/app/api/admin/_utils";
import { resolveOrderQueueStatus } from "@/lib/admin/order-status";
import type { OrdersStatsResponse } from "@/lib/admin/types";

type BackendPage<T> = {
  content?: T[];
};

type BackendOrder = {
  status?: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const response = await fetchBackend(request, "/admin/orders?page=0&size=250");
    await relayAuthFailure(response);

    if (!response.ok) {
      return jsonError("Nao foi possivel carregar os totais de pedidos.", response.status);
    }

    const payload = await parseBackendJson<BackendPage<BackendOrder>>(response);
    const orders = payload?.content ?? [];

    const result = orders.reduce<OrdersStatsResponse>(
      (stats, order) => {
        const queueStatus = resolveOrderQueueStatus(order.status ?? "UNDER_REVIEW");
        stats.total += 1;

        if (queueStatus === "ANALYSIS") stats.analysis += 1;
        if (queueStatus === "PAYMENT") stats.payment += 1;
        if (queueStatus === "EXECUTION") stats.execution += 1;
        if (queueStatus === "COMPLETED") stats.completed += 1;
        if (queueStatus === "CANCELLED") stats.cancelled += 1;

        return stats;
      },
      {
        total: 0,
        analysis: 0,
        payment: 0,
        execution: 0,
        completed: 0,
        cancelled: 0,
      }
    );

    return NextResponse.json(result);
  } catch (error) {
    const status = Number(error instanceof Error ? error.message : 500);
    return jsonError("Nao foi possivel carregar os totais de pedidos.", Number.isFinite(status) ? status : 500);
  }
}
