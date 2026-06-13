import type { Metadata } from "next";
import { ErrorSilencer } from "@/components/error-silencer";

export const metadata: Metadata = {
  title: "Zaman Watch — Shop",
  description: "Browse our watch collection.",
};

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <ErrorSilencer />
      {children}
    </div>
  );
}
