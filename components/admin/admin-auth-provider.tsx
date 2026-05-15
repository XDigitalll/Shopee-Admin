"use client";

import {
  createContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  type AdminModule,
  hasModuleAccess,
  getPrimaryRole,
} from "@/lib/admin/roles";
import {
  clearAdminSession,
  refreshAdminSession,
} from "@/lib/admin/api-client";
import { type AdminSessionProfile } from "@/lib/admin/types";

type ExtendedAdminProfile = AdminSessionProfile & { expiresAt: number | null };

type AdminAuthContextValue = {
  profile: AdminSessionProfile;
  effectiveRole: AdminSessionProfile["role"];
  isAuthenticated: boolean;
  isLoading: boolean;
  hasAccess: (module: AdminModule) => boolean;
  logout: () => Promise<void>;
};

const emptyProfile: AdminSessionProfile = {
  role: null,
  roles: [],
  name: "Administrador",
  email: "",
  avatarUrl: null,
};

export const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

async function fetchMe(): Promise<ExtendedAdminProfile | null> {
  try {
    const res = await fetch("/api/admin/auth/me", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as ExtendedAdminProfile | null;
  } catch {
    return null;
  }
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<ExtendedAdminProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const lastRefreshAttemptRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      let profileData = await fetchMe();

      if (!profileData) {
        const refreshed = await refreshAdminSession();
        if (refreshed) {
          profileData = await fetchMe();
        }
      }

      if (!cancelled) {
        setProfile(profileData);
        setIsLoading(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!profile?.expiresAt) return;

    const timeoutMs = Math.max(profile.expiresAt - Date.now() - 60_000, 0);

    const timeoutId = window.setTimeout(async () => {
      const refreshed = await refreshAdminSession();
      if (refreshed) {
        const profileData = await fetchMe();
        setProfile(profileData);
      } else {
        setProfile(null);
        window.location.href = "/admin/login";
      }
    }, timeoutMs);

    return () => window.clearTimeout(timeoutId);
  }, [profile?.expiresAt]);

  useEffect(() => {
    if (!profile) return;

    const attemptRefresh = async () => {
      const expiresAt = profile.expiresAt;
      if (!expiresAt) return;

      const remainingMs = expiresAt - Date.now();
      if (remainingMs > 5 * 60_000) return;

      const now = Date.now();
      if (now - lastRefreshAttemptRef.current < 30_000) return;

      lastRefreshAttemptRef.current = now;
      const refreshed = await refreshAdminSession();
      if (refreshed) {
        const profileData = await fetchMe();
        setProfile(profileData);
      }
    };

    const handleActivity = () => {
      void attemptRefresh();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") void attemptRefresh();
    };

    window.addEventListener("focus", handleActivity);
    window.addEventListener("pointerdown", handleActivity);
    window.addEventListener("keydown", handleActivity);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", handleActivity);
      window.removeEventListener("pointerdown", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [profile]);

  const effectiveRole = profile?.role ?? getPrimaryRole(profile?.roles) ?? null;

  const value = useMemo<AdminAuthContextValue>(
    () => ({
      profile: profile ?? emptyProfile,
      effectiveRole,
      isAuthenticated: profile !== null,
      isLoading,
      hasAccess(module) {
        return hasModuleAccess(profile ?? emptyProfile, module);
      },
      async logout() {
        try {
          await fetch("/api/admin/auth/logout", { method: "POST", cache: "no-store" });
        } catch {}
        clearAdminSession();
        setProfile(null);
        window.location.href = "/admin/login";
      },
    }),
    [effectiveRole, isLoading, profile]
  );

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}
