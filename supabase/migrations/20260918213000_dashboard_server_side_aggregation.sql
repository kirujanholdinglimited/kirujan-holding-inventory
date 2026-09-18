-- Move the Dashboard's "Real Stock Summary" cards and "Performance" table
-- aggregation from the browser into Postgres.
--
-- Why: the dashboard used to fetch every row of `purchases` (and friends)
-- into the browser with a plain, unordered `.select()` and sum them in
-- JavaScript. PostgREST caps an unbounded `.select()` at 1000 rows, so once
-- `purchases` grew past 1000 rows, the browser was silently summing an
-- incomplete table -- 28 "selling" rows (worth £237.43) were invisible to
-- every figure derived from that fetch. These functions compute the same
-- figures inside the database instead, over the full table, and hand the
-- browser only the already-aggregated numbers.
--
-- All money math is done in Postgres `numeric` (exact decimal), never
-- `float`/`double precision`, so there is no floating-point drift no matter
-- how many rows are summed.

-- ---------------------------------------------------------------------
-- 1. UK tax year bounds helper (6 April -> 5 April), from a "YYYY-YYYY"
--    label, matching the existing client-side getFyBounds() exactly.
-- ---------------------------------------------------------------------
create or replace function public.dashboard_fy_bounds(p_fy_label text)
returns table (start_date date, end_date date)
language plpgsql
stable
as $$
declare
  v_start_year int;
  v_end_year int;
begin
  if p_fy_label is null or p_fy_label !~ '^\d{4}-\d{4}$' then
    raise exception 'dashboard_fy_bounds: invalid tax year label %', p_fy_label;
  end if;

  v_start_year := split_part(p_fy_label, '-', 1)::int;
  v_end_year := split_part(p_fy_label, '-', 2)::int;

  if v_end_year <> v_start_year + 1 then
    raise exception 'dashboard_fy_bounds: invalid tax year label %', p_fy_label;
  end if;

  start_date := make_date(v_start_year, 4, 6);
  end_date := make_date(v_end_year, 4, 5);
  return next;
end;
$$;

comment on function public.dashboard_fy_bounds(text) is
  'UK tax year (6 Apr - 5 Apr) start/end dates for a "YYYY-YYYY" label. Mirrors app/dashboard/page.tsx getFyBounds().';

-- ---------------------------------------------------------------------
-- 2. Real Stock Summary cards: per-status unit counts + value sums.
--    Mirrors the `agg` loop + outboundShipmentStock reducer that used to
--    run client-side in app/dashboard/page.tsx (the `stock` useEffect).
-- ---------------------------------------------------------------------
create or replace function public.dashboard_stock_summary(p_fy_label text)
returns table (bucket text, units bigint, value numeric)
language sql
stable
as $$
  with fy as (
    select * from public.dashboard_fy_bounds(p_fy_label)
  ),
  priced_purchases as (
    select
      p.id,
      p.status,
      p.quantity,
      round(
        (case
          when coalesce(p.total_cost, 0) > 0 then p.total_cost
          else coalesce(p.unit_cost, 0) * coalesce(p.quantity, 0)
               + coalesce(p.tax_amount, 0)
               + coalesce(p.shipping_cost, 0)
         end)::numeric,
        2
      ) as row_value,
      -- rowSoldOrRemovedDate(): order_date ?? write_off_date (no created_at fallback)
      coalesce(p.order_date, p.write_off_date) as sold_bucket_date,
      -- rowWriteOffDate(): write_off_date only (no created_at fallback)
      p.write_off_date as damaged_bucket_date
    from public.purchases p
    where coalesce(p.quantity, 0) > 0
  )
  select 'inbound'::text, coalesce(sum(quantity), 0)::bigint, coalesce(sum(row_value), 0)::numeric
  from priced_purchases
  where status = 'awaiting_delivery'

  union all
  select 'processing'::text, coalesce(sum(quantity), 0)::bigint, coalesce(sum(row_value), 0)::numeric
  from priced_purchases
  where status = 'processing'

  union all
  select 'selling'::text, coalesce(sum(quantity), 0)::bigint, coalesce(sum(row_value), 0)::numeric
  from priced_purchases
  where status = 'selling'

  union all
  select 'damaged'::text, coalesce(sum(quantity), 0)::bigint, coalesce(sum(row_value), 0)::numeric
  from priced_purchases, fy
  where status = 'written_off'
    and damaged_bucket_date is not null
    and damaged_bucket_date between fy.start_date and fy.end_date

  union all
  select 'sold'::text, coalesce(sum(quantity), 0)::bigint, coalesce(sum(row_value), 0)::numeric
  from priced_purchases, fy
  where status = 'sold'
    and sold_bucket_date is not null
    and sold_bucket_date between fy.start_date and fy.end_date

  union all
  select
    'outbound'::text,
    coalesce(sum(coalesce(s.units, s.total_units)), 0)::bigint,
    coalesce(sum(s.box_value), 0)::numeric
  from public.shipments s, fy
  where s.shipment_date is not null
    and s.checkin_date is null
    and s.shipment_date between fy.start_date and fy.end_date;
