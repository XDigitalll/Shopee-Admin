import { NextRequest, NextResponse } from "next/server";
import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";
import type { AdminCustomer, CustomersPageResponse } from "@/lib/admin/types";

type BackendPage<T> = {
  content?: T[];
  number?: number;
  size?: number;
  totalElements?: number;
  totalPages?: number;
};

type BackendCustomerStats = {
  total?: number | null;
};

type CsvCustomerRow = {
  id: number;
  name: string;
  email: string;
  phoneNumber: string | null;
  city: string | null;
  emailVerified: boolean;
  suspended: boolean;
  orderCount: number;
  totalOrderValue: number;
  createdAt: string | null;
};

function mapCustomer(item: Partial<AdminCustomer>): AdminCustomer {
  return {
    id: Number(item.id ?? 0),
    name: String(item.name ?? "Cliente"),
    email: String(item.email ?? ""),
    avatarUrl: item.avatarUrl ?? null,
    phoneNumber: item.phoneNumber ?? null,
    alternativePhoneNumber: item.alternativePhoneNumber ?? null,
    provider: String(item.provider ?? "LOCAL"),
    emailVerified: Boolean(item.emailVerified ?? false),
    phoneVerified: Boolean(item.phoneVerified ?? false),
    verificationCompleted: Boolean(item.verificationCompleted ?? false),
    suspended: Boolean(item.suspended ?? false),
    city: item.city ?? null,
    deliveryCity: item.deliveryCity ?? null,
    deliveryNeighborhood: item.deliveryNeighborhood ?? null,
    deliveryStreet: item.deliveryStreet ?? null,
    houseNumber: item.houseNumber ?? null,
    deliveryReference: item.deliveryReference ?? null,
    googleMapsLink: item.googleMapsLink ?? null,
    formattedDeliveryAddress: item.formattedDeliveryAddress ?? null,
    hasDeliveryAddress: Boolean(item.hasDeliveryAddress ?? false),
    profileCompletionPercentage: Number(item.profileCompletionPercentage ?? 0),
    roles: Array.isArray(item.roles) ? item.roles.map((role) => String(role)) : [],
    orderCount: Number(item.orderCount ?? 0),
    totalOrderValue: Number(item.totalOrderValue ?? 0),
    lastOrderDate: item.lastOrderDate ?? null,
    createdAt: item.createdAt ?? null,
    autoCreated: Boolean(item.autoCreated ?? false),
    mustChangePassword: Boolean(item.mustChangePassword ?? false),
    profileIncomplete: Boolean(item.profileIncomplete ?? false),
    accountStatus: (item.accountStatus as AdminCustomer["accountStatus"]) ?? "VERIFICADO",
    communicationPhone: item.communicationPhone ?? null,
    communicationChannel: (item.communicationChannel as AdminCustomer["communicationChannel"]) ?? null,
    communicationVerified: item.communicationVerified ?? null,
    whatsappSameAsPrimary: item.whatsappSameAsPrimary ?? null,
    effectiveCommunicationPhone: item.effectiveCommunicationPhone ?? null,
  };
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (insideQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === "," && !insideQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function normalizeNullable(value: string | null | undefined) {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function parseCsvCustomers(csv: string) {
  const lines = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return [];
  }

  return lines.slice(1).map((line) => {
    const [
      id,
      name,
      email,
      phoneNumber,
      city,
      verified,
      suspended,
      orderCount,
      totalOrderValue,
      createdAt,
    ] = parseCsvLine(line);

    return {
      id: Number(id ?? 0),
      name: name ?? "Cliente",
      email: email ?? "",
      phoneNumber: normalizeNullable(phoneNumber),
      city: normalizeNullable(city),
      emailVerified: String(verified).toLowerCase() === "sim",
      suspended: String(suspended).toLowerCase() === "sim",
      orderCount: Number(orderCount ?? 0),
      totalOrderValue: Number(String(totalOrderValue ?? "0").replace(",", ".")),
      createdAt: normalizeNullable(createdAt),
    } satisfies CsvCustomerRow;
  }).filter((item) => item.id > 0);
}

function matchesCsvCustomer(customer: CsvCustomerRow, search: string | null, verified: string | null, suspended: string | null) {
  if (verified != null && customer.emailVerified !== (verified === "true")) {
    return false;
  }

  if (suspended != null && customer.suspended !== (suspended === "true")) {
    return false;
  }

  const needle = search?.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  return [
    customer.name,
    customer.email,
    customer.phoneNumber,
    customer.city,
  ].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle));
}

