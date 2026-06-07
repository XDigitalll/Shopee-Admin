import type { AnchorHTMLAttributes, ReactNode, SVGProps } from "react";

import { buildWhatsAppUrl } from "@/lib/admin/whatsapp";

function WhatsAppIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12.04 3.5a8.43 8.43 0 0 0-7.26 12.72L3.8 20l3.88-1.02a8.42 8.42 0 1 0 4.36-15.48Zm0 1.5a6.93 6.93 0 1 1-3.52 12.9l-.26-.16-2.27.6.6-2.2-.17-.27A6.93 6.93 0 0 1 12.04 5Zm-2.4 3.55c-.16 0-.41.06-.63.3-.22.24-.82.8-.82 1.94 0 1.15.84 2.25.95 2.4.12.16 1.62 2.6 4.02 3.54 1.99.78 2.4.63 2.83.59.43-.04 1.4-.57 1.59-1.12.2-.55.2-1.02.14-1.12-.06-.1-.22-.16-.45-.28-.24-.12-1.4-.69-1.62-.77-.22-.08-.38-.12-.54.12-.16.24-.62.77-.76.93-.14.16-.28.18-.52.06-.24-.12-1-.37-1.9-1.17-.7-.63-1.18-1.4-1.32-1.64-.14-.24-.02-.37.1-.49.11-.1.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.4-.4-.54-.41h-.43Z" />
    </svg>
  );
}

type WhatsAppLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children"> & {
  phone: string | null | undefined;
  message?: string | null;
  children?: ReactNode;
  iconOnly?: boolean;
  stopPropagation?: boolean;
};

export function WhatsAppLink({
  phone,
  message,
  children,
  iconOnly = false,
  stopPropagation = false,
  className,
  title = "Falar no WhatsApp",
  ...props
}: WhatsAppLinkProps) {
  const href = buildWhatsAppUrl(phone, message);

  if (!href) {
    return (
      <span
        className={className}
        title="Telefone invalido para WhatsApp"
        aria-disabled="true"
      >
        {iconOnly ? <WhatsAppIcon className="h-4 w-4 opacity-45" /> : children}
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      title={title}
      aria-label={title}
      onClick={(event) => {
        if (stopPropagation) {
          event.stopPropagation();
        }
      }}
      {...props}
    >
      {iconOnly ? <WhatsAppIcon className="h-4 w-4" /> : children}
    </a>
  );
}

export function WhatsAppPhone({
  phone,
  message,
  className = "",
  stopPropagation = false,
  fallback = "Sem telefone",
}: {
  phone: string | null | undefined;
  message?: string | null;
  className?: string;
  stopPropagation?: boolean;
  fallback?: string;
}) {
  if (!phone) {
    return <span className={className}>{fallback}</span>;
  }

  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      <WhatsAppLink
        phone={phone}
        message={message}
        stopPropagation={stopPropagation}
        className="truncate hover:underline"
      >
        {phone}
      </WhatsAppLink>
      <WhatsAppLink
        phone={phone}
        message={message}
        iconOnly
        stopPropagation={stopPropagation}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#128C7E] transition hover:bg-[#EAF7EF]"
      />
    </span>
  );
}
