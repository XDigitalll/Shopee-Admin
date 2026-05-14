export const ADMIN_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "DELIVERY_DRIVER",
  "DELIVERY_MANAGER",
  "ORDER_MANAGER",
  "CATALOG_MANAGER",
  "FINANCE_MANAGER",
  "CUSTOMER_SUPPORT",
  "CRM_MANAGER",
  "ANALYST",
  "USER",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_MODULES = [
  "dashboard",
  "delivery",
  "orders",
  "quotes",
  "payments",
  "products",
  "categories",
  "banners",
  "customers",
  "finance",
  "adminManagement",
  "roleManagement",
  "audit",
] as const;

export type AdminModule = (typeof ADMIN_MODULES)[number];

export const DEFAULT_ADMIN_ROLE: AdminRole = "ADMIN";

export const ROLE_ACCESS: Record<AdminRole, AdminModule[]> = {
  SUPER_ADMIN: [
    "dashboard",
    "delivery",
    "orders",
    "quotes",
    "payments",
    "products",
    "categories",
    "banners",
    "customers",
    "finance",
    "adminManagement",
    "roleManagement",
    "audit",
  ],
  ADMIN: [
    "dashboard",
    "delivery",
    "orders",
    "quotes",
    "payments",
    "products",
    "categories",
    "banners",
    "customers",
    "finance",
  ],
  DELIVERY_DRIVER: ["delivery"],
  DELIVERY_MANAGER: ["delivery"],
  ORDER_MANAGER: ["dashboard", "orders", "quotes", "delivery"],
  CATALOG_MANAGER: ["dashboard", "products", "categories", "banners"],
  FINANCE_MANAGER: ["dashboard", "payments", "finance"],
  CUSTOMER_SUPPORT: ["dashboard", "orders", "customers"],
  CRM_MANAGER: ["dashboard", "customers"],
  ANALYST: ["dashboard", "finance"],
  USER: [],
};

export const ROLE_PRIORITY: AdminRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "FINANCE_MANAGER",
  "DELIVERY_MANAGER",
  "ORDER_MANAGER",
  "CATALOG_MANAGER",
  "CUSTOMER_SUPPORT",
  "CRM_MANAGER",
  "ANALYST",
  "DELIVERY_DRIVER",
  "USER",
];

export const MODULE_METADATA: Record<
  AdminModule,
  { name: string; description: string; icon: string; path: string }
> = {
  dashboard: {
    name: "Dashboard",
    description: "Visão geral operacional e indicadores do dia.",
    icon: "grid",
    path: "/admin",
  },
  delivery: {
    name: "Entregas",
    description: "Gerir taxa local, atribuicao do estafeta e confirmacao final.",
    icon: "delivery",
    path: "/admin/delivery",
  },
  orders: {
    name: "Pedidos",
    description: "Acompanhar pedidos, estados e ações da equipa.",
    icon: "orders",
    path: "/admin/orders",
  },
  quotes: {
    name: "Cotações",
    description: "Tratar pedidos externos que aguardam cotação.",
    icon: "quote",
    path: "/admin/external-quotes",
  },
  payments: {
    name: "Pagamentos",
    description: "Validar pagamentos e rever pendências financeiras.",
    icon: "wallet",
    path: "/admin/payments",
  },
  products: {
    name: "Produtos",
    description: "Gerir catálogo, preço e disponibilidade.",
    icon: "box",
    path: "/admin/products",
  },
  categories: {
    name: "Categorias",
    description: "Organizar categorias e estrutura do catálogo.",
    icon: "layers",
    path: "/admin/categories",
  },
  banners: {
    name: "Banners",
    description: "Gerir banners publicitários da página inicial.",
    icon: "image",
    path: "/admin/banners",
  },
  customers: {
    name: "Clientes",
    description: "Acompanhar base de clientes e suporte.",
    icon: "users",
    path: "/admin/customers",
  },
  finance: {
    name: "Finanças",
    description: "Ler faturação, tendências e controlo financeiro.",
    icon: "chart",
    path: "/admin/finance",
  },
  adminManagement: {
    name: "Gestão admins",
    description: "Criar e gerir contas administrativas.",
    icon: "shield",
    path: "/admin/super-admin/admins",
  },
  roleManagement: {
    name: "Roles",
    description: "Definir acessos e permissões do painel.",
    icon: "lock",
    path: "/admin/super-admin/roles",
  },
  audit: {
    name: "Auditoria",
    description: "Consultar eventos globais de pedidos, entregas e acoes administrativas.",
    icon: "shield",
    path: "/admin/super-admin/audit",
  },
};

export const ROUTE_ACCESS_RULES: Array<{
  pattern: RegExp;
  module: AdminModule | null;
}> = [
  { pattern: /^\/admin$/, module: "dashboard" },
  { pattern: /^\/admin\/delivery(\/.*)?$/, module: "delivery" },
  { pattern: /^\/admin\/orders(\/.*)?$/, module: "orders" },
  { pattern: /^\/admin\/external-quotes$/, module: "quotes" },
  { pattern: /^\/admin\/payments$/, module: "payments" },
  { pattern: /^\/admin\/products(\/new)?$/, module: "products" },
  { pattern: /^\/admin\/products\/[^/]+\/edit$/, module: "products" },
  { pattern: /^\/admin\/categories$/, module: "categories" },
  { pattern: /^\/admin\/media$/, module: "products" },
  { pattern: /^\/admin\/banners$/, module: "banners" },
  { pattern: /^\/admin\/customers$/, module: "customers" },
  { pattern: /^\/admin\/finance$/, module: "finance" },
  { pattern: /^\/admin\/super-admin\/admins$/, module: "adminManagement" },
  { pattern: /^\/admin\/super-admin\/roles$/, module: "roleManagement" },
  { pattern: /^\/admin\/super-admin\/audit$/, module: "audit" },
  { pattern: /^\/admin\/login$/, module: null },
  { pattern: /^\/admin\/unauthorized$/, module: null },
];

export function normalizeRole(role: unknown): AdminRole | null {
  if (typeof role !== "string") {
    return null;
  }

  const normalized = role.trim().toUpperCase();
  return ADMIN_ROLES.find((item) => item === normalized) ?? null;
}

export function getPrimaryRole(roles: unknown): AdminRole | null {
  const normalizedRoles = Array.isArray(roles)
    ? roles.map(normalizeRole).filter((role): role is AdminRole => Boolean(role))
    : [normalizeRole(roles)].filter((role): role is AdminRole => Boolean(role));

  if (normalizedRoles.length === 0) {
    return null;
  }

  return ROLE_PRIORITY.find((role) => normalizedRoles.includes(role)) ?? normalizedRoles[0] ?? null;
}

export function hasModuleAccess(role: AdminRole | null, module: AdminModule) {
  if (!role) {
    return false;
  }

  return ROLE_ACCESS[role].includes(module);
}

export function getModuleForPath(pathname: string) {
  return ROUTE_ACCESS_RULES.find((rule) => rule.pattern.test(pathname))?.module ?? null;
}

export function getDefaultPathForRole(role: AdminRole | null) {
  if (!role) {
    return "/admin";
  }

  const firstModule = ROLE_ACCESS[role][0];
  return firstModule ? MODULE_METADATA[firstModule].path : "/admin";
}
