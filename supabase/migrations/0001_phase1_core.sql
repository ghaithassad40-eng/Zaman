-- ============================================================================
-- Zaman Watch ERP — Phase 1: Core schema
-- Inventory, Shein import, sell flow, Jordan GST (16%) invoicing
-- Currency: JOD (numeric(14,3) — Jordanian Dinar = 1000 fils, 3 decimals)
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type sale_status     as enum ('draft','confirmed','packed','delivered','completed','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status  as enum ('unpaid','partial','paid','refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type purchase_status as enum ('ordered','shipped','received','cancelled');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Shared helpers
-- ----------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

-- True when the current auth user is one of the LLC partners (shared books).
create or replace function is_partner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from partners p
    where p.user_id = auth.uid() and p.deleted_at is null
  );
$$;

-- ----------------------------------------------------------------------------
-- Company settings (singleton)
-- ----------------------------------------------------------------------------
create table company_settings (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null default 'Zaman Watch',
  name_ar               text not null default 'زمن',
  tax_number            text,                 -- Jordan sales-tax registration no.
  national_no           text,                 -- company national number
  gst_rate              numeric(5,2)  not null default 16.00,
  currency              char(3)       not null default 'JOD',
  default_delivery_fee  numeric(14,3) not null default 2.000,   -- 3rd-party courier
  address               text,
  address_ar            text,
  phone                 text,
  email                 text,
  instagram_handle      text default '@zamanwatch',
  logo_url              text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create trigger trg_company_settings_updated before update on company_settings
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Partners (50/50 LLC) — linked to auth.users
-- ----------------------------------------------------------------------------
create table partners (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique references auth.users(id) on delete set null,
  full_name     text not null,
  name_ar       text,
  email         text,
  phone         text,
  ownership_pct numeric(5,2) not null default 50.00,
  is_admin      boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create trigger trg_partners_updated before update on partners
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Products (watches catalogue) — Shein source fields
-- ----------------------------------------------------------------------------
create table products (
  id                    uuid primary key default gen_random_uuid(),
  sku                   text unique not null,
  name                  text not null,
  name_ar               text,
  description           text,
  brand                 text,
  category              text default 'watch',
  source                text not null default 'shein',   -- shein | manual
  source_url            text,                             -- Shein product / cart URL
  image_urls            text[] not null default '{}',
  default_selling_price numeric(14,3),                    -- suggested price (JOD)
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references auth.users(id),
  updated_by            uuid references auth.users(id),
  deleted_at            timestamptz
);
create index idx_products_sku    on products(sku);
create index idx_products_active on products(is_active) where deleted_at is null;
create trigger trg_products_updated before update on products
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Purchases (Shein orders) — header + items, landed cost
-- ----------------------------------------------------------------------------
create table purchases (
  id             uuid primary key default gen_random_uuid(),
  doc_no         text unique,
  reference      text,                                  -- Shein order number
  source         text not null default 'shein',
  order_date     date not null default current_date,
  src_currency   char(3) not null default 'USD',
  fx_rate        numeric(14,6) not null default 0.709000, -- src -> JOD
  items_total    numeric(14,3) not null default 0,      -- JOD, sum of item costs
  shipping_cost  numeric(14,3) not null default 0,
  customs_cost   numeric(14,3) not null default 0,
  clearance_cost numeric(14,3) not null default 0,
  other_cost     numeric(14,3) not null default 0,
  total_landed   numeric(14,3) not null default 0,
  status         purchase_status not null default 'ordered',
  raw_json       jsonb,                                 -- raw Shein cart API payload
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id),
  updated_by     uuid references auth.users(id),
  deleted_at     timestamptz
);
create trigger trg_purchases_updated before update on purchases
  for each row execute function set_updated_at();

create table purchase_items (
  id                  uuid primary key default gen_random_uuid(),
  purchase_id         uuid not null references purchases(id) on delete cascade,
  product_id          uuid references products(id),
  sku                 text,
  name                text,
  image_url           text,
  qty                 integer not null default 1 check (qty > 0),
  unit_cost_src       numeric(14,3) not null default 0,   -- in src currency
  unit_cost_jod       numeric(14,3) not null default 0,   -- converted to JOD
  allocated_overhead  numeric(14,3) not null default 0,   -- share of shipping/customs/clearance
  landed_unit_cost    numeric(14,3) not null default 0,   -- unit_cost_jod + allocated_overhead
  created_at          timestamptz not null default now()
);
create index idx_purchase_items_purchase on purchase_items(purchase_id);

-- ----------------------------------------------------------------------------
-- Inventory (moving-average cost) + movement ledger
-- ----------------------------------------------------------------------------
create table inventory (
  product_id    uuid primary key references products(id) on delete cascade,
  qty_on_hand   integer not null default 0,
  avg_unit_cost numeric(14,3) not null default 0,
  updated_at    timestamptz not null default now()
);

create table inventory_movements (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references products(id),
  movement_type text not null,             -- purchase_in | sale_out | adjustment
  qty           integer not null,          -- +in / -out
  unit_cost     numeric(14,3) not null default 0,
  ref_table     text,
  ref_id        uuid,
  note          text,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id)
);
create index idx_inv_mov_product on inventory_movements(product_id);

