"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useAdminAuth } from "@/hooks/useAdminAuth";
import { adminApiFetch } from "@/lib/admin/api-client";
import type { CreateExternalOrderPayload } from "@/lib/admin/types";

const STORE_OPTIONS: Array<{ value: CreateExternalOrderPayload["sourceStore"]; label: string }> = [
  { value: "SHEIN", label: "Shein" },
  { value: "AMAZON", label: "Amazon" },
  { value: "TEMU", label: "Temu" },
  { value: "BASH", label: "Bash" },
  { value: "MAKRO", label: "Makro" },
  { value: "MR_PRICE", label: "Mr Price" },
  { value: "BUFFALO", label: "Buffalo" },
  { value: "ALI_EXPRESS", label: "AliExpress" },
  { value: "ALI_BABA", label: "Alibaba" },
  { value: "ZARA", label: "Zara" },
  { value: "ASOS", label: "ASOS" },
  { value: "EBAY", label: "eBay" },
];

type ExternalOrderFormState = CreateExternalOrderPayload;

const INITIAL_FORM: ExternalOrderFormState = {
  deliveryMethod: "DELIVERY",
  sourceStore: "SHEIN",
  externalCartUrl: "",
  fullName: "",
  primaryPhoneNumber: "+258",
  alternativePhoneNumber: "",
  email: "",
  customerNotes: "",
  city: "",
  neighborhood: "",
  street: "",
  houseNumber: "",
  deliveryReference: "",
  googleMapsLink: "",
};

