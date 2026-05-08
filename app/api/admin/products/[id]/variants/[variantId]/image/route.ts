import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin/session";
import { jsonError } from "@/app/api/admin/_utils";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

type Params = { params: Promise<{ id: string; variantId: string }> };

function extractToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return request.cookies.get(ADMIN_SESSION_COOKIE)?.value ?? null;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id, variantId } = await params;
  const token = extractToken(request);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("Corpo da requisicao invalido.", 400);
  }

  let response: Response;
  try {
    response = await fetch(
      `${BACKEND_URL}/admin/products/${id}/variants/${variantId}/image`,
      {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
        cache: "no-store",
      }
    );
  } catch {
    return jsonError("Backend inacessivel.", 502);
  }

  if (response.status === 401) {
    const cookieStore = await cookies();
    cookieStore.delete(ADMIN_SESSION_COOKIE);
    return jsonError("Sessao expirada.", 401);
  }

  if (!response.ok) {
    const msg = await response.text().catch(() => "Erro desconhecido.");
    return jsonError(msg || "Nao foi possivel fazer upload da imagem.", response.status);
  }

  return NextResponse.json(await response.json());
}
