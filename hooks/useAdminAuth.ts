"use client";

import { useContext } from "react";

import { AdminAuthContext } from "@/components/admin/admin-auth-provider";

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);

  if (!context) {
    throw new Error("useAdminAuth must be used within AdminAuthProvider.");
  }

  return context;
}
