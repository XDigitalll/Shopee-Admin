"use client";

import { ADMIN_AUTH_CHANGE_EVENT } from "@/lib/admin/session";
import { emitAdminDataChanged } from "@/lib/admin/realtime";
import { getCsrfToken, XSRF_HEADER } from "@/lib/admin/csrf";

type ApiOptions = RequestInit;

type ApiErrorPayload = {
  message?: unknown;
  error?: unknown;
  code?: unknown;
  details?: unknown;
};

export class ApiError extends Error {
  status?: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status?: number, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const GET_CACHE_TTL_MS = 5_000;

let refreshPromise: Promise<boolean> | null = null;
const inFlightGetRequests = new Map<string, Promise<unknown>>();
const resolvedGetCache = new Map<string, { expiresAt: number; value: unknown }>();

function emitAuthChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ADMIN_AUTH_CHANGE_EVENT));
}

function statusFallbackMessage(status?: number) {
  if (status === 400 || status === 422) {
    return "Operacao nao permitida pela base de dados. Verifica os dados e tenta novamente.";
  }
  if (status === 401) return "Sessao expirada. Entra novamente.";
  if (status === 403) return "Sem permissao para esta acao.";
  if (status === 404) return "Recurso nao encontrado.";
  if (status === 409) return "Esta operacao entrou em conflito com o estado atual. Atualiza os dados e tenta novamente.";
  if (status === 429) return "Muitas tentativas. Aguarda um pouco e tenta novamente.";
  if (typeof status === "number" && status >= 500) return "Erro interno. Tenta novamente.";
  return "Nao foi possivel concluir a operacao.";
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function parseApiErrorPayload(payload: unknown): ApiErrorPayload {
  return payload && typeof payload === "object" ? (payload as ApiErrorPayload) : {};
}

function createApiError(payload: unknown, status?: number) {
  const parsed = parseApiErrorPayload(payload);
  const backendMessage = firstString(parsed.message, parsed.error);
  const shouldUseBackendMessage = !status || status === 400 || status === 422;
  const message = shouldUseBackendMessage && backendMessage ? backendMessage : statusFallbackMessage(status);
  return new ApiError(
    message,
    status,
    typeof parsed.code === "string" ? parsed.code : undefined,
    parsed.details
  );
}

export function getApiErrorMessage(error: unknown) {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message || statusFallbackMessage(error instanceof ApiError ? error.status : undefined);
  }

  return statusFallbackMessage();
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
    .catch(() => false)
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
      // Session expired — always goes to login, never to "unauthorized".
      clearAdminSession();
      window.location.href = "/admin/login";
      throw createApiError({ message: "Sessao expirada. Entra novamente." }, response.status);
    }

    if (response.status === 403) {
      // CustomAccessDeniedHandler returns error:"CSRF invalido" for CSRF failures
      // and error:"Acesso negado" for role denials. Only redirect for role denials.
      const isCsrfError =
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        payload.error === "CSRF invalido";
      if (isCsrfError) {
          throw createApiError(
            {
              message:
                (payload as { message?: string }).message ??
                "A validacao de seguranca expirou. Atualize a pagina e tente novamente.",
            },
            response.status
          );
      }
      throw createApiError(payload || { message: "Sem permissao para esta acao." }, response.status);
    }

    if (!response.ok) {
      throw createApiError(payload, response.status);
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
