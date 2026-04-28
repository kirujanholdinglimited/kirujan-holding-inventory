"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Expense = {
  id: number;
  expense_date: string;
  item: string;
  shop: string | null;
  amount: number;
  operational_category: string;
  accounting_category: string;
  tax_year: string;
  payment_method: string | null;
  is_allowable: boolean;
  is_capital: boolean;
  notes: string | null;
};

type SortKey =
  | "expense_date"
  | "item"
  | "shop"
  | "amount"
  | "operational_category"
  | "accounting_category"
  | "tax_year";

type TaxTreatment = "revenue_allowable" | "revenue_disallowable" | "capital";
type FundingSource = "company_funds" | "director_loan";

type SummaryModal =
  | {
      type: "accounting";
      title: string;
      rows: number;
      total: number;
      allowable: number;
      revenue: number;
      capital: number;
    }
  | {
      type: "taxyear";
      title: string;
      rows: number;
      total: number;
      allowable: number;
      revenue: number;
      capital: number;
    }
  | null;

const OPERATIONAL_CATEGORY_OPTIONS = [
  "Amazon Fees",
  "Bank Fees",
  "Equipment",
  "Fuel",
  "Meals",
  "Office",
  "Other",
  "Packaging",
  "Professional",
  "Subscriptions",
  "Supplies",
  "Travel",
] as const;

const PAYMENT_METHOD_OPTIONS = [
  "Business Bank",
  "Cash",
  "Card",
  "Credit Card",
  "Other",
] as const;

const DIRECTOR_LOAN_TAG = "[Funding Source: Director Loan]";

function formatCurrency(value: number) {
  return `£${Number(value || 0).toFixed(2)}`;
}

function formatDate(value: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB");
}

function toTitleCase(value: string) {
  return value.replace(/\b([a-z])/g, (char) => char.toUpperCase());
}

function getBadgeClasses(kind: "blue" | "green" | "amber" | "red" | "slate") {
  if (kind === "blue") return "border-blue-200 bg-blue-50 text-blue-700";
  if (kind === "green") return "border-green-200 bg-green-50 text-green-700";
  if (kind === "amber") return "border-amber-200 bg-amber-50 text-amber-700";
  if (kind === "red") return "border-red-200 bg-red-50 text-red-700";
  return "border-neutral-200 bg-neutral-50 text-neutral-700";
}

function getOperationalBadgeKind(category: string) {
  const value = category.trim().toLowerCase();

  if (value.includes("amazon")) return "blue";
  if (value.includes("fuel") || value.includes("travel") || value.includes("meals")) return "green";
  if (
    value.includes("packaging") ||
    value.includes("supplies") ||
    value.includes("office")
  ) {
    return "amber";
  }
  if (value.includes("equipment")) return "red";
  return "slate";
}

function getAccountingCategory(operationalCategory: string) {
  switch (operationalCategory) {
    case "Amazon Fees":
      return "Platform Fees";
    case "Packaging":
      return "Packaging & Postage";
    case "Fuel":
      return "Travel & Motor";
    case "Meals":
      return "Meals";
    case "Supplies":
      return "Supplies";
    case "Equipment":
      return "Equipment";
    case "Subscriptions":
      return "Software & Subscriptions";
    case "Travel":
      return "Travel";
    case "Office":
      return "Office Costs";
    case "Professional":
      return "Professional Fees";
    case "Bank Fees":
      return "Bank Charges";
    default:
      return "Other Expenses";
  }
}

function getUkTaxYear(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";

  const year = d.getFullYear();
  const taxYearStart = new Date(year, 3, 6);

  if (d >= taxYearStart) {
    return `${year}-${year + 1}`;
  }

  return `${year - 1}-${year}`;
}

function getTodayInputValue() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

function readStoredTaxYear() {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem("dashboard_selected_fy_v1");
    return isValidTaxYearLabel(stored) ? stored : null;
  } catch {
    return null;
  }
}

function rowTaxTreatment(row: Pick<Expense, "is_allowable" | "is_capital">): TaxTreatment {
  if (row.is_capital) return "capital";
  return row.is_allowable ? "revenue_allowable" : "revenue_disallowable";
}

function taxTreatmentLabel(value: TaxTreatment) {
  if (value === "revenue_allowable") return "Revenue Allowable";
  if (value === "revenue_disallowable") return "Revenue Disallowable";
  return "Capital Item";
}

function taxTreatmentToFlags(value: TaxTreatment) {
  if (value === "capital") {
    return { is_allowable: false, is_capital: true };
  }

  if (value === "revenue_allowable") {
    return { is_allowable: true, is_capital: false };
  }

  return { is_allowable: false, is_capital: false };
}

function getFundingSourceFromNotes(notes: string | null): FundingSource {
  return (notes ?? "").includes(DIRECTOR_LOAN_TAG) ? "director_loan" : "company_funds";
}

function stripFundingSourceTag(notes: string | null) {
  return (notes ?? "").replace(DIRECTOR_LOAN_TAG, "").trim();
}

function buildStoredNotes(notes: string, fundingSource: FundingSource) {
  const clean = notes.trim();

  if (fundingSource === "director_loan") {
    return clean ? `${DIRECTOR_LOAN_TAG}\n${clean}` : DIRECTOR_LOAN_TAG;
  }

  return clean || null;
}

function HelpTip({ text }: { text: string }) {
  return (
    <span className="group relative ml-1 inline-flex align-middle">
      <span className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-neutral-300 text-[10px] font-semibold text-neutral-500">
        ?
      </span>
      <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 rounded-xl border border-neutral-200 bg-white p-2 text-[11px] font-normal leading-5 text-neutral-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {text}
      </span>
    </span>
  );
}

function LabelWithHelp({
  label,
  help,
}: {
  label: string;
  help?: string;
}) {
  return (
    <div className="mb-1 flex items-center text-xs font-medium text-neutral-700">
      <span>{label}</span>
      {help ? <HelpTip text={help} /> : null}
    </div>
  );
}


