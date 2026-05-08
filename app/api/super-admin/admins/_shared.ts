import { ADMIN_MODULES, getPrimaryRole, normalizeRole, ROLE_ACCESS, type AdminModule, type AdminRole } from "@/lib/admin/roles";
import type { ManagedAdmin, ManagedAdminActivity, ManagedAdminStatsResponse, ManagedAdminStatus, ManagedAdminsPageResponse } from "@/lib/admin/types";

type UnknownRecord = Record<string, unknown>;

type BackendPage<T> = {
  content?: T[];
  totalElements?: number | null;
  totalPages?: number | null;
  number?: number | null;
  size?: number | null;
};

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" ? (value as UnknownRecord) : null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNullableString(value: unknown) {
  const normalized = readString(value);
  return normalized.length ? normalized : null;
}

function readBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }

  return fallback;
}

function readNumber(value: unknown, fallback = 0) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : fallback;
}

function normalizeStatus(value: unknown, active: boolean, suspended: boolean): ManagedAdminStatus {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (normalized === "ACTIVE" || normalized === "INACTIVE" || normalized === "SUSPENDED") {
    return normalized;
  }
  if (suspended) {
    return "SUSPENDED";
  }
  return active ? "ACTIVE" : "INACTIVE";
}

function getRole(raw: UnknownRecord) {
  return (
    normalizeRole(raw.role) ??
    getPrimaryRole(raw.roles) ??
    normalizeRole(raw.primaryRole) ??
    normalizeRole(raw.adminRole)
  );
}

function getModules(raw: UnknownRecord, role: AdminRole | null) {
  const candidates = [
    raw.modules,
    raw.accessModules,
    raw.accessibleModules,
    raw.allowedModules,
    raw.permissions,
  ];

  const fromPayload = candidates
    .flatMap((candidate) => (Array.isArray(candidate) ? candidate : []))
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }

      const record = asRecord(item);
      if (!record) {
        return "";
      }

      return readString(record.code || record.key || record.name || record.module);
    })
    .map((item) => item.toLowerCase())
    .map((item) => {
      const direct = ADMIN_MODULES.find((module) => module.toLowerCase() === item);
      if (direct) {
        return direct;
      }

      if (item === "catalog" || item === "catalogo") {
        return "products";
      }
      if (item === "support") {
        return "customers";
      }
      if (item === "quotes") {
        return "quotes";
      }
      if (item === "payments") {
        return "payments";
      }
      return null;
    })
    .filter((module): module is AdminModule => Boolean(module));

  if (fromPayload.length > 0) {
    return [...new Set(fromPayload)];
  }

  return role ? ROLE_ACCESS[role] : [];
}

function getRecentActivity(raw: UnknownRecord): ManagedAdminActivity[] {
  const source = Array.isArray(raw.recentActivity)
    ? raw.recentActivity
    : Array.isArray(raw.activity)
      ? raw.activity
      : Array.isArray(raw.lastActions)
        ? raw.lastActions
        : [];

  return source
    .map((item, index) => {
      const record = asRecord(item);
      if (!record) {
        return null;
      }

      const description =
        readString(record.description) ||
        readString(record.label) ||
        readString(record.message) ||
        readString(record.action);

      if (!description) {
        return null;
      }

      return {
        id: readString(record.id) || `activity-${index}`,
        description,
        createdAt:
          readNullableString(record.createdAt) ||
          readNullableString(record.timestamp) ||
          readNullableString(record.date),
      } satisfies ManagedAdminActivity;
    })
    .filter((item): item is ManagedAdminActivity => Boolean(item))
    .slice(0, 3);
}

