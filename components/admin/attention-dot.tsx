export function AttentionDot({
  label = "Precisa de atencao",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      aria-label={label}
      title={label}
      className={`inline-flex h-3 w-3 shrink-0 rounded-full bg-[#F97316] shadow-[0_0_0_4px_rgba(249,115,22,0.16),0_0_18px_rgba(249,115,22,0.65)] ${className}`}
    />
  );
}
