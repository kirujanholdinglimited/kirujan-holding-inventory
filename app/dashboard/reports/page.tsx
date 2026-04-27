"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

type RangeKey = "1D" | "7D" | "4W" | "LM" | "CM" | "6M" | "1Y" | "FY";
type ReportStatus = "ready" | "build" | "planned";

type ReportCard = {
  key: string;
  title: string;
  description: string;
  status: ReportStatus;
  printLabel: string;
  exportLabel: string;
  bullets: string[];
};

type QuickStat = {
  label: string;
  value: string;
  sub: string;
};

type ReportLine = {
  label: string;
  value: string;
};

type ReportSection = {
  heading: string;
  lines: ReportLine[];
};

type ReportDocument = {
  title: string;
  subtitle: string;
  notes?: string;
  sections: ReportSection[];
};

type GenericRow = Record<string, unknown>;

type ReportsSummary = {
  revenue: number;
  fees: number;
  expenses: number;
  cogs: number;
  grossProfit: number;
  netProfitBeforeTax: number;

  inventoryValue: number;
  cashLikeBalance: number;
  amazonPayoutBalance: number;
  currentAssets: number;

  liabilities: number;
  directorLoanOpening: number;
  directorLoanIntroduced: number;
  directorLoanWithdrawn: number;
  directorLoanRepaid: number;
  directorLoanClosing: number;

  fixedAssets: number;
  capitalAllowancesClaimed: number;
  taxableProfitEstimate: number;
  corporationTaxEstimate: number;

  expenseTopCategory: string;
  expenseMonthlyTotal: number;
  expenseTaxYearTotal: number;

  recordsLoaded: number;
};

type TableLoadResult = {
  rows: GenericRow[];
  exists: boolean;
  message: string;
  tableName: string | null;
};

type ConnectedSource = {
  connected: boolean;
  source: string;
};

