import { requirePartner } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";
import { NotificationBanner } from "@/components/notifications";
import { ErrorSilencer } from "@/components/error-silencer";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const partner = await requirePartner();

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 border-e lg:block no-print">
        <div className="sticky top-0 h-screen">
          <AppSidebar />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar partnerName={partner.full_name} />
        <NotificationBanner />
        <ErrorSilencer />
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
