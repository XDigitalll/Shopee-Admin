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

// All tracking and note data is now persisted in the backend.
// These exports are kept for type compatibility only.
export type { InternalOrderNote };
