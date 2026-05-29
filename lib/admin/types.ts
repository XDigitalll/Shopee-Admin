import type { CustomerOrderStage, OrderQueueStatus, RawAdminOrderStatus } from "@/lib/admin/order-status";
import type { AdminModule, AdminRole } from "@/lib/admin/roles";

export type TrackingStep = {
  key: string;
  label: string;
  description?: string | null;
  /** COMPLETED | CURRENT | PENDING | FAILED */
  state: "COMPLETED" | "CURRENT" | "PENDING" | "FAILED";
  occurredAt?: string | null;
  visibleToCustomer?: boolean;
  visibleToAdmin?: boolean;
};

export type AdminMetric = {
  id: string;
  label: string;
  value: number;
  icon: string;
  delta: number;
};

export type TodayStatsResponse = {
  metrics: AdminMetric[];
  badges: {
    orders: number;
    quotes: number;
    payments: number;
    delivery: number;
  };
};

export type RecentOrder = {
  id: number;
  number: string;
  customer: string;
  type: "EXTERNAL" | "INTERNAL";
  totalAmount: number;
  status: string;
  createdAt: string;
  actionLabel: string;
  actionHref: string;
};

export type OrderPriority = "HIGH" | "MEDIUM" | "LOW";

export type OrdersFilterState = {
  status:
    | "ALL"
    | "ANALYSIS"
    | "PAYMENT"
    | "EXECUTION"
    | "DELIVERY"
    | "COMPLETED"
    | "CANCELLED"
    | "UNDER_REVIEW"
    | "QUOTED"
    | "PENDING_PAYMENT"
    | "PAYMENT_SUBMITTED"
    | "PAYMENT_UNDER_REVIEW"
    | "PAYMENT_REJECTED"
    | "PAID";
  type: "ALL" | "EXTERNAL" | "INTERNAL";
  period: "ALL" | "TODAY" | "THIS_WEEK";
  search: string;
  date: string;
  page: number;
  size: number;
};

export type AdminOrderListItem = {
  id: number;
  number: string;
  customer: string;
  customerEmail: string;
  customerInitials: string;
  type: "EXTERNAL" | "INTERNAL";
  totalAmount: number;
  status: string;
  orderStatus?: string | null;
  operationalStatusLabel?: string | null;
  customerStatusLabel?: string | null;
  fulfillmentStatus?: string | null;
  operationalStatus?: string | null;
  quoteQueueStatus?: AdminQuoteQueueStatus | null;
  uiStatus: RawAdminOrderStatus;
  queueStatus: Exclude<OrderQueueStatus, "ALL">;
  customerStage: CustomerOrderStage;
  priority: OrderPriority;
  priorityLabel: string;
  createdAt: string;
  sourceStore: string;
  externalCartUrl: string | null;
  actionHref: string;
  paymentStatus: string | null;
  paymentMethod: string | null;
  deliveryMethod: "DELIVERY" | "STORE_PICKUP" | null;
  actionRequired?: boolean;
  actionModule?: string | null;
  actionReason?: string | null;
  nextActionLabel?: string | null;
  nextActionModule?: string | null;
  isArchived?: boolean | null;
  primaryActionLabel?: string | null;
  primaryActionEndpoint?: string | null;
  primaryActionMethod?: string | null;
  allowedActions?: string[];
  trackingSummarySteps?: TrackingStep[] | null;
  trackingDetailSteps?: TrackingStep[] | null;
};

