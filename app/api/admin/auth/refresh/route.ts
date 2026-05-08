import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

export async function POST(request: NextRequest) {
  const body = await request.text();

  const response = await fetch(`${BACKEND_URL}/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    return NextResponse.json(
      {
        message:
          (payload &&
            typeof payload === "object" &&
            "message" in payload &&
            typeof payload.message === "string" &&
            payload.message) ||
          "Nao foi possivel renovar a sessao.",
      },
      { status: response.status }
    );
  }

  return NextResponse.json(payload, { status: response.status });
}
