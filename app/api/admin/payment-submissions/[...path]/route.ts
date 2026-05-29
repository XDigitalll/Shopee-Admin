import { NextRequest } from "next/server";
import { jsonError } from "@/app/api/admin/_utils";

const GONE_MESSAGE =
  "Submissões manuais de pagamento foram desativadas. O fluxo de pagamento é agora gerido exclusivamente pelo PaySuite.";

export async function GET(_request: NextRequest) {
  return jsonError(GONE_MESSAGE, 410);
}

export async function POST(_request: NextRequest) {
  return jsonError(GONE_MESSAGE, 410);
}

export async function PATCH(_request: NextRequest) {
  return jsonError(GONE_MESSAGE, 410);
}

export async function PUT(_request: NextRequest) {
  return jsonError(GONE_MESSAGE, 410);
}
