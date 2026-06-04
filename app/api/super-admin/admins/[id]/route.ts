import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";
import { mapManagedAdminsPage } from "@/app/api/super-admin/admins/_shared";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const response = await fetchBackend(request, "/super-admin/admins");
  await relayAuthFailure(response);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    return jsonError(payload?.message || "Nao foi possivel carregar o administrador.", response.status);
  }

  const payload = await parseBackendJson<unknown>(response);
  const admin = mapManagedAdminsPage(payload).content.find((item) => item.id === id);
  if (!admin) {
    return jsonError("Administrador nao encontrado.", 404);
  }
  return NextResponse.json(admin);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const incoming = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const response = await fetchBackend(request, `/super-admin/admins/${encodeURIComponent(id)}/role`, {
    method: "PUT",
    body: JSON.stringify({
      role: typeof incoming?.role === "string" ? incoming.role : undefined,
      roles: Array.isArray(incoming?.roles) ? incoming.roles : undefined,
      active: typeof incoming?.active === "boolean" ? incoming.active : undefined,
    }),
  });

  await relayAuthFailure(response);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    return jsonError(payload?.message || "Nao foi possivel actualizar o administrador.", response.status);
  }

  return NextResponse.json(await response.json().catch(() => null));
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const response = await fetchBackend(request, `/super-admin/admins/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

  await relayAuthFailure(response);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    return jsonError(payload?.message || "Nao foi possivel remover o administrador.", response.status);
  }

  if (response.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json(await response.json().catch(() => null));
}