function money(n: number) {
  return `£${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function integer(n: number) {
  return n.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
}

function getUkTaxYearLabel(d: Date) {
  const year = d.getUTCFullYear();
  const apr6 = new Date(Date.UTC(year, 3, 6));
  return d >= apr6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function formatTaxYearRange(label: string) {
  const [a, b] = label.split("-").map(Number);
  return `6 Apr ${a} – 5 Apr ${b}`;
}

function getTaxYearDates(label: string) {
  const [a, b] = label.split("-").map(Number);
  return {
    from: `${a}-04-06`,
    to: `${b}-04-05`,
  };
}

function getTodayIso() {
  return new Date().toISOString().slice(0, 10);
}

function cardClass() {
  return "rounded-2xl border border-neutral-200 bg-white shadow-sm";
}

function buttonClass(active = false) {
  return [
    "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-sm font-medium transition",
    active
      ? "border-neutral-900 bg-neutral-900 text-white"
      : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50",
  ].join(" ");
}

function mutedButtonClass() {
  return "inline-flex items-center justify-center rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50";
}

function getStatusPillClass(status: ReportStatus) {
  if (status === "ready") {
    return "border border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "build") {
    return "border border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border border-neutral-200 bg-neutral-100 text-neutral-700";
}

function getStatusLabel(status: ReportStatus) {
  if (status === "ready") return "Ready";
  if (status === "build") return "Build Next";
  return "Planned";
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normaliseDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "";
  return value.slice(0, 10);
}

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function getValue(row: GenericRow, keys: string[]) {
  for (const key of keys) {
    if (key in row && row[key] !== null && row[key] !== undefined && row[key] !== "") {
      return row[key];
    }
  }
  return undefined;
}

function isWithinRange(dateIso: string, fromIso: string, toIso: string) {
  if (!dateIso) return true;
  return dateIso >= fromIso && dateIso <= toIso;
}

function sumByKeys(rows: GenericRow[], keys: string[]) {
  return rows.reduce((sum, row) => sum + toNumber(getValue(row, keys)), 0);
}

function filterRowsByDate(rows: GenericRow[], fromIso: string, toIso: string) {
  return rows.filter((row) => {
    const rowDate = normaliseDate(
      getValue(row, [
        "date",
        "sale_date",
        "order_date",
        "expense_date",
        "transaction_date",
        "purchase_date",
        "paid_date",
        "created_at",
        "updated_at",
      ])
    );
    return isWithinRange(rowDate, fromIso, toIso);
  });
}

function detectSalesRevenue(row: GenericRow) {
  return toNumber(
    getValue(row, [
      "revenue",
      "sales_value",
      "sale_price",
      "selling_price",
      "sale_total",
      "order_total",
      "total_revenue",
      "gross_sales",
      "gross_amount",
      "amount",
      "total",
    ])
  );
}

function detectSalesFees(row: GenericRow) {
  return toNumber(
    getValue(row, [
      "fees",
      "amazon_fees",
      "fee_total",
      "total_fees",
      "fba_fees",
      "referral_fee",
      "commission",
    ])
  );
}

function detectSalesCost(row: GenericRow) {
  return toNumber(
    getValue(row, [
      "cost",
      "buy_cost",
      "purchase_cost",
      "unit_cost",
      "cost_price",
      "total_cost",
      "buy_total",
    ])
  );
}

function detectExpenseAmount(row: GenericRow) {
  return toNumber(
    getValue(row, [
      "amount",
      "total",
      "cost",
      "value",
      "expense_amount",
      "expense_total",
      "net_amount",
      "gross_amount",
    ])
  );
}

function detectInventoryValue(row: GenericRow) {
  const explicit = toNumber(
    getValue(row, [
      "inventory_value",
      "stock_value",
      "closing_value",
      "value",
      "current_value",
    ])
  );

  if (explicit > 0) return explicit;

  const status = firstNonEmptyString(
    getValue(row, ["status", "inventory_status", "item_status"])
  ).toLowerCase();

  const unsoldStatuses = new Set([
    "awaiting_delivery",
    "sent_to_amazon",
    "processing",
    "selling",
    "in_stock",
    "stock",
    "active",
    "available",
    "purchased",
    "ordered",
  ]);

  const qty = toNumber(
    getValue(row, ["qty", "quantity", "units", "stock_qty", "remaining_qty"])
  );

  const unitCost = toNumber(
    getValue(row, [
      "buy_cost",
      "purchase_cost",
      "cost",
      "unit_cost",
      "cost_price",
      "purchase_price",
    ])
  );

  const totalCost = toNumber(
    getValue(row, ["total_cost", "buy_total", "inventory_cost", "purchase_total"])
  );

  if (status && !unsoldStatuses.has(status)) {
    return 0;
  }

  if (totalCost > 0) return totalCost;
  if (qty > 0 && unitCost > 0) return qty * unitCost;
  return 0;
}

function detectPayoutBalance(row: GenericRow) {
  return toNumber(
    getValue(row, [
      "balance",
      "amount",
      "net_amount",
      "payout_amount",
      "available_balance",
      "owed",
      "payable",
    ])
  );
}

function getExpenseCategory(row: GenericRow) {
  return firstNonEmptyString(
    getValue(row, ["category", "expense_category", "type", "expense_type"]),
    "Uncategorised"
  );
}

function getDirectorLoanMovementType(row: GenericRow) {
  return firstNonEmptyString(
    getValue(row, ["movement_type", "type", "entry_type", "transaction_type", "category"]),
    ""
  ).toLowerCase();
}

function isMissingTableError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("could not find the table") ||
    lower.includes("schema cache") ||
    lower.includes("does not exist") ||
    (lower.includes("relation") && lower.includes("does not exist"))
  );
}

async function loadTableSafe(tableName: string): Promise<TableLoadResult> {
  const result = await supabase.from(tableName).select("*");

  if (result.error) {
    if (isMissingTableError(result.error.message)) {
      return {
        rows: [],
        exists: false,
        message: `${tableName} not connected yet`,
        tableName: null,
      };
    }

    return {
      rows: [],
      exists: false,
      message: `${tableName}: ${result.error.message}`,
      tableName: null,
    };
  }

  return {
    rows: (result.data as GenericRow[]) ?? [],
    exists: true,
    message: "",
    tableName,
  };
}

async function loadFirstExistingTable(candidates: string[]): Promise<TableLoadResult> {
  let lastMessage = "";

  for (const candidate of candidates) {
    const result = await loadTableSafe(candidate);
    if (result.exists) return result;
    if (result.message) lastMessage = result.message;
  }

  return {
    rows: [],
    exists: false,
    message: lastMessage,
    tableName: null,
  };
}

function isLikelyCapitalExpense(row: GenericRow) {
  const text = [
    firstNonEmptyString(getValue(row, ["category", "expense_category", "type"])),
    firstNonEmptyString(getValue(row, ["description", "notes", "name", "title"])),
  ]
    .join(" ")
    .toLowerCase();

  return (
    text.includes("asset") ||
    text.includes("equipment") ||
    text.includes("computer") ||
    text.includes("laptop") ||
    text.includes("monitor") ||
    text.includes("printer") ||
    text.includes("furniture") ||
    text.includes("desk") ||
    text.includes("table")
  );
}

function deriveDirectorLoanRows(expenseRows: GenericRow[], payoutRows: GenericRow[]) {
  const rows: GenericRow[] = [];

  for (const row of expenseRows) {
    const text = [
      firstNonEmptyString(getValue(row, ["category", "expense_category", "type"])),
      firstNonEmptyString(getValue(row, ["description", "notes", "name", "title"])),
      firstNonEmptyString(getValue(row, ["paid_by", "payment_source", "source"])),
    ]
      .join(" ")
      .toLowerCase();

    if (
      text.includes("director loan") ||
      text.includes("director_loan") ||
      text.includes("paid personally") ||
      text.includes("personal")
    ) {
      rows.push({
        ...row,
        movement_type: "introduced",
        amount: detectExpenseAmount(row),
      });
    }
  }

  for (const row of payoutRows) {
    const text = [
      firstNonEmptyString(getValue(row, ["category", "type", "description", "notes"])),
    ]
      .join(" ")
      .toLowerCase();

    if (text.includes("director loan repayment") || text.includes("director repayment")) {
      rows.push({
        ...row,
        movement_type: "repay",
        amount: detectPayoutBalance(row),
      });
    }
  }

  return rows;
}

function deriveCapitalAllowanceRows(expenseRows: GenericRow[]) {
  return expenseRows
    .filter(isLikelyCapitalExpense)
    .map((row) => ({
      ...row,
      asset_cost: detectExpenseAmount(row),
      claim_amount: detectExpenseAmount(row),
    }));
}

function buildSummary(params: {
  salesRows: GenericRow[];
  expenseRows: GenericRow[];
  inventoryRows: GenericRow[];
  payoutRows: GenericRow[];
  directorLoanRows: GenericRow[];
  capitalAllowanceRows: GenericRow[];
  fromIso: string;
  toIso: string;
}): ReportsSummary {
  const {
    salesRows,
    expenseRows,
    inventoryRows,
    payoutRows,
    directorLoanRows,
    capitalAllowanceRows,
    fromIso,
    toIso,
  } = params;

  const salesInRange = filterRowsByDate(salesRows, fromIso, toIso);
  const expensesInRange = filterRowsByDate(expenseRows, fromIso, toIso);
  const directorLoanInRange = filterRowsByDate(directorLoanRows, fromIso, toIso);
  const capitalAllowancesInRange = filterRowsByDate(capitalAllowanceRows, fromIso, toIso);
  const payoutsInRange = filterRowsByDate(payoutRows, fromIso, toIso);

  const revenue = salesInRange.reduce((sum, row) => sum + detectSalesRevenue(row), 0);
  const fees = salesInRange.reduce((sum, row) => sum + detectSalesFees(row), 0);
  const cogs = salesInRange.reduce((sum, row) => sum + detectSalesCost(row), 0);
  const expenses = expensesInRange.reduce((sum, row) => sum + detectExpenseAmount(row), 0);
  const grossProfit = revenue - cogs;
  const netProfitBeforeTax = revenue - fees - cogs - expenses;

  const inventoryValue = inventoryRows.reduce((sum, row) => sum + detectInventoryValue(row), 0);
  const amazonPayoutBalance = payoutsInRange.reduce(
    (sum, row) => sum + detectPayoutBalance(row),
    0
  );

  const cashLikeBalance =
    amazonPayoutBalance + sumByKeys(payoutsInRange, ["cash_balance", "bank_balance", "balance"]);

  const currentAssets = inventoryValue + cashLikeBalance + amazonPayoutBalance;

  const liabilities = sumByKeys(expenseRows, [
    "liability_amount",
    "loan_balance",
    "credit_balance",
    "outstanding",
  ]);

  let directorLoanOpening = 0;
  let directorLoanIntroduced = 0;
  let directorLoanWithdrawn = 0;
  let directorLoanRepaid = 0;
  let directorLoanClosing = 0;

  if (directorLoanRows.length > 0) {
    directorLoanOpening = toNumber(
      getValue(directorLoanRows[0], ["opening_balance", "start_balance"])
    );

    for (const row of directorLoanInRange) {
      const amount = toNumber(getValue(row, ["amount", "value", "movement_amount", "total"]));
      const type = getDirectorLoanMovementType(row);

      if (type.includes("introduc")) {
        directorLoanIntroduced += amount;
      } else if (type.includes("withdraw")) {
        directorLoanWithdrawn += amount;
      } else if (type.includes("repay")) {
        directorLoanRepaid += amount;
      } else {
        const introduced = toNumber(getValue(row, ["introduced", "money_in"]));
        const withdrawn = toNumber(getValue(row, ["withdrawn", "money_out"]));
        const repaid = toNumber(getValue(row, ["repaid", "repayment"]));
        directorLoanIntroduced += introduced;
        directorLoanWithdrawn += withdrawn;
        directorLoanRepaid += repaid;
      }
    }

    const explicitClosing = directorLoanRows.reduce(
      (sum, row) => sum + toNumber(getValue(row, ["closing_balance", "end_balance"])),
      0
    );

    directorLoanClosing =
      explicitClosing !== 0
        ? explicitClosing
        : directorLoanOpening + directorLoanIntroduced - directorLoanWithdrawn - directorLoanRepaid;
  }

  const fixedAssets = capitalAllowanceRows.reduce(
    (sum, row) =>
      sum + toNumber(getValue(row, ["asset_cost", "cost", "purchase_cost", "amount", "value"])),
    0
  );

  const capitalAllowancesClaimed = capitalAllowancesInRange.reduce(
    (sum, row) =>
      sum +
      toNumber(
        getValue(row, [
          "claim_amount",
          "amount_claimed",
          "claimed",
          "allowance_amount",
          "aia_claimed",
        ])
      ),
    0
  );

  const taxableProfitEstimate = Math.max(netProfitBeforeTax - capitalAllowancesClaimed, 0);
  const corporationTaxEstimate = taxableProfitEstimate * 0.25;

  const expenseCategoryTotals = new Map<string, number>();
  for (const row of expensesInRange) {
    const category = getExpenseCategory(row);
    const amount = detectExpenseAmount(row);
    expenseCategoryTotals.set(category, (expenseCategoryTotals.get(category) ?? 0) + amount);
  }

  let expenseTopCategory = "N/A";
  let topCategoryAmount = -1;
  for (const [category, amount] of expenseCategoryTotals.entries()) {
    if (amount > topCategoryAmount) {
      topCategoryAmount = amount;
      expenseTopCategory = category;
    }
  }

  const todayMonth = getTodayIso().slice(0, 7);
  const expenseMonthlyTotal = expensesInRange.reduce((sum, row) => {
    const rowDate = normaliseDate(
      getValue(row, ["expense_date", "date", "transaction_date", "purchase_date", "created_at"])
    );
    return rowDate.startsWith(todayMonth) ? sum + detectExpenseAmount(row) : sum;
  }, 0);

  const expenseTaxYearTotal = expensesInRange.reduce(
    (sum, row) => sum + detectExpenseAmount(row),
    0
  );

  return {
    revenue,
    fees,
    expenses,
    cogs,
    grossProfit,
    netProfitBeforeTax,

    inventoryValue,
    cashLikeBalance,
    amazonPayoutBalance,
    currentAssets,

    liabilities,
    directorLoanOpening,
    directorLoanIntroduced,
    directorLoanWithdrawn,
    directorLoanRepaid,
    directorLoanClosing,

    fixedAssets,
    capitalAllowancesClaimed,
    taxableProfitEstimate,
    corporationTaxEstimate,

    expenseTopCategory,
    expenseMonthlyTotal,
    expenseTaxYearTotal,

    recordsLoaded:
      salesRows.length +
      expenseRows.length +
      inventoryRows.length +
      payoutRows.length +
      directorLoanRows.length +
      capitalAllowanceRows.length,
  };
}

const REPORT_CARDS: ReportCard[] = [
  {
    key: "overview",
    title: "Overview",
    description:
      "Main reporting hub for quick totals, transaction visibility, trend review, and report navigation.",
    status: "ready",
    printLabel: "Print overview",
    exportLabel: "Export overview",
    bullets: ["KPI cards", "Main report table", "Filter controls", "Quick breakdowns"],
  },
  {
    key: "profit-loss",
    title: "Profit & Loss",
    description:
      "Tracks sales income, cost of goods sold, fees, expenses, gross profit, and net profit for the selected period.",
    status: "ready",
    printLabel: "Print P&L",
    exportLabel: "Export P&L",
    bullets: ["Revenue", "COGS", "Amazon fees", "Net profit"],
  },
  {
    key: "balance-sheet",
    title: "Balance Sheet",
    description:
      "Shows assets, liabilities, share capital, retained earnings, and director loan position in a print-friendly format.",
    status: "ready",
    printLabel: "Print balance sheet",
    exportLabel: "Export balance sheet",
    bullets: ["Current assets", "Liabilities", "Net assets", "Capital & reserves"],
  },
  {
    key: "ct600",
    title: "CT600 Summary",
    description:
      "Corporation tax preparation summary with profit before tax, add-backs, capital allowances, taxable profit, and tax estimate.",
    status: "ready",
    printLabel: "Print CT600 summary",
    exportLabel: "Export CT600 summary",
    bullets: ["Profit before tax", "Add backs", "Taxable profits", "Tax estimate"],
  },
  {
    key: "director-loan",
    title: "Director Loan Summary",
    description:
      "Tracks money introduced, withdrawals, repayments, and the closing director loan position for the chosen period.",
    status: "ready",
    printLabel: "Print director loan",
    exportLabel: "Export director loan",
    bullets: ["Opening balance", "Introduced funds", "Withdrawals", "Closing balance"],
  },
  {
    key: "expenses",
    title: "Expenses Summary",
    description:
      "Summarises expenses by category, month, tax year, and total business spend in a clean accountant-friendly layout.",
    status: "ready",
    printLabel: "Print expenses",
    exportLabel: "Export expenses",
    bullets: ["Category totals", "Monthly totals", "Tax-year totals", "Expense trends"],
  },
  {
    key: "capital-allowances",
    title: "Capital Allowances Summary",
    description:
      "Lists assets, purchase dates, claim treatment, amount claimed, and supports year-end corporation tax calculations.",
    status: "ready",
    printLabel: "Print capital allowances",
    exportLabel: "Export capital allowances",
    bullets: ["Asset register", "AIA treatment", "Claim amount", "Year summary"],
  },
];

function buildReportDocument(
  selectedKey: string,
  taxYear: string,
  summary: ReportsSummary,
  connectedSources: {
    inventory: ConnectedSource;
    directorLoan: ConnectedSource;
    capitalAllowances: ConnectedSource;
  }
): ReportDocument {
  const taxRange = formatTaxYearRange(taxYear);

  switch (selectedKey) {
    case "overview":
      return {
        title: "Overview Report",
        subtitle: `${taxYear} • ${taxRange}`,
        notes: "This is the high-level reporting overview for the selected tax year.",
        sections: [
          {
            heading: "Summary",
            lines: [
              { label: "Revenue", value: money(summary.revenue) },
              { label: "Gross Profit", value: money(summary.grossProfit) },
              { label: "Net Profit Before Tax", value: money(summary.netProfitBeforeTax) },
              { label: "Records Loaded", value: integer(summary.recordsLoaded) },
            ],
          },
          {
            heading: "Assets Snapshot",
            lines: [
              {
                label: "Inventory Value",
                value: money(summary.inventoryValue),
              },
              { label: "Amazon Payout Balance", value: money(summary.amazonPayoutBalance) },
              { label: "Current Assets", value: money(summary.currentAssets) },
              { label: "Liabilities", value: money(summary.liabilities) },
            ],
          },
        ],
      };

    case "profit-loss":
      return {
        title: "Profit & Loss Report",
        subtitle: `${taxYear} • ${taxRange}`,
        notes: "Generated from linked sales and expenses data for the selected period.",
        sections: [
          {
            heading: "Income",
            lines: [
              { label: "Amazon Sales / Revenue", value: money(summary.revenue) },
              { label: "Total Revenue", value: money(summary.revenue) },
            ],
          },
          {
            heading: "Cost of Sales",
            lines: [
              { label: "Cost of Goods Sold", value: money(summary.cogs) },
              { label: "Gross Profit", value: money(summary.grossProfit) },
            ],
          },
          {
            heading: "Operating Costs",
            lines: [
              { label: "Amazon Fees", value: money(summary.fees) },
              { label: "Business Expenses", value: money(summary.expenses) },
              { label: "Net Profit Before Tax", value: money(summary.netProfitBeforeTax) },
            ],
          },
        ],
      };

    case "balance-sheet": {
      const netAssets = summary.fixedAssets + summary.currentAssets - summary.liabilities;
      const capitalAndReserves = netAssets;

      return {
        title: "Balance Sheet",
        subtitle: `${taxYear} • ${taxRange}`,
        notes: "Print-friendly working balance sheet generated from linked website tables.",
        sections: [
          {
            heading: "Fixed Assets",
            lines: [
              {
                label: "Fixed Assets",
                value: money(summary.fixedAssets),
              },
            ],
          },
          {
            heading: "Current Assets",
            lines: [
              {
                label: "Inventory",
                value: money(summary.inventoryValue),
              },
              { label: "Cash / Bank / Payout Balance", value: money(summary.cashLikeBalance) },
              { label: "Amazon Payout Balance", value: money(summary.amazonPayoutBalance) },
              { label: "Total Current Assets", value: money(summary.currentAssets) },
            ],
          },
          {
            heading: "Creditors: Amounts Falling Due Within One Year",
            lines: [{ label: "Liabilities", value: money(summary.liabilities) }],
          },
          {
            heading: "Capital and Reserves",
            lines: [
              {
                label: "Director Loan",
                value: money(summary.directorLoanClosing),
              },
              { label: "Retained Earnings (working)", value: money(summary.netProfitBeforeTax) },
              { label: "Net Assets", value: money(netAssets) },
              { label: "Capital and Reserves", value: money(capitalAndReserves) },
            ],
          },
        ],
      };
    }

    case "ct600":
      return {
        title: "CT600 Summary",
        subtitle: `${taxYear} • ${taxRange}`,
        notes: "Working corporation tax summary based on linked profit and capital allowance figures.",
        sections: [
          {
            heading: "Corporation Tax Summary",
            lines: [
              { label: "Profit Before Tax", value: money(summary.netProfitBeforeTax) },
              { label: "Disallowable Expenses", value: money(0) },
              {
                label: "Capital Allowances",
                value: money(summary.capitalAllowancesClaimed),
              },
              { label: "Taxable Total Profits", value: money(summary.taxableProfitEstimate) },
              { label: "Corporation Tax Estimate", value: money(summary.corporationTaxEstimate) },
            ],
          },
        ],
      };

    case "director-loan":
      return {
        title: "Director Loan Summary",
        subtitle: `${taxYear} • ${taxRange}`,
        notes: `Source: ${connectedSources.directorLoan.source}`,
        sections: [
          {
            heading: "Director Loan Movements",
            lines: [
              { label: "Opening Balance", value: money(summary.directorLoanOpening) },
              { label: "Money Introduced", value: money(summary.directorLoanIntroduced) },
              { label: "Withdrawals", value: money(summary.directorLoanWithdrawn) },
              { label: "Repayments", value: money(summary.directorLoanRepaid) },
              { label: "Closing Balance", value: money(summary.directorLoanClosing) },
            ],
          },
        ],
      };

    case "expenses":
      return {
        title: "Expenses Summary",
        subtitle: `${taxYear} • ${taxRange}`,
        notes: "Linked from the expenses table for the selected tax year.",
        sections: [
          {
            heading: "Expense Summary",
            lines: [
              { label: "Total Expenses", value: money(summary.expenseTaxYearTotal) },
              { label: "Top Category", value: summary.expenseTopCategory || "N/A" },
              { label: "Current Month Total", value: money(summary.expenseMonthlyTotal) },
              { label: "Tax-Year Total", value: money(summary.expenseTaxYearTotal) },
            ],
          },
        ],
      };

    case "capital-allowances":
      return {
        title: "Capital Allowances Summary",
        subtitle: `${taxYear} • ${taxRange}`,
        notes: `Source: ${connectedSources.capitalAllowances.source}`,
        sections: [
          {
            heading: "Allowances",
            lines: [
              { label: "Fixed Asset Base", value: money(summary.fixedAssets) },
              { label: "AIA / Claimed This Period", value: money(summary.capitalAllowancesClaimed) },
              { label: "Taxable Profit After Allowances", value: money(summary.taxableProfitEstimate) },
              { label: "Corporation Tax Effect", value: money(summary.corporationTaxEstimate) },
            ],
          },
        ],
      };

    default:
      return {
        title: "Report",
        subtitle: `${taxYear} • ${taxRange}`,
        sections: [],
      };
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function printReportDocument(doc: ReportDocument) {
  const printableHtml = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(doc.title)}</title>
        <style>
          @page {
            size: A4;
            margin: 16mm;
          }
          * {
            box-sizing: border-box;
          }
          body {
            margin: 0;
            font-family: Arial, Helvetica, sans-serif;
            color: #111827;
            background: #ffffff;
          }
          .page {
            width: 100%;
          }
          .header {
            border-bottom: 2px solid #111827;
            padding-bottom: 12px;
            margin-bottom: 20px;
          }
          .title {
            font-size: 26px;
            font-weight: 700;
            margin: 0 0 6px 0;
          }
          .subtitle {
            font-size: 13px;
            color: #4b5563;
            margin: 0;
          }
          .notes {
            margin: 18px 0 22px 0;
            padding: 12px 14px;
            border: 1px solid #d1d5db;
            background: #f9fafb;
            font-size: 13px;
            line-height: 1.5;
          }
          .section {
            margin-bottom: 22px;
            page-break-inside: avoid;
          }
          .section-heading {
            font-size: 16px;
            font-weight: 700;
            border-bottom: 1px solid #111827;
            padding-bottom: 6px;
            margin-bottom: 10px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          td {
            border-bottom: 1px solid #e5e7eb;
            padding: 9px 6px;
            font-size: 13px;
            text-align: left;
            vertical-align: top;
          }
          td:last-child {
            text-align: right;
            white-space: nowrap;
          }
          .footer {
            margin-top: 28px;
            font-size: 12px;
            color: #6b7280;
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div class="title">${escapeHtml(doc.title)}</div>
            <p class="subtitle">${escapeHtml(doc.subtitle)}</p>
          </div>

          ${doc.notes ? `<div class="notes">${escapeHtml(doc.notes)}</div>` : ""}

          ${doc.sections
            .map(
              (section) => `
                <div class="section">
                  <div class="section-heading">${escapeHtml(section.heading)}</div>
                  <table>
                    <tbody>
                      ${section.lines
                        .map(
                          (line) => `
                            <tr>
                              <td>${escapeHtml(line.label)}</td>
                              <td>${escapeHtml(line.value)}</td>
                            </tr>
                          `
                        )
                        .join("")}
                    </tbody>
                  </table>
                </div>
              `
            )
            .join("")}

          <div class="footer">
            Generated from Reports Hub print view.
          </div>
        </div>

        <script>
          window.onload = function () {
            window.print();
            window.onafterprint = function () {
              window.close();
            };
          };
        </script>
      </body>
    </html>
  `;

  const printWindow = window.open("", "_blank", "width=900,height=1200");
  if (!printWindow) return;

  printWindow.document.open();
  printWindow.document.write(printableHtml);
  printWindow.document.close();
}

