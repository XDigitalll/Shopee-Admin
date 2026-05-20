"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { DeliveryIcon, ImageIcon, LayersIcon, LockIcon, OrdersIcon, PlusIcon, QuoteIcon, ShieldIcon, UsersIcon, WalletIcon, BoxIcon, ChartIcon } from "@/components/admin/icons";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { adminApiFetch } from "@/lib/admin/api-client";
import { formatDate, humanizeRole } from "@/lib/admin/format";
import { ADMIN_MODULES, MODULE_METADATA, ROLE_ACCESS, type AdminModule, type AdminRole } from "@/lib/admin/roles";
import type { ManagedAdmin, ManagedAdminStatsResponse, ManagedAdminStatus, ManagedAdminsPageResponse } from "@/lib/admin/types";

type RolePill = AdminRole | "ALL";
type FormMode = "create" | "edit";

type FormState = {
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  role: AdminRole;
  active: boolean;
  sendCredentials: boolean;
};

type FormErrors = Partial<Record<"fullName" | "email" | "phone" | "password" | "role" | "form", string>>;

const ROLE_PILLS: RolePill[] = ["ALL", "ADMIN", "DELIVERY_DRIVER", "ORDER_MANAGER", "CATALOG_MANAGER", "FINANCE_MANAGER", "CUSTOMER_SUPPORT", "CRM_MANAGER", "ANALYST"];

const STATUS_OPTIONS: Array<{ value: "ALL" | ManagedAdminStatus; label: string }> = [
  { value: "ALL", label: "Todos os estados" },
  { value: "ACTIVE", label: "Activo" },
  { value: "INACTIVE", label: "Inactivo" },
  { value: "SUSPENDED", label: "Suspenso" },
];

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  ADMIN: { bg: "#FFF0EC", text: "#C13210" },
  SUPER_ADMIN: { bg: "#EEEDFE", text: "#3C3489" },
  ANALYST: { bg: "#E6F1FB", text: "#0C447C" },
  CATALOG_MANAGER: { bg: "#E1F5EE", text: "#085041" },
  ORDER_MANAGER: { bg: "#FAEEDA", text: "#633806" },
  FINANCE_MANAGER: { bg: "#EAF3DE", text: "#27500A" },
  CUSTOMER_SUPPORT: { bg: "#FBEAF0", text: "#72243E" },
  CRM_MANAGER: { bg: "#F1EFE8", text: "#444441" },
  DELIVERY_MANAGER: { bg: "#E8F2FF", text: "#1D4ED8" },
  DELIVERY_DRIVER: { bg: "#EAF4FF", text: "#1D4ED8" },
  USER: { bg: "#F3F4F6", text: "#374151" },
};

const ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  SUPER_ADMIN: "Controla todo o painel, gere roles, admins e políticas críticas do sistema.",
  ADMIN: "Opera várias áreas do painel com acesso amplo a catálogo, pagamentos, pedidos e clientes.",
  DELIVERY_DRIVER: "Assume entregas no terreno, confirma fechos e acompanha apenas o módulo de delivery.",
  DELIVERY_MANAGER: "Assume o fluxo local de entregas, rastreio e confirmação final.",
  ORDER_MANAGER: "Acompanha pedidos, cotações e estados operacionais.",
  CATALOG_MANAGER: "Mantém produtos, categorias, banners e estrutura do catálogo.",
  FINANCE_MANAGER: "Valida movimentos financeiros, pagamentos e leitura global das finanças.",
  CUSTOMER_SUPPORT: "Acompanha clientes e pedidos para resolver dúvidas e incidentes.",
  CRM_MANAGER: "Cuida da base de clientes, relacionamento e visão de CRM.",
  ANALYST: "Consulta indicadores, dashboards e leituras analíticas.",
  USER: "Conta de cliente sem acesso administrativo.",
};

const PERMISSION_ROLES: AdminRole[] = ["SUPER_ADMIN", "ADMIN", "DELIVERY_DRIVER", "DELIVERY_MANAGER", "ORDER_MANAGER", "CATALOG_MANAGER", "FINANCE_MANAGER", "CUSTOMER_SUPPORT", "CRM_MANAGER", "ANALYST"];

function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function DownloadIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...props}>
      <path d="M12 4v10" />
      <path d="m8 10 4 4 4-4" />
      <path d="M4 20h16" />
    </svg>
  );
}

function PencilIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...props}>
      <path d="M12 20h9" />
      <path d="m16.5 3.5 4 4L8 20l-5 1 1-5z" />
    </svg>
  );
}

function PauseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...props}>
      <path d="M8 5v14" />
      <path d="M16 5v14" />
    </svg>
  );
}

function TrashIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
    </svg>
  );
}

function EyeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...props}>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...props}>
      <path d="m3 3 18 18" />
      <path d="M10.6 10.6A3 3 0 0 0 13.4 13.4" />
      <path d="M9.9 5.1A11 11 0 0 1 12 5c6.5 0 10 7 10 7a17.7 17.7 0 0 1-4.1 4.8" />
      <path d="M6.6 6.6A17.5 17.5 0 0 0 2 12s3.5 7 10 7c1.5 0 2.9-.4 4.2-1" />
    </svg>
  );
}

function SparklesIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...props}>
      <path d="m12 3 1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8Z" />
      <path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9Z" />
    </svg>
  );
}

function CheckCircleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.3 2.3 4.7-5" />
    </svg>
  );
}

function getModuleIcon(module: AdminModule) {
  const iconName = MODULE_METADATA[module].icon;
  if (iconName === "orders") return OrdersIcon;
  if (iconName === "quote") return QuoteIcon;
  if (iconName === "wallet") return WalletIcon;
  if (iconName === "delivery") return DeliveryIcon;
  if (iconName === "box") return BoxIcon;
  if (iconName === "layers") return LayersIcon;
  if (iconName === "users") return UsersIcon;
  if (iconName === "chart") return ChartIcon;
  if (iconName === "image") return ImageIcon;
  return ShieldIcon;
}

