"use client";

type AdminFeedbackTone = "info" | "success" | "error" | "loading";

function toneClasses(tone: AdminFeedbackTone) {
  if (tone === "success") {
    return "border-[rgba(21,128,61,0.18)] bg-[rgba(21,128,61,0.08)] text-[#166534]";
  }

  if (tone === "error") {
    return "border-[rgba(232,67,26,0.18)] bg-[rgba(232,67,26,0.08)] text-[var(--color-danger)]";
  }

  if (tone === "loading") {
    return "border-[rgba(232,67,26,0.16)] bg-[rgba(255,240,236,0.88)] text-[#C2410C]";
  }

  return "border-[var(--color-border)] bg-[var(--color-background-tertiary)] text-[var(--color-text-secondary)]";
}

function AdminLoadingPulse({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`relative inline-flex ${compact ? "h-10 w-10" : "h-14 w-14"}`} aria-hidden="true">
      <span className="absolute inset-0 rounded-full bg-[rgba(232,67,26,0.16)] animate-ping" />
      <span className="absolute inset-[7px] rounded-full border-[3px] border-[rgba(232,67,26,0.18)] border-t-[var(--color-danger)] animate-spin" />
      <span className="absolute inset-[15px] rounded-full bg-[var(--color-background-secondary)]" />
    </span>
  );
}

export function AdminSpinner({ label = "A processar..." }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-3 text-sm text-[var(--color-text-secondary)]" aria-live="polite">
      <span
        className="h-4 w-4 rounded-full border-2 border-[rgba(232,67,26,0.18)] border-t-[var(--color-danger)] animate-spin"
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

export function AdminBanner({
  message,
  tone = "info",
}: {
  message: string;
  tone?: AdminFeedbackTone;
}) {
  return <div className={`rounded-[24px] border px-5 py-4 text-sm ${toneClasses(tone)}`}>{message}</div>;
}

export function ActionError({ message }: { message?: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <div
      className="rounded-2xl border border-[rgba(232,67,26,0.22)] bg-[rgba(232,67,26,0.08)] px-4 py-3 text-sm font-semibold leading-6 text-[var(--color-danger)]"
      role="alert"
      aria-live="assertive"
    >
      {message}
    </div>
  );
}

export function ProcessingOverlay({
  visible,
  title = "A processar...",
  message = "Nao feches esta janela.",
}: {
  visible: boolean;
  title?: string;
  message?: string;
}) {
  if (!visible) {
    return null;
  }

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center rounded-[inherit] bg-[rgba(15,23,42,0.52)] px-4 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex w-full max-w-xs flex-col items-center rounded-[24px] border border-[rgba(232,67,26,0.22)] bg-[var(--color-background-secondary)] px-6 py-6 text-center shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
        <AdminLoadingPulse />
        <p className="mt-4 font-[family-name:var(--font-sora)] text-lg font-semibold text-[var(--color-text-primary)]">
          {title}
        </p>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">{message}</p>
      </div>
    </div>
  );
}

export function AdminStateCard({
  title,
  message,
  tone = "info",
  compact = false,
  action,
}: {
  title: string;
  message: string;
  tone?: AdminFeedbackTone;
  compact?: boolean;
  action?: React.ReactNode;
}) {
  const isLoading = tone === "loading";

  return (
    <div
      className={`admin-card border px-6 text-center ${compact ? "py-8" : "py-12"} ${toneClasses(tone)}`}
      role={tone === "error" ? "alert" : "status"}
      aria-busy={isLoading}
    >
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3">
        {isLoading ? (
          <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-[rgba(232,67,26,0.08)]">
            <AdminLoadingPulse />
          </div>
        ) : (
          <span
            className={`flex h-12 w-12 items-center justify-center rounded-full ${
              tone === "error"
                ? "bg-[rgba(232,67,26,0.12)] text-[var(--color-danger)]"
                : tone === "success"
                  ? "bg-[rgba(21,128,61,0.12)] text-[#166534]"
                  : "bg-[rgba(232,67,26,0.1)] text-[var(--color-danger)]"
            }`}
            aria-hidden="true"
          >
            {tone === "error" ? "!" : tone === "success" ? "OK" : "i"}
          </span>
        )}
        <div className="space-y-1">
          <p className="font-[family-name:var(--font-sora)] text-xl font-semibold text-[var(--color-text-primary)]">
            {title}
          </p>
          <p className="text-sm text-current">{message}</p>
        </div>
        {isLoading ? (
          <p className="text-sm font-medium text-[#C2410C]">O painel vai continuar assim que terminarmos esta etapa.</p>
        ) : null}
        {action ? <div className="pt-2">{action}</div> : null}
      </div>
    </div>
  );
}

