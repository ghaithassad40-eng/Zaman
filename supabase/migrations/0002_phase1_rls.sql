-- ============================================================================
-- Zaman Watch ERP — Phase 1: Row Level Security
-- Shared books: both LLC partners (rows in `partners`) have full access.
-- A signed-in user is a partner when is_partner() is true.
-- ============================================================================

alter table company_settings   enable row level security;
alter table partners           enable row level security;
alter table products           enable row level security;
alter table purchases          enable row level security;
alter table purchase_items     enable row level security;
alter table inventory          enable row level security;
alter table inventory_movements enable row level security;
alter table customers          enable row level security;
alter table sales              enable row level security;
alter table sale_items         enable row level security;
alter table invoices           enable row level security;
alter table doc_counters       enable row level security;

-- Partners: a user may always read their own partner row (needed to bootstrap
-- is_partner()), and partners may manage all partner rows.
create policy partners_self_read on partners
  for select using (user_id = auth.uid() or is_partner());
create policy partners_manage on partners
  for all using (is_partner()) with check (is_partner());

-- Generic full-access-for-partners policy on every business table.
do $$
declare t text;
begin
  foreach t in array array[
    'company_settings','products','purchases','purchase_items','inventory',
    'inventory_movements','customers','sales','sale_items','invoices','doc_counters'
  ]
  loop
    execute format($f$
      create policy %1$s_partner_all on %1$s
      for all using (is_partner()) with check (is_partner());
    $f$, t);
  end loop;
end $$;
