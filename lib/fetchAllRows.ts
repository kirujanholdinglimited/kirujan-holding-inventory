import { supabase } from "@/lib/supabase";

const SUPABASE_PAGE_SIZE = 1000;

/**
 * Supabase/PostgREST caps an unbounded `.select()` at a default row limit
 * (commonly 1000). Fetching a whole table for client-side use must always
 * go through this helper instead of a bare `.select()`, so a table growing
 * past that cap can never silently drop or reorder rows.
 */
export async function fetchAllRows<T>(
  table: string,
  selectClause: string,
  orderColumn: string,
  options?: { ascending?: boolean }
): Promise<{ data: T[]; error: string | null }> {
  const all: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(selectClause)
      .order(orderColumn, { ascending: options?.ascending ?? true })
      .range(from, from + SUPABASE_PAGE_SIZE - 1);

    if (error) return { data: all, error: error.message };

    const batch = (data ?? []) as T[];
    all.push(...batch);
    if (batch.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }

  return { data: all, error: null };
}
