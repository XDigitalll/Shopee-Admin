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
