/**
 * <ProductCell> — table-row product label with thumbnail.
 *
 * Used in every list that shows a product reference (products, pricing,
 * purchases, sales, invoices, requests, reviews, reports). Centralises
 * three things so we don't drift across pages:
 *
 *  - thumbnail box (square, lazy, with watch icon placeholder)
 *  - product name (line-clamped, optional Arabic preference)
 *  - meta line (brand · color, or SKU, caller picks)
 *
 * Pass `image` = first entry of `product.image_urls`. If null/empty we draw
 * a wristwatch placeholder so the layout stays aligned.
 */
import { Watch } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProductCell({
  image,
  name,
  meta,
  size = "md",
  className,
}: {
  image?: string | null;
  name: string;
  meta?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dim = size === "sm" ? "size-8" : size === "lg" ? "size-14" : "size-10";
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className={cn("relative shrink-0 overflow-hidden rounded-md border bg-muted", dim)}>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            aria-hidden
            loading="lazy"
            referrerPolicy="no-referrer"
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground/60">
            <Watch className="size-1/2" aria-hidden />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="line-clamp-2 font-medium leading-tight" title={name}>{name}</div>
        {meta != null && <div className="mt-0.5 text-xs text-muted-foreground">{meta}</div>}
      </div>
    </div>
  );
}
