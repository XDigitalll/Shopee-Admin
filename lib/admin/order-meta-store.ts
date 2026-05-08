import type { InternalOrderNote } from "@/lib/admin/types";

export type TrackingCarrier = "DHL" | "FEDEX" | "CTT" | "OTHER";

export type TrackingHistoryRecord = {
  id: string;
  at: string;
  description: string;
};

export type TrackingMeta = {
  trackingCode: string;
  carrier: TrackingCarrier | "";
  estimatedDelivery: string;
  trackingUrl: string;
  history: TrackingHistoryRecord[];
};

const trackingStore = new Map<string, TrackingMeta>();
const notesStore = new Map<string, InternalOrderNote[]>();

function getEmptyTrackingMeta(): TrackingMeta {
  return {
    trackingCode: "",
    carrier: "",
    estimatedDelivery: "",
    trackingUrl: "",
    history: [],
  };
}

export function getTrackingCode(orderId: string) {
  return trackingStore.get(orderId)?.trackingCode ?? "";
}

export function saveTrackingCode(orderId: string, trackingCode: string) {
  const current = trackingStore.get(orderId) ?? getEmptyTrackingMeta();
  trackingStore.set(orderId, {
    ...current,
    trackingCode,
  });
  return trackingCode;
}

export function getTrackingMeta(orderId: string) {
  return trackingStore.get(orderId) ?? getEmptyTrackingMeta();
}

export function saveTrackingMeta(
  orderId: string,
  payload: {
    trackingCode?: string;
    carrier?: TrackingCarrier | "";
    estimatedDelivery?: string;
    trackingUrl?: string;
  }
) {
  const current = trackingStore.get(orderId) ?? getEmptyTrackingMeta();
  const next: TrackingMeta = {
    trackingCode: payload.trackingCode ?? current.trackingCode,
    carrier: payload.carrier ?? current.carrier,
    estimatedDelivery: payload.estimatedDelivery ?? current.estimatedDelivery,
    trackingUrl: payload.trackingUrl ?? current.trackingUrl,
    history: current.history,
  };

  trackingStore.set(orderId, next);
  return next;
}

export function prependTrackingHistory(orderId: string, entry: TrackingHistoryRecord) {
  const current = trackingStore.get(orderId) ?? getEmptyTrackingMeta();
  const next: TrackingMeta = {
    ...current,
    history: [entry, ...current.history],
  };
  trackingStore.set(orderId, next);
  return next.history;
}

export function getTrackingHistory(orderId: string) {
  return getTrackingMeta(orderId).history;
}

export function getOrderNotes(orderId: string) {
  return notesStore.get(orderId) ?? [];
}

export function addOrderNote(orderId: string, note: InternalOrderNote) {
  const current = notesStore.get(orderId) ?? [];
  const next = [note, ...current];
  notesStore.set(orderId, next);
  return next;
}