export default function ReportsPage() {
  const [range, setRange] = useState<RangeKey>("FY");
  const [taxYear, setTaxYear] = useState(getUkTaxYearLabel(new Date()));
  const [selectedReport, setSelectedReport] = useState<string>("overview");
  const [previewOpen, setPreviewOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  const [salesRows, setSalesRows] = useState<GenericRow[]>([]);
  const [expenseRows, setExpenseRows] = useState<GenericRow[]>([]);
  const [inventoryRows, setInventoryRows] = useState<GenericRow[]>([]);
  const [payoutRows, setPayoutRows] = useState<GenericRow[]>([]);
  const [directorLoanRows, setDirectorLoanRows] = useState<GenericRow[]>([]);
  const [capitalAllowanceRows, setCapitalAllowanceRows] = useState<GenericRow[]>([]);

  const [connectedSources, setConnectedSources] = useState<{
    inventory: ConnectedSource;
    directorLoan: ConnectedSource;
    capitalAllowances: ConnectedSource;
  }>({
    inventory: { connected: false, source: "Not connected" },
    directorLoan: { connected: false, source: "Not connected" },
    capitalAllowances: { connected: false, source: "Not connected" },
  });

  useEffect(() => {
    try {
      const savedRange = window.localStorage.getItem("reports-range");
      const savedTaxYear = window.localStorage.getItem("reports-tax-year");
      const savedReport = window.localStorage.getItem("reports-selected-card");

      if (
        savedRange === "1D" ||
        savedRange === "7D" ||
        savedRange === "4W" ||
        savedRange === "LM" ||
        savedRange === "CM" ||
        savedRange === "6M" ||
        savedRange === "1Y" ||
        savedRange === "FY"
      ) {
        setRange(savedRange);
      }

      if (savedTaxYear) {
        setTaxYear(savedTaxYear);
      }

      if (savedReport && REPORT_CARDS.some((card) => card.key === savedReport)) {
        setSelectedReport(savedReport);
      }
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("reports-range", range);
      window.localStorage.setItem("reports-tax-year", taxYear);
      window.localStorage.setItem("reports-selected-card", selectedReport);
    } catch {
      // no-op
    }
  }, [range, taxYear, selectedReport]);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      setLoading(true);
      setErrorText("");

      try {
        const salesRes = await loadFirstExistingTable(["sales"]);
        const expensesRes = await loadFirstExistingTable(["expenses"]);
        const payoutsRes = await loadFirstExistingTable(["payouts"]);

        const inventoryRes = await loadFirstExistingTable([
          "inventory",
          "purchases",
          "stock",
          "products",
        ]);

        const directorLoanRes = await loadFirstExistingTable([
          "director_loan",
          "director_loans",
          "director_loan_entries",
        ]);

        const capitalRes = await loadFirstExistingTable([
          "capital_allowances",
          "fixed_assets",
          "assets",
          "asset_register",
        ]);

        if (cancelled) return;

        const safeSalesRows = salesRes.rows;
        const safeExpenseRows = expensesRes.rows;
        const safePayoutRows = payoutsRes.rows;

        const derivedDirectorLoanRows =
          directorLoanRes.exists && directorLoanRes.rows.length > 0
            ? directorLoanRes.rows
            : deriveDirectorLoanRows(safeExpenseRows, safePayoutRows);

        const derivedCapitalRows =
          capitalRes.exists && capitalRes.rows.length > 0
            ? capitalRes.rows
            : deriveCapitalAllowanceRows(safeExpenseRows);

        setSalesRows(safeSalesRows);
        setExpenseRows(safeExpenseRows);
        setPayoutRows(safePayoutRows);
        setInventoryRows(inventoryRes.rows);
        setDirectorLoanRows(derivedDirectorLoanRows);
        setCapitalAllowanceRows(derivedCapitalRows);

        setConnectedSources({
          inventory: {
            connected: inventoryRes.exists || inventoryRes.rows.length > 0,
            source: inventoryRes.tableName ?? "Derived inventory value",
          },
          directorLoan: {
            connected: true,
            source:
              directorLoanRes.tableName ??
              (derivedDirectorLoanRows.length > 0
                ? "Derived from expenses / payouts"
                : "Derived fallback"),
          },
          capitalAllowances: {
            connected: true,
            source:
              capitalRes.tableName ??
              (derivedCapitalRows.length > 0
                ? "Derived from expenses"
                : "Derived fallback"),
          },
        });

        const hardErrors = [
          salesRes.exists ? "" : salesRes.message,
          expensesRes.exists ? "" : expensesRes.message,
          payoutsRes.exists ? "" : payoutsRes.message,
        ]
          .filter(Boolean)
          .join(" | ");

        setErrorText(hardErrors);
      } catch (err) {
        if (!cancelled) {
          setErrorText(err instanceof Error ? err.message : "Failed to load reports data.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadAll();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeDateRange = useMemo(() => {
    const today = getTodayIso();
    const now = new Date();

    if (range === "1D") {
      return { from: today, to: today };
    }

    if (range === "7D") {
      const from = new Date();
      from.setDate(now.getDate() - 6);
      return { from: from.toISOString().slice(0, 10), to: today };
    }

    if (range === "4W") {
      const from = new Date();
      from.setDate(now.getDate() - 27);
      return { from: from.toISOString().slice(0, 10), to: today };
    }

    if (range === "LM") {
      const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDayLastMonth = new Date(firstDayThisMonth.getTime() - 86400000);
      const firstDayLastMonth = new Date(
        lastDayLastMonth.getFullYear(),
        lastDayLastMonth.getMonth(),
        1
      );

      return {
        from: firstDayLastMonth.toISOString().slice(0, 10),
        to: lastDayLastMonth.toISOString().slice(0, 10),
      };
    }

    if (range === "CM") {
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
        to: today,
      };
    }

    if (range === "6M") {
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().slice(0, 10),
        to: today,
      };
    }

    if (range === "1Y") {
      const from = new Date();
      from.setFullYear(now.getFullYear() - 1);
      return { from: from.toISOString().slice(0, 10), to: today };
    }

    return getTaxYearDates(taxYear);
  }, [range, taxYear]);

  const summary = useMemo(() => {
    return buildSummary({
      salesRows,
      expenseRows,
      inventoryRows,
      payoutRows,
      directorLoanRows,
      capitalAllowanceRows,
      fromIso: activeDateRange.from,
      toIso: activeDateRange.to,
    });
  }, [
    salesRows,
    expenseRows,
    inventoryRows,
    payoutRows,
    directorLoanRows,
    capitalAllowanceRows,
    activeDateRange,
  ]);

  const selectedCard = useMemo(() => {
    return REPORT_CARDS.find((card) => card.key === selectedReport) ?? REPORT_CARDS[0];
  }, [selectedReport]);

  const selectedDocument = useMemo(() => {
    return buildReportDocument(selectedReport, taxYear, summary, connectedSources);
  }, [selectedReport, taxYear, summary, connectedSources]);

  const stats = useMemo<QuickStat[]>(() => {
    return [
      {
        label: "Revenue",
        value: loading ? "Loading..." : money(summary.revenue),
        sub: "Linked from sales",
      },
      {
        label: "Net Profit Before Tax",
        value: loading ? "Loading..." : money(summary.netProfitBeforeTax),
        sub: "Linked from sales + expenses",
      },
      {
        label: "Current Assets",
        value: loading ? "Loading..." : money(summary.currentAssets),
        sub: `Inventory via ${connectedSources.inventory.source}`,
      },
      {
        label: "Corporation Tax Estimate",
        value: loading ? "Loading..." : money(summary.corporationTaxEstimate),
        sub: `${taxYear} • ${formatTaxYearRange(taxYear)}`,
      },
    ];
  }, [loading, summary, taxYear, connectedSources.inventory.source]);

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6">
        <div className={cardClass()}>
          <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="text-2xl font-semibold tracking-tight text-neutral-900">
                Reports
              </div>
              <div className="mt-2 text-sm leading-6 text-neutral-600">
                Central reports hub for Overview, Profit &amp; Loss, Balance Sheet, CT600,
                Director Loan Summary, Expenses Summary, and Capital Allowances Summary.
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                <span className="rounded-full border border-neutral-200 bg-neutral-100 px-2.5 py-1 font-medium text-neutral-700">
                  Tax Year {taxYear}
                </span>
                <span>{formatTaxYearRange(taxYear)}</span>
                <span className="rounded-full border border-neutral-200 bg-neutral-100 px-2.5 py-1 font-medium text-neutral-700">
                  Range {range}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {(["1D", "7D", "4W", "LM", "CM", "6M", "1Y", "FY"] as RangeKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={buttonClass(range === key)}
                  onClick={() => setRange(key)}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
        </div>

        {errorText ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorText}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className={cardClass()}>
              <div className="p-5">
                <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  {stat.label}
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900">
                  {stat.value}
                </div>
                <div className="mt-1 text-sm text-neutral-600">{stat.sub}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className={`${cardClass()} xl:col-span-2`}>
            <div className="border-b border-neutral-200 px-5 py-4">
              <div className="text-base font-semibold text-neutral-900">Reports Hub</div>
              <div className="mt-1 text-sm text-neutral-600">
                Select a report below. Each preview and print document now pulls working figures
                from the linked or derived sources.
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
              {REPORT_CARDS.map((card) => {
                const active = card.key === selectedReport;

                return (
                  <button
                    key={card.key}
                    type="button"
                    onClick={() => setSelectedReport(card.key)}
                    className={[
                      "rounded-2xl border p-5 text-left transition",
                      active
                        ? "border-neutral-900 bg-neutral-900 text-white shadow-sm"
                        : "border-neutral-200 bg-white text-neutral-900 hover:border-neutral-300 hover:bg-neutral-50",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold tracking-tight">{card.title}</div>
                        <div
                          className={[
                            "mt-1 text-sm leading-6",
                            active ? "text-neutral-200" : "text-neutral-600",
                          ].join(" ")}
                        >
                          {card.description}
                        </div>
                      </div>

                      <span
                        className={[
                          "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
                          active
                            ? "border border-white/20 bg-white/10 text-white"
                            : getStatusPillClass(card.status),
                        ].join(" ")}
                      >
                        {getStatusLabel(card.status)}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {card.bullets.map((bullet) => (
                        <span
                          key={bullet}
                          className={[
                            "rounded-full px-2.5 py-1 text-xs font-medium",
                            active
                              ? "border border-white/15 bg-white/10 text-white"
                              : "border border-neutral-200 bg-neutral-100 text-neutral-700",
                          ].join(" ")}
                        >
                          {bullet}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className={cardClass()}>
              <div className="border-b border-neutral-200 px-5 py-4">
                <div className="text-base font-semibold text-neutral-900">Selected Report</div>
                <div className="mt-1 text-sm text-neutral-600">
                  Open preview or print the selected report document only.
                </div>
              </div>

              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-neutral-900">
                      {selectedCard.title}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-neutral-600">
                      {selectedCard.description}
                    </div>
                  </div>

                  <span
                    className={[
                      "rounded-full px-2.5 py-1 text-xs font-medium",
                      getStatusPillClass(selectedCard.status),
                    ].join(" ")}
                  >
                    {getStatusLabel(selectedCard.status)}
                  </span>
                </div>

                <div className="mt-4 space-y-2">
                  {selectedCard.bullets.map((bullet) => (
                    <div key={bullet} className="flex items-start gap-2 text-sm text-neutral-700">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-neutral-900" />
                      <span>{bullet}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3">
                  <button
                    type="button"
                    className={buttonClass(true)}
                    onClick={() => setPreviewOpen(true)}
                  >
                    Open {selectedCard.title} Preview
                  </button>

                  <button
                    type="button"
                    className={mutedButtonClass()}
                    onClick={() => printReportDocument(selectedDocument)}
                  >
                    {selectedCard.printLabel}
                  </button>

                  <button type="button" className={mutedButtonClass()}>
                    {selectedCard.exportLabel}
                  </button>
                </div>
              </div>
            </div>

            <div className={cardClass()}>
              <div className="border-b border-neutral-200 px-5 py-4">
                <div className="text-base font-semibold text-neutral-900">Connected Tables</div>
                <div className="mt-1 text-sm text-neutral-600">
                  Fallback sources are used automatically where needed.
                </div>
              </div>

              <div className="p-5 space-y-3">
                <ConnectionRow label="sales" connected source="sales" />
                <ConnectionRow label="expenses" connected source="expenses" />
                <ConnectionRow label="payouts" connected source="payouts" />
                <ConnectionRow
                  label="inventory"
                  connected={connectedSources.inventory.connected}
                  source={connectedSources.inventory.source}
                />
                <ConnectionRow
                  label="director_loan"
                  connected={connectedSources.directorLoan.connected}
                  source={connectedSources.directorLoan.source}
                />
                <ConnectionRow
                  label="capital_allowances"
                  connected={connectedSources.capitalAllowances.connected}
                  source={connectedSources.capitalAllowances.source}
                />
              </div>
            </div>

            <div className={cardClass()}>
              <div className="border-b border-neutral-200 px-5 py-4">
                <div className="text-base font-semibold text-neutral-900">Live Linked Totals</div>
                <div className="mt-1 text-sm text-neutral-600">
                  Working values used by the print documents.
                </div>
              </div>

              <div className="p-5 space-y-3">
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
                  Revenue: <span className="font-semibold text-neutral-900">{money(summary.revenue)}</span>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
                  Expenses: <span className="font-semibold text-neutral-900">{money(summary.expenses)}</span>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
                  Inventory Value: <span className="font-semibold text-neutral-900">{money(summary.inventoryValue)}</span>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
                  Director Loan Closing: <span className="font-semibold text-neutral-900">{money(summary.directorLoanClosing)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={cardClass()}>
          <div className="border-b border-neutral-200 px-5 py-4">
            <div className="text-base font-semibold text-neutral-900">
              What Each Report Should Cover
            </div>
            <div className="mt-1 text-sm text-neutral-600">
              The documents below now use working linked totals where possible.
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
            <InfoBlock
              title="Overview"
              items={["Revenue", "Gross profit", "Net profit before tax", "Assets snapshot"]}
            />
            <InfoBlock
              title="Profit & Loss"
              items={["Revenue", "COGS", "Amazon fees", "Business expenses"]}
            />
            <InfoBlock
              title="Balance Sheet"
              items={["Fixed assets", "Current assets", "Liabilities", "Director loan"]}
            />
            <InfoBlock
              title="CT600 Summary"
              items={["Profit before tax", "Capital allowances", "Taxable profits", "Tax estimate"]}
            />
            <InfoBlock
              title="Director Loan Summary"
              items={["Opening balance", "Introduced funds", "Withdrawals", "Closing balance"]}
            />
            <InfoBlock
              title="Expenses Summary"
              items={["Tax-year expenses", "Monthly expenses", "Top category", "Spend visibility"]}
            />
            <InfoBlock
              title="Capital Allowances"
              items={["Fixed asset base", "Allowance claimed", "Taxable impact", "CT impact"]}
            />
          </div>
        </div>
      </div>

      {previewOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={() => setPreviewOpen(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-neutral-200 p-5">
              <div>
                <div className="text-lg font-semibold text-neutral-900">
                  {selectedDocument.title} Preview
                </div>
                <div className="mt-1 text-sm text-neutral-600">
                  This is the document layout that will be printed.
                </div>
              </div>

              <button
                type="button"
                className={buttonClass()}
                onClick={() => setPreviewOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="overflow-y-auto p-6">
              <div className="mx-auto w-full max-w-3xl rounded-2xl border border-neutral-200 bg-white p-8">
                <div className="border-b-2 border-neutral-900 pb-4">
                  <div className="text-3xl font-bold tracking-tight text-neutral-900">
                    {selectedDocument.title}
                  </div>
                  <div className="mt-2 text-sm text-neutral-600">
                    {selectedDocument.subtitle}
                  </div>
                </div>

                {selectedDocument.notes ? (
                  <div className="mt-5 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm leading-6 text-neutral-700">
                    {selectedDocument.notes}
                  </div>
                ) : null}

                <div className="mt-6 space-y-6">
                  {selectedDocument.sections.map((section) => (
                    <div key={section.heading}>
                      <div className="border-b border-neutral-900 pb-2 text-base font-semibold text-neutral-900">
                        {section.heading}
                      </div>

                      <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200">
                        {section.lines.map((line, index) => (
                          <div
                            key={`${section.heading}-${line.label}-${index}`}
                            className={[
                              "grid grid-cols-[1fr_auto] gap-4 px-4 py-3 text-sm",
                              index !== section.lines.length - 1 ? "border-b border-neutral-200" : "",
                            ].join(" ")}
                          >
                            <div className="text-neutral-700">{line.label}</div>
                            <div className="font-medium text-neutral-900">{line.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-8 text-xs text-neutral-500">
                  Generated from Reports Hub preview.
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-neutral-200 p-5">
              <button
                type="button"
                className={mutedButtonClass()}
                onClick={() => printReportDocument(selectedDocument)}
              >
                {selectedCard.printLabel}
              </button>
              <button
                type="button"
                className={buttonClass(true)}
                onClick={() => setPreviewOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ConnectionRow({
  label,
  connected,
  source,
}: {
  label: string;
  connected: boolean;
  source: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-neutral-800">{label}</span>
        <span
          className={[
            "rounded-full px-2.5 py-1 text-xs font-medium",
            connected
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-amber-200 bg-amber-50 text-amber-700",
          ].join(" ")}
        >
          {connected ? "Connected" : "Not connected"}
        </span>
      </div>
      <div className="mt-2 text-xs text-neutral-500">Source: {source}</div>
    </div>
  );
}

function InfoBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
      <div className="text-sm font-semibold text-neutral-900">{title}</div>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-2 text-sm text-neutral-700">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-neutral-900" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