-- ----------------------------------------------------------------------------
-- Customers (Instagram buyers)
-- ----------------------------------------------------------------------------
create table customers (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  phone            text,
  instagram_handle text,
  city             text,
  address          text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id),
  deleted_at       timestamptz
);
create trigger trg_customers_updated before update on customers
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Sales + items
-- ----------------------------------------------------------------------------
create table sales (
  id              uuid primary key default gen_random_uuid(),
  sale_no         text unique not null,
  customer_id     uuid references customers(id),
  sold_by         uuid references partners(id),
  sale_date       date not null default current_date,
  status          sale_status    not null default 'draft',
  payment_status  payment_status not null default 'unpaid',
  currency        char(3) not null default 'JOD',
  subtotal        numeric(14,3) not null default 0,   -- sum of line totals (ex tax)
  discount        numeric(14,3) not null default 0,
  delivery_fee    numeric(14,3) not null default 0,   -- courier cost we pay
  delivery_billed numeric(14,3) not null default 0,   -- amount charged to customer
  gst_rate        numeric(5,2)  not null default 16.00,
  gst_amount      numeric(14,3) not null default 0,
  total           numeric(14,3) not null default 0,   -- grand total incl. tax + delivery
  total_cost      numeric(14,3) not null default 0,   -- COGS snapshot
  gross_profit    numeric(14,3) not null default 0,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id),
  updated_by      uuid references auth.users(id),
  deleted_at      timestamptz
);
create index idx_sales_customer on sales(customer_id);
create index idx_sales_date     on sales(sale_date);
create trigger trg_sales_updated before update on sales
  for each row execute function set_updated_at();

create table sale_items (
  id          uuid primary key default gen_random_uuid(),
  sale_id     uuid not null references sales(id) on delete cascade,
  product_id  uuid references products(id),
  description text,
  qty         integer not null default 1 check (qty > 0),
  unit_cost   numeric(14,3) not null default 0,   -- avg cost snapshot at sale time
  unit_price  numeric(14,3) not null default 0,   -- selling price ex tax
  discount    numeric(14,3) not null default 0,
  line_total  numeric(14,3) not null default 0,
  created_at  timestamptz not null default now()
);
create index idx_sale_items_sale on sale_items(sale_id);

-- ----------------------------------------------------------------------------
-- Invoices (Jordan GST)
-- ----------------------------------------------------------------------------
create table invoices (
  id            uuid primary key default gen_random_uuid(),
  invoice_no    text unique not null,
  sale_id       uuid references sales(id),
  customer_id   uuid references customers(id),
  issue_date    date not null default current_date,
  due_date      date,
  currency      char(3) not null default 'JOD',
  subtotal      numeric(14,3) not null default 0,
  discount      numeric(14,3) not null default 0,
  delivery_fee  numeric(14,3) not null default 0,
  gst_rate      numeric(5,2)  not null default 16.00,
  gst_amount    numeric(14,3) not null default 0,
  total         numeric(14,3) not null default 0,
  tax_number    text,                               -- company tax no. snapshot
  status        text not null default 'issued',     -- draft | issued | paid | void
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id),
  deleted_at    timestamptz
);
create trigger trg_invoices_updated before update on invoices
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Document numbering (ZW-000001 / INV-000001 / PUR-000001)
-- ----------------------------------------------------------------------------
create table doc_counters (
  doc_type text primary key,
  prefix   text not null,
  next_val bigint not null default 1
);
insert into doc_counters(doc_type, prefix, next_val) values
  ('sale','ZW',1), ('invoice','INV',1), ('purchase','PUR',1);

