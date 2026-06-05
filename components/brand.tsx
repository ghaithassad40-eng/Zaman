import { cn } from "@/lib/utils";

/**
 * Zaman Watch wordmark. Drop the official PNG at /public/logo.png to replace
 * the inline mark with the real logo if desired.
 */
export function Brand({
  className,
  showText = true,
  size = 36,
}: {
  className?: string;
  showText?: boolean;
  size?: number;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        className="shrink-0 text-primary"
        aria-hidden
      >
        <rect x="28" y="3" width="8" height="7" rx="1.5" fill="currentColor" />
        <rect x="28" y="54" width="8" height="7" rx="1.5" fill="currentColor" />
        <circle cx="32" cy="32" r="20.5" stroke="currentColor" strokeWidth="3" />
        <path d="M32 20v12l8 5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {showText && (
        <div className="leading-none">
          <div className="text-base font-bold tracking-[0.18em] text-primary">ZAMAN</div>
          <div className="text-sm font-semibold text-primary/80" style={{ fontFamily: "var(--font-arabic)" }}>
            زمن
          </div>
        </div>
      )}
    </div>
  );
}
