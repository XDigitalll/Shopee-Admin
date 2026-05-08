export const ADMIN_DATA_CHANGED_EVENT = "admin:data-changed";

export function emitAdminDataChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(ADMIN_DATA_CHANGED_EVENT));
}