export function ExternalOrderCreateView() {
  const router = useRouter();
  const { hasAccess } = useAdminAuth();
  const [form, setForm] = useState<ExternalOrderFormState>(INITIAL_FORM);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isPending, startTransition] = useTransition();

  const storeLabel = useMemo(
    () => STORE_OPTIONS.find((option) => option.value === form.sourceStore)?.label ?? form.sourceStore,
    [form.sourceStore]
  );

  function updateField<Key extends keyof ExternalOrderFormState>(
    key: Key,
    value: ExternalOrderFormState[Key]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit() {
    if (!hasAccess("orders")) {
      router.replace("/admin/unauthorized");
      return;
    }

    setError("");
    setSuccess("");

    const payload: CreateExternalOrderPayload = {
      ...form,
      alternativePhoneNumber: form.alternativePhoneNumber?.trim() || undefined,
      email: form.email?.trim() || undefined,
      customerNotes: form.customerNotes?.trim() || undefined,
      city: form.city?.trim() || undefined,
      neighborhood: form.neighborhood?.trim() || undefined,
      street: form.street?.trim() || undefined,
      houseNumber: form.houseNumber?.trim() || undefined,
      deliveryReference: form.deliveryReference?.trim() || undefined,
      googleMapsLink: form.googleMapsLink?.trim() || undefined,
    };

    const response = await adminApiFetch<{ id?: number | null }>(`/api/admin/orders/external`, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    setSuccess("Pedido externo criado com sucesso.");
    router.push(response?.id ? `/admin/orders/${response.id}` : "/admin/orders");
  }

  return (
    <div className="space-y-6">
      <section className="sticky top-[88px] z-10 rounded-[28px] border border-[var(--color-border)] bg-[color:var(--color-surface-overlay)]/95 px-6 py-5 backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
              <Link href="/admin/orders" className="text-[var(--color-danger)]">
                ← Pedidos
              </Link>
              <span>/</span>
              <span>Novo pedido externo</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="font-[family-name:var(--font-sora)] text-3xl font-semibold">
                Novo pedido externo
              </h1>
              <span className="rounded-full bg-[rgba(232,67,26,0.12)] px-3 py-1 text-xs font-semibold text-[var(--color-danger)]">
                {storeLabel}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/admin/orders" className="admin-button-muted">
              Cancelar
            </Link>
            <button
              type="button"
              onClick={() =>
                startTransition(async () => {
                  try {
                    await handleSubmit();
                  } catch (submitError) {
                    setError(
                      submitError instanceof Error
                        ? submitError.message
                        : "Nao foi possivel criar o pedido externo."
                    );
                  }
                })
              }
              className="admin-button-danger"
            >
              {isPending ? "A criar..." : "Criar pedido externo"}
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-[24px] border border-[rgba(232,67,26,0.18)] bg-[rgba(232,67,26,0.08)] px-5 py-4 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-[24px] border border-[rgba(22,101,52,0.14)] bg-[rgba(22,163,74,0.08)] px-5 py-4 text-sm text-[#166534]">
          {success}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="admin-card p-6">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">
                Origem do pedido
              </p>
              <h2 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold">
                Link e loja de origem
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">
                  Loja de origem
                </span>
                <select
                  value={form.sourceStore}
                  onChange={(event) => updateField("sourceStore", event.target.value as ExternalOrderFormState["sourceStore"])}
                  className="admin-input"
                >
                  {STORE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">
                  Metodo de entrega
                </span>
                <select
                  value={form.deliveryMethod}
                  onChange={(event) =>
                    updateField("deliveryMethod", event.target.value as ExternalOrderFormState["deliveryMethod"])
                  }
                  className="admin-input"
                >
                  <option value="DELIVERY">Entrega</option>
                  <option value="STORE_PICKUP">Levantamento na loja</option>
                </select>
              </label>
            </div>

            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">
                Link do carrinho
              </span>
              <input
                value={form.externalCartUrl}
                onChange={(event) => updateField("externalCartUrl", event.target.value)}
                className="admin-input font-mono"
                placeholder="https://..."
              />
            </label>

            <div className="mt-4 rounded-[24px] border border-[#C9E2FF] bg-[#EEF6FF] px-4 py-4 text-sm text-[#124171]">
              Usa este formulario para abrir um pedido externo rapidamente e depois seguir para a analise e cotacao.
            </div>
          </section>

          <section className="admin-card p-6">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">
                Dados do cliente
              </p>
              <h2 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold">
                Identificacao e contacto
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">
                  Nome completo
                </span>
                <input
                  value={form.fullName}
                  onChange={(event) => updateField("fullName", event.target.value)}
                  className="admin-input"
                  placeholder="Nome do cliente"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">
                  Telefone principal
                </span>
                <input
                  value={form.primaryPhoneNumber}
                  onChange={(event) => updateField("primaryPhoneNumber", event.target.value)}
                  className="admin-input"
                  placeholder="+2588xxxxxxxx"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">
                  Telefone alternativo
                </span>
                <input
                  value={form.alternativePhoneNumber}
                  onChange={(event) => updateField("alternativePhoneNumber", event.target.value)}
                  className="admin-input"
                  placeholder="+2588xxxxxxxx"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">
                  Email
                </span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => updateField("email", event.target.value)}
                  className="admin-input"
                  placeholder="cliente@email.com"
                />
              </label>
            </div>
          </section>

          <section className="admin-card p-6">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">
                Entrega
              </p>
              <h2 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold">
                Morada e referencia
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">Cidade</span>
                <input value={form.city} onChange={(event) => updateField("city", event.target.value)} className="admin-input" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">Bairro</span>
                <input
                  value={form.neighborhood}
                  onChange={(event) => updateField("neighborhood", event.target.value)}
                  className="admin-input"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">Rua</span>
                <input value={form.street} onChange={(event) => updateField("street", event.target.value)} className="admin-input" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">Numero da casa</span>
                <input
                  value={form.houseNumber}
                  onChange={(event) => updateField("houseNumber", event.target.value)}
                  className="admin-input"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">
                  Referencia de entrega
                </span>
                <input
                  value={form.deliveryReference}
                  onChange={(event) => updateField("deliveryReference", event.target.value)}
                  className="admin-input"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">
                  Link do Google Maps
                </span>
                <input
                  value={form.googleMapsLink}
                  onChange={(event) => updateField("googleMapsLink", event.target.value)}
                  className="admin-input font-mono"
                  placeholder="https://maps.google.com/..."
                />
              </label>
            </div>
          </section>

          <section className="admin-card p-6">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">
                Notas
              </p>
              <h2 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold">
                Contexto do pedido
              </h2>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">
                Notas do cliente
              </span>
              <textarea
                rows={5}
                value={form.customerNotes}
                onChange={(event) => updateField("customerNotes", event.target.value)}
                className="admin-input min-h-[140px] resize-y"
                placeholder="Itens pretendidos, tamanhos, cores, observacoes, etc."
              />
            </label>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="admin-card p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger)]">
              Resumo
            </p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text-secondary)]">Loja</span>
                <strong>{storeLabel}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text-secondary)]">Entrega</span>
                <strong>{form.deliveryMethod === "DELIVERY" ? "Entrega" : "Levantamento"}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text-secondary)]">Cliente</span>
                <strong>{form.fullName || "Por preencher"}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text-secondary)]">Telefone</span>
                <strong>{form.primaryPhoneNumber || "Por preencher"}</strong>
              </div>
            </div>
            <div className="my-4 h-px bg-[var(--color-border)]" />
            <p className="text-sm text-[var(--color-text-secondary)]">
              Depois de criar o pedido, a equipa segue diretamente para a analise, cotacao e validacao de pagamento dentro do mesmo fluxo.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
