import type { ReactElement, SVGProps } from "react";

export const DEFAULT_CATEGORY_ICON = "package";

type IconComponent = (props: SVGProps<SVGSVGElement>) => ReactElement;

type IconOption = {
  key: string;
  label: string;
  Icon: IconComponent;
};

function PhoneIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 18h2" />
    </svg>
  );
}

function LaptopIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="4" y="5" width="16" height="11" rx="2" />
      <path d="M2 19h20" />
    </svg>
  );
}

function ShirtIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 4 7 7 3.5 8.5 5 12l3-1.5V20h8v-9.5l3 1.5 1.5-3.5L17 7l-2-3z" />
    </svg>
  );
}

function HomeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m3 11 9-7 9 7" />
      <path d="M5 10.5V20h14v-9.5" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}

function BeautyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M10 3h4" />
      <path d="M9 6h6l1 12a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z" />
      <path d="M8 10h8" />
    </svg>
  );
}

function ToyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="8" cy="8" r="2.5" />
      <circle cx="16" cy="8" r="2.5" />
      <path d="M7 10.5v2.5a5 5 0 0 0 10 0v-2.5" />
      <path d="M12 13v7" />
      <path d="M9 20h6" />
    </svg>
  );
}

function SneakerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 16c1.5 0 2.5-.6 4-2l2-2 3 2c1.2.8 2.6 1.2 4 1.2H20v4H4z" />
      <path d="M8 16h1" />
      <path d="M11 16h1" />
      <path d="M14 16h1" />
    </svg>
  );
}

function WatchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="7" y="6" width="10" height="12" rx="4" />
      <path d="M9 2h6l1 4H8z" />
      <path d="M9 22h6l1-4H8z" />
      <path d="M12 9v3l2 2" />
    </svg>
  );
}

function SportIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8 8 2.5 1 1.5-2 1.5 2L16 8" />
      <path d="m8.5 15 3-.5L12 17l.5-2.5 3 .5" />
    </svg>
  );
}

function BookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19v18H7.5A2.5 2.5 0 0 0 5 22z" />
      <path d="M5 4.5v15A2.5 2.5 0 0 1 7.5 17H19" />
    </svg>
  );
}

function GamepadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M7 10h10a4 4 0 0 1 4 4v1a3 3 0 0 1-5.1 2.1L14 15H10l-1.9 2.1A3 3 0 0 1 3 15v-1a4 4 0 0 1 4-4Z" />
      <path d="M8 13v4" />
      <path d="M6 15h4" />
      <path d="M16.5 13.5h.01" />
      <path d="M18.5 15.5h.01" />
    </svg>
  );
}

function CarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 16V9l2-3h10l2 3v7" />
      <path d="M3 13h18" />
      <circle cx="7.5" cy="17.5" r="1.5" />
      <circle cx="16.5" cy="17.5" r="1.5" />
    </svg>
  );
}

function PackageIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 8.5 12 13 3 8.5" />
      <path d="M12 13v8" />
      <path d="M20 16V8l-8-4-8 4v8l8 4z" />
    </svg>
  );
}

const ICON_OPTIONS: IconOption[] = [
  { key: "phone", label: "Telemoveis", Icon: PhoneIcon },
  { key: "laptop", label: "Tecnologia", Icon: LaptopIcon },
  { key: "shirt", label: "Moda", Icon: ShirtIcon },
  { key: "home", label: "Casa", Icon: HomeIcon },
  { key: "beauty", label: "Beleza", Icon: BeautyIcon },
  { key: "toy", label: "Brinquedos", Icon: ToyIcon },
  { key: "sneaker", label: "Calcado", Icon: SneakerIcon },
  { key: "watch", label: "Acessorios", Icon: WatchIcon },
  { key: "sport", label: "Desporto", Icon: SportIcon },
  { key: "book", label: "Livros", Icon: BookIcon },
  { key: "gamepad", label: "Gaming", Icon: GamepadIcon },
  { key: "car", label: "Automovel", Icon: CarIcon },
  { key: "package", label: "Geral", Icon: PackageIcon },
];

const LEGACY_ICON_MAP: Record<string, string> = {
  "📱": "phone",
  "💻": "laptop",
  "👗": "shirt",
  "👠": "sneaker",
  "🏠": "home",
  "📚": "book",
  "🎮": "gamepad",
  "🍕": "package",
  "💄": "beauty",
  "⚽": "sport",
  "🎵": "watch",
  "🚗": "car",
  "🌿": "beauty",
  "💍": "watch",
  "🧸": "toy",
  "🎁": "package",
  "📦": "package",
};

const ICON_MAP = Object.fromEntries(ICON_OPTIONS.map((option) => [option.key, option])) as Record<string, IconOption>;

export const CATEGORY_ICON_OPTIONS = ICON_OPTIONS.map(({ key, label }) => ({ key, label }));

export function normalizeCategoryIconKey(icon?: string | null) {
  const value = icon?.trim();
  if (!value) return DEFAULT_CATEGORY_ICON;
  if (ICON_MAP[value]) return value;
  return LEGACY_ICON_MAP[value] ?? DEFAULT_CATEGORY_ICON;
}

export function getCategoryIconLabel(icon?: string | null) {
  return ICON_MAP[normalizeCategoryIconKey(icon)]?.label ?? "Geral";
}

export function CategoryIcon({
  icon,
  className,
}: {
  icon?: string | null;
  className?: string;
}) {
  const key = normalizeCategoryIconKey(icon);
  const Icon = ICON_MAP[key]?.Icon ?? PackageIcon;
  return <Icon className={className} />;
}
