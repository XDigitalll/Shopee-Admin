import {
  getModuleForPath,
  getNormalizedRoles,
  hasModuleAccess,
  type AdminModule,
  type AdminRole,
} from "@/lib/admin/roles";

type PermissionSubject =
  | AdminRole
  | null
  | undefined
  | {
      role?: unknown;
      roles?: unknown;
      authority?: unknown;
      authorities?: unknown;
    };

export function hasPermission(subject: PermissionSubject, module: AdminModule) {
  return hasModuleAccess(subject, module);
}

export function hasRoutePermission(subject: PermissionSubject, pathname: string) {
  const module = getModuleForPath(pathname);
  return module ? hasPermission(subject, module) : true;
}

export function canPerform(subject: PermissionSubject, allowedRoles: readonly AdminRole[]) {
  const roles = getNormalizedRoles(subject);
  return roles.includes("SUPER_ADMIN") || allowedRoles.some((role) => roles.includes(role));
}

export function canManageCatalog(subject: PermissionSubject) {
  return canPerform(subject, ["CATALOG_MANAGER", "ADMIN", "SUPER_ADMIN"]);
}

export function canManageOrders(subject: PermissionSubject) {
  return canPerform(subject, ["ORDER_MANAGER", "ADMIN", "SUPER_ADMIN"]);
}

export function canViewOrders(subject: PermissionSubject) {
  return canPerform(subject, ["ORDER_MANAGER", "CUSTOMER_SUPPORT", "ADMIN", "SUPER_ADMIN"]);
}

export function canManageFinance(subject: PermissionSubject) {
  return canPerform(subject, ["FINANCE_MANAGER", "ADMIN", "SUPER_ADMIN"]);
}

export function canManageCoupons(subject: PermissionSubject) {
  return canPerform(subject, ["FINANCE_MANAGER", "CRM_MANAGER", "ADMIN", "SUPER_ADMIN"]);
}

export function canManageDelivery(subject: PermissionSubject) {
  return canPerform(subject, ["DELIVERY_MANAGER", "ADMIN", "SUPER_ADMIN"]);
}

export function canAccessAssignedDelivery(subject: PermissionSubject) {
  return canPerform(subject, ["DELIVERY_DRIVER", "DELIVERY_MANAGER", "ADMIN", "SUPER_ADMIN"]);
}

export function canManageCustomers(subject: PermissionSubject) {
  return canPerform(subject, ["CUSTOMER_SUPPORT", "CRM_MANAGER", "ADMIN", "SUPER_ADMIN"]);
}

export function canViewDashboard(subject: PermissionSubject) {
  return canPerform(subject, ["ANALYST", "ADMIN", "SUPER_ADMIN"]);
}

export function canWriteData(subject: PermissionSubject) {
  return !canPerform(subject, ["ANALYST"]) || canPerform(subject, ["ADMIN", "SUPER_ADMIN"]);
}
