"use client";

import {
  ADMIN_AUTH_CHANGE_EVENT,
  ADMIN_REFRESH_COOKIE,
  ADMIN_REFRESH_TOKEN_KEY,
  ADMIN_SESSION_COOKIE,
  ADMIN_TOKEN_KEY,
} from "@/lib/admin/session";
import { emitAdminDataChanged } from "@/lib/admin/realtime";

type ApiOptions = RequestInit & {
  token?: string | null;
};

type AdminSessionPayload = {
  token: string;
  refreshToken: string;
};

const GET_CACHE_TTL_MS = 5_000;

let refreshPromise: Promise<AdminSessionPayload | null> | null = null;
const inFlightGetRequests = new Map<string, Promise<unknown>>();
const resolvedGetCache = new Map<string, { expiresAt: number; value: unknown }>();

function emitAuthChange() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(ADMIN_AUTH_CHANGE_EVENT));
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=86400; SameSite=Lax`;
}

function clearAdminGetCache() {
  inFlightGetRequests.clear();
  resolvedGetCache.clear();
}

export function persistAdminSession(token: string, refreshToken: string) {
  window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
  window.localStorage.setItem(ADMIN_REFRESH_TOKEN_KEY, refreshToken);
  writeCookie(ADMIN_SESSION_COOKIE, token);
  writeCookie(ADMIN_REFRESH_COOKIE, refreshToken);
  clearAdminGetCache();
  emitAuthChange();
}

export function persistAdminToken(token: string) {
  const refreshToken = getStoredAdminRefreshToken();
  if (!refreshToken) {
    return;
  }

  persistAdminSession(token, refreshToken);
}

export function clearAdminSession() {
  window.localStorage.removeItem(ADMIN_TOKEN_KEY);
  window.localStorage.removeItem(ADMIN_REFRESH_TOKEN_KEY);
  document.cookie = `${ADMIN_SESSION_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  document.cookie = `${ADMIN_REFRESH_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  clearAdminGetCache();
  emitAuthChange();
}

export function getStoredAdminToken() {
  return typeof window === "undefined" ? null : window.localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function getStoredAdminRefreshToken() {
  return typeof window === "undefined"
    ? null
    : window.localStorage.getItem(ADMIN_REFRESH_TOKEN_KEY);
}

export async function refreshAdminSession() {
  if (typeof window === "undefined") {
    return null;
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  const refreshToken = getStoredAdminRefreshToken();
  if (!refreshToken) {
    clearAdminSession();
    return null;
  }

  refreshPromise = fetch("/api/admin/auth/refresh", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
  })
    .then(async (response) => {
      const payload = (await response.json().catch(() => null)) as AdminSessionPayload | null;
      if (!response.ok || !payload?.token || !payload.refreshToken) {
        clearAdminSession();
        return null;
      }

      persistAdminSession(payload.token, payload.refreshToken);
      return payload;
    })
    .catch(() => {
      clearAdminSession();
      return null;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

async function requestWithToken(
  path: string,
  options: ApiOptions = {},
  tokenOverride?: string | null
) {
  const headers = new Headers(options.headers);
  const token = tokenOverride ?? options.token ?? getStoredAdminToken();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(path, {
    ...options,
    headers,
    cache: "no-store",
  });
}

export async function adminApiFetch<T>(path: string, options: ApiOptions = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const canUseGetCache =
    method === "GET" &&
    path !== "/api/admin/auth/login" &&
    path !== "/api/admin/auth/logout" &&
    path !== "/api/admin/auth/refresh";

  const execute = async () => {
    let response = await requestWithToken(path, options);

    if (
      response.status === 401 &&
      path !== "/api/admin/auth/login" &&
      path !== "/api/admin/auth/refresh" &&
      getStoredAdminRefreshToken()
    ) {
      const refreshed = await refreshAdminSession();
      if (refreshed?.token) {
        response = await requestWithToken(path, options, refreshed.token);
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

  const token = options.token ?? getStoredAdminToken();
  const cacheKey = `${token ?? "anonymous"}::${path}`;
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
