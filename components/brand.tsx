import { cn } from "@/lib/utils";

/**
 * Zaman Watch wordmark. Renders the real /logo.png artwork (round watch face
 * with serif ZAMAN + Arabic زمن) when the file exists in /public, and falls
 * back to a vector approximation if not.
 *
 * Drop the official PNG at /public/logo.png to use the real artwork.
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        width={size}
        height={size}
        alt="Zaman Watch"
        className="shrink-0 object-contain"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty("display", "block"); }}
      />
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        className="shrink-0 text-primary"
        style={{ display: "none" }}
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
