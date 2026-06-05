-- ============================================================================
-- Zaman Watch ERP — Phase 3: Auto accounting, tax manager, reports
-- A single function computes the period P&L, GST position, balance sheet,
-- per-partner equity (50/50), ROE and a set of audit checks straight from the
-- operational tables — so the books can never drift from inventory/sales/cash.
-- ============================================================================

create or replace function get_financials(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_rate numeric;
  rev numeric; cogs numeric; gp numeric; del_inc numeric; del_exp numeric; opex numeric; np numeric;
  taxable numeric; out_gst numeric; in_gst numeric := 0;
  c_rev numeric; c_cogs numeric; c_del_inc numeric; c_del_exp numeric; c_out_gst numeric; c_opex numeric;
  retained numeric;
  c_cash numeric; c_inv numeric; c_equip numeric; c_pack_inv numeric;
  contributed numeric; drawings numeric; opening_plug numeric;
  total_assets numeric; total_liab numeric; total_equity numeric;
  partners_json jsonb; audits jsonb;
begin
  if not is_partner() then raise exception 'not authorized'; end if;
  v_rate := coalesce((select gst_rate from company_settings limit 1), 16);

  -- ---- Period income statement ----
  select coalesce(sum(subtotal - discount),0), coalesce(sum(total_cost),0),
         coalesce(sum(gross_profit),0), coalesce(sum(delivery_billed),0), coalesce(sum(delivery_fee),0)
    into rev, cogs, gp, del_inc, del_exp
  from sales where deleted_at is null and status <> 'cancelled' and sale_date between p_from and p_to;

  select coalesce(sum(amount),0) into opex
  from cash_transactions where direction='out' and category in ('expense','fee') and txn_date between p_from and p_to;

  np := gp + del_inc - del_exp - opex;

  -- ---- Period GST (tax manager) ----
  taxable := rev;
  select coalesce(sum(gst_amount),0) into out_gst
  from sales where deleted_at is null and status <> 'cancelled' and sale_date between p_from and p_to;

  -- ---- Cumulative to p_to (for balance sheet / retained earnings) ----
  select coalesce(sum(subtotal - discount),0), coalesce(sum(total_cost),0),
         coalesce(sum(delivery_billed),0), coalesce(sum(delivery_fee),0), coalesce(sum(gst_amount),0)
    into c_rev, c_cogs, c_del_inc, c_del_exp, c_out_gst
  from sales where deleted_at is null and status <> 'cancelled' and sale_date <= p_to;

  select coalesce(sum(amount),0) into c_opex
  from cash_transactions where direction='out' and category in ('expense','fee') and txn_date <= p_to;

  retained := (c_rev - c_cogs) + c_del_inc - c_del_exp - c_opex;

  -- Cash position (all accounts) as of p_to
  c_cash := coalesce((select sum(opening_balance) from accounts where deleted_at is null),0)
          + coalesce((select sum(amount) from cash_transactions where direction='in'  and txn_date<=p_to),0)
          - coalesce((select sum(amount) from cash_transactions where direction='out' and txn_date<=p_to),0);

  select coalesce(sum(qty_on_hand * avg_unit_cost),0) into c_inv from inventory;
  select coalesce(sum(purchase_cost),0) into c_equip
    from packaging_assets where kind='equipment' and is_active and deleted_at is null;
  select coalesce(sum(case when qty_purchased>0 then qty_remaining*(purchase_cost/qty_purchased) else 0 end),0)
    into c_pack_inv from packaging_assets where kind='consumable' and is_active and deleted_at is null;

  total_assets := c_cash + c_inv + c_equip + c_pack_inv;

  -- Liabilities: GST collected but not yet remitted
  total_liab := c_out_gst
    - coalesce((select sum(amount) from cash_transactions where category='gst' and direction='out' and txn_date<=p_to),0);
  if total_liab < 0 then total_liab := 0; end if;

  -- Equity
  contributed := coalesce((select sum(opening_balance) from accounts where deleted_at is null),0)
               + coalesce((select sum(amount) from cash_transactions where category='capital' and direction='in' and txn_date<=p_to),0);
  drawings := coalesce((select sum(amount) from cash_transactions where category='drawing' and direction='out' and txn_date<=p_to),0);

  -- Opening capital plug = value brought in before the system (e.g. imported stock)
  opening_plug := total_assets - total_liab - (contributed - drawings + retained);
  total_equity := contributed - drawings + retained + opening_plug;

  -- Per-partner equity (ownership split for shared pools, partner-tagged drawings)
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

  -- Audit checks
  audits := jsonb_build_array(
    jsonb_build_object('key','balance','label','Balance sheet balances',
      'pass', abs(total_assets-(total_liab+total_equity))<0.01,
      'detail', 'Assets '||round(total_assets,3)||' vs Liab+Equity '||round(total_liab+total_equity,3)),
    jsonb_build_object('key','gp','label','Gross profit consistent',
      'pass', abs(gp-(rev-cogs))<0.01, 'detail', 'GP '||round(gp,3)||' vs Rev-COGS '||round(rev-cogs,3)),
    jsonb_build_object('key','neg_stock','label','No negative stock',
      'pass', not exists(select 1 from inventory where qty_on_hand<0), 'detail',''),
    jsonb_build_object('key','neg_cash','label','No account overdrawn',
      'pass', not exists(select 1 from accounts a where a.deleted_at is null and
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
        'cash',round(c_cash,3),'inventory',round(c_inv,3),'equipment',round(c_equip,3),'packaging_inventory',round(c_pack_inv,3),
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