function splitName(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return {
      firstName: parts[0] ?? "",
      lastName: "",
    };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export function mapManagedAdmin(value: unknown): ManagedAdmin {
  const raw = asRecord(value) ?? {};
  const role = getRole(raw);
  const fullName =
    readString(raw.name) ||
    readString(raw.fullName) ||
    `${readString(raw.firstName)} ${readString(raw.lastName)}`.trim() ||
    "Administrador";
  const split = splitName(fullName);
  const protectedAccount = readBoolean(raw.protectedAccount, false);
  const active = readBoolean(raw.active, !protectedAccount);
  const suspended = readBoolean(raw.suspended, false);
  const currentUser = readBoolean(raw.currentUser, false);
  const derivedStatus = protectedAccount ? "ACTIVE" : active ? "ACTIVE" : "INACTIVE";

  return {
    id: String(raw.id ?? raw.adminId ?? raw.userId ?? ""),
    firstName: readString(raw.firstName) || split.firstName,
    lastName: readString(raw.lastName) || split.lastName,
    name: fullName,
    email: readString(raw.email),
    phone:
      readNullableString(raw.phone) ||
      readNullableString(raw.phoneNumber) ||
      readNullableString(raw.telephone),
    role,
    status: normalizeStatus(raw.status, derivedStatus === "ACTIVE", suspended),
    active: derivedStatus === "ACTIVE",
    suspended,
    createdAt:
      readNullableString(raw.createdAt) ||
      readNullableString(raw.createdDate) ||
      readNullableString(raw.registeredAt),
    lastAccessAt:
      readNullableString(raw.lastAccessAt) ||
      readNullableString(raw.lastLoginAt) ||
      readNullableString(raw.lastSeenAt) ||
      readNullableString(raw.passwordUpdatedAt) ||
      readNullableString(raw.updatedAt),
    modules: getModules(raw, role),
    recentActivity:
      getRecentActivity(raw).length > 0
        ? getRecentActivity(raw)
        : [
            {
              id: "created",
              description: currentUser ? "Conta administrativa em uso actualmente." : "Conta administrativa registada no painel.",
              createdAt:
                readNullableString(raw.passwordUpdatedAt) ||
                readNullableString(raw.createdAt) ||
                null,
            },
          ],
  };
}

export function mapManagedAdminsPage(value: unknown): ManagedAdminsPageResponse {
  if (Array.isArray(value)) {
    const content = value.map(mapManagedAdmin);
    return {
      content,
      totalElements: content.length,
      totalPages: content.length ? 1 : 0,
      number: 0,
      size: content.length,
    };
  }

  const payload = asRecord(value) ?? {};
  const page = payload as BackendPage<unknown>;

  return {
    content: Array.isArray(page.content) ? page.content.map(mapManagedAdmin) : [],
    totalElements: readNumber(page.totalElements),
    totalPages: readNumber(page.totalPages),
    number: readNumber(page.number),
    size: readNumber(page.size, 10),
  };
}

export function mapManagedAdminStats(value: unknown): ManagedAdminStatsResponse {
  const raw = asRecord(value) ?? {};
  const roleSource =
    asRecord(raw.roleDistribution) ||
    asRecord(raw.roles) ||
    asRecord(raw.byRole) ||
    asRecord(raw.distribution) ||
    {};

  const roleDistribution = Object.entries(roleSource).reduce<Partial<Record<AdminRole, number>>>((accumulator, [key, amount]) => {
    const role = normalizeRole(key);
    if (role) {
      accumulator[role] = readNumber(amount);
    }
    return accumulator;
  }, {});

  const suspended = readNumber(raw.suspended);
  const active = readNumber(raw.active);
  const inactive = readNumber(raw.inactive);
  const total =
    readNumber(raw.total) ||
    active + inactive + suspended ||
    Object.values(roleDistribution).reduce((sum, amount) => sum + Number(amount || 0), 0);

  return {
    total,
    active,
    inactive,
    suspended,
    roleDistribution,
  };
}

export function computeManagedAdminStats(admins: ManagedAdmin[]): ManagedAdminStatsResponse {
  const roleDistribution = admins.reduce<Partial<Record<AdminRole, number>>>((accumulator, admin) => {
    if (admin.role) {
      accumulator[admin.role] = Number(accumulator[admin.role] ?? 0) + 1;
    }
    return accumulator;
  }, {});

  return {
    total: admins.length,
    active: admins.filter((admin) => admin.status === "ACTIVE").length,
    inactive: admins.filter((admin) => admin.status === "INACTIVE").length,
    suspended: admins.filter((admin) => admin.status === "SUSPENDED").length,
    roleDistribution,
  };
}

export function filterManagedAdmins(
  admins: ManagedAdmin[],
  filters: {
    role?: string | null;
    status?: string | null;
    search?: string | null;
    page?: number;
    size?: number;
  },
): ManagedAdminsPageResponse {
  const role = normalizeRole(filters.role ?? null);
  const status = typeof filters.status === "string" ? filters.status.trim().toUpperCase() : null;
  const search = filters.search?.trim().toLowerCase() ?? "";
  const page = Math.max(filters.page ?? 0, 0);
  const size = Math.max(filters.size ?? 10, 1);

  const filtered = admins.filter((admin) => {
    if (role && admin.role !== role) {
      return false;
    }

    if (status && status !== "ALL" && admin.status !== status) {
      return false;
    }

    if (!search) {
      return true;
    }

    return [admin.name, admin.email, admin.phone ?? ""].some((value) => value.toLowerCase().includes(search));
  });

  const sorted = [...filtered].sort((left, right) => {
    const leftCurrent = left.recentActivity.some((item) => item.description.includes("actualmente"));
    const rightCurrent = right.recentActivity.some((item) => item.description.includes("actualmente"));
    if (leftCurrent !== rightCurrent) {
      return leftCurrent ? -1 : 1;
    }

    return (right.createdAt ?? "").localeCompare(left.createdAt ?? "") || right.id.localeCompare(left.id);
  });

  const start = page * size;
  const content = sorted.slice(start, start + size);

  return {
    content,
    totalElements: sorted.length,
    totalPages: sorted.length ? Math.ceil(sorted.length / size) : 0,
    number: page,
    size,
  };
}
