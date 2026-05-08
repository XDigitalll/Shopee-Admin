import { NextRequest, NextResponse } from "next/server";

import { addOrderNote } from "@/lib/admin/order-meta-store";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { content?: string } | null;
  const content = String(body?.content ?? "").trim();

  if (!content) {
    return NextResponse.json({ message: "A nota não pode estar vazia." }, { status: 400 });
  }

  const note = {
    id: `${id}-${Date.now()}`,
    content,
    author: "Admin",
    createdAt: new Date().toISOString(),
  };

  const notes = addOrderNote(id, note);
  return NextResponse.json({ notes });
}
