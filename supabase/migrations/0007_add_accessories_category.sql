-- ============================================================================
-- Add an "Accessories" product category.
--
-- `products.watch_type` is the product category field (battery / automatic /
-- smartwatch / digital / other). Widen its CHECK constraint so non-watch items
-- (storage boxes, bags, straps, playing cards, etc.) can be classified as
-- "accessories" and filtered as their own category in the shop and pricing tools.
-- ============================================================================

alter table public.products
  drop constraint if exists products_watch_type_check;

alter table public.products
  add constraint products_watch_type_check
  check (watch_type = any (array['battery','automatic','smartwatch','digital','other','accessories']));
