"use client";

import { ADMIN_AUTH_CHANGE_EVENT } from "@/lib/admin/session";
import { emitAdminDataChanged } from "@/lib/admin/realtime";
import { getCsrfToken, XSRF_HEADER } from "@/lib/admin/csrf";

type ApiOptions = RequestInit;

const GET_CACHE_TTL_MS = 5_000;

let refreshPromise: Promise<boolean> | null = null;
const inFlightGetRequests = new Map<string, Promise<unknown>>();
const resolvedGetCache = new Map<string, { expiresAt: number; value: unknown }>();

function emitAuthChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ADMIN_AUTH_CHANGE_EVENT));
}

function clearAdminGetCache() {
  inFlightGetRequests.clear();
  resolvedGetCache.clear();
}

// Session is managed server-side via httpOnly cookies — these are intentional no-ops.
export function persistAdminSession(_token: string, _refreshToken: string) {
  clearAdminGetCache();
  emitAuthChange();
}

export function persistAdminToken(_token: string) {}

export function clearAdminSession() {
  clearAdminGetCache();
  emitAuthChange();
}

// Token is in an httpOnly cookie — never accessible to JS.
export function getStoredAdminToken(): null {
  return null;
}

export function getStoredAdminRefreshToken(): null {
  return null;
}

export async function refreshAdminSession(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  if (refreshPromise) return refreshPromise;

  const refreshHeaders: Record<string, string> = {};
  const csrfToken = getCsrfToken();
  if (csrfToken) refreshHeaders[XSRF_HEADER] = csrfToken;

  refreshPromise = fetch("/api/admin/auth/refresh", {
    method: "POST",
    headers: refreshHeaders,
    cache: "no-store",
  })
    .then((response) => {
      if (!response.ok) {
        clearAdminSession();
        return false;
      }
      clearAdminGetCache();
      return true;
    })
    .catch(() => {
      clearAdminSession();
      return false;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

async function executeRequest(path: string, options: ApiOptions = {}) {
  const headers = new Headers(options.headers);

  const isFormDataBody = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (options.body && !headers.has("Content-Type") && !isFormDataBody) {
    headers.set("Content-Type", "application/json");
  }

  // Attach CSRF token for all state-mutating requests
  const method = String(options.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers.set(XSRF_HEADER, csrfToken);
    }
  }

  return fetch(path, { ...options, headers, cache: "no-store" });
}

export async function adminApiFetch<T>(path: string, options: ApiOptions = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const canUseGetCache =
    method === "GET" &&
    path !== "/api/admin/auth/login" &&
    path !== "/api/admin/auth/logout" &&
    path !== "/api/admin/auth/refresh" &&
    path !== "/api/admin/auth/me";

  const execute = async () => {
    let response = await executeRequest(path, options);

    if (
      response.status === 401 &&
      path !== "/api/admin/auth/login" &&
      path !== "/api/admin/auth/refresh"
    ) {
      const refreshed = await refreshAdminSession();
      if (refreshed) {
        response = await executeRequest(path, options);
      }
    }

    if (response.status === 204) {
      return null as T;
    }

    const payload = await response.json().catch(() => null);

    if (response.status === 401 && path !== "/api/admin/auth/login") {
      clearAdminSession();
      window.location.href = "/admin/login";
      throw new Error("Sessao expirada.");
    }

    if (response.status === 403) {
      window.location.href = "/admin/unauthorized";
      throw new Error("Sem permissao.");
    }

    if (!response.ok) {
      const message =
        (payload &&
          typeof payload === "object" &&
          "message" in payload &&
          typeof payload.message === "string" &&
          payload.message) ||
        "Nao foi possivel concluir a operacao.";
      throw new Error(message);
    }

    return payload as T;
  };

  if (!canUseGetCache) {
    const payload = await execute();
    clearAdminGetCache();
    emitAdminDataChanged();
    return payload;
  }

  const cacheKey = path;
  const now = Date.now();
  const cachedValue = resolvedGetCache.get(cacheKey);

  if (cachedValue && cachedValue.expiresAt > now) {
    return cachedValue.value as T;
  }

  const existingRequest = inFlightGetRequests.get(cacheKey);
  if (existingRequest) {
    return (await existingRequest) as T;
  }

  const requestPromise = execute()
    .then((payload) => {
      resolvedGetCache.set(cacheKey, {
        expiresAt: Date.now() + GET_CACHE_TTL_MS,
        value: payload,
      });
      return payload;
    })
    .finally(() => {
      inFlightGetRequests.delete(cacheKey);
    });

  inFlightGetRequests.set(cacheKey, requestPromise);
  return (await requestPromise) as T;
}
