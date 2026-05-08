"use client";

import {
  createContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { decodeJwtPayload, getProfileFromToken, isJwtExpired } from "@/lib/admin/jwt";
import {
  type AdminModule,
  DEFAULT_ADMIN_ROLE,
  hasModuleAccess,
} from "@/lib/admin/roles";
import {
  adminApiFetch,
  clearAdminSession,
  getStoredAdminRefreshToken,
  getStoredAdminToken,
  refreshAdminSession,
} from "@/lib/admin/api-client";
import {
  ADMIN_AUTH_CHANGE_EVENT,
} from "@/lib/admin/session";
import { type AdminSessionProfile } from "@/lib/admin/types";

type AdminAuthContextValue = {
  token: string | null;
  profile: AdminSessionProfile;
  effectiveRole: AdminSessionProfile["role"];
  isAuthenticated: boolean;
  isLoading: boolean;
  hasAccess: (module: AdminModule) => boolean;
  logout: () => Promise<void>;
};

const emptyProfile: AdminSessionProfile = {
  role: null,
  name: "Administrador",
  email: "",
  avatarUrl: null,
};

export const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getStoredAdminToken());
  const [isLoading, setIsLoading] = useState(true);
  const lastRefreshAttemptRef = useRef(0);
  const profile = useMemo(
    () => (token ? getProfileFromToken(token) : emptyProfile),
    [token]
  );

  function syncFromStorage() {
    setToken(getStoredAdminToken());
  }

  useEffect(() => {
    const handleAuthChange = () => {
      syncFromStorage();
    };

    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === null ||
        event.key === "shopee_admin_token" ||
        event.key === "shopee_admin_refresh_token"
      ) {
        syncFromStorage();
      }
    };

    window.addEventListener(ADMIN_AUTH_CHANGE_EVENT, handleAuthChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(ADMIN_AUTH_CHANGE_EVENT, handleAuthChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapSession() {
      const currentToken = getStoredAdminToken();
      const refreshToken = getStoredAdminRefreshToken();

      if (currentToken && !isJwtExpired(currentToken)) {
        if (!cancelled) {
          syncFromStorage();
          setIsLoading(false);
        }
        return;
      }

      if (!refreshToken) {
        clearAdminSession();
        if (!cancelled) {
          syncFromStorage();
          setIsLoading(false);
        }
        return;
      }

      const refreshed = await refreshAdminSession();
      if (!cancelled) {
        if (!refreshed) {
          clearAdminSession();
        }
        syncFromStorage();
        setIsLoading(false);
      }
    }

    void bootstrapSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!token || !getStoredAdminRefreshToken()) {
      return;
    }

    const parsed = decodeJwtPayload(token);
    if (!parsed?.exp) {
      return;
    }

    const expiresAtMs = parsed.exp * 1000;
    const timeoutMs = Math.max(expiresAtMs - Date.now() - 60_000, 0);

    const timeoutId = window.setTimeout(async () => {
      const refreshed = await refreshAdminSession();
      if (!refreshed) {
        clearAdminSession();
        window.location.href = "/admin/login";
      }
    }, timeoutMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [token]);

  useEffect(() => {
    if (!getStoredAdminRefreshToken()) {
      return;
    }

    const attemptRefresh = async () => {
      const currentToken = getStoredAdminToken();
      if (!currentToken) {
        return;
      }

      const parsed = decodeJwtPayload(currentToken);
      if (!parsed?.exp) {
        return;
      }

      const remainingMs = parsed.exp * 1000 - Date.now();
      if (remainingMs > 5 * 60_000) {
        return;
      }

      const now = Date.now();
      if (now - lastRefreshAttemptRef.current < 30_000) {
        return;
      }

      lastRefreshAttemptRef.current = now;
      await refreshAdminSession();
    };

    const handlePointer = () => {
      void attemptRefresh();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void attemptRefresh();
      }
    };

    window.addEventListener("focus", handlePointer);
    window.addEventListener("pointerdown", handlePointer);
    window.addEventListener("keydown", handlePointer);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", handlePointer);
      window.removeEventListener("pointerdown", handlePointer);
      window.removeEventListener("keydown", handlePointer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const effectiveRole = profile.role ?? DEFAULT_ADMIN_ROLE;

  const value = useMemo<AdminAuthContextValue>(
    () => ({
      token,
      profile,
      effectiveRole,
      isAuthenticated: Boolean(token),
      isLoading,
      hasAccess(module) {
        return hasModuleAccess(effectiveRole, module);
      },
      async logout() {
        try {
          await adminApiFetch("/api/admin/auth/logout", {
            method: "POST",
            body: JSON.stringify({
              refreshToken: getStoredAdminRefreshToken(),
            }),
            token,
          });
        } catch {
        } finally {
          clearAdminSession();
          window.location.href = "/admin/login";
        }
      },
    }),
    [effectiveRole, isLoading, profile, token]
  );

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}
