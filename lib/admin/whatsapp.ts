export function normalizeWhatsappPhone(phone: string | null | undefined) {
  const digits = (phone || "").replace(/[+\s()-]/g, "").replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  if (digits.startsWith("258") && digits.length === 12) {
    return digits;
  }

  if (digits.length === 9 && digits.startsWith("8")) {
    return `258${digits}`;
  }

  return null;
}

export function buildWhatsAppUrl(phone: string | null | undefined, message?: string | null) {
  const normalizedPhone = normalizeWhatsappPhone(phone);

  if (!normalizedPhone) {
    return null;
  }

  const url = new URL(`https://wa.me/${normalizedPhone}`);
  const text = message?.trim();
  if (text) {
    url.searchParams.set("text", text);
  }

  return url.toString();
}

export function buildOrderWhatsAppMessage(orderNumber: string) {
  return `Olá 👋\nEstamos a acompanhar o teu pedido ${orderNumber} na ShopeeMz.`;
}

export function buildPhoneHref(phone: string | null | undefined) {
  const trimmed = phone?.trim();
  return trimmed ? `tel:${trimmed.replace(/\s/g, "")}` : null;
}