export function AdminSectionSkeleton({
  title = "A carregar dados",
  message = "Estamos a montar esta vista para o painel.",
  rows = 3,
  compact = false,
}: {
  title?: string;
  message?: string;
  rows?: number;
  compact?: boolean;
}) {
  return (
    <div className="space-y-4">
      <AdminStateCard title={title} message={message} tone="loading" compact={compact} />
      <div className="admin-card border p-5 animate-pulse">
        <div className="space-y-3">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="rounded-[22px] border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-4">
              <div className="h-4 w-1/3 rounded-full bg-[rgba(232,67,26,0.12)]" />
              <div className="mt-3 h-3 w-full rounded-full bg-[var(--color-background-tertiary)]" />
              <div className="mt-2 h-3 w-4/5 rounded-full bg-[var(--color-background-tertiary)]" />
              <div className="mt-4 flex gap-3">
                <div className="h-9 w-24 rounded-full bg-[rgba(232,67,26,0.12)]" />
                <div className="h-9 w-32 rounded-full bg-[var(--color-background-tertiary)]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AdminTableSkeleton({
  columns = 5,
  rows = 4,
}: {
  columns?: number;
  rows?: number;
}) {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="grid gap-3 rounded-[20px] border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <div key={columnIndex} className="h-4 rounded-full bg-[var(--color-background-tertiary)]" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function AdminListLoadingOverlay({
  visible,
  title = "A carregar lista",
  message = "Estamos a buscar os registos mais recentes.",
}: {
  visible: boolean;
  title?: string;
  message?: string;
}) {
  if (!visible) {
    return null;
  }

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-[rgba(8,14,28,0.62)] px-4 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex w-full max-w-sm flex-col items-center rounded-[28px] border border-[rgba(232,67,26,0.2)] bg-[var(--color-background-secondary)]/95 px-6 py-7 text-center shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
        <AdminLoadingPulse />
        <p className="mt-4 font-[family-name:var(--font-sora)] text-lg font-semibold text-[var(--color-text-primary)]">
          {title}
        </p>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">{message}</p>
      </div>
    </div>
  );
}

