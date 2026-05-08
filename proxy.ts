import { NextRequest, NextResponse } from "next/server";

import { decodeJwtPayload } from "@/lib/admin/jwt";
import { getModuleForPath, getPrimaryRole, hasModuleAccess } from "@/lib/admin/roles";
import { ADMIN_REFRESH_COOKIE, ADMIN_SESSION_COOKIE } from "@/lib/admin/session";

const PUBLIC_PATHS = new Set(["/admin/login", "/admin/unauthorized"]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const refreshToken = request.cookies.get(ADMIN_REFRESH_COOKIE)?.value;
  if (!token) {
    if (refreshToken) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  const payload = decodeJwtPayload(token);
  if (!payload?.exp || payload.exp * 1000 <= Date.now()) {
    if (refreshToken) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  const routeModule = getModuleForPath(pathname);
  if (!routeModule) {
    return NextResponse.next();
  }

  const role = getPrimaryRole(payload.roles);
  if (!hasModuleAccess(role, routeModule)) {
    return NextResponse.redirect(new URL("/admin/unauthorized", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