function getRoleStyle(role: AdminRole | null) {
  return role ? ROLE_COLORS[role] ?? { bg: "#F3F4F6", text: "#374151" } : { bg: "#F3F4F6", text: "#374151" };
}

function getStatusStyle(status: ManagedAdminStatus) {
  if (status === "ACTIVE") return { bg: "#EAF3DE", text: "#166534", label: "Activo" };
  if (status === "SUSPENDED") return { bg: "#FFF1F2", text: "#B42318", label: "Suspenso" };
  return { bg: "#F3F4F6", text: "#4B5563", label: "Inactivo" };
}

function getRowHighlight(isCurrentUser: boolean, isSelected: boolean) {
  if (isCurrentUser && isSelected) {
    return {
      background: "rgba(238, 237, 254, 0.18)",
      boxShadow: "inset 4px 0 0 #6D5EF5, inset 0 0 0 1px rgba(109, 94, 245, 0.24)",
    };
  }
  if (isCurrentUser) {
    return {
      background: "rgba(238, 237, 254, 0.12)",
      boxShadow: "inset 4px 0 0 rgba(109, 94, 245, 0.72)",
    };
  }
  if (isSelected) {
    return {
      background: "rgba(232, 67, 26, 0.09)",
      boxShadow: "inset 4px 0 0 #E8431A, inset 0 0 0 1px rgba(232, 67, 26, 0.14)",
    };
  }
  return { background: undefined, boxShadow: undefined };
}

function getInitials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function formatDateTime(value: string | null) {
  if (!value) return "Sem registo";
  return new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function generateSecurePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => chars[value % chars.length]).join("");
}

function normalizeMozambiquePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  let local = digits;
  if (local.startsWith("00258")) local = local.slice(2);
  if (local.startsWith("258")) local = local.slice(3);
  if (local.startsWith("0")) local = local.slice(1);
  return /^(82|83|84|85|86|87)\d{7}$/.test(local) ? `+258${local}` : null;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function getFieldErrorClass(hasError: boolean) {
  return hasError ? "border-[#E8431A] shadow-[0_0_0_3px_rgba(232,67,26,0.14)] focus:border-[#E8431A]" : "";
}

function inferAdminFormErrors(message: string): FormErrors {
  const normalized = message.toLowerCase();
  if (normalized.includes("telefone") || normalized.includes("phone")) {
    return { phone: message };
  }
  if (normalized.includes("email") || normalized.includes("e-mail")) {
    return { email: message };
  }
  if (normalized.includes("senha") || normalized.includes("password")) {
    return { password: message };
  }
  if (normalized.includes("nome") || normalized.includes("name")) {
    return { fullName: message };
  }
  if (normalized.includes("role") || normalized.includes("perfil")) {
    return { role: message };
  }
  return { form: message };
}

function buildCsv(admins: ManagedAdmin[]) {
  const rows = [
    ["Nome", "Email", "Telefone", "Role", "Estado", "Ultimo acesso"].join(","),
    ...admins.map((admin) =>
      [admin.name, admin.email, admin.phone ?? "", humanizeRole(admin.role), getStatusStyle(admin.status).label, admin.lastAccessAt ? formatDateTime(admin.lastAccessAt) : ""]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(","),
    ),
  ];
  return rows.join("\n");
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function getDefaultFormState(role: AdminRole = "ADMIN"): FormState {
  return {
    fullName: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: generateSecurePassword(),
    role,
    active: true,
    sendCredentials: true,
  };
}

function AdminAvatar({ admin, size = 42 }: { admin: ManagedAdmin; size?: number }) {
  const style = getRoleStyle(admin.role);
  return (
    <div
      className="flex items-center justify-center rounded-full font-[family-name:var(--font-sora)] font-semibold"
      style={{ width: size, height: size, background: style.bg, color: style.text, fontSize: Math.max(12, size * 0.34) }}
    >
      {getInitials(admin.name)}
    </div>
  );
}

function FeedbackBanner({ tone, message }: { tone: "success" | "error"; message: string }) {
  return (
    <div
      className="rounded-[20px] border px-5 py-3 text-sm font-medium"
      style={{
        borderColor: tone === "success" ? "#BBF7D0" : "rgba(232,67,26,0.22)",
        background: tone === "success" ? "#F0FFF4" : "rgba(232,67,26,0.08)",
        color: tone === "success" ? "#166534" : "#B42318",
      }}
    >
      {message}
    </div>
  );
}

function StatsCards({ stats }: { stats: ManagedAdminStatsResponse | null }) {
  const roleCount = Object.values(stats?.roleDistribution ?? {}).filter((item) => Number(item || 0) > 0).length;
  const cards = [
    { label: "Total de admins", value: stats?.total ?? "—", bg: "var(--color-background-secondary)", color: "#374151" },
    { label: "Activos", value: stats?.active ?? "—", bg: "#EAF3DE", color: "#166534" },
    { label: "Inactivos", value: stats?.inactive ?? "—", bg: "#F3F4F6", color: "#4B5563" },
    { label: "Roles distribuídas", value: roleCount || "—", bg: "#EEEDFE", color: "#3C3489" },
  ];
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <article key={card.label} className="rounded-[24px] p-5" style={{ background: card.bg }}>
          <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: card.color, opacity: 0.78 }}>{card.label}</p>
          <p className="mt-2 font-[family-name:var(--font-sora)] text-3xl font-black" style={{ color: card.color }}>{card.value}</p>
        </article>
      ))}
    </div>
  );
}

function ModulesPreview({ modules, highlighted }: { modules: AdminModule[]; highlighted: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {modules.slice(0, 5).map((module) => {
        const Icon = getModuleIcon(module);
        return (
          <span
            key={module}
            title={MODULE_METADATA[module].name}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text-secondary)]"
            style={{ background: highlighted ? "rgba(255,255,255,0.08)" : "var(--color-background-secondary)" }}
          >
            <Icon className="h-4 w-4" />
          </span>
        );
      })}
      {modules.length > 5 ? (
        <span
          className="inline-flex h-8 items-center justify-center rounded-full px-2 text-xs font-semibold text-[var(--color-text-secondary)]"
          style={{ background: highlighted ? "rgba(255,255,255,0.08)" : "var(--color-background-secondary)" }}
        >
          +{modules.length - 5}
        </span>
      ) : null}
    </div>
  );
}