export function AdminCardListSkeleton({
  rows = 3,
}: {
  rows?: number;
}) {
  return (
    <div className="space-y-4 animate-pulse">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="admin-card overflow-hidden">
          <div className="space-y-4 px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-full bg-[rgba(232,67,26,0.12)]" />
                <div className="space-y-3">
                  <div className="h-5 w-36 rounded-full bg-[var(--color-background-tertiary)]" />
                  <div className="h-4 w-48 rounded-full bg-[var(--color-background-tertiary)]" />
                </div>
              </div>
              <div className="h-8 w-24 rounded-full bg-[var(--color-background-tertiary)]" />
            </div>
            <div className="rounded-[24px] bg-[var(--color-background-tertiary)] p-4">
              <div className="h-11 rounded-2xl bg-[var(--color-background-secondary)]" />
              <div className="mt-4 flex gap-2">
                <div className="h-8 w-24 rounded-full bg-[var(--color-background-secondary)]" />
                <div className="h-8 w-20 rounded-full bg-[var(--color-background-secondary)]" />
                <div className="h-8 w-28 rounded-full bg-[var(--color-background-secondary)]" />
              </div>
              <div className="mt-4 flex items-center justify-between gap-4">
                <div className="space-y-2">
                  <div className="h-3 w-24 rounded-full bg-[var(--color-background-secondary)]" />
                  <div className="h-5 w-32 rounded-full bg-[var(--color-background-secondary)]" />
                </div>
                <div className="h-4 w-28 rounded-full bg-[var(--color-background-secondary)]" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AdminFeedbackDock({
  feedback,
  onClose,
}: {
  feedback: { tone: AdminFeedbackTone; message: string } | null;
  onClose: () => void;
}) {
  if (!feedback) {
    return null;
  }

  const isLoading = feedback.tone === "loading";

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div
        className={`pointer-events-auto w-full max-w-2xl rounded-[24px] border bg-[var(--color-background-secondary)]/96 p-3 shadow-[0_18px_48px_rgba(15,23,42,0.14)] backdrop-blur ${toneClasses(feedback.tone)}`}
        role={feedback.tone === "error" ? "alert" : "status"}
        aria-live={feedback.tone === "error" ? "assertive" : "polite"}
        aria-busy={isLoading}
      >
        <div className="flex items-start gap-3">
          {isLoading ? (
            <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[rgba(232,67,26,0.08)]">
              <AdminLoadingPulse compact />
            </div>
          ) : (
            <div
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                feedback.tone === "error"
                  ? "bg-[rgba(232,67,26,0.12)] text-[var(--color-danger)]"
                  : feedback.tone === "success"
                    ? "bg-[rgba(21,128,61,0.12)] text-[#166534]"
                    : "bg-[var(--color-background-tertiary)] text-[var(--color-text-secondary)]"
              }`}
            >
              {feedback.tone === "success" ? "OK" : feedback.tone === "error" ? "!" : "i"}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--color-text-primary)]">
              {isLoading
                ? "A processar no painel"
                : feedback.tone === "success"
                  ? "Operacao concluida"
                  : feedback.tone === "error"
                    ? "Atencao necessaria"
                    : "Atualizacao do painel"}
            </p>
            <p className="mt-1 text-sm text-current">{feedback.message}</p>
          </div>
          {isLoading ? null : (
            <button type="button" onClick={onClose} className="rounded-full bg-[var(--color-background-tertiary)] px-3 py-1 text-sm font-medium text-[var(--color-text-secondary)]">
              Fechar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function AdminConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger = false,
  pending = false,
  children,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  pending?: boolean;
  children?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-[rgba(15,23,42,0.58)] px-3 py-4 sm:px-4 sm:py-6" onClick={onCancel}>
      <div
        className="admin-modal-panel flex w-full max-w-lg flex-col rounded-[22px] border border-[var(--color-border)] bg-[var(--color-background-secondary)] shadow-[0_24px_80px_rgba(15,23,42,0.22)] sm:rounded-[30px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-modal-body p-5 sm:p-6">
          <div className={`flex h-12 w-12 items-center justify-center rounded-full ${danger ? "bg-[rgba(232,67,26,0.12)] text-[var(--color-danger)]" : "bg-[var(--color-background-tertiary)] text-[var(--color-text-secondary)]"}`}>
            {danger ? "!" : "?"}
          </div>
          <h2 className="mt-4 font-[family-name:var(--font-sora)] text-xl font-semibold text-[var(--color-text-primary)]">
            {title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">{message}</p>
          {children ? <div className="mt-4">{children}</div> : null}
        </div>
        <div className="admin-modal-footer flex flex-col-reverse gap-3 border-t border-[var(--color-border)] p-4 sm:flex-row sm:p-6">
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={`admin-button-danger rounded-2xl text-sm font-semibold text-white transition disabled:opacity-60 ${danger ? "bg-[#B42318] hover:bg-[#991b1b]" : "bg-[var(--color-danger)] hover:opacity-90"}`}
          >
            {pending ? "A processar..." : confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="admin-button-muted disabled:opacity-60"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
