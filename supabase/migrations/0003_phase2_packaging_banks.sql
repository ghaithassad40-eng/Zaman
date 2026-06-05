-- ============================================================================
-- Zaman Watch ERP — Phase 2: Packaging assets + Bank/cash tracking
-- - Packaging assets (consumables per parcel + equipment amortized per use)
--   roll a per-parcel packaging cost into each sale's COGS.
-- - Cash/bank accounts with auto-posted money in/out and expected balances.
-- ============================================================================

do $$ begin create type asset_kind as enum ('consumable','equipment'); exception when duplicate_object then null; end $$;
do $$ begin create type account_type as enum ('cash','bank','wallet'); exception when duplicate_object then null; end $$;
do $$ begin create type txn_direction as enum ('in','out'); exception when duplicate_object then null; end $$;

-- Company-level packaging settings
alter table company_settings add column if not exists packaging_cost_per_order numeric(14,3) not null default 0;
alter table company_settings add column if not exists auto_packaging boolean not null default true;

-- Sale gets a packaging-cost snapshot
alter table sales add column if not exists packaging_cost numeric(14,3) not null default 0;

-- ----------------------------------------------------------------------------
-- Packaging / equipment assets
-- ----------------------------------------------------------------------------
create table packaging_assets (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  name_ar       text,
  kind          asset_kind not null default 'consumable',
  category      text,                                  -- box | bag | label | gift | printer | other
  purchase_cost numeric(14,3) not null default 0,      -- total spent on this asset
  qty_purchased integer not null default 1,            -- units bought (consumable) or 1 (equipment)
  qty_remaining integer,                               -- consumable units left (null for equipment)
  expected_uses integer,                               -- equipment: expected lifetime uses for amortization
  qty_per_order integer not null default 1,            -- units consumed per parcel
  is_active     boolean not null default true,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id),
  deleted_at    timestamptz
);
create trigger trg_packaging_assets_updated before update on packaging_assets
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Cash / bank accounts + transaction ledger
-- ----------------------------------------------------------------------------
create table accounts (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  name_ar         text,
  type            account_type not null default 'bank',
  opening_balance numeric(14,3) not null default 0,
  currency        char(3) not null default 'JOD',
  is_default      boolean not null default false,
  is_active       boolean not null default true,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id),
  deleted_at      timestamptz
);
create unique index uq_accounts_one_default on accounts(is_default) where is_default;
create trigger trg_accounts_updated before update on accounts
  for each row execute function set_updated_at();

create table cash_transactions (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  txn_date    date not null default current_date,
  direction   txn_direction not null,
  amount      numeric(14,3) not null check (amount >= 0),
  category    text,                          -- sale | purchase | asset | expense | drawing | deposit | withdrawal | fee | adjustment
  ref_table   text,
  ref_id      uuid,
  partner_id  uuid references partners(id),
  note        text,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id)
);
create index idx_cash_txn_account on cash_transactions(account_id);
create index idx_cash_txn_date on cash_transactions(txn_date);

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------
create or replace function default_account_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from accounts where is_default and is_active and deleted_at is null limit 1;
$$;

-- Recompute the per-parcel packaging cost from active assets.
create or replace function recompute_packaging_cost() returns void
language plpgsql security definer set search_path = public as $$
declare v numeric(14,3);
begin
  select coalesce(sum(
    case
      when kind = 'consumable' and qty_purchased > 0
        then (purchase_cost / qty_purchased) * qty_per_order
      when kind = 'equipment' and coalesce(expected_uses,0) > 0
        then (purchase_cost / expected_uses) * qty_per_order
      else 0
    end
  ), 0) into v
  from packaging_assets
  where is_active and deleted_at is null;

  update company_settings set packaging_cost_per_order = round(v, 3);
end; $$;

create or replace function tg_packaging_recompute() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform recompute_packaging_cost();
  return null;
end; $$;
create trigger trg_packaging_recompute
  after insert or update or delete on packaging_assets
  for each statement execute function tg_packaging_recompute();

-- Auto cash-out when buying a packaging asset.
create or replace function tg_asset_cashout() returns trigger
language plpgsql security definer set search_path = public as $$
declare acc uuid := default_account_id();
begin
  if acc is not null and coalesce(NEW.purchase_cost,0) > 0 then
    insert into cash_transactions(account_id, txn_date, direction, amount, category, ref_table, ref_id, note, created_by)
    values (acc, current_date, 'out', NEW.purchase_cost, 'asset', 'packaging_assets', NEW.id, NEW.name, auth.uid());
  end if;
  return NEW;
