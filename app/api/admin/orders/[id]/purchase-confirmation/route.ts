import { NextRequest, NextResponse } from "next/server";

import {
  fetchBackend,
  jsonError,
  jsonErrorPayload,
  parseBackendJson,
  relayAuthFailure,
} from "@/app/api/admin/_utils";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const HUMAN_CONFIRMATION_ERROR = "Nao conseguimos confirmar agora. Tenta novamente.";

function logPurchaseConfirmationFailure(details: {
  orderId: string;
  format: "multipart" | "json";
  hasFile: boolean;
  errorClass: string;
}) {
  console.warn("PURCHASE_CONFIRMATION_FAILED", details);
}

async function handleBackendFailure(response: Response, orderId: string, format: "multipart" | "json", hasFile: boolean) {
  const payload = await parseBackendJson<unknown>(response);
  logPurchaseConfirmationFailure({
    orderId,
    format,
    hasFile,
    errorClass:
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `HTTP_${response.status}`,
  });

  if (response.status >= 500) {
    return jsonError(HUMAN_CONFIRMATION_ERROR, response.status);
  }

  return jsonErrorPayload(payload, response.status, HUMAN_CONFIRMATION_ERROR);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const contentType = request.headers.get("content-type") ?? "";
  const isMultipart = contentType.toLowerCase().includes("multipart/form-data");

  try {
    if (isMultipart) {
      const backendResponse = await fetchBackend(
        request,
        `/admin/orders/${encodeURIComponent(id)}/purchase-proof`,
        {
          method: "POST",
          body: request.body,
          duplex: "half",
        } as RequestInit & { duplex: "half" },
      );
      await relayAuthFailure(backendResponse);

      if (!backendResponse.ok) {
        return handleBackendFailure(backendResponse, id, "multipart", true);
      }

      const payload = await parseBackendJson<unknown>(backendResponse);
      return NextResponse.json(payload);
    }

    const body = await request.json().catch(() => ({}));
    const supplierOrderReference =
      body && typeof body === "object" && "supplierOrderReference" in body && typeof body.supplierOrderReference === "string"
        ? body.supplierOrderReference.trim()
        : "";
    const supplierReference =
      body && typeof body === "object" && "supplierReference" in body && typeof body.supplierReference === "string"
        ? body.supplierReference.trim()
        : "";
    const reference = supplierOrderReference || supplierReference;
    const supplierName =
      body && typeof body === "object" && "supplierName" in body && typeof body.supplierName === "string"
        ? body.supplierName.trim()
        : "";
    const amount =
      body && typeof body === "object" && "amount" in body && body.amount != null
        ? String(body.amount).trim()
        : "";
    const note =
      body && typeof body === "object" && "note" in body && typeof body.note === "string"
        ? body.note.trim()
        : "";
    const hasConfirmationDetails = Boolean(reference || amount || note || (supplierName && supplierName !== "Fornecedor"));

    const backendPath = hasConfirmationDetails
      ? `/admin/orders/${encodeURIComponent(id)}/purchase-confirmation`
      : `/admin/orders/${encodeURIComponent(id)}/mark-purchased`;
    const backendInit: RequestInit = hasConfirmationDetails
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supplierName: supplierName || "Fornecedor",
            amount: amount || null,
            supplierOrderReference: reference,
            note: note || null,
          }),
        }
      : { method: "PATCH" };

    const backendResponse = await fetchBackend(request, backendPath, backendInit);
    await relayAuthFailure(backendResponse);

    if (!backendResponse.ok) {
      return handleBackendFailure(backendResponse, id, "json", false);
    }

    const payload = await parseBackendJson<unknown>(backendResponse);
    return NextResponse.json(payload);
  } catch (error) {
    logPurchaseConfirmationFailure({
      orderId: id,
      format: isMultipart ? "multipart" : "json",
      hasFile: isMultipart,
      errorClass: error instanceof Error ? error.name : typeof error,
    });
    return jsonError(HUMAN_CONFIRMATION_ERROR, 500);
  }
}
