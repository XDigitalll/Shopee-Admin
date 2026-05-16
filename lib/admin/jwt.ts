import { AdminRole, getPrimaryRole } from "@/lib/admin/roles";

type JwtPayload = {
  exp?: number;
  sub?: string;
  email?: string;
  name?: string;
  avatarUrl?: string | null;
  roles?: string[];
  mustChangePassword?: boolean;
};

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");

  if (typeof atob === "function") {
    return atob(padded);
  }

  if (typeof Buffer !== "undefined") {
    return Buffer.from(padded, "base64").toString("utf-8");
  }

  throw new Error("Base64 decoding is unavailable in this runtime.");
}

export function decodeJwtPayload(token: string | null | undefined): JwtPayload | null {
  if (!token) {
    return null;
  }

  try {
    const [, payload] = token.split(".");
    if (!payload) {
      return null;
    }

    return JSON.parse(decodeBase64Url(payload)) as JwtPayload;
  } catch {
    return null;
  }
}

export function isJwtExpired(token: string | null | undefined) {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) {
    return true;
  }

  return payload.exp * 1000 <= Date.now();
}

export function getRoleFromToken(token: string | null | undefined): AdminRole | null {
  const payload = decodeJwtPayload(token);
  return getPrimaryRole(payload?.roles);
}

export function getProfileFromToken(token: string | null | undefined) {
  const payload = decodeJwtPayload(token);
  const role = getPrimaryRole(payload?.roles);

  return {
    role,
    email: payload?.email ?? payload?.sub ?? "",
    name: payload?.name ?? payload?.email ?? payload?.sub ?? "Administrador",
    avatarUrl: payload?.avatarUrl ?? null,
    mustChangePassword: Boolean(payload?.mustChangePassword),
  };
}
