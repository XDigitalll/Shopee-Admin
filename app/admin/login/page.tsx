"use client";

import { FormEvent, useState } from "react";

import { ActionError, AdminSpinner, ProcessingOverlay } from "@/components/admin/feedback-state";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { adminApiFetch } from "@/lib/admin/api-client";
import { getDefaultPathForRole, type AdminRole } from "@/lib/admin/roles";

type LoginResponse = {
  role: AdminRole | null;
};

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const loginAction = useAsyncAction();
  const isLoading = loginAction.isRunning;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loginAction.run(async () => {
      const payload = await adminApiFetch<LoginResponse>("/api/admin/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      // httpOnly cookies are set by the login route — navigate with full reload so
      // AdminAuthProvider bootstraps from /api/admin/auth/me with the new session.
      const defaultPath = getDefaultPathForRole(payload.role);
      window.location.replace(defaultPath);
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#ffefe8,transparent_38%),var(--color-background)] p-6">
      <div className="admin-card relative w-full max-w-md p-8">
        <ProcessingOverlay visible={isLoading} title="A entrar..." message="Nao feches esta janela." />
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

        <form className="space-y-4" onSubmit={handleSubmit} aria-busy={isLoading}>
          <fieldset disabled={isLoading} className="space-y-4 disabled:opacity-70">
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

          <ActionError message={loginAction.error} />

          <button type="submit" className="admin-button-danger w-full justify-center" disabled={isLoading}>
            {isLoading ? <AdminSpinner label="A entrar..." /> : "Entrar"}
          </button>
          </fieldset>
        </form>
      </div>
    </main>
  );
}
