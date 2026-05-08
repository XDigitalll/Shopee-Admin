"use client";

import { useEffect } from "react";

import { AdminStateCard } from "@/components/admin/feedback-state";

export default function AdminProtectedError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="px-6 py-8">
      <AdminStateCard
        title="Algo correu mal neste modulo"
        message="A pagina falhou de forma inesperada. Pode tentar novamente sem sair do painel."
        tone="error"
        action={
          <button type="button" onClick={() => unstable_retry()} className="admin-button-danger justify-center">
            Tentar novamente
          </button>
        }
      />
    </div>
  );
}
