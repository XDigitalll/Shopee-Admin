"use client";

import { useEffect, useMemo, useState } from "react";

import { adminApiFetch } from "@/lib/admin/api-client";
import type { PricingCurrency, ShippingLocationOption, ShippingRouteOption } from "@/lib/admin/types";

type Feedback = { tone: "success" | "error"; message: string } | null;

const inputClass = "admin-input h-11 rounded-2xl px-3 py-2 text-sm";

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function PricingConfigPanel() {
  const [currencies, setCurrencies] = useState<PricingCurrency[]>([]);
  const [locations, setLocations] = useState<ShippingLocationOption[]>([]);
  const [routes, setRoutes] = useState<ShippingRouteOption[]>([]);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [currencyForm, setCurrencyForm] = useState({ code: "EUR", name: "Euro", symbol: "€" });
  const [locationForm, setLocationForm] = useState({ country: "", city: "", label: "" });
  const [routeForm, setRouteForm] = useState({
    originLocationId: "",
    destinationLocationId: "",
    name: "",
    currencyCode: "ZAR",
    shippingFee: "",
    customsPercent: "0",
    riskPercent: "0",
    sitePercent: "0",
    estimatedMinDays: "",
    estimatedMaxDays: "",
    notes: "",
  });

  const activeLocations = useMemo(() => locations.filter((location) => location.active), [locations]);

  async function load() {
    setIsLoading(true);
    try {
      const [currencyRows, locationRows, routeRows] = await Promise.all([
        adminApiFetch<PricingCurrency[]>("/api/admin/currencies"),
        adminApiFetch<ShippingLocationOption[]>("/api/admin/shipping-locations"),
        adminApiFetch<ShippingRouteOption[]>("/api/admin/shipping-routes"),
      ]);
      setCurrencies(currencyRows);
      setLocations(locationRows);
      setRoutes(routeRows);
      setFeedback(null);
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Nao foi possivel carregar configuracoes." });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createCurrency() {
    try {
      await adminApiFetch("/api/admin/currencies", {
        method: "POST",
        body: JSON.stringify({ ...currencyForm, active: true }),
      });
      setFeedback({ tone: "success", message: "Moeda criada." });
      await load();
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Nao foi possivel criar moeda." });
    }
  }

  async function createLocation() {
    try {
      await adminApiFetch("/api/admin/shipping-locations", {
        method: "POST",
        body: JSON.stringify({ ...locationForm, active: true }),
      });
      setLocationForm({ country: "", city: "", label: "" });
      setFeedback({ tone: "success", message: "Local criado." });
      await load();
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Nao foi possivel criar local." });
    }
  }

  async function createRoute() {
    try {
      await adminApiFetch("/api/admin/shipping-routes", {
        method: "POST",
        body: JSON.stringify({
          ...routeForm,
          originLocationId: Number(routeForm.originLocationId),
          destinationLocationId: Number(routeForm.destinationLocationId),
          shippingFee: numberValue(routeForm.shippingFee),
          customsPercent: numberValue(routeForm.customsPercent),
          riskPercent: numberValue(routeForm.riskPercent),
          sitePercent: numberValue(routeForm.sitePercent),
          estimatedMinDays: routeForm.estimatedMinDays ? Number(routeForm.estimatedMinDays) : null,
          estimatedMaxDays: routeForm.estimatedMaxDays ? Number(routeForm.estimatedMaxDays) : null,
          active: true,
        }),
      });
      setFeedback({ tone: "success", message: "Rota criada." });
      await load();
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Nao foi possivel criar rota." });
    }
  }

  async function toggleCurrency(currency: PricingCurrency) {
    await adminApiFetch(`/api/admin/currencies/${currency.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !currency.active }),
    });
    await load();
  }

  async function toggleLocation(location: ShippingLocationOption) {
    await adminApiFetch(`/api/admin/shipping-locations/${location.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !location.active }),
    });
    await load();
  }

  async function toggleRoute(route: ShippingRouteOption) {
    await adminApiFetch(`/api/admin/shipping-routes/${route.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        originLocationId: route.origin.id,
        destinationLocationId: route.destination.id,
        name: route.name,
        currencyCode: route.currencyCode,
        shippingFee: route.shippingFee,
        customsPercent: route.customsPercent,
        riskPercent: route.riskPercent,
        sitePercent: route.sitePercent,
        estimatedMinDays: route.estimatedMinDays,
        estimatedMaxDays: route.estimatedMaxDays,
        active: !route.active,
        notes: route.notes,
      }),
    });
    await load();
  }

  async function duplicateRoute(route: ShippingRouteOption) {
    await adminApiFetch(`/api/admin/shipping-routes/${route.id}/duplicate`, { method: "POST" });
    await load();
  }

  return (
    <section className="admin-card p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">Moedas e rotas</p>
          <h2 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold">Motor de cotacao internacional</h2>
          <p className="mt-2 max-w-3xl text-sm text-[var(--color-text-secondary)]">
            Define moedas, locais e rotas. Os valores das rotas sao manuais e ficam guardados como snapshot em cada cotacao.
          </p>
        </div>
        <button type="button" onClick={() => void load()} className="admin-button-muted h-11 px-4 text-sm">
          {isLoading ? "A carregar..." : "Actualizar"}
        </button>
      </div>

      {feedback ? (
        <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${feedback.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
          {feedback.message}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-[var(--color-border)] p-4">
          <h3 className="font-semibold text-[var(--color-text-primary)]">Moedas</h3>
          <div className="mt-3 grid gap-2">
            <input className={inputClass} value={currencyForm.code} onChange={(e) => setCurrencyForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="EUR" />
            <input className={inputClass} value={currencyForm.name} onChange={(e) => setCurrencyForm((f) => ({ ...f, name: e.target.value }))} placeholder="Euro" />
            <input className={inputClass} value={currencyForm.symbol} onChange={(e) => setCurrencyForm((f) => ({ ...f, symbol: e.target.value }))} placeholder="€" />
            <button type="button" onClick={() => void createCurrency()} className="admin-button-danger justify-center text-sm">Criar moeda</button>
          </div>
          <div className="mt-4 space-y-2">
            {currencies.map((currency) => (
              <div key={currency.id} className="flex items-center justify-between rounded-xl bg-[var(--color-background-tertiary)] px-3 py-2 text-sm">
                <span><strong>{currency.code}</strong> {currency.name}</span>
                <button type="button" onClick={() => void toggleCurrency(currency)} className="text-xs font-bold text-[var(--color-danger)]">
                  {currency.active ? "Desactivar" : "Activar"}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] p-4">
          <h3 className="font-semibold text-[var(--color-text-primary)]">Locais</h3>
          <div className="mt-3 grid gap-2">
            <input className={inputClass} value={locationForm.country} onChange={(e) => setLocationForm((f) => ({ ...f, country: e.target.value }))} placeholder="Portugal" />
            <input className={inputClass} value={locationForm.city} onChange={(e) => setLocationForm((f) => ({ ...f, city: e.target.value }))} placeholder="Lisboa" />
            <input className={inputClass} value={locationForm.label} onChange={(e) => setLocationForm((f) => ({ ...f, label: e.target.value }))} placeholder="Lisboa, Portugal" />
            <button type="button" onClick={() => void createLocation()} className="admin-button-danger justify-center text-sm">Criar local</button>
          </div>
          <div className="mt-4 max-h-72 space-y-2 overflow-auto">
            {locations.map((location) => (
              <div key={location.id} className="flex items-center justify-between rounded-xl bg-[var(--color-background-tertiary)] px-3 py-2 text-sm">
                <span>{location.label}</span>
                <button type="button" onClick={() => void toggleLocation(location)} className="text-xs font-bold text-[var(--color-danger)]">
                  {location.active ? "Desactivar" : "Activar"}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] p-4">
          <h3 className="font-semibold text-[var(--color-text-primary)]">Rotas</h3>
          <div className="mt-3 grid gap-2">
            <input className={inputClass} value={routeForm.name} onChange={(e) => setRouteForm((f) => ({ ...f, name: e.target.value }))} placeholder="Portugal -> Maputo" />
            <select className={inputClass} value={routeForm.originLocationId} onChange={(e) => setRouteForm((f) => ({ ...f, originLocationId: e.target.value }))}>
              <option value="">Origem</option>
              {activeLocations.map((location) => <option key={location.id} value={location.id}>{location.label}</option>)}
            </select>
            <select className={inputClass} value={routeForm.destinationLocationId} onChange={(e) => setRouteForm((f) => ({ ...f, destinationLocationId: e.target.value }))}>
              <option value="">Destino</option>
              {activeLocations.map((location) => <option key={location.id} value={location.id}>{location.label}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input className={inputClass} value={routeForm.currencyCode} onChange={(e) => setRouteForm((f) => ({ ...f, currencyCode: e.target.value.toUpperCase() }))} placeholder="EUR" />
              <input className={inputClass} value={routeForm.shippingFee} onChange={(e) => setRouteForm((f) => ({ ...f, shippingFee: e.target.value }))} placeholder="Envio" />
              <input className={inputClass} value={routeForm.customsPercent} onChange={(e) => setRouteForm((f) => ({ ...f, customsPercent: e.target.value }))} placeholder="Alfandega %" />
              <input className={inputClass} value={routeForm.riskPercent} onChange={(e) => setRouteForm((f) => ({ ...f, riskPercent: e.target.value }))} placeholder="Risco %" />
              <input className={inputClass} value={routeForm.sitePercent} onChange={(e) => setRouteForm((f) => ({ ...f, sitePercent: e.target.value }))} placeholder="Site %" />
              <input className={inputClass} value={routeForm.estimatedMinDays} onChange={(e) => setRouteForm((f) => ({ ...f, estimatedMinDays: e.target.value }))} placeholder="Min dias" />
              <input className={inputClass} value={routeForm.estimatedMaxDays} onChange={(e) => setRouteForm((f) => ({ ...f, estimatedMaxDays: e.target.value }))} placeholder="Max dias" />
            </div>
            <button type="button" onClick={() => void createRoute()} className="admin-button-danger justify-center text-sm">Criar rota</button>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {routes.map((route) => (
          <div key={route.id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-tertiary)] p-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-[var(--color-text-primary)]">{route.name}</p>
                <p className="mt-1 text-[var(--color-text-secondary)]">{route.origin.label} {"->"} {route.destination.label}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${route.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                {route.active ? "Activa" : "Inactiva"}
              </span>
            </div>
            <p className="mt-3 text-[var(--color-text-secondary)]">
              {route.shippingFee} {route.currencyCode} / Alfandega {route.customsPercent}% / Risco {route.riskPercent}% / Site {route.sitePercent}% / {route.estimatedDaysLabel || "prazo a confirmar"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void toggleRoute(route)} className="admin-button-muted px-3 py-2 text-xs">
                {route.active ? "Desactivar" : "Activar"}
              </button>
              <button type="button" onClick={() => void duplicateRoute(route)} className="admin-button-muted px-3 py-2 text-xs">
                Duplicar
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
