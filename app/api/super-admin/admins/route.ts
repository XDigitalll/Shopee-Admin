import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";
import { filterManagedAdmins, mapManagedAdmin, mapManagedAdminsPage } from "@/app/api/super-admin/admins/_shared";

function normalizeMozambiquePhone(value: unknown) {
  if (typeof value !== "string") return "";
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  let local = digits;
  if (local.startsWith("00258")) local = local.slice(2);
  if (local.startsWith("258")) local = local.slice(3);
  if (local.startsWith("0")) local = local.slice(1);
  return /^(82|83|84|85|86|87)\d{7}$/.test(local) ? `+258${local}` : null;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  let response: Response;

  try {
    response = await fetchBackend(request, "/super-admin/admins");
  } catch {
    return jsonError("Backend inacessivel.", 502);
  }

  await relayAuthFailure(response);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    return jsonError(payload?.message || "Nao foi possivel carregar os administradores.", response.status);
  }

  const payload = await parseBackendJson<unknown>(response);
  const allAdmins = mapManagedAdminsPage(payload).content.map(mapManagedAdmin);
  return NextResponse.json(
    filterManagedAdmins(allAdmins, {
      role: params.get("role"),
      status: params.get("status"),
      search: params.get("search"),
      page: Number(params.get("page") ?? 0),
      size: Number(params.get("size") ?? 10),
    }),
  );
}

export async function POST(request: NextRequest) {
  const incoming = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const firstName = typeof incoming?.firstName === "string" ? incoming.firstName.trim() : "";
  const lastName = typeof incoming?.lastName === "string" ? incoming.lastName.trim() : "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const phone = normalizeMozambiquePhone(incoming?.phone);
  if (phone === null) {
    return jsonError("Telefone invalido. Use um numero mocambicano no formato +2588xxxxxxxx.", 400);
  }
  const response = await fetchBackend(request, "/super-admin/admins", {
    method: "POST",
    body: JSON.stringify({
      name: fullName || (typeof incoming?.name === "string" ? incoming.name.trim() : ""),
      email: typeof incoming?.email === "string" ? incoming.email.trim() : "",
      phone,
      password: typeof incoming?.password === "string" ? incoming.password : "",
      role: typeof incoming?.role === "string" ? incoming.role : "ADMIN",
      roles: Array.isArray(incoming?.roles) ? incoming.roles : undefined,
    }),
  });

  await relayAuthFailure(response);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    return jsonError(payload?.message || "Nao foi possivel criar o administrador.", response.status);
  }

  return NextResponse.json(await response.json().catch(() => null));
}
