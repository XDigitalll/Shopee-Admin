import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

type BackendStats = {
  totalRevenue?: number;
  todayRevenue?: number;
  totalCommission?: number;
  totalDelivery?: number;
  totalOrders?: number;
};

type BackendDashboard = {
  internalSales?: number;
  externalSales?: number;
  totalSiteRevenue?: number;
  totalDeliveryRevenue?: number;
  totalEstimatedMargin?: number;
};

type BackendCostBreakdown = {
  totalSiteTax?: number;
  totalExternalCommission?: number;
  totalInsurance?: number;
  totalCustoms?: number;
  totalOperationalCost?: number;
};

function money(value: number) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "MZN",
    minimumFractionDigits: 2,
  }).format(value);
}

function metricRow(label: string, value: string) {
  return `<tr><td>${label}</td><td>${value}</td></tr>`;
}

export async function GET(request: NextRequest) {
  const period = new URL(request.url).searchParams.get("period") ?? "month";

  const [statsResponse, dashboardResponse, costResponse] = await Promise.all([
    fetchBackend(request, `/admin/finance/stats?period=${period}`),
    fetchBackend(request, "/admin/dashboard"),
    fetchBackend(request, "/admin/finance/cost-breakdown"),
  ]);

  await relayAuthFailure(statsResponse);

  if (!statsResponse.ok && !dashboardResponse.ok && !costResponse.ok) {
    return jsonError("Nao foi possivel gerar o extracto financeiro.", statsResponse.status);
  }

  const stats = statsResponse.ok
    ? ((await parseBackendJson<BackendStats>(statsResponse)) ?? {})
    : {};
  const dashboard = dashboardResponse.ok
    ? ((await parseBackendJson<BackendDashboard>(dashboardResponse)) ?? {})
    : {};
  const costs = costResponse.ok
    ? ((await parseBackendJson<BackendCostBreakdown>(costResponse)) ?? {})
    : {};

  const totalRevenue = Number(stats.totalRevenue ?? 0);
  const totalCommission = Number(stats.totalCommission ?? dashboard.totalSiteRevenue ?? 0);
  const totalDelivery = Number(dashboard.totalDeliveryRevenue ?? stats.totalDelivery ?? 0);
  const totalOrders = Number(stats.totalOrders ?? 0);
  const internalSales = Number(dashboard.internalSales ?? 0);
  const externalSales = Number(dashboard.externalSales ?? 0);
  const estimatedMargin = Number(dashboard.totalEstimatedMargin ?? 0);

  const html = `<!DOCTYPE html>
<html lang="pt">
  <head>
    <meta charset="utf-8" />
    <title>Extracto financeiro ${period}</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f6f8fb; color: #122033; margin: 0; padding: 32px; }
      .sheet { max-width: 920px; margin: 0 auto; background: #ffffff; border-radius: 24px; padding: 32px; box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08); }
      h1 { margin: 0 0 8px; font-size: 28px; }
      p { margin: 0; line-height: 1.5; }
      .eyebrow { color: #e8431a; text-transform: uppercase; font-size: 12px; letter-spacing: 0.18em; font-weight: 700; }
      .grid { display: grid; gap: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 24px; }
      .card { border: 1px solid #e6ebf2; border-radius: 18px; padding: 18px; background: #fbfcfe; }
      .card strong { display: block; margin-top: 10px; font-size: 24px; }
      table { width: 100%; border-collapse: collapse; margin-top: 24px; }
      td, th { padding: 12px 10px; border-bottom: 1px solid #e6ebf2; text-align: left; }
      th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; color: #5b6478; }
      .section-title { margin-top: 32px; font-size: 20px; }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="eyebrow">Financas</div>
      <h1>Extracto financeiro</h1>
      <p>Periodo consultado: <strong>${period}</strong></p>

      <div class="grid">
        <div class="card">
          <p>Receita total</p>
          <strong>${money(totalRevenue)}</strong>
        </div>
        <div class="card">
          <p>Comissoes totais</p>
          <strong>${money(totalCommission)}</strong>
        </div>
        <div class="card">
          <p>Delivery</p>
          <strong>${money(totalDelivery)}</strong>
        </div>
        <div class="card">
          <p>Vendas internas</p>
          <strong>${money(internalSales)}</strong>
        </div>
        <div class="card">
          <p>Vendas externas</p>
          <strong>${money(externalSales)}</strong>
        </div>
      </div>

      <h2 class="section-title">Resumo executivo</h2>
      <table>
        <tbody>
          ${metricRow("Pedidos pagos", String(totalOrders))}
          ${metricRow("Receita de hoje", money(Number(stats.todayRevenue ?? 0)))}
          ${metricRow("Margem estimada", money(estimatedMargin))}
          ${metricRow("Taxa do site", money(Number(costs.totalSiteTax ?? 0)))}
          ${metricRow("Delivery", money(totalDelivery))}
          ${metricRow("Comissao externa", money(Number(costs.totalExternalCommission ?? 0)))}
          ${metricRow("Seguro e risco", money(Number(costs.totalInsurance ?? 0)))}
          ${metricRow("Alfandegas", money(Number(costs.totalCustoms ?? 0)))}
          ${metricRow("Taxa das alfândegas sul-africana", money(Number(costs.totalOperationalCost ?? 0)))}
        </tbody>
      </table>
    </div>
  </body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="extracto-${period}.html"`,
      "Cache-Control": "no-store",
    },
  });
}
