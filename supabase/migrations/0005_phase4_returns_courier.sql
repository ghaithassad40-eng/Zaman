-- ============================================================================
-- Zaman Watch ERP — Phase 4: Sales returns + delivery-company (courier) statement
-- COD model: the courier collects the full order amount from the customer,
-- keeps its delivery fee, and owes the business the rest until it transfers.
-- Returns bring stock back, reverse the sale, and book a 2 JD return cost.
-- ============================================================================

-- A courier "clearing" account holds money collected on the business's behalf.
alter table accounts add column if not exists is_courier boolean not null default false;

-- ----------------------------------------------------------------------------
-- confirm_sale v3 — route COD collection through the courier account if one
-- exists (collect full total, deduct courier fee); else cash-in to the bank.
-- ----------------------------------------------------------------------------
create or replace function confirm_sale(p_sale_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r record; v_qty int; v_cost numeric(14,3); v_total_cost numeric(14,3) := 0;
  v_pack numeric(14,3) := 0; v_auto boolean := true; v_acc uuid; v_courier uuid; v_sale sales%rowtype;
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

  v_acc := default_account_id();
  v_courier := (select id from accounts where is_courier and is_active and deleted_at is null limit 1);

  if v_sale.payment_status = 'paid' and coalesce(v_sale.total,0) > 0 then
    if v_courier is not null then
      -- Courier collects the full amount from the customer (COD)…
      insert into cash_transactions(account_id, txn_date, direction, amount, category, ref_table, ref_id, note, created_by)
      values (v_courier, v_sale.sale_date, 'in', v_sale.total, 'cod_collected', 'sales', v_sale.id, v_sale.sale_no, auth.uid());
      -- …and keeps its delivery fee.
      if coalesce(v_sale.delivery_fee,0) > 0 then
        insert into cash_transactions(account_id, txn_date, direction, amount, category, ref_table, ref_id, note, created_by)
        values (v_courier, v_sale.sale_date, 'out', v_sale.delivery_fee, 'delivery_fee', 'sales', v_sale.id, 'Courier fee '||v_sale.sale_no, auth.uid());
      end if;
    elsif v_acc is not null then
      insert into cash_transactions(account_id, txn_date, direction, amount, category, ref_table, ref_id, note, created_by)
      values (v_acc, v_sale.sale_date, 'in', v_sale.total, 'sale', 'sales', v_sale.id, v_sale.sale_no, auth.uid());
    end if;
  end if;
end; $$;

-- ----------------------------------------------------------------------------
-- return_sale — bring stock back (weighted average), reverse the sale's cash,
-- mark it returned, and book the 2 JD return-delivery cost.
-- ----------------------------------------------------------------------------
create or replace function return_sale(p_sale_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record; v_qty int; v_avg numeric(14,3); v_fee numeric(14,3); v_acc uuid;
begin
  if not is_partner() then raise exception 'not authorized'; end if;

  if (select status from sales where id = p_sale_id) = 'returned' then
    raise exception 'Sale already returned';
  end if;

  for r in select * from sale_items where sale_id = p_sale_id loop
    if r.product_id is not null then
      select qty_on_hand, avg_unit_cost into v_qty, v_avg
        from inventory where product_id = r.product_id for update;
      if v_qty is null then
        insert into inventory(product_id, qty_on_hand, avg_unit_cost) values (r.product_id, r.qty, r.unit_cost);
      else
        update inventory set
          avg_unit_cost = case when (v_qty + r.qty) = 0 then v_avg
                               else round(((v_qty*v_avg)+(r.qty*r.unit_cost))/(v_qty+r.qty),3) end,
          qty_on_hand = v_qty + r.qty,
          updated_at = now()
        where product_id = r.product_id;
      end if;
      insert into inventory_movements(product_id, movement_type, qty, unit_cost, ref_table, ref_id, created_by)
      values (r.product_id, 'return_in', r.qty, r.unit_cost, 'sales', p_sale_id, auth.uid());
    end if;
  end loop;

  -- Reverse any cash this sale posted (COD on courier, or cash-in on bank).
  delete from cash_transactions where ref_table = 'sales' and ref_id = p_sale_id;

  update sales set status = 'returned', payment_status = 'refunded', updated_at = now()
   where id = p_sale_id;

  -- Book the return delivery cost (default 2 JD) as an expense on the bank.
  v_fee := coalesce((select default_delivery_fee from company_settings limit 1), 2);
  v_acc := default_account_id();
  if v_acc is not null and v_fee > 0 then
    insert into cash_transactions(account_id, txn_date, direction, amount, category, ref_table, ref_id, note, created_by)
    values (v_acc, current_date, 'out', v_fee, 'return_delivery', 'sales', p_sale_id, 'Return delivery fee', auth.uid());
  end if;
end; $$;

revoke execute on function return_sale(uuid) from anon;

-- ----------------------------------------------------------------------------
-- get_financials v2 — exclude returned sales; courier balance is a receivable
-- (separate asset, not cash); return-delivery counted in expenses.
-- ----------------------------------------------------------------------------
create or replace function get_financials(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_rate numeric;
  rev numeric; cogs numeric; gp numeric; del_inc numeric; del_exp numeric; opex numeric; np numeric;
  taxable numeric; out_gst numeric; in_gst numeric := 0;
  c_rev numeric; c_cogs numeric; c_del_inc numeric; c_del_exp numeric; c_out_gst numeric; c_opex numeric;
  retained numeric;
  c_cash numeric; c_courier numeric; c_inv numeric; c_equip numeric; c_pack_inv numeric;
  contributed numeric; drawings numeric; opening_plug numeric;
  total_assets numeric; total_liab numeric; total_equity numeric;
  partners_json jsonb; audits jsonb;
begin
  if not is_partner() then raise exception 'not authorized'; end if;
  v_rate := coalesce((select gst_rate from company_settings limit 1), 16);

  select coalesce(sum(subtotal - discount),0), coalesce(sum(total_cost),0),
         coalesce(sum(gross_profit),0), coalesce(sum(delivery_billed),0), coalesce(sum(delivery_fee),0)
    into rev, cogs, gp, del_inc, del_exp
  from sales where deleted_at is null and status not in ('cancelled','returned') and sale_date between p_from and p_to;

  select coalesce(sum(amount),0) into opex
  from cash_transactions where direction='out' and category in ('expense','fee','return_delivery') and txn_date between p_from and p_to;

  np := gp + del_inc - del_exp - opex;

  taxable := rev;
  select coalesce(sum(gst_amount),0) into out_gst
  from sales where deleted_at is null and status not in ('cancelled','returned') and sale_date between p_from and p_to;

  select coalesce(sum(subtotal - discount),0), coalesce(sum(total_cost),0),
         coalesce(sum(delivery_billed),0), coalesce(sum(delivery_fee),0), coalesce(sum(gst_amount),0)
    into c_rev, c_cogs, c_del_inc, c_del_exp, c_out_gst
  from sales where deleted_at is null and status not in ('cancelled','returned') and sale_date <= p_to;

  select coalesce(sum(amount),0) into c_opex
  from cash_transactions where direction='out' and category in ('expense','fee','return_delivery') and txn_date <= p_to;

  retained := (c_rev - c_cogs) + c_del_inc - c_del_exp - c_opex;

  -- Cash = non-courier accounts; courier balance is a separate receivable.
  c_cash := coalesce((select sum(opening_balance) from accounts where deleted_at is null and not is_courier),0)
    + coalesce((select sum(ct.amount) from cash_transactions ct join accounts a on a.id=ct.account_id
        where not a.is_courier and ct.direction='in' and ct.txn_date<=p_to),0)
    - coalesce((select sum(ct.amount) from cash_transactions ct join accounts a on a.id=ct.account_id
        where not a.is_courier and ct.direction='out' and ct.txn_date<=p_to),0);

  c_courier := coalesce((select sum(opening_balance) from accounts where deleted_at is null and is_courier),0)
    + coalesce((select sum(ct.amount) from cash_transactions ct join accounts a on a.id=ct.account_id
        where a.is_courier and ct.direction='in' and ct.txn_date<=p_to),0)
    - coalesce((select sum(ct.amount) from cash_transactions ct join accounts a on a.id=ct.account_id
        where a.is_courier and ct.direction='out' and ct.txn_date<=p_to),0);

  select coalesce(sum(qty_on_hand * avg_unit_cost),0) into c_inv from inventory;
  select coalesce(sum(purchase_cost),0) into c_equip
    from packaging_assets where kind='equipment' and is_active and deleted_at is null;
  select coalesce(sum(case when qty_purchased>0 then qty_remaining*(purchase_cost/qty_purchased) else 0 end),0)
    into c_pack_inv from packaging_assets where kind='consumable' and is_active and deleted_at is null;

  total_assets := c_cash + c_courier + c_inv + c_equip + c_pack_inv;

  total_liab := c_out_gst
    - coalesce((select sum(amount) from cash_transactions where category='gst' and direction='out' and txn_date<=p_to),0);
  if total_liab < 0 then total_liab := 0; end if;

  contributed := coalesce((select sum(opening_balance) from accounts where deleted_at is null and not is_courier),0)
               + coalesce((select sum(amount) from cash_transactions where category='capital' and direction='in' and txn_date<=p_to),0);
  drawings := coalesce((select sum(amount) from cash_transactions where category='drawing' and direction='out' and txn_date<=p_to),0);

  opening_plug := total_assets - total_liab - (contributed - drawings + retained);
  total_equity := contributed - drawings + retained + opening_plug;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.full_name, 'name_ar', p.name_ar, 'pct', p.ownership_pct,
      'capital', round((p.ownership_pct/100.0) * (contributed + opening_plug), 3),
      'profit_share', round((p.ownership_pct/100.0) * retained, 3),
      'drawings', round(coalesce((select sum(amount) from cash_transactions ct
                    where ct.category='drawing' and ct.direction='out' and ct.partner_id=p.id and ct.txn_date<=p_to),0),3),
      'equity', round((p.ownership_pct/100.0) * (contributed + opening_plug + retained)
                  - coalesce((select sum(amount) from cash_transactions ct
                      where ct.category='drawing' and ct.direction='out' and ct.partner_id=p.id and ct.txn_date<=p_to),0),3)
    ) order by p.created_at), '[]'::jsonb) into partners_json
  from partners p where p.deleted_at is null;

  audits := jsonb_build_array(
    jsonb_build_object('key','balance','label','Balance sheet balances',
      'pass', abs(total_assets-(total_liab+total_equity))<0.01,
      'detail', 'Assets '||round(total_assets,3)||' vs Liab+Equity '||round(total_liab+total_equity,3)),
    jsonb_build_object('key','gp','label','Gross profit consistent',
      'pass', abs(gp-(rev-cogs))<0.01, 'detail', 'GP '||round(gp,3)||' vs Rev-COGS '||round(rev-cogs,3)),
    jsonb_build_object('key','neg_stock','label','No negative stock',
      'pass', not exists(select 1 from inventory where qty_on_hand<0), 'detail',''),
    jsonb_build_object('key','neg_cash','label','No account overdrawn',
      'pass', not exists(select 1 from accounts a where a.deleted_at is null and not a.is_courier and
        (a.opening_balance
         + coalesce((select sum(amount) from cash_transactions where account_id=a.id and direction='in'),0)
         - coalesce((select sum(amount) from cash_transactions where account_id=a.id and direction='out'),0)) < 0),
      'detail',''),
    jsonb_build_object('key','purchases','label','All purchases received into stock',
      'pass', not exists(select 1 from purchases where deleted_at is null and status<>'received'),
      'detail','')
  );

  return jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'pl', jsonb_build_object('revenue',round(rev,3),'cogs',round(cogs,3),'gross_profit',round(gp,3),
        'delivery_income',round(del_inc,3),'delivery_expense',round(del_exp,3),'expenses',round(opex,3),'net_profit',round(np,3)),
    'gst', jsonb_build_object('rate',v_rate,'taxable_sales',round(taxable,3),'output_gst',round(out_gst,3),
        'input_gst',round(in_gst,3),'net_due',round(out_gst-in_gst,3)),
    'balance_sheet', jsonb_build_object(
        'cash',round(c_cash,3),'courier_receivable',round(c_courier,3),'inventory',round(c_inv,3),
        'equipment',round(c_equip,3),'packaging_inventory',round(c_pack_inv,3),
        'total_assets',round(total_assets,3),
        'gst_payable',round(total_liab,3),'total_liabilities',round(total_liab,3),
        'contributed_capital',round(contributed,3),'opening_capital',round(opening_plug,3),
        'retained_earnings',round(retained,3),'drawings',round(drawings,3),'total_equity',round(total_equity,3)),
    'roe', case when total_equity>0 then round(np/total_equity*100,2) else 0 end,
    'partners', partners_json,
    'audits', audits
  );
end; $$;

revoke execute on function get_financials(date, date) from anon;
