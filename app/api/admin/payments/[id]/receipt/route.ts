import { NextRequest } from "next/server";
import { jsonError } from "@/app/api/admin/_utils";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, _context: RouteContext) {
  return jsonError(
    "Comprovativo manual desativado. Os pagamentos são agora processados pelo PaySuite.",
    410
  );
}
