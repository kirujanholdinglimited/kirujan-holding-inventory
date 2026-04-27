"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

type FinanceMode = "in" | "out";
type HistoryFilter = "all" | "month" | "taxyear";

type FinanceTransaction = {
  id: number;
  transaction_date: string;
  tax_year: string | null;
  transaction_type: string;
  amount: number;
  description: string | null;
  reference: string | null;
  paid_from: string | null;
  paid_to: string | null;
  apply_to_director_loan: boolean | null;
  notes: string | null;
  created_at: string;
  runningDirectorLoan?: number;
  runningBankLoan?: number;
};

type FormState = {
  transaction_date: string;
  transaction_type: string;
  amount: string;
  description: string;
  reference: string;
  notes: string;
};

function cardClass() {
  return "rounded-2xl border border-neutral-200 bg-white shadow-sm";
}

function inputClass() {
  return "mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-500";
}

function selectClass() {
  return "mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-500";
}

function buttonClass(primary = false) {
  return primary
    ? "inline-flex items-center justify-center rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
    : "inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60";
}

function toggleButtonClass(active: boolean) {
  return [
    "inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-medium transition",
    active
      ? "border-neutral-900 bg-neutral-900 text-white"
      : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50",
  ].join(" ");
}

function modalBackdrop() {
  return "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4";
}

