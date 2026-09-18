-- One-time data cleanup: `purchases.total_cost` was written by client-side
-- JavaScript arithmetic (see app/dashboard/page.tsx and
-- app/dashboard/inventory/page.tsx, createPurchase()/saveEdit(), fixed in
-- the same change as this migration) with no rounding before insert/update.
-- That left some rows stored with more than 2 decimal places: either
-- floating-point noise (e.g. 11.059999999999999 instead of 11.06) or a
-- genuine fraction of a penny from percentage-discount maths (e.g. 2.75
-- with a 15% discount stored as 2.3375 instead of 2.34).
--
-- Scoped deliberately to still-open stock (awaiting_delivery / processing /
-- selling) only. Sold and written-off rows also have dirty total_cost
-- values, but their historical figures may already have fed a stored
-- profit_loss/roi or a filed return, so those are left untouched pending a
-- separate decision.
UPDATE public.purchases
SET total_cost = round(total_cost::numeric, 2)
WHERE status IN ('awaiting_delivery', 'processing', 'selling')
  AND total_cost IS NOT NULL
  AND total_cost <> round(total_cost::numeric, 2);
