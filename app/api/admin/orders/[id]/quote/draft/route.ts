import { NextRequest, NextResponse } from "next/server";

import { clearQuoteDraft, saveQuoteDraft } from "@/lib/admin/quote-drafts";
import type { ExternalOrderDraft } from "@/lib/admin/types";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json()) as ExternalOrderDraft;

  saveQuoteDraft(id, body);
  return NextResponse.json({ saved: true });
}

export async function DELETE(_: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  clearQuoteDraft(id);
  return NextResponse.json({ cleared: true });
}
