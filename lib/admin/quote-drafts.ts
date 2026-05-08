import type { ExternalOrderDraft } from "@/lib/admin/types";

const draftStore = new Map<string, ExternalOrderDraft>();

export function getQuoteDraft(orderId: string) {
  return draftStore.get(orderId) ?? null;
}

export function saveQuoteDraft(orderId: string, draft: ExternalOrderDraft) {
  draftStore.set(orderId, draft);
  return draft;
}

export function clearQuoteDraft(orderId: string) {
  draftStore.delete(orderId);
}