$$;

comment on function public.dashboard_stock_summary(text) is
  'Per-status unit counts and exact-decimal value sums for the Real Stock Summary cards, aggregated in the database (no row cap). Mirrors app/dashboard/page.tsx stock useEffect.';

-- ---------------------------------------------------------------------
-- 3. Performance table: per-period (13 periods per UK tax year, April
--    split at the 6th) P&L figures. Mirrors monthlyPerformanceRows in
--    app/dashboard/page.tsx exactly, including its date-fallback rules.
-- ---------------------------------------------------------------------
create or replace function public.dashboard_monthly_performance(p_fy_label text)
returns table (
  period_index int,
  period_start date,
  period_end date,
  units_sold bigint,
  amazon_fees numeric,
  product_cost numeric,
  shipments numeric,
  refunds numeric,
  write_off numeric,
  misc numeric,
  expenses numeric,
  sales numeric,
  total_cost numeric,
  profit_loss numeric,
  roi numeric,
  amz_payout numeric
)
language plpgsql
stable
as $$
declare
  v_start_year int;
  v_end_year int;
begin
  if p_fy_label is null or p_fy_label !~ '^\d{4}-\d{4}$' then
    raise exception 'dashboard_monthly_performance: invalid tax year label %', p_fy_label;
  end if;

  v_start_year := split_part(p_fy_label, '-', 1)::int;
  v_end_year := split_part(p_fy_label, '-', 2)::int;

  if v_end_year <> v_start_year + 1 then
    raise exception 'dashboard_monthly_performance: invalid tax year label %', p_fy_label;
  end if;

  return query
  with periods(idx, p_start, p_end) as (
    values
      (0,  make_date(v_start_year, 4, 6),  make_date(v_start_year, 4, 30)),
      (1,  make_date(v_start_year, 5, 1),  (make_date(v_start_year, 6, 1) - 1)),
      (2,  make_date(v_start_year, 6, 1),  (make_date(v_start_year, 7, 1) - 1)),
      (3,  make_date(v_start_year, 7, 1),  (make_date(v_start_year, 8, 1) - 1)),
      (4,  make_date(v_start_year, 8, 1),  (make_date(v_start_year, 9, 1) - 1)),
      (5,  make_date(v_start_year, 9, 1),  (make_date(v_start_year, 10, 1) - 1)),
      (6,  make_date(v_start_year, 10, 1), (make_date(v_start_year, 11, 1) - 1)),
      (7,  make_date(v_start_year, 11, 1), (make_date(v_start_year, 12, 1) - 1)),
      (8,  make_date(v_start_year, 12, 1), (make_date(v_end_year, 1, 1) - 1)),
      (9,  make_date(v_end_year, 1, 1),    (make_date(v_end_year, 2, 1) - 1)),
      (10, make_date(v_end_year, 2, 1),    (make_date(v_end_year, 3, 1) - 1)),
      (11, make_date(v_end_year, 3, 1),    (make_date(v_end_year, 4, 1) - 1)),
      (12, make_date(v_end_year, 4, 1),    make_date(v_end_year, 4, 5))
  ),
  priced_purchases as (
    select
      p.*,
      round(
        (case
          when coalesce(p.total_cost, 0) > 0 then p.total_cost
          else coalesce(p.unit_cost, 0) * coalesce(p.quantity, 0)
               + coalesce(p.tax_amount, 0)
               + coalesce(p.shipping_cost, 0)
         end)::numeric,
        2
      ) as row_value,
      -- order_date ?? created_at (local date) -- used for soldRows / fbmShippingRows
      coalesce(p.order_date, (p.created_at at time zone 'Europe/London')::date) as sold_effective_date,
      -- purchase_date ?? created_at (local date) -- used for purchaseRowsForMonth
      coalesce(p.purchase_date, (p.created_at at time zone 'Europe/London')::date) as purchase_effective_date,
      -- write_off_date ?? created_at (local date) -- used for writeOffRows
      coalesce(p.write_off_date, (p.created_at at time zone 'Europe/London')::date) as write_off_effective_date,
      -- returned_date ?? last_return_date ?? refunded_date ?? order_date ?? created_at
      coalesce(p.returned_date, p.last_return_date, p.refunded_date, p.order_date, (p.created_at at time zone 'Europe/London')::date) as customer_return_effective_date,
      -- refunded_date ?? returned_date ?? created_at
      coalesce(p.refunded_date, p.returned_date, (p.created_at at time zone 'Europe/London')::date) as supplier_refund_effective_date
    from public.purchases p
  ),
  sold_by_period as (
    select
      pr.idx,
      sum(greatest(1, coalesce(pp.quantity, 0)))::bigint as units_sold,
      sum(coalesce(pp.amazon_fees, 0))::numeric as amazon_fees,
      sum(coalesce(pp.sold_amount, 0))::numeric as sales,
      sum(coalesce(pp.amazon_payout, 0))::numeric as amazon_payout_sum,
      sum(coalesce(pp.refund_amount, 0))::numeric as sold_refund_amount,
      sum(coalesce(pp.misc_fees, 0))::numeric as sold_misc_fees
    from periods pr
    join priced_purchases pp
      on pp.status = 'sold'
     and pp.sold_effective_date between pr.p_start and pr.p_end
    group by pr.idx
  ),
  purchases_by_period as (
    select
      pr.idx,
      sum(pp.row_value)::numeric as product_cost_gross,
      sum(coalesce(pp.misc_fees, 0)) filter (where pp.status <> 'sold')::numeric as non_sold_misc_fees
    from periods pr
    join priced_purchases pp
      on pp.purchase_effective_date between pr.p_start and pr.p_end
    group by pr.idx
  ),
  write_off_by_period as (
    select pr.idx, sum(coalesce(pp.write_off_fee, 0))::numeric as write_off
    from periods pr
    join priced_purchases pp
      on coalesce(pp.write_off_fee, 0) > 0
     and pp.write_off_effective_date between pr.p_start and pr.p_end
    group by pr.idx
  ),
  customer_return_by_period as (
    select pr.idx, sum(coalesce(pp.return_shipping_fee, 0))::numeric as customer_return_fee
    from periods pr
    join priced_purchases pp
      on coalesce(pp.return_shipping_fee, 0) > 0
     and pp.customer_return_effective_date between pr.p_start and pr.p_end
    group by pr.idx
  ),
  fbm_by_period as (
    select pr.idx, sum(coalesce(pp.fbm_shipping_fee, 0))::numeric as fbm_fee
    from periods pr
    join priced_purchases pp
      on coalesce(pp.fbm_shipping_fee, 0) > 0
     and pp.sold_effective_date between pr.p_start and pr.p_end
    group by pr.idx
  ),
  supplier_refund_by_period as (
    select
      pr.idx,
      sum(pp.row_value)::numeric as original_cost,
      sum(greatest(0, pp.row_value - coalesce(pp.refund_amount, 0)))::numeric as refund_loss
    from periods pr
    join priced_purchases pp
      on pp.status = 'refunded'
     and coalesce(pp.refund_amount, 0) > 0
     and pp.supplier_refund_effective_date between pr.p_start and pr.p_end
    group by pr.idx
  ),
  shipments_by_period as (
    select
      pr.idx,
      sum(
        round((
          case
            when coalesce(s.shipping_cost, 0) > 0 then coalesce(s.shipping_cost, 0)
            when coalesce(nullif(s.total, 0), s.cost, 0) > 0 and coalesce(s.tax, 0) > 0
              then coalesce(nullif(s.total, 0), s.cost, 0) - coalesce(s.tax, 0)
            else coalesce(nullif(s.total, 0), s.cost, 0)
          end
          + coalesce(s.tax, 0)
        )::numeric, 2)
      )::numeric as shipping_total
    from periods pr
    join public.shipments s
      on coalesce(s.shipment_date, (s.created_at at time zone 'Europe/London')::date) between pr.p_start and pr.p_end
    group by pr.idx
  ),
  payouts_by_period as (
    select pr.idx, sum(coalesce(po.amount, 0))::numeric as payouts_total
    from periods pr
    join public.payouts po
      on po.payout_date between pr.p_start and pr.p_end
    group by pr.idx
  ),
  expenses_by_period as (
    select pr.idx, sum(coalesce(e.amount, 0))::numeric as expenses_total
    from periods pr
    join public.expenses e
      on e.expense_date between pr.p_start and pr.p_end
    group by pr.idx
  ),
  loan_interest_by_period as (
    select pr.idx, sum(coalesce(dt.amount, 0))::numeric as loan_interest_total
    from periods pr
    join public.director_transactions dt
      on dt.transaction_date between pr.p_start and pr.p_end
     and (
        lower(coalesce(dt.transaction_type, '')) = 'bank_loan_interest'
        or (
          (lower(coalesce(dt.description, '') || ' ' || coalesce(dt.notes, '')) like '%loan%')
          and (lower(coalesce(dt.description, '') || ' ' || coalesce(dt.notes, '')) like '%interest%')
        )
     )
    group by pr.idx
  ),
  resolved as (
    select
      pr.idx,
      pr.p_start,
      pr.p_end,
      coalesce(sp.units_sold, 0)::bigint as units_sold,
      round(coalesce(sp.amazon_fees, 0)::numeric, 2) as amazon_fees,
      round((coalesce(pp2.product_cost_gross, 0) - coalesce(sr.original_cost, 0))::numeric, 2) as product_cost,
      round((coalesce(sh.shipping_total, 0) + coalesce(fb.fbm_fee, 0))::numeric, 2) as shipments,
      round((coalesce(sp.sold_refund_amount, 0) + coalesce(cr.customer_return_fee, 0))::numeric, 2) as refunds,
      round(coalesce(wo.write_off, 0)::numeric, 2) as write_off,
      (coalesce(sp.sold_misc_fees, 0) + coalesce(pp2.non_sold_misc_fees, 0))::numeric as misc,
      round((coalesce(ex.expenses_total, 0) + coalesce(li.loan_interest_total, 0) + coalesce(sr.refund_loss, 0))::numeric, 2) as expenses,
      round(coalesce(sp.sales, 0)::numeric, 2) as sales,
      case
        when coalesce(sp.amazon_payout_sum, 0) <> 0 then round(sp.amazon_payout_sum::numeric, 2)
        else round(coalesce(py.payouts_total, 0)::numeric, 2)
      end as amz_payout
    from periods pr
    left join sold_by_period sp on sp.idx = pr.idx
    left join purchases_by_period pp2 on pp2.idx = pr.idx
    left join write_off_by_period wo on wo.idx = pr.idx
    left join customer_return_by_period cr on cr.idx = pr.idx
    left join fbm_by_period fb on fb.idx = pr.idx
    left join supplier_refund_by_period sr on sr.idx = pr.idx
    left join shipments_by_period sh on sh.idx = pr.idx
    left join payouts_by_period py on py.idx = pr.idx
    left join expenses_by_period ex on ex.idx = pr.idx
    left join loan_interest_by_period li on li.idx = pr.idx
  )
  select
    r.idx,
    r.p_start,
    r.p_end,
    r.units_sold,
    r.amazon_fees,
    r.product_cost,
    r.shipments,
    r.refunds,
    r.write_off,
    r.misc,
    r.expenses,
    r.sales,
    (r.amazon_fees + r.product_cost + r.shipments + r.refunds + r.write_off + r.misc + r.expenses)::numeric as total_cost,
    (r.sales - (r.amazon_fees + r.product_cost + r.shipments + r.refunds + r.write_off + r.misc + r.expenses))::numeric as profit_loss,
    case
      when (r.amazon_fees + r.product_cost + r.shipments + r.refunds + r.write_off + r.misc + r.expenses) > 0
        then round(
          (r.sales - (r.amazon_fees + r.product_cost + r.shipments + r.refunds + r.write_off + r.misc + r.expenses))
          / (r.amazon_fees + r.product_cost + r.shipments + r.refunds + r.write_off + r.misc + r.expenses) * 100,
          4
        )
      else null
    end as roi,
    r.amz_payout
  from resolved r
  order by r.idx;
end;
$$;

comment on function public.dashboard_monthly_performance(text) is
  'Per-period (13 periods/tax year, split at 6 Apr) P&L figures for the Performance table, aggregated in the database. Mirrors monthlyPerformanceRows in app/dashboard/page.tsx.';

grant execute on function public.dashboard_fy_bounds(text) to anon, authenticated;
grant execute on function public.dashboard_stock_summary(text) to anon, authenticated;
grant execute on function public.dashboard_monthly_performance(text) to anon, authenticated;
