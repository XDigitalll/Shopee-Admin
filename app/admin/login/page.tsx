"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { AdminBanner, AdminSpinner } from "@/components/admin/feedback-state";
import { adminApiFetch, persistAdminSession } from "@/lib/admin/api-client";
import { getRoleFromToken } from "@/lib/admin/jwt";
import { getDefaultPathForRole } from "@/lib/admin/roles";

type LoginResponse = {
  token: string;
  refreshToken: string;
};

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@xdigital.com");
  const [password, setPassword] = useState("admin123");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const payload = await adminApiFetch<LoginResponse>("/api/admin/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
        }),
      });

      persistAdminSession(payload.token, payload.refreshToken);
      router.replace(getDefaultPathForRole(getRoleFromToken(payload.token)));
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível autenticar.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#ffefe8,transparent_38%),var(--color-background)] p-6">
      <div className="admin-card w-full max-w-md p-8">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-danger)]">
            Shopee X Digital
          </p>
          <h1 className="mt-3 font-[family-name:var(--font-sora)] text-3xl font-semibold text-[var(--color-text-primary)]">
            Entrar no painel
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            Autentique-se com a sua conta administrativa para continuar.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[var(--color-text-primary)]">Email</span>
            <input
              className="admin-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[var(--color-text-primary)]">Senha</span>
            <input
              className="admin-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {error ? <AdminBanner message={error} tone="error" /> : null}

          <button type="submit" className="admin-button-danger w-full justify-center" disabled={isLoading}>
            {isLoading ? <AdminSpinner label="A autenticar..." /> : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
