import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Zaman Watch — Shop",
  description: "Browse our watch collection.",
};

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background">{children}</div>;
}