function DetailsPanel({
  admin,
  currentUserEmail,
  totalSuperAdmins,
  onEdit,
  onSuspend,
  onRemove,
}: {
  admin: ManagedAdmin | null;
  currentUserEmail: string;
  totalSuperAdmins: number;
  onEdit: (admin: ManagedAdmin) => void;
  onSuspend: (admin: ManagedAdmin) => void;
  onRemove: (admin: ManagedAdmin) => void;
}) {
  if (!admin) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center px-6 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EEEDFE] text-[#3C3489]"><ShieldIcon className="h-7 w-7" /></div>
        <p className="mt-4 font-[family-name:var(--font-sora)] text-lg font-semibold text-[var(--color-text-primary)]">Seleccione um administrador</p>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Abra uma linha da tabela para ver detalhes, módulos e actividade recente.</p>
      </div>
    );
  }

  const roleStyle = getRoleStyle(admin.role);
  const statusStyle = getStatusStyle(admin.status);
  const isCurrentUser = admin.email === currentUserEmail;
  const isLastSuperAdmin = admin.role === "SUPER_ADMIN" && totalSuperAdmins <= 1;

  return (
    <div className="space-y-5 p-5">
      <div className="flex items-start gap-4">
        <AdminAvatar admin={admin} size={62} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-[family-name:var(--font-sora)] text-xl font-semibold text-[var(--color-text-primary)]">{admin.name}</p>
            {isCurrentUser ? <span className="rounded-full bg-[#EEEDFE] px-2.5 py-1 text-[11px] font-semibold text-[#3C3489]">Você</span> : null}
          </div>
          <p className="mt-1 break-all text-sm text-[var(--color-text-secondary)]">{admin.email}</p>
          <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{admin.phone ?? "Sem telefone"}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: roleStyle.bg, color: roleStyle.text, fontFamily: "var(--font-sora)" }}>{humanizeRole(admin.role)}</span>
        <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: statusStyle.bg, color: statusStyle.text }}>{statusStyle.label}</span>
      </div>

      <div className="space-y-2 rounded-[20px] bg-[var(--color-background-secondary)] p-4 text-sm text-[var(--color-text-secondary)]">
        <div className="flex items-center justify-between gap-3"><span>Conta criada</span><span className="text-right text-[var(--color-text-primary)]">{admin.createdAt ? formatDate(admin.createdAt) : "Sem registo"}</span></div>
        <div className="flex items-center justify-between gap-3"><span>Último acesso</span><span className="text-right text-[var(--color-text-primary)]">{formatDateTime(admin.lastAccessAt)}</span></div>
      </div>

      <section>
        <p className="font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--color-text-primary)]">Módulos de acesso</p>
        <div className="mt-3 space-y-2">
          {ADMIN_MODULES.map((module) => {
            const Icon = getModuleIcon(module);
            const allowed = admin.modules.includes(module);
            return (
              <div key={module} className="flex items-center gap-3 rounded-[18px] border border-[var(--color-border)] px-3 py-2.5">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full" style={{ background: allowed ? "#EAF3DE" : "var(--color-background-secondary)", color: allowed ? "#166534" : "var(--color-text-tertiary)" }}>
                  {allowed ? <CheckCircleIcon className="h-4 w-4" /> : <LockIcon className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-[var(--color-text-secondary)]" /><p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{MODULE_METADATA[module].name}</p></div>
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{MODULE_METADATA[module].description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <p className="font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--color-text-primary)]">Actividade recente</p>
        <div className="mt-3 space-y-2">
          {admin.recentActivity.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-[var(--color-border)] px-4 py-5 text-sm text-[var(--color-text-secondary)]">Ainda não há acções recentes para este administrador.</div>
          ) : (
            admin.recentActivity.map((item) => (
              <div key={item.id} className="rounded-[18px] border border-[var(--color-border)] px-4 py-3">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">{item.description}</p>
                <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{formatDateTime(item.createdAt)}</p>
              </div>
            ))
          )}
        </div>
      </section>

      <div className="space-y-2 pt-1">
        <button type="button" onClick={() => onEdit(admin)} className="admin-button-muted w-full justify-center">Editar role e acessos</button>
        <button type="button" onClick={() => onSuspend(admin)} disabled={admin.status === "SUSPENDED" || isCurrentUser} className="admin-button-muted w-full justify-center disabled:cursor-not-allowed disabled:opacity-50">Suspender temporariamente</button>
        <button type="button" onClick={() => onRemove(admin)} disabled={isCurrentUser || isLastSuperAdmin} className="w-full rounded-[18px] border border-[rgba(232,67,26,0.2)] bg-[rgba(232,67,26,0.08)] px-4 py-3 text-sm font-semibold text-[#B42318] transition hover:bg-[rgba(232,67,26,0.14)] disabled:cursor-not-allowed disabled:opacity-50">Revogar acesso permanentemente</button>
      </div>
    </div>
  );
}

function PermissionMatrix() {
  return (
    <section className="admin-card overflow-hidden">
      <div className="border-b border-[var(--color-border)] px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E8431A]">Roles e permissões</p>
        <h2 className="mt-2 font-[family-name:var(--font-sora)] text-xl font-semibold text-[var(--color-text-primary)]">Mapa rápido de acessos por role</h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Consulta em segundos quais módulos ficam disponíveis para cada perfil administrativo.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-[var(--color-background-secondary)] text-left text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">
            <tr>
              <th className="px-4 py-3 font-semibold">Módulo</th>
              {PERMISSION_ROLES.map((role) => <th key={role} className="px-4 py-3 font-semibold">{humanizeRole(role)}</th>)}
            </tr>
          </thead>
          <tbody>
            {ADMIN_MODULES.map((module) => {
              const Icon = getModuleIcon(module);
              return (
                <tr key={module} className="border-t border-[var(--color-border)]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-[var(--color-text-secondary)]" />
                      <div>
                        <p className="font-medium text-[var(--color-text-primary)]">{MODULE_METADATA[module].name}</p>
                        <p className="text-xs text-[var(--color-text-secondary)]">{MODULE_METADATA[module].description}</p>
                      </div>
                    </div>
                  </td>
                  {PERMISSION_ROLES.map((role) => <td key={role} className="px-4 py-3 text-center">{ROLE_ACCESS[role].includes(module) ? <CheckCircleIcon className="mx-auto h-5 w-5 text-[#16A34A]" /> : <span className="mx-auto block h-[2px] w-4 rounded-full bg-[#D1D5DB]" />}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SuspendModal({ admin, onClose, onConfirm }: { admin: ManagedAdmin; onClose: () => void; onConfirm: (payload: { reason: string; duration: string }) => void }) {
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState("7d");
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/45 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-[28px] bg-[var(--color-background-secondary)] p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E8431A]">Suspensão temporária</p>
        <h2 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-semibold text-[var(--color-text-primary)]">Suspender {admin.name}</h2>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Este administrador vai perder acesso temporariamente até a equipa reavaliar a conta.</p>
        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-[var(--color-text-primary)]">Motivo</label>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} className="admin-input min-h-[110px] w-full resize-none" placeholder="Descreva o motivo da suspensão" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-[var(--color-text-primary)]">Duração</label>
            <select value={duration} onChange={(event) => setDuration(event.target.value)} className="admin-input w-full">
              <option value="24h">24 horas</option>
              <option value="7d">7 dias</option>
              <option value="30d">30 dias</option>
              <option value="indefinido">Indefinido</option>
            </select>
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={() => onConfirm({ reason: reason.trim(), duration })} className="flex-1 rounded-[18px] bg-[#E8431A] px-4 py-3 text-sm font-semibold text-white">Confirmar suspensão</button>
          <button type="button" onClick={onClose} className="admin-button-muted px-4">Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function AdminFormDrawer({
  open, mode, form, errors, saving, resettingPassword, resetResult, showPassword, onClose, onTogglePassword, onChange, onGeneratePassword, onSubmit, onResetPassword,
}: {
  open: boolean;
  mode: FormMode;
  form: FormState;
  errors: FormErrors;
  saving: boolean;
  resettingPassword: boolean;
  resetResult: { password: string | null; emailSent: boolean; emailError: string | null } | null;
  showPassword: boolean;
  onClose: () => void;
  onTogglePassword: () => void;
  onChange: (field: keyof FormState, value: string | boolean) => void;
  onGeneratePassword: () => void;
  onSubmit: () => void;
  onResetPassword: (() => void) | null;
}) {
  const modules = ROLE_ACCESS[form.role];
  return (
    <div className={`fixed inset-0 z-[70] transition ${open ? "pointer-events-auto bg-slate-950/45" : "pointer-events-none bg-transparent"}`} onClick={onClose}>
      <aside className={`absolute right-0 top-0 h-full w-full max-w-[420px] overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-background-secondary)] shadow-2xl transition-transform duration-200 ${open ? "translate-x-0" : "translate-x-full"}`} onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-background-secondary)] px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E8431A]">{mode === "create" ? "Novo administrador" : "Editar administrador"}</p>
          <h2 className="mt-2 pr-8 font-[family-name:var(--font-sora)] text-xl font-semibold leading-tight text-[var(--color-text-primary)]">{mode === "create" ? "Adicionar administrador" : "Guardar alterações"}</h2>
        </div>
        <div className="space-y-5 px-5 py-5">
          {errors.form ? (
            <div className="rounded-[18px] border border-[rgba(232,67,26,0.22)] bg-[rgba(232,67,26,0.08)] px-4 py-3 text-sm font-medium text-[#B42318]" role="alert">
              {errors.form}
            </div>
          ) : null}
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--color-text-primary)]">Nome completo</label>
              <input value={form.fullName} onChange={(event) => onChange("fullName", event.target.value)} className={`admin-input w-full ${getFieldErrorClass(Boolean(errors.fullName))}`} placeholder="Ex: Edson Nedy" aria-invalid={Boolean(errors.fullName)} />
              {errors.fullName ? <p className="mt-1 text-xs font-medium leading-5 text-[#E8431A]" role="alert">{errors.fullName}</p> : null}
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--color-text-primary)]">Email</label>
              <input type="email" value={form.email} onChange={(event) => onChange("email", event.target.value)} className={`admin-input w-full ${getFieldErrorClass(Boolean(errors.email))}`} placeholder="admin@empresa.com" aria-invalid={Boolean(errors.email)} />
              {errors.email ? <p className="mt-1 text-xs font-medium leading-5 text-[#E8431A]" role="alert">{errors.email}</p> : null}
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--color-text-primary)]">Telefone</label>
              <input value={form.phone} onChange={(event) => onChange("phone", event.target.value)} className={`admin-input w-full ${getFieldErrorClass(Boolean(errors.phone))}`} inputMode="tel" placeholder="+258 8x xxx xxxx" aria-invalid={Boolean(errors.phone)} />
              {errors.phone ? <p className="mt-1 text-xs font-medium leading-5 text-[#E8431A]" role="alert">{errors.phone}</p> : null}
              <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">Use um numero mocambicano valido: 82, 83, 84, 85, 86 ou 87.</p>
            </div>
            {mode === "create" ? (
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--color-text-primary)]">Senha temporária</label>
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} value={form.password} onChange={(event) => onChange("password", event.target.value)} className={`admin-input w-full pr-24 ${getFieldErrorClass(Boolean(errors.password))}`} aria-invalid={Boolean(errors.password)} />
                  <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                    <button type="button" onClick={onTogglePassword} className="rounded-full p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-background-secondary)]">{showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}</button>
                    <button type="button" onClick={onGeneratePassword} className="rounded-full p-2 text-[#E8431A] hover:bg-[rgba(232,67,26,0.08)]"><SparklesIcon className="h-4 w-4" /></button>
                  </div>
                </div>
                {errors.password ? <p className="mt-1 text-xs font-medium leading-5 text-[#E8431A]" role="alert">{errors.password}</p> : null}
              </div>
            ) : null}
            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--color-text-primary)]">Role</label>
              <select value={form.role} onChange={(event) => onChange("role", event.target.value)} className={`admin-input w-full ${getFieldErrorClass(Boolean(errors.role))}`} aria-invalid={Boolean(errors.role)}>{PERMISSION_ROLES.map((role) => <option key={role} value={role}>{humanizeRole(role)}</option>)}</select>
              {errors.role ? <p className="mt-1 text-xs font-medium leading-5 text-[#E8431A]" role="alert">{errors.role}</p> : null}
              <p className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)]">{ROLE_DESCRIPTIONS[form.role]}</p>
            </div>
          </div>
          <section>
            <p className="font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--color-text-primary)]">Módulos atribuídos automaticamente</p>
            <div className="mt-3 grid gap-2">
              {modules.map((module) => {
                const Icon = getModuleIcon(module);
                return (
                  <div key={module} className="rounded-[18px] border border-[var(--color-border)] px-3 py-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#EEEDFE] text-[#3C3489]"><Icon className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[var(--color-text-primary)]">{MODULE_METADATA[module].name}</p>
                        <p className="mt-1 break-words text-xs leading-5 text-[var(--color-text-secondary)]">{MODULE_METADATA[module].description}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="space-y-3 rounded-[20px] bg-[var(--color-background-secondary)] p-4">
            <label className="flex items-center justify-between gap-3">
              <div><p className="text-sm font-semibold text-[var(--color-text-primary)]">Enviar credenciais por email</p><p className="text-xs text-[var(--color-text-secondary)]">Activo por defeito para as boas-vindas.</p></div>
              <input type="checkbox" checked={form.sendCredentials} onChange={(event) => onChange("sendCredentials", event.target.checked)} className="h-4 w-4 accent-[#E8431A]" />
            </label>
            <label className="flex items-center justify-between gap-3">
              <div><p className="text-sm font-semibold text-[var(--color-text-primary)]">Conta activa imediatamente</p><p className="text-xs text-[var(--color-text-secondary)]">Controla o estado inicial da conta.</p></div>
              <input type="checkbox" checked={form.active} onChange={(event) => onChange("active", event.target.checked)} className="h-4 w-4 accent-[#E8431A]" />
            </label>
          </section>
          {mode === "edit" && resetResult ? (
            <section className="rounded-[20px] border border-[#BBF7D0] bg-[#F0FFF4] p-4 text-sm text-[#166534]">
              <p className="font-semibold">Senha redefinida com sucesso.</p>
              {resetResult.password ? (
                <div className="mt-3 rounded-[16px] border border-[#BBF7D0] bg-white/70 px-3 py-2">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#166534]/70">Nova senha</p>
                  <p className="mt-1 break-all font-[family-name:var(--font-sora)] text-base font-semibold text-[#14532D]">
                    {resetResult.password}
                  </p>
                </div>
              ) : null}
              <p className="mt-2 text-xs leading-5">
                {resetResult.emailSent
                  ? "As credenciais foram enviadas por email."
                  : resetResult.emailError || "Email nao enviado. Partilha a senha manualmente com o administrador."}
              </p>
            </section>
          ) : null}
          {mode === "edit" && onResetPassword ? <button type="button" onClick={onResetPassword} disabled={resettingPassword} className="admin-button-muted w-full justify-center disabled:opacity-60">{resettingPassword ? "A redefinir..." : "Redefinir senha"}</button> : null}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onSubmit} disabled={saving} className="flex-1 rounded-[18px] bg-[#E8431A] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{saving ? "A guardar..." : mode === "create" ? "Criar administrador" : "Guardar alterações"}</button>
            <button type="button" onClick={onClose} className="admin-button-muted px-4">Cancelar</button>
          </div>
        </div>
      </aside>
    </div>
  );
}

export function AdminManagementView() {
  const router = useRouter();
  const { profile, isLoading } = useAdminAuth();
  const [stats, setStats] = useState<ManagedAdminStatsResponse | null>(null);
  const [admins, setAdmins] = useState<ManagedAdmin[]>([]);
  const [selectedAdmin, setSelectedAdmin] = useState<ManagedAdmin | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [roleFilter, setRoleFilter] = useState<RolePill>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | ManagedAdminStatus>("ALL");
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<FormMode>("create");
  const [saving, setSaving] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetResult, setResetResult] = useState<{ password: string | null; emailSent: boolean; emailError: string | null } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState<FormState>(getDefaultFormState());
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [suspendTarget, setSuspendTarget] = useState<ManagedAdmin | null>(null);
  const searchDebounceRef = useRef<number | null>(null);
  const feedbackTimeoutRef = useRef<number | null>(null);

  const currentUserEmail = profile.email || "";
  const totalSuperAdmins = stats?.roleDistribution.SUPER_ADMIN ?? admins.filter((item) => item.role === "SUPER_ADMIN").length;

  useEffect(() => {
    if (!isLoading && profile.role !== "SUPER_ADMIN") router.replace("/admin/unauthorized");
  }, [isLoading, profile.role, router]);

  function showFeedback(tone: "success" | "error", message: string) {
    setFeedback({ tone, message });
    if (feedbackTimeoutRef.current !== null) window.clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = window.setTimeout(() => setFeedback(null), 4000);
  }

  async function loadStats() {
    setStats(await adminApiFetch<ManagedAdminStatsResponse>("/api/super-admin/admins/stats"));
  }

  async function loadAdmins(nextPage = 0, explicitSearch?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), size: "10" });
      if (roleFilter !== "ALL") params.set("role", roleFilter);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      const trimmedSearch = (explicitSearch ?? searchInput).trim();
      if (trimmedSearch) params.set("search", trimmedSearch);
      const payload = await adminApiFetch<ManagedAdminsPageResponse>(`/api/super-admin/admins?${params.toString()}`);
      setAdmins(payload.content ?? []);
      setTotalPages(payload.totalPages ?? 0);
      setTotalElements(payload.totalElements ?? 0);
      setPage(payload.number ?? nextPage);
      setSelectedAdmin((current) => (current ? payload.content.find((item) => item.id === current.id) ?? null : null));
    } finally {
      setLoading(false);
    }
  }

  async function refreshSelectedAdmin(id: string) {
    const payload = await adminApiFetch<ManagedAdmin>(`/api/super-admin/admins/${id}`);
    setSelectedAdmin(payload);
    setAdmins((current) => current.map((item) => (item.id === payload.id ? payload : item)));
  }

  useEffect(() => {
    if (profile.role !== "SUPER_ADMIN") return;
    void Promise.all([loadStats(), loadAdmins(0)]).catch((error: unknown) => showFeedback("error", error instanceof Error ? error.message : "Nao foi possivel carregar a gestão de administradores."));
  }, [profile.role]);

  useEffect(() => {
    if (profile.role !== "SUPER_ADMIN") return;
    void loadAdmins(0).catch((error: unknown) => showFeedback("error", error instanceof Error ? error.message : "Nao foi possivel actualizar a lista."));
  }, [roleFilter, statusFilter]);

  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (searchDebounceRef.current !== null) window.clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = window.setTimeout(() => {
      void loadAdmins(0, value).catch((error: unknown) => showFeedback("error", error instanceof Error ? error.message : "Nao foi possivel pesquisar administradores."));
    }, 350);
  }

  function openCreateDrawer() {
    setDrawerMode("create");
    setForm(getDefaultFormState());
    setFormErrors({});
    setResetResult(null);
    setShowPassword(false);
    setDrawerOpen(true);
  }

  function openEditDrawer(admin: ManagedAdmin) {
    setDrawerMode("edit");
    setForm({ fullName: admin.name, firstName: admin.firstName, lastName: admin.lastName, email: admin.email, phone: admin.phone ?? "", password: "", role: admin.role ?? "ADMIN", active: admin.status === "ACTIVE", sendCredentials: true });
    setFormErrors({});
    setResetResult(null);
    setShowPassword(false);
    setDrawerOpen(true);
  }

  function updateForm(field: keyof FormState, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }));
    setFormErrors((current) => {
      const next = { ...current };
      delete next.form;
      if (field === "fullName" || field === "email" || field === "phone" || field === "password" || field === "role") {
        delete next[field];
      }
      return next;
    });
  }

  async function submitForm() {
    const fullName = form.fullName.trim();
    const email = form.email.trim();
    const nameParts = fullName.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] ?? "";
    const lastName = nameParts.slice(1).join(" ");
    const normalizedPhone = normalizeMozambiquePhone(form.phone);
    if (!fullName || !email) {
      setFormErrors({
        ...(fullName ? {} : { fullName: "Informe o nome completo do administrador." }),
        ...(email ? {} : { email: "Informe o email do administrador." }),
      });
      showFeedback("error", "Corrige os campos assinalados antes de guardar.");
      return;
    }
    const nextErrors: FormErrors = {};
    if (!fullName) nextErrors.fullName = "Informe o nome completo do administrador.";
    if (!email) {
      nextErrors.email = "Informe o email do administrador.";
    } else if (!isValidEmail(email)) {
      nextErrors.email = "Email invalido. Use um endereco no formato nome@dominio.com.";
    }
    if (normalizedPhone === null) nextErrors.phone = "Telefone invalido. Use um numero mocambicano no formato +2588xxxxxxxx.";
    if (drawerMode === "create" && !form.password.trim()) nextErrors.password = "Define uma senha temporaria para o novo administrador.";
    if (!PERMISSION_ROLES.includes(form.role)) nextErrors.role = "Seleciona uma role valida para este administrador.";
    if (drawerMode === "edit" && selectedAdmin?.email === currentUserEmail && form.role !== "SUPER_ADMIN") nextErrors.role = "Nao podes rebaixar a tua propria role de SUPER_ADMIN.";
    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(nextErrors);
      showFeedback("error", "Corrige os campos assinalados antes de guardar.");
      return;
    }
    setSaving(true);
    try {
      if (drawerMode === "create") {
        await adminApiFetch("/api/super-admin/admins", { method: "POST", body: JSON.stringify({ firstName, lastName, email, phone: normalizedPhone, password: form.password, role: form.role, active: form.active, sendCredentials: form.sendCredentials }) });
        showFeedback("success", "Administrador criado com sucesso.");
      } else if (selectedAdmin) {
        await adminApiFetch(`/api/super-admin/admins/${selectedAdmin.id}`, { method: "PUT", body: JSON.stringify({ firstName, lastName, email, phone: normalizedPhone, role: form.role, active: form.active, sendCredentials: form.sendCredentials }) });
        showFeedback("success", "Alterações guardadas com sucesso.");
      }
      setFormErrors({});
      setDrawerOpen(false);
      await Promise.all([loadStats(), loadAdmins(page)]);
      if (selectedAdmin) await refreshSelectedAdmin(selectedAdmin.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel guardar o administrador.";
      setFormErrors(inferAdminFormErrors(message));
      showFeedback("error", message);
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword() {
    if (!selectedAdmin) return;
    setResettingPassword(true);
    try {
      const result = await adminApiFetch<{
        generatedPassword?: string;
        emailSent?: boolean;
        emailError?: string | null;
      }>(`/api/super-admin/admins/${selectedAdmin.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ sendEmail: form.sendCredentials }),
      });
      const pwd = result?.generatedPassword;
      const sent = result?.emailSent ?? false;
      if (pwd) {
        const emailNote = sent
          ? " Email enviado."
          : result?.emailError
            ? ` (${result.emailError})`
            : " Email nao enviado.";
        setResetResult({ password: pwd, emailSent: sent, emailError: result?.emailError ?? null });
        showFeedback("success", `Nova senha: ${pwd}${emailNote}`);
      } else {
        setResetResult({ password: null, emailSent: sent, emailError: result?.emailError ?? null });
        showFeedback("success", sent ? "Nova senha gerada e enviada por email." : "Nova senha gerada.");
      }
      await refreshSelectedAdmin(selectedAdmin.id);
    } catch (error) {
      showFeedback("error", error instanceof Error ? error.message : "Nao foi possivel redefinir a senha.");
    } finally {
      setResettingPassword(false);
    }
  }

  async function handleSuspend(payload: { reason: string; duration: string }) {
    if (!suspendTarget) return;
    if (suspendTarget.email === currentUserEmail) return showFeedback("error", "Nao podes suspender a tua própria conta.");
    try {
      await adminApiFetch(`/api/super-admin/admins/${suspendTarget.id}/suspend`, { method: "PUT", body: JSON.stringify(payload) });
      const targetId = suspendTarget.id;
      setSuspendTarget(null);
      showFeedback("success", "Administrador suspenso com sucesso.");
      await Promise.all([loadStats(), loadAdmins(page)]);
      if (selectedAdmin?.id === targetId) await refreshSelectedAdmin(targetId);
    } catch (error) {
      showFeedback("error", error instanceof Error ? error.message : "Nao foi possivel suspender o administrador.");
    }
  }

  async function handleRemove(admin: ManagedAdmin) {
    if (admin.email === currentUserEmail) return showFeedback("error", "Nao podes suspender ou remover a tua própria conta.");
    if (admin.role === "SUPER_ADMIN" && totalSuperAdmins <= 1) return showFeedback("error", "Nao é possível remover o último SUPER_ADMIN do sistema.");
    if (!window.confirm(`Tens a certeza que queres revogar o acesso de ${admin.name}?`)) return;
    if (!window.confirm("Confirma novamente. Esta remoção é permanente.")) return;
    try {
      await adminApiFetch(`/api/super-admin/admins/${admin.id}`, { method: "DELETE" });
      if (selectedAdmin?.id === admin.id) setSelectedAdmin(null);
      showFeedback("success", "Acesso revogado permanentemente.");
      await Promise.all([loadStats(), loadAdmins(page)]);
    } catch (error) {
      showFeedback("error", error instanceof Error ? error.message : "Nao foi possivel remover o administrador.");
    }
  }

  async function handleExport() {
    try {
      const params = new URLSearchParams({ page: "0", size: String(Math.max(totalElements || 10, 10)) });
      if (roleFilter !== "ALL") params.set("role", roleFilter);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (searchInput.trim()) params.set("search", searchInput.trim());
      const payload = await adminApiFetch<ManagedAdminsPageResponse>(`/api/super-admin/admins?${params.toString()}`);
      downloadTextFile("administradores.csv", buildCsv(payload.content ?? []));
    } catch (error) {
      showFeedback("error", error instanceof Error ? error.message : "Nao foi possivel exportar a lista.");
    }
  }

  if (isLoading || profile.role !== "SUPER_ADMIN") return null;

  return (
    <div className="space-y-5">
      <section className="sticky top-[88px] z-10 rounded-[28px] border border-[var(--color-border)] bg-[color:var(--color-surface-overlay)]/95 px-6 py-5 backdrop-blur-xl">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E8431A]">Super Admin</p>
            <div className="mt-1 flex items-center gap-3"><ShieldIcon className="h-6 w-6 text-[#3C3489]" /><h1 className="font-[family-name:var(--font-sora)] text-3xl font-semibold text-[var(--color-text-primary)]">Gestão de administradores</h1></div>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{stats ? `${stats.active} admins activos em ${stats.total} contas administrativas.` : "A carregar contagem de administradores..."}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void handleExport()} className="admin-button-muted flex items-center gap-2"><DownloadIcon className="h-4 w-4" />Exportar lista</button>
            <button type="button" onClick={openCreateDrawer} className="inline-flex items-center gap-2 rounded-[18px] bg-[#E8431A] px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(232,67,26,0.22)]"><PlusIcon className="h-4 w-4" />Adicionar administrador</button>
          </div>
        </div>
      </section>

      {feedback ? <FeedbackBanner tone={feedback.tone} message={feedback.message} /> : null}
      <StatsCards stats={stats} />

      <section className="admin-card p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {ROLE_PILLS.map((role) => {
              const active = roleFilter === role;
              return <button key={role} type="button" onClick={() => setRoleFilter(role)} className="rounded-full px-3.5 py-2 text-xs font-semibold transition" style={{ background: active ? "#E8431A" : "var(--color-background-secondary)", color: active ? "#FFFFFF" : "var(--color-text-secondary)", fontFamily: role === "ALL" ? undefined : "var(--font-sora)" }}>{role === "ALL" ? "Todos" : role}</button>;
            })}
          </div>
          <div className="flex flex-col gap-2 md:flex-row">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
              <input value={searchInput} onChange={(event) => handleSearchChange(event.target.value)} className="admin-input min-w-[260px] pl-10" placeholder="Pesquisar por nome ou email" />
            </div>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "ALL" | ManagedAdminStatus)} className="admin-input min-w-[180px]">{STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="admin-card overflow-hidden">
          <div className="grid items-center gap-3 bg-[var(--color-background-secondary)] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]" style={{ gridTemplateColumns: "minmax(240px,2fr) 160px 180px 170px 120px 150px" }}>
            <span>Administrador</span><span>Role</span><span>Módulos de acesso</span><span>Último acesso</span><span>Estado</span><span className="text-right">Acções</span>
          </div>

          {loading ? (
            <div className="divide-y divide-[var(--color-border)]">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="flex items-center gap-4 px-5 py-4"><div className="h-11 w-11 animate-pulse rounded-full bg-[var(--color-background-secondary)]" /><div className="flex-1 space-y-2"><div className="h-3 w-40 animate-pulse rounded bg-[var(--color-background-secondary)]" /><div className="h-3 w-64 animate-pulse rounded bg-[var(--color-background-secondary)]" /></div></div>)}</div>
          ) : admins.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-20 text-center"><UsersIcon className="h-10 w-10 text-[var(--color-text-tertiary)]" /><p className="mt-3 font-semibold text-[var(--color-text-primary)]">Sem administradores encontrados</p><p className="mt-1 text-sm text-[var(--color-text-secondary)]">Ajusta os filtros ou cria um novo administrador.</p></div>
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {admins.map((admin) => {
                const roleStyle = getRoleStyle(admin.role);
                const statusStyle = getStatusStyle(admin.status);
                const isCurrentUser = admin.email === currentUserEmail;
                const isSelected = selectedAdmin?.id === admin.id;
                const isLastSuperAdmin = admin.role === "SUPER_ADMIN" && totalSuperAdmins <= 1;
                const rowHighlight = getRowHighlight(isCurrentUser, isSelected);

                return (
                  <div
                    key={admin.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => { setSelectedAdmin(admin); void refreshSelectedAdmin(admin.id).catch(() => null); }}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedAdmin(admin); void refreshSelectedAdmin(admin.id).catch(() => null); } }}
                    className="grid cursor-pointer items-center gap-3 px-5 py-4 transition hover:bg-white/3"
                    style={{ gridTemplateColumns: "minmax(240px,2fr) 160px 180px 170px 120px 150px", background: rowHighlight.background, boxShadow: rowHighlight.boxShadow }}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <AdminAvatar admin={admin} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><p className="truncate font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--color-text-primary)]">{admin.name}</p>{isCurrentUser ? <span className="rounded-full bg-[#D9D6FE] px-2 py-0.5 text-[10px] font-semibold text-[#3C3489]">Você</span> : null}</div>
                        <p className="truncate text-xs text-[var(--color-text-secondary)]">{admin.email}</p>
                      </div>
                    </div>
                    <div><span className="inline-flex rounded-full px-3 py-1 text-xs font-semibold" style={{ background: roleStyle.bg, color: roleStyle.text, fontFamily: "var(--font-sora)" }}>{humanizeRole(admin.role)}</span></div>
                    <ModulesPreview modules={admin.modules} highlighted={isSelected || isCurrentUser} />
                    <p className="text-sm text-[var(--color-text-secondary)]">{formatDateTime(admin.lastAccessAt)}</p>
                    <div><span className="inline-flex rounded-full px-3 py-1 text-xs font-semibold" style={{ background: statusStyle.bg, color: statusStyle.text }}>{statusStyle.label}</span></div>
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" onClick={(event) => { event.stopPropagation(); setSelectedAdmin(admin); openEditDrawer(admin); void refreshSelectedAdmin(admin.id).catch(() => null); }} className="rounded-full p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-background-secondary)] hover:text-[#E8431A]" title="Editar"><PencilIcon className="h-4 w-4" /></button>
                      <button type="button" disabled={admin.status === "SUSPENDED" || isCurrentUser} onClick={(event) => { event.stopPropagation(); if (isCurrentUser) return showFeedback("error", "Nao podes suspender a tua própria conta."); setSuspendTarget(admin); }} className="rounded-full p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-background-secondary)] hover:text-[#E8431A] disabled:cursor-not-allowed disabled:opacity-45" title="Suspender"><PauseIcon className="h-4 w-4" /></button>
                      <button type="button" disabled={isCurrentUser || isLastSuperAdmin} onClick={(event) => { event.stopPropagation(); void handleRemove(admin); }} className="rounded-full p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-background-secondary)] hover:text-[#B42318] disabled:cursor-not-allowed disabled:opacity-45" title="Remover"><TrashIcon className="h-4 w-4" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-3">
              <p className="text-xs text-[var(--color-text-tertiary)]">Página {page + 1} de {Math.max(totalPages, 1)}</p>
              <div className="flex items-center gap-2"><button type="button" disabled={page === 0} onClick={() => void loadAdmins(page - 1).catch(() => null)} className="admin-button-muted disabled:cursor-not-allowed disabled:opacity-50">Anterior</button><button type="button" disabled={page >= totalPages - 1} onClick={() => void loadAdmins(page + 1).catch(() => null)} className="admin-button-muted disabled:cursor-not-allowed disabled:opacity-50">Seguinte</button></div>
            </div>
          ) : null}
        </section>

        <aside className="admin-card overflow-hidden xl:sticky xl:top-[176px] xl:h-fit">
          <DetailsPanel admin={selectedAdmin} currentUserEmail={currentUserEmail} totalSuperAdmins={totalSuperAdmins} onEdit={(admin) => { setSelectedAdmin(admin); openEditDrawer(admin); }} onSuspend={(admin) => { if (admin.email === currentUserEmail) return showFeedback("error", "Nao podes suspender a tua própria conta."); setSuspendTarget(admin); }} onRemove={(admin) => { void handleRemove(admin); }} />
        </aside>
      </div>

      <PermissionMatrix />
      <AdminFormDrawer open={drawerOpen} mode={drawerMode} form={form} errors={formErrors} saving={saving} resettingPassword={resettingPassword} resetResult={resetResult} showPassword={showPassword} onClose={() => setDrawerOpen(false)} onTogglePassword={() => setShowPassword((current) => !current)} onChange={updateForm} onGeneratePassword={() => updateForm("password", generateSecurePassword())} onSubmit={() => void submitForm()} onResetPassword={drawerMode === "edit" ? () => void handleResetPassword() : null} />
      {suspendTarget ? <SuspendModal admin={suspendTarget} onClose={() => setSuspendTarget(null)} onConfirm={(payload) => void handleSuspend(payload)} /> : null}
    </div>
  );
}
