import { Blocks } from "lucide-react";
import { cn } from "./client";

export const PRODUCT_NAME = "ReBrix";
export const TAGLINE = "Rethink. Rebuild. Together.";

/** "ReBrix." with "Brix" in the accent colour. */
export function BrandName({ className }: { className?: string }) {
  return (
    <span className={cn("font-bold tracking-tight", className)}>
      Re<span className="text-accent">Brix</span>.
    </span>
  );
}

export function BrandIcon({ size = 18, className }: { size?: number; className?: string }) {
  return <Blocks size={size} className={className} aria-hidden />;
}
