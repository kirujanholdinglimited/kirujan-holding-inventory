"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Payout = {
  id: number;
  payout_date: string;
  reference: string | null;
  amount: number;
  created_at?: string | null;
};

type ExpenseRow = {
  amount: number | null;
};

type NewPayoutForm = {
  payout_date: string;
  reference: string;
  amount: string;
};

function formatMoney(value: number) {
  return `£${Number(value || 0).toFixed(2)}`;
}

function formatDate(value: string) {
  if (!value) return "-";

  const parts = value.split("-");
  if (parts.length !== 3) return value;

  const [year, month, day] = parts;
  return `${day}-${month}-${year}`;
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  const dt = new Date(`${text}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function getCurrentFyLabel(today = new Date()) {
  const year = today.getFullYear();
  const fyStart = new Date(year, 3, 6);
  const startYear = today >= fyStart ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

function isValidTaxYearLabel(v: string | null | undefined) {
  return /^\d{4}-\d{4}$/.test(String(v ?? ""));
}

function getFyBounds(label: string) {
  const [startYearRaw] = String(label).split("-");
  const startYear = Number(startYearRaw);
  const start = new Date(startYear, 3, 6, 0, 0, 0, 0);
  const end = new Date(startYear + 1, 3, 5, 23, 59, 59, 999);
  return { start, end };
}

function readStoredTaxYear() {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem("dashboard_selected_fy_v1");
    return isValidTaxYearLabel(stored) ? stored : null;
  } catch {
    return null;
  }
}

export default function PayoutsPage() {
  const currentFyLabel = getCurrentFyLabel();
  const [selectedFyLabel, setSelectedFyLabel] = useState<string>(
    readStoredTaxYear() ?? currentFyLabel
  );

  const [rows, setRows] = useState<Payout[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [totalExpenses, setTotalExpenses] = useState(0);
  const [totalPurchases, setTotalPurchases] = useState(0);

  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");

  const amountInputRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState<NewPayoutForm>({
    payout_date: new Date().toISOString().slice(0, 10),
    reference: "",
    amount: "",
  });

  async function loadPayouts() {
    const { data, error } = await supabase
      .from("payouts")
      .select("id, payout_date, reference, amount, created_at")
      .order("payout_date", { ascending: false })
      .order("id", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    setRows((data as Payout[]) || []);
  }

  async function loadExpenseTotal(fromIso: string, toIso: string) {
    const { data, error } = await supabase
      .from("expenses")
      .select("amount, expense_date");

    if (error) {
      throw new Error(error.message);
    }

    const total = ((data as (ExpenseRow & { expense_date?: string | null })[]) || []).reduce((sum, row) => {
      const dt = parseDate((row as any).expense_date);
      const matches = Boolean(
        dt && dt >= parseDate(fromIso)! && dt <= parseDate(toIso)!
      );
      return matches ? sum + Number(row.amount || 0) : sum;
    }, 0);

    setTotalExpenses(total);
  }

  async function loadPurchaseTotal(fromIso: string, toIso: string) {
    const { data, error } = await supabase.from("purchases").select("*");

    if (error) {
      throw new Error(error.message);
    }

    const total = ((data as any[]) || []).reduce((sum, row) => {
      const dt = parseDate(row.purchase_date ?? row.created_at ?? null);
      const matches = Boolean(
        dt && dt >= parseDate(fromIso)! && dt <= parseDate(toIso)!
      );
      if (!matches) return sum;

      const cost = Number(
        row.cost ??
          row.purchase_price ??
          row.unit_cost ??
          row.cost_price ??
          row.buy_cost ??
          row.price ??
          0
      );

      const quantity = Number(row.quantity ?? row.qty ?? 1);

      return sum + cost * quantity;
    }, 0);

    setTotalPurchases(total);
  }

  async function loadAll() {
    try {
      setLoading(true);
      setError(null);

      const fyLabel = isValidTaxYearLabel(selectedFyLabel)
        ? selectedFyLabel
        : currentFyLabel;
      const bounds = getFyBounds(fyLabel);
      const fromIso = bounds.start.toISOString().slice(0, 10);
      const toIso = bounds.end.toISOString().slice(0, 10);

      await Promise.all([
        loadPayouts(),
        loadExpenseTotal(fromIso, toIso),
        loadPurchaseTotal(fromIso, toIso),
      ]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load payouts page.";
      setError(message);
      setRows([]);
      setTotalExpenses(0);
      setTotalPurchases(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const stored = readStoredTaxYear();
    if (stored) setSelectedFyLabel(stored);
  }, []);

  useEffect(() => {
    const onTaxYearChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ taxYear?: string }>;
      const nextLabel = customEvent.detail?.taxYear ?? readStoredTaxYear() ?? currentFyLabel;
      if (isValidTaxYearLabel(nextLabel)) {
        setSelectedFyLabel(nextLabel);
      }
    };

    window.addEventListener(
      "dashboard-tax-year-change",
      onTaxYearChange as EventListener
    );
    return () =>
      window.removeEventListener(
        "dashboard-tax-year-change",
        onTaxYearChange as EventListener
      );
  }, [currentFyLabel]);

  useEffect(() => {
    loadAll();
  }, [selectedFyLabel]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setShowAddModal(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!showAddModal) return;

    const timer = window.setTimeout(() => {
      amountInputRef.current?.focus();
      amountInputRef.current?.select();
    }, 50);

    return () => window.clearTimeout(timer);
  }, [showAddModal]);

  const fyLabel = isValidTaxYearLabel(selectedFyLabel)
    ? selectedFyLabel
    : currentFyLabel;
  const fyBounds = useMemo(() => getFyBounds(fyLabel), [fyLabel]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rows.filter((row) => {
      const dt = parseDate(row.payout_date);
      const matchesTaxYear = Boolean(
        dt && dt >= fyBounds.start && dt <= fyBounds.end
      );
      if (!matchesTaxYear) return false;

      if (!term) return true;

      return (
        row.reference?.toLowerCase().includes(term) ||
        row.payout_date?.toLowerCase().includes(term) ||
        String(row.amount).toLowerCase().includes(term) ||
        String(row.id).includes(term)
      );
    });
  }, [rows, search, fyBounds]);

  const totalPayouts = useMemo(() => {
    return filteredRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  }, [filteredRows]);

  const filteredPayoutsTotal = useMemo(() => {
    return filteredRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  }, [filteredRows]);

  const runningBalance = useMemo(() => {
    return totalPayouts - totalExpenses - totalPurchases;
  }, [totalPayouts, totalExpenses, totalPurchases]);

  async function handleAddPayout(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const amount = Number(form.amount);

    if (!form.payout_date) {
      setError("Please select a payout date.");
      return;
    }

    if (!form.amount || Number.isNaN(amount) || amount <= 0) {
      setError("Amount must be greater than 0.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("payouts").insert([
      {
        payout_date: form.payout_date,
        reference: form.reference.trim() || null,
        amount,
      },
    ]);

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setForm({
      payout_date: new Date().toISOString().slice(0, 10),
      reference: "",
      amount: "",
    });

    setShowAddModal(false);
    setSaving(false);
    await loadAll();
  }

  async function handleDelete(id: number) {
    const confirmed = window.confirm("Delete this payout?");
    if (!confirmed) return;

    setError(null);

    const { error } = await supabase.from("payouts").delete().eq("id", id);

    if (error) {
      setError(error.message);
      return;
    }

    await loadAll();
  }

  return (
    <div className="w-full">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[18px] font-semibold text-black">Payouts</h1>
          <p className="text-[13px] text-neutral-600">
            Track Amazon payouts and add them to your running balance
          </p>
          <p className="mt-1 text-[12px] text-neutral-500">
            Hard-wired to the selected tax year using payout date ({fyLabel})
          </p>
        </div>

        <div className="text-right">
          <div className="text-[13px] text-neutral-500">Running Balance</div>
          <div className="text-[18px] font-semibold text-black">
            {formatMoney(runningBalance)}
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-[18px] border border-neutral-400 bg-white px-4 py-3">
          <div className="text-[12px] uppercase tracking-wide text-neutral-500">
            Total Payouts
          </div>
          <div className="mt-1 text-[18px] font-semibold text-black">
            {formatMoney(totalPayouts)}
          </div>
        </div>

        <div className="rounded-[18px] border border-neutral-400 bg-white px-4 py-3">
          <div className="text-[12px] uppercase tracking-wide text-neutral-500">
            Total Expenses
          </div>
          <div className="mt-1 text-[18px] font-semibold text-black">
            {formatMoney(totalExpenses)}
          </div>
        </div>

        <div className="rounded-[18px] border border-neutral-400 bg-white px-4 py-3">
          <div className="text-[12px] uppercase tracking-wide text-neutral-500">
            Total Purchases
          </div>
          <div className="mt-1 text-[18px] font-semibold text-black">
            {formatMoney(totalPurchases)}
          </div>
        </div>

        <div className="rounded-[18px] border border-neutral-400 bg-white px-4 py-3">
          <div className="text-[12px] uppercase tracking-wide text-neutral-500">
            Running Balance
          </div>
          <div className="mt-1 text-[18px] font-semibold text-black">
            {formatMoney(runningBalance)}
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search no / reference / date / amount"
          className="h-10 w-[280px] rounded-full border border-neutral-400 bg-white px-4 text-sm outline-none"
        />

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white"
        >
          + Add Payout
        </button>
      </div>

      <div className="overflow-hidden rounded-[18px] border border-neutral-400 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-400">
                <th className="px-4 py-4 text-left text-[12px] font-semibold uppercase tracking-wide text-neutral-700">
                  No.
                </th>
                <th className="px-4 py-4 text-left text-[12px] font-semibold uppercase tracking-wide text-neutral-700">
                  Payout Date
                </th>
                <th className="px-4 py-4 text-right text-[12px] font-semibold uppercase tracking-wide text-neutral-700">
                  Amount
                </th>
                <th className="px-4 py-4 text-left text-[12px] font-semibold uppercase tracking-wide text-neutral-700">
                  Reference
                </th>
                <th className="px-4 py-4 text-right text-[12px] font-semibold uppercase tracking-wide text-neutral-700">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-sm text-neutral-500"
                  >
                    Loading payouts...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-sm text-neutral-500"
                  >
                    No payouts found in the selected tax year.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-neutral-300 last:border-b-0"
                  >
                    <td className="px-4 py-4 text-[14px] font-semibold text-black">
                      {row.id}
                    </td>

                    <td className="px-4 py-4 text-[14px] text-black">
                      {formatDate(row.payout_date)}
                    </td>

                    <td className="px-4 py-4 text-right text-[14px] font-semibold text-black">
                      {formatMoney(Number(row.amount))}
                    </td>

                    <td className="px-4 py-4 text-[14px] text-black">
                      {row.reference || "-"}
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleDelete(row.id)}
                          className="rounded-xl bg-black px-3 py-1.5 text-xs font-medium text-white"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>

            {!loading && filteredRows.length > 0 && (
              <tfoot>
                <tr className="border-t border-neutral-400">
                  <td
                    className="px-4 py-4 text-[13px] font-semibold text-black"
                    colSpan={2}
                  >
                    Filtered Total
                  </td>
                  <td className="px-4 py-4 text-right text-[14px] font-semibold text-black">
                    {formatMoney(filteredPayoutsTotal)}
                  </td>
                  <td className="px-4 py-4" />
                  <td className="px-4 py-4" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-[18px] border border-neutral-300 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[18px] font-semibold text-black">
                Add Payout
              </h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-full border border-neutral-400 px-3 py-1 text-sm text-black"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleAddPayout} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-black">
                  Payout Date
                </label>
                <input
                  type="date"
                  value={form.payout_date}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      payout_date: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-neutral-400 bg-white px-3 py-2 text-sm outline-none"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-black">
                  Amount
                </label>
                <input
                  ref={amountInputRef}
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      amount: e.target.value,
                    }))
                  }
                  placeholder="0.00"
                  className="w-full rounded-xl border border-neutral-400 bg-white px-3 py-2 text-sm outline-none"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-black">
                  Reference
                </label>
                <input
                  type="text"
                  value={form.reference}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      reference: e.target.value,
                    }))
                  }
                  placeholder="Amazon settlement"
                  className="w-full rounded-xl border border-neutral-400 bg-white px-3 py-2 text-sm outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-neutral-400 px-4 py-2 text-sm text-black"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Payout"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
