import { NextRequest } from "next/server";
import { jsonError } from "@/app/api/admin/_utils";

export async function GET(_request: NextRequest) {
  return jsonError(
    "Fila de submissões manuais desativada. O fluxo de pagamento é agora gerido exclusivamente pelo PaySuite.",
    410
  );
}

export async function POST(_request: NextRequest) {
  return jsonError(
    "Submissões manuais de pagamento desativadas. Use o gateway PaySuite.",
    410
  );
}