function SuggestionTextInput({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const query = value.trim().toLowerCase();
  const suggestions = options
    .filter((option) => !query || option.toLowerCase().includes(query))
    .slice(0, 8);

  return (
    <div className="relative">
      <input
        value={value}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-400"
      />

      {open && suggestions.length > 0 ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg">
          {suggestions.map((option) => (
            <button
              key={option}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                onChange(option);
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-neutral-800 hover:bg-neutral-50"
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  help,
  open,
  onToggle,
  children,
}: {
  title: string;
  subtitle?: string;
  help?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-4 text-left"
      >
        <div>
          <div className="flex items-center text-sm font-semibold text-neutral-900">
            <span>{title}</span>
            {help ? <HelpTip text={help} /> : null}
          </div>
          {subtitle ? (
            <div className="mt-1 text-xs text-neutral-500">{subtitle}</div>
          ) : null}
        </div>

        <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] text-neutral-700">
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {open ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}

export default function ExpensesPage() {
  const currentFyLabel = getCurrentFyLabel();
  const [selectedFyLabel, setSelectedFyLabel] = useState<string>(
    readStoredTaxYear() ?? currentFyLabel
  );

  const [rows, setRows] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [operationalFilter, setOperationalFilter] = useState("all");
  const [accountingFilter, setAccountingFilter] = useState("all");
  const [allowableFilter, setAllowableFilter] = useState("all");
  const [capitalFilter, setCapitalFilter] = useState("all");

  const [sortKey, setSortKey] = useState<SortKey>("expense_date");
  const [sortAsc, setSortAsc] = useState(false);

  const [accountingSummaryOpen, setAccountingSummaryOpen] = useState(true);
  const [taxYearSummaryOpen, setTaxYearSummaryOpen] = useState(true);
  const [expenseRowsOpen, setExpenseRowsOpen] = useState(true);
  const [notesOpen, setNotesOpen] = useState(false);
  const [taxGuideOpen, setTaxGuideOpen] = useState(false);

  const [summaryModal, setSummaryModal] = useState<SummaryModal>(null);
  const [showMileageModal, setShowMileageModal] = useState(false);

  const milesInputRef = useRef<HTMLInputElement | null>(null);

  const [mileageForm, setMileageForm] = useState({
    mileage_date: getTodayInputValue(),
    miles: "",
    rate: "0.45",
    journey: "",
    notes: "",
  });

  const [form, setForm] = useState({
    expense_date: getTodayInputValue(),
    item: "",
    shop: "",
    amount: "",
    operational_category: "Amazon Fees",
    payment_method: "Business Bank",
    funding_source: "company_funds" as FundingSource,
    tax_treatment: "revenue_allowable" as TaxTreatment,
    notes: "",
  });

  const [editingExpense, setEditingExpense] = useState<
    | (Expense & {
        funding_source: FundingSource;
        tax_treatment: TaxTreatment;
        clean_notes: string;
        notes_open: boolean;
        guide_open: boolean;
      })
    | null
  >(null);

  async function loadExpenses() {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("expenses")
      .select(
        `
          id,
          expense_date,
          item,
          shop,
          amount,
          operational_category,
          accounting_category,
          tax_year,
          payment_method,
          is_allowable,
          is_capital,
          notes
        `
      )
      .order("expense_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(1000);

    if (error) {
      setError(error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as Expense[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadExpenses();
  }, []);

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
    if (!showMileageModal) return;

    const focusTimer = window.setTimeout(() => {
      milesInputRef.current?.focus();
      milesInputRef.current?.select();
    }, 0);

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowMileageModal(false);
      }
    };

    window.addEventListener("keydown", handleEsc);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleEsc);
    };
  }, [showMileageModal]);

  const operationalCategories = useMemo(() => {
    return Array.from(
      new Set(rows.map((r) => r.operational_category).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const accountingCategories = useMemo(() => {
    return Array.from(
      new Set(rows.map((r) => r.accounting_category).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const existingItems = useMemo(() => {
    return Array.from(new Set(rows.map((r) => r.item.trim()).filter(Boolean))).sort(
      (a, b) => a.localeCompare(b)
    );
  }, [rows]);

  const existingShops = useMemo(() => {
    return Array.from(
      new Set(
        rows
          .map((r) => (r.shop ?? "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const fyLabel = isValidTaxYearLabel(selectedFyLabel)
    ? selectedFyLabel
    : currentFyLabel;

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    const filtered = rows.filter((r) => {
      const expenseTaxYear = getUkTaxYear(r.expense_date);
      const matchesSearch =
        !q ||
        r.item.toLowerCase().includes(q) ||
        (r.shop ?? "").toLowerCase().includes(q) ||
        r.operational_category.toLowerCase().includes(q) ||
        r.accounting_category.toLowerCase().includes(q) ||
        (r.payment_method ?? "").toLowerCase().includes(q) ||
        stripFundingSourceTag(r.notes).toLowerCase().includes(q) ||
        r.tax_year.toLowerCase().includes(q);

      const matchesTaxYear = expenseTaxYear === fyLabel;

      const matchesOperational =
        operationalFilter === "all" ||
        r.operational_category === operationalFilter;

      const matchesAccounting =
        accountingFilter === "all" ||
        r.accounting_category === accountingFilter;

      const matchesAllowable =
        allowableFilter === "all" ||
        (allowableFilter === "allowable" && r.is_allowable) ||
        (allowableFilter === "not_allowable" && !r.is_allowable);

      const matchesCapital =
        capitalFilter === "all" ||
        (capitalFilter === "capital" && r.is_capital) ||
        (capitalFilter === "revenue" && !r.is_capital);

      return (
        matchesSearch &&
        matchesTaxYear &&
        matchesOperational &&
        matchesAccounting &&
        matchesAllowable &&
        matchesCapital
      );
    });

    const sorted = [...filtered].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";

      if (sortKey === "amount") {
        av = Number(a.amount || 0);
        bv = Number(b.amount || 0);
      } else if (sortKey === "expense_date") {
        av = new Date(a.expense_date).getTime();
        bv = new Date(b.expense_date).getTime();
      } else if (sortKey === "item") {
        av = a.item;
        bv = b.item;
      } else if (sortKey === "shop") {
        av = a.shop ?? "";
        bv = b.shop ?? "";
      } else if (sortKey === "operational_category") {
        av = a.operational_category;
        bv = b.operational_category;
      } else if (sortKey === "accounting_category") {
        av = a.accounting_category;
        bv = b.accounting_category;
      } else if (sortKey === "tax_year") {
        av = a.tax_year;
        bv = b.tax_year;
      }

      if (typeof av === "number" && typeof bv === "number") {
        return sortAsc ? av - bv : bv - av;
      }

      const result = String(av).localeCompare(String(bv), undefined, {
        numeric: true,
        sensitivity: "base",
      });

      return sortAsc ? result : -result;
    });

    return sorted;
  }, [
    rows,
    search,
    operationalFilter,
    accountingFilter,
    allowableFilter,
    capitalFilter,
    sortKey,
    sortAsc,
    fyLabel,
  ]);

  const summary = useMemo(() => {
    const total = filteredRows.reduce((sum, r) => sum + Number(r.amount || 0), 0);

    const allowableTotal = filteredRows
      .filter((r) => r.is_allowable)
      .reduce((sum, r) => sum + Number(r.amount || 0), 0);

    const capitalTotal = filteredRows
      .filter((r) => r.is_capital)
      .reduce((sum, r) => sum + Number(r.amount || 0), 0);

    const revenueTotal = filteredRows
      .filter((r) => !r.is_capital)
      .reduce((sum, r) => sum + Number(r.amount || 0), 0);

    return {
      count: filteredRows.length,
      total,
      allowableTotal,
      capitalTotal,
      revenueTotal,
    };
  }, [filteredRows]);

  const accountingCategorySummary = useMemo(() => {
    const grouped = new Map<
      string,
      {
        total: number;
        allowable: number;
        capital: number;
        revenue: number;
        count: number;
      }
    >();

    for (const row of filteredRows) {
      const key = row.accounting_category || "Uncategorised";
      const existing = grouped.get(key) ?? {
        total: 0,
        allowable: 0,
        capital: 0,
        revenue: 0,
        count: 0,
      };

      const amount = Number(row.amount || 0);

      existing.total += amount;
      existing.count += 1;

      if (row.is_allowable) {
        existing.allowable += amount;
      }

      if (row.is_capital) {
        existing.capital += amount;
      } else {
        existing.revenue += amount;
      }

      grouped.set(key, existing);
    }

    return Array.from(grouped.entries())
      .map(([category, values]) => ({
        category,
        ...values,
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredRows]);

  const taxYearSummary = useMemo(() => {
    const grouped = new Map<
      string,
      {
        total: number;
        allowable: number;
        capital: number;
        revenue: number;
        count: number;
      }
    >();

    for (const row of filteredRows) {
      const key = row.tax_year || "Unknown";
      const existing = grouped.get(key) ?? {
        total: 0,
        allowable: 0,
        capital: 0,
        revenue: 0,
        count: 0,
      };

      const amount = Number(row.amount || 0);

      existing.total += amount;
      existing.count += 1;

      if (row.is_allowable) {
        existing.allowable += amount;
      }

      if (row.is_capital) {
        existing.capital += amount;
      } else {
        existing.revenue += amount;
      }

      grouped.set(key, existing);
    }

    return Array.from(grouped.entries())
      .map(([taxYear, values]) => ({
        taxYear,
        ...values,
      }))
      .sort((a, b) => b.taxYear.localeCompare(a.taxYear));
  }, [rows]);

  const mileageAmount = useMemo(() => {
    const miles = Number(mileageForm.miles || 0);
    const rate = Number(mileageForm.rate || 0);
    if (!Number.isFinite(miles) || !Number.isFinite(rate)) return 0;
    return miles * rate;
  }, [mileageForm.miles, mileageForm.rate]);

  function useMileageInAddExpense() {
    if (!mileageForm.mileage_date) {
      setSaveError("Please enter a mileage date.");
      return;
    }

    if (!mileageForm.miles || Number(mileageForm.miles) <= 0) {
      setSaveError("Please enter valid miles.");
      return;
    }

    const journey = toTitleCase(mileageForm.journey.trim());
    const notes = [
      journey ? `Journey: ${journey}` : "",
      mileageForm.notes.trim() ? `Details: ${toTitleCase(mileageForm.notes.trim())}` : "",
      `Miles: ${mileageForm.miles}`,
      `Rate: £${Number(mileageForm.rate || 0).toFixed(2)} Per Mile`,
    ]
      .filter(Boolean)
      .join("\n");

    setForm((prev) => ({
      ...prev,
      expense_date: mileageForm.mileage_date,
      item: "Mileage Claim",
      shop: "",
      amount: mileageAmount.toFixed(2),
      operational_category: "Travel",
      payment_method: "Other",
      funding_source: "company_funds",
      tax_treatment: "revenue_allowable",
      notes,
    }));

    setShowMileageModal(false);
    setSaveError(null);
    setSaveSuccess("Mileage claim loaded into Add Expense.");
  }

  async function handleAddExpense(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(null);

    const item = form.item.trim();
    const shop = form.shop.trim();
    const amount = Number(form.amount);
    const taxYear = getUkTaxYear(form.expense_date);
    const accountingCategory = getAccountingCategory(form.operational_category);
    const flags = taxTreatmentToFlags(form.tax_treatment);

    if (!form.expense_date) {
      setSaveError("Please select a date.");
      return;
    }

    if (!item) {
      setSaveError("Please enter an item.");
      return;
    }

    if (!form.amount || Number.isNaN(amount) || amount < 0) {
      setSaveError("Please enter a valid amount.");
      return;
    }

    if (!taxYear) {
      setSaveError("Could not calculate tax year.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("expenses").insert({
      expense_date: form.expense_date,
      item,
      shop: shop || null,
      amount,
      operational_category: form.operational_category,
      accounting_category: accountingCategory,
      tax_year: taxYear,
      payment_method: form.payment_method || null,
      is_allowable: flags.is_allowable,
      is_capital: flags.is_capital,
      notes: buildStoredNotes(form.notes, form.funding_source),
    });

    setSaving(false);

    if (error) {
      setSaveError(error.message);
      return;
    }

    setSaveSuccess("Expense added.");
    setForm({
      expense_date: getTodayInputValue(),
      item: "",
      shop: "",
      amount: "",
      operational_category: "Amazon Fees",
      payment_method: "Business Bank",
      funding_source: "company_funds",
      tax_treatment: "revenue_allowable",
      notes: "",
    });

    await loadExpenses();
  }

  async function handleDeleteExpense(id: number) {
    const ok = window.confirm("Delete this expense?");
    if (!ok) return;

    setSaveError(null);
    setSaveSuccess(null);
    setDeletingId(id);

    const { error } = await supabase.from("expenses").delete().eq("id", id);

    setDeletingId(null);

    if (error) {
      setSaveError(error.message);
      return;
    }

    setSaveSuccess("Expense deleted.");
    await loadExpenses();
  }

  function openEditModal(expense: Expense) {
    setEditingExpense({
      ...expense,
      funding_source: getFundingSourceFromNotes(expense.notes),
      tax_treatment: rowTaxTreatment(expense),
      clean_notes: stripFundingSourceTag(expense.notes),
      notes_open: false,
      guide_open: false,
    });
    setSaveError(null);
    setSaveSuccess(null);
  }

  function closeEditModal() {
    if (updatingId !== null) return;
    setEditingExpense(null);
  }

  async function handleUpdateExpense() {
    if (!editingExpense) return;

    setSaveError(null);
    setSaveSuccess(null);

    const item = editingExpense.item.trim();
    const shop = (editingExpense.shop ?? "").trim();
    const amount = Number(editingExpense.amount);
    const taxYear = getUkTaxYear(editingExpense.expense_date);
    const accountingCategory = getAccountingCategory(
      editingExpense.operational_category
    );
    const flags = taxTreatmentToFlags(editingExpense.tax_treatment);

    if (!editingExpense.expense_date) {
      setSaveError("Please select a date.");
      return;
    }

    if (!item) {
      setSaveError("Please enter an item.");
      return;
    }

    if (Number.isNaN(amount) || amount < 0) {
      setSaveError("Please enter a valid amount.");
      return;
    }

    if (!taxYear) {
      setSaveError("Could not calculate tax year.");
      return;
    }

    setUpdatingId(editingExpense.id);

    const { error } = await supabase
      .from("expenses")
      .update({
        expense_date: editingExpense.expense_date,
        item,
        shop: shop || null,
        amount,
        operational_category: editingExpense.operational_category,
        accounting_category: accountingCategory,
        tax_year: taxYear,
        payment_method: editingExpense.payment_method || null,
        is_allowable: flags.is_allowable,
        is_capital: flags.is_capital,
        notes: buildStoredNotes(
          editingExpense.clean_notes,
          editingExpense.funding_source
        ),
      })
      .eq("id", editingExpense.id);

    setUpdatingId(null);

    if (error) {
      setSaveError(error.message);
      return;
    }

    setEditingExpense(null);
    setSaveSuccess("Expense updated.");
    await loadExpenses();
  }

  const previewTaxYear = getUkTaxYear(form.expense_date);
  const previewAccountingCategory = getAccountingCategory(
    form.operational_category
  );

  const editPreviewTaxYear = editingExpense
    ? getUkTaxYear(editingExpense.expense_date)
    : "";

  const editPreviewAccountingCategory = editingExpense
    ? getAccountingCategory(editingExpense.operational_category)
    : "";

  return (
    <div className="space-y-4">

      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-neutral-900">
              Expenses
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              Track business expenses in a way that is easier to review for
              accounts and CT600 prep.
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              Hard-wired to the selected tax year using expense date ({fyLabel})
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border bg-neutral-50 px-4 py-3">
              <div className="flex items-center text-[11px] uppercase tracking-wide text-neutral-500">
                <span>Rows</span>
                <HelpTip text="The number of expense rows currently shown after filters are applied." />
              </div>
              <div className="mt-1 text-lg font-semibold text-neutral-900">
                {summary.count}
              </div>
            </div>

            <div className="rounded-2xl border bg-neutral-50 px-4 py-3">
              <div className="flex items-center text-[11px] uppercase tracking-wide text-neutral-500">
                <span>Total</span>
                <HelpTip text="The total value of the currently filtered expense rows." />
              </div>
              <div className="mt-1 text-lg font-semibold text-neutral-900">
                {formatCurrency(summary.total)}
              </div>
            </div>

            <div className="rounded-2xl border bg-neutral-50 px-4 py-3">
              <div className="flex items-center text-[11px] uppercase tracking-wide text-neutral-500">
                <span>Allowable</span>
                <HelpTip text="Business costs that usually reduce taxable profit for corporation tax." />
              </div>
              <div className="mt-1 text-lg font-semibold text-neutral-900">
                {formatCurrency(summary.allowableTotal)}
              </div>
            </div>

            <div className="rounded-2xl border bg-neutral-50 px-4 py-3">
              <div className="flex items-center text-[11px] uppercase tracking-wide text-neutral-500">
                <span>Capital</span>
                <HelpTip text="Assets or equipment that may need capital allowance treatment." />
              </div>
              <div className="mt-1 text-lg font-semibold text-neutral-900">
                {formatCurrency(summary.capitalTotal)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center text-sm font-semibold text-neutral-900">
          <span>Dashboard Feed</span>
          <HelpTip text="These are the expense totals the dashboard can use live because they come from the same expenses table." />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border bg-neutral-50 px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">
              Allowable Feed
            </div>
            <div className="mt-1 text-lg font-semibold text-neutral-900">
              {formatCurrency(summary.allowableTotal)}
            </div>
          </div>

          <div className="rounded-2xl border bg-neutral-50 px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">
              Revenue Feed
            </div>
            <div className="mt-1 text-lg font-semibold text-neutral-900">
              {formatCurrency(summary.revenueTotal)}
            </div>
          </div>

          <div className="rounded-2xl border bg-neutral-50 px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">
              Capital Feed
            </div>
            <div className="mt-1 text-lg font-semibold text-neutral-900">
              {formatCurrency(summary.capitalTotal)}
            </div>
          </div>
        </div>
      </div>

      <form
        onSubmit={handleAddExpense}
        className="rounded-2xl border bg-white p-4 shadow-sm"
      >
        <div className="mb-3 flex items-center text-sm font-semibold text-neutral-900">
          <span>Add Expense</span>
          <HelpTip text="Add a new expense row with a clean tax treatment choice, payment method, and funding source." />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <LabelWithHelp
              label="Date"
              help="The date the expense happened. The UK tax year is calculated automatically from this date."
            />
            <input
              type="date"
              value={form.expense_date}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, expense_date: e.target.value }))
              }
              className="h-10 w-full rounded-xl border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-400"
            />
          </div>

          <div>
            <LabelWithHelp
              label="Item"
              help="What the expense actually was. This field suggests items you have already used."
            />
            <SuggestionTextInput
              value={form.item}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, item: toTitleCase(value) }))
              }
              options={existingItems}
              placeholder="e.g. Amazon Subscription"
            />
          </div>

          <div>
            <LabelWithHelp
              label="Shop"
              help="Where the expense was bought or charged. This field suggests shops you have already used."
            />
            <SuggestionTextInput
              value={form.shop}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, shop: toTitleCase(value) }))
              }
              options={existingShops}
              placeholder="e.g. Tesco"
            />
          </div>

          <div>
            <LabelWithHelp
              label="Amount"
              help="The total amount paid for this expense in pounds."
            />
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.amount}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, amount: e.target.value }))
              }
              placeholder="0.00"
              className="h-10 w-full rounded-xl border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-400"
            />
          </div>

          <div>
            <LabelWithHelp
              label="Operational Category"
              help="Your day-to-day category for the expense. The accounting category updates automatically from this choice."
            />
            <select
              value={form.operational_category}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  operational_category: e.target.value,
                }))
              }
              className="h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-400"
            >
              {OPERATIONAL_CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div>
            <LabelWithHelp
              label="Payment Method"
              help="How the payment was made, such as Business Bank, Card, Cash, or Credit Card."
            />
            <select
              value={form.payment_method}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  payment_method: e.target.value,
                }))
              }
              className="h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-400"
            >
              {PAYMENT_METHOD_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div>
            <LabelWithHelp
              label="Funding Source"
              help="Use Company Funds if the business paid. Use Director Loan if you paid personally and the company owes you back."
            />
            <select
              value={form.funding_source}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  funding_source: e.target.value as FundingSource,
                }))
              }
              className="h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-400"
            >
              <option value="company_funds">Company Funds</option>
              <option value="director_loan">Director Loan</option>
            </select>
          </div>

          <div>
            <LabelWithHelp
              label="Tax Treatment"
              help="Choose one only. Revenue Allowable reduces taxable profit, Revenue Disallowable does not, and Capital Item is for assets or equipment."
            />
            <select
              value={form.tax_treatment}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  tax_treatment: e.target.value as TaxTreatment,
                }))
              }
              className="h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-400"
            >
              <option value="revenue_allowable">Revenue Allowable</option>
              <option value="revenue_disallowable">Revenue Disallowable</option>
              <option value="capital">Capital Item</option>
            </select>
          </div>

          <div className="rounded-xl border bg-neutral-50 px-3 py-2">
            <div className="flex items-center text-[11px] uppercase tracking-wide text-neutral-500">
              <span>Notes</span>
              <HelpTip text="Optional notes for receipt detail, business reason, or anything useful to remember later." />
            </div>
            <button
              type="button"
              onClick={() => setNotesOpen((prev) => !prev)}
              className="mt-1 inline-flex rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-700 transition hover:bg-neutral-50"
            >
              {notesOpen ? "Hide" : "Show"}
            </button>
          </div>

          <div className="rounded-xl border bg-neutral-50 px-3 py-2">
            <div className="flex items-center text-[11px] uppercase tracking-wide text-neutral-500">
              <span>Accounting Category</span>
              <HelpTip text="The accounting category used for summary and reporting. It updates automatically from the operational category." />
            </div>
            <div className="mt-1 text-sm font-medium text-neutral-900">
              {previewAccountingCategory}
            </div>
          </div>

          <div className="rounded-xl border bg-neutral-50 px-3 py-2">
            <div className="flex items-center text-[11px] uppercase tracking-wide text-neutral-500">
              <span>Tax Year</span>
              <HelpTip text="The UK tax year calculated automatically from the expense date." />
            </div>
            <div className="mt-1 text-sm font-medium text-neutral-900">
              {previewTaxYear || "—"}
            </div>
          </div>

          <div className="rounded-xl border bg-neutral-50 px-3 py-2">
            <div className="flex items-center text-[11px] uppercase tracking-wide text-neutral-500">
              <span>Tax Treatment Guide</span>
              <HelpTip text="This replaces the old two-checkbox setup so you do not accidentally select conflicting values." />
            </div>
            <button
              type="button"
              onClick={() => setTaxGuideOpen((prev) => !prev)}
              className="mt-1 inline-flex rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-700 transition hover:bg-neutral-50"
            >
              {taxGuideOpen ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        {notesOpen || taxGuideOpen ? (
          <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
            <div className="rounded-xl border bg-neutral-50 p-3">
              {notesOpen ? (
                <textarea
                  value={form.notes}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, notes: toTitleCase(e.target.value) }))
                  }
                  rows={4}
                  placeholder="Optional notes..."
                  className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400"
                />
              ) : null}
            </div>

            <div className="rounded-xl border bg-neutral-50 p-3">
              {taxGuideOpen ? (
                <div className="space-y-2 text-sm text-neutral-700">
                  <div>
                    <span className="font-medium">Revenue Allowable:</span> normal
                    business costs that usually reduce taxable profit.
                  </div>
                  <div>
                    <span className="font-medium">Revenue Disallowable:</span> business
                    spend that should not reduce taxable profit.
                  </div>
                  <div>
                    <span className="font-medium">Capital Item:</span> assets or
                    equipment that may need capital allowance treatment.
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {saveError ? (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {saveError}
          </div>
        ) : null}

        {saveSuccess ? (
          <div className="mt-3 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            {saveSuccess}
          </div>
        ) : null}

        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="h-10 rounded-xl bg-neutral-900 px-4 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Add Expense"}
          </button>

          <button
            type="button"
            onClick={() => setShowMileageModal(true)}
            className="h-10 rounded-xl border border-neutral-300 px-4 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
          >
            Open Mileage Tracker
          </button>

          <button
            type="button"
            onClick={() => {
              setForm({
                expense_date: getTodayInputValue(),
                item: "",
                shop: "",
                amount: "",
                operational_category: "Amazon Fees",
                payment_method: "Business Bank",
                funding_source: "company_funds",
                tax_treatment: "revenue_allowable",
                notes: "",
              });
              setSaveError(null);
              setSaveSuccess(null);
            }}
            className="h-10 rounded-xl border border-neutral-300 px-4 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
          >
            Clear
          </button>
        </div>
      </form>

      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-neutral-900">
          Filters
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-6">
          <div className="xl:col-span-2">
            <LabelWithHelp
              label="Search"
              help="Search item, shop, category, payment method, tax year, or notes."
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search item, shop, category, notes..."
              className="h-10 w-full rounded-xl border border-neutral-300 px-3 text-sm outline-none ring-0 placeholder:text-neutral-400 focus:border-neutral-400"
            />
          </div>

          <div>
            <LabelWithHelp
              label="Operational"
              help="Filter by your practical day-to-day expense category."
            />
            <select
              value={operationalFilter}
              onChange={(e) => setOperationalFilter(e.target.value)}
              className="h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-400"
            >
              <option value="all">All</option>
              {operationalCategories.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div>
            <LabelWithHelp
              label="Accounting"
              help="Filter by the accounting category used in summaries."
            />
            <select
              value={accountingFilter}
              onChange={(e) => setAccountingFilter(e.target.value)}
              className="h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-400"
            >
              <option value="all">All</option>
              {accountingCategories.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div>
            <LabelWithHelp
              label="Allowable"
              help="Quick filter for allowable versus not allowable rows."
            />
            <select
              value={allowableFilter}
              onChange={(e) => setAllowableFilter(e.target.value)}
              className="h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-400"
            >
              <option value="all">All</option>
              <option value="allowable">Allowable</option>
              <option value="not_allowable">Not Allowable</option>
            </select>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-6">
          <div>
            <LabelWithHelp
              label="Capital / Revenue"
              help="Separate capital items from normal revenue expenses."
            />
            <select
              value={capitalFilter}
              onChange={(e) => setCapitalFilter(e.target.value)}
              className="h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-400"
            >
              <option value="all">All</option>
              <option value="capital">Capital</option>
              <option value="revenue">Revenue</option>
            </select>
          </div>

          <div className="xl:col-span-5 flex items-end">
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setOperationalFilter("all");
                setAccountingFilter("all");
                setAllowableFilter("all");
                setCapitalFilter("all");
                setSortKey("expense_date");
                setSortAsc(false);
              }}
              className="h-10 rounded-xl border border-neutral-300 px-4 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard
          title="Accounting Category Summary"
          subtitle="Grouped totals by accounting category"
          help="Shows grouped totals by accounting category. This box is scrollable and shows about five visible rows at a time."
          open={accountingSummaryOpen}
          onToggle={() => setAccountingSummaryOpen((prev) => !prev)}
        >
          {accountingCategorySummary.length === 0 ? (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
              No summary available.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <div className="max-h-[265px] overflow-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead className="sticky top-0 bg-neutral-50">
                    <tr className="text-xs text-neutral-700">
                      <th className="px-4 py-3 font-semibold">Category</th>
                      <th className="px-4 py-3 font-semibold">Rows</th>
                      <th className="px-4 py-3 font-semibold">Total</th>
                      <th className="px-4 py-3 font-semibold">Allowable</th>
                      <th className="px-4 py-3 font-semibold">Revenue</th>
                      <th className="px-4 py-3 font-semibold">Capital</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accountingCategorySummary.map((row) => (
                      <tr
                        key={row.category}
                        className="border-t"
                        onDoubleClick={() =>
                          setSummaryModal({
                            type: "accounting",
                            title: row.category,
                            rows: row.count,
                            total: row.total,
                            allowable: row.allowable,
                            revenue: row.revenue,
                            capital: row.capital,
                          })
                        }
                      >
                        <td className="px-4 py-3 text-neutral-900">
                          {row.category}
                        </td>
                        <td className="px-4 py-3 text-neutral-700">{row.count}</td>
                        <td className="px-4 py-3 font-medium text-neutral-900">
                          {formatCurrency(row.total)}
                        </td>
                        <td className="px-4 py-3 text-neutral-700">
                          {formatCurrency(row.allowable)}
                        </td>
                        <td className="px-4 py-3 text-neutral-700">
                          {formatCurrency(row.revenue)}
                        </td>
                        <td className="px-4 py-3 text-neutral-700">
                          {formatCurrency(row.capital)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Tax Year Summary"
          subtitle="Grouped totals by tax year"
          help="Shows totals grouped by UK tax year across your expense rows."
          open={taxYearSummaryOpen}
          onToggle={() => setTaxYearSummaryOpen((prev) => !prev)}
        >
          {taxYearSummary.length === 0 ? (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
              No tax year summary available.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead className="bg-neutral-50">
                    <tr className="text-xs text-neutral-700">
                      <th className="px-4 py-3 font-semibold">Tax Year</th>
                      <th className="px-4 py-3 font-semibold">Rows</th>
                      <th className="px-4 py-3 font-semibold">Total</th>
                      <th className="px-4 py-3 font-semibold">Allowable</th>
                      <th className="px-4 py-3 font-semibold">Revenue</th>
                      <th className="px-4 py-3 font-semibold">Capital</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxYearSummary.map((row) => (
                      <tr
                        key={row.taxYear}
                        className="border-t"
                        onDoubleClick={() =>
                          setSummaryModal({
                            type: "taxyear",
                            title: row.taxYear,
                            rows: row.count,
                            total: row.total,
                            allowable: row.allowable,
                            revenue: row.revenue,
                            capital: row.capital,
                          })
                        }
                      >
                        <td className="px-4 py-3 text-neutral-900">
                          {row.taxYear}
                        </td>
                        <td className="px-4 py-3 text-neutral-700">{row.count}</td>
                        <td className="px-4 py-3 font-medium text-neutral-900">
                          {formatCurrency(row.total)}
                        </td>
                        <td className="px-4 py-3 text-neutral-700">
                          {formatCurrency(row.allowable)}
                        </td>
                        <td className="px-4 py-3 text-neutral-700">
                          {formatCurrency(row.revenue)}
                        </td>
                        <td className="px-4 py-3 text-neutral-700">
                          {formatCurrency(row.capital)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Expense Rows"
        subtitle={`Showing ${filteredRows.length} row${filteredRows.length === 1 ? "" : "s"} in ${fyLabel}`}
        help="Your filtered expense rows with sort, edit, and delete actions."
        open={expenseRowsOpen}
        onToggle={() => setExpenseRowsOpen((prev) => !prev)}
      >
        <div className="mb-3 text-xs text-neutral-500">
          Revenue total: {formatCurrency(summary.revenueTotal)}
        </div>

        {loading ? (
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
            Loading expenses...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
            No expenses found.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1550px] text-left text-sm">
                <thead className="bg-neutral-50">
                  <tr className="text-xs text-neutral-700">
                    <th
                      className="cursor-pointer px-4 py-3 font-semibold"
                      onClick={() => handleSort("expense_date")}
                    >
                      Date
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 font-semibold"
                      onClick={() => handleSort("item")}
                    >
                      Item
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 font-semibold"
                      onClick={() => handleSort("shop")}
                    >
                      Shop
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 font-semibold"
                      onClick={() => handleSort("amount")}
                    >
                      Amount
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 font-semibold"
                      onClick={() => handleSort("operational_category")}
                    >
                      Operational Category
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 font-semibold"
                      onClick={() => handleSort("accounting_category")}
                    >
                      Accounting Category
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 font-semibold"
                      onClick={() => handleSort("tax_year")}
                    >
                      Tax Year
                    </th>
                    <th className="px-4 py-3 font-semibold">Payment</th>
                    <th className="px-4 py-3 font-semibold">Funding</th>
                    <th className="px-4 py-3 font-semibold">Treatment</th>
                    <th className="px-4 py-3 font-semibold">Notes</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredRows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t align-top hover:bg-neutral-50"
                      onDoubleClick={() => openEditModal(r)}
                    >
                      <td className="px-4 py-3 text-neutral-900">
                        {formatDate(r.expense_date)}
                      </td>

                      <td className="px-4 py-3 text-neutral-900">{r.item}</td>

                      <td className="px-4 py-3 text-neutral-700">
                        {r.shop ?? "—"}
                      </td>

                      <td className="px-4 py-3 font-medium text-neutral-900">
                        {formatCurrency(r.amount)}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getBadgeClasses(
                            getOperationalBadgeKind(r.operational_category)
                          )}`}
                        >
                          {r.operational_category}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-neutral-700">
                        {r.accounting_category}
                      </td>

                      <td className="px-4 py-3 text-neutral-700">{r.tax_year}</td>

                      <td className="px-4 py-3 text-neutral-700">
                        {r.payment_method ?? "—"}
                      </td>

                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-700">
                          {getFundingSourceFromNotes(r.notes) === "director_loan"
                            ? "Director Loan"
                            : "Company Funds"}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
                            rowTaxTreatment(r) === "revenue_allowable"
                              ? "border-green-200 bg-green-50 text-green-700"
                              : rowTaxTreatment(r) === "capital"
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : "border-red-200 bg-red-50 text-red-700"
                          }`}
                        >
                          {taxTreatmentLabel(rowTaxTreatment(r))}
                        </span>
                      </td>

                      <td className="max-w-[240px] px-4 py-3 text-neutral-700">
                        <div className="whitespace-pre-wrap break-words">
                          {stripFundingSourceTag(r.notes) || "—"}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(r)}
                            className="rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-50"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteExpense(r.id)}
                            disabled={deletingId === r.id}
                            className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {deletingId === r.id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </SectionCard>

      {showMileageModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div className="text-sm font-semibold text-neutral-900">
                Mileage Tracker
              </div>
              <button
                type="button"
                onClick={() => setShowMileageModal(false)}
                className="rounded-xl border border-neutral-300 px-3 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
              >
                Close
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                useMileageInAddExpense();
              }}
              className="px-6 py-5"
            >
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                <div>
                  <LabelWithHelp
                    label="Date"
                    help="The mileage claim date."
                  />
                  <input
                    type="date"
                    value={mileageForm.mileage_date}
                    onChange={(e) =>
                      setMileageForm((prev) => ({
                        ...prev,
                        mileage_date: e.target.value,
                      }))
                    }
                    className="h-10 w-full rounded-xl border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-400"
                  />
                </div>

                <div>
                  <LabelWithHelp
                    label="Miles"
                    help="Total business miles for the journey."
                  />
                  <input
                    ref={milesInputRef}
                    type="number"
                    step="0.1"
                    min="0"
                    value={mileageForm.miles}
                    onChange={(e) =>
                      setMileageForm((prev) => ({ ...prev, miles: e.target.value }))
                    }
                    placeholder="0"
                    className="h-10 w-full rounded-xl border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-400"
                  />
                </div>

                <div>
                  <LabelWithHelp
                    label="Rate"
                    help="Claim rate per mile."
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={mileageForm.rate}
                    onChange={(e) =>
                      setMileageForm((prev) => ({ ...prev, rate: e.target.value }))
                    }
                    className="h-10 w-full rounded-xl border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-400"
                  />
                </div>

                <div>
                  <LabelWithHelp
                    label="Journey"
                    help="Example: Wembley To Milton Keynes."
                  />
                  <input
                    value={mileageForm.journey}
                    onChange={(e) =>
                      setMileageForm((prev) => ({
                        ...prev,
                        journey: toTitleCase(e.target.value),
                      }))
                    }
                    placeholder="Journey"
                    className="h-10 w-full rounded-xl border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-400"
                  />
                </div>

                <div className="rounded-xl border bg-neutral-50 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-neutral-500">
                    Claim Amount
                  </div>
                  <div className="mt-1 text-sm font-medium text-neutral-900">
                    {formatCurrency(mileageAmount)}
                  </div>
                </div>
              </div>

              <div className="mt-3">
                <LabelWithHelp
                  label="Mileage Notes"
                  help="Optional business purpose or extra details."
                />
                <textarea
                  value={mileageForm.notes}
                  onChange={(e) =>
                    setMileageForm((prev) => ({
                      ...prev,
                      notes: toTitleCase(e.target.value),
                    }))
                  }
                  rows={3}
                  placeholder="Optional mileage details..."
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-400"
                />
              </div>

              <div className="mt-4 flex items-center justify-end gap-3 border-t pt-4">
                <button
                  type="button"
                  onClick={() =>
                    setMileageForm({
                      mileage_date: getTodayInputValue(),
                      miles: "",
                      rate: "0.45",
                      journey: "",
                      notes: "",
                    })
                  }
                  className="h-10 rounded-xl border border-neutral-300 px-4 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
                >
                  Clear Mileage
                </button>

                <button
                  type="submit"
                  className="h-10 rounded-xl bg-neutral-900 px-4 text-sm font-medium text-white transition hover:bg-neutral-800"
                >
                  Use In Add Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {summaryModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl">
            <div className="border-b px-6 py-4">
              <div className="text-sm font-semibold text-neutral-900">
                {summaryModal.type === "accounting"
                  ? "Accounting Category Details"
                  : "Tax Year Details"}
              </div>
            </div>

            <div className="space-y-3 px-6 py-5">
              <div className="rounded-xl border bg-neutral-50 px-4 py-3">
                <div className="text-[11px] uppercase tracking-wide text-neutral-500">
                  {summaryModal.type === "accounting" ? "Category" : "Tax Year"}
                </div>
                <div className="mt-1 text-sm font-medium text-neutral-900">
                  {summaryModal.title}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border bg-neutral-50 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-wide text-neutral-500">
                    Rows
                  </div>
                  <div className="mt-1 text-sm font-medium text-neutral-900">
                    {summaryModal.rows}
                  </div>
                </div>

                <div className="rounded-xl border bg-neutral-50 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-wide text-neutral-500">
                    Total
                  </div>
                  <div className="mt-1 text-sm font-medium text-neutral-900">
                    {formatCurrency(summaryModal.total)}
                  </div>
                </div>

                <div className="rounded-xl border bg-neutral-50 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-wide text-neutral-500">
                    Allowable
                  </div>
                  <div className="mt-1 text-sm font-medium text-neutral-900">
                    {formatCurrency(summaryModal.allowable)}
                  </div>
                </div>

                <div className="rounded-xl border bg-neutral-50 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-wide text-neutral-500">
                    Revenue
                  </div>
                  <div className="mt-1 text-sm font-medium text-neutral-900">
                    {formatCurrency(summaryModal.revenue)}
                  </div>
                </div>

                <div className="rounded-xl border bg-neutral-50 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-wide text-neutral-500">
                    Capital
                  </div>
                  <div className="mt-1 text-sm font-medium text-neutral-900">
                    {formatCurrency(summaryModal.capital)}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end border-t px-6 py-4">
              <button
                type="button"
                onClick={() => setSummaryModal(null)}
                className="h-10 rounded-xl border border-neutral-300 px-4 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingExpense ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl">
            <div className="border-b px-6 py-4">
              <div className="text-sm font-semibold text-neutral-900">
                Edit Expense
              </div>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <LabelWithHelp
                    label="Date"
                    help="The date the expense happened. The tax year updates automatically from this date."
                  />
                  <input
                    type="date"
                    value={editingExpense.expense_date}
                    onChange={(e) =>
                      setEditingExpense((prev) =>
                        prev ? { ...prev, expense_date: e.target.value } : prev
                      )
                    }
                    className="h-10 w-full rounded-xl border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-400"
                  />
                </div>

                <div>
                  <LabelWithHelp
                    label="Item"
                    help="What the expense actually was. Existing items are suggested."
                  />
                  <SuggestionTextInput
                    value={editingExpense.item}
                    onChange={(value) =>
                      setEditingExpense((prev) =>
                        prev ? { ...prev, item: toTitleCase(value) } : prev
                      )
                    }
                    options={existingItems}
                  />
                </div>

                <div>
                  <LabelWithHelp
                    label="Shop"
                    help="Where the expense was bought or charged. Existing shops are suggested."
                  />
                  <SuggestionTextInput
                    value={editingExpense.shop ?? ""}
                    onChange={(value) =>
                      setEditingExpense((prev) =>
                        prev ? { ...prev, shop: toTitleCase(value) } : prev
                      )
                    }
                    options={existingShops}
                  />
                </div>

                <div>
                  <LabelWithHelp
                    label="Amount"
                    help="The total amount paid for the expense."
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editingExpense.amount}
                    onChange={(e) =>
                      setEditingExpense((prev) =>
                        prev ? { ...prev, amount: Number(e.target.value) } : prev
                      )
                    }
                    className="h-10 w-full rounded-xl border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-400"
                  />
                </div>

                <div>
                  <LabelWithHelp
                    label="Operational Category"
                    help="Your practical category. Accounting category updates automatically from this choice."
                  />
                  <select
                    value={editingExpense.operational_category}
                    onChange={(e) =>
                      setEditingExpense((prev) =>
                        prev
                          ? { ...prev, operational_category: e.target.value }
                          : prev
                      )
                    }
                    className="h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-400"
                  >
                    {OPERATIONAL_CATEGORY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <LabelWithHelp
                    label="Payment Method"
                    help="How the payment was made, such as Business Bank, Card, Cash, or Credit Card."
                  />
                  <select
                    value={editingExpense.payment_method ?? ""}
                    onChange={(e) =>
                      setEditingExpense((prev) =>
                        prev ? { ...prev, payment_method: e.target.value } : prev
                      )
                    }
                    className="h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-400"
                  >
                    {PAYMENT_METHOD_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <LabelWithHelp
                    label="Funding Source"
                    help="Use Director Loan when you paid personally and the company owes you back."
                  />
                  <select
                    value={editingExpense.funding_source}
                    onChange={(e) =>
                      setEditingExpense((prev) =>
                        prev
                          ? {
                              ...prev,
                              funding_source: e.target.value as FundingSource,
                            }
                          : prev
                      )
                    }
                    className="h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-400"
                  >
                    <option value="company_funds">Company Funds</option>
                    <option value="director_loan">Director Loan</option>
                  </select>
                </div>

                <div>
                  <LabelWithHelp
                    label="Tax Treatment"
                    help="Choose one only: Revenue Allowable, Revenue Disallowable, or Capital Item."
                  />
                  <select
                    value={editingExpense.tax_treatment}
                    onChange={(e) =>
                      setEditingExpense((prev) =>
                        prev
                          ? {
                              ...prev,
                              tax_treatment: e.target.value as TaxTreatment,
                            }
                          : prev
                      )
                    }
                    className="h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-400"
                  >
                    <option value="revenue_allowable">Revenue Allowable</option>
                    <option value="revenue_disallowable">Revenue Disallowable</option>
                    <option value="capital">Capital Item</option>
                  </select>
                </div>

                <div className="rounded-xl border bg-neutral-50 px-3 py-2">
                  <div className="flex items-center text-[11px] uppercase tracking-wide text-neutral-500">
                    <span>Notes</span>
                    <HelpTip text="Optional notes for receipt detail, business reason, or anything useful to remember." />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingExpense((prev) =>
                        prev ? { ...prev, notes_open: !prev.notes_open } : prev
                      )
                    }
                    className="mt-1 inline-flex rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-700 transition hover:bg-neutral-50"
                  >
                    {editingExpense.notes_open ? "Hide" : "Show"}
                  </button>
                </div>

                <div className="rounded-xl border bg-neutral-50 px-3 py-2">
                  <div className="flex items-center text-[11px] uppercase tracking-wide text-neutral-500">
                    <span>Accounting Category</span>
                    <HelpTip text="The accounting bucket used for summaries and reporting." />
                  </div>
                  <div className="mt-1 text-sm font-medium text-neutral-900">
                    {editPreviewAccountingCategory}
                  </div>
                </div>

                <div className="rounded-xl border bg-neutral-50 px-3 py-2">
                  <div className="flex items-center text-[11px] uppercase tracking-wide text-neutral-500">
                    <span>Tax Year</span>
                    <HelpTip text="The UK tax year calculated automatically from the date." />
                  </div>
                  <div className="mt-1 text-sm font-medium text-neutral-900">
                    {editPreviewTaxYear || "—"}
                  </div>
                </div>

                <div className="rounded-xl border bg-neutral-50 px-3 py-2">
                  <div className="flex items-center text-[11px] uppercase tracking-wide text-neutral-500">
                    <span>Tax Treatment Guide</span>
                    <HelpTip text="This single-choice setup avoids conflicting combinations like ticking both allowable and capital." />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingExpense((prev) =>
                        prev ? { ...prev, guide_open: !prev.guide_open } : prev
                      )
                    }
                    className="mt-1 inline-flex rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-700 transition hover:bg-neutral-50"
                  >
                    {editingExpense.guide_open ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              {editingExpense.notes_open || editingExpense.guide_open ? (
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  <div className="rounded-xl border bg-neutral-50 p-3">
                    {editingExpense.notes_open ? (
                      <textarea
                        value={editingExpense.clean_notes}
                        onChange={(e) =>
                          setEditingExpense((prev) =>
                            prev
                              ? { ...prev, clean_notes: toTitleCase(e.target.value) }
                              : prev
                          )
                        }
                        rows={4}
                        className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400"
                      />
                    ) : null}
                  </div>

                  <div className="rounded-xl border bg-neutral-50 p-3">
                    {editingExpense.guide_open ? (
                      <div className="space-y-2 text-sm text-neutral-700">
                        <div>
                          <span className="font-medium">Revenue Allowable:</span> normal
                          business costs that usually reduce taxable profit.
                        </div>
                        <div>
                          <span className="font-medium">Revenue Disallowable:</span> business
                          spend that should not reduce taxable profit.
                        </div>
                        <div>
                          <span className="font-medium">Capital Item:</span> assets or
                          equipment that may need capital allowance treatment.
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-3 border-t px-6 py-4">
              <button
                type="button"
                onClick={closeEditModal}
                className="h-10 rounded-xl border border-neutral-300 px-4 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleUpdateExpense}
                disabled={updatingId === editingExpense.id}
                className="h-10 rounded-xl bg-neutral-900 px-4 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {updatingId === editingExpense.id ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
