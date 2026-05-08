type DeliveryAssignment = {
  driverId: string;
  driverName: string | null;
  driverEmail: string | null;
  driverPhone: string | null;
  assignedAt: string;
};

type DeliveryIssue = {
  id: string;
  type: string;
  note: string | null;
  createdAt: string;
};

type DeliveryMeta = {
  deliveryFee: number | null;
  estimatedDeliveryHours: number | null;
  notes: string | null;
  feeDefinedAt: string | null;
  assignment: DeliveryAssignment | null;
  startedAt: string | null;
  deliveredAt: string | null;
  issues: DeliveryIssue[];
};

const deliveryMetaStore = new Map<number, DeliveryMeta>();
const assignedDeliverySnapshots = new Map<number, Record<string, unknown>>();

function getDefaultMeta(): DeliveryMeta {
  return {
    deliveryFee: null,
    estimatedDeliveryHours: null,
    notes: null,
    feeDefinedAt: null,
    assignment: null,
    startedAt: null,
    deliveredAt: null,
    issues: [],
  };
}

function ensureMeta(orderId: number) {
  const current = deliveryMetaStore.get(orderId);
  if (current) {
    return current;
  }

  const created = getDefaultMeta();
  deliveryMetaStore.set(orderId, created);
  return created;
}

export function getDeliveryMeta(orderId: number) {
  return deliveryMetaStore.get(orderId) ?? getDefaultMeta();
}

export function saveDeliveryPricing(orderId: number, payload: {
  deliveryFee: number;
  estimatedDeliveryHours: number | null;
  notes: string | null;
}) {
  const current = ensureMeta(orderId);
  current.deliveryFee = payload.deliveryFee;
  current.estimatedDeliveryHours = payload.estimatedDeliveryHours;
  current.notes = payload.notes;
  current.feeDefinedAt = new Date().toISOString();
  deliveryMetaStore.set(orderId, current);
  return current;
}

export function saveDeliveryAssignment(orderId: number, payload: {
  driverId: string;
  driverName: string | null;
  driverEmail: string | null;
  driverPhone: string | null;
}) {
  const current = ensureMeta(orderId);
  current.assignment = {
    ...payload,
    assignedAt: new Date().toISOString(),
  };
  deliveryMetaStore.set(orderId, current);
  return current;
}

export function saveDeliveryAssignmentSnapshot(orderId: number, payload: Record<string, unknown>) {
  assignedDeliverySnapshots.set(orderId, {
    ...payload,
    id: orderId,
  });
}

export function listDeliveryAssignmentSnapshots() {
  return Array.from(assignedDeliverySnapshots.values());
}

export function markDeliveryStarted(orderId: number) {
  const current = ensureMeta(orderId);
  current.startedAt = new Date().toISOString();
  deliveryMetaStore.set(orderId, current);
  return current;
}

export function markDeliveryCompleted(orderId: number) {
  const current = ensureMeta(orderId);
  current.deliveredAt = new Date().toISOString();
  deliveryMetaStore.set(orderId, current);
  return current;
}

export function addDeliveryIssue(orderId: number, payload: {
  type: string;
  note: string | null;
}) {
  const current = ensureMeta(orderId);
  current.deliveryFee = null;
  current.estimatedDeliveryHours = null;
  current.feeDefinedAt = null;
  current.assignment = null;
  current.startedAt = null;
  current.issues = [
    {
      id: `issue-${orderId}-${Date.now()}`,
      type: payload.type,
      note: payload.note,
      createdAt: new Date().toISOString(),
    },
    ...current.issues,
  ];
  deliveryMetaStore.set(orderId, current);
  return current;
}
