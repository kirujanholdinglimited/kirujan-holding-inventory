import { supabase } from "@/lib/supabase";

const SUPABASE_PAGE_SIZE = 1000;

type SupabaseQuery = ReturnType<ReturnType<typeof supabase.from>["select"]>;

/**
 * Supabase/PostgREST caps an unbounded `.select()` at a default row limit
 * (commonly 1000). Fetching a whole table (or a filtered slice of one) for
 * client-side use must always go through this helper instead of a bare
 * `.select()`, so it can never silently drop or reorder rows past that cap.
 *
 * `orderColumn` must be unique, or paired with `thenOrderColumn` as a
 * unique tiebreaker, so pagination pages can't split or duplicate rows that
 * share the same primary sort value.
 */
export async function fetchAllRows<T>(
  table: string,
  selectClause: string,
  orderColumn: string,
  options?: {
    ascending?: boolean;
    thenOrderColumn?: string;
    thenAscending?: boolean;
    // Applies extra filters (e.g. .eq("status", "sold")) before ordering/paging.
    filter?: (query: SupabaseQuery) => SupabaseQuery;
  }
): Promise<{ data: T[]; error: string | null }> {
  const all: T[] = [];
  let from = 0;

  while (true) {
    let query = supabase.from(table).select(selectClause) as SupabaseQuery;
    if (options?.filter) query = options.filter(query);
    query = query.order(orderColumn, { ascending: options?.ascending ?? true });
    if (options?.thenOrderColumn) {
      query = query.order(options.thenOrderColumn, { ascending: options?.thenAscending ?? true });
    }

    const { data, error } = await query.range(from, from + SUPABASE_PAGE_SIZE - 1);

    if (error) return { data: all, error: error.message };

    const batch = (data ?? []) as T[];
    all.push(...batch);
    if (batch.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }

  return { data: all, error: null };
}