function money(n: number) {
  return `£${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function getTodayIso() {
  return new Date().toISOString().slice(0, 10);
}

function getUkTaxYearLabelFromDate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  const year = d.getUTCFullYear();
  const apr6 = new Date(Date.UTC(year, 3, 6));
  return d >= apr6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function currentTaxYearLabel() {
  return getUkTaxYearLabelFromDate(getTodayIso());
}

function isValidTaxYearLabel(v: string | null | undefined) {
  return /^\d{4}-\d{4}$/.test(String(v ?? ""));
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

function startOfCurrentMonthIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

function humanTransactionType(value: string) {
  switch (value) {
    case "loan_introduced":
      return "Director Loan In";
    case "bank_loan_in":
      return "Bank Loan Received";
    case "loan_repayment":
      return "Pay Me Back";
    case "dividend":
      return "Dividend";
    case "salary":
      return "Salary";
    case "bank_loan_repayment":
      return "Bank Loan Repayment";
    case "bank_loan_interest":
      return "Loan Interest";
    case "personal_withdrawal":
      return "Personal Withdrawal";
    case "tax_payment":
      return "Tax Payment";
    default:
      return value;
  }
}

function getDirectorLoanEffect(tx: FinanceTransaction) {
  const amount = toNumber(tx.amount);

  switch (tx.transaction_type) {
    case "loan_introduced":
      return amount;
    case "loan_repayment":
      return -amount;
    case "personal_withdrawal":
      return -amount;
    case "dividend":
      return tx.apply_to_director_loan ? -amount : 0;
    case "salary":
      return tx.apply_to_director_loan ? -amount : 0;
    default:
      return 0;
  }
}

function getBankLoanEffect(tx: FinanceTransaction) {
  const amount = toNumber(tx.amount);

  switch (tx.transaction_type) {
    case "bank_loan_in":
      return amount;
    case "bank_loan_repayment":
      return -amount;
    default:
      return 0;
  }
}

function getModeForType(type: string): FinanceMode {
  if (type === "loan_introduced" || type === "bank_loan_in") return "in";
  return "out";
}

function defaultTypeForMode(mode: FinanceMode) {
  return mode === "in" ? "loan_introduced" : "loan_repayment";
}

const EMPTY_FORM: FormState = {
  transaction_date: getTodayIso(),
  transaction_type: "loan_introduced",
  amount: "",
  description: "",
  reference: "",
  notes: "",
};

export default function FinancePage() {
  const currentFyLabel = currentTaxYearLabel();
  const [selectedFyLabel, setSelectedFyLabel] = useState<string>(
    readStoredTaxYear() ?? currentFyLabel
  );

  const [mode, setMode] = useState<FinanceMode>("in");
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorText, setErrorText] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    loadTransactions();
  }, []);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      transaction_type: defaultTypeForMode(mode),
    }));
  }, [mode]);

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

  async function loadTransactions() {
    setLoading(true);
    setErrorText("");

    const { data, error } = await supabase
      .from("director_transactions")
      .select("*")
      .order("transaction_date", { ascending: false })
      .order("id", { ascending: false });

    if (error) {
      setTransactions([]);
      setErrorText(`Failed to load entries: ${error.message}`);
      setLoading(false);
      return;
    }

    setTransactions((data as FinanceTransaction[]) ?? []);
    setLoading(false);
  }

  const summary = useMemo(() => {
    const orderedAsc = [...transactions].sort((a, b) => {
      if (a.transaction_date === b.transaction_date) return a.id - b.id;
      return a.transaction_date < b.transaction_date ? -1 : 1;
    });

    let runningDirectorLoan = 0;
    let runningBankLoan = 0;
    let dividends = 0;
    let salary = 0;

    const withRunning = orderedAsc.map((tx) => {
      if (tx.transaction_type === "dividend") dividends += toNumber(tx.amount);
      if (tx.transaction_type === "salary") salary += toNumber(tx.amount);

      runningDirectorLoan += getDirectorLoanEffect(tx);
      runningBankLoan += getBankLoanEffect(tx);

      return {
        ...tx,
        runningDirectorLoan,
        runningBankLoan,
      };
    });

    return {
      directorLoanBalance: runningDirectorLoan,
      bankLoanBalance: runningBankLoan,
      dividends,
      salary,
      historyDesc: [...withRunning].reverse(),
    };
  }, [transactions]);

  const fyLabel = isValidTaxYearLabel(selectedFyLabel)
    ? selectedFyLabel
    : currentFyLabel;

  const modeFilteredHistory = useMemo(() => {
    return summary.historyDesc.filter((tx) => getModeForType(tx.transaction_type) === mode);
  }, [summary.historyDesc, mode]);

  const filteredHistory = useMemo(() => {
    const todayMonthStart = startOfCurrentMonthIso();

    const taxYearFiltered = modeFilteredHistory.filter(
      (tx) => getUkTaxYearLabelFromDate(tx.transaction_date) === fyLabel
    );

    if (historyFilter === "month") {
      return taxYearFiltered.filter((tx) => tx.transaction_date >= todayMonthStart);
    }

    return taxYearFiltered;
  }, [modeFilteredHistory, historyFilter, fyLabel]);

  const currentSectionTotals = useMemo(() => {
    let total = 0;
    let directorIn = 0;
    let bankIn = 0;
    let payMeBack = 0;
    let dividends = 0;
    let salary = 0;
    let bankRepay = 0;
    let bankInterest = 0;
    let withdrawals = 0;

    for (const tx of filteredHistory) {
      const amt = toNumber(tx.amount);
      total += amt;

      if (tx.transaction_type === "loan_introduced") directorIn += amt;
      if (tx.transaction_type === "bank_loan_in") bankIn += amt;
      if (tx.transaction_type === "loan_repayment") payMeBack += amt;
      if (tx.transaction_type === "dividend") dividends += amt;
      if (tx.transaction_type === "salary") salary += amt;
      if (tx.transaction_type === "bank_loan_repayment") bankRepay += amt;
      if (tx.transaction_type === "bank_loan_interest") bankInterest += amt;
      if (tx.transaction_type === "personal_withdrawal") withdrawals += amt;
    }

    return {
      total,
      directorIn,
      bankIn,
      payMeBack,
      dividends,
      salary,
      bankRepay,
      bankInterest,
      withdrawals,
    };
  }, [filteredHistory]);

  const selectedFyTotals = useMemo(() => {
    return transactions
      .filter((tx) => getUkTaxYearLabelFromDate(tx.transaction_date) === fyLabel)
      .reduce(
        (acc, tx) => {
          const amt = toNumber(tx.amount);
          if (getModeForType(tx.transaction_type) === "in") {
            acc.moneyIn += amt;
          } else {
            acc.moneyOut += amt;
          }
          if (tx.transaction_type === "bank_loan_interest") {
            acc.loanInterest += amt;
          }
          return acc;
        },
        { moneyIn: 0, moneyOut: 0, loanInterest: 0 }
      );
  }, [transactions, fyLabel]);

  const selectedFyNetCashMovement = selectedFyTotals.moneyIn - selectedFyTotals.moneyOut;

  async function saveTransaction(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    setErrorText("");

    const amountNumber = Number(form.amount);

    if (!form.transaction_date) {
      setErrorText("Please enter a date.");
      setSaving(false);
      return;
    }

    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setErrorText("Please enter a valid amount greater than 0.");
      setSaving(false);
      return;
    }

    const payload = {
      transaction_date: form.transaction_date,
      tax_year: getUkTaxYearLabelFromDate(form.transaction_date),
      transaction_type: form.transaction_type,
      amount: amountNumber,
      description: form.description.trim() || null,
      reference: form.reference.trim() || null,
      paid_from: null,
      paid_to: null,
      apply_to_director_loan: false,
      notes: form.notes.trim() || null,
    };

    const { error } = await supabase.from("director_transactions").insert([payload]);

    if (error) {
      setErrorText(`Save failed: ${error.message}`);
      setSaving(false);
      return;
    }

    setMessage("Entry saved.");
    setForm({
      transaction_date: getTodayIso(),
      transaction_type: defaultTypeForMode(mode),
      amount: "",
      description: "",
      reference: "",
      notes: "",
    });
    setSaving(false);
    await loadTransactions();
  }

  async function updateTransaction(e: React.FormEvent) {
    e.preventDefault();
    if (editingId === null) return;

    setEditSaving(true);
    setMessage("");
    setErrorText("");

    const amountNumber = Number(editForm.amount);

    if (!editForm.transaction_date) {
      setErrorText("Please enter a date.");
      setEditSaving(false);
      return;
    }

    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setErrorText("Please enter a valid amount greater than 0.");
      setEditSaving(false);
      return;
    }

    const payload = {
      transaction_date: editForm.transaction_date,
      tax_year: getUkTaxYearLabelFromDate(editForm.transaction_date),
      transaction_type: editForm.transaction_type,
      amount: amountNumber,
      description: editForm.description.trim() || null,
      reference: editForm.reference.trim() || null,
      paid_from: null,
      paid_to: null,
      apply_to_director_loan: false,
      notes: editForm.notes.trim() || null,
    };

    const { data, error } = await supabase
      .from("director_transactions")
      .update(payload)
      .eq("id", editingId)
      .select("id")
      .maybeSingle();

    if (error) {
      setErrorText(`Update failed: ${error.message}`);
      setEditSaving(false);
      return;
    }

    if (!data) {
      setErrorText(
        "Update failed: no row was updated. This is usually a Supabase RLS or permissions issue."
      );
      setEditSaving(false);
      return;
    }

    setEditOpen(false);
    setEditingId(null);
    setMessage("Entry updated.");
    setEditSaving(false);
    await loadTransactions();
  }

  async function deleteTransaction(id: number) {
    const confirmed = window.confirm("Delete this entry?");
    if (!confirmed) return;

    setMessage("");
    setErrorText("");

    const { error } = await supabase.from("director_transactions").delete().eq("id", id);

    if (error) {
      setErrorText(`Delete failed: ${error.message}`);
      return;
    }

    if (editingId === id) {
      setEditOpen(false);
      setEditingId(null);
    }

    setMessage("Entry deleted.");
    await loadTransactions();
  }

  function startEdit(tx: FinanceTransaction) {
    setMessage("");
    setErrorText("");
    setEditingId(tx.id);
    setEditForm({
      transaction_date: tx.transaction_date,
      transaction_type: tx.transaction_type,
      amount: String(tx.amount ?? ""),
      description: tx.description ?? "",
      reference: tx.reference ?? "",
      notes: tx.notes ?? "",
    });
    setEditOpen(true);
  }

  function closeEditModal() {
    if (editSaving) return;
    setEditOpen(false);
    setEditingId(null);
    setEditForm(EMPTY_FORM);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className={cardClass()}>
        <div className="p-5">
          <div className="text-2xl font-semibold tracking-tight text-neutral-900">
            Finance
          </div>
          <div className="mt-2 text-sm text-neutral-600">
            One simple place to record money coming in and money going out.
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            Hard-wired to the selected tax year using transaction date ({fyLabel})
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              className={toggleButtonClass(mode === "in")}
              onClick={() => {
                setMode("in");
                setForm((prev) => ({ ...prev, transaction_type: "loan_introduced" }));
              }}
            >
              Money In
            </button>
            <button
              type="button"
              className={toggleButtonClass(mode === "out")}
              onClick={() => {
                setMode("out");
                setForm((prev) => ({ ...prev, transaction_type: "loan_repayment" }));
              }}
            >
              Money Out
            </button>
          </div>
        </div>
      </div>

      {errorText ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorText}
        </div>
      ) : null}

      {message ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] xl:items-start">
        <div className="w-full xl:order-1">
          <div className={cardClass()}>
            <form onSubmit={saveTransaction} className="p-5">
              <div className="text-base font-semibold text-neutral-900">
                {mode === "in" ? "Add Money In" : "Add Money Out"}
              </div>
              <div className="mt-1 text-sm text-neutral-600">
                {mode === "in"
                  ? "Record money coming into the business."
                  : "Record money going out of the business."}
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="text-sm font-medium text-neutral-700">Date</label>
                  <input
                    type="date"
                    required
                    value={form.transaction_date}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, transaction_date: e.target.value }))
                    }
                    className={inputClass()}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-neutral-700">Type</label>
                  <select
                    value={form.transaction_type}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, transaction_type: e.target.value }))
                    }
                    className={selectClass()}
                  >
                    {mode === "in" ? (
                      <>
                        <option value="loan_introduced">Director Loan In</option>
                        <option value="bank_loan_in">Bank Loan Received</option>
                      </>
                    ) : (
                      <>
                        <option value="loan_repayment">Pay Me Back</option>
                        <option value="dividend">Dividend</option>
                        <option value="salary">Salary</option>
                        <option value="bank_loan_repayment">Bank Loan Repayment</option>
                        <option value="bank_loan_interest">Loan Interest</option>
                        <option value="personal_withdrawal">Personal Withdrawal</option>
                        <option value="tax_payment">Tax Payment</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-neutral-700">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={form.amount}
                    onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                    className={inputClass()}
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-neutral-700">Description</label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, description: e.target.value }))
                    }
                    className={inputClass()}
                    placeholder={
                      mode === "in"
                        ? "Example: I transferred money in"
                        : "Example: Paid myself back"
                    }
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-neutral-700">
                    Account / Source
                  </label>
                  <input
                    type="text"
                    value={form.reference}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, reference: e.target.value }))
                    }
                    className={inputClass()}
                    placeholder={
                      mode === "in"
                        ? "Example: Personal account / Barclays loan"
                        : "Example: Company bank / Barclays loan"
                    }
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-neutral-700">Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                    className={`${inputClass()} min-h-[96px] resize-y`}
                    placeholder="Optional notes"
                  />
                </div>

                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
                  {helperTextForType(form.transaction_type)}
                </div>

                <div className="flex flex-wrap gap-3">
                  <button type="submit" disabled={saving} className={buttonClass(true)}>
                    {saving ? "Saving..." : "Save Entry"}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    className={buttonClass(false)}
                    onClick={() =>
                      setForm({
                        transaction_date: getTodayIso(),
                        transaction_type: defaultTypeForMode(mode),
                        amount: "",
                        description: "",
                        reference: "",
                        notes: "",
                      })
                    }
                  >
                    Reset
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:order-2 xl:self-start">
          <SummaryCard
            label="Selected Money In"
            value={money(selectedFyTotals.moneyIn)}
            sub={fyLabel}
          />
          <SummaryCard
            label="Selected Money Out"
            value={money(selectedFyTotals.moneyOut)}
            sub={fyLabel}
          />
          <SummaryCard
            label="Net Cash Movement"
            value={money(selectedFyNetCashMovement)}
            sub="Money in minus money out"
          />
          <SummaryCard
            label="Loan Interest"
            value={money(selectedFyTotals.loanInterest)}
            sub="Feeds Business Running Expenses"
          />
          <SummaryCard
            label="Director Loan Balance"
            value={money(summary.directorLoanBalance)}
            sub="Money between you and company"
          />
          <SummaryCard
            label="Bank Loan Balance"
            value={money(summary.bankLoanBalance)}
            sub="Borrowing from lenders"
          />
          <SummaryCard
            label="Dividends"
            value={money(summary.dividends)}
            sub="Total dividends recorded"
          />
          <SummaryCard
            label="Salary"
            value={money(summary.salary)}
            sub="Total salary recorded"
          />

          {mode === "in" ? (
            <>
              <SummaryCard
                label="Filtered Money In"
                value={money(currentSectionTotals.total)}
                sub={historyFilterLabel(historyFilter)}
              />
              <SummaryCard
                label="I Added Money"
                value={money(currentSectionTotals.directorIn)}
                sub="Director funding"
              />
              <SummaryCard
                label="Bank Loan Received"
                value={money(currentSectionTotals.bankIn)}
                sub="Borrowed from lender"
              />
              <SummaryCard
                label="Entries"
                value={String(filteredHistory.length)}
                sub="Visible entries"
              />
            </>
          ) : (
            <>
              <SummaryCard
                label="Filtered Money Out"
                value={money(currentSectionTotals.total)}
                sub={historyFilterLabel(historyFilter)}
              />
              <SummaryCard
                label="Pay Me Back"
                value={money(currentSectionTotals.payMeBack)}
                sub="Director repayments"
              />
              <SummaryCard
                label="Dividends + Salary"
                value={money(currentSectionTotals.dividends + currentSectionTotals.salary)}
                sub={`${money(currentSectionTotals.dividends)} dividends + ${money(currentSectionTotals.salary)} salary`}
              />
              <SummaryCard
                label="Loan Costs"
                value={money(currentSectionTotals.bankRepay + currentSectionTotals.bankInterest)}
                sub={`${money(currentSectionTotals.bankRepay)} repayment + ${money(currentSectionTotals.bankInterest)} interest`}
              />
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="w-full">
          <div className={cardClass()}>
            <div className="border-b border-neutral-200 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-base font-semibold text-neutral-900">
                    {mode === "in" ? "Money In History" : "Money Out History"}
                  </div>
                  <div className="mt-1 text-sm text-neutral-600">
                    Only entries for the selected toggle are shown.
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    Selected tax year: {fyLabel}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={toggleButtonClass(historyFilter === "all")}
                    onClick={() => setHistoryFilter("all")}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className={toggleButtonClass(historyFilter === "month")}
                    onClick={() => setHistoryFilter("month")}
                  >
                    This Month
                  </button>
                  <button
                    type="button"
                    className={toggleButtonClass(historyFilter === "taxyear")}
                    onClick={() => setHistoryFilter("taxyear")}
                  >
                    Selected Tax Year
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="whitespace-nowrap border-b border-neutral-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Date
                    </th>
                    <th className="whitespace-nowrap border-b border-neutral-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Type
                    </th>
                    <th className="whitespace-nowrap border-b border-neutral-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Description
                    </th>
                    <th className="whitespace-nowrap border-b border-neutral-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Account / Source
                    </th>
                    <th className="whitespace-nowrap border-b border-neutral-200 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Amount
                    </th>
                    <th className="whitespace-nowrap border-b border-neutral-200 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Director Loan
                    </th>
                    <th className="whitespace-nowrap border-b border-neutral-200 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Bank Loan
                    </th>
                    <th className="whitespace-nowrap border-b border-neutral-200 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-10 text-center text-sm text-neutral-500"
                      >
                        Loading entries...
                      </td>
                    </tr>
                  ) : filteredHistory.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-10 text-center text-sm text-neutral-500"
                      >
                        No entries found for the selected tax year.
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map((tx) => (
                      <tr key={tx.id} className="hover:bg-neutral-50">
                        <td className="border-b border-neutral-100 px-4 py-3 text-sm text-neutral-700">
                          <div>{tx.transaction_date}</div>
                          <div className="mt-1 inline-flex rounded-full border border-neutral-200 bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600">
                            {tx.tax_year || "No tax year"}
                          </div>
                        </td>
                        <td className="border-b border-neutral-100 px-4 py-3 text-sm text-neutral-700">
                          {humanTransactionType(tx.transaction_type)}
                        </td>
                        <td className="border-b border-neutral-100 px-4 py-3 text-sm text-neutral-700">
                          <div>{tx.description || "—"}</div>
                          {tx.notes ? (
                            <div className="mt-1 text-xs text-neutral-500">{tx.notes}</div>
                          ) : null}
                        </td>
                        <td className="border-b border-neutral-100 px-4 py-3 text-sm text-neutral-700">
                          {tx.reference || "—"}
                        </td>
                        <td className="border-b border-neutral-100 px-4 py-3 text-right text-sm text-neutral-700">
                          {money(toNumber(tx.amount))}
                        </td>
                        <td className="border-b border-neutral-100 px-4 py-3 text-right text-sm font-medium text-neutral-900">
                          {money(tx.runningDirectorLoan ?? 0)}
                        </td>
                        <td className="border-b border-neutral-100 px-4 py-3 text-right text-sm font-medium text-neutral-900">
                          {money(tx.runningBankLoan ?? 0)}
                        </td>
                        <td className="border-b border-neutral-100 px-4 py-3 text-right text-sm">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                              onClick={() => startEdit(tx)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                              onClick={() => deleteTransaction(tx.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {editOpen ? (
        <div className={modalBackdrop()} onMouseDown={closeEditModal}>
          <div
            className="w-full max-w-2xl rounded-2xl border border-neutral-200 bg-white shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <form onSubmit={updateTransaction}>
              <div className="flex items-start justify-between border-b border-neutral-200 p-5">
                <div>
                  <div className="text-lg font-semibold text-neutral-900">Edit Entry</div>
                  <div className="mt-1 text-sm text-neutral-600">
                    Update this finance row without changing the add form above.
                  </div>
                </div>
                <button
                  type="button"
                  className={buttonClass(false)}
                  onClick={closeEditModal}
                  disabled={editSaving}
                >
                  Close
                </button>
              </div>

              <div className="space-y-4 p-5">
                <div>
                  <label className="text-sm font-medium text-neutral-700">Date</label>
                  <input
                    type="date"
                    required
                    value={editForm.transaction_date}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, transaction_date: e.target.value }))
                    }
                    className={inputClass()}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-neutral-700">Type</label>
                  <select
                    value={editForm.transaction_type}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, transaction_type: e.target.value }))
                    }
                    className={selectClass()}
                  >
                    <option value="loan_introduced">Director Loan In</option>
                    <option value="bank_loan_in">Bank Loan Received</option>
                    <option value="loan_repayment">Pay Me Back</option>
                    <option value="dividend">Dividend</option>
                    <option value="salary">Salary</option>
                    <option value="bank_loan_repayment">Bank Loan Repayment</option>
                    <option value="bank_loan_interest">Loan Interest</option>
                    <option value="personal_withdrawal">Personal Withdrawal</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-neutral-700">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editForm.amount}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, amount: e.target.value }))
                    }
                    className={inputClass()}
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-neutral-700">Description</label>
                  <input
                    type="text"
                    value={editForm.description}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, description: e.target.value }))
                    }
                    className={inputClass()}
                    placeholder="Description"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-neutral-700">
                    Account / Source
                  </label>
                  <input
                    type="text"
                    value={editForm.reference}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, reference: e.target.value }))
                    }
                    className={inputClass()}
                    placeholder="Account / Source"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-neutral-700">Notes</label>
                  <textarea
                    value={editForm.notes}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    className={`${inputClass()} min-h-[96px] resize-y`}
                    placeholder="Optional notes"
                  />
                </div>

                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
                  {helperTextForType(editForm.transaction_type)}
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-3 border-t border-neutral-200 p-5">
                <button
                  type="button"
                  className={buttonClass(false)}
                  onClick={closeEditModal}
                  disabled={editSaving}
                >
                  Cancel
                </button>
                <button type="submit" className={buttonClass(true)} disabled={editSaving}>
                  {editSaving ? "Updating..." : "Update Entry"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function helperTextForType(type: string) {
  switch (type) {
    case "loan_introduced":
      return "This increases your director loan balance because you are putting money into the business.";
    case "bank_loan_in":
      return "This increases your bank loan balance because the business is borrowing from a lender.";
    case "loan_repayment":
      return "This reduces your director loan balance because the company is paying you back.";
    case "dividend":
      return "This records money taken as dividend. It does not reduce the director loan unless you choose to handle that separately later.";
    case "salary":
      return "This records salary paid to you and is normally treated separately from the director loan.";
    case "bank_loan_repayment":
      return "This reduces the bank loan balance because principal is being paid back.";
    case "bank_loan_interest":
      return "This records interest paid on a bank loan. It does not reduce principal.";
    case "personal_withdrawal":
      return "This reduces the director loan balance or increases what you owe the company, depending on your position.";
    case "tax_payment":
      return "This records tax paid out by the business, such as corporation tax or other HMRC payments.";
    default:
      return "This entry will be saved to your finance history.";
  }
}

function historyFilterLabel(filter: HistoryFilter) {
  switch (filter) {
    case "all":
      return "Selected tax year";
    case "month":
      return "This month in selected tax year";
    case "taxyear":
      return "Selected tax year";
    default:
      return "All visible entries";
  }
}

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900">
        {value}
      </div>
      <div className="mt-1 text-sm text-neutral-600">{sub}</div>
    </div>
  );
}
  