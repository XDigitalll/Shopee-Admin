import { NextRequest } from "next/server";
import { fetchBackend, jsonError, relayAuthFailure } from "@/app/api/admin/_utils";

export async function GET(request: NextRequest) {
  let response: Response;
  try {
    response = await fetchBackend(request, "/admin/users/export");
  } catch {
    return jsonError("Backend inacessível.", 502);
  }
  await relayAuthFailure(response);
  if (!response.ok) return jsonError("Erro ao exportar clientes.", response.status);

  const csv = await response.arrayBuffer();
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=UTF-8",
      "Content-Disposition": 'attachment; filename="clientes.csv"',
    },
  });
}