end; $$;
create trigger trg_asset_cashout after insert on packaging_assets
  for each row execute function tg_asset_cashout();

-- Auto cash-out when a purchase (Shein order) is recorded.
create or replace function tg_purchase_cashout() returns trigger
language plpgsql security definer set search_path = public as $$
declare acc uuid := default_account_id();
begin
  if acc is not null and coalesce(NEW.total_landed,0) > 0 then
    insert into cash_transactions(account_id, txn_date, direction, amount, category, ref_table, ref_id, note, created_by)
    values (acc, NEW.order_date, 'out', NEW.total_landed, 'purchase', 'purchases', NEW.id, coalesce(NEW.reference, NEW.doc_no), auth.uid());
  end if;
  return NEW;
end; $$;
create trigger trg_purchase_cashout after insert on purchases
  for each row execute function tg_purchase_cashout();

-- ----------------------------------------------------------------------------
-- confirm_sale v2: add packaging cost to COGS, consume consumables, cash-in
-- ----------------------------------------------------------------------------
create or replace function confirm_sale(p_sale_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r record; v_qty int; v_cost numeric(14,3); v_total_cost numeric(14,3) := 0;
  v_pack numeric(14,3) := 0; v_auto boolean := true; v_acc uuid; v_sale sales%rowtype;
begin
  if not is_partner() then raise exception 'not authorized'; end if;

  select coalesce(packaging_cost_per_order,0), coalesce(auto_packaging,true)
    into v_pack, v_auto from company_settings limit 1;
  if not v_auto then v_pack := 0; end if;

  for r in select * from sale_items where sale_id = p_sale_id loop
    if r.product_id is not null then
      select qty_on_hand, avg_unit_cost into v_qty, v_cost
        from inventory where product_id = r.product_id for update;
      if v_qty is null then raise exception 'No inventory for product %', r.product_id; end if;
      if v_qty < r.qty then raise exception 'Insufficient stock for product % (have %, need %)', r.product_id, v_qty, r.qty; end if;

      update inventory set qty_on_hand = v_qty - r.qty, updated_at = now() where product_id = r.product_id;
      update sale_items set unit_cost = v_cost where id = r.id;
      insert into inventory_movements(product_id, movement_type, qty, unit_cost, ref_table, ref_id, created_by)
      values (r.product_id, 'sale_out', -r.qty, v_cost, 'sales', p_sale_id, auth.uid());
      v_total_cost := v_total_cost + (v_cost * r.qty);
    end if;
  end loop;

  -- Consume one parcel's worth of consumables (so bags/boxes draw down).
  update packaging_assets
    set qty_remaining = greatest(0, coalesce(qty_remaining,0) - qty_per_order), updated_at = now()
    where is_active and deleted_at is null and kind = 'consumable' and qty_remaining is not null;

  update sales
    set status = 'confirmed',
        packaging_cost = v_pack,
        total_cost = v_total_cost + v_pack,
        gross_profit = subtotal - discount - (v_total_cost + v_pack),
        updated_at = now()
    where id = p_sale_id
    returning * into v_sale;

  -- Cash in to the default account if the sale is paid.
  v_acc := default_account_id();
  if v_acc is not null and v_sale.payment_status = 'paid' and coalesce(v_sale.total,0) > 0 then
    insert into cash_transactions(account_id, txn_date, direction, amount, category, ref_table, ref_id, note, created_by)
    values (v_acc, v_sale.sale_date, 'in', v_sale.total, 'sale', 'sales', v_sale.id, v_sale.sale_no, auth.uid());
  end if;
end; $$;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table packaging_assets  enable row level security;
alter table accounts          enable row level security;
alter table cash_transactions enable row level security;

create policy packaging_assets_partner_all on packaging_assets
  for all using (is_partner()) with check (is_partner());
create policy accounts_partner_all on accounts
  for all using (is_partner()) with check (is_partner());
create policy cash_transactions_partner_all on cash_transactions
  for all using (is_partner()) with check (is_partner());

-- harden new functions
revoke execute on function default_account_id() from anon;
revoke execute on function recompute_packaging_cost() from anon;
