import { NextRequest, NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE } from "@/lib/admin/session";
import { jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";
import type { AdminProduct } from "@/lib/admin/types";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

function getToken(request: NextRequest) {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length);
  return request.cookies.get(ADMIN_SESSION_COOKIE)?.value ?? null;
}

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const token = getToken(request);
  const contentType = request.headers.get("content-type") ?? "";

  // Forward the raw multipart body — preserving the boundary
  const body = await request.arrayBuffer();

  const response = await fetch(`${BACKEND_URL}/admin/products/${id}/images`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": contentType,
    },
    body,
  });

  await relayAuthFailure(response);

  if (!response.ok) {
    const error = await response.text();
    return jsonError(error || "Não foi possível fazer upload das imagens.", response.status);
  }

  const data = await parseBackendJson<AdminProduct>(response);
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await request.json() as { imageIds: string[] };
  const token = getToken(request);

  const response = await fetch(`${BACKEND_URL}/admin/products/${id}/images/reorder`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ imageIds: body.imageIds.map(Number) }),
    cache: "no-store",
  });

  await relayAuthFailure(response);

  if (!response.ok) {
    return jsonError("Não foi possível reordenar as imagens.", response.status);
  }

  const data = await parseBackendJson<AdminProduct>(response);
  return NextResponse.json(data);
}
