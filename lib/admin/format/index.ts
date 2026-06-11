export function formatMoney(value: number | string | null | undefined, currency = "MZN") {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(value: string | number | Date) {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export function formatFullDate(value: string | number | Date) {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "full",
  }).format(new Date(value));
}

export function formatRelativePercent(value: number | string | null | undefined) {
  const amount = Number(value ?? 0);
  return `${amount >= 0 ? "+" : ""}${amount.toFixed(1)}%`;
}

export function humanizeRole(role: string | null | undefined) {
  const labels: Record<string, string> = {
    SUPER_ADMIN: "Super Admin",
    ADMIN: "Admin",
    DELIVERY_DRIVER: "Estafeta",
    DELIVERY_MANAGER: "Gestor de delivery",
    ORDER_MANAGER: "Gestor de pedidos",
    CATALOG_MANAGER: "Gestor de catalogo",
    FINANCE_MANAGER: "Gestor financeiro",
    CUSTOMER_SUPPORT: "Suporte",
    CRM_MANAGER: "CRM",
    ANALYST: "Analista",
    USER: "Utilizador",
  };

  return role ? labels[role] ?? role : "Sem role";
}

export function humanizeOrderStatus(status: string | null | undefined) {
  const labels: Record<string, string> = {
    ANALYSIS: "Analise e proposta",
    PAYMENT: "Aguardando pagamento",
    EXECUTION: "Em execucao",
    COMPLETED: "Finalizado",
    UNDER_REVIEW: "Em revisao",
    QUOTED: "Cotado",
    PAID: "Pago",
    SHIPPED: "Em entrega",
    ORDERED: "No escritorio",
    IN_TRANSIT: "Em transito internacional",
    ARRIVED: "Na nossa sede",
    OUT_FOR_DELIVERY: "Saiu para entrega",
    DELIVERED: "Entregue",
    PENDING_PAYMENT: "Pagamento pendente",
    PAYMENT_SUBMITTED: "Pagamento submetido",
    PAYMENT_UNDER_REVIEW: "Pagamento em analise",
    PAYMENT_REJECTED: "Pagamento rejeitado",
    PAYMENT_ON_DELIVERY_PENDING: "Pagamento na entrega",
    READY_FOR_FULFILLMENT: "Preparar produto",
    PICKING: "Em separacao",
    PREPARING: "Em preparacao",
    READY_FOR_DELIVERY: "Pronto para entrega",
    TO_PURCHASE: "Comprar no fornecedor",
    PURCHASED: "Comprado",
    DELIVERY_FAILED: "Problema na entrega",
    CREATED: "Criado",
    RECEIVED: "Recebido",
    PRICING: "Em analise",
    AWAITING_PAYMENT: "Aguardando pagamento",
    CONFIRMED: "Confirmado",
    PROCESSING: "Em processamento",
    INTERNATIONAL_TRANSIT: "Em transito internacional",
    AT_HQ: "Na nossa sede",
    ON_THE_WAY: "A caminho",
    CANCELLED: "Cancelado",
    FAILED: "Pagamento recusado",
  };

  return status ? labels[status] ?? status : "Sem estado";
}

export function humanizePaymentMethod(method: string | null | undefined) {
  const labels: Record<string, string> = {
    MPESA: "M-Pesa",
    EMOLA: "e-Mola",
    BANK_TRANSFER: "Transferencia bancaria",
    PAYSUITE: "Pagar agora",
    MANUAL_TRANSFER: "Transferencia manual",
    VISA_MANUAL: "Visa / cartao manual",
    CASH_ON_DELIVERY: "Pagar na entrega",
    DEPOSIT_PLUS_DELIVERY: "Sinal + saldo na entrega",
    CARD: "Cartao",
  };

  return method ? labels[method] ?? method : "Sem metodo";
}
