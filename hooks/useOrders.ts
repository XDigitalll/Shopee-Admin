"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useAdminLiveRefresh } from "@/hooks/use-admin-live-refresh";
import { adminApiFetch } from "@/lib/admin/api-client";
import type {
  OrdersFilterState,
  OrdersPageResponse,
  OrdersStatsResponse,
} from "@/lib/admin/types";

const defaultFilters: OrdersFilterState = {
  status: "ALL",
  type: "ALL",
  period: "ALL",
  search: "",
  date: "",
  page: 0,
  size: 10,
};

export function useOrders(initial: Partial<OrdersFilterState> = {}) {
  const [filters, setFilters] = useState<OrdersFilterState>({
    ...defaultFilters,
    ...initial,
  });
  const [orders, setOrders] = useState<OrdersPageResponse | null>(null);
  const [stats, setStats] = useState<OrdersStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const lastRequestId = useRef(0);

  const loadOrdersData = useCallback(async (background = false) => {
    const requestId = ++lastRequestId.current;

    if (background) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const params = new URLSearchParams({
        status: filters.status,
        type: filters.type,
        period: filters.period,
        search: filters.search,
        date: filters.date,
        page: String(filters.page),
        size: String(filters.size),
      });

      const [ordersPayload, statsPayload] = await Promise.all([
        adminApiFetch<OrdersPageResponse>(`/api/admin/orders?${params.toString()}`),
        adminApiFetch<OrdersStatsResponse>("/api/admin/orders/stats"),
      ]);

      if (requestId !== lastRequestId.current) {
        return;
      }

      setOrders(ordersPayload);
      setStats(statsPayload);
      setError("");
    } catch (loadError) {
      if (requestId !== lastRequestId.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : "Nao foi possivel carregar pedidos.");
    } finally {
      if (requestId !== lastRequestId.current) {
        return;
      }

      if (background) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  }, [filters]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadOrdersData(false);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadOrdersData, refreshKey]);

  useAdminLiveRefresh(() => loadOrdersData(true), {
    intervalMs: 15_000,
    enabled: true,
    runOnMount: false,
    minIntervalMs: 5_000,
  });

  function setFilter<K extends keyof OrdersFilterState>(key: K, value: OrdersFilterState[K]) {
    setFilters((current) => ({
      ...current,
      [key]: value,
      page: key === "page" ? Number(value) : 0,
    }));
  }

  function setSearch(value: string) {
    setFilters((current) => ({
      ...current,
      search: value,
      page: 0,
    }));
  }

  function setPage(page: number) {
    setFilters((current) => ({
      ...current,
      page,
    }));
  }

  function refresh() {
    setRefreshKey((value) => value + 1);
  }

  return {
    filters,
    orders,
    stats,
    isLoading,
    isRefreshing,
    error,
    setFilter,
    setSearch,
    setPage,
    refresh,
  };
}
