-- ============================================================================
-- Zaman Watch — Fix: public shop catalogue was invisible to anonymous visitors
--
-- Symptom: the public shop (/shop and any shop.* subdomain) showed NO products,
-- even though ~57 products are active, flagged visible_on_shop, and in stock.
--
-- Root cause: two backend permission regressions broke the anonymous (anon)
-- read path that the public catalogue depends on:
--
--   1. EXECUTE on public.is_partner() had been revoked from `anon`. The partner
--      RLS policies (products_partner_all, company_settings_partner_all,
--      partners_all_requests, partners_all_reviews, the inventory partner
--      policy, ...) target role `public` — which INCLUDES anon — and call
--      is_partner() in their USING clause. With no EXECUTE, every anonymous read
--      of products/requests/reviews threw:
--          ERROR: permission denied for function is_partner
--      so the catalogue query failed outright and the shop rendered empty.
--      is_partner() is SECURITY DEFINER and returns false for an unauthenticated
--      visitor, so granting EXECUTE to anon is safe and widens no data access.
--
--   2. v_shop_availability had been switched to security_invoker=true. The view
--      reads the `inventory` table, which anon (correctly) has NO grant on
--      (cost-basis protection). As a security_invoker view it therefore failed
--      for anon, zeroing availability and filtering every product out of the
--      grid. The view only exposes safe columns (product_id, on_hand, reserved,
--      available), so it is meant to run security-definer.
--
-- IMPORTANT: Do NOT revert either change to satisfy a Supabase security-advisor
-- warning — flipping the view back to security_invoker, or revoking is_partner
-- from anon, is exactly what broke the public shop. The security-definer view is
-- intentional and only surfaces non-sensitive stock counts.
-- ============================================================================

grant execute on function public.is_partner() to anon;

alter view public.v_shop_availability set (security_invoker = false);
