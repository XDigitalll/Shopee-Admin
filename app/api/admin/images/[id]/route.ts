import { NextRequest, NextResponse } from "next/server";
import { fetchBackend, jsonError, relayAuthFailure } from "@/app/api/admin/_utils";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;

  let response: Response;
  try {
    response = await fetchBackend(request, `/admin/images/${id}`, { method: "DELETE" });
  } catch {
    return jsonError("Backend inacessível.", 502);
  }

  await relayAuthFailure(response);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return jsonError(`Erro ${response.status}: ${text.slice(0, 200) || "sem detalhe"}`, response.status);
  }

  return new NextResponse(null, { status: 204 });
}