create or replace function next_doc_no(p_type text) returns text
language plpgsql security definer set search_path = public as $$
declare v_prefix text; v_val bigint;
begin
  update doc_counters set next_val = next_val + 1
   where doc_type = p_type
   returning prefix, next_val - 1 into v_prefix, v_val;
  if v_prefix is null then
    raise exception 'unknown doc type %', p_type;
  end if;
  return v_prefix || '-' || to_char(v_val, 'FM000000');
end; $$;

-- ----------------------------------------------------------------------------
-- Receive a purchase: move items into stock with moving-average cost
-- ----------------------------------------------------------------------------
create or replace function receive_purchase(p_purchase_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record; v_old_qty int; v_old_cost numeric(14,3); v_new_cost numeric(14,3);
begin
  if not is_partner() then raise exception 'not authorized'; end if;

  for r in
    select pi.*, p.id as prod_id
    from purchase_items pi
    join products p on p.id = pi.product_id
    where pi.purchase_id = p_purchase_id
  loop
    insert into inventory(product_id, qty_on_hand, avg_unit_cost)
    values (r.prod_id, 0, 0)
    on conflict (product_id) do nothing;

    select qty_on_hand, avg_unit_cost into v_old_qty, v_old_cost
    from inventory where product_id = r.prod_id for update;

    -- moving weighted average
    if (v_old_qty + r.qty) = 0 then
      v_new_cost := r.landed_unit_cost;
    else
      v_new_cost := round(
        ((v_old_qty * v_old_cost) + (r.qty * r.landed_unit_cost))
        / (v_old_qty + r.qty), 3);
    end if;

    update inventory
      set qty_on_hand = v_old_qty + r.qty,
          avg_unit_cost = v_new_cost,
          updated_at = now()
      where product_id = r.prod_id;

    insert into inventory_movements(product_id, movement_type, qty, unit_cost, ref_table, ref_id, created_by)
    values (r.prod_id, 'purchase_in', r.qty, r.landed_unit_cost, 'purchases', p_purchase_id, auth.uid());
  end loop;

  update purchases set status = 'received', updated_at = now() where id = p_purchase_id;
end; $$;

-- ----------------------------------------------------------------------------
-- Confirm a sale: deduct stock at moving-average cost, snapshot COGS/profit
-- ----------------------------------------------------------------------------
create or replace function confirm_sale(p_sale_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record; v_qty int; v_cost numeric(14,3); v_total_cost numeric(14,3) := 0;
begin
  if not is_partner() then raise exception 'not authorized'; end if;

  for r in select * from sale_items where sale_id = p_sale_id loop
    if r.product_id is not null then
      select qty_on_hand, avg_unit_cost into v_qty, v_cost
      from inventory where product_id = r.product_id for update;

      if v_qty is null then raise exception 'No inventory for product %', r.product_id; end if;
      if v_qty < r.qty then raise exception 'Insufficient stock for product % (have %, need %)', r.product_id, v_qty, r.qty; end if;

      update inventory
        set qty_on_hand = v_qty - r.qty, updated_at = now()
        where product_id = r.product_id;

      update sale_items set unit_cost = v_cost where id = r.id;

      insert into inventory_movements(product_id, movement_type, qty, unit_cost, ref_table, ref_id, created_by)
      values (r.product_id, 'sale_out', -r.qty, v_cost, 'sales', p_sale_id, auth.uid());

      v_total_cost := v_total_cost + (v_cost * r.qty);
    end if;
  end loop;

  update sales
    set status = 'confirmed',
        total_cost = v_total_cost,
        gross_profit = subtotal - discount - v_total_cost,
        updated_at = now()
    where id = p_sale_id;
end; $$;