export type OrdersPageResponse = {
  content: AdminOrderListItem[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export type OrdersStatsResponse = {
  total: number;
  analysis: number;
  payment: number;
  execution: number;
  completed: number;
  cancelled: number;
};

export type DeliveryStatsResponse = {
  awaitingAtOffice: number;
  activeNow: number;
  deliveredToday: number;
  successRate: number;
};

export type DeliveryOrderItem = {
  productId: number | null;
  productCode: string | null;
  productName: string;
  quantity: number;
  unitPrice: number | null;
  subtotal: number | null;
  originType: "LOCAL_STOCK" | "EXTERNAL_ORDER" | string;
};

export type DeliveryPendingOrder = {
  id: number;
  orderCode: string | null;
  customerCode: string | null;
  number: string;
  customerName: string;
  customerPhone: string | null;
  address: string;
  deliveryCity: string | null;
  deliveryNeighborhood: string | null;
  deliveryStreet: string | null;
  houseNumber: string | null;
  deliveryReference: string | null;
  googleMapsLink: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  items: DeliveryOrderItem[];
  itemsSummary: string[];
  sourceStore: string;
  officeArrivedAt: string | null;
  status: string;
  urgent: boolean;
  deliveryFee: number | null;
  baseAmount: number | null;
  totalAmount: number | null;
  estimatedDeliveryHours: number | null;
  deliveryFeeSetAt: string | null;
  deliveryFeeSetBy: string | null;
  notes: string | null;
  assignedDriverId: string | null;
  assignedDriverName: string | null;
  assignedDriverEmail?: string | null;
  assignedDriverPhone?: string | null;
  deliveryAttempt: number | null;
  lastIssueType: string | null;
};

export type DeliveryActiveOrder = {
  id: number;
  number: string;
  customerName: string;
  customerPhone: string | null;
  address: string;
  deliveryCity?: string | null;
  deliveryNeighborhood?: string | null;
  deliveryStreet?: string | null;
  houseNumber?: string | null;
  deliveryReference?: string | null;
  googleMapsLink?: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  sourceStore: string;
  driverId: string | null;
  driverName: string | null;
  driverEmail?: string | null;
  driverAvatarUrl: string | null;
  driverPhone: string | null;
  leftOfficeAt: string | null;
  elapsedMinutes: number | null;
  deliveryFee: number | null;
  items: DeliveryOrderItem[];
  totalAmount: number | null;
  estimatedDeliveryHours: number | null;
  status: string;
  urgent: boolean;
  deliveryAttempt: number | null;
};

export type DeliveryHistoryStatus = "DELIVERED" | "PROBLEM";

export type DeliveryHistoryItem = {
  id: number;
  number: string;
  customerName: string;
  driverName: string | null;
  deliveryFee: number | null;
  leftOfficeAt: string | null;
  deliveredAt: string | null;
  durationMinutes: number | null;
  sourceStore: string;
  status: DeliveryHistoryStatus;
  issueType: string | null;
};

export type DeliveryHistoryResponse = {
  content: DeliveryHistoryItem[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export type DeliveryDriverAvailability = "AVAILABLE" | "ON_DELIVERY" | "OFFLINE";

export type DeliveryDriver = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  availability: DeliveryDriverAvailability;
  deliveriesToday: number;
  deliveriesTotal: number;
  successRate: number;
};

export type DeliveryDriversResponse = {
  content: DeliveryDriver[];
};

export type ExternalOrderLineItem = {
  id: string;
  sequence: number;
  name: string;
  productCode?: string | null;
  details: string;
  quantity: number;
  originalPriceUsd: number;
  subtotal?: number | null;
  imageUrl?: string | null;
  productId?: number | null;
  productDescription?: string | null;
  variantLabel?: string | null;
  variantSku?: string | null;
  variantAttributes?: Record<string, string> | null;
  categoryName?: string | null;
  stockLabel?: string | null;
};

export type ExternalOrderDraft = {
  exchangeRate: number;
  baseAmount: number;
  shippingFee: number;
  currency: string;
  commissionPercentage: number;
  returnRiskPercentage: number;
  operationalCostPercentage: number;
  urgentPercentage: number;
  urgentAmount: number;
  totalFinal: number;
  notes: string;
  validityDate: string;
};

export type QuoteDefaultsResponse = {
  commissionPercentage: number;
  returnRiskPercentage: number;
  operationalCostPercentage: number;
  urgentPercentage: number;
};

export type ExternalOrderDetail = {
  id: number;
  number: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerVerified: boolean;
  customerId: number | null;
  type: "EXTERNAL" | "INTERNAL";
  status: string;
  quoteQueueStatus: AdminQuoteQueueStatus | null;
  operationalStatus: string;
  actionRequired: boolean;
  nextActionLabel: string | null;
  nextActionModule: string | null;
  allowedActions?: string[];
  isArchived: boolean;
  deliveryMethod: "DELIVERY" | "STORE_PICKUP" | null;
  urgentRequest: boolean;
  externalCartUrl: string;
  requestInputType: "LINK" | "DESCRIPTION" | null;
  productDetails: string;
  requestedQuantity: number;
  requestScreenshotUrl: string;
  sourceStore: string;
  createdAt: string;
  totalAmount: number;
  totalBeforeDiscount?: number | null;
  couponCode?: string | null;
  discountAmount?: number | null;
  totalAfterDiscount?: number | null;
  suggestedBaseAmount: number;
  externalItems: ExternalOrderLineItem[];
  latestQuoteSentAt: string | null;
  quoteDraft: ExternalOrderDraft | null;
  city: string;
  deliveryAddress: string;
  deliveryReference: string;
  googleMapsLink: string;
  customerNotes: string;
  itemSubtotal: number;
  additionalCosts: {
    freight: number;
    customs: number;
    urgent: number;
    localDelivery: number;
    commission: number;
    discount: number;
  };
  quoteExchangeRate: number | null;
  quoteCurrency: string | null;
  trackingCode: string;
  trackingCarrier?: "DHL" | "FEDEX" | "CTT" | "OTHER" | "";
  estimatedDelivery?: string | null;
  trackingUrl: string | null;
  payment: OrderPaymentDetail;
  internalNotes: InternalOrderNote[];
  recentCustomerOrders: Array<{
    id: number;
    number: string;
    status: string;
    totalAmount: number;
    createdAt: string;
  }>;
  history?: OrderHistoryEntry[];
};

export type OrderHistoryEntry = {
  id: string;
  label: string;
  date: string | null;
  state: "done" | "current" | "future";
  description?: string;
  actor?: string;
  iconColor?: string;
};

export type TrackingHistoryEntry = {
  id: string;
  date: string;
  description: string;
};

export type QuoteSubmissionPayload = {
  exchangeRate?: number;
  baseAmount: number;
  shippingFee: number;
  currency: string;
  commissionPercentage: number;
  returnRiskPercentage: number;
  operationalCostPercentage: number;
  urgentPercentage?: number;
  urgentAmount?: number;
  notes: string;
  validityDate: string;
};

export type CurrencyCode = "USD" | "ZAR" | "MZN";

export type ExchangeRateSource = "MANUAL" | "API" | "ADMIN_OVERRIDE";

export type ExchangeRate = {
  id: number;
  baseCurrency: CurrencyCode;
  targetCurrency: CurrencyCode;
  rate: number;
  source: ExchangeRateSource;
  active: boolean;
  createdAt: string;
  createdBy: string | null;
  validFrom: string;
  validUntil: string | null;
  notes: string | null;
};

export type ExchangeRateRequest = {
  baseCurrency: Exclude<CurrencyCode, "MZN">;
  targetCurrency: "MZN";
  rate: number;
  source?: ExchangeRateSource;
  validFrom?: string;
  notes?: string;
};

export type InternalOrderNote = {
  id: string;
  content: string;
  author: string;
  createdAt: string;
};

export type OrderPaymentDetail = {
  id: number | null;
  amount: number;
  method: string | null;
  provider?: string | null;
  providerReference?: string | null;
  providerStatus?: string | null;
  checkoutUrl?: string | null;
  expectedAmount?: number | null;
  status: string | null;
  transactionId: string | null;
  payerName: string | null;
  payerPhone: string | null;
  notes: string | null;
  adminNote: string | null;
  paymentDate: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  receiptUrl: string | null;
};

export type AdminPaymentStatusFilter = "ALL" | "PENDING" | "VALIDATED" | "REJECTED";

export type AdminPaymentMethodFilter =
  | "ALL"
  | "MPESA"
  | "EMOLA"
  | "VISA"
  | "MASTERCARD";

export type AdminPaymentPeriodFilter = "ALL" | "TODAY" | "7D" | "30D";

export type AdminPaymentOrderItem = {
  productId: number | null;
  productName: string | null;
  productImageUrl: string | null;
  variantId: number | null;
  variantLabel: string | null;
  variantSku: string | null;
  variantAttributes: Record<string, string> | null;
  quantity: number | null;
  unitPrice: number | null;
  subtotal: number | null;
  productLink?: string | null;
  requestScreenshotUrl?: string | null;
  externalVariant?: string | null;
  finalAmountMzn?: number | null;
};

export type AdminPaymentListItem = {
  id: number;
  status: "PENDING" | "VALIDATED" | "REJECTED" | "CANCELLED";
  receiptSubmitted: boolean;
  orderId: number;
  orderNumber: string;
  customerId: number | null;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  method: "MPESA" | "EMOLA" | "VISA" | "MASTERCARD" | string | null;
  provider?: "MANUAL" | "PAYSUITE" | string | null;
  providerReference?: string | null;
  providerStatus?: string | null;
  checkoutUrl?: string | null;
  expectedAmount?: number | null;
  amount: number;
  submittedAt: string | null;
  reviewedAt: string | null;
  paymentDate: string | null;
  transactionId: string | null;
  payerName: string | null;
  payerPhone: string | null;
  notes: string | null;
  adminNote: string | null;
  orderItems?: AdminPaymentOrderItem[];
  allowedActions?: PaymentAllowedActions;
};

export type AdminPaymentsPageResponse = {
  content: AdminPaymentListItem[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export type AdminPaymentStatsResponse = {
  all: number;
  pending: number;
  validated: number;
  rejected: number;
  pendingValidationCount: number;
  validatedTodayAmount: number;
};

export type AdminPaymentReceiptResponse = {
  url: string | null;
};

export type PaymentSubmissionStatus = "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "FLAGGED" | "SUSPICIOUS" | "REQUEST_NEW_PROOF" | "REQUESTED_NEW_PROOF";
export type PaymentSubmissionQueue = "AWAITING_SUBMISSION" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "SUSPICIOUS" | "REQUEST_NEW_PROOF";
export type PaymentMethodType = "EMOLA" | "MPESA" | "BANK_TRANSFER" | "VISA_MANUAL";

export type PaymentAllowedActions = {
  canStartReview: boolean;
  canReopenReview?: boolean;
  canApprove: boolean;
  canApproveWithMismatch?: boolean;
  canReject: boolean;
  canMarkSuspect: boolean;
  canRequestNewProof: boolean;
};

export type PaymentSubmissionQueueStats = {
  awaitingSubmission: number;
  submitted: number;
  underReview: number;
  approved: number;
  rejected: number;
  suspicious: number;
  requestNewProof?: number;
  pendingAttentionCount?: number;
};

export type PaymentAwaitingSubmission = {
  orderId: number;
  orderCode: string | null;
  customerName: string | null;
  customerEmail: string | null;
  expectedAmount: number | null;
  orderStatus: string | null;
  orderDate: string | null;
};

export type PaymentSubmission = {
  id: number;
  orderId: number | null;
  orderCode: string | null;
  orderStatus: string | null;
  orderType?: string | null;
  itemCount?: number | null;
  orderCreatedAt?: string | null;
  expectedAmount: number | null;
  declaredAmount?: number | null;
  differenceAmount?: number | null;
  amountMismatch?: boolean | null;
  mismatchOverrideReason?: string | null;
  mismatchApprovedBy?: string | null;
  mismatchApprovedAt?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerCommunicationPhone?: string | null;
  customerEmail?: string | null;
  customerCity?: string | null;
  customerPreviousOrders?: number | null;
  customerApprovedPayments?: number | null;
  customerRiskFlags?: number | null;
  paymentMethod: PaymentMethodType | string | null;
  payerName: string | null;
  payerPhone: string | null;
  payerBank: string | null;
  transactionReference: string | null;
  amount: number | null;
  currency: string | null;
  proofUrl: string | null;
  proofType: string | null;
  status: PaymentSubmissionStatus;
  bucket?: PaymentSubmissionQueue | null;
  currentBucket?: PaymentSubmissionQueue | null;
  isResubmission?: boolean | null;
  hasUnreadChanges?: boolean | null;
  actionRequired?: boolean | null;
  actionReason?: string | null;
  isTerminal?: boolean | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  riskFlags: string[];
  matchedTransactionId: string | null;
  metadata: Record<string, unknown> | null;
  orderItems?: AdminPaymentOrderItem[];
  allowedActions?: PaymentAllowedActions;
  orderHistory?: Array<{
    id?: number;
    action?: string | null;
    description?: string | null;
    performedByEmail?: string | null;
    performedByName?: string | null;
    createdAt?: string | null;
  }>;
};

export type PaymentSubmissionsPage = {
  content: PaymentSubmission[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export type AwaitingPaymentSubmissionsPage = {
  content: PaymentAwaitingSubmission[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export type CreateExternalOrderPayload = {
  deliveryMethod: "DELIVERY";
  sourceStore:
    | "SHEIN"
    | "AMAZON"
    | "TEMU"
    | "BASH"
    | "MAKRO"
    | "MR_PRICE"
    | "BUFFALO"
    | "ALI_EXPRESS"
    | "ALI_BABA"
    | "ZARA"
    | "ASOS"
    | "EBAY"
    | "OTHER";
  externalCartUrl: string;
  fullName: string;
  primaryPhoneNumber: string;
  alternativePhoneNumber?: string;
  email?: string;
  customerNotes?: string;
  city?: string;
  neighborhood?: string;
  street?: string;
  houseNumber?: string;
  deliveryReference?: string;
  googleMapsLink?: string;
};

export type WeeklyRevenueItem = {
  date: string;
  label: string;
  total: number;
  isToday: boolean;
};

export type PendingQuote = {
  id: number;
  customer: string;
  store: string;
  itemCount: number;
  estimatedValue: number;
  externalUrl: string | null;
};

export type AdminQuoteStatus =
  | "UNDER_REVIEW"
  | "DRAFT"
  | "SENT"
  | "APPROVED"
  | "REJECTED";

export type AdminQuoteStatusFilter =
  | "ALL"
  | AdminQuoteQueueStatus;

export type AdminQuoteQueueStatus =
  | "QUOTE_ANALYSIS"
  | "WAITING_CUSTOMER"
  | "WAITING_PAYMENT"
  | "TO_PURCHASE"
  | "PURCHASED"
  | "IN_TRANSIT"
  | "ARRIVED"
  | "ARCHIVED";

export type AdminQuoteStoreFilter =
  | "ALL"
  | "SHEIN"
  | "TEMU"
  | "AMAZON"
  | "ALI_EXPRESS"
  | "ZARA"
  | "ASOS"
  | "EBAY";

export type AdminQuoteSortFilter = "RECENT" | "URGENT" | "VALUE";

export type AdminQuotesFilterState = {
  status: AdminQuoteStatusFilter;
  search: string;
  store: AdminQuoteStoreFilter;
  sort: AdminQuoteSortFilter;
  page: number;
  size: number;
};

export type AdminQuoteListItem = {
  id: number;
  orderNumber: string;
  customerName: string;
  customerInitials: string;
  sourceStore: string;
  storeLabel: string;
  status: AdminQuoteStatus;
  quoteQueueStatus: AdminQuoteQueueStatus;
  operationalStatus: string;
  actionRequired: boolean;
  nextActionLabel: string | null;
  nextActionModule: string | null;
  isArchived: boolean;
  createdAt: string;
  timeAgoLabel: string;
  estimatedValue: number;
  externalCartUrl: string | null;
  itemChips: string[];
  remainingItems: number;
  itemsCount: number;
  urgent: boolean;
  quoteSentAt: string | null;
  validityDate: string | null;
};

export type AdminQuotesPageResponse = {
  content: AdminQuoteListItem[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export type AdminQuoteStatsResponse = {
  all: number;
  underReview: number;
  draft: number;
  sent: number;
  approved: number;
  rejected: number;
  pendingAnalysis: number;
  waitingCustomer?: number;
  waitingPayment?: number;
  toPurchase?: number;
  archived?: number;
};

export type AdminQuoteDetail = {
  id: number;
  orderNumber: string;
  status: AdminQuoteStatus;
  quoteQueueStatus: AdminQuoteQueueStatus;
  operationalStatus: string;
  actionRequired: boolean;
  nextActionLabel: string | null;
  nextActionModule: string | null;
  isArchived: boolean;
  sourceStore: string;
  storeLabel: string;
  createdAt: string;
  validityDate: string | null;
  externalCartUrl: string | null;
  estimatedValue: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  urgent: boolean;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    amount: number;
  }>;
  financialSummary: {
    items: number;
    freightAndTaxes: number;
    commission: number;
    total: number;
  };
  rejectReason: string | null;
};

export type AdminSessionProfile = {
  role: AdminRole | null;
  roles: AdminRole[];
  name: string;
  email: string;
  avatarUrl: string | null;
  mustChangePassword: boolean;
};

// ── Product types ──────────────────────────────────────────────────────────

export type ProductStatus = "ACTIVE" | "INACTIVE" | "OUT_OF_STOCK" | "DRAFT" | "BLOCKED" | "ARCHIVED";

export type ProductImageItem = {
  id: string;
  originalUrl: string;
  thumbnailUrl: string | null;
  primaryImage: boolean;
  displayOrder: number;
};

export type AdminProductVariant = {
  id: string;
  sku: string | null;
  color: string | null;
  size: string | null;
  stock: number;
  stockPhysical?: number | null;
  stockReserved?: number | null;
  stockAvailable?: number | null;
  purchasePrice: number | null;
  finalPrice: number | null;
  promotionalPrice: number | null;
  profitAmount: number | null;
  marginPercentage: number | null;
  effectivePrice: number | null;
  active: boolean;
  mainImageUrl: string | null;
  displayOrder: number;
  attributes: Record<string, string>;
  label: string;
  inStock: boolean;
};

export type ProductVideoType = "UPLOAD" | "YOUTUBE" | "TIKTOK" | "INSTAGRAM" | "EXTERNAL_URL";

export type AdminProductVideo = {
  id: number;
  url: string;
  type: ProductVideoType;
  title: string | null;
  thumbnailUrl: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: string | null;
};

export type AdminProductCategory = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  subcategories: AdminProductCategory[];
};

export type AdminProduct = {
  id: string;
  code?: string | null;
  name: string;
  description: string;
  shortDescription: string | null;
  slug: string | null;
  originalPrice: number;
  purchasePrice: number;
  profitMargin: number;
  finalPrice: number;
  category: AdminProductCategory | null;
  subCategory: string | null;
  weight: number | null;
  volume: number | null;
  stock: number;
  stockPhysical?: number | null;
  stockReserved?: number | null;
  stockAvailable?: number | null;
  images: string[];
  gallery: ProductImageItem[];
  primaryImageUrl: string | null;
  variants: AdminProductVariant[];
  hasVariants: boolean;
  variantAttributeKeys: string[];
  status: ProductStatus;
  source: string;
  // Rich content
  specifications: Record<string, string> | null;
  packageItems: string[] | null;
  videoUrl: string | null;
  deliveryInfo: string | null;
  warrantyInfo: string | null;
  returnPolicy: string | null;
  usageGuide: string | null;
  videos: AdminProductVideo[];
};

export type CreateProductPayload = {
  name: string;
  description: string;
  shortDescription?: string;
  slug?: string;
  originalPrice: number;
  purchasePrice: number;
  profitMargin: number;
  finalPrice: number;
  categoryId: number;
  subCategory?: string;
  weight?: number;
  volume?: number;
  stock: number;
  active: boolean;
  videoUrl?: string;
  deliveryInfo?: string;
  warrantyInfo?: string;
  returnPolicy?: string;
  usageGuide?: string;
  specifications?: Record<string, string>;
  packageItems?: string[];
};

export type AdminProductsPageResponse = {
  content: AdminProduct[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export type ProductAttentionItem = {
  productId: number | string;
  productCode?: string | null;
  productName?: string | null;
  reason: string;
};

export type ProductAttentionResponse = {
  count: number;
  items: ProductAttentionItem[];
};

export type ImageLibraryItem = {
  id: number;
  thumbnailUrl: string;
  originalUrl: string;
  productId: number;
  productName: string;
  primaryImage: boolean;
  createdAt: string;
};

export type ImageLibraryPageResponse = {
  content: ImageLibraryItem[];
  totalElements: number;
  totalPages: number;
};

// ── Customer types ─────────────────────────────────────────────────────────

export type AdminCustomer = {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
  phoneNumber: string | null;
  alternativePhoneNumber: string | null;
  provider: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  verificationCompleted: boolean;
  suspended: boolean;
  city: string | null;
  deliveryCity: string | null;
  deliveryNeighborhood: string | null;
  deliveryStreet: string | null;
  houseNumber: string | null;
  deliveryReference: string | null;
  googleMapsLink: string | null;
  formattedDeliveryAddress: string | null;
  hasDeliveryAddress: boolean;
  profileCompletionPercentage: number;
  roles: string[];
  orderCount: number;
  totalOrderValue: number;
  lastOrderDate: string | null;
  createdAt: string | null;
  autoCreated: boolean;
  mustChangePassword: boolean;
  profileIncomplete: boolean;
  accountStatus: "GUEST" | "INCOMPLETO" | "VERIFICADO";
  // Communication channel fields
  communicationPhone: string | null;
  communicationChannel: "WHATSAPP" | "TELEGRAM" | "PHONE" | "EMAIL" | null;
  communicationVerified: boolean | null;
  whatsappSameAsPrimary: boolean | null;
  effectiveCommunicationPhone: string | null;
};

export type CustomerStats = {
  total: number;
  verified: number;
  newThisMonth: number;
  topBuyers: number;
};

export type CustomerOrderSummary = {
  id: number;
  type: "INTERNAL" | "EXTERNAL";
  sourceStore: string | null;
  totalAmount: number;
  status: string;
  orderDate: string | null;
};

export type CustomerActivity = {
  id: string;
  type: "REGISTER" | "ORDER_CREATED" | "PAYMENT" | "DELIVERY" | "CANCELLED";
  description: string;
  date: string | null;
  icon: string;
};

export type CustomerNote = {
  id: number;
  content: string;
  authorName: string;
  authorEmail: string;
  createdAt: string | null;
};

export type CustomersPageResponse = {
  content: AdminCustomer[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
};

export type ManagedAdminStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

export type ManagedAdminActivity = {
  id: string;
  description: string;
  createdAt: string | null;
};

export type ManagedAdmin = {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string | null;
  role: AdminRole | null;
  status: ManagedAdminStatus;
  active: boolean;
  suspended: boolean;
  createdAt: string | null;
  lastAccessAt: string | null;
  modules: AdminModule[];
  recentActivity: ManagedAdminActivity[];
};

export type ManagedAdminStatsResponse = {
  total: number;
  active: number;
  inactive: number;
  suspended: number;
  roleDistribution: Partial<Record<AdminRole, number>>;
};

export type ManagedAdminsPageResponse = {
  content: ManagedAdmin[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
};

export type AuditLogItem = {
  id: number;
  orderId: number | null;
  orderCode: string | null;
  customerCode: string | null;
  customerName: string | null;
  action: string | null;
  description: string | null;
  performedByCode: string | null;
  performedByEmail: string | null;
  performedByName: string | null;
  performedByRole: string | null;
  createdAt: string | null;
};

export type AuditLogsPageResponse = {
  content: AuditLogItem[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
};
