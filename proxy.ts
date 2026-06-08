import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database.types";

/**
 * Next.js 16 proxy (formerly middleware). Refreshes the Supabase auth session
 * on every request and guards the authenticated app routes.
 */
export async function proxy(request: NextRequest) {
  // Public-shop host: rewrite the catalogue domain → /shop[/...]. Auth check is
  // skipped for these requests so anon visitors can browse the catalogue.
  // Matches two patterns:
  //   1. Any subdomain that starts with "shop." (e.g. shop.zamanwatch.jo)
  //   2. Any host explicitly listed in NEXT_PUBLIC_CATALOGUE_HOSTS (e.g.
  //      shop-zaman-jo.com) — comma-separated, case-insensitive.
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const explicitHosts = (process.env.NEXT_PUBLIC_CATALOGUE_HOSTS ?? "shop-zaman-jo.com")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const hostWithoutPort = host.split(":")[0];
  const isShopSubdomain = host.startsWith("shop.")
    || explicitHosts.includes(hostWithoutPort);
  const isShopPath = request.nextUrl.pathname === "/shop" || request.nextUrl.pathname.startsWith("/shop/");
  if (isShopSubdomain) {
    if (!isShopPath) {
      const url = request.nextUrl.clone();
      url.pathname = url.pathname === "/" ? "/shop" : `/shop${url.pathname}`;
      return NextResponse.rewrite(url);
    }
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/onboarding");
  const isPublic = isAuthRoute || pathname.startsWith("/auth") || pathname === "/shop" || pathname.startsWith("/shop/");

  // Not signed in and trying to reach the app → send to login.
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Signed in and on the login page → send to dashboard.
  if (user && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except static assets and Next internals.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