function sortCsvCustomers(customers: CsvCustomerRow[], sort: string | null) {
  const normalizedSort = sort ?? "recent";
  const sorted = [...customers];

  sorted.sort((left, right) => {
    if (normalizedSort === "totalSpent") {
      return right.totalOrderValue - left.totalOrderValue || right.orderCount - left.orderCount || right.id - left.id;
    }

    if (normalizedSort === "orders") {
      return right.orderCount - left.orderCount || right.totalOrderValue - left.totalOrderValue || right.id - left.id;
    }

    if (normalizedSort === "az") {
      return left.name.localeCompare(right.name, "pt", { sensitivity: "base" }) || left.id - right.id;
    }

    return (right.createdAt ?? "").localeCompare(left.createdAt ?? "") || right.id - left.id;
  });

  return sorted;
}

async function loadCustomersFromCsvFallback(request: NextRequest, src: URLSearchParams) {
  const [statsResponse, exportResponse] = await Promise.all([
    fetchBackend(request, "/admin/users/stats"),
    fetchBackend(request, "/admin/users/export"),
  ]);

  await Promise.all([relayAuthFailure(statsResponse), relayAuthFailure(exportResponse)]);

  if (!statsResponse.ok || !exportResponse.ok) {
    return null;
  }

  const statsPayload = await parseBackendJson<BackendCustomerStats>(statsResponse);
  const totalCustomers = Number(statsPayload?.total ?? 0);
  if (totalCustomers <= 0) {
    return {
      content: [],
      totalElements: 0,
      totalPages: 0,
      number: Number(src.get("page") ?? 0),
      size: Number(src.get("size") ?? 10),
    } satisfies CustomersPageResponse;
  }

  const csv = await exportResponse.text();
  const filtered = sortCsvCustomers(
    parseCsvCustomers(csv).filter((customer) =>
      matchesCsvCustomer(customer, src.get("search"), src.get("verified"), src.get("suspended"))
    ),
    src.get("sort"),
  );

  const page = Number(src.get("page") ?? 0);
  const size = Number(src.get("size") ?? 10);
  const start = Math.max(page, 0) * Math.max(size, 1);
  const end = start + Math.max(size, 1);
  const slice = filtered.slice(start, end);

  const detailResponses = await Promise.all(
    slice.map(async (customer) => {
      const response = await fetchBackend(request, `/admin/users/${customer.id}`);
      await relayAuthFailure(response);
      if (!response.ok) {
        return mapCustomer(customer);
      }

      const detailPayload = await parseBackendJson<Partial<AdminCustomer>>(response);
      return mapCustomer({
        ...customer,
        ...detailPayload,
      });
    }),
  );

  return {
    content: detailResponses,
    totalElements: filtered.length,
    totalPages: filtered.length ? Math.ceil(filtered.length / Math.max(size, 1)) : 0,
    number: Math.max(page, 0),
    size: Math.max(size, 1),
  } satisfies CustomersPageResponse;
}

export async function GET(request: NextRequest) {
  const src = new URL(request.url).searchParams;
  const params = new URLSearchParams();
  if (src.get("search"))    params.set("search",    src.get("search")!);
  if (src.get("verified"))  params.set("verified",  src.get("verified")!);
  if (src.get("suspended")) params.set("suspended", src.get("suspended")!);
  if (src.get("sort"))      params.set("sort",      src.get("sort")!);
  if (src.get("page"))      params.set("page",      src.get("page")!);
  if (src.get("size"))      params.set("size",      src.get("size")!);

  const qs = params.toString() ? `?${params}` : "";
  let response: Response;
  try {
    response = await fetchBackend(request, `/admin/users${qs}`);
  } catch {
    return jsonError("Backend inacessível.", 502);
  }
  await relayAuthFailure(response);
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    return jsonError(payload?.message || "Erro ao carregar clientes.", response.status);
  }

  const payload = await parseBackendJson<BackendPage<Partial<AdminCustomer>> | Partial<AdminCustomer>[]>(response);
  let result: CustomersPageResponse = Array.isArray(payload)
    ? {
        content: payload.map(mapCustomer),
        totalElements: payload.length,
        totalPages: payload.length ? 1 : 0,
        number: 0,
        size: payload.length,
      }
    : {
        content: (payload?.content ?? []).map(mapCustomer),
        totalElements: Number(payload?.totalElements ?? 0),
        totalPages: Number(payload?.totalPages ?? 0),
        number: Number(payload?.number ?? 0),
        size: Number(payload?.size ?? 10),
      };

  if (result.content.length === 0) {
    const fallback = await loadCustomersFromCsvFallback(request, src);
    if (fallback) {
      result = fallback;
    }
  }

  return NextResponse.json(result);
}
