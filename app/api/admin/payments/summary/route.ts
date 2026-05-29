import { NextRequest } from "next/server";
import { jsonError } from "@/app/api/admin/_utils";

export async function GET(_request: NextRequest) {
  return jsonError(
    "Resumo de submissões manuais desativado. Use /api/admin/payments/stats para estatísticas PaySuite.",
    410
  );
}
