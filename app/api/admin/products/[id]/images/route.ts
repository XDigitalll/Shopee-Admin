import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";
import type { AdminProduct } from "@/lib/admin/types";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const response = await fetchBackend(request, `/admin/products/${id}/images`, {
    method: "POST",
    body: await request.arrayBuffer(),
  });

  await relayAuthFailure(response);

  if (!response.ok) {
    const text = await response.text();
    let message = text || "Nao foi possivel fazer upload das imagens.";
    try {
      const payload = JSON.parse(text) as { message?: string; error?: string };
      message = payload.message || payload.error || message;
    } catch {
      // keep plain-text backend error
    }
    return jsonError(message, response.status);
  }

  const data = await parseBackendJson<AdminProduct>(response);
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = (await request.json()) as { imageIds: string[] };

  const response = await fetchBackend(request, `/admin/products/${id}/images/reorder`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ imageIds: body.imageIds.map(Number) }),
    cache: "no-store",
  });

  await relayAuthFailure(response);

  if (!response.ok) {
    return jsonError("Nao foi possivel reordenar as imagens.", response.status);
  }

  const data = await parseBackendJson<AdminProduct>(response);
  return NextResponse.json(data);
}
