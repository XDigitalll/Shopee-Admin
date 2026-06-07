import { NextRequest, NextResponse } from "next/server";
import { fetchBackend, jsonError, relayAuthFailure } from "@/app/api/admin/_utils";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  let response: Response;
  try {
    response = await fetchBackend(request, `/admin/customers/${encodeURIComponent(id)}/password-reset`, {
      method: "POST",
    });
  } catch {
    return jsonError("Backend inacessivel.", 502);
  }
  await relayAuthFailure(response);
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    return jsonError(payload?.message || "Nao foi possivel gerar o reset de senha.", response.status);
  }
  return NextResponse.json(await response.json().catch(() => null));
}
