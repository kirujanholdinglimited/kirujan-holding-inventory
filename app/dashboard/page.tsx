"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/lib/supabase";

type RangeKey =
  | "1D"
  | "7D"
  | "4W"
  | "LM"
  | "CM"
  | "6M"
  | "1Y"
  | "FY";

type DiscountType = "percent" | "fixed";

type ProductRow = {
  id: string;
  asin: string;
  brand: string;
  product_name: string;
  product_code: number;
};

type PurchaseDashboardRow = Record<string, any> & {
  product?: ProductRow | null;
};

type ShipmentAny = Record<string, any>;

type ExpenseRow = {
  id?: number;
  expense_date: string;
  operational_category: string;
  item: string;
  amount: number;
  is_allowable?: boolean | null;
  is_capital?: boolean | null;
  notes?: string | null;
};

type PayoutRow = {
  id?: number;
  payout_date: string;
  reference?: string | null;
  amount: number;
};

type FinanceEntryRow = {
  id?: string | number;
  entry_date?: string | null;
  date?: string | null;
  finance_date?: string | null;
  category?: string | null;
  type?: string | null;
  transaction_type?: string | null;
  reference?: string | null;
  item?: string | null;
  description?: string | null;
  notes?: string | null;
  amount: number;
  source_table?: string | null;
};

type DashboardTargetsRow = {
  id?: number;
  tax_year: string;
  monthly_profit_target: number | null;
  roi_target: number | null;
  monthly_sales_target: number | null;
};

type DashboardCustomKpiRow = {
  id?: string | number;
  tax_year: string;
  title: string;
  target_value: number | null;
  current_value_type: string | null;
  current_value_manual: number | null;
  format_type: string | null;
  sort_order: number | null;
  is_active: boolean | null;
};

type RenderedCustomKpi = {
  id: string;
  title: string;
  target: number;
  current: number;
  suffix: "" | "%";
};


type SystemKpiOption = {
  key: string;
  label: string;
  format: "currency" | "percent" | "number";
};

type SavedSystemKpi = {
  id: string;
  createdAt: string;
  key: string;
  target: number;
  periodType: "month" | "tax_year" | "date";
  startDate?: string | null;
  targetDate?: string | null;
};

type SavedSystemKpiHistory = {
  id: string;
  createdAt: string;
  key: string;
  title: string;
  format: SystemKpiOption["format"];
  target: number;
  finalValue: number;
  outcome: "completed" | "missed" | "removed";
  periodType: SavedSystemKpi["periodType"];
  startDate?: string | null;
  targetDate?: string | null;
  periodLabel: string;
  archivedAt: string;
};

type MonthlyPerformanceRow = {
  month: string;
  unitsSold: number;
  amazonFees: number;
  productCost: number;
  shipments: number;
  refunds: number;
  writeOff: number;
  misc: number;
  expenses: number;
  totalCost: number;
  sales: number;
  profitLoss: number;
  roi: number | null;
  salesMoM: number | null;
  amzPayout: number;
};

type HmrcPrototypeView = "overview" | "ct600" | "pl" | "balance_sheet";

type PrototypePLCardKey = "sales" | "cogs" | "fixed_assets" | "expenses" | "final_pl";

type PrototypePLCardLine = {
  label: string;
  value: number;
  negative?: boolean;
  isSection?: boolean;
  indentLevel?: number;
  isCount?: boolean;
};

type PrototypeExpenseBreakdownRow = {
  sourcePage: string;
  mainCategory: string;
  subCategory: string;
  value: number;
  miles?: number;
};

type PrototypePLCardData = {
  key: PrototypePLCardKey;
  title: string;
  value: number;
  sub: string;
  lines: PrototypePLCardLine[];
  footer?: string;
};

function money(n: number) {
  return `£${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function emptyState(message: string) {
  return [[<span key={`empty-${message}`} className="text-sm text-neutral-500">{message}</span>]];
}

function safeNumber(value: unknown) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function sumAmountRows<T>(rows: T[], getAmount: (row: T) => unknown) {
  return rows.reduce((sum, row) => sum + safeNumber(getAmount(row)), 0);
}

const COMPANY_NAME = "Kirujan Holding Limited";

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = String(iso).slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return String(iso);
  return `${day}/${m}/${y}`;
}

function fmtDateFromDate(d: Date | null | undefined) {
  if (!d || Number.isNaN(d.getTime())) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear());
  return `${day}/${month}/${year}`;
}


function normalizeASIN(input: string) {
  return input.replace(/\s+/g, "").toUpperCase();
}

function titleCaseEveryWord(input: string) {
  const hasTrailingSpace = input.endsWith(" ");
  const parts = input.split(" ");
  const mapped = parts.map((w) => {
    if (!w) return "";
    const first = w.charAt(0).toUpperCase();
    const rest = w.slice(1).toLowerCase();
    return first + rest;
  });
  const joined = mapped.join(" ");
  return hasTrailingSpace ? joined + " " : joined;
}

function sanitizeDecimalInput(v: string) {
  let out = v.replace(/[^\d.]/g, "");
  const firstDot = out.indexOf(".");
  if (firstDot !== -1) {
    out = out.slice(0, firstDot + 1) + out.slice(firstDot + 1).replace(/\./g, "");
  }
  return out;
}

function parseDecimalOrZero(v: string) {
  const t = v.trim();
  if (!t) return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function toNullDate(v: string) {
  const t = v.trim();
  return t ? t : null;
}

function toNullText(v: string) {
  const t = v.trim();
  return t ? t : null;
}

function computeUkTaxYear(isoDate: string) {
  const d = new Date(isoDate + "T00:00:00");
  const year = d.getFullYear();
  const apr6ThisYear = new Date(Date.UTC(year, 3, 6));
  const dUtc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  if (dUtc >= apr6ThisYear) return `${year}-${year + 1}`;
  return `${year - 1}-${year}`;
}


function buildInventoryHref(status: string, range: RangeKey) {
  return `/dashboard/inventory?status=${encodeURIComponent(status)}&range=${encodeURIComponent(range)}`;
}

function buildOpenShipmentsHref(range: RangeKey) {
  return `/dashboard/shipments?status=${encodeURIComponent("in_transit")}&range=${encodeURIComponent(range)}`;
}

function financeCategoryFromType(type: string | null | undefined) {
  switch (String(type ?? "").trim()) {
    case "loan_introduced":
    case "loan_repayment":
    case "personal_withdrawal":
      return "Director";
    case "bank_loan_in":
    case "bank_loan_repayment":
    case "bank_loan_interest":
      return "Loans";
    case "dividend":
      return "Dividends";
    case "salary":
      return "Salary";
    case "tax_payment":
    case "corporation_tax":
    case "corporation_tax_payment":
    case "vat_payment":
    case "hmrc_payment":
      return "Tax";
    default:
      return "Other";
  }
}

function financeTypeLabel(type: string | null | undefined) {
  switch (String(type ?? "").trim()) {
    case "loan_introduced":
      return "I Added Money";
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
    case "tax":
    case "tax payment":
      return "Tax Payment";
    case "corporation_tax":
    case "corporation_tax_payment":
      return "Corporation Tax Payment";
    case "vat_payment":
      return "VAT Payment";
    case "hmrc_payment":
      return "HMRC Payment";
    default:
      return String(type ?? "Other").trim() || "Other";
  }
}

function isLoanInterestFinanceRow(row: FinanceRow) {
  const type = String(row.transaction_type ?? row.type ?? "").trim().toLowerCase();
  const label = `${row.category ?? ""} ${row.description ?? ""} ${row.notes ?? ""}`.toLowerCase();
  return type === "bank_loan_interest" || (label.includes("loan") && label.includes("interest"));
}

function isTaxPaymentFinanceRow(row: FinanceRow) {
  const type = String(row.transaction_type ?? row.type ?? "").trim().toLowerCase();
  const label = `${row.category ?? ""} ${row.description ?? ""} ${row.notes ?? ""} ${row.reference ?? ""}`.toLowerCase();
  return (
    type === "tax_payment" ||
    type === "corporation_tax" ||
    type === "corporation_tax_payment" ||
    type === "vat_payment" ||
    type === "hmrc_payment" ||
    type === "tax" ||
    type.includes("tax") ||
    type.includes("hmrc") ||
    type.includes("vat") ||
    label.includes("tax payment") ||
    label.includes("corporation tax") ||
    label.includes("hmrc") ||
    label.includes("vat payment")
  );
}

function statusPillColor(s: "awaiting_delivery" | "processing" | "sent_to_amazon" | "selling" | "sold" | "written_off") {
  switch (s) {
    case "awaiting_delivery":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "processing":
      return "border-indigo-200 bg-indigo-50 text-indigo-800";
    case "sent_to_amazon":
      return "border-purple-200 bg-purple-50 text-purple-800";
    case "selling":
      return "border-teal-200 bg-teal-50 text-teal-800";
    case "sold":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "written_off":
      return "border-red-200 bg-red-50 text-red-800";
  }
}

function financeDirectionFromType(type: string | null | undefined): "in" | "out" | "other" {
  switch (String(type ?? "").trim()) {
    case "loan_introduced":
    case "bank_loan_in":
      return "in";
    case "loan_repayment":
    case "dividend":
    case "salary":
    case "bank_loan_repayment":
    case "bank_loan_interest":
    case "personal_withdrawal":
    case "tax_payment":
    case "corporation_tax":
    case "corporation_tax_payment":
    case "vat_payment":
    case "hmrc_payment":
    case "tax":
    case "tax payment":
    case "corporation tax":
    case "corporation tax payment":
    case "vat payment":
    case "hmrc payment":
      return "out";
    default:
      return "other";
  }
}

function Section({
  title,
  subtitle,
  right,
  children,
  collapsible = false,
  storageKey,
  defaultOpen = true,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  collapsible?: boolean;
  storageKey?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = usePersistentOpenState(
    storageKey ?? `dashboard_section_${title.toLowerCase().replace(/\s+/g, "_")}`,
    defaultOpen
  );

  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex w-full items-start justify-between gap-4 text-left"
        >
          <div>
            <div className="text-sm font-semibold text-neutral-900">{title}</div>
            {subtitle && <div className="mt-1 text-xs text-neutral-700">{subtitle}</div>}
          </div>
          <div className="flex items-center gap-3">
            {right}
            <span className="rounded-full border px-2 py-0.5 text-[11px] text-neutral-700">
              {open ? "Hide" : "Show"}
            </span>
          </div>
        </button>
      ) : (
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-neutral-900">{title}</div>
            {subtitle && <div className="mt-1 text-xs text-neutral-700">{subtitle}</div>}
          </div>
          {right}
        </div>
      )}

      {!collapsible || open ? <div className="mt-6">{children}</div> : null}
    </div>
  );
}

function TableShell({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<Array<React.ReactNode>>;
}) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50">
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="px-3 py-2 text-left text-xs font-semibold text-neutral-700"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white">
          {rows.length === 0 ? (
            <tr>
              <td className="px-3 py-6 text-sm text-neutral-600" colSpan={headers.length}>
                No records found for this view
              </td>
            </tr>
          ) : (
            rows.map((r, idx) => (
              <tr key={idx} className="border-t">
                {r.map((cell, j) => (
                  <td key={j} className="px-3 py-2 text-sm text-neutral-900">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function StockMiniCard({
  label,
  units,
  value,
  hint,
  href,
}: {
  label: string;
  units: number;
  value: number;
  hint: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-neutral-300 hover:bg-neutral-50"
    >
      <div className="flex items-start justify-between">
        <div className="text-sm font-semibold text-neutral-900">{label}</div>
        <span className="rounded-full border px-2 py-0.5 text-xs text-neutral-700">
          {units}
        </span>
      </div>
      <div className="mt-2 text-xl font-semibold text-neutral-900">{money(value)}</div>
      <div className="mt-1 text-xs text-neutral-600">{hint}</div>
    </Link>
  );
}

function BigStat({
  title,
  value,
  sub,
}: {
  title: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-neutral-600">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-neutral-900">{value}</div>
      {sub && <div className="mt-1 text-xs text-neutral-600">{sub}</div>}
    </div>
  );
}

function HmrcCard({
  title,
  value,
  sub,
  onClick,
}: {
  title: string;
  value: string;
  sub?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full rounded-2xl border bg-white p-5 text-left shadow-sm",
        onClick ? "cursor-pointer transition hover:-translate-y-0.5 hover:border-neutral-300 hover:bg-neutral-50" : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs uppercase tracking-wide text-neutral-600">{title}</div>
        {onClick ? <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">View breakdown</span> : null}
      </div>
      <div className="mt-2 text-2xl font-semibold text-neutral-900">{value}</div>
      {sub && <div className="mt-1 text-xs text-neutral-600">{sub}</div>}
      {onClick ? <div className="mt-2 text-[11px] text-neutral-400">Click to inspect source rows and calculation</div> : null}
    </button>
  );
}

function KpiTargetCard({
  title,
  target,
  current,
  percent,
  suffix = "",
}: {
  title: string;
  target: number;
  current: number;
  percent: number;
  suffix?: "" | "%";
}) {
  const color =
    percent >= 80 ? "text-emerald-700" : percent >= 50 ? "text-yellow-700" : "text-red-700";

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-neutral-600">{title}</div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <div className="text-xs text-neutral-500">Target</div>
          <div className="text-lg font-semibold text-neutral-900">
            {suffix === "%" ? `${target.toFixed(2)}%` : money(target)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-neutral-500">Current</div>
          <div className="text-lg font-semibold text-neutral-900">
            {suffix === "%" ? `${current.toFixed(2)}%` : money(current)}
          </div>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100">
        <div
          className={[
            "h-full rounded-full",
            percent >= 80 ? "bg-emerald-500" : percent >= 50 ? "bg-yellow-500" : "bg-red-500",
          ].join(" ")}
          style={{ width: `${Math.max(0, Math.min(percent, 100))}%` }}
        />
      </div>
      <div className={["mt-2 text-xs font-semibold", color].join(" ")}>
        {percent.toFixed(0)}% of target
      </div>
    </div>
  );
}



function ChartViewport({
  height = 300,
  minWidth = 320,
  children,
}: {
  height?: number;
  minWidth?: number;
  children: (size: { width: number; height: number }) => React.ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const node = hostRef.current;
    if (!node) return;

    const measure = () => {
      const rect = node.getBoundingClientRect();
      const nextWidth = Math.max(minWidth, Math.floor(rect.width || 0));
      const nextHeight = Math.max(height, Math.floor(rect.height || 0), 1);
      setSize((prev) => {
        if (prev && prev.width === nextWidth && prev.height === nextHeight) return prev;
        return { width: nextWidth, height: nextHeight };
      });
    };

    const scheduleMeasure = () => {
      if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        measure();
      });
    };

    scheduleMeasure();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => scheduleMeasure());
      observer.observe(node);
      return () => {
        observer.disconnect();
        if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current);
      };
    }

    window.addEventListener("resize", scheduleMeasure);
    return () => {
      window.removeEventListener("resize", scheduleMeasure);
      if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current);
    };
  }, [height, minWidth]);

  return (
    <div ref={hostRef} className="mt-4 h-[300px] min-h-[300px] w-full min-w-0 overflow-hidden">
      {size ? children(size) : null}
    </div>
  );
}



const SYSTEM_KPI_OPTIONS: SystemKpiOption[] = [
  { key: "monthly_profit", label: "Monthly Profit", format: "currency" },
  { key: "gross_profit", label: "Gross Profit", format: "currency" },
  { key: "net_profit", label: "Net Profit", format: "currency" },
  { key: "monthly_sales", label: "Monthly Sales", format: "currency" },
  { key: "roi", label: "ROI", format: "percent" },
  { key: "units_sold", label: "Units Sold", format: "number" },
  { key: "sold_orders", label: "Sold Orders", format: "number" },
  { key: "average_profit_per_unit", label: "Average Profit Per Unit", format: "currency" },
  { key: "average_sale_price", label: "Average Sale Price", format: "currency" },
  { key: "stock_value", label: "Stock Value", format: "currency" },
  { key: "payouts", label: "Payouts", format: "currency" },
  { key: "shipments_sent_to_amazon", label: "Shipments Sent to Amazon", format: "number" },
  { key: "shipments_created", label: "Shipments Created", format: "number" },
  { key: "shipments_delivered", label: "Shipments Delivered", format: "number" },
  { key: "inventory_purchased", label: "Inventory Purchased", format: "number" },
  { key: "inventory_cost_added", label: "Inventory Cost Added", format: "currency" },
  { key: "inbound_units", label: "Inbound Units Received", format: "number" },
  { key: "inbound_value_received", label: "Inbound Value Received", format: "currency" },
  { key: "selling_units", label: "Selling Units", format: "number" },
  { key: "write_off_units", label: "Write-Off Units", format: "number" },
  { key: "write_off_value", label: "Write-Off Value", format: "currency" },
  { key: "business_expenses", label: "Business Expenses", format: "currency" },
  { key: "amazon_fees", label: "Amazon Fees", format: "currency" },
  { key: "refunds", label: "Refunds", format: "currency" },
];

const KPI_CARD_LIMIT = 6;

function formatSystemKpiValue(value: number, format: SystemKpiOption["format"]) {
  if (format === "currency") return money(value);
  if (format === "percent") return `${value.toFixed(2)}%`;
  return String(Math.round(value));
}

function parseIsoDateOrNull(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function getCurrentMonthElapsedPercent(startDateIso?: string | null) {
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const start = parseIsoDateOrNull(startDateIso) ?? defaultStart;
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const total = end.getTime() - start.getTime();
  if (total <= 0) return 100;
  const elapsed = now.getTime() - start.getTime();
  return clampPercent((elapsed / total) * 100);
}

function getDateElapsedPercent(targetDateIso: string | null | undefined, startDateIso?: string | null) {
  const now = new Date();
  const target = parseIsoDateOrNull(targetDateIso);
  if (!target) return getCurrentMonthElapsedPercent(startDateIso);
  const start = parseIsoDateOrNull(startDateIso) ?? new Date(target.getFullYear(), target.getMonth(), 1);
  const total = target.getTime() - start.getTime();
  if (total <= 0) return 100;
  const elapsed = now.getTime() - start.getTime();
  return clampPercent((elapsed / total) * 100);
}

function getTaxYearElapsedPercent(fyStart: Date, fyEnd: Date, startDateIso?: string | null) {
  const now = new Date();
  const start = parseIsoDateOrNull(startDateIso) ?? fyStart;
  const total = fyEnd.getTime() - start.getTime();
  if (total <= 0) return 100;
  const elapsed = now.getTime() - start.getTime();
  return clampPercent((elapsed / total) * 100);
}

function getSystemKpiElapsedPercent(periodType: SavedSystemKpi["periodType"], fyStart: Date, fyEnd: Date, startDateIso?: string | null, targetDateIso?: string | null) {
  if (periodType === "tax_year") return getTaxYearElapsedPercent(fyStart, fyEnd, startDateIso);
  if (periodType === "date") return getDateElapsedPercent(targetDateIso, startDateIso);
  return getCurrentMonthElapsedPercent(startDateIso);
}

function getScheduleTone(progressPercent: number, elapsedPercent: number, completed?: boolean) {
  if (completed) {
    return {
      label: "Completed",
      wrap: "border-emerald-200 bg-emerald-50 text-emerald-700",
      bar: "bg-emerald-600",
    };
  }
  if (progressPercent >= elapsedPercent + 5) {
    return {
      label: "Ahead of schedule",
      wrap: "border-emerald-200 bg-emerald-50 text-emerald-700",
      bar: "bg-emerald-500",
    };
  }
  if (progressPercent >= elapsedPercent - 5) {
    return {
      label: "On target",
      wrap: "border-amber-200 bg-amber-50 text-amber-700",
      bar: "bg-amber-500",
    };
  }
  return {
    label: "Behind schedule",
    wrap: "border-red-200 bg-red-50 text-red-700",
    bar: "bg-red-500",
  };
}


function formatSystemKpiPeriodLabel(periodType: SavedSystemKpi["periodType"], fyLabel: string, startDate?: string | null, targetDate?: string | null) {
  const start = startDate ? fmtDate(startDate) : "Start date";
  if (periodType === "tax_year") return `Period: ${start} to tax year end (${fyLabel})`;
  if (periodType === "date") return `Period: ${start} to ${targetDate ? fmtDate(targetDate) : "Target date"}`;
  return `Period: ${start} to month end`;
}

function getSystemKpiPeriodEndDate(periodType: SavedSystemKpi["periodType"], fyEnd: Date, startDate?: string | null, targetDate?: string | null) {
  const start = parseIsoDateOrNull(startDate) ?? new Date();
  if (periodType === "tax_year") return fyEnd;
  if (periodType === "date") {
    const target = parseIsoDateOrNull(targetDate) ?? start;
    return new Date(target.getFullYear(), target.getMonth(), target.getDate(), 23, 59, 59, 999);
  }
  return new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
}

function getKpiHistoryTone(outcome: SavedSystemKpiHistory["outcome"]) {
  if (outcome === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (outcome === "missed") return "border-red-200 bg-red-50 text-red-700";
  return "border-neutral-300 bg-neutral-50 text-neutral-700";
}

function getKpiHistoryMonthHeading(dateIso: string) {
  const parsed = parseIsoDateOrNull(dateIso) ?? new Date();
  return parsed.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function buildKpiHistoryHtml(rows: SavedSystemKpiHistory[]) {
  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const grouped = rows.reduce<Record<string, SavedSystemKpiHistory[]>>((acc, row) => {
    const key = new Date(`${row.archivedAt}T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  const totals = rows.reduce(
    (acc, row) => {
      acc.total += 1;
      if (row.outcome === "completed") acc.completed += 1;
      if (row.outcome === "missed") acc.missed += 1;
      if (row.outcome === "removed") acc.removed += 1;
      return acc;
    },
    { total: 0, completed: 0, missed: 0, removed: 0 }
  );

  const badgeTone = (outcome: SavedSystemKpiHistory["outcome"]) => {
    if (outcome === "completed") return 'background:#ecfdf5;border-color:#86efac;color:#166534;';
    if (outcome === "missed") return 'background:#fef2f2;border-color:#fca5a5;color:#991b1b;';
    return 'background:#f5f5f5;border-color:#d4d4d4;color:#525252;';
  };

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>KPI History Export</title>
      <style>
        @page { size: A4; margin: 16mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #171717; }
        .header { border: 1px solid #e5e5e5; border-radius: 18px; padding: 18px 20px; margin-bottom: 18px; }
        .company { font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: #737373; font-weight: 700; }
        h1 { font-size: 26px; margin: 8px 0 4px; }
        .sub { color: #525252; font-size: 13px; margin: 0; }
        .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0 22px; }
        .summary-card { border: 1px solid #e5e5e5; border-radius: 14px; padding: 12px 14px; }
        .summary-label { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: #737373; font-weight: 700; }
        .summary-value { font-size: 22px; line-height: 1.2; font-weight: 800; margin-top: 6px; }
        .month-block { margin-top: 20px; }
        .month-title { font-size: 18px; font-weight: 800; margin: 0 0 10px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed; }
        th, td { border: 1px solid #e5e5e5; padding: 9px 10px; text-align: left; vertical-align: top; }
        th { background: #f7f7f7; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #525252; }
        td { word-wrap: break-word; }
        .num { text-align: right; white-space: nowrap; }
        .badge { display: inline-block; border: 1px solid; border-radius: 999px; padding: 4px 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
        .footer { margin-top: 22px; font-size: 11px; color: #737373; text-align: right; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="company">${escapeHtml(COMPANY_NAME)}</div>
        <h1>KPI History Report</h1>
        <p class="sub">Generated ${escapeHtml(fmtDate(todayISO()))}. This report groups KPI outcomes by month and shows target, final value, and outcome for each KPI.</p>
      </div>

      <div class="summary">
        <div class="summary-card">
          <div class="summary-label">Total KPIs</div>
          <div class="summary-value">${totals.total}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Completed</div>
          <div class="summary-value">${totals.completed}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Missed</div>
          <div class="summary-value">${totals.missed}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Removed</div>
          <div class="summary-value">${totals.removed}</div>
        </div>
      </div>

      ${Object.entries(grouped).map(([month, monthRows]) => `
        <section class="month-block">
          <div class="month-title">${escapeHtml(month)}</div>
          <table>
            <thead>
              <tr>
                <th style="width:18%;">KPI</th>
                <th style="width:12%;">Outcome</th>
                <th style="width:28%;">Period</th>
                <th style="width:14%;">Target</th>
                <th style="width:14%;">Final Value</th>
                <th style="width:14%;">Archived</th>
              </tr>
            </thead>
            <tbody>
              ${monthRows.map((row) => `
                <tr>
                  <td>${escapeHtml(row.title)}</td>
                  <td><span class="badge" style="${badgeTone(row.outcome)}">${escapeHtml(row.outcome)}</span></td>
                  <td>${escapeHtml(row.periodLabel)}</td>
                  <td class="num">${escapeHtml(formatSystemKpiValue(row.target, row.format))}</td>
                  <td class="num">${escapeHtml(formatSystemKpiValue(row.finalValue, row.format))}</td>
                  <td>${escapeHtml(fmtDate(row.archivedAt))}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </section>
      `).join("")}

      <div class="footer">${escapeHtml(COMPANY_NAME)} • KPI History Report</div>
    </body>
  </html>`;
}


function DynamicSystemKpiCard({
  title,
  target,
  current,
  format,
  scheduleLabel,
  scheduleWrap,
  scheduleBar,
  progress,
  periodLabel,
  completed,
  elapsedPercent,
  reviewNeeded,
  onOpen,
}: {
  title: string;
  target: number;
  current: number;
  format: SystemKpiOption["format"];
  scheduleLabel: string;
  scheduleWrap: string;
  scheduleBar: string;
  progress: number;
  periodLabel: string;
  completed: boolean;
  elapsedPercent: number;
  reviewNeeded: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={[
        "flex h-full min-h-[208px] w-full flex-col justify-between rounded-2xl border px-4 py-3 text-left shadow-sm transition",
        reviewNeeded ? "border-neutral-300 bg-neutral-100" : "border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-md",
      ].join(" ")}
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 pr-2">
            <div className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">{title}</div>
          </div>
          <div className={`flex h-8 min-w-[138px] shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-3 text-xs font-semibold leading-none ${scheduleWrap}`}>
            {scheduleLabel}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-neutral-400">Current</div>
            <div className="mt-1 text-[1.85rem] font-semibold leading-none text-neutral-900">{formatSystemKpiValue(current, format)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-neutral-400">Target</div>
            <div className="mt-1 text-[1.85rem] font-semibold leading-none text-neutral-700">{formatSystemKpiValue(target, format)}</div>
          </div>
        </div>

        <div className="mt-3 rounded-2xl bg-neutral-50 px-3 py-2.5">
          <div className="line-clamp-2 min-h-[30px] text-xs font-medium text-neutral-600">{periodLabel}</div>
          {!completed ? (
            <div className="mt-1 text-xs text-neutral-500">Time progress: {elapsedPercent.toFixed(1)}%</div>
          ) : (
            <div className="mt-1 text-xs text-neutral-600">Target achieved. Open card to review.</div>
          )}
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="font-medium text-neutral-500">Progress</span>
          <span className="font-semibold text-neutral-700">{Math.max(0, progress).toFixed(0)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-neutral-200">
          <div className={`h-full rounded-full ${scheduleBar}`} style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }} />
        </div>
      </div>
    </button>
  );
}

function modalBackdrop() {
  return "fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4";
}

function modalCard() {
  return "w-full max-w-5xl rounded-2xl border bg-white shadow-sm";
}

function inputClass() {
  return "w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-200";
}

function fieldLabel() {
  return "text-xs font-medium text-neutral-700";
}

function buttonClass(primary?: boolean) {
  return primary
    ? "rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white hover:opacity-95"
    : "rounded-xl border px-4 py-2 text-sm hover:bg-neutral-50";
}

function normalizeStatus(s: unknown) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function toNumber(x: unknown): number {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const n = Number(x.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function rowWriteOffFee(row: Record<string, any>): number {
  const raw = String(row.write_off_reason ?? "");
  const matches = Array.from(
    raw.matchAll(/write\s*off\s*fee\s*:\s*£?\s*([0-9]+(?:\.[0-9]+)?)/gi)
  );
  const lastMatch = matches[matches.length - 1];
  if (!lastMatch) return 0;
  const n = Number(lastMatch[1]);
  return Number.isFinite(n) ? n : 0;
}

function rowFbmShippingFee(row: Record<string, any>): number {
  return row.fbm_shipping_fee != null ? toNumber(row.fbm_shipping_fee) : toNumber(row.ship_fee);
}

function rowFbmShippingDate(row: Record<string, any>): Date | null {
  return parseDate(row.order_date ?? row.sold_date ?? row.sale_date ?? row.created_at);
}

function rowReturnFee(row: Record<string, any>): number {
  return (
    toNumber(row.return_shipping_fee) +
    toNumber(row.customer_return_fee) +
    toNumber(row.return_fee_from_customer) +
    toNumber(row.customer_return_charge) +
    toNumber(row.return_postage_charge)
  );
}

function rowReturnFeeDate(row: Record<string, any>): Date | null {
  return parseDate(
    row.returned_date ??
      row.return_date ??
      row.refunded_date ??
      row.refund_date ??
      row.updated_at ??
      row.created_at
  );
}
function moneyValue(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function rowMiles(row: Record<string, any>): number {
  const direct = firstNumber(row, ["miles", "mileage_miles", "business_miles", "distance_miles"]);
  if (direct > 0) return direct;

  const notes = String(row.notes ?? "");
  const match = notes.match(/Miles:\s*([0-9]+(?:\.[0-9]+)?)/i);
  return match ? toNumber(match[1]) : 0;
}

function isMileageCategory(row: Record<string, any>): boolean {
  const category = String(row.operational_category ?? "").trim().toLowerCase();
  const item = String(row.item ?? "").trim().toLowerCase();
  const notes = String(row.notes ?? "").toLowerCase();

  return (
    category === "mileage" ||
    category === "millage" ||
    item === "mileage claim" ||
    notes.includes("miles:")
  );
}

function firstNumber(row: Record<string, any>, keys: string[]): number {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(row, k)) {
      const v = toNumber(row[k]);
      if (v !== 0) return v;
    }
  }
  return 0;
}

function rowQty(row: Record<string, any>): number {
  const q = firstNumber(row, ["quantity", "qty", "units", "unit_qty", "sold_amount"]);
  return q > 0 ? Math.floor(q) : 0;
}

function rowItemCostTotal(row: Record<string, any>): number {
  const qty = rowQty(row);
  const unitCost = firstNumber(row, [
    "unit_cost",
    "cost",
    "purchase_price",
    "cost_price",
    "buy_cost",
    "price",
  ]);
  return moneyValue(unitCost * qty);
}

function rowVatTotal(row: Record<string, any>): number {
  return moneyValue(firstNumber(row, ["tax_amount"]));
}

function rowInboundShippingTotal(row: Record<string, any>): number {
  return moneyValue(firstNumber(row, ["shipping_cost"]));
}

function rowStoredTotalCost(row: Record<string, any>): number {
  return moneyValue(firstNumber(row, ["total_cost", "total_purchase_cost", "cost_total", "total"]));
}

function shipmentTaxTotal(row: Record<string, any>): number {
  return firstNumber(row, [
    "shipping_tax",
    "shipping_vat",
    "vat_amount",
    "tax_amount",
    "tax",
    "vat",
  ]);
}

function shipmentGrossTotal(row: Record<string, any>): number {
  return firstNumber(row, [
    "shipping_total",
    "shipment_total",
    "total_shipping",
    "total_cost",
    "total",
    "cost",
    "amount",
  ]);
}

function shipmentBaseShippingTotal(row: Record<string, any>): number {
  const directBase = firstNumber(row, [
    "shipping_charge",
    "shipping_cost",
    "shipment_cost",
    "courier_cost",
    "postage_cost",
    "delivery_cost",
    "transport_cost",
    "net_shipping",
    "shipping_subtotal",
  ]);
  if (directBase > 0) return directBase;

  const gross = shipmentGrossTotal(row);
  const tax = shipmentTaxTotal(row);
  if (gross > 0 && tax > 0) return Math.max(0, gross - tax);
  return gross;
}

function shipmentTotalWithTax(row: Record<string, any>): number {
  return moneyValue(shipmentBaseShippingTotal(row) + shipmentTaxTotal(row));
}

function rowValueAtCost(row: Record<string, any>): number {
  const storedTotal = rowStoredTotalCost(row);
  if (storedTotal > 0) return storedTotal;
  return moneyValue(rowItemCostTotal(row) + rowVatTotal(row) + rowInboundShippingTotal(row));
}

function rowTurnover(row: Record<string, any>): number {
  return firstNumber(row, ["sold_amount", "sale_amount"]);
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const raw = String(value).trim();
  const s = raw.slice(0, 10);

  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const d = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const ukMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ukMatch) {
    const d = new Date(Number(ukMatch[3]), Number(ukMatch[2]) - 1, Number(ukMatch[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : startOfDay(d);
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function getCurrentFyLabel(today = new Date()) {
  const year = today.getFullYear();
  const apr6 = new Date(year, 3, 6);
  return today >= apr6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function getNextFyLabel(label: string) {
  const [startYear] = label.split("-").map(Number);
  return `${startYear + 1}-${startYear + 2}`;
}

function isValidTaxYearLabel(label: string) {
  if (!/^\d{4}-\d{4}$/.test(label)) return false;
  const [startYear, endYear] = label.split("-").map(Number);
  return Number.isFinite(startYear) && Number.isFinite(endYear) && endYear === startYear + 1;
}

function getFyBounds(label: string) {
  const [a, b] = label.split("-").map(Number);
  return {
    start: new Date(a, 3, 6),
    end: new Date(b, 3, 5, 23, 59, 59, 999),
  };
}

function getRangeBounds(range: RangeKey, fyLabel: string) {
  const now = new Date();
  const today = startOfDay(now);

  if (range === "FY") return getFyBounds(fyLabel);
  if (range === "1D") return { start: today, end: new Date() };
  if (range === "7D") return { start: addDays(today, -6), end: new Date() };
  if (range === "4W") return { start: addDays(today, -27), end: new Date() };
  if (range === "LM") {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);
    return { start, end };
  }
  if (range === "CM") {
    return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: new Date() };
  }
  if (range === "6M") {
    return { start: new Date(today.getFullYear(), today.getMonth() - 5, 1), end: new Date() };
  }
  return { start: new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()), end: new Date() };
}

function inDateRange(date: Date | null, start: Date, end: Date) {
  if (!date) return false;
  return date >= start && date <= end;
}

function getRangeLabel(range: RangeKey) {
  switch (range) {
    case "1D":
      return "1 Day";
    case "7D":
      return "7 Days";
    case "4W":
      return "4 Weeks";
    case "LM":
      return "Last Month";
    case "CM":
      return "Current Month";
    case "6M":
      return "6 Months";
    case "1Y":
      return "1 Year";
    case "FY":
      return "Current Financial Year";
    default:
      return range;
  }
}

function isCapitalRow(row: Record<string, any>) {
  const taxTreatment = String(row.tax_treatment ?? "").trim().toLowerCase();
  const assetCategory = String(row.asset_category ?? "").trim().toLowerCase();
  return taxTreatment === "capital" || assetCategory.length > 0;
}

function isStockRow(row: Record<string, any>) {
  const taxTreatment = String(row.tax_treatment ?? "").trim().toLowerCase();
  if (!taxTreatment) return true;
  return taxTreatment === "stock" || taxTreatment === "direct_cost";
}

function expenseTaxTreatment(row: ExpenseRow & Record<string, any>) {
  if (row.is_capital) return "capital";
  if (row.is_allowable === false) return "revenue_disallowable";
  return "revenue_allowable";
}

function estimateCorporationTax(profit: number) {
  const p = Math.max(0, profit);
  if (p <= 50000) return p * 0.19;
  if (p >= 250000) return p * 0.25;
  const mainRateTax = p * 0.25;
  const marginalRelief = (250000 - p) * (3 / 200);
  return mainRateTax - marginalRelief;
}

function getFinancialYearMonths(label: string) {
  const [startYear, endYear] = label.split("-").map(Number);
  const months: Array<{ label: string; start: Date; end: Date }> = [];

  months.push({
    label: `Apr-${String(startYear).slice(-2)} (6-30)`,
    start: new Date(startYear, 3, 6),
    end: new Date(startYear, 3, 30, 23, 59, 59, 999),
  });

  for (let monthIndex = 4; monthIndex <= 11; monthIndex++) {
    const monthDate = new Date(startYear, monthIndex, 1);
    months.push({
      label: monthDate.toLocaleString("en-GB", { month: "short", year: "2-digit" }).replace(" ", "-"),
      start: new Date(startYear, monthIndex, 1),
      end: new Date(startYear, monthIndex + 1, 0, 23, 59, 59, 999),
    });
  }

  for (let monthIndex = 0; monthIndex <= 2; monthIndex++) {
    const monthDate = new Date(endYear, monthIndex, 1);
    months.push({
      label: monthDate.toLocaleString("en-GB", { month: "short", year: "2-digit" }).replace(" ", "-"),
      start: new Date(endYear, monthIndex, 1),
      end: new Date(endYear, monthIndex + 1, 0, 23, 59, 59, 999),
    });
  }

  months.push({
    label: `Apr-${String(endYear).slice(-2)} (1-5)`,
    start: new Date(endYear, 3, 1),
    end: new Date(endYear, 3, 5, 23, 59, 59, 999),
  });

  return months;
}

function getPreviousCalendarMonthBounds(date: Date) {
  return {
    start: new Date(date.getFullYear(), date.getMonth() - 1, 1),
    end: new Date(date.getFullYear(), date.getMonth(), 0, 23, 59, 59, 999),
  };
}

function monthCellClass() {
  return "px-4 py-3 text-center text-xs font-medium text-neutral-800";
}

function monthHeadClass() {
  return "px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-neutral-700";
}

function progressPercent(current: number, target: number) {
  if (target <= 0) return 0;
  return (current / target) * 100;
}

function exportRowsAsCsv(filename: string, rows: Array<[string, string, string, string]>) {
  if (typeof window === "undefined") return;

  const escapeCsv = (value: string) => {
    const safe = String(value ?? "");
    if (safe.includes('"') || safe.includes(",") || safe.includes("\n")) {
      return `"${safe.replace(/"/g, '""')}"`;
    }
    return safe;
  };

  const csv = [["Category", "Section", "Line", "Value"], ...rows]
    .map((row) => row.map((cell) => escapeCsv(cell)).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

function openPrintWindow(title: string, html: string) {
  if (typeof window === "undefined") return;

  const popup = window.open("", "_blank", "width=1080,height=900");
  if (!popup) return;

  try {
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
  } catch {
    return;
  }

  const waitForReady = () => {
    try {
      const doc = popup.document;
      const ready =
        doc.readyState === "complete" &&
        !!doc.body &&
        doc.body.innerHTML.trim().length > 0;

      if (!ready) {
        window.setTimeout(waitForReady, 150);
        return;
      }

      popup.focus();
      window.setTimeout(() => {
        try {
          popup.print();
        } catch {}
      }, 250);
    } catch {
      window.setTimeout(waitForReady, 150);
    }
  };

  window.setTimeout(waitForReady, 150);
}


function buildSimplePrintHtml(params: {
  title: string;
  subtitle: string;
  headers: string[];
  rows: string[][];
}) {
  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(params.title)}</title>
        <style>
          @page { size: A4 landscape; margin: 12mm; }
          * { box-sizing: border-box; }
          body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #171717; background: #f5f5f5; }
          .page { max-width: 1200px; margin: 0 auto; background: white; min-height: 100vh; padding: 24px; }
          .header { display:flex; justify-content:space-between; gap:24px; align-items:flex-start; border-bottom:2px solid #171717; padding-bottom:14px; }
          .company { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#525252; margin-bottom:8px; }
          .title { margin:0; font-size:26px; line-height:1.1; }
          .subtitle { margin-top:6px; font-size:13px; color:#525252; }
          .meta { text-align:right; font-size:12px; color:#525252; line-height:1.7; }
          table { width:100%; border-collapse:collapse; font-size:12px; border:1px solid #d4d4d4; margin-top:20px; }
          th { text-align:left; padding:9px 10px; border-bottom:1px solid #d4d4d4; background:#f5f5f5; color:#404040; font-weight:700; }
          td { padding:9px 10px; border-top:1px solid #e5e5e5; vertical-align:top; }
          td.num { text-align:right; white-space:nowrap; }
          .footer { margin-top:20px; padding-top:12px; border-top:1px solid #d4d4d4; display:flex; justify-content:space-between; gap:16px; font-size:11px; color:#525252; }
          @media print { body { background:#fff; } .page { max-width:none; min-height:auto; padding:0; } }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div>
              <div class="company">${escapeHtml(COMPANY_NAME)}</div>
              <h1 class="title">${escapeHtml(params.title)}</h1>
              <div class="subtitle">${escapeHtml(params.subtitle)}</div>
            </div>
            <div class="meta">
              <div>Generated: ${escapeHtml(fmtDate(todayISO()))}</div>
              <div>Prepared from dashboard performance data</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>${params.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
            </thead>
            <tbody>
              ${params.rows.map((row) => `<tr>${row.map((cell, idx) => `<td class="${idx > 0 ? "num" : ""}">${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}
            </tbody>
          </table>
          <div class="footer">
            <div>${escapeHtml(COMPANY_NAME)}</div>
            <div>${escapeHtml(params.title)}</div>
          </div>
        </div>
      </body>
    </html>`;
}

function totalStockValueFromRows(rows: PurchaseDashboardRow[]) {
  const agg = {
    awaiting_delivery: 0,
    sent_to_amazon: 0,
    processing: 0,
    selling: 0,
  };
  for (const row of rows) {
    const st = normalizeStatus(row.status);
    if (!(st in agg)) continue;
    const qty = rowQty(row);
    if (qty <= 0) continue;
    agg[st as keyof typeof agg] += rowValueAtCost(row);
  }
  return agg.awaiting_delivery + agg.sent_to_amazon + agg.processing + agg.selling;
}

function rowCreatedOrPurchaseDate(row: Record<string, any>) {
  return parseDate(row.purchase_date ?? row.created_at);
}

function rowAmazonCheckinDate(row: Record<string, any>) {
  return parseDate(
    row.checkin_date ??
      row.delivery_date ??
      row.received_date ??
      row.amazon_checkin_date ??
      row.fba_received_date ??
      row.received_at_amazon ??
      null
  );
}

function rowSoldOrRemovedDate(row: Record<string, any>) {
  return parseDate(
    row.order_date ??
      row.sold_date ??
      row.sale_date ??
      row.write_off_date ??
      row.written_off_date ??
      row.removed_date ??
      row.updated_at
  );
}

function stockValueAtDate(rows: PurchaseDashboardRow[], cutoff: Date) {
  return rows.reduce((sum, row) => {
    const acquired = rowCreatedOrPurchaseDate(row);
    if (!acquired || acquired > cutoff) return sum;

    const status = normalizeStatus(row.status);
    if (status === "sold" || status === "written_off") {
      const removed = rowSoldOrRemovedDate(row);
      if (removed && removed <= cutoff) return sum;
    }

    if (rowQty(row) <= 0) return sum;
    return sum + rowValueAtCost(row);
  }, 0);
}

function stockRowsHeldAtDate(rows: PurchaseDashboardRow[], cutoff: Date) {
  return rows.filter((row) => {
    const acquired = rowCreatedOrPurchaseDate(row);
    if (!acquired || acquired > cutoff) return false;

    const status = normalizeStatus(row.status);
    if (status === "sold" || status === "written_off") {
      const removed = rowSoldOrRemovedDate(row);
      if (removed && removed <= cutoff) return false;
    }

    return rowQty(row) > 0;
  });
}


function usePersistentState<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(defaultValue);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(key);
      if (saved != null) setValue(JSON.parse(saved) as T);
    } catch {}
    setLoaded(true);
  }, [key]);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value, loaded]);

  return [value, setValue] as const;
}

function usePersistentOpenState(key: string, defaultValue: boolean) {
  const [value, setValue] = useState(defaultValue);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(key);
      if (saved != null) setValue(saved === "true");
    } catch {}
    setLoaded(true);
  }, [key]);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(key, String(value));
    } catch {}
  }, [key, value, loaded]);

  return [value, setValue] as const;
}

function evaluateCustomKpiCurrent(
  currentValueType: string | null,
  currentValueManual: number | null,
  stats: {
    currentMonthProfit: number;
    currentMonthSales: number;
    currentMonthAvgROI: number;
    currentUnitsSold: number;
    totalPayouts: number;
    netProfit: number;
    totalStockValue: number;
    totalUnitsInStock: number;
  }
) {
  const t = normalizeStatus(currentValueType ?? "manual");
  switch (t) {
    case "monthly_profit":
      return stats.currentMonthProfit;
    case "monthly_sales":
      return stats.currentMonthSales;
    case "average_roi":
    case "avg_roi":
      return stats.currentMonthAvgROI;
    case "units_sold":
      return stats.currentUnitsSold;
    case "total_payouts":
      return stats.totalPayouts;
    case "net_profit":
      return stats.netProfit;
    case "stock_value":
      return stats.totalStockValue;
    case "stock_units":
      return stats.totalUnitsInStock;
    default:
      return Number(currentValueManual ?? 0);
  }
}

function trackingUrl(carrier: string | null, trackingNo: string | null) {
  const code = String(trackingNo ?? "").trim();
  if (!code) return null;

  const c = String(carrier ?? "").trim().toLowerCase();

  if (c.includes("ups") || code.startsWith("1Z")) {
    return `https://www.ups.com/track?track=yes&trackNums=${encodeURIComponent(code)}`;
  }

  if (c.includes("dpd") || /^[0-9]{12,14}$/.test(code)) {
    return `https://track.dpd.co.uk/parcel/${encodeURIComponent(code)}`;
  }

  if (
    c.includes("evri") ||
    c.includes("hermes") ||
    /^H[0-9A-Z]{10,}$/.test(code) ||
    /^00[0-9]{14,}$/.test(code)
  ) {
    return `https://www.evri.com/track/parcel/${encodeURIComponent(code)}`;
  }

  if (c.includes("royal") || c.includes("royalmail") || /^[A-Z]{2}[0-9]{9}GB$/.test(code)) {
    return `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(code)}`;
  }

  if (c.includes("fedex")) {
    return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(code)}`;
  }

  if (c.includes("dhl")) {
    return `https://www.dhl.com/gb-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(code)}`;
  }

  return null;
}

export default function DashboardPage() {
  const router = useRouter();
  const currentFyLabel = getCurrentFyLabel();
  const defaultTaxYearOptions = useMemo(() => {
    const [startYear] = currentFyLabel.split("-").map(Number);
    return [`${startYear - 1}-${startYear}`, currentFyLabel, `${startYear + 1}-${startYear + 2}`];
  }, [currentFyLabel]);

  const [range, setRange] = useState<RangeKey>("FY");
  const [selectedFyLabel, setSelectedFyLabel] = usePersistentState<string>(
    "dashboard_selected_fy_v1",
    currentFyLabel
  );
  const [hmrcDetailKey, setHmrcDetailKey] = useState<string | null>(null);
  const [filingPopupView, setFilingPopupView] = useState<null | "ct600" | "pl" | "balance_sheet">(null);
  const [hmrcPrototypeView, setHmrcPrototypeView] = useState<HmrcPrototypeView>("overview");
  const [prototypePlDetailKey, setPrototypePlDetailKey] = useState<PrototypePLCardKey | null>(null);

  const [realStockOpen, setRealStockOpen] = usePersistentOpenState("dashboard_real_stock_open", true);
  const [monthlyPerformanceOpen, setMonthlyPerformanceOpen] = usePersistentOpenState("dashboard_monthly_performance_open", true);
  const [hmrcOpen, setHmrcOpen] = usePersistentOpenState("dashboard_hmrc_open", true);
  const [hmrcWorkingOpen, setHmrcWorkingOpen] = usePersistentOpenState("dashboard_hmrc_working_open", true);
  const [hmrcPrototypeOpen, setHmrcPrototypeOpen] = usePersistentOpenState("dashboard_hmrc_prototype_open", true);
  const [hmrcPrototypePanel, setHmrcPrototypePanel] = useState<"hmrc" | "financials">("hmrc");
  const [targetKpisOpen, setTargetKpisOpen] = usePersistentOpenState("dashboard_target_kpis_open", true);
  const [monthlyPerformanceView, setMonthlyPerformanceView] = usePersistentState<"chart" | "table">(
    "dashboard_monthly_performance_view",
    "chart"
  );
  const [monthlyPerformanceScope, setMonthlyPerformanceScope] = usePersistentState<"monthly" | "yearly">(
    "dashboard_monthly_performance_scope",
    "monthly"
  );
  const [monthlyChartLines, setMonthlyChartLines] = usePersistentState<Record<string, boolean>>(
    "dashboard_monthly_chart_lines",
    {
      sales: true,
      profit: true,
      purchases: true,
      expenses: true,
      units: false,
      payouts: false,
      cogs: false,
    }
  );

  const [purchaseRows, setPurchaseRows] = useState<PurchaseDashboardRow[]>([]);
  const [shipmentRows, setShipmentRows] = useState<ShipmentAny[]>([]);
  const [allExpenseRows, setAllExpenseRows] = useState<ExpenseRow[]>([]);
  const [payoutRows, setPayoutRows] = useState<PayoutRow[]>([]);
  const [dashboardTargets, setDashboardTargets] = useState<DashboardTargetsRow | null>(null);
  const [customKpis, setCustomKpis] = useState<DashboardCustomKpiRow[]>([]);
  const [systemKpis, setSystemKpis] = usePersistentState<SavedSystemKpi[]>("dashboard_system_kpis_v3", []);
  const [systemKpiHistory, setSystemKpiHistory] = usePersistentState<SavedSystemKpiHistory[]>("dashboard_system_kpi_history_v1", []);
  const [systemKpiModalOpen, setSystemKpiModalOpen] = useState(false);
  const [systemKpiEditOpen, setSystemKpiEditOpen] = useState(false);
  const [systemKpiHistoryOpen, setSystemKpiHistoryOpen] = useState(false);
  const [activeSystemKpiDetailId, setActiveSystemKpiDetailId] = useState<string | null>(null);
  const [selectedSystemKpiKey, setSelectedSystemKpiKey] = useState<string>(SYSTEM_KPI_OPTIONS[0].key);
  const [selectedSystemKpiTarget, setSelectedSystemKpiTarget] = useState<string>("");
  const [selectedSystemKpiPeriodType, setSelectedSystemKpiPeriodType] = useState<SavedSystemKpi["periodType"]>("month");
  const [selectedSystemKpiStartDate, setSelectedSystemKpiStartDate] = useState<string>(todayISO());
  const [selectedSystemKpiTargetDate, setSelectedSystemKpiTargetDate] = useState<string>("");

  const [stockErr, setStockErr] = useState<string | null>(null);
  const [shipmentErr, setShipmentErr] = useState<string | null>(null);
  const [payoutErr, setPayoutErr] = useState<string | null>(null);
  const [financeErr, setFinanceErr] = useState<string | null>(null);
  const [financeRows, setFinanceRows] = useState<FinanceEntryRow[]>([]);

  const [stock, setStock] = useState(() => ({
    inbound: { units: 0, value: 0, hint: "On the way to Amazon" },
    home: { units: 0, value: 0, hint: "At home / processing" },
    outbound: { units: 0, value: 0, hint: "Created shipment" },
    selling: { units: 0, value: 0, hint: "Checked-in / active" },
    damaged: { units: 0, value: 0, hint: "Write-off / loss" },
    sold: { units: 0, value: 0, hint: "Units sold (not stock)" },
  }));

  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [addCatalogOpen, setAddCatalogOpen] = useState(false);
  const [catAsin, setCatAsin] = useState("");
  const [catBrand, setCatBrand] = useState("");
  const [catName, setCatName] = useState("");
  const [catBusy, setCatBusy] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);
  const [shopDropdownOpen, setShopDropdownOpen] = useState(false);
  const addPurchaseProductSearchRef = useRef<HTMLInputElement | null>(null);
  const addCatalogRef = useRef<HTMLInputElement | null>(null);


  const [ePurchaseDate, setEPurchaseDate] = useState(todayISO());
  const [eDeliveryDate, setEDeliveryDate] = useState("");
  const [eExpiryDate, setEExpiryDate] = useState("");
  const [eTrackingStr, setETrackingStr] = useState("");
  const [eQty, setEQty] = useState<number>(1);
  const [eUnitCostStr, setEUnitCostStr] = useState("0");
  const [eTaxStr, setETaxStr] = useState("0");
  const [eShippingStr, setEShippingStr] = useState("0");
  const [eDiscountType, setEDiscountType] = useState<DiscountType>("percent");
  const [eDiscountValueStr, setEDiscountValueStr] = useState("0");
  const [eShopStr, setEShopStr] = useState("");

  const [shipDetailOpen, setShipDetailOpen] = useState(false);
  const [shipDetailId, setShipDetailId] = useState<string | null>(null);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [checkinShipmentId, setCheckinShipmentId] = useState<string | null>(null);
  const [checkinDate, setCheckinDate] = useState(todayISO());
  const [checkinBusy, setCheckinBusy] = useState(false);


  const fetchFinanceRows = async () => {
    const directorTx = await supabase
      .from("director_transactions")
      .select("id, transaction_date, transaction_type, amount, description, reference, notes");

    if (!directorTx.error && (directorTx.data ?? []).length > 0) {
      setFinanceErr(null);
      return ((directorTx.data ?? []) as Record<string, any>[]).map((row) => ({
        id: row.id,
        entry_date: row.transaction_date ?? null,
        transaction_type: row.transaction_type ?? null,
        type: row.transaction_type ?? null,
        category: financeCategoryFromType(row.transaction_type),
        description: row.description ?? null,
        reference: row.reference ?? null,
        notes: row.notes ?? null,
        amount: safeNumber(row.amount),
        source_table: "director_transactions",
      })) as FinanceEntryRow[];
    }

    const normalizedSingleTable = async () => {
      const result = await supabase
        .from("finance_entries")
        .select("id,entry_date,date,finance_date,category,type,item,description,notes,amount");

      if (result.error) return { rows: [] as FinanceEntryRow[], error: result.error.message };

      const rows = ((result.data ?? []) as Record<string, any>[]).map((row) => ({
        ...row,
        amount: safeNumber(row.amount),
        category: String(row.category ?? row.type ?? ""),
        source_table: "finance_entries",
      })) as FinanceEntryRow[];

      return { rows, error: null as string | null };
    };

    const single = await normalizedSingleTable();
    if (!single.error) {
      setFinanceErr(null);
      return single.rows;
    }

    setFinanceErr(directorTx.error?.message ?? single.error ?? "No finance records found from the finance page source.");
    return [] as FinanceEntryRow[];
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login");
    });
  }, [router]);

  useEffect(() => {
    const readStoredTaxYear = () => {
      if (typeof window === "undefined") return null;
      const raw = window.localStorage.getItem("dashboard_selected_fy_v1");
      if (raw == null) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    };

    const savedTaxYear = readStoredTaxYear();
    const nextTaxYear = savedTaxYear && isValidTaxYearLabel(savedTaxYear) ? savedTaxYear : currentFyLabel;

    if (nextTaxYear !== selectedFyLabel) {
      setSelectedFyLabel(nextTaxYear);
      setRange("FY");
    }

    const onTaxYearChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ taxYear?: string }>;
      const rawTaxYear = customEvent.detail?.taxYear || readStoredTaxYear() || currentFyLabel;
      const changedTaxYear = rawTaxYear && isValidTaxYearLabel(rawTaxYear) ? rawTaxYear : currentFyLabel;

      setSelectedFyLabel(changedTaxYear);
      setRange("FY");
    };

    window.addEventListener("dashboard-tax-year-change", onTaxYearChange as EventListener);
    return () => window.removeEventListener("dashboard-tax-year-change", onTaxYearChange as EventListener);
  }, [currentFyLabel, selectedFyLabel, setSelectedFyLabel]);

  useEffect(() => {
    if (addOpen) addPurchaseProductSearchRef.current?.focus();
  }, [addOpen]);

  useEffect(() => {
    if (addCatalogOpen) addCatalogRef.current?.focus();
  }, [addCatalogOpen]);
  useEffect(() => {
    if (!prototypePlDetailKey) return;

    const onPrototypeCardKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setPrototypePlDetailKey(null);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("keydown", onPrototypeCardKeyDown);
    return () => window.removeEventListener("keydown", onPrototypeCardKeyDown);
  }, [prototypePlDetailKey]);

  useEffect(() => {
    const anyGeneralOverlayOpen =
      editOpen ||
      shipDetailOpen ||
      !!hmrcDetailKey ||
      !!filingPopupView ||
      !!prototypePlDetailKey ||
      checkinOpen;

    if (!anyGeneralOverlayOpen) return;

    const onGeneralOverlayKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = (target?.tagName || "").toLowerCase();
      if (tag === "textarea") return;

      if (event.key === "Escape") {
        event.preventDefault();

        if (checkinOpen && !checkinBusy) {
          setCheckinOpen(false);
          return;
        }
        if (prototypePlDetailKey) {
          setPrototypePlDetailKey(null);
          return;
        }
        if (shipDetailOpen) {
          setShipDetailOpen(false);
          return;
        }
        if (hmrcDetailKey) {
          setHmrcDetailKey(null);
          return;
        }
        if (filingPopupView) {
          setFilingPopupView(null);
          return;
        }
        if (editOpen) {
          setEditOpen(false);
          return;
        }
      }

      if (event.key === "Enter") {
        if (checkinOpen) {
          event.preventDefault();
          if (!checkinBusy) confirmShipmentDelivered();
          return;
        }

        if (editOpen) {
          event.preventDefault();
          saveEdit();
          return;
        }

        if (prototypePlDetailKey || shipDetailOpen || hmrcDetailKey || filingPopupView) {
          event.preventDefault();
          event.stopPropagation();
        }
      }
    };

    window.addEventListener("keydown", onGeneralOverlayKeyDown);
    return () => window.removeEventListener("keydown", onGeneralOverlayKeyDown);
  }, [
    editOpen,
    shipDetailOpen,
    hmrcDetailKey,
    filingPopupView,
    prototypePlDetailKey,
    checkinOpen,
    checkinBusy,
    checkinDate,
  ]);

  useEffect(() => {
    if (!addOpen && !addCatalogOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (addCatalogOpen) {
          setAddCatalogOpen(false);
          return;
        }
        if (addOpen) {
          setShopDropdownOpen(false);
          setTaxYearDropdownOpen(false);
          setAddOpen(false);
          return;
        }
      }

      if (event.key === "Enter") {
        const target = event.target as HTMLElement | null;
        const tag = (target?.tagName || "").toLowerCase();
        if (tag === "textarea") return;

        if (addCatalogOpen) {
          event.preventDefault();
          createCatalogProductFromInventory();
          return;
        }

        if (addOpen && selectedProductId) {
          event.preventDefault();
          createPurchase();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [addOpen, addCatalogOpen, selectedProductId, catAsin, catBrand, catName, ePurchaseDate, eDeliveryDate, eExpiryDate, eShopStr, eTrackingStr, eQty, eUnitCostStr, eTaxStr, eShippingStr, eDiscountType, eDiscountValueStr]);

  async function loadProductsForPopup() {
    if (!addOpen) return;

    let q = supabase
      .from("products")
      .select("id, asin, brand, product_name, product_code")
      .order("product_code", { ascending: false });

    if (!productQuery.trim()) {
      const { data, error } = await q.limit(5);
      if (!error) setProducts((data ?? []) as ProductRow[]);
      return;
    }

    const text = productQuery.trim();
    const numeric = Number(text);

    if (Number.isFinite(numeric)) {
      const { data, error } = await q.eq("product_code", numeric).limit(5);
      if (!error) setProducts((data ?? []) as ProductRow[]);
      return;
    }

    const { data, error } = await q
      .or(`asin.ilike.%${text}%,brand.ilike.%${text}%,product_name.ilike.%${text}%`)
      .limit(5);

    if (!error) setProducts((data ?? []) as ProductRow[]);
  }

  useEffect(() => {
    const anyKpiOverlayOpen =
      systemKpiModalOpen || systemKpiEditOpen || !!activeSystemKpiDetailId || systemKpiHistoryOpen;

    if (!anyKpiOverlayOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (systemKpiEditOpen) {
          setSystemKpiEditOpen(false);
          return;
        }
        if (systemKpiModalOpen) {
          setSystemKpiModalOpen(false);
          return;
        }
        if (activeSystemKpiDetailId) {
          setActiveSystemKpiDetailId(null);
          return;
        }
        if (systemKpiHistoryOpen) {
          setSystemKpiHistoryOpen(false);
          return;
        }
      }

      if (event.key === "Enter" && (systemKpiModalOpen || systemKpiEditOpen)) {
        const target = event.target as HTMLElement | null;
        const tag = (target?.tagName || "").toLowerCase();
        if (tag === "textarea") return;
        event.preventDefault();
        if (systemKpiEditOpen) saveEditedSystemKpi();
        else addSystemKpi();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    systemKpiModalOpen,
    systemKpiEditOpen,
    activeSystemKpiDetailId,
    systemKpiHistoryOpen,
    selectedSystemKpiKey,
    selectedSystemKpiTarget,
    selectedSystemKpiPeriodType,
    selectedSystemKpiStartDate,
    selectedSystemKpiTargetDate,
  ]);

  useEffect(() => {
    loadProductsForPopup();
  }, [addOpen, productQuery]);

  useEffect(() => {
    (async () => {
      const purchases = await supabase
        .from("purchases")
        .select(`*, product:products(id, asin, brand, product_name, product_code)`);

      if (purchases.error) {
        setStockErr(purchases.error.message);
        setPurchaseRows([]);
      } else {
        setStockErr(null);
        setPurchaseRows((purchases.data ?? []) as PurchaseDashboardRow[]);
      }

      const shipments = await supabase
        .from("shipments")
        .select("*")
        .order("created_at", { ascending: false });

      if (shipments.error) {
        setShipmentErr(shipments.error.message);
        setShipmentRows([]);
      } else {
        setShipmentErr(null);
        setShipmentRows((shipments.data ?? []) as ShipmentAny[]);
      }

      const expAll = await supabase
        .from("expenses")
        .select("id,expense_date,operational_category,item,amount,is_allowable,is_capital,notes")
        .order("expense_date", { ascending: false });

      if (expAll.error) {
        setAllExpenseRows([]);
      } else {
        setAllExpenseRows((expAll.data ?? []) as ExpenseRow[]);
      }

      const payouts = await supabase
        .from("payouts")
        .select("id,payout_date,reference,amount")
        .order("payout_date", { ascending: false });

      if (payouts.error) {
        setPayoutErr(payouts.error.message);
        setPayoutRows([]);
      } else {
        setPayoutErr(null);
        setPayoutRows((payouts.data ?? []) as PayoutRow[]);
      }

      const finance = await fetchFinanceRows();
      setFinanceRows(finance);

      setDashboardTargets(null);
      setCustomKpis([]);
    })();
  }, []);

  useEffect(() => {
    const agg = {
      awaiting_delivery: { units: 0, value: 0 },
      sent_to_amazon: { units: 0, value: 0 },
      processing: { units: 0, value: 0 },
      selling: { units: 0, value: 0 },
      sold: { units: 0, value: 0 },
      written_off: { units: 0, value: 0 },
    };

    for (const r of purchaseRows) {
      const st = normalizeStatus(r?.status);
      if (!(st in agg)) continue;
      const qty = rowQty(r);
      if (qty <= 0) continue;
      const totalValue = rowValueAtCost(r);
      (agg as any)[st].units += qty;
      (agg as any)[st].value += totalValue;
    }

    setStock((prev) => ({
      ...prev,
      inbound: { ...prev.inbound, units: agg.awaiting_delivery.units, value: agg.awaiting_delivery.value },
      outbound: { ...prev.outbound, units: agg.sent_to_amazon.units, value: agg.sent_to_amazon.value },
      home: { ...prev.home, units: agg.processing.units, value: agg.processing.value },
      selling: { ...prev.selling, units: agg.selling.units, value: agg.selling.value },
      damaged: { ...prev.damaged, units: agg.written_off.units, value: agg.written_off.value },
      sold: { ...prev.sold, units: agg.sold.units, value: agg.sold.value },
    }));
  }, [purchaseRows]);

  const fyLabel = isValidTaxYearLabel(selectedFyLabel) ? selectedFyLabel : currentFyLabel;
  const fyBounds = useMemo(() => getFyBounds(fyLabel), [fyLabel]);
  const prevFyLabel = useMemo(() => {
    const [startYear] = fyLabel.split("-").map(Number);
    return Number.isFinite(startYear) ? `${startYear - 1}-${startYear}` : getCurrentFyLabel();
  }, [fyLabel]);
  const prevFyBounds = useMemo(() => getFyBounds(prevFyLabel), [prevFyLabel]);
  const rangeBounds = useMemo(() => getRangeBounds(range, fyLabel), [fyLabel, range]);

  const activePurchaseRows = useMemo(
    () =>
      purchaseRows.filter((row) =>
        inDateRange(parseDate(row.purchase_date ?? row.created_at), rangeBounds.start, rangeBounds.end)
      ),
    [purchaseRows, rangeBounds]
  );

  const activeSoldRows = useMemo(
    () =>
      purchaseRows.filter(
        (row) =>
          normalizeStatus(row.status) === "sold" &&
          inDateRange(parseDate(row.order_date ?? row.created_at), rangeBounds.start, rangeBounds.end)
      ),
    [purchaseRows, rangeBounds]
  );

  const activeWrittenOffRows = useMemo(
    () =>
      purchaseRows.filter(
        (row) =>
          normalizeStatus(row.status) === "written_off" &&
          inDateRange(
            parseDate(
              row.write_off_date ??
                row.written_off_date ??
                row.removed_date ??
                row.updated_at ??
                row.created_at
            ),
            rangeBounds.start,
            rangeBounds.end
          )
      ),
    [purchaseRows, rangeBounds]
  );

  const activeWriteOffFeeRows = useMemo(
    () =>
      purchaseRows.filter(
        (row) =>
          rowWriteOffFee(row) > 0 &&
          inDateRange(parseDate(row.write_off_date ?? row.created_at), rangeBounds.start, rangeBounds.end)
      ),
    [purchaseRows, rangeBounds]
  );

  const activeReturnFeeRows = useMemo(
    () =>
      purchaseRows.filter(
        (row) =>
          rowReturnFee(row) > 0 &&
          inDateRange(rowReturnFeeDate(row), rangeBounds.start, rangeBounds.end)
      ),
    [purchaseRows, rangeBounds]
  );

  const activeFbmShippingFeeRows = useMemo(
    () =>
      purchaseRows.filter(
        (row) =>
          rowFbmShippingFee(row) > 0 &&
          inDateRange(rowFbmShippingDate(row), rangeBounds.start, rangeBounds.end)
      ),
    [purchaseRows, rangeBounds]
  );

  const activeExpenseRows = useMemo(
    () =>
      allExpenseRows.filter((row) =>
        inDateRange(parseDate(row.expense_date), rangeBounds.start, rangeBounds.end)
      ),
    [allExpenseRows, rangeBounds]
  );

  const activeShipmentRows = useMemo(
    () =>
      shipmentRows.filter((row) =>
        inDateRange(
          parseDate(row.shipment_date ?? row.sent_date ?? row.shipped_date ?? row.created_at),
          rangeBounds.start,
          rangeBounds.end
        )
      ),
    [shipmentRows, rangeBounds]
  );

  const activeFinanceRows = useMemo(() => {
    return financeRows.filter((row) => {
      const rowDate = parseDate(row.entry_date ?? row.date ?? row.finance_date ?? row.created_at);
      return inDateRange(rowDate, rangeBounds.start, rangeBounds.end);
    });
  }, [financeRows, rangeBounds]);

  const prototypeFixedAssetBreakdown = useMemo(() => {
    const grouped = new Map<string, number>();

    activeExpenseRows
      .filter((row) => String(row.operational_category ?? "").trim().toLowerCase() === "equipment")
      .forEach((row) => {
        const key = String(row.operational_category ?? "Equipment").trim() || "Equipment";
        grouped.set(key, (grouped.get(key) ?? 0) + toNumber(row.amount));
      });

    return Array.from(grouped.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [activeExpenseRows]);

  const prototypeExpenseBreakdown = useMemo<PrototypeExpenseBreakdownRow[]>(() => {
    const grouped = new Map<string, PrototypeExpenseBreakdownRow>();
    const addRow = (
      sourcePage: string,
      mainCategory: string,
      subCategory: string,
      value: number,
      miles?: number
    ) => {
      if (value === 0) return;
      const key = `${sourcePage}__${mainCategory}__${subCategory}`;
      const existing = grouped.get(key);
      grouped.set(key, {
        sourcePage,
        mainCategory,
        subCategory,
        value: (existing?.value ?? 0) + value,
        miles: (existing?.miles ?? 0) + (miles ?? 0),
      });
    };

    const amazonFeesTotal = activeSoldRows.reduce((sum, row) => sum + toNumber(row.amazon_fees), 0);
    const miscProductCostTotal =
      activeSoldRows.reduce((sum, row) => sum + toNumber(row.misc_fees), 0) +
      activePurchaseRows
        .filter((row) => normalizeStatus(row.status) !== "sold")
        .reduce((sum, row) => sum + toNumber(row.misc_fees), 0);
    const shippingTotal = activeShipmentRows.reduce((sum, row) => sum + shipmentBaseShippingTotal(row), 0);
    const shippingTaxTotal = activeShipmentRows.reduce((sum, row) => sum + shipmentTaxTotal(row), 0);
    const customerReturnFeeTotal = activeReturnFeeRows.reduce((sum, row) => sum + rowReturnFee(row), 0);
    const fbmShippingFeeTotal = activeFbmShippingFeeRows.reduce((sum, row) => sum + rowFbmShippingFee(row), 0);
    const writeOffTotal = activeWriteOffFeeRows.reduce((sum, row) => sum + rowWriteOffFee(row), 0);
    const loanInterestTotal = activeFinanceRows
      .filter(isLoanInterestFinanceRow)
      .reduce((sum, row) => sum + safeNumber(row.amount), 0);

    addRow("Products Page", "Products", "Amazon fees", amazonFeesTotal);
    addRow("Products Page", "Products", "Miscellaneous product cost", miscProductCostTotal);
    addRow("Shipping Page", "Shipping", "Shipping", shippingTotal);
    addRow("Shipping Page", "Shipping", "Shipping Tax", shippingTaxTotal);
    addRow("Inventory Page", "Inventory", "Customer Return Fee", customerReturnFeeTotal);
    addRow("Inventory Page", "Inventory", "FBM Shipment Fee", fbmShippingFeeTotal);
    addRow("Inventory Page", "Inventory", "Write Off", writeOffTotal);
    addRow("Finance Page", "Finance", "Loan Interest", loanInterestTotal);

    activeExpenseRows
      .filter((row) => String(row.operational_category ?? "").trim().toLowerCase() !== "equipment")
      .forEach((row) => {
        const amount = toNumber(row.amount);

        if (isMileageCategory(row)) {
          addRow("Expenses Page", "Expenses", "Mileage", amount, rowMiles(row));
          return;
        }

        const label = String(row.operational_category ?? "Other").trim() || "Other";
        addRow("Expenses Page", "Expenses", label, amount);
      });

    return Array.from(grouped.values()).sort((a, b) => {
      if (a.sourcePage !== b.sourcePage) return a.sourcePage.localeCompare(b.sourcePage);
      if (a.mainCategory !== b.mainCategory) return a.mainCategory.localeCompare(b.mainCategory);
      return b.value - a.value;
    });
  }, [activeExpenseRows, activeFinanceRows, activePurchaseRows, activeShipmentRows, activeSoldRows, activeWriteOffFeeRows, activeReturnFeeRows, activeFbmShippingFeeRows]);

  const prototypePlCards = useMemo<Record<PrototypePLCardKey, PrototypePLCardData>>(() => {
    const sales = activeSoldRows.reduce((sum, row) => sum + rowTurnover(row), 0);
    const itemCostTotal = activePurchaseRows.reduce(
      (sum, row) => sum + rowItemCostTotal(row),
      0
    );
    const vatTotal = activePurchaseRows.reduce((sum, row) => sum + rowVatTotal(row), 0);
    const inboundShippingTotal = activePurchaseRows.reduce(
      (sum, row) => sum + rowInboundShippingTotal(row),
      0
    );
    const cogs = activePurchaseRows.reduce((sum, row) => sum + rowValueAtCost(row), 0);
    const fixedAssets = activeExpenseRows
      .filter((row) => String(row.operational_category ?? "").trim().toLowerCase() === "equipment")
      .reduce((sum, row) => sum + toNumber(row.amount), 0);
    const amazonFees = activeSoldRows.reduce((sum, row) => sum + toNumber(row.amazon_fees), 0);
    const miscProductCost =
      activeSoldRows.reduce((sum, row) => sum + toNumber(row.misc_fees), 0) +
      activePurchaseRows
        .filter((row) => normalizeStatus(row.status) !== "sold")
        .reduce((sum, row) => sum + toNumber(row.misc_fees), 0);
    const shippingRunningCost = activeShipmentRows.reduce((sum, row) => sum + shipmentBaseShippingTotal(row), 0);
    const shippingTaxRunningCost = activeShipmentRows.reduce((sum, row) => sum + shipmentTaxTotal(row), 0);
    const customerReturnFee = activeReturnFeeRows.reduce((sum, row) => sum + rowReturnFee(row), 0);
    const fbmShippingFee = activeFbmShippingFeeRows.reduce((sum, row) => sum + rowFbmShippingFee(row), 0);
    const writeOffCost = activeWriteOffFeeRows.reduce((sum, row) => sum + rowWriteOffFee(row), 0);
    const loanInterestCost = activeFinanceRows
      .filter(isLoanInterestFinanceRow)
      .reduce((sum, row) => sum + safeNumber(row.amount), 0);
    const otherOperatingCost = activeExpenseRows
      .filter((row) => String(row.operational_category ?? "").trim().toLowerCase() !== "equipment")
      .reduce((sum, row) => sum + toNumber(row.amount), 0);
    const operatingCost =
      amazonFees +
      miscProductCost +
      shippingRunningCost +
      shippingTaxRunningCost +
      customerReturnFee +
      fbmShippingFee +
      writeOffCost +
      loanInterestCost +
      otherOperatingCost;
    const grossProfit = sales - cogs;
    const finalProfit = grossProfit - operatingCost;

    return {
      sales: {
        key: "sales",
        title: "Sales",
        value: sales,
        sub: "Sold price per item total",
        lines: [
          { label: "Sold rows in range", value: activeSoldRows.length },
          { label: "Sold price total", value: sales },
        ],
        footer: "Hard-wired rule: Sales = sum of sold price per sold item in the selected range.",
      },
      cogs: {
        key: "cogs",
        title: "Cost of Goods",
        value: cogs,
        sub: "All purchases in selected tax year",
        lines: [
          { label: "Item cost total", value: itemCostTotal, negative: true },
          { label: "VAT total", value: vatTotal, negative: true },
          { label: "Inbound shipping total", value: inboundShippingTotal, negative: true },
          { label: "Items purchased in selected tax year", value: activePurchaseRows.length, isCount: true },
          { label: "Total cost of goods", value: cogs, negative: true },
        ],
        footer: "Hard-wired rule: Cost of Goods = all purchases in the selected tax year (item cost + VAT + inbound shipping), regardless of status.",
      },
      fixed_assets: {
        key: "fixed_assets",
        title: "Fixed Assets",
        value: fixedAssets,
        sub: "Equipment only",
        lines:
          prototypeFixedAssetBreakdown.length > 0
            ? [
                ...prototypeFixedAssetBreakdown.map((row) => ({
                  label: row.label,
                  value: row.value,
                  negative: true,
                })),
                { label: "Total fixed assets", value: fixedAssets, negative: true },
              ]
            : [{ label: "No equipment rows found", value: 0 }],
        footer: "Hard-wired rule: only the Equipment operational category goes under Fixed Assets.",
      },
      expenses: {
        key: "expenses",
        title: "Business Running Expenses",
        value: operatingCost,
        sub: "Grouped by source page with shipping, shipping tax, and write-off split out",
        lines:
          prototypeExpenseBreakdown.length > 0
            ? (() => {
                const built: PrototypePLCardLine[] = [];
                const pageOrder = Array.from(new Set<string>(prototypeExpenseBreakdown.map((row) => row.sourcePage)));
                pageOrder.forEach((sourcePage) => {
                  const sourceRows = prototypeExpenseBreakdown.filter((row) => row.sourcePage === sourcePage);
                  const sourceTotal = sourceRows.reduce((sum, row) => sum + row.value, 0);
                  built.push({ label: sourcePage, value: sourceTotal, negative: true, isSection: true });
                  sourceRows.forEach((row) => {
                    built.push({
                      label:
                        typeof row.miles === "number" && row.miles > 0
                          ? `${row.subCategory} (${row.miles.toFixed(0)} miles)`
                          : row.subCategory,
                      value: row.value,
                      negative: true,
                      indentLevel: 1,
                    });
                  });
                });
                return built;
              })()
            : [{ label: "No operating cost rows found", value: 0 }],
        footer: "Business Running Expenses are now grouped by source page. Products Page contributes Amazon fees and miscellaneous product costs, Shipping Page contributes Shipping and Shipping Tax, Inventory Page contributes Customer Return Fee, FBM Shipment Fee, and Write Off, and Expenses Page contributes all non-Equipment expense rows inside the selected range.",
      },
      final_pl: {
        key: "final_pl",
        title: "Final P&L",
        value: finalProfit,
        sub: "Sales - COG - business running expenses",
        lines: [
          { label: "Sales", value: sales },
          { label: "Cost of goods", value: cogs, negative: true },
          { label: "Gross profit", value: grossProfit },
          { label: "Business running expenses", value: operatingCost, negative: true },
          { label: "Net profit / loss", value: finalProfit },
        ],
        footer: "Net profit / loss = Sales - Cost of goods - Business running expenses.",
      },
    };
  }, [activeExpenseRows, activeFinanceRows, activeShipmentRows, activeSoldRows, activeWriteOffFeeRows, activePurchaseRows, activeReturnFeeRows, activeFbmShippingFeeRows, prototypeExpenseBreakdown, prototypeFixedAssetBreakdown]);

  const prototypePlCardList = useMemo(
    () => [
      prototypePlCards.sales,
      prototypePlCards.cogs,
      prototypePlCards.fixed_assets,
      prototypePlCards.expenses,
      prototypePlCards.final_pl,
    ],
    [prototypePlCards]
  );

  const activePrototypePlCard = prototypePlDetailKey ? prototypePlCards[prototypePlDetailKey] : null;

  const activePayoutRows = useMemo(
    () =>
      payoutRows.filter((row) =>
        inDateRange(parseDate(row.payout_date), rangeBounds.start, rangeBounds.end)
      ),
    [payoutRows, rangeBounds]
  );

  const fyExpenseRows = useMemo(
    () =>
      allExpenseRows.filter((row) =>
        inDateRange(parseDate(row.expense_date), fyBounds.start, fyBounds.end)
      ),
    [allExpenseRows, fyBounds]
  );

  const monthlyPerformanceRows = useMemo(() => {
    const months = getFinancialYearMonths(fyLabel);

    return months.map((month, index) => {
      const soldRows = purchaseRows.filter((row) => {
        if (normalizeStatus(row.status) !== "sold") return false;
        return inDateRange(parseDate(row.order_date ?? row.created_at), month.start, month.end);
      });

      const writeOffRows = purchaseRows.filter((row) => {
        if (rowWriteOffFee(row) <= 0) return false;
        return inDateRange(parseDate(row.write_off_date ?? row.written_off_date ?? row.removed_date ?? row.updated_at ?? row.created_at), month.start, month.end);
      });

      const returnFeeRows = purchaseRows.filter((row) => {
        if (rowReturnFee(row) <= 0) return false;
        return inDateRange(rowReturnFeeDate(row), month.start, month.end);
      });

      const fbmShippingRows = purchaseRows.filter((row) => {
        if (rowFbmShippingFee(row) <= 0) return false;
        return inDateRange(rowFbmShippingDate(row), month.start, month.end);
      });

      const payoutRowsForMonth = payoutRows.filter((row) =>
        inDateRange(parseDate(row.payout_date), month.start, month.end)
      );

      const unitsSold = soldRows.reduce((sum, row) => sum + Math.max(1, rowQty(row)), 0);
      const purchaseRowsForMonth = purchaseRows.filter((row) =>
        inDateRange(parseDate(row.purchase_date ?? row.created_at), month.start, month.end)
      );
      const shipmentRowsForMonth = shipmentRows.filter((row) =>
        inDateRange(parseDate(row.shipment_date ?? row.sent_date ?? row.shipped_date ?? row.created_at), month.start, month.end)
      );

      const amazonFees = moneyValue(soldRows.reduce((sum, row) => sum + toNumber(row.amazon_fees), 0));
      const productCost = moneyValue(
        purchaseRowsForMonth.reduce((sum, row) => sum + rowValueAtCost(row), 0)
      );
      const shipments = moneyValue(shipmentRowsForMonth.reduce((sum, row) => sum + shipmentTotalWithTax(row), 0) + fbmShippingRows.reduce((sum, row) => sum + rowFbmShippingFee(row), 0));
      const refunds = moneyValue(
        soldRows.reduce(
          (sum, row) =>
            sum +
            toNumber(row.refund_amount) +
            toNumber(row.refunded_amount),
          0
        ) + returnFeeRows.reduce((sum, row) => sum + rowReturnFee(row), 0)
      );
      const writeOff = moneyValue(writeOffRows.reduce((sum, row) => sum + rowWriteOffFee(row), 0));
      const miscPurchaseRowsForMonth = purchaseRowsForMonth.filter((row) => normalizeStatus(row.status) !== "sold");
      const misc =
        soldRows.reduce((sum, row) => sum + toNumber(row.misc_fees), 0) +
        miscPurchaseRowsForMonth.reduce((sum, row) => sum + toNumber(row.misc_fees), 0);
      const expenseRowsForMonth = allExpenseRows.filter((row) =>
        inDateRange(parseDate(row.expense_date), month.start, month.end)
      );
      const loanInterestRowsForMonth = financeRows.filter((row) => {
        if (!isLoanInterestFinanceRow(row)) return false;
        return inDateRange(parseDate(row.entry_date ?? row.date ?? row.finance_date ?? row.created_at), month.start, month.end);
      });
      const loanInterestExpensesForMonth = loanInterestRowsForMonth.reduce(
        (sum, row) => sum + safeNumber(row.amount),
        0
      );
      const expenses = moneyValue(
        expenseRowsForMonth.reduce((sum, row) => sum + toNumber(row.amount), 0) + loanInterestExpensesForMonth
      );
      const fixedAssets = 0;
      const sales = soldRows.reduce((sum, row) => sum + toNumber(row.sold_amount), 0);
      const amzPayout =
        soldRows.reduce((sum, row) => sum + toNumber(row.amazon_payout), 0) ||
        payoutRowsForMonth.reduce((sum, row) => sum + toNumber(row.amount), 0);

      const totalCost = moneyValue(amazonFees + productCost + shipments + refunds + writeOff + misc + expenses);
      const profitLoss = moneyValue(sales - totalCost);
      const roi = totalCost > 0 ? (profitLoss / totalCost) * 100 : null;

      const comparisonBounds = index > 0 ? months[index - 1] : getPreviousCalendarMonthBounds(month.start);
      const prevSales = purchaseRows
        .filter(
          (row) =>
            normalizeStatus(row.status) === "sold" &&
            inDateRange(parseDate(row.order_date ?? row.created_at), comparisonBounds.start, comparisonBounds.end)
        )
        .reduce((sum, row) => sum + toNumber(row.sold_amount), 0);

      let salesMoM: number | null = null;
      if (prevSales === 0) salesMoM = sales > 0 ? 100 : 0;
      else salesMoM = ((sales - prevSales) / prevSales) * 100;

      return {
        month: month.label,
        unitsSold,
        amazonFees,
        productCost,
        shipments,
        refunds,
        writeOff,
        misc,
        expenses,
        fixedAssets,
        totalCost,
        sales,
        profitLoss,
        roi,
        salesMoM,
        amzPayout,
      };
    });
  }, [allExpenseRows, financeRows, fyLabel, payoutRows, purchaseRows, shipmentRows]);

  const profitTrendData = useMemo(
    () =>
      monthlyPerformanceRows.map((row) => ({
        month: row.month,
        sales: Number(row.sales.toFixed(2)),
        profit: Number(row.profitLoss.toFixed(2)),
        purchases: Number(row.productCost.toFixed(2)),
        expenses: Number((row.amazonFees + row.shipments + row.refunds + row.writeOff + row.misc + row.expenses).toFixed(2)),
        units: row.unitsSold,
        payouts: Number(row.amzPayout.toFixed(2)),
        cogs: Number(row.totalCost.toFixed(2)),
      })),
    [monthlyPerformanceRows]
  );

  const monthlyChartSeries = useMemo(
    () => [
      { key: "sales", name: "Sales", stroke: "#171717" },
      { key: "profit", name: "Profit", stroke: "#16a34a" },
      { key: "purchases", name: "Purchases", stroke: "#2563eb" },
      { key: "expenses", name: "Expenses", stroke: "#dc2626" },
      { key: "units", name: "Units Sold", stroke: "#7c3aed", yAxisId: "right" as const },
      { key: "payouts", name: "Payouts", stroke: "#ea580c" },
      { key: "cogs", name: "Cost of Sales", stroke: "#0891b2" },
    ],
    []
  );

  const yearlyPerformanceSummary = useMemo(() => {
    const totals = monthlyPerformanceRows.reduce(
      (acc, row) => {
        acc.unitsSold += row.unitsSold;
        acc.amazonFees += row.amazonFees;
        acc.productCost += row.productCost;
        acc.shipments += row.shipments;
        acc.refunds += row.refunds;
        acc.writeOff += row.writeOff;
        acc.misc += row.misc;
        acc.expenses += row.expenses;
        acc.fixedAssets += row.fixedAssets;
        acc.totalCost += row.totalCost;
        acc.sales += row.sales;
        acc.profitLoss += row.profitLoss;
        acc.amzPayout += row.amzPayout;
        return acc;
      },
      {
        unitsSold: 0,
        amazonFees: 0,
        productCost: 0,
        shipments: 0,
        refunds: 0,
        writeOff: 0,
        misc: 0,
        expenses: 0,
        fixedAssets: 0,
        totalCost: 0,
        sales: 0,
        profitLoss: 0,
        amzPayout: 0,
      }
    );

    const roi = totals.totalCost > 0 ? (totals.profitLoss / totals.totalCost) * 100 : null;

    const [fyStartYear] = fyLabel.split("-").map(Number);
    const previousYearLabel = `${fyStartYear - 1}-${fyStartYear}`;
    const prevMonths = getFinancialYearMonths(previousYearLabel);

    const previousYearSales = prevMonths.reduce((sum, month) => {
      const salesForMonth = purchaseRows
        .filter(
          (row) =>
            normalizeStatus(row.status) === "sold" &&
            inDateRange(parseDate(row.order_date ?? row.created_at), month.start, month.end)
        )
        .reduce((inner, row) => inner + toNumber(row.sold_amount), 0);

      return sum + salesForMonth;
    }, 0);

    const salesYoY =
      previousYearSales === 0
        ? totals.sales > 0
          ? 100
          : 0
        : ((totals.sales - previousYearSales) / previousYearSales) * 100;

    return {
      label: fyLabel,
      ...totals,
      roi,
      salesYoY,
    };
  }, [fyLabel, monthlyPerformanceRows, purchaseRows]);

  const yearlyPerformanceChartData = useMemo(
    () => [
      { metric: "Sales", value: Number(yearlyPerformanceSummary.sales.toFixed(2)) },
      { metric: "P/L", value: Number(yearlyPerformanceSummary.profitLoss.toFixed(2)) },
      { metric: "Amazon Fees", value: Number(yearlyPerformanceSummary.amazonFees.toFixed(2)) },
      { metric: "Product Cost", value: Number(yearlyPerformanceSummary.productCost.toFixed(2)) },
      { metric: "Shipments", value: Number(yearlyPerformanceSummary.shipments.toFixed(2)) },
      { metric: "Refunds", value: Number(yearlyPerformanceSummary.refunds.toFixed(2)) },
      { metric: "Write Off", value: Number(yearlyPerformanceSummary.writeOff.toFixed(2)) },
      { metric: "Misc", value: Number(yearlyPerformanceSummary.misc.toFixed(2)) },
      { metric: "Expenses", value: Number(yearlyPerformanceSummary.expenses.toFixed(2)) },
      { metric: "AMZ Payout", value: Number(yearlyPerformanceSummary.amzPayout.toFixed(2)) },
      { metric: "Total Cost", value: Number(yearlyPerformanceSummary.totalCost.toFixed(2)) },
    ],
    [yearlyPerformanceSummary]
  );

  const openingStock = useMemo(
    () => stockValueAtDate(purchaseRows, prevFyBounds.end),
    [prevFyBounds.end, purchaseRows]
  );
  const turnover = useMemo(
    () => activeSoldRows.reduce((sum, row) => sum + rowTurnover(row), 0),
    [activeSoldRows]
  );

  const stockPurchases = useMemo(
    () =>
      activePurchaseRows
        .filter((row) => isStockRow(row) && !isCapitalRow(row))
        .reduce(
          (sum, row) =>
            sum + rowItemCostTotal(row) + rowVatTotal(row) + rowInboundShippingTotal(row),
          0
        ),
    [activePurchaseRows]
  );

  const capitalAdditions = useMemo(
    () =>
      activePurchaseRows
        .filter((row) => isCapitalRow(row))
        .reduce((sum, row) => sum + rowValueAtCost(row), 0),
    [activePurchaseRows]
  );

  const closingStock = useMemo(
    () => stockValueAtDate(purchaseRows, fyBounds.end),
    [fyBounds.end, purchaseRows]
  );
  const cogs = stockPurchases;
  const grossProfit = turnover - cogs;

  const allowableExpenses = useMemo(
    () =>
      activeExpenseRows
        .filter((row) => expenseTaxTreatment(row) === "revenue_allowable")
        .reduce((sum, row) => sum + toNumber(row.amount), 0),
    [activeExpenseRows]
  );

  const disallowableExpenses = useMemo(
    () =>
      activeExpenseRows
        .filter((row) => expenseTaxTreatment(row) === "revenue_disallowable")
        .reduce((sum, row) => sum + toNumber(row.amount), 0),
    [activeExpenseRows]
  );

  const capitalExpensesFromExpensesTable = useMemo(
    () =>
      activeExpenseRows
        .filter((row) => expenseTaxTreatment(row) === "capital")
        .reduce((sum, row) => sum + toNumber(row.amount), 0),
    [activeExpenseRows]
  );

  const totalCapitalAdditions = capitalAdditions + capitalExpensesFromExpensesTable;
  const capitalAllowancesEstimate = totalCapitalAdditions;
  const netProfit = grossProfit - allowableExpenses;
  const taxableProfit = grossProfit - allowableExpenses - capitalAllowancesEstimate;
  const estTax = estimateCorporationTax(taxableProfit);

  const totalPayouts = useMemo(
    () => activePayoutRows.reduce((sum, row) => sum + toNumber(row.amount), 0),
    [activePayoutRows]
  );

  const runningBalance =
    totalPayouts -
    stockPurchases -
    allowableExpenses -
    disallowableExpenses -
    totalCapitalAdditions;

  const accountsOperatingExpenses = allowableExpenses + disallowableExpenses;
  const accountsProfitBeforeTax = grossProfit - accountsOperatingExpenses;
  const estimatedProfitAfterTax = accountsProfitBeforeTax - estTax;
  const estimatedCurrentAssets = runningBalance + closingStock;
  const estimatedFixedAssets = totalCapitalAdditions;
  const estimatedCurrentLiabilities = estTax;
  const estimatedNetAssets =
    estimatedCurrentAssets + estimatedFixedAssets - estimatedCurrentLiabilities;

  const filingWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (Math.abs(cogs - (openingStock + stockPurchases - closingStock)) > 0.01) {
      warnings.push("Stock movement does not reconcile to cost of sales.");
    }
    if (Math.abs(closingStock - (stock.inbound.value + stock.home.value + stock.outbound.value + stock.selling.value)) > 0.01) {
      warnings.push("Closing stock does not match live stock valuation on the dashboard.");
    }
    if (Math.abs(netProfit - (grossProfit - allowableExpenses)) > 0.01) {
      warnings.push("Net profit does not reconcile to gross profit less allowable expenses.");
    }
    if (Math.abs((estimatedCurrentAssets + estimatedFixedAssets) - (estimatedCurrentLiabilities + estimatedNetAssets)) > 0.01) {
      warnings.push("Balance sheet snapshot does not balance — review assets, liabilities and reserves.");
    }
    if (runningBalance < 0) {
      warnings.push("Cash running balance is negative — review purchases, expenses and payouts.");
    }
    if (capitalAllowancesEstimate > totalCapitalAdditions) {
      warnings.push("Capital allowances estimate is above capital additions.");
    }
    if (taxableProfit < 0) {
      warnings.push("Taxable profit is below zero — corporation tax estimate may not be payable.");
    }
    if (estimatedNetAssets < 0) {
      warnings.push("Estimated net assets are negative — double-check liabilities and stock valuation.");
    }
    if (totalPayouts === 0 && turnover > 0) {
      warnings.push("Sales exist but payouts are zero — check whether Amazon payouts have been imported.");
    }
    return warnings;
  }, [
    allowableExpenses,
    capitalAllowancesEstimate,
    cogs,
    closingStock,
    estimatedCurrentAssets,
    estimatedCurrentLiabilities,
    estimatedFixedAssets,
    estimatedNetAssets,
    grossProfit,
    netProfit,
    openingStock,
    runningBalance,
    stockPurchases,
    taxableProfit,
    totalCapitalAdditions,
    totalPayouts,
    stock,
    turnover,
  ]);


  const openShipments = useMemo(() => {
    const isTransit = (row: ShipmentAny) => {
      const values = [
        row.status,
        row.shipment_status,
        row.shipping_status,
        row.state,
        row.fulfilment_status,
      ]
        .map((v) => normalizeStatus(v))
        .filter(Boolean);

      return values.some((v) => v === "in_transit");
    };

    return shipmentRows
      .filter((row) => isTransit(row))
      .map((row, idx) => ({
        id: String(row.id),
        box:
          row.shipment_box_no ??
          row.shipment_box ??
          row.box_number ??
          row.box ??
          row.shipment_name ??
          row.reference ??
          `Shipment ${idx + 1}`,
        shipmentDate: row.shipment_date ?? row.sent_date ?? row.shipped_date ?? row.created_at,
        tracking: row.tracking_no ?? row.tracking ?? "—",
        carrier: row.carrier ?? row.courier ?? "—",
        units: toNumber(row.units ?? row.total_units ?? row.quantity),
        boxValue: toNumber(row.box_value),
        cost: toNumber(row.total ?? row.cost),
        raw: row,
      }));
  }, [shipmentRows]);

  const shipDetail = useMemo(() => {
    if (!shipDetailId) return null;
    return shipmentRows.find((s) => String(s.id) === shipDetailId) ?? null;
  }, [shipmentRows, shipDetailId]);

  const shipDetailBoxNo = useMemo(() => {
    if (!shipDetail) return null;
    return (
      shipDetail.shipment_box_no ??
      shipDetail.shipment_box ??
      shipDetail.box_number ??
      shipDetail.box ??
      null
    );
  }, [shipDetail]);

  const shipDetailItems = useMemo(() => {
    if (!shipDetailBoxNo) return [];
    return purchaseRows.filter((p) => String(p.shipment_box_id ?? "") === String(shipDetailBoxNo));
  }, [purchaseRows, shipDetailBoxNo]);

  const shipDetailGrouped = useMemo(() => {
    const map = new Map<string, { asin: string; brand: string; name: string; qty: number }>();
    for (const r of shipDetailItems) {
      const asin = r.product?.asin ?? "-";
      const cur = map.get(asin);
      if (cur) cur.qty += 1;
      else {
        map.set(asin, {
          asin,
          brand: r.product?.brand ?? "-",
          name: r.product?.product_name ?? "-",
          qty: 1,
        });
      }
    }
    return Array.from(map.values());
  }, [shipDetailItems]);

  const awaitingShipmentRows = useMemo(() => {
    return purchaseRows
      .filter((row) => normalizeStatus(row.status) === "awaiting_delivery")
      .sort(
        (a, b) =>
          new Date(String(b.purchase_date ?? b.created_at)).getTime() -
          new Date(String(a.purchase_date ?? a.created_at)).getTime()
      );
  }, [purchaseRows]);

  const openingStockRows = useMemo(
    () => stockRowsHeldAtDate(purchaseRows, prevFyBounds.end),
    [purchaseRows, prevFyBounds.end]
  );

  const closingStockRows = useMemo(
    () => stockRowsHeldAtDate(purchaseRows, fyBounds.end),
    [fyBounds.end, purchaseRows]
  );

  const stockPurchaseRows = useMemo(
    () => activePurchaseRows.filter((row) => isStockRow(row) && !isCapitalRow(row)),
    [activePurchaseRows]
  );

  const capitalPurchaseRows = useMemo(
    () => activePurchaseRows.filter((row) => isCapitalRow(row)),
    [activePurchaseRows]
  );

  const allowableExpenseRows = useMemo(
    () => activeExpenseRows.filter((row) => expenseTaxTreatment(row) === "revenue_allowable"),
    [activeExpenseRows]
  );

  const disallowableExpenseRows = useMemo(
    () => activeExpenseRows.filter((row) => expenseTaxTreatment(row) === "revenue_disallowable"),
    [activeExpenseRows]
  );

  const capitalExpenseRows = useMemo(
    () => activeExpenseRows.filter((row) => expenseTaxTreatment(row) === "capital"),
    [activeExpenseRows]
  );

  const eUnit = useMemo(() => parseDecimalOrZero(eUnitCostStr), [eUnitCostStr]);
  const eTax = useMemo(() => parseDecimalOrZero(eTaxStr), [eTaxStr]);
  const eShip = useMemo(() => parseDecimalOrZero(eShippingStr), [eShippingStr]);
  const eDiscVal = useMemo(() => parseDecimalOrZero(eDiscountValueStr), [eDiscountValueStr]);

  const eTotalPreview = useMemo(() => {
    const u = eUnit || 0;
    const q = eQty || 0;
    if (eDiscountType === "percent") {
      const perUnitDisc = (u * (eDiscVal || 0)) / 100;
      const discountedUnit = Math.max(0, u - perUnitDisc);
      return discountedUnit * q + (eTax || 0) + (eShip || 0);
    }
    const totalBefore = u * q + (eTax || 0) + (eShip || 0);
    return Math.max(0, totalBefore - (eDiscVal || 0));
  }, [eDiscVal, eDiscountType, eQty, eShip, eTax, eUnit]);


  const selectedProduct = useMemo(() => {
    if (!selectedProductId) return null;
    return products.find((p) => p.id === selectedProductId) ?? null;
  }, [products, selectedProductId]);

  const productMatches = useMemo(() => products, [products]);

  const showAddCatalogButton = useMemo(() => {
    const q = productQuery.trim();
    if (!q) return false;
    return productMatches.length === 0;
  }, [productMatches.length, productQuery]);

  function resetAddPurchaseForm() {
    setProductQuery("");
    setSelectedProductId(null);
    setEPurchaseDate(todayISO());
    setEDeliveryDate("");
    setEExpiryDate("");
    setEShopStr("");
    setETrackingStr("");
    setEQty(1);
    setEUnitCostStr("0");
    setETaxStr("0");
    setEShippingStr("0");
    setEDiscountType("percent");
    setEDiscountValueStr("0");
    setCreateError(null);
  }

  const selectedPurchase = useMemo(() => {
    if (!selectedPurchaseId) return null;
    return purchaseRows.find((p) => String(p.id) === selectedPurchaseId) ?? null;
  }, [purchaseRows, selectedPurchaseId]);
  const shopSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const shops = purchaseRows
      .map((row) => String(row.shop ?? "").trim())
      .filter(Boolean)
      .filter((shop) => {
        const key = shop.toLowerCase();
        if (seen.has(key)) return false
        seen.add(key)
        return true
      });
    return shops.sort((a, b) => a.localeCompare(b));
  }, [purchaseRows]);


  function openEditFor(p: PurchaseDashboardRow) {
    setEditError(null);
    setSelectedPurchaseId(String(p.id));
    setEPurchaseDate(p.purchase_date ?? todayISO());
    setEDeliveryDate(p.delivery_date ?? "");
    setEExpiryDate(p.expiry_date ?? "");
    setEShopStr(p.shop ?? "");
    setETrackingStr(p.tracking_no ?? "");
    setEQty(p.quantity ?? 1);
    setEUnitCostStr(String(Number(p.unit_cost ?? 0)));
    setETaxStr(String(Number(p.tax_amount ?? 0)));
    setEShippingStr(String(Number(p.shipping_cost ?? 0)));
    setEDiscountType((p.discount_type ?? "percent") as DiscountType);
    setEDiscountValueStr(String(Number(p.discount_value ?? 0)));
    setEditOpen(true);
  }

  async function reloadPurchases() {
    const purchases = await supabase
      .from("purchases")
      .select(`*, product:products(id, asin, brand, product_name, product_code)`);
    if (!purchases.error) setPurchaseRows((purchases.data ?? []) as PurchaseDashboardRow[]);
  }


  async function createPurchase() {
    setCreateBusy(true);
    setCreateError(null);

    try {
      const unitCost = parseDecimalOrZero(eUnitCostStr);
      const tax = parseDecimalOrZero(eTaxStr);
      const shipping = parseDecimalOrZero(eShippingStr);
      const discountValue = parseDecimalOrZero(eDiscountValueStr);

      if (!selectedProductId) return setCreateError("Select a product first.");
      if (!ePurchaseDate) return setCreateError("Purchase date is required.");
      if (!eQty || eQty <= 0) return setCreateError("Quantity must be at least 1.");
      if (!eShopStr.trim()) return setCreateError("Shop is required.");
      if (unitCost < 0.01) return setCreateError("Unit cost must be at least £0.01.");

      const pDate = ePurchaseDate;
      const q = eQty;
      const deliveryNull = toNullDate(eDeliveryDate);
      const expiryNull = toNullDate(eExpiryDate);
      const shopNull = toNullText(eShopStr);
      const trackingNull = toNullText(eTrackingStr);
      const initialStatus = deliveryNull ? "processing" : "awaiting_delivery";

      const splitMoneyEvenly = (total: number, n: number) => {
        const pennies = Math.round((Number.isFinite(total) ? total : 0) * 100);
        const base = Math.floor(pennies / n);
        const rem = pennies % n;
        const out: number[] = [];
        for (let i = 0; i < n; i++) out.push((base + (i < rem ? 1 : 0)) / 100);
        return out;
      };

      const taxParts = splitMoneyEvenly(tax || 0, q);
      const shipParts = splitMoneyEvenly(shipping || 0, q);
      const fixedDiscountParts =
        eDiscountType === "fixed" ? splitMoneyEvenly(discountValue || 0, q) : [];

      const { data: orderRows, error: orderError } = await supabase
        .from("purchases")
        .select("order_no")
        .not("order_no", "is", null)
        .order("order_no", { ascending: false })
        .limit(1);

      if (orderError) throw orderError;

      const currentMaxOrderNo = Number(orderRows?.[0]?.order_no ?? 0);
      const firstOrderNo = Number.isFinite(currentMaxOrderNo) ? currentMaxOrderNo + 1 : 1;

      const rowsToInsert = Array.from({ length: q }, (_, i) => ({
        product_id: selectedProductId,
        order_no: firstOrderNo + i,
        purchase_date: pDate,
        delivery_date: deliveryNull,
        expiry_date: expiryNull,
        shop: shopNull,
        tracking_no: trackingNull,
        quantity: 1,
        remaining_qty: 1,
        unit_cost: unitCost || 0,
        tax_amount: taxParts[i] ?? 0,
        shipping_cost: shipParts[i] ?? 0,
        discount_type: eDiscountType,
        discount_value: eDiscountType === "fixed" ? fixedDiscountParts[i] ?? 0 : discountValue || 0,
        total_cost:
          eDiscountType === "percent"
            ? Math.max(0, unitCost - (unitCost * (discountValue || 0)) / 100) + (taxParts[i] ?? 0) + (shipParts[i] ?? 0)
            : Math.max(0, unitCost + (taxParts[i] ?? 0) + (shipParts[i] ?? 0) - (fixedDiscountParts[i] ?? 0)),
        tax_year: computeUkTaxYear(pDate),
        status: initialStatus,
        write_off_reason: null,
        sold_amount: null,
        amazon_fees: null,
        misc_fees: null,
        order_date: null,
        amazon_payout: null,
        profit_loss: null,
        roi: null,
        shipment_box_id: null,
        sale_type: null,
        fbm_shipping_fee: null,
        fbm_tracking_no: null,
        return_shipping_fee: null,
        last_return_date: null,
      }));

      const { error } = await supabase.from("purchases").insert(rowsToInsert);
      if (error) throw error;

      setAddOpen(false);
      resetAddPurchaseForm();
      await reloadPurchases();
    } catch (e: any) {
      setCreateError(e?.message ?? "Failed to create purchase.");
    } finally {
      setCreateBusy(false);
    }
  }


  async function createCatalogProductFromInventory() {
    setCatBusy(true);
    setCatError(null);

    try {
      const asinNorm = normalizeASIN(catAsin);
      const brandNorm = titleCaseEveryWord(catBrand);
      const nameNorm = titleCaseEveryWord(catName);

      if (!asinNorm) {
        setCatError("ASIN is required.");
        return;
      }
      if (!brandNorm.trim()) {
        setCatError("Brand is required.");
        return;
      }
      if (!nameNorm.trim()) {
        setCatError("Product name is required.");
        return;
      }

      const { data, error } = await supabase
        .from("products")
        .insert({
          asin: asinNorm,
          brand: brandNorm,
          product_name: nameNorm,
        })
        .select("id, asin, brand, product_name, product_code")
        .single();

      if (error) throw error;

      const newProduct = data as ProductRow;
      setProducts((prev) => [newProduct, ...prev].slice(0, 5));
      setSelectedProductId(newProduct.id);
      setProductQuery(String(newProduct.product_code ?? newProduct.asin ?? ""));
      setAddCatalogOpen(false);
      setCatAsin("");
      setCatBrand("");
      setCatName("");
    } catch (e: any) {
      setCatError(e?.message ?? "Failed to create product.");
    } finally {
      setCatBusy(false);
    }
  }

  async function reloadShipments() {
    const shipments = await supabase
      .from("shipments")
      .select("*")
      .order("created_at", { ascending: false });
    if (!shipments.error) setShipmentRows((shipments.data ?? []) as ShipmentAny[]);
  }

  async function setDeliveredNow(purchaseId: string) {
    const { error } = await supabase
      .from("purchases")
      .update({
        status: "processing",
        delivery_date: todayISO(),
      })
      .eq("id", purchaseId);

    if (!error) await reloadPurchases();
  }

  function openCheckin(shipmentId: string) {
    setCheckinShipmentId(shipmentId);
    setCheckinDate(todayISO());
    setCheckinOpen(true);
  }

  async function confirmShipmentDelivered() {
    if (!checkinShipmentId) return;

    const shipment = shipmentRows.find((s) => String(s.id) === checkinShipmentId) ?? null;
    if (!shipment) return;

    const d = checkinDate.trim();
    if (!d) {
      alert("Delivery date is required.");
      return;
    }

    const boxNo =
      shipment.shipment_box_no ??
      shipment.shipment_box ??
      shipment.box_number ??
      shipment.box ??
      null;

    setCheckinBusy(true);
    try {
      const { error: shipErr } = await supabase
        .from("shipments")
        .update({ checkin_date: d })
        .eq("id", checkinShipmentId);

      if (shipErr) throw shipErr;

      if (boxNo) {
        const { error: purchErr } = await supabase
          .from("purchases")
          .update({
            status: "selling",
            delivery_date: d,
          })
          .eq("shipment_box_id", boxNo);

        if (purchErr) throw purchErr;
      }

      setCheckinOpen(false);
      setShipDetailOpen(false);
      setCheckinShipmentId(null);
      await Promise.all([reloadShipments(), reloadPurchases()]);
    } catch (e: any) {
      alert(e?.message ?? "Failed to mark shipment delivered.");
    } finally {
      setCheckinBusy(false);
    }
  }

  async function saveEdit() {
    if (!selectedPurchase) return;
    setEditBusy(true);
    setEditError(null);

    try {
      const newDelivery = toNullDate(eDeliveryDate);
      let nextStatus = String(selectedPurchase.status ?? "awaiting_delivery");
      if (newDelivery && nextStatus === "awaiting_delivery") nextStatus = "processing";
      if (!newDelivery && nextStatus === "processing") nextStatus = "awaiting_delivery";

      const { error } = await supabase
        .from("purchases")
        .update({
          status: nextStatus,
          purchase_date: ePurchaseDate,
          delivery_date: newDelivery,
          expiry_date: toNullDate(eExpiryDate),
          shop: toNullText(eShopStr),
          tracking_no: toNullText(eTrackingStr),
          quantity: eQty,
          unit_cost: eUnit || 0,
          tax_amount: eTax || 0,
          shipping_cost: eShip || 0,
          discount_type: eDiscountType,
          discount_value: eDiscVal || 0,
          total_cost:
            eDiscountType === "percent"
              ? Math.max(0, eUnit - (eUnit * (eDiscVal || 0)) / 100) * eQty +
                (eTax || 0) +
                (eShip || 0)
              : Math.max(0, eUnit * eQty + (eTax || 0) + (eShip || 0) - (eDiscVal || 0)),
        })
        .eq("id", selectedPurchase.id);

      if (error) throw error;

      setEditOpen(false);
      await reloadPurchases();
    } catch (e: any) {
      setEditError(e?.message ?? "Failed to update purchase.");
    } finally {
      setEditBusy(false);
    }
  }

  const currentMonthStart = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }, []);

  const currentMonthEnd = useMemo(() => new Date(), []);

  const currentMonthSoldRows = useMemo(
    () =>
      purchaseRows.filter(
        (row) =>
          normalizeStatus(row.status) === "sold" &&
          inDateRange(parseDate(row.order_date ?? row.created_at), currentMonthStart, currentMonthEnd)
      ),
    [purchaseRows, currentMonthEnd, currentMonthStart]
  );

  const currentMonthProfit = currentMonthSoldRows.reduce(
    (sum, row) => sum + toNumber(row.profit_loss),
    0
  );
  const currentMonthSales = currentMonthSoldRows.reduce(
    (sum, row) => sum + toNumber(row.sold_amount),
    0
  );
  const currentMonthAvgROI =
    currentMonthSoldRows.length > 0
      ? currentMonthSoldRows.reduce((sum, row) => sum + toNumber(row.roi), 0) /
        currentMonthSoldRows.length
      : 0;
  const currentUnitsSold = currentMonthSoldRows.reduce((sum, row) => sum + Math.max(1, rowQty(row)), 0);

  const totalUnitsInStock =
    stock.inbound.units +
    stock.home.units +
    stock.outbound.units +
    stock.selling.units +
    stock.damaged.units;

  const totalStockValue =
    stock.inbound.value +
    stock.home.value +
    stock.outbound.value +
    stock.selling.value;

  const shipmentsSentToAmazonCount = useMemo(
    () => purchaseRows.filter((row) => normalizeStatus(row.status) === "sent_to_amazon").length,
    [purchaseRows]
  );

  const shipmentsCreatedCount = useMemo(() => shipmentRows.length, [shipmentRows]);

  const inventoryPurchasedCount = useMemo(() => purchaseRows.length, [purchaseRows]);

  const soldOrdersCount = useMemo(
    () => purchaseRows.filter((row) => normalizeStatus(row.status) === "sold").length,
    [purchaseRows]
  );

  const writeOffValue = useMemo(
    () => purchaseRows
      .filter((row) => normalizeStatus(row.status) === "written_off")
      .reduce((sum, row) => sum + rowValueAtCost(row), 0),
    [purchaseRows]
  );

  const businessExpensesValue = useMemo(
    () => allExpenseRows.reduce((sum, row) => sum + toNumber(row.amount), 0),
    [allExpenseRows]
  );


const currentMonthElapsedPercent = useMemo(() => getCurrentMonthElapsedPercent(), []);

const availableSystemKpiOptions = useMemo(() => {
  const used = new Set(systemKpis.map((kpi) => kpi.key));
  return SYSTEM_KPI_OPTIONS.filter((option) => !used.has(option.key));
}, [systemKpis]);

useEffect(() => {
  if (!systemKpis.some((kpi) => !kpi.periodType || !kpi.id || !kpi.createdAt || !kpi.startDate)) return;
  setSystemKpis((prev) =>
    prev.map((kpi) => ({
      ...kpi,
      id: kpi.id ?? `${kpi.key}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: kpi.createdAt ?? todayISO(),
      periodType: kpi.periodType ?? "month",
      startDate: kpi.startDate ?? todayISO(),
      targetDate: kpi.targetDate ?? null,
    }))
  );
}, [setSystemKpis, systemKpis]);

useEffect(() => {
  if (systemKpiEditOpen) return;
  if (availableSystemKpiOptions.length === 0) return;
  if (!availableSystemKpiOptions.some((option) => option.key === selectedSystemKpiKey)) {
    setSelectedSystemKpiKey(availableSystemKpiOptions[0].key);
  }
}, [availableSystemKpiOptions, selectedSystemKpiKey, systemKpiEditOpen]);

function getSystemKpiBounds(item: SavedSystemKpi) {
  const fallbackStart = parseDate(item.startDate ?? todayISO()) ?? new Date();
  const start = new Date(fallbackStart.getFullYear(), fallbackStart.getMonth(), fallbackStart.getDate());
  const end = getSystemKpiPeriodEndDate(item.periodType, fyBounds.end, item.startDate, item.targetDate);
  return { start, end: end < start ? new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59, 999) : end };
}

function shipmentSentDate(row: ShipmentAny) {
  return parseDate(row.shipment_date ?? row.sent_date ?? row.shipped_date ?? row.created_at);
}

function shipmentCreatedDate(row: ShipmentAny) {
  return parseDate(row.created_at ?? row.shipment_date ?? row.sent_date ?? row.shipped_date);
}

function shipmentDeliveredDate(row: ShipmentAny) {
  return parseDate(row.checkin_date ?? row.delivery_date ?? row.received_date ?? row.updated_at ?? row.created_at);
}

function calculateSystemKpiValue(key: string, bounds: { start: Date; end: Date }) {
  const soldRowsInBounds = purchaseRows.filter((row) => normalizeStatus(row.status) === "sold" && inDateRange(parseDate(row.order_date ?? row.sold_date ?? row.sale_date ?? row.created_at), bounds.start, bounds.end));
  const purchasedRowsInBounds = purchaseRows.filter((row) => inDateRange(rowCreatedOrPurchaseDate(row), bounds.start, bounds.end));
  const checkinRowsInBounds = purchaseRows.filter((row) => inDateRange(rowAmazonCheckinDate(row), bounds.start, bounds.end));
  const writeOffRowsInBounds = purchaseRows.filter((row) => normalizeStatus(row.status) === "written_off" && inDateRange(rowSoldOrRemovedDate(row), bounds.start, bounds.end));
  const expenseRowsInBounds = allExpenseRows.filter((row) => inDateRange(parseDate(row.expense_date), bounds.start, bounds.end));
  const payoutRowsInBounds = payoutRows.filter((row) => inDateRange(parseDate(row.payout_date), bounds.start, bounds.end));
  const shipmentRowsCreatedInBounds = shipmentRows.filter((row) => inDateRange(shipmentCreatedDate(row), bounds.start, bounds.end));
  const shipmentRowsSentInBounds = shipmentRows.filter((row) => inDateRange(shipmentSentDate(row), bounds.start, bounds.end));
  const shipmentRowsDeliveredInBounds = shipmentRows.filter((row) => inDateRange(shipmentDeliveredDate(row), bounds.start, bounds.end));
  const effectiveEnd = bounds.end < new Date() ? bounds.end : new Date();

  const sales = soldRowsInBounds.reduce((sum, row) => sum + toNumber(row.sold_amount), 0);
  const profit = soldRowsInBounds.reduce((sum, row) => sum + toNumber(row.profit_loss), 0);
  const unitsSold = soldRowsInBounds.reduce((sum, row) => sum + Math.max(1, rowQty(row)), 0);
  const soldOrders = soldRowsInBounds.length;
  const avgSalePrice = unitsSold > 0 ? sales / unitsSold : 0;
  const avgProfitPerUnit = unitsSold > 0 ? profit / unitsSold : 0;
  const avgRoi = soldRowsInBounds.length > 0 ? soldRowsInBounds.reduce((sum, row) => sum + toNumber(row.roi), 0) / soldRowsInBounds.length : 0;
  const businessExpenses = expenseRowsInBounds.reduce((sum, row) => sum + toNumber(row.amount), 0);
  const grossProfit = profit;
  const netProfitForPeriod = grossProfit - businessExpenses;
  const stockValue = stockValueAtDate(purchaseRows, effectiveEnd);
  const inventoryPurchased = purchasedRowsInBounds.length;
  const inventoryCostAdded = purchasedRowsInBounds.reduce((sum, row) => sum + rowValueAtCost(row), 0);
  const inboundUnits = checkinRowsInBounds.reduce((sum, row) => sum + Math.max(1, rowQty(row)), 0);
  const inboundValue = checkinRowsInBounds.reduce((sum, row) => sum + rowValueAtCost(row), 0);
  const sellingUnits = purchaseRows.filter((row) => normalizeStatus(row.status) === "selling" && (rowAmazonCheckinDate(row) ?? rowCreatedOrPurchaseDate(row) ?? new Date(0)) <= effectiveEnd).reduce((sum, row) => sum + Math.max(1, rowQty(row)), 0);
  const writeOffUnits = writeOffRowsInBounds.reduce((sum, row) => sum + Math.max(1, rowQty(row)), 0);
  const writeOffValue = writeOffRowsInBounds.reduce((sum, row) => sum + rowValueAtCost(row), 0);
  const amazonFees = soldRowsInBounds.reduce((sum, row) => sum + toNumber(row.amazon_fees), 0);
  const refunds = moneyValue(
    soldRowsInBounds.reduce((sum, row) => sum + toNumber(row.refund_amount) + toNumber(row.refunded_amount), 0) +
      purchaseRows
        .filter((row) => rowReturnFee(row) > 0 && inDateRange(rowReturnFeeDate(row), bounds.start, bounds.end))
        .reduce((sum, row) => sum + rowReturnFee(row), 0)
  );
  const payoutsTotal = payoutRowsInBounds.reduce((sum, row) => sum + toNumber(row.amount), 0);

  const values: Record<string, number> = {
    monthly_profit: profit,
    gross_profit: grossProfit,
    net_profit: netProfitForPeriod,
    monthly_sales: sales,
    roi: avgRoi,
    units_sold: unitsSold,
    sold_orders: soldOrders,
    average_profit_per_unit: avgProfitPerUnit,
    average_sale_price: avgSalePrice,
    stock_value: stockValue,
    payouts: payoutsTotal,
    shipments_sent_to_amazon: shipmentRowsSentInBounds.length,
    shipments_created: shipmentRowsCreatedInBounds.length,
    shipments_delivered: shipmentRowsDeliveredInBounds.length,
    inventory_purchased: inventoryPurchased,
    inventory_cost_added: inventoryCostAdded,
    inbound_units: inboundUnits,
    inbound_value_received: inboundValue,
    selling_units: sellingUnits,
    write_off_units: writeOffUnits,
    write_off_value: writeOffValue,
    business_expenses: businessExpenses,
    amazon_fees: amazonFees,
    refunds,
  };

  const detailRows: { label: string; value: string }[] = {
    monthly_profit: [
      { label: "Sold rows in period", value: String(soldRowsInBounds.length) },
      { label: "Profit / loss total", value: money(profit) },
    ],
    gross_profit: [
      { label: "Sold rows in period", value: String(soldRowsInBounds.length) },
      { label: "Gross profit total", value: money(grossProfit) },
    ],
    net_profit: [
      { label: "Gross profit", value: money(grossProfit) },
      { label: "Business expenses in period", value: money(businessExpenses) },
      { label: "Net profit", value: money(netProfitForPeriod) },
    ],
    monthly_sales: [
      { label: "Sold rows in period", value: String(soldRowsInBounds.length) },
      { label: "Sales total", value: money(sales) },
    ],
    roi: [
      { label: "Sold rows in period", value: String(soldRowsInBounds.length) },
      { label: "Average ROI", value: `${avgRoi.toFixed(2)}%` },
    ],
    units_sold: [
      { label: "Sold rows in period", value: String(soldRowsInBounds.length) },
      { label: "Units sold total", value: String(unitsSold) },
    ],
    sold_orders: [
      { label: "Sold order rows", value: String(soldOrders) },
    ],
    average_profit_per_unit: [
      { label: "Profit total", value: money(profit) },
      { label: "Units sold", value: String(unitsSold) },
      { label: "Average profit / unit", value: money(avgProfitPerUnit) },
    ],
    average_sale_price: [
      { label: "Sales total", value: money(sales) },
      { label: "Units sold", value: String(unitsSold) },
      { label: "Average sale price", value: money(avgSalePrice) },
    ],
    stock_value: [
      { label: "Snapshot date", value: fmtDate(effectiveEnd.toISOString().slice(0, 10)) },
      { label: "Stock value at cost", value: money(stockValue) },
    ],
    payouts: [
      { label: "Payout rows in period", value: String(payoutRowsInBounds.length) },
      { label: "Payout total", value: money(payoutsTotal) },
    ],
    shipments_sent_to_amazon: [
      { label: "Shipment sent date used", value: "shipment_date / sent_date / shipped_date" },
      { label: "Shipments sent in period", value: String(shipmentRowsSentInBounds.length) },
    ],
    shipments_created: [
      { label: "Shipment created date used", value: "created_at" },
      { label: "Shipments created in period", value: String(shipmentRowsCreatedInBounds.length) },
    ],
    shipments_delivered: [
      { label: "Shipment delivered date used", value: "checkin_date / delivery_date / received_date" },
      { label: "Shipments delivered in period", value: String(shipmentRowsDeliveredInBounds.length) },
    ],
    inventory_purchased: [
      { label: "Purchase rows in period", value: String(inventoryPurchased) },
    ],
    inventory_cost_added: [
      { label: "Purchase rows in period", value: String(inventoryPurchased) },
      { label: "Inventory cost added", value: money(inventoryCostAdded) },
    ],
    inbound_units: [
      { label: "Amazon check-in date used", value: "checkin_date / delivery_date / received_date" },
      { label: "Units received in period", value: String(inboundUnits) },
    ],
    inbound_value_received: [
      { label: "Rows checked in during period", value: String(checkinRowsInBounds.length) },
      { label: "Inbound value received", value: money(inboundValue) },
    ],
    selling_units: [
      { label: "Snapshot date", value: fmtDate(effectiveEnd.toISOString().slice(0, 10)) },
      { label: "Units currently in selling by snapshot", value: String(sellingUnits) },
    ],
    write_off_units: [
      { label: "Written off rows in period", value: String(writeOffRowsInBounds.length) },
      { label: "Write-off units", value: String(writeOffUnits) },
    ],
    write_off_value: [
      { label: "Written off rows in period", value: String(writeOffRowsInBounds.length) },
      { label: "Write-off value", value: money(writeOffValue) },
    ],
    business_expenses: [
      { label: "Expense rows in period", value: String(expenseRowsInBounds.length) },
      { label: "Business expenses total", value: money(businessExpenses) },
    ],
    amazon_fees: [
      { label: "Sold rows in period", value: String(soldRowsInBounds.length) },
      { label: "Amazon fees total", value: money(amazonFees) },
    ],
    refunds: [
      { label: "Sold rows in period", value: String(soldRowsInBounds.length) },
      { label: "Refunds total", value: money(refunds) },
    ],
  }[key] ?? [{ label: "Current value", value: String(values[key] ?? 0) }];

  return { current: Number(values[key] ?? 0), detailRows };
}

const renderedSystemKpis = useMemo(() => {
  return systemKpis.map((kpi) => {
    const option = SYSTEM_KPI_OPTIONS.find((item) => item.key === kpi.key) ?? SYSTEM_KPI_OPTIONS[0];
    const bounds = getSystemKpiBounds(kpi);
    const metric = calculateSystemKpiValue(kpi.key, bounds);
    const current = metric.current;
    const target = Number(kpi.target ?? 0);
    const progress = target > 0 ? (current / target) * 100 : 0;
    const elapsedPercent = getSystemKpiElapsedPercent(kpi.periodType, fyBounds.start, fyBounds.end, kpi.startDate, kpi.targetDate);
    const completed = target > 0 && current >= target;
    const now = new Date();
    const missed = !completed && now > bounds.end;
    const schedule = completed
      ? { label: "Completed", wrap: "border-neutral-300 bg-neutral-100 text-neutral-700", bar: "bg-neutral-500" }
      : missed
      ? { label: "Review KPI", wrap: "border-neutral-300 bg-neutral-100 text-neutral-700", bar: "bg-neutral-500" }
      : getScheduleTone(progress, elapsedPercent, completed);
    return {
      id: kpi.id,
      key: kpi.key,
      createdAt: kpi.createdAt,
      title: option.label,
      format: option.format,
      current,
      target,
      progress,
      completed,
      missed,
      elapsedPercent,
      startDate: kpi.startDate,
      targetDate: kpi.targetDate,
      periodType: kpi.periodType,
      periodLabel: formatSystemKpiPeriodLabel(kpi.periodType, fyLabel, kpi.startDate, kpi.targetDate),
      schedule,
      detailRows: metric.detailRows,
      bounds,
    };
  });
}, [allExpenseRows, fyBounds.end, fyBounds.start, fyLabel, payoutRows, purchaseRows, shipmentRows, systemKpis]);

const archiveSystemKpi = (id: string, outcome: SavedSystemKpiHistory["outcome"]) => {
  const match = renderedSystemKpis.find((item) => item.id === id);
  if (!match) return;
  setSystemKpiHistory((prev) => [{
    id: match.id,
    createdAt: match.createdAt,
    key: match.key,
    title: match.title,
    format: match.format,
    target: match.target,
    finalValue: match.current,
    outcome,
    periodType: match.periodType,
    startDate: match.startDate,
    targetDate: match.targetDate,
    periodLabel: match.periodLabel,
    archivedAt: todayISO(),
  }, ...prev]);
  setSystemKpis((prev) => prev.filter((item) => item.id !== id));
  setActiveSystemKpiDetailId(null);
  setSystemKpiEditOpen(false);
};

const openEditSystemKpi = (id: string) => {
  const item = systemKpis.find((entry) => entry.id === id);
  if (!item) return;
  setSelectedSystemKpiKey(item.key);
  setSelectedSystemKpiTarget(String(item.target ?? ""));
  setSelectedSystemKpiPeriodType(item.periodType ?? "month");
  setSelectedSystemKpiStartDate(item.startDate ?? todayISO());
  setSelectedSystemKpiTargetDate(item.targetDate ?? "");
  setSystemKpiEditOpen(true);
};

const saveEditedSystemKpi = () => {
  if (!activeSystemKpiDetailId) return;
  const target = Number(selectedSystemKpiTarget);
  if (!Number.isFinite(target) || target <= 0) return;
  if (!selectedSystemKpiStartDate) return;
  if (selectedSystemKpiPeriodType === "date" && !selectedSystemKpiTargetDate) return;

  setSystemKpis((prev) =>
    prev.map((item) =>
      item.id === activeSystemKpiDetailId
        ? {
            ...item,
            key: selectedSystemKpiKey,
            target,
            periodType: selectedSystemKpiPeriodType,
            startDate: selectedSystemKpiStartDate,
            targetDate: selectedSystemKpiPeriodType === "date" ? selectedSystemKpiTargetDate : null,
          }
        : item
    )
  );
  setSystemKpiEditOpen(false);
  setActiveSystemKpiDetailId(null);
};

const groupedSystemKpiHistory = useMemo(() => {
  const map = new Map<string, SavedSystemKpiHistory[]>();
  const sorted = [...systemKpiHistory].sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
  sorted.forEach((item) => {
    const heading = getKpiHistoryMonthHeading(item.archivedAt);
    if (!map.has(heading)) map.set(heading, []);
    map.get(heading)!.push(item);
  });
  return Array.from(map.entries());
}, [systemKpiHistory]);

const activeSystemKpiDetail = useMemo(() => renderedSystemKpis.find((item) => item.id === activeSystemKpiDetailId) ?? null, [activeSystemKpiDetailId, renderedSystemKpis]);

const exportSystemKpiHistoryPdf = () => {
  if (typeof window === "undefined") return;
  const html = buildKpiHistoryHtml(systemKpiHistory);
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const cleanup = () => {
    window.setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 1000);
  };

  iframe.onload = () => {
    const frameWindow = iframe.contentWindow;
    if (!frameWindow) {
      cleanup();
      return;
    }
    frameWindow.focus();
    window.setTimeout(() => {
      frameWindow.print();
      cleanup();
    }, 250);
  };

  const doc = iframe.contentDocument;
  if (!doc) {
    cleanup();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
};

  const stockAgeingBuckets = useMemo(() => {
    const buckets = {
      over45: { units: 0, value: 0 },
      over90: { units: 0, value: 0 },
      over180: { units: 0, value: 0 },
    };

    for (const row of closingStockRows) {
      const checkin = rowAmazonCheckinDate(row);
      if (!checkin) continue;
      const ageDays = Math.floor((rangeBounds.end.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24));
      if (ageDays < 0) continue;
      const qty = Math.max(1, rowQty(row));
      const value = rowValueAtCost(row);
      if (ageDays > 45) {
        buckets.over45.units += qty;
        buckets.over45.value += value;
      }
      if (ageDays > 90) {
        buckets.over90.units += qty;
        buckets.over90.value += value;
      }
      if (ageDays > 180) {
        buckets.over180.units += qty;
        buckets.over180.value += value;
      }
    }

    return buckets;
  }, [closingStockRows, rangeBounds.end]);

  const prevFySoldRows = useMemo(
    () =>
      purchaseRows.filter(
        (row) =>
          normalizeStatus(row.status) === "sold" &&
          inDateRange(parseDate(row.order_date ?? row.created_at), prevFyBounds.start, prevFyBounds.end)
      ),
    [purchaseRows, prevFyBounds]
  );

  const prevFyWrittenOffRows = useMemo(
    () =>
      purchaseRows.filter(
        (row) =>
          normalizeStatus(row.status) === "written_off" &&
          inDateRange(
            parseDate(
              row.write_off_date ??
                row.written_off_date ??
                row.removed_date ??
                row.updated_at ??
                row.created_at
            ),
            prevFyBounds.start,
            prevFyBounds.end
          )
      ),
    [purchaseRows, prevFyBounds]
  );

  const prevFyShipmentRows = useMemo(
    () =>
      shipmentRows.filter((row) =>
        inDateRange(
          parseDate(row.shipment_date ?? row.sent_date ?? row.shipped_date ?? row.created_at),
          prevFyBounds.start,
          prevFyBounds.end
        )
      ),
    [shipmentRows, prevFyBounds]
  );

  const prevFyExpenseRows = useMemo(
    () =>
      allExpenseRows.filter((row) =>
        inDateRange(parseDate(row.expense_date), prevFyBounds.start, prevFyBounds.end)
      ),
    [allExpenseRows, prevFyBounds]
  );

  const prevFyFinanceRows = useMemo(() => {
    return financeRows.filter((row) => {
      const rowDate = parseDate(row.entry_date ?? row.date ?? row.finance_date ?? row.created_at);
      return inDateRange(rowDate, prevFyBounds.start, prevFyBounds.end);
    });
  }, [financeRows, prevFyBounds]);

  const prevFyPurchaseRows = useMemo(
    () =>
      purchaseRows.filter((row) =>
        inDateRange(parseDate(row.purchase_date ?? row.created_at), prevFyBounds.start, prevFyBounds.end)
      ),
    [purchaseRows, prevFyBounds]
  );

  const prevFyPayoutRows = useMemo(
    () =>
      payoutRows.filter((row) =>
        inDateRange(parseDate(row.payout_date), prevFyBounds.start, prevFyBounds.end)
      ),
    [payoutRows, prevFyBounds]
  );

  const prevFyStockPurchases = useMemo(
    () =>
      prevFyPurchaseRows
        .filter((row) => isStockRow(row) && !isCapitalRow(row))
        .reduce((sum, row) => sum + rowValueAtCost(row), 0),
    [prevFyPurchaseRows]
  );

  const prevFyCapitalAdditions = useMemo(
    () =>
      prevFyPurchaseRows
        .filter((row) => isCapitalRow(row))
        .reduce((sum, row) => sum + rowValueAtCost(row), 0),
    [prevFyPurchaseRows]
  );

  const prevFyAllowableExpenses = useMemo(
    () =>
      prevFyExpenseRows
        .filter((row) => expenseTaxTreatment(row) === "revenue_allowable")
        .reduce((sum, row) => sum + toNumber(row.amount), 0),
    [prevFyExpenseRows]
  );

  const prevFyDisallowableExpenses = useMemo(
    () =>
      prevFyExpenseRows
        .filter((row) => expenseTaxTreatment(row) === "revenue_disallowable")
        .reduce((sum, row) => sum + toNumber(row.amount), 0),
    [prevFyExpenseRows]
  );

  const prevFyCapitalExpensesFromExpensesTable = useMemo(
    () =>
      prevFyExpenseRows
        .filter((row) => expenseTaxTreatment(row) === "capital")
        .reduce((sum, row) => sum + toNumber(row.amount), 0),
    [prevFyExpenseRows]
  );

  const prevFyTotalCapitalAdditions = useMemo(
    () => prevFyCapitalAdditions + prevFyCapitalExpensesFromExpensesTable,
    [prevFyCapitalAdditions, prevFyCapitalExpensesFromExpensesTable]
  );

  const prevFyTotalPayouts = useMemo(
    () => prevFyPayoutRows.reduce((sum, row) => sum + toNumber(row.amount), 0),
    [prevFyPayoutRows]
  );

  const prevFyClosingBalanceFinancials = useMemo(
    () =>
      prevFyTotalPayouts -
      prevFyStockPurchases -
      prevFyAllowableExpenses -
      prevFyDisallowableExpenses -
      prevFyTotalCapitalAdditions,
    [
      prevFyTotalPayouts,
      prevFyStockPurchases,
      prevFyAllowableExpenses,
      prevFyDisallowableExpenses,
      prevFyTotalCapitalAdditions,
    ]
  );

  const prevFyPrototypePlSummary = useMemo(() => {
    const sales = prevFySoldRows.reduce((sum, row) => sum + rowTurnover(row), 0);
    const itemCostTotal = prevFySoldRows.reduce((sum, row) => sum + rowItemCostTotal(row), 0);
    const vatTotal = prevFySoldRows.reduce((sum, row) => sum + rowVatTotal(row), 0);
    const inboundShippingTotal = prevFySoldRows.reduce((sum, row) => sum + rowInboundShippingTotal(row), 0);
    const cogs = itemCostTotal + vatTotal + inboundShippingTotal;
    const fixedAssets = prevFyExpenseRows
      .filter((row) => String(row.operational_category ?? "").trim().toLowerCase() === "equipment")
      .reduce((sum, row) => sum + toNumber(row.amount), 0);
    const amazonFees = prevFySoldRows.reduce((sum, row) => sum + toNumber(row.amazon_fees), 0);
    const miscProductCost =
      prevFySoldRows.reduce((sum, row) => sum + toNumber(row.misc_fees), 0) +
      prevFyPurchaseRows
        .filter((row) => normalizeStatus(row.status) !== "sold")
        .reduce((sum, row) => sum + toNumber(row.misc_fees), 0);
    const shippingRunningCost = prevFyShipmentRows.reduce((sum, row) => sum + shipmentBaseShippingTotal(row), 0);
    const shippingTaxRunningCost = prevFyShipmentRows.reduce((sum, row) => sum + shipmentTaxTotal(row), 0);
    const customerReturnFee = prevFySoldRows.reduce(
      (sum, row) =>
        sum +
        toNumber(row.return_shipping_fee) +
        toNumber(row.customer_return_fee) +
        toNumber(row.return_fee_from_customer) +
        toNumber(row.customer_return_charge) +
        toNumber(row.return_postage_charge),
      0
    );
    const fbmShippingFee = prevFySoldRows.reduce(
      (sum, row) => sum + (row.fbm_shipping_fee != null ? toNumber(row.fbm_shipping_fee) : toNumber(row.ship_fee)),
      0
    );
    const writeOffCost = prevFyWrittenOffRows.reduce(
      (sum, row) => sum + rowItemCostTotal(row) + rowVatTotal(row) + rowInboundShippingTotal(row),
      0
    );
    const otherOperatingCost = prevFyExpenseRows
      .filter((row) => String(row.operational_category ?? "").trim().toLowerCase() !== "equipment")
      .reduce((sum, row) => sum + toNumber(row.amount), 0);
    const runningExpenses =
      amazonFees +
      miscProductCost +
      shippingRunningCost +
      shippingTaxRunningCost +
      customerReturnFee +
      fbmShippingFee +
      writeOffCost +
      otherOperatingCost;

    return {
      sales,
      cogs,
      fixedAssets,
      runningExpenses,
    };
  }, [prevFySoldRows, prevFyWrittenOffRows, prevFyShipmentRows, prevFyExpenseRows]);

  const prevFyFundingInSummary = useMemo(
    () =>
      prevFyFinanceRows
        .filter((row) => financeDirectionFromType(row.transaction_type ?? row.type) === "in")
        .reduce((sum, row) => sum + safeNumber(row.amount), 0),
    [prevFyFinanceRows]
  );

  const prevFyFundingOutSummary = useMemo(
    () =>
      prevFyFinanceRows
        .filter((row) => financeDirectionFromType(row.transaction_type ?? row.type) === "out" || isTaxPaymentFinanceRow(row))
        .reduce((sum, row) => sum + safeNumber(row.amount), 0),
    [prevFyFinanceRows]
  );

  const prototypeBalanceByYear = useMemo(() => {
    const allDates: Date[] = [];

    const pushDate = (value: unknown) => {
      const d = parseDate(value);
      if (d) allDates.push(d);
    };

    purchaseRows.forEach((row) => {
      pushDate(row.purchase_date ?? row.created_at);
      pushDate(row.order_date ?? row.sold_date ?? row.sale_date ?? row.created_at);
      pushDate(row.write_off_date ?? row.written_off_date ?? row.removed_date ?? row.updated_at ?? row.created_at);
    });
    allExpenseRows.forEach((row) => pushDate(row.expense_date));
    shipmentRows.forEach((row) => pushDate(row.shipment_date ?? row.sent_date ?? row.shipped_date ?? row.created_at));
    financeRows.forEach((row) => pushDate(row.entry_date ?? row.date ?? row.finance_date ?? row.created_at));

    const currentStartYear = Number(fyLabel.split("-")[0]);
    const minStartYear = allDates.length
      ? Math.min(
          ...allDates.map((d) => {
            const y = d.getFullYear();
            const apr6 = new Date(y, 3, 6);
            return d >= apr6 ? y : y - 1;
          })
        )
      : currentStartYear;

    let openingBalance = 0;
    const byYear = new Map<string, { openingBalance: number; closingBalance: number; periodMovement: number }>();

    for (let startYear = minStartYear; startYear <= currentStartYear; startYear++) {
      const label = `${startYear}-${startYear + 1}`;
      const bounds = getFyBounds(label);

      const purchaseRowsForYear = purchaseRows.filter((row) =>
        inDateRange(parseDate(row.purchase_date ?? row.created_at), bounds.start, bounds.end)
      );

      const soldRows = purchaseRows.filter(
        (row) =>
          normalizeStatus(row.status) === "sold" &&
          inDateRange(parseDate(row.order_date ?? row.created_at), bounds.start, bounds.end)
      );

      const writtenOffRows = purchaseRows.filter(
        (row) =>
          normalizeStatus(row.status) === "written_off" &&
          inDateRange(
            parseDate(
              row.write_off_date ??
                row.written_off_date ??
                row.removed_date ??
                row.updated_at ??
                row.created_at
            ),
            bounds.start,
            bounds.end
          )
      );

      const expenseRowsForYear = allExpenseRows.filter((row) =>
        inDateRange(parseDate(row.expense_date), bounds.start, bounds.end)
      );

      const shipmentRowsForYear = shipmentRows.filter((row) =>
        inDateRange(
          parseDate(row.shipment_date ?? row.sent_date ?? row.shipped_date ?? row.created_at),
          bounds.start,
          bounds.end
        )
      );

      const financeRowsForYear = financeRows.filter((row) =>
        inDateRange(parseDate(row.entry_date ?? row.date ?? row.finance_date ?? row.created_at), bounds.start, bounds.end)
      );

      const sales = moneyValue(soldRows.reduce((sum, row) => sum + rowTurnover(row), 0));
      const cogs = moneyValue(
        purchaseRowsForYear.reduce((sum, row) => sum + rowValueAtCost(row), 0)
      );

      const fixedAssets = moneyValue(
        expenseRowsForYear
          .filter((row) => String(row.operational_category ?? "").trim().toLowerCase() === "equipment")
          .reduce((sum, row) => sum + toNumber(row.amount), 0)
      );

      const amazonFees = moneyValue(soldRows.reduce((sum, row) => sum + toNumber(row.amazon_fees), 0));
      const miscProductCost = moneyValue(
        soldRows.reduce((sum, row) => sum + toNumber(row.misc_fees), 0) +
          purchaseRowsForYear
            .filter((row) => normalizeStatus(row.status) !== "sold")
            .reduce((sum, row) => sum + toNumber(row.misc_fees), 0)
      );
      const shippingRunningCost = moneyValue(shipmentRowsForYear.reduce((sum, row) => sum + shipmentBaseShippingTotal(row), 0));
      const shippingTaxRunningCost = moneyValue(shipmentRowsForYear.reduce((sum, row) => sum + shipmentTaxTotal(row), 0));
      const customerReturnFee = moneyValue(
        purchaseRows
          .filter((row) => rowReturnFee(row) > 0 && inDateRange(rowReturnFeeDate(row), bounds.start, bounds.end))
          .reduce((sum, row) => sum + rowReturnFee(row), 0)
      );
      const fbmShippingFee = moneyValue(
        purchaseRows
          .filter((row) => rowFbmShippingFee(row) > 0 && inDateRange(rowFbmShippingDate(row), bounds.start, bounds.end))
          .reduce((sum, row) => sum + rowFbmShippingFee(row), 0)
      );
      const writeOffCost = moneyValue(
        writtenOffRows.reduce((sum, row) => sum + rowValueAtCost(row), 0)
      );
      const otherOperatingCost = moneyValue(
        expenseRowsForYear
          .filter((row) => String(row.operational_category ?? "").trim().toLowerCase() !== "equipment")
          .reduce((sum, row) => sum + toNumber(row.amount), 0)
      );
      const loanInterestCost = moneyValue(
        financeRowsForYear
          .filter(isLoanInterestFinanceRow)
          .reduce((sum, row) => sum + safeNumber(row.amount), 0)
      );

      const runningExpenses = moneyValue(
        amazonFees +
        miscProductCost +
        shippingRunningCost +
        shippingTaxRunningCost +
        customerReturnFee +
        fbmShippingFee +
        writeOffCost +
        loanInterestCost +
        otherOperatingCost
      );

      const financeIn = moneyValue(
        financeRowsForYear
          .filter((row) => financeDirectionFromType(row.transaction_type ?? row.type) === "in")
          .reduce((sum, row) => sum + safeNumber(row.amount), 0)
      );

      const financeOut = moneyValue(
        financeRowsForYear
          .filter((row) => (financeDirectionFromType(row.transaction_type ?? row.type) === "out" || isTaxPaymentFinanceRow(row)) && !isLoanInterestFinanceRow(row))
          .reduce((sum, row) => sum + safeNumber(row.amount), 0)
      );

      const cleanOpeningBalance = moneyValue(openingBalance);
      const periodMovement = moneyValue(financeIn - financeOut + sales - cogs - runningExpenses - fixedAssets);
      const closingBalance = moneyValue(cleanOpeningBalance + periodMovement);

      byYear.set(label, { openingBalance: cleanOpeningBalance, closingBalance, periodMovement });
      openingBalance = closingBalance;
    }

    return byYear;
  }, [allExpenseRows, financeRows, fyLabel, purchaseRows, shipmentRows]);

  const prevFyDisplayedClosingBalance = useMemo(
    () => prototypeBalanceByYear.get(prevFyLabel)?.closingBalance ?? 0,
    [prevFyLabel, prototypeBalanceByYear]
  );

  const financeBreakdown = useMemo(() => {
    const categories = ["Director", "Loans", "Dividends", "Salary"] as const;
    const bucketRows = categories.map((label) => {
      const rows = activeFinanceRows.filter((row) => String(row.category ?? "").toLowerCase() === label.toLowerCase());
      return {
        label,
        rows,
        total: sumAmountRows(rows, (row) => row.amount),
      };
    });

    return {
      director: bucketRows[0],
      loans: bucketRows[1],
      dividends: bucketRows[2],
      salary: bucketRows[3],
      total: bucketRows.reduce((sum, bucket) => sum + bucket.total, 0),
    };
  }, [activeFinanceRows]);

  const fundingInRows = useMemo(
    () => activeFinanceRows.filter((row) => financeDirectionFromType(row.transaction_type ?? row.type) === "in"),
    [activeFinanceRows]
  );

  const fundingOutRows = useMemo(
    () => activeFinanceRows.filter((row) => (financeDirectionFromType(row.transaction_type ?? row.type) === "out" || isTaxPaymentFinanceRow(row)) && !isLoanInterestFinanceRow(row)),
    [activeFinanceRows]
  );

  const fundingInSummary = useMemo(() => {
    const byType = new Map<string, number>();
    for (const row of fundingInRows) {
      const key = financeTypeLabel(row.transaction_type ?? row.type);
      byType.set(key, (byType.get(key) ?? 0) + safeNumber(row.amount));
    }
    const rows = Array.from(byType.entries()).map(([label, total]) => ({ label, total }));
    return { rows, total: rows.reduce((sum, row) => sum + row.total, 0) };
  }, [fundingInRows]);

  const fundingOutSummary = useMemo(() => {
    const byType = new Map<string, number>();
    for (const row of fundingOutRows) {
      const key = financeTypeLabel(row.transaction_type ?? row.type);
      byType.set(key, (byType.get(key) ?? 0) + safeNumber(row.amount));
    }
    const rows = Array.from(byType.entries()).map(([label, total]) => ({ label, total }));
    return { rows, total: rows.reduce((sum, row) => sum + row.total, 0) };
  }, [fundingOutRows]);

  const prototypeFinanceSummary = useMemo(() => {
    const financeIn = moneyValue(fundingInSummary.total);
    const financeOut = moneyValue(fundingOutSummary.total);
    const netFinance = moneyValue(financeIn - financeOut);

    const sales = prototypePlCards.sales.value;
    const cogs = prototypePlCards.cogs.value;
    const runningExpenses = prototypePlCards.expenses.value;
    const fixedAssets = prototypePlCards.fixed_assets.value;

    const openingBalance = moneyValue(prevFyDisplayedClosingBalance);
    const periodMovement = moneyValue(financeIn - financeOut + sales - cogs - runningExpenses - fixedAssets);
    const netProfit = moneyValue(sales - cogs - runningExpenses);
    const runningBalanceValue = moneyValue(openingBalance + periodMovement);
    const closingBalance = runningBalanceValue;

    return {
      financeIn,
      financeOut,
      netFinance,
      netProfit,
      openingBalance,
      periodMovement,
      runningBalanceValue,
      closingBalance,
      previousYearClosingBalance: moneyValue(prevFyDisplayedClosingBalance),
    };
  }, [
    fundingInSummary.total,
    fundingOutSummary.total,
    prototypePlCards,
    prevFyDisplayedClosingBalance,
  ]);

  const prototypeProfitTaxSummary = useMemo(() => {
    const sales = prototypePlCards.sales.value;
    const cogs = prototypePlCards.cogs.value;
    const fixedAssets = prototypePlCards.fixed_assets.value;
    const runningExpenses = prototypePlCards.expenses.value;

    const grossProfit = sales - cogs;
    const netProfitBeforeTax = grossProfit - runningExpenses;
    const taxableProfit = netProfitBeforeTax - fixedAssets;
    const estimatedTax = taxableProfit > 0 ? taxableProfit * 0.19 : 0;

    return {
      grossProfit,
      netProfitBeforeTax,
      taxableProfit,
      estimatedTax,
    };
  }, [prototypePlCards]);

  const bankReconciliation = useMemo(
    () => ({ expectedClosing: runningBalance, difference: 0 }),
    [runningBalance]
  );

  const financeSummaryRows = useMemo(
    () =>
      [
        ["Director", <span key="fin-dir" className="font-semibold">{money(financeBreakdown.director.total)}</span>, `${financeBreakdown.director.rows.length} row(s)`],
        ["Loans", <span key="fin-loans" className="font-semibold">{money(financeBreakdown.loans.total)}</span>, `${financeBreakdown.loans.rows.length} row(s)`],
        ["Dividends", <span key="fin-div" className="font-semibold">{money(financeBreakdown.dividends.total)}</span>, `${financeBreakdown.dividends.rows.length} row(s)`],
        ["Salary", <span key="fin-sal" className="font-semibold">{money(financeBreakdown.salary.total)}</span>, `${financeBreakdown.salary.rows.length} row(s)`],
        ["Combined Total", <span key="fin-total" className="font-semibold">{money(financeBreakdown.total)}</span>, financeErr ? "Finance source needs review" : "From finance page data"],
      ] as Array<Array<React.ReactNode>>,
    [financeBreakdown, financeErr]
  );

  const financeSummaryTextRows = useMemo(
    () => [
      ["Director", money(financeBreakdown.director.total), `${financeBreakdown.director.rows.length} row(s)`],
      ["Loans", money(financeBreakdown.loans.total), `${financeBreakdown.loans.rows.length} row(s)`],
      ["Dividends", money(financeBreakdown.dividends.total), `${financeBreakdown.dividends.rows.length} row(s)`],
      ["Salary", money(financeBreakdown.salary.total), `${financeBreakdown.salary.rows.length} row(s)`],
      ["Combined Total", money(financeBreakdown.total), financeErr ? "Finance source needs review" : "From finance page data"],
    ],
    [financeBreakdown, financeErr]
  );

  const filingDocumentData = useMemo(() => {
    const taxRatePct = taxableProfit > 0 ? (estTax / taxableProfit) * 100 : 0;
    const section = (title: string, headers: string[], rows: string[][]) => ({ title, headers, rows });

    return {
      ct600: {
        title: "CT600 Working Summary",
        subtitle: `${getRangeLabel(range)} • Draft working view`,
        sections: [
          section("Profit to tax bridge", ["Line", "Value"], [
            ["Turnover", money(turnover)],
            ["Opening Stock", money(openingStock)],
            ["Purchases (Stock)", money(stockPurchases)],
            ["Closing Stock", money(closingStock)],
            ["Cost of Goods Sold", money(cogs)],
            ["Gross Profit", money(grossProfit)],
            ["Allowable Expenses", money(allowableExpenses)],
            ["Disallowable Expenses", money(disallowableExpenses)],
            ["Net Profit Before Tax", money(netProfit)],
            ["Capital Additions", money(totalCapitalAdditions)],
            ["Capital Allowances Estimate", money(capitalAllowancesEstimate)],
            ["Taxable Profit Estimate", money(taxableProfit)],
            ["Corporation Tax Estimate", money(estTax)],
          ]),
          section(
            "Checks",
            ["Check", "Status"],
            filingWarnings.length === 0
              ? [["Draft checks", "No obvious warnings"]]
              : filingWarnings.map((warning) => [warning, "Review"])
          ),
          section("Stock ageing", ["Bucket", "Units", "Value"], [
            ["Over 45 days", String(stockAgeingBuckets.over45.units), money(stockAgeingBuckets.over45.value)],
            ["Over 90 days", String(stockAgeingBuckets.over90.units), money(stockAgeingBuckets.over90.value)],
            ["Over 180 days", String(stockAgeingBuckets.over180.units), money(stockAgeingBuckets.over180.value)],
          ]),
          section("Finance summary", ["Category", "Amount", "Source"], financeSummaryTextRows),
        ],
      },
      pl: {
        title: "Profit & Loss",
        subtitle: `${getRangeLabel(range)} • Working draft`,
        sections: [
          section("Income", ["Line", "Value"], [["Turnover", money(turnover)]]),
          section("Cost of sales", ["Line", "Value"], [
            ["Opening Stock", money(openingStock)],
            ["+ Purchases", money(stockPurchases)],
            ["- Closing Stock", money(closingStock)],
            ["= Cost of Goods Sold", money(cogs)],
          ]),
          section("Operating result", ["Line", "Value"], [
            ["Gross Profit", money(grossProfit)],
            ["Allowable Expenses", money(allowableExpenses)],
            ["Disallowable Expenses", money(disallowableExpenses)],
            ["Profit Before Tax", money(accountsProfitBeforeTax)],
            ["Corporation Tax Estimate", money(estTax)],
            ["Estimated Profit After Tax", money(estimatedProfitAfterTax)],
          ]),
        ],
      },
      balance_sheet: {
        title: "Balance Sheet Snapshot",
        subtitle: `${getRangeLabel(range)} • Working draft`,
        sections: [
          section("Assets", ["Line", "Value"], [
            ["Closing Stock", money(closingStock)],
            ["Cash Running Balance", money(runningBalance)],
            ["Current Assets Estimate", money(estimatedCurrentAssets)],
            ["Fixed Assets Estimate", money(estimatedFixedAssets)],
          ]),
          section("Liabilities and equity", ["Line", "Value"], [
            ["Corporation Tax Estimate", money(estimatedCurrentLiabilities)],
            ["Net Assets Estimate", money(estimatedNetAssets)],
          ]),
          section("Extra checks", ["Line", "Value"], [
            [
              "Balance sheet check",
              Math.abs((estimatedCurrentAssets + estimatedFixedAssets) - (estimatedCurrentLiabilities + estimatedNetAssets)) <= 0.01
                ? "Balanced"
                : "Review",
            ],
            ["Tax rate on taxable profit", `${taxRatePct.toFixed(2)}%`],
            ["Units in stock", String(totalUnitsInStock)],
          ]),
        ],
      },
    } as const;
  }, [
    accountsProfitBeforeTax,
    allowableExpenses,
    capitalAllowancesEstimate,
    cogs,
    closingStock,
    disallowableExpenses,
    estimatedCurrentAssets,
    estimatedCurrentLiabilities,
    estimatedFixedAssets,
    estimatedNetAssets,
    estimatedProfitAfterTax,
    estTax,
    filingWarnings,
    financeSummaryTextRows,
    grossProfit,
    netProfit,
    openingStock,
    range,
    runningBalance,
    stockAgeingBuckets,
    stockPurchases,
    taxableProfit,
    totalCapitalAdditions,
    totalUnitsInStock,
    turnover,
  ]);

  const activeFilingDocument = filingPopupView ? filingDocumentData[filingPopupView] : null;

  const exportFilingDocumentPdf = (view: "ct600" | "pl" | "balance_sheet") => {
    const doc = filingDocumentData[view];
    if (!doc || typeof window === "undefined") return;

    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const emphasisPattern = /(total|profit|tax|assets|liabilities|equity|turnover|cost|closing stock|opening stock|net assets)/i;

    const sectionsHtml = doc.sections
      .map(
        (section) => `
          <section class="section-block">
            <div class="section-title">${escapeHtml(section.title)}</div>
            <table class="report-table">
              <thead>
                <tr>
                  ${section.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}
                </tr>
              </thead>
              <tbody>
                ${section.rows
                  .map((row) => {
                    const rowText = row.join(" ");
                    const rowClass = emphasisPattern.test(rowText) ? "emphasis-row" : "";
                    return `<tr class="${rowClass}">${row
                      .map((cell, idx) => `<td class="${idx === row.length - 1 ? "num" : ""}">${escapeHtml(cell)}</td>`)
                      .join("")}</tr>`;
                  })
                  .join("")}
              </tbody>
            </table>
          </section>
        `
      )
      .join("");

    const popup = window.open("", "_blank", "width=1020,height=920");
    if (!popup) return;
    popup.document.open();
    popup.document.write(`<!doctype html>
      <html>
        <head>
          <title>${escapeHtml(doc.title)}</title>
          <meta charset="utf-8" />
          <style>
            @page { size: A4; margin: 14mm; }
            * { box-sizing: border-box; }
            body {
              font-family: Arial, Helvetica, sans-serif;
              color: #171717;
              margin: 0;
              background: #f5f5f5;
            }
            .page {
              width: 100%;
              max-width: 860px;
              margin: 0 auto;
              background: #fff;
              min-height: 100vh;
              padding: 28px 30px 24px;
            }
            .header {
              display: flex;
              justify-content: space-between;
              gap: 20px;
              align-items: flex-start;
              border-bottom: 2px solid #171717;
              padding-bottom: 16px;
            }
            .company {
              font-size: 12px;
              text-transform: uppercase;
              letter-spacing: 0.08em;
              color: #525252;
              margin-bottom: 8px;
            }
            .title {
              margin: 0;
              font-size: 28px;
              line-height: 1.1;
            }
            .subtitle {
              margin-top: 6px;
              font-size: 13px;
              color: #525252;
            }
            .meta {
              text-align: right;
              font-size: 12px;
              color: #525252;
              line-height: 1.7;
            }
            .section-block {
              margin-top: 24px;
            }
            .section-title {
              font-size: 13px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.08em;
              color: #404040;
              margin-bottom: 10px;
            }
            .report-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 12px;
              border: 1px solid #d4d4d4;
            }
            .report-table th {
              text-align: left;
              padding: 9px 10px;
              border-bottom: 1px solid #d4d4d4;
              background: #f5f5f5;
              color: #404040;
              font-weight: 700;
            }
            .report-table td {
              padding: 9px 10px;
              border-top: 1px solid #e5e5e5;
              vertical-align: top;
            }
            .report-table td.num { text-align: right; white-space: nowrap; }
            .report-table tr.emphasis-row td {
              font-weight: 700;
              background: #fafafa;
            }
            .footer {
              margin-top: 24px;
              padding-top: 12px;
              border-top: 1px solid #d4d4d4;
              display: flex;
              justify-content: space-between;
              gap: 16px;
              font-size: 11px;
              color: #525252;
            }
            .print-note {
              margin-top: 12px;
              font-size: 11px;
              color: #737373;
            }
            @media print {
              body { background: #fff; }
              .page { max-width: none; padding: 0; min-height: auto; }
            }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="header">
              <div>
                <div class="company">${escapeHtml(COMPANY_NAME)}</div>
                <h1 class="title">${escapeHtml(doc.title)}</h1>
                <div class="subtitle">${escapeHtml(doc.subtitle)}</div>
              </div>
              <div class="meta">
                <div>Financial Year: ${escapeHtml(fmtDateFromDate(fyBounds.start))} - ${escapeHtml(fmtDateFromDate(fyBounds.end))}</div>
                <div>Generated: ${escapeHtml(fmtDate(todayISO()))}</div>
                <div>Use for review before filing</div>
              </div>
            </div>
            ${sectionsHtml}
            <div class="print-note">Export uses your browser print dialog. Choose <strong>Save as PDF</strong> to download a PDF copy.</div>
            <div class="footer">
              <div>${escapeHtml(COMPANY_NAME)}</div>
              <div>${escapeHtml(doc.title)}</div>
            </div>
          </div>
        </body>
      </html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const exportPrototypePlPdf = () => {
    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const buildTable = (title: string, headers: string[], rows: string[][]) => `
      <section class="section-block">
        <div class="section-title">${escapeHtml(title)}</div>
        <table class="report-table">
          <thead>
            <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row) =>
                  `<tr>${row
                    .map((cell, idx) => `<td class="${idx === row.length - 1 ? "num" : ""}">${escapeHtml(cell)}</td>`)
                    .join("")}</tr>`
              )
              .join("")}
          </tbody>
        </table>
      </section>
    `;

    const sections = [
      buildTable("Summary", ["Line", "Amount"], [
        ["Sales", money(prototypePlCards.sales.value)],
        ["Cost of Goods", money(prototypePlCards.cogs.value)],
        ["Gross Profit", money(prototypeProfitTaxSummary.grossProfit)],
        ["Fixed Assets", money(prototypePlCards.fixed_assets.value)],
        ["Business Running Expenses", money(prototypePlCards.expenses.value)],
        ["Net Profit / Loss", money(prototypePlCards.final_pl.value)],
      ]),
      buildTable("Sales Breakdown", ["Line", "Amount"], prototypePlCards.sales.lines.map((row) => [row.label, money(row.value)])),
      buildTable("Cost of Goods Breakdown", ["Line", "Amount"], prototypePlCards.cogs.lines.map((row) => [row.label, money(row.value)])),
      buildTable("Fixed Assets Breakdown", ["Line", "Amount"], prototypePlCards.fixed_assets.lines.map((row) => [row.label, money(row.value)])),
      buildTable("Business Running Expenses Breakdown", ["Line", "Amount"], prototypePlCards.expenses.lines.map((row) => [row.label, money(row.value)])),
      buildTable("Final P&L Breakdown", ["Line", "Amount"], prototypePlCards.final_pl.lines.map((row) => [row.label, money(row.value)])),
      buildTable("Opening Balance Breakdown", ["Line", "Amount"], [
        ["Previous financial year", prevFyLabel],
        ["Previous year closing balance", money(prototypeFinanceSummary.previousYearClosingBalance)],
        ["Opening Balance", money(prototypeFinanceSummary.openingBalance)],
      ]),
      buildTable("Finance In Breakdown", ["Line", "Amount"], fundingInSummary.rows.length > 0 ? fundingInSummary.rows.map((row) => [row.label, money(row.total)]) : [["No finance in rows found", money(0)]]),
      buildTable("Finance Out Breakdown", ["Line", "Amount"], fundingOutSummary.rows.length > 0 ? fundingOutSummary.rows.map((row) => [row.label, money(row.total)]) : [["No finance out rows found", money(0)]]),
      buildTable("Net Finance Breakdown", ["Line", "Amount"], [
        ["Finance In", money(prototypeFinanceSummary.financeIn)],
        ["Finance Out", money(prototypeFinanceSummary.financeOut)],
        ["Net Finance", money(prototypeFinanceSummary.netFinance)],
      ]),
      buildTable("Running Balance Breakdown", ["Line", "Amount"], [
        ["Opening Balance", money(prototypeFinanceSummary.openingBalance)],
        ["Finance In", money(prototypeFinanceSummary.financeIn)],
        ["Finance Out", `(${money(prototypeFinanceSummary.financeOut)})`],
        ["Sales", money(prototypePlCards.sales.value)],
        ["Cost of Goods", `(${money(prototypePlCards.cogs.value)})`],
        ["Business Running Expenses", `(${money(prototypePlCards.expenses.value)})`],
        ["Fixed Assets", `(${money(prototypePlCards.fixed_assets.value)})`],
        ["Closing Balance", money(prototypeFinanceSummary.closingBalance)],
      ]),
      buildTable("Closing Balance Breakdown", ["Line", "Amount"], [
        ["Opening Balance", money(prototypeFinanceSummary.openingBalance)],
        ["Period Movement", money(prototypeFinanceSummary.periodMovement)],
        ["Closing Balance", money(prototypeFinanceSummary.closingBalance)],
      ]),
      buildTable("Gross Profit Breakdown", ["Line", "Amount"], [
        ["Sales", money(prototypePlCards.sales.value)],
        ["Cost of Goods", `(${money(prototypePlCards.cogs.value)})`],
        ["Gross Profit", money(prototypeProfitTaxSummary.grossProfit)],
      ]),
      buildTable("Net Profit Before Tax Breakdown", ["Line", "Amount"], [
        ["Gross Profit", money(prototypeProfitTaxSummary.grossProfit)],
        ["Business Running Expenses", `(${money(prototypePlCards.expenses.value)})`],
        ["Net Profit Before Tax", money(prototypeProfitTaxSummary.netProfitBeforeTax)],
      ]),
      buildTable("Taxable Profit Breakdown", ["Line", "Amount"], [
        ["Net Profit Before Tax", money(prototypeProfitTaxSummary.netProfitBeforeTax)],
        ["Fixed Assets", `(${money(prototypePlCards.fixed_assets.value)})`],
        ["Taxable Profit", money(prototypeProfitTaxSummary.taxableProfit)],
      ]),
      buildTable("Estimated Tax Breakdown", ["Line", "Amount"], [
        ["Taxable Profit", money(prototypeProfitTaxSummary.taxableProfit)],
        ["Estimated Tax Rate", "19%"],
        ["Estimated Tax", money(prototypeProfitTaxSummary.estimatedTax)],
      ]),
    ].join("");

    openPrintWindow(
      "Profit & Loss Export",
      `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(COMPANY_NAME)} - P&L Export</title>
          <style>
            @page { size: A4; margin: 14mm; }
            * { box-sizing: border-box; }
            body { font-family: Arial, Helvetica, sans-serif; background: #f5f5f5; color: #171717; margin: 0; }
            .page { max-width: 980px; margin: 0 auto; background: white; min-height: 100vh; padding: 28px; }
            .header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; border-bottom: 2px solid #171717; padding-bottom: 16px; }
            .company { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #525252; margin-bottom: 8px; }
            .title { margin: 0; font-size: 28px; line-height: 1.1; }
            .subtitle { margin-top: 6px; font-size: 13px; color: #525252; }
            .meta { text-align: right; font-size: 12px; color: #525252; line-height: 1.7; }
            .section-block { margin-top: 24px; }
            .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #404040; margin-bottom: 10px; }
            .report-table { width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #d4d4d4; }
            .report-table th { text-align: left; padding: 9px 10px; border-bottom: 1px solid #d4d4d4; background: #f5f5f5; color: #404040; font-weight: 700; }
            .report-table td { padding: 9px 10px; border-top: 1px solid #e5e5e5; vertical-align: top; }
            .report-table td.num { text-align: right; white-space: nowrap; }
            .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #d4d4d4; display: flex; justify-content: space-between; gap: 16px; font-size: 11px; color: #525252; }
            .print-note { margin-top: 12px; font-size: 11px; color: #737373; }
            @media print { body { background: #fff; } .page { max-width: none; padding: 0; min-height: auto; } }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="header">
              <div>
                <div class="company">${escapeHtml(COMPANY_NAME)}</div>
                <h1 class="title">Profit & Loss Export</h1>
                <div class="subtitle">Financial Statements Prototype for ${escapeHtml(getRangeLabel(range))}</div>
              </div>
              <div class="meta">
                <div>Financial Year: ${escapeHtml(fmtDateFromDate(fyBounds.start))} - ${escapeHtml(fmtDateFromDate(fyBounds.end))}</div>
                <div>Generated: ${escapeHtml(fmtDate(todayISO()))}</div>
                <div>Use browser Save as PDF</div>
              </div>
            </div>

            ${sections}

            <div class="print-note">Export uses your browser print dialog. Choose <strong>Save as PDF</strong> to download a PDF copy.</div>
            <div class="footer">
              <div>${escapeHtml(COMPANY_NAME)}</div>
              <div>Financial Statements Prototype</div>
            </div>
          </div>
        </body>
      </html>`
    );
  };

  const hmrcDetailData = useMemo(() => {
    const stockRowToCells = (row: PurchaseDashboardRow) => [
      fmtDate(String(row.purchase_date ?? row.created_at ?? "")),
      row.product?.asin ?? "—",
      row.product?.brand ?? "—",
      row.product?.product_name ?? "—",
      String(Math.max(1, rowQty(row))),
      <span key={`stock-${row.id}`} className="font-semibold">
        {money(rowValueAtCost(row))}
      </span>,
    ];

    const soldRowToCells = (row: PurchaseDashboardRow, amount: number) => [
      fmtDate(String(row.order_date ?? row.sold_date ?? row.sale_date ?? row.created_at ?? "")),
      row.product?.asin ?? "—",
      row.product?.brand ?? "—",
      row.product?.product_name ?? "—",
      String(Math.max(1, rowQty(row))),
      <span key={`sold-${row.id}`} className="font-semibold">
        {money(amount)}
      </span>,
    ];

    const expenseRowToCells = (row: ExpenseRow) => [
      fmtDate(row.expense_date),
      row.operational_category,
      row.item,
      <span key={`exp-${row.id ?? row.expense_date}-${row.item}`} className="font-semibold">
        {money(row.amount)}
      </span>,
    ];

    const payoutRowToCells = (row: PayoutRow) => [
      fmtDate(row.payout_date),
      row.reference ?? "—",
      <span key={`pay-${row.id ?? row.payout_date}`} className="font-semibold">
        {money(row.amount)}
      </span>,
    ];

    return {
      turnover: {
        title: "Turnover",
        subtitle: `Selected timeframe • ${money(turnover)}`,
        headers: ["Date", "ASIN", "Brand", "Product", "Qty", "Sale"],
        rows: activeSoldRows.map((row) => soldRowToCells(row, rowTurnover(row))),
      },
      opening_stock: {
        title: "Opening Stock",
        subtitle: `Previous FY closing stock (${prevFyLabel}) • ${money(openingStock)}`,
        headers: ["Purchase", "ASIN", "Brand", "Product", "Qty", "Cost"],
        rows: openingStockRows.map(stockRowToCells),
      },
      current_assets: {
        title: "Current Assets",
        subtitle: `Cash running balance + closing stock = ${money(estimatedCurrentAssets)}`,
        headers: ["Component", "Amount"],
        rows: [
          ["Cash Running Balance", <span key="ca-cash" className="font-semibold">{money(runningBalance)}</span>],
          ["+ Closing Stock", <span key="ca-stock" className="font-semibold">{money(closingStock)}</span>],
          ["= Current Assets", <span key="ca-total" className="font-semibold">{money(estimatedCurrentAssets)}</span>],
        ],
      },
      purchases_stock: {
        title: "Purchases (Stock)",
        subtitle: `Selected timeframe • ${money(stockPurchases)}`,
        headers: ["Purchase", "ASIN", "Brand", "Product", "Qty", "Cost"],
        rows: stockPurchaseRows.map(stockRowToCells),
      },
      closing_stock: {
        title: "Closing Stock",
        subtitle: `${fyLabel} closing stock snapshot • ${money(closingStock)}`,
        headers: ["Purchase", "ASIN", "Brand", "Product", "Qty", "Cost"],
        rows: closingStockRows.map(stockRowToCells),
      },
      cost_of_sales: {
        title: "Cost of Sales",
        subtitle: `Opening stock + purchases - closing stock = ${money(cogs)}`,
        headers: ["Component", "Amount"],
        rows: [
          ["Opening Stock", <span key="cogs-open" className="font-semibold">{money(openingStock)}</span>],
          ["+ Purchases (Stock)", <span key="cogs-pur" className="font-semibold">{money(stockPurchases)}</span>],
          ["- Closing Stock", <span key="cogs-close" className="font-semibold">{money(closingStock)}</span>],
          ["= Cost of Sales", <span key="cogs-total" className="font-semibold">{money(cogs)}</span>],
        ],
      },
      gross_profit: {
        title: "Gross Profit",
        subtitle: `Turnover - cost of sales = ${money(grossProfit)}`,
        headers: ["Component", "Amount"],
        rows: [
          ["Turnover", <span key="gp-turn" className="font-semibold">{money(turnover)}</span>],
          ["- Cost of Sales", <span key="gp-cogs" className="font-semibold">{money(cogs)}</span>],
          ["= Gross Profit", <span key="gp-total" className="font-semibold">{money(grossProfit)}</span>],
        ],
      },
      net_profit: {
        title: "Net Profit (Before Tax)",
        subtitle: `Gross profit - allowable expenses = ${money(netProfit)}`,
        headers: ["Component", "Amount"],
        rows: [
          ["Gross Profit", <span key="np-gp" className="font-semibold">{money(grossProfit)}</span>],
          ["- Allowable Expenses", <span key="np-allow" className="font-semibold">{money(allowableExpenses)}</span>],
          ["= Net Profit (Before Tax)", <span key="np-total" className="font-semibold">{money(netProfit)}</span>],
        ],
      },
      allowable_expenses: {
        title: "Allowable Expenses",
        subtitle: `Selected timeframe • ${money(allowableExpenses)}`,
        headers: ["Date", "Category", "Item", "Amount"],
        rows: allowableExpenseRows.map(expenseRowToCells),
      },
      disallowable_expenses: {
        title: "Disallowable Expenses",
        subtitle: `Selected timeframe • ${money(disallowableExpenses)}`,
        headers: ["Date", "Category", "Item", "Amount"],
        rows: disallowableExpenseRows.map(expenseRowToCells),
      },
      capital_additions: {
        title: "Capital Additions",
        subtitle: `Purchases + capital expenses • ${money(totalCapitalAdditions)}`,
        headers: ["Source", "Detail", "Amount"],
        rows: [
          ...capitalPurchaseRows.map((row) => [
            "Purchases",
            `${row.product?.asin ?? "—"} • ${row.product?.brand ?? "—"} • ${row.product?.product_name ?? "—"}`,
            <span key={`cap-p-${row.id}`} className="font-semibold">{money(rowValueAtCost(row))}</span>,
          ]),
          ...capitalExpenseRows.map((row) => [
            "Expenses",
            `${fmtDate(row.expense_date)} • ${row.operational_category} • ${row.item}`,
            <span key={`cap-e-${row.id ?? row.expense_date}-${row.item}`} className="font-semibold">{money(row.amount)}</span>,
          ]),
        ],
      },
      capital_allowances: {
        title: "Capital Allowances Est.",
        subtitle: `Currently assumes full relief • ${money(capitalAllowancesEstimate)}`,
        headers: ["Component", "Amount"],
        rows: [
          ["Capital Additions", <span key="ca-add" className="font-semibold">{money(totalCapitalAdditions)}</span>],
          ["Assumed claim", <span key="ca-claim" className="font-semibold">{money(capitalAllowancesEstimate)}</span>],
        ],
      },
      taxable_profit: {
        title: "Taxable Profit Est.",
        subtitle: `Profit after capital allowances • ${money(taxableProfit)}`,
        headers: ["Component", "Amount"],
        rows: [
          ["Gross Profit", <span key="tp-gp" className="font-semibold">{money(grossProfit)}</span>],
          ["- Allowable Expenses", <span key="tp-allow" className="font-semibold">{money(allowableExpenses)}</span>],
          ["- Capital Allowances Est.", <span key="tp-ca" className="font-semibold">{money(capitalAllowancesEstimate)}</span>],
          ["= Taxable Profit Est.", <span key="tp-total" className="font-semibold">{money(taxableProfit)}</span>],
        ],
      },
      corporation_tax: {
        title: "Corporation Tax Est.",
        subtitle: `Estimated using UK corporation tax bands • ${money(estTax)}`,
        headers: ["Component", "Amount"],
        rows: [
          ["Taxable Profit Est.", <span key="ct-profit" className="font-semibold">{money(Math.max(0, taxableProfit))}</span>],
          ["Estimated Corporation Tax", <span key="ct-tax" className="font-semibold">{money(estTax)}</span>],
        ],
      },
      total_payouts: {
        title: "Total Payouts",
        subtitle: `Selected timeframe • ${money(totalPayouts)}`,
        headers: ["Date", "Reference", "Amount"],
        rows: activePayoutRows.map(payoutRowToCells),
      },
      cash_running_balance: {
        title: "Cash Running Balance",
        subtitle: `Payouts - purchases - expenses - capital = ${money(runningBalance)}`,
        headers: ["Component", "Amount"],
        rows: [
          ["Total Payouts", <span key="rb-pay" className="font-semibold">{money(totalPayouts)}</span>],
          ["- Purchases (Stock)", <span key="rb-pur" className="font-semibold">{money(stockPurchases)}</span>],
          ["- Allowable Expenses", <span key="rb-allow" className="font-semibold">{money(allowableExpenses)}</span>],
          ["- Disallowable Expenses", <span key="rb-disallow" className="font-semibold">{money(disallowableExpenses)}</span>],
          ["- Capital Additions", <span key="rb-cap" className="font-semibold">{money(totalCapitalAdditions)}</span>],
          ["= Cash Running Balance", <span key="rb-total" className="font-semibold">{money(runningBalance)}</span>],
        ],
      },
      units_sold: {
        title: "Units Sold",
        subtitle: `Selected timeframe • ${activeSoldRows.reduce((sum, row) => sum + Math.max(1, rowQty(row)), 0)} units`,
        headers: ["Date", "ASIN", "Brand", "Product", "Qty", "Sale"],
        rows: activeSoldRows.map((row) => soldRowToCells(row, rowTurnover(row))),
      },
      stock_ageing_over45: {
        title: "Stock Ageing • Over 45 Days",
        subtitle: `${stockAgeingBuckets.over45.units} units • ${money(stockAgeingBuckets.over45.value)}`,
        headers: ["Check-in", "ASIN", "Brand", "Product", "Age", "Cost"],
        rows: closingStockRows
          .filter((row) => {
            const checkin = rowAmazonCheckinDate(row);
            if (!checkin) return false;
            const ageDays = Math.floor((rangeBounds.end.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24));
            return ageDays > 45;
          })
          .map((row) => {
            const checkin = rowAmazonCheckinDate(row);
            const ageDays = checkin ? Math.floor((rangeBounds.end.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24)) : 0;
            return [
              fmtDate(checkin ? checkin.toISOString().slice(0, 10) : ""),
              row.product?.asin ?? "—",
              row.product?.brand ?? "—",
              row.product?.product_name ?? "—",
              `${ageDays} days`,
              <span key={`sa45-${row.id}`} className="font-semibold">{money(rowValueAtCost(row))}</span>,
            ];
          }),
      },
      stock_ageing_over90: {
        title: "Stock Ageing • Over 90 Days",
        subtitle: `${stockAgeingBuckets.over90.units} units • ${money(stockAgeingBuckets.over90.value)}`,
        headers: ["Check-in", "ASIN", "Brand", "Product", "Age", "Cost"],
        rows: closingStockRows
          .filter((row) => {
            const checkin = rowAmazonCheckinDate(row);
            if (!checkin) return false;
            const ageDays = Math.floor((rangeBounds.end.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24));
            return ageDays > 90;
          })
          .map((row) => {
            const checkin = rowAmazonCheckinDate(row);
            const ageDays = checkin ? Math.floor((rangeBounds.end.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24)) : 0;
            return [
              fmtDate(checkin ? checkin.toISOString().slice(0, 10) : ""),
              row.product?.asin ?? "—",
              row.product?.brand ?? "—",
              row.product?.product_name ?? "—",
              `${ageDays} days`,
              <span key={`sa90-${row.id}`} className="font-semibold">{money(rowValueAtCost(row))}</span>,
            ];
          }),
      },
      stock_ageing_over180: {
        title: "Stock Ageing • Over 180 Days",
        subtitle: `${stockAgeingBuckets.over180.units} units • ${money(stockAgeingBuckets.over180.value)}`,
        headers: ["Check-in", "ASIN", "Brand", "Product", "Age", "Cost"],
        rows: closingStockRows
          .filter((row) => {
            const checkin = rowAmazonCheckinDate(row);
            if (!checkin) return false;
            const ageDays = Math.floor((rangeBounds.end.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24));
            return ageDays > 180;
          })
          .map((row) => {
            const checkin = rowAmazonCheckinDate(row);
            const ageDays = checkin ? Math.floor((rangeBounds.end.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24)) : 0;
            return [
              fmtDate(checkin ? checkin.toISOString().slice(0, 10) : ""),
              row.product?.asin ?? "—",
              row.product?.brand ?? "—",
              row.product?.product_name ?? "—",
              `${ageDays} days`,
              <span key={`sa180-${row.id}`} className="font-semibold">{money(rowValueAtCost(row))}</span>,
            ];
          }),
      },
      finance_summary: {
        title: "Finance Summary",
        subtitle: `${getRangeLabel(range)} • ${money(financeBreakdown.total)}`,
        headers: ["Category", "Amount", "Source"],
        rows: financeSummaryRows,
      },
      funding_in: {
        title: "Funding In",
        subtitle: `${getRangeLabel(range)} • ${money(fundingInSummary.total)}`,
        headers: ["Category", "Amount"],
        rows: fundingInSummary.rows.map((row) => [row.label, <span key={`fin-in-${row.label}`} className="font-semibold">{money(row.total)}</span>]),
      },
      funding_out: {
        title: "Funding Out",
        subtitle: `${getRangeLabel(range)} • ${money(fundingOutSummary.total)}`,
        headers: ["Category", "Amount"],
        rows: fundingOutSummary.rows.map((row) => [row.label, <span key={`fin-out-${row.label}`} className="font-semibold">{money(row.total)}</span>]),
      },
      net_finance: {
        title: "Net Finance",
        subtitle: `${getRangeLabel(range)} • ${money(prototypeFinanceSummary.netFinance)}`,
        headers: ["Line", "Amount"],
        rows: [
          ["Finance In", <span key="net-fin-in" className="font-semibold">{money(prototypeFinanceSummary.financeIn)}</span>],
          ["Finance Out", <span key="net-fin-out" className="font-semibold">{money(prototypeFinanceSummary.financeOut)}</span>],
          ["Net Finance", <span key="net-fin-total" className="font-semibold">{money(prototypeFinanceSummary.netFinance)}</span>],
        ],
      },
      prototype_opening_balance: {
        title: "Opening Balance",
        subtitle: `${prevFyLabel} closing balance carried into ${fyLabel}`,
        headers: ["Line", "Amount"],
        rows: [
          ["Previous financial year", <span key="ob-prev-fy" className="font-semibold">{prevFyLabel}</span>],
          ["Previous year closing balance", <span key="ob-prev-close" className="font-semibold">{money(prototypeFinanceSummary.previousYearClosingBalance)}</span>],
          ["Opening Balance", <span key="ob-total" className="font-semibold">{money(prototypeFinanceSummary.openingBalance)}</span>],
        ],
      },
      prototype_running_balance: {
        title: "Running Balance",
        subtitle: `${getRangeLabel(range)} • ${money(prototypeFinanceSummary.runningBalanceValue)}`,
        headers: ["Line", "Amount"],
        rows: [
          ["Opening Balance", <span key="rb-open" className="font-semibold">{money(prototypeFinanceSummary.openingBalance)}</span>],
          ["Finance In", <span key="rb-fin-in" className="font-semibold">{money(prototypeFinanceSummary.financeIn)}</span>],
          ["Finance Out", <span key="rb-fin-out" className="font-semibold">({money(prototypeFinanceSummary.financeOut)})</span>],
          ["Sales", <span key="rb-sales" className="font-semibold">{money(prototypePlCards.sales.value)}</span>],
          ["Cost of Goods", <span key="rb-cogs" className="font-semibold">({money(prototypePlCards.cogs.value)})</span>],
          ["Business Running Expenses", <span key="rb-exp" className="font-semibold">({money(prototypePlCards.expenses.value)})</span>],
          ["Fixed Assets", <span key="rb-fa" className="font-semibold">({money(prototypePlCards.fixed_assets.value)})</span>],
          ["Closing Balance", <span key="rb-total" className="font-semibold">{money(prototypeFinanceSummary.closingBalance)}</span>],
        ],
      },
      prototype_closing_balance: {
        title: "Closing Balance",
        subtitle: `${getRangeLabel(range)} • ${money(prototypeFinanceSummary.closingBalance)}`,
        headers: ["Line", "Amount"],
        rows: [
          ["Opening Balance", <span key="cb-open" className="font-semibold">{money(prototypeFinanceSummary.openingBalance)}</span>],
          ["Period Movement", <span key="cb-move" className="font-semibold">{money(prototypeFinanceSummary.periodMovement)}</span>],
          ["Closing Balance", <span key="cb-total" className="font-semibold">{money(prototypeFinanceSummary.closingBalance)}</span>],
        ],
      },
      prototype_gross_profit: {
        title: "Gross Profit",
        subtitle: `${getRangeLabel(range)} • ${money(prototypeProfitTaxSummary.grossProfit)}`,
        headers: ["Line", "Amount"],
        rows: [
          ["Sales", <span key="gp-sales" className="font-semibold">{money(prototypePlCards.sales.value)}</span>],
          ["Cost of Goods", <span key="gp-cogs" className="font-semibold">({money(prototypePlCards.cogs.value)})</span>],
          ["Gross Profit", <span key="gp-total" className="font-semibold">{money(prototypeProfitTaxSummary.grossProfit)}</span>],
        ],
      },
      prototype_net_profit_before_tax: {
        title: "Net Profit Before Tax",
        subtitle: `${getRangeLabel(range)} • ${money(prototypeProfitTaxSummary.netProfitBeforeTax)}`,
        headers: ["Line", "Amount"],
        rows: [
          ["Gross Profit", <span key="npbt-gross" className="font-semibold">{money(prototypeProfitTaxSummary.grossProfit)}</span>],
          ["Business Running Expenses", <span key="npbt-exp" className="font-semibold">({money(prototypePlCards.expenses.value)})</span>],
          ["Net Profit Before Tax", <span key="npbt-total" className="font-semibold">{money(prototypeProfitTaxSummary.netProfitBeforeTax)}</span>],
        ],
      },
      prototype_taxable_profit: {
        title: "Taxable Profit",
        subtitle: `${getRangeLabel(range)} • ${money(prototypeProfitTaxSummary.taxableProfit)}`,
        headers: ["Line", "Amount"],
        rows: [
          ["Net Profit Before Tax", <span key="tp-npbt" className="font-semibold">{money(prototypeProfitTaxSummary.netProfitBeforeTax)}</span>],
          ["Fixed Assets", <span key="tp-fa" className="font-semibold">({money(prototypePlCards.fixed_assets.value)})</span>],
          ["Taxable Profit", <span key="tp-total" className="font-semibold">{money(prototypeProfitTaxSummary.taxableProfit)}</span>],
        ],
      },
      prototype_est_tax: {
        title: "Est Tax",
        subtitle: `${getRangeLabel(range)} • ${money(prototypeProfitTaxSummary.estimatedTax)}`,
        headers: ["Line", "Amount"],
        rows: [
          ["Taxable Profit", <span key="et-tp" className="font-semibold">{money(prototypeProfitTaxSummary.taxableProfit)}</span>],
          ["Estimated Tax Rate", <span key="et-rate" className="font-semibold">19%</span>],
          ["Estimated Tax", <span key="et-total" className="font-semibold">{money(prototypeProfitTaxSummary.estimatedTax)}</span>],
        ],
      },
      bank_reconciliation: {
        title: "Bank Reconciliation",
        subtitle: `${getRangeLabel(range)} • ${money(bankReconciliation.expectedClosing)}`,
        headers: ["Component", "Amount"],
        rows: [
          ["Opening balance", <span key="bank-open" className="font-semibold">{money(0)}</span>],
          ["+ Funding In", <span key="bank-in" className="font-semibold">{money(fundingInSummary.total)}</span>],
          ["+ Total Payouts", <span key="bank-payouts" className="font-semibold">{money(totalPayouts)}</span>],
          ["- Purchases (Stock)", <span key="bank-purchases" className="font-semibold">{money(stockPurchases)}</span>],
          ["- Allowable Expenses", <span key="bank-allow" className="font-semibold">{money(allowableExpenses)}</span>],
          ["- Disallowable Expenses", <span key="bank-disallow" className="font-semibold">{money(disallowableExpenses)}</span>],
          ["- Capital Additions", <span key="bank-capital" className="font-semibold">{money(totalCapitalAdditions)}</span>],
          ["- Funding Out", <span key="bank-out" className="font-semibold">{money(fundingOutSummary.total)}</span>],
          ["= Expected Closing Cash", <span key="bank-total" className="font-semibold">{money(bankReconciliation.expectedClosing)}</span>],
        ],
      },
    };
  }, [
    activePayoutRows,
    activeSoldRows,
    allowableExpenseRows,
    allowableExpenses,
    capitalAllowancesEstimate,
    capitalExpenseRows,
    capitalPurchaseRows,
    cogs,
    closingStock,
    closingStockRows,
    disallowableExpenseRows,
    disallowableExpenses,
    estTax,
    estimatedCurrentAssets,
    financeBreakdown.total,
    financeSummaryRows,
    fundingInSummary,
    fundingOutSummary,
    prototypeFinanceSummary,
    prototypeProfitTaxSummary,
    bankReconciliation,
    grossProfit,
    netProfit,
    openingStock,
    openingStockRows,
    range,
    rangeBounds.end,
    prevFyLabel,
    runningBalance,
    stockAgeingBuckets,
    stockPurchaseRows,
    stockPurchases,
    taxableProfit,
    totalCapitalAdditions,
    totalPayouts,
    turnover,
  ]);


  const exportHmrcPrototypeCurrentViewPdf = () => {
    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const buildTable = (title: string, headers: string[], rows: string[][]) => `
      <section class="section">
        <div class="section-title">${escapeHtml(title)}</div>
        <table>
          <thead>
            <tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows.map((row) => `<tr>${row.map((cell, idx) => `<td class="${idx === row.length - 1 ? "num" : ""}">${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </section>
    `;

    const shell = (title: string, subtitle: string, sectionsHtml: string) => `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(title)}</title>
          <style>
            @page { size: A4; margin: 14mm; }
            * { box-sizing: border-box; }
            body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #171717; background: #f5f5f5; }
            .page { max-width: 980px; margin: 0 auto; background: white; min-height: 100vh; padding: 28px; }
            .header { display:flex; justify-content:space-between; gap:24px; align-items:flex-start; border-bottom:2px solid #171717; padding-bottom:16px; }
            .company { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#525252; margin-bottom:8px; }
            .title { margin:0; font-size:28px; line-height:1.1; }
            .subtitle { margin-top:6px; font-size:13px; color:#525252; }
            .meta { text-align:right; font-size:12px; color:#525252; line-height:1.7; }
            .section { margin-top:22px; }
            .section-title { font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#404040; margin-bottom:10px; }
            table { width:100%; border-collapse:collapse; font-size:12px; border:1px solid #d4d4d4; }
            th { text-align:left; padding:9px 10px; border-bottom:1px solid #d4d4d4; background:#f5f5f5; color:#404040; font-weight:700; }
            td { padding:9px 10px; border-top:1px solid #e5e5e5; vertical-align:top; }
            td.num { text-align:right; white-space:nowrap; }
            .footer { margin-top:24px; padding-top:12px; border-top:1px solid #d4d4d4; display:flex; justify-content:space-between; gap:16px; font-size:11px; color:#525252; }
            @media print { body { background:#fff; } .page { max-width:none; min-height:auto; padding:0; } }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="header">
              <div>
                <div class="company">${escapeHtml(COMPANY_NAME)}</div>
                <h1 class="title">${escapeHtml(title)}</h1>
                <div class="subtitle">${escapeHtml(subtitle)}</div>
              </div>
              <div class="meta">
                <div>Financial Year: ${escapeHtml(fmtDateFromDate(fyBounds.start))} - ${escapeHtml(fmtDateFromDate(fyBounds.end))}</div>
                <div>Generated: ${escapeHtml(fmtDate(todayISO()))}</div>
                <div>Prepared for accountant review</div>
              </div>
            </div>
            ${sectionsHtml}
            <div class="footer">
              <div>${escapeHtml(COMPANY_NAME)}</div>
              <div>${escapeHtml(title)}</div>
            </div>
          </div>
        </body>
      </html>`;

    if (hmrcPrototypeView === "overview") {
      const sections = [
        buildTable("Overview Summary", ["Line", "Value"], [
          ["Sales", money(prototypePlCards.sales.value)],
          ["Cost of Goods", money(prototypePlCards.cogs.value)],
          ["Fixed Assets", money(prototypePlCards.fixed_assets.value)],
          ["Business Running Expenses", money(prototypePlCards.expenses.value)],
          ["Final P&L", money(prototypePlCards.final_pl.value)],
          ["Opening Balance", money(prototypeFinanceSummary.openingBalance)],
          ["Closing Balance", money(prototypeFinanceSummary.closingBalance)],
          ["Gross Profit", money(prototypeProfitTaxSummary.grossProfit)],
          ["Net Profit Before Tax", money(prototypeProfitTaxSummary.netProfitBeforeTax)],
          ["Taxable Profit", money(prototypeProfitTaxSummary.taxableProfit)],
          ["Est Tax", money(prototypeProfitTaxSummary.estimatedTax)],
        ]),
        buildTable("Sales Breakdown", ["Line", "Value"], prototypePlCards.sales.lines.map((row) => [row.label, money(row.value)])),
        buildTable("Cost of Goods Breakdown", ["Line", "Value"], prototypePlCards.cogs.lines.map((row) => [row.label, money(row.value)])),
        buildTable("Fixed Assets Breakdown", ["Line", "Value"], prototypePlCards.fixed_assets.lines.map((row) => [row.label, money(row.value)])),
        buildTable("Business Running Expenses Breakdown", ["Line", "Value"], prototypePlCards.expenses.lines.map((row) => [row.label, money(row.value)])),
        buildTable("Final P&L Breakdown", ["Line", "Value"], prototypePlCards.final_pl.lines.map((row) => [row.label, money(row.value)])),
        buildTable("Opening Balance Breakdown", ["Line", "Value"], [
          ["Previous financial year", prevFyLabel],
          ["Previous year closing balance", money(prototypeFinanceSummary.previousYearClosingBalance)],
          ["Opening Balance", money(prototypeFinanceSummary.openingBalance)],
        ]),
        buildTable("Finance In Breakdown", ["Line", "Value"], fundingInSummary.rows.length > 0 ? fundingInSummary.rows.map((row) => [row.label, money(row.total)]) : [["No finance in rows found", money(0)]]),
        buildTable("Finance Out Breakdown", ["Line", "Value"], fundingOutSummary.rows.length > 0 ? fundingOutSummary.rows.map((row) => [row.label, money(row.total)]) : [["No finance out rows found", money(0)]]),
        buildTable("Net Finance Breakdown", ["Line", "Value"], [
          ["Finance In", money(prototypeFinanceSummary.financeIn)],
          ["Finance Out", money(prototypeFinanceSummary.financeOut)],
          ["Net Finance", money(prototypeFinanceSummary.netFinance)],
        ]),
        buildTable("Running Balance Breakdown", ["Line", "Value"], [
          ["Opening Balance", money(prototypeFinanceSummary.openingBalance)],
          ["Finance In", money(prototypeFinanceSummary.financeIn)],
          ["Finance Out", `(${money(prototypeFinanceSummary.financeOut)})`],
          ["Sales", money(prototypePlCards.sales.value)],
          ["Cost of Goods", `(${money(prototypePlCards.cogs.value)})`],
          ["Business Running Expenses", `(${money(prototypePlCards.expenses.value)})`],
          ["Fixed Assets", `(${money(prototypePlCards.fixed_assets.value)})`],
          ["Closing Balance", money(prototypeFinanceSummary.closingBalance)],
        ]),
        buildTable("Closing Balance Breakdown", ["Line", "Value"], [
          ["Opening Balance", money(prototypeFinanceSummary.openingBalance)],
          ["Period Movement", money(prototypeFinanceSummary.periodMovement)],
          ["Closing Balance", money(prototypeFinanceSummary.closingBalance)],
        ]),
        buildTable("Gross Profit Breakdown", ["Line", "Value"], [
          ["Sales", money(prototypePlCards.sales.value)],
          ["Cost of Goods", `(${money(prototypePlCards.cogs.value)})`],
          ["Gross Profit", money(prototypeProfitTaxSummary.grossProfit)],
        ]),
        buildTable("Net Profit Before Tax Breakdown", ["Line", "Value"], [
          ["Gross Profit", money(prototypeProfitTaxSummary.grossProfit)],
          ["Business Running Expenses", `(${money(prototypePlCards.expenses.value)})`],
          ["Net Profit Before Tax", money(prototypeProfitTaxSummary.netProfitBeforeTax)],
        ]),
        buildTable("Taxable Profit Breakdown", ["Line", "Value"], [
          ["Net Profit Before Tax", money(prototypeProfitTaxSummary.netProfitBeforeTax)],
          ["Fixed Assets", `(${money(prototypePlCards.fixed_assets.value)})`],
          ["Taxable Profit", money(prototypeProfitTaxSummary.taxableProfit)],
        ]),
        buildTable("Estimated Tax Breakdown", ["Line", "Value"], [
          ["Taxable Profit", money(prototypeProfitTaxSummary.taxableProfit)],
          ["Estimated Tax Rate", "19%"],
          ["Estimated Tax", money(prototypeProfitTaxSummary.estimatedTax)],
        ]),
      ].join("");
      openPrintWindow("Dashboard Overview Export", shell("Dashboard Overview Export", "Full overview with every prototype calculation line", sections));
      return;
    }

    if (hmrcPrototypeView === "ct600") {
      const sections = [
        buildTable("CT600 Profit to Tax Bridge", ["Line", "Value"], [
          ["Turnover", money(turnover)],
          ["Opening Stock", money(openingStock)],
          ["Purchases (Stock)", money(stockPurchases)],
          ["Closing Stock", money(closingStock)],
          ["Cost of Goods Sold", money(cogs)],
          ["Gross Profit", money(grossProfit)],
          ["Allowable Expenses", money(allowableExpenses)],
          ["Disallowable Expenses", money(disallowableExpenses)],
          ["Net Profit Before Tax", money(netProfit)],
          ["Capital Additions", money(totalCapitalAdditions)],
          ["Capital Allowances Estimate", money(capitalAllowancesEstimate)],
          ["Taxable Profit Estimate", money(taxableProfit)],
          ["Corporation Tax Estimate", money(estTax)],
        ]),
        buildTable("Checks", ["Line", "Value"], (filingWarnings.length ? filingWarnings : ["No obvious warnings"]).map((w, i) => [`Check ${i+1}`, w])),
        buildTable("Stock Ageing", ["Bucket", "Value"], [
          ["Over 45 days", `${stockAgeingBuckets.over45.units} units / ${money(stockAgeingBuckets.over45.value)}`],
          ["Over 90 days", `${stockAgeingBuckets.over90.units} units / ${money(stockAgeingBuckets.over90.value)}`],
          ["Over 180 days", `${stockAgeingBuckets.over180.units} units / ${money(stockAgeingBuckets.over180.value)}`],
        ]),
        buildTable("Finance Summary", ["Category", "Value", "Source"], financeSummaryTextRows.map((row) => [String(row[0]), String(row[1]), String(row[2])])),
      ].join("");
      openPrintWindow("CT600 Export", shell("CT600 Export", "Categorised report for corporation tax working papers", sections));
      return;
    }

    if (hmrcPrototypeView === "pl") {
      const sections = [
        buildTable("P&L Summary", ["Line", "Value"], [
          ["Sales", money(prototypePlCards.sales.value)],
          ["Cost of Goods", money(prototypePlCards.cogs.value)],
          ["Gross Profit", money(prototypeProfitTaxSummary.grossProfit)],
          ["Fixed Assets", money(prototypePlCards.fixed_assets.value)],
          ["Business Running Expenses", money(prototypePlCards.expenses.value)],
          ["Net Profit / Loss", money(prototypePlCards.final_pl.value)],
        ]),
        buildTable("Sales Breakdown", ["Line", "Value"], prototypePlCards.sales.lines.map((row) => [row.label, money(row.value)])),
        buildTable("COGS Breakdown", ["Line", "Value"], prototypePlCards.cogs.lines.map((row) => [row.label, money(row.value)])),
        buildTable("Fixed Assets Breakdown", ["Line", "Value"], prototypePlCards.fixed_assets.lines.map((row) => [row.label, money(row.value)])),
        buildTable("Expenses Breakdown", ["Line", "Value"], prototypePlCards.expenses.lines.map((row) => [row.label, money(row.value)])),
        buildTable("Final P&L Breakdown", ["Line", "Value"], prototypePlCards.final_pl.lines.map((row) => [row.label, money(row.value)])),
      ].join("");
      openPrintWindow("P&L Export", shell("P&L Export", "Full profit and loss with supporting calculation lines", sections));
      return;
    }

    const sections = [
      buildTable("Balance Sheet Summary", ["Line", "Value"], [
        ["Closing Stock", money(closingStock)],
        ["Cash Running Balance", money(runningBalance)],
        ["Current Assets Estimate", money(estimatedCurrentAssets)],
        ["Fixed Assets Estimate", money(estimatedFixedAssets)],
        ["Corporation Tax Estimate", money(estimatedCurrentLiabilities)],
        ["Net Assets Estimate", money(estimatedNetAssets)],
      ]),
      buildTable("Finance Movement", ["Line", "Value"], [
        ["Opening Balance", money(prototypeFinanceSummary.openingBalance)],
        ["Finance In", money(prototypeFinanceSummary.financeIn)],
        ["Finance Out", money(prototypeFinanceSummary.financeOut)],
        ["Period Movement", money(prototypeFinanceSummary.periodMovement)],
        ["Closing Balance", money(prototypeFinanceSummary.closingBalance)],
      ]),
      buildTable("Tax Position", ["Line", "Value"], [
        ["Gross Profit", money(prototypeProfitTaxSummary.grossProfit)],
        ["Net Profit Before Tax", money(prototypeProfitTaxSummary.netProfitBeforeTax)],
        ["Taxable Profit", money(prototypeProfitTaxSummary.taxableProfit)],
        ["Estimated Tax", money(prototypeProfitTaxSummary.estimatedTax)],
      ]),
    ].join("");
    openPrintWindow("Balance Sheet Export", shell("Balance Sheet Export", "Assets, liabilities and supporting movement lines", sections));
  };

  const activeHmrcDetail = hmrcDetailKey ? hmrcDetailData[hmrcDetailKey as keyof typeof hmrcDetailData] : null;

  const exportPerformanceCsv = () => {
    const fileDate = todayISO();

    if (monthlyPerformanceScope === "monthly") {
      exportRowsAsCsv(`monthly_performance_${fileDate}.csv`, [
        ["Meta", "Performance", "View", monthlyPerformanceView === "chart" ? "Monthly Chart" : "Monthly Table"],
        ["Meta", "Performance", "Financial Year", fyLabel],
        ...monthlyPerformanceRows.map((row) => [
          "Monthly Performance",
          row.month,
          "Values",
          [
            `Units Sold: ${row.unitsSold}`,
            `Amazon Fees: ${money(row.amazonFees)}`,
            `Product Cost: ${money(row.productCost)}`,
            `Shipments: ${money(row.shipments)}`,
            `Refunds: ${money(row.refunds)}`,
            `Write Off: ${money(row.writeOff)}`,
            `Miscellaneous: ${money(row.misc)}`,
            `Expenses: ${money(row.expenses)}`,
            `Total Cost: ${money(row.totalCost)}`,
            `Sales: ${money(row.sales)}`,
            `P/L: ${money(row.profitLoss)}`,
            `ROI: ${row.roi == null ? "—" : `${row.roi.toFixed(2)}%`}`,
            `Increase On Previous Month Sale: ${row.salesMoM == null ? "—" : `${row.salesMoM.toFixed(2)}%`}`,
            `AMZ Payout: ${money(row.amzPayout)}`,
          ].join(" | "),
        ] as [string, string, string, string]),
      ]);
      return;
    }

    exportRowsAsCsv(`yearly_performance_${fileDate}.csv`, [
      ["Meta", "Performance", "View", monthlyPerformanceView === "chart" ? "Yearly Chart" : "Yearly Table"],
      ["Meta", "Performance", "Financial Year", yearlyPerformanceSummary.label],
      ["Yearly Performance", "Summary", "Units Sold", String(yearlyPerformanceSummary.unitsSold)],
      ["Yearly Performance", "Summary", "Sales", money(yearlyPerformanceSummary.sales)],
      ["Yearly Performance", "Summary", "P/L", money(yearlyPerformanceSummary.profitLoss)],
      ["Yearly Performance", "Summary", "ROI", yearlyPerformanceSummary.roi == null ? "—" : `${yearlyPerformanceSummary.roi.toFixed(2)}%`],
      ["Yearly Performance", "Summary", "AMZ Payout", money(yearlyPerformanceSummary.amzPayout)],
      ...yearlyPerformanceChartData.map((row) => [
        "Yearly Performance",
        row.metric,
        "Value",
        money(row.value),
      ] as [string, string, string, string]),
    ]);
  };

  const exportPerformancePdf = () => {
    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const buildTable = (title: string, headers: string[], rows: string[][]) => `
      <section class="section">
        <div class="section-title">${escapeHtml(title)}</div>
        <table>
          <thead>
            <tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows.map((row) => `<tr>${row.map((cell, idx) => `<td class="${idx === row.length - 1 ? "num" : ""}">${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </section>
    `;

    const shell = (title: string, subtitle: string, sectionsHtml: string) => `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(title)}</title>
          <style>
            @page { size: A4; margin: 14mm; }
            * { box-sizing: border-box; }
            body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #171717; background: #f5f5f5; }
            .page { max-width: 980px; margin: 0 auto; background: white; min-height: 100vh; padding: 28px; }
            .header { display:flex; justify-content:space-between; gap:24px; align-items:flex-start; border-bottom:2px solid #171717; padding-bottom:16px; }
            .company { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#525252; margin-bottom:8px; }
            .title { margin:0; font-size:28px; line-height:1.1; }
            .subtitle { margin-top:6px; font-size:13px; color:#525252; }
            .meta { text-align:right; font-size:12px; color:#525252; line-height:1.7; }
            .section { margin-top:22px; }
            .section-title { font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#404040; margin-bottom:10px; }
            table { width:100%; border-collapse:collapse; font-size:12px; border:1px solid #d4d4d4; }
            th { text-align:left; padding:9px 10px; border-bottom:1px solid #d4d4d4; background:#f5f5f5; color:#404040; font-weight:700; }
            td { padding:9px 10px; border-top:1px solid #e5e5e5; vertical-align:top; }
            td.num { text-align:right; white-space:nowrap; }
            .footer { margin-top:24px; padding-top:12px; border-top:1px solid #d4d4d4; display:flex; justify-content:space-between; gap:16px; font-size:11px; color:#525252; }
            @media print { body { background:#fff; } .page { max-width:none; min-height:auto; padding:0; } }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="header">
              <div>
                <div class="company">${escapeHtml(COMPANY_NAME)}</div>
                <h1 class="title">${escapeHtml(title)}</h1>
                <div class="subtitle">${escapeHtml(subtitle)}</div>
              </div>
              <div class="meta">
                <div>Financial Year: ${escapeHtml(fmtDateFromDate(fyBounds.start))} - ${escapeHtml(fmtDateFromDate(fyBounds.end))}</div>
                <div>Generated: ${escapeHtml(fmtDate(todayISO()))}</div>
                <div>Prepared for accountant review</div>
              </div>
            </div>
            ${sectionsHtml}
            <div class="footer">
              <div>${escapeHtml(COMPANY_NAME)}</div>
              <div>${escapeHtml(title)}</div>
            </div>
          </div>
        </body>
      </html>`;

    if (monthlyPerformanceScope === "monthly") {
      const sections = [
        buildTable(
          "Monthly Performance",
          [
            "Month",
            "Units Sold",
            "Amazon Fees",
            "Product Cost",
            "Shipments",
            "Refunds",
            "Write Off",
            "Miscellaneous",
            "Expenses",
            "Total Cost",
            "Sales",
            "P/L",
            "ROI",
            "Increase On Previous Month Sale",
            "AMZ Payout",
          ],
          monthlyPerformanceRows.map((row) => [
            row.month,
            String(row.unitsSold),
            money(row.amazonFees),
            money(row.productCost),
            money(row.shipments),
            money(row.refunds),
            money(row.writeOff),
            money(row.misc),
            money(row.expenses),
            money(row.totalCost),
            money(row.sales),
            money(row.profitLoss),
            row.roi == null ? "—" : `${row.roi.toFixed(2)}%`,
            row.salesMoM == null ? "—" : `${row.salesMoM.toFixed(2)}%`,
            money(row.amzPayout),
          ])
        ),
      ].join("");

      openPrintWindow(
        "Monthly Performance Export",
        shell("Monthly Performance Export", `${fyLabel} • ${monthlyPerformanceView === "chart" ? "Chart data export" : "Table export"}`, sections)
      );
      return;
    }

    const sections = [
      buildTable(
        "Yearly Performance",
        ["Metric", "Value"],
        [
          ["Financial Year", yearlyPerformanceSummary.label],
          ["Units Sold", String(yearlyPerformanceSummary.unitsSold)],
          ["Sales", money(yearlyPerformanceSummary.sales)],
          ["P/L", money(yearlyPerformanceSummary.profitLoss)],
          ["ROI", yearlyPerformanceSummary.roi == null ? "—" : `${yearlyPerformanceSummary.roi.toFixed(2)}%`],
          ["AMZ Payout", money(yearlyPerformanceSummary.amzPayout)],
          ...yearlyPerformanceChartData.map((row) => [row.metric, money(row.value)]),
        ]
      ),
    ].join("");

    openPrintWindow(
      "Yearly Performance Export",
      shell("Yearly Performance Export", `${yearlyPerformanceSummary.label} • ${monthlyPerformanceView === "chart" ? "Chart data export" : "Table export"}`, sections)
    );
  };

  const exportHmrcPrototypeCurrentViewData = () => {
    const fileDate = todayISO();
    const common: Array<[string, string, string, string]> = [
      ["Meta", "Document", "Company", COMPANY_NAME],
      ["Meta", "Document", "Range", getRangeLabel(range)],
      ["Meta", "Document", "Generated", fmtDate(fileDate)],
    ];

    if (hmrcPrototypeView === "overview") {
      exportRowsAsCsv(`dashboard_overview_export_${fileDate}.csv`, [
        ...common,
        ["Overview", "Summary", "Sales", money(prototypePlCards.sales.value)],
        ["Overview", "Summary", "Cost of Goods", money(prototypePlCards.cogs.value)],
        ["Overview", "Summary", "Fixed Assets", money(prototypePlCards.fixed_assets.value)],
        ["Overview", "Summary", "Business Running Expenses", money(prototypePlCards.expenses.value)],
        ["Overview", "Summary", "Final P&L", money(prototypePlCards.final_pl.value)],
        ["Overview", "Finance", "Opening Balance", money(prototypeFinanceSummary.openingBalance)],
        ["Overview", "Finance", "Closing Balance", money(prototypeFinanceSummary.closingBalance)],
        ["Overview", "Tax", "Gross Profit", money(prototypeProfitTaxSummary.grossProfit)],
        ["Overview", "Tax", "Net Profit Before Tax", money(prototypeProfitTaxSummary.netProfitBeforeTax)],
        ["Overview", "Tax", "Taxable Profit", money(prototypeProfitTaxSummary.taxableProfit)],
        ["Overview", "Tax", "Est Tax", money(prototypeProfitTaxSummary.estimatedTax)],
        ...prototypePlCards.sales.lines.map((row) => ["Overview", "Sales Breakdown", row.label, money(row.value)] as [string, string, string, string]),
        ...prototypePlCards.cogs.lines.map((row) => ["Overview", "COGS Breakdown", row.label, money(row.value)] as [string, string, string, string]),
        ...prototypePlCards.fixed_assets.lines.map((row) => ["Overview", "Fixed Assets Breakdown", row.label, money(row.value)] as [string, string, string, string]),
        ...prototypePlCards.expenses.lines.map((row) => ["Overview", "Expenses Breakdown", row.label, money(row.value)] as [string, string, string, string]),
        ...prototypePlCards.final_pl.lines.map((row) => ["Overview", "Final P&L Breakdown", row.label, money(row.value)] as [string, string, string, string]),
      ]);
      return;
    }

    if (hmrcPrototypeView === "ct600") {
      exportRowsAsCsv(`dashboard_ct600_export_${fileDate}.csv`, [
        ...common,
        ["CT600", "Bridge", "Turnover", money(turnover)],
        ["CT600", "Bridge", "Opening Stock", money(openingStock)],
        ["CT600", "Bridge", "Purchases (Stock)", money(stockPurchases)],
        ["CT600", "Bridge", "Closing Stock", money(closingStock)],
        ["CT600", "Bridge", "Cost of Goods Sold", money(cogs)],
        ["CT600", "Bridge", "Gross Profit", money(grossProfit)],
        ["CT600", "Bridge", "Allowable Expenses", money(allowableExpenses)],
        ["CT600", "Bridge", "Disallowable Expenses", money(disallowableExpenses)],
        ["CT600", "Bridge", "Net Profit Before Tax", money(netProfit)],
        ["CT600", "Bridge", "Capital Additions", money(totalCapitalAdditions)],
        ["CT600", "Bridge", "Capital Allowances Estimate", money(capitalAllowancesEstimate)],
        ["CT600", "Bridge", "Taxable Profit Estimate", money(taxableProfit)],
        ["CT600", "Bridge", "Corporation Tax Estimate", money(estTax)],
        ...filingWarnings.map((warning, idx) => ["CT600", "Checks", `Warning ${idx + 1}`, warning] as [string, string, string, string]),
        ["CT600", "Stock Ageing", "Over 45 days", `${stockAgeingBuckets.over45.units} units / ${money(stockAgeingBuckets.over45.value)}`],
        ["CT600", "Stock Ageing", "Over 90 days", `${stockAgeingBuckets.over90.units} units / ${money(stockAgeingBuckets.over90.value)}`],
        ["CT600", "Stock Ageing", "Over 180 days", `${stockAgeingBuckets.over180.units} units / ${money(stockAgeingBuckets.over180.value)}`],
        ...financeSummaryTextRows.map((row) => ["CT600", "Finance Summary", String(row[0]), `${row[1]} • ${row[2]}`] as [string, string, string, string]),
      ]);
      return;
    }

    if (hmrcPrototypeView === "pl") {
      exportRowsAsCsv(`dashboard_pl_export_${fileDate}.csv`, [
        ...common,
        ["P&L", "Summary", "Sales", money(prototypePlCards.sales.value)],
        ["P&L", "Summary", "Cost of Goods", money(prototypePlCards.cogs.value)],
        ["P&L", "Summary", "Gross Profit", money(prototypeProfitTaxSummary.grossProfit)],
        ["P&L", "Summary", "Fixed Assets", money(prototypePlCards.fixed_assets.value)],
        ["P&L", "Summary", "Business Running Expenses", money(prototypePlCards.expenses.value)],
        ["P&L", "Summary", "Net Profit / Loss", money(prototypePlCards.final_pl.value)],
        ...prototypePlCards.sales.lines.map((row) => ["P&L", "Sales Breakdown", row.label, money(row.value)] as [string, string, string, string]),
        ...prototypePlCards.cogs.lines.map((row) => ["P&L", "COGS Breakdown", row.label, money(row.value)] as [string, string, string, string]),
        ...prototypePlCards.fixed_assets.lines.map((row) => ["P&L", "Fixed Assets Breakdown", row.label, money(row.value)] as [string, string, string, string]),
        ...prototypePlCards.expenses.lines.map((row) => ["P&L", "Expenses Breakdown", row.label, money(row.value)] as [string, string, string, string]),
        ...prototypePlCards.final_pl.lines.map((row) => ["P&L", "Final P&L Breakdown", row.label, money(row.value)] as [string, string, string, string]),
      ]);
      return;
    }

    exportRowsAsCsv(`dashboard_balance_sheet_export_${fileDate}.csv`, [
      ...common,
      ["Balance Sheet", "Assets", "Closing Stock", money(closingStock)],
      ["Balance Sheet", "Assets", "Cash Running Balance", money(runningBalance)],
      ["Balance Sheet", "Assets", "Current Assets Estimate", money(estimatedCurrentAssets)],
      ["Balance Sheet", "Assets", "Fixed Assets Estimate", money(estimatedFixedAssets)],
      ["Balance Sheet", "Liabilities", "Corporation Tax Estimate", money(estimatedCurrentLiabilities)],
      ["Balance Sheet", "Equity", "Net Assets Estimate", money(estimatedNetAssets)],
      ["Balance Sheet", "Finance", "Opening Balance", money(prototypeFinanceSummary.openingBalance)],
      ["Balance Sheet", "Finance", "Period Movement", money(prototypeFinanceSummary.periodMovement)],
      ["Balance Sheet", "Finance", "Closing Balance", money(prototypeFinanceSummary.closingBalance)],
    ]);
  };

  useEffect(() => {
    if (!hmrcDetailKey) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHmrcDetailKey(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hmrcDetailKey]);


  useEffect(() => {
    if (!filingPopupView) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFilingPopupView(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filingPopupView]);

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-neutral-900">Dashboard Overview</div>
            <div className="mt-1 text-xs text-neutral-600">Timeframe: {getRangeLabel(range)}</div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <select
              className="rounded-xl border bg-white px-3 py-2 text-sm"
              value={range}
              onChange={(e) => setRange(e.target.value as RangeKey)}
            >
              <option value="1D">1 Day</option>
              <option value="7D">7 Days</option>
              <option value="4W">4 Weeks</option>
              <option value="LM">Last Month</option>
              <option value="CM">Current Month</option>
              <option value="6M">6 Months</option>
              <option value="1Y">1 Year</option>
              <option value="FY">Selected Financial Year</option>
            </select>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <button
            type="button"
            onClick={() => setRealStockOpen((prev) => !prev)}
            className="flex w-full items-start justify-between gap-4 text-left"
          >
            <div>
              <div className="text-sm font-semibold text-neutral-900">Real Stock Summary</div>
              <div className="mt-1 text-xs text-neutral-700">Live current stock position</div>
            </div>
            <span className="rounded-full border px-2 py-0.5 text-[11px] text-neutral-700">
              {realStockOpen ? "Hide" : "Show"}
            </span>
          </button>

          {realStockOpen ? (
            <div className="mt-6 space-y-4">
              {stockErr ? (
                <div className="rounded-xl border bg-red-50 p-3 text-sm text-red-700">
                  {stockErr}
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-4">
                <StockMiniCard
                  label="Inbound"
                  units={stock.inbound.units}
                  value={stock.inbound.value}
                  hint={stock.inbound.hint}
                  href={buildInventoryHref("awaiting_delivery", range)}
                />
                <StockMiniCard
                  label="Processing"
                  units={stock.home.units}
                  value={stock.home.value}
                  hint={stock.home.hint}
                  href={buildInventoryHref("processing", range)}
                />
                <StockMiniCard
                  label="Outbound"
                  units={stock.outbound.units}
                  value={stock.outbound.value}
                  hint={stock.outbound.hint}
                  href={buildInventoryHref("sent_to_amazon", range)}
                />
                <StockMiniCard
                  label="Selling"
                  units={stock.selling.units}
                  value={stock.selling.value}
                  hint={stock.selling.hint}
                  href={buildInventoryHref("selling", range)}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-4">
                <StockMiniCard
                  label="Damaged"
                  units={stock.damaged.units}
                  value={stock.damaged.value}
                  hint={stock.damaged.hint}
                  href={buildInventoryHref("written_off", range)}
                />
                <StockMiniCard
                  label="Sold"
                  units={stock.sold.units}
                  value={stock.sold.value}
                  hint={stock.sold.hint}
                  href={buildInventoryHref("sold", range)}
                />
                <BigStat title="Total Stock Value" value={money(totalStockValue)} sub="At cost" />
                <BigStat title="Total Units In Stock" value={`${totalUnitsInStock}`} sub="Excludes Sold" />
              </div>

              <div className="rounded-2xl border bg-neutral-50 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-neutral-900">Target KPIs</div>
                    <div className="mt-1 text-xs text-neutral-600">
                      Compare KPI results against your own targets. Cards stay uniform, open for a full breakdown, and stay active until you choose to complete, fail, extend, edit, or remove them.
                    </div>
                    <div className="mt-2 text-[11px] text-neutral-500">
                      {currentMonthElapsedPercent.toFixed(1)}% of the current month has passed. Maximum {KPI_CARD_LIMIT} active KPI cards at once.
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setTargetKpisOpen((prev) => !prev)}
                      className="rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-white"
                    >
                      {targetKpisOpen ? "Hide" : "Show"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSystemKpiHistoryOpen(true)}
                      className="rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-white"
                    >
                      KPI History
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedSystemKpiStartDate(todayISO()); setSelectedSystemKpiTargetDate(""); setSelectedSystemKpiPeriodType("month"); setSelectedSystemKpiTarget(""); setSystemKpiModalOpen(true); setSystemKpiEditOpen(false); }}
                      disabled={systemKpis.length >= KPI_CARD_LIMIT || availableSystemKpiOptions.length === 0}
                      className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Add KPI
                    </button>
                  </div>
                </div>

                {targetKpisOpen ? (
                  <>
                    {systemKpis.length >= KPI_CARD_LIMIT ? (
                      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                        KPI limit reached. Complete, fail, or remove one if you want to add another.
                      </div>
                    ) : null}

                    {renderedSystemKpis.length > 0 ? (
                      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {renderedSystemKpis.map((kpi) => (
                          <DynamicSystemKpiCard
                            key={kpi.id}
                            title={kpi.title}
                            target={kpi.target}
                            current={kpi.current}
                            format={kpi.format}
                            progress={kpi.progress}
                            periodLabel={kpi.periodLabel}
                            completed={kpi.completed}
                            elapsedPercent={kpi.elapsedPercent}
                            scheduleLabel={kpi.schedule.label}
                            scheduleWrap={kpi.schedule.wrap}
                            scheduleBar={kpi.schedule.bar}
                            reviewNeeded={kpi.completed || kpi.missed}
                            onOpen={() => setActiveSystemKpiDetailId(kpi.id)}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-6 text-sm text-neutral-500">
                        No KPI cards added yet.
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {systemKpiModalOpen || systemKpiEditOpen ? (
          <div className={modalBackdrop()} onMouseDown={() => { setSystemKpiModalOpen(false); setSystemKpiEditOpen(false); }}>
            <div className="w-full max-w-xl rounded-2xl border bg-white shadow-sm" onMouseDown={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between border-b p-5">
                <div>
                  <div className="text-lg font-semibold text-neutral-900">{systemKpiEditOpen ? "Edit KPI" : "Add KPI"}</div>
                  <div className="mt-1 text-sm text-neutral-600">{systemKpiEditOpen ? "Update the selected KPI target, metric, or dates." : "Choose a live KPI, set the target, and define the period you want to hit."}</div>
                </div>
                <button type="button" className="rounded-xl border px-3 py-1.5 text-sm" onClick={() => { setSystemKpiModalOpen(false); setSystemKpiEditOpen(false); setSelectedSystemKpiStartDate(todayISO()); setSelectedSystemKpiTargetDate(""); }}>
                  Close
                </button>
              </div>
              <form
                className="space-y-4 p-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (systemKpiEditOpen) saveEditedSystemKpi();
                  else addSystemKpi();
                }}
              >
                <div>
                  <label className={fieldLabel()}>KPI</label>
                  <select
                    className={inputClass()}
                    value={selectedSystemKpiKey}
                    onChange={(e) => setSelectedSystemKpiKey(e.target.value)}
                  >
                    {(systemKpiEditOpen ? SYSTEM_KPI_OPTIONS : availableSystemKpiOptions).map((option) => (
                      <option key={option.key} value={option.key}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={fieldLabel()}>Target Value</label>
                  <input
                    className={inputClass()}
                    value={selectedSystemKpiTarget}
                    onChange={(e) => setSelectedSystemKpiTarget(e.target.value)}
                    placeholder="Enter target value"
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={fieldLabel()}>Start Date</label>
                    <input
                      type="date"
                      className={inputClass()}
                      value={selectedSystemKpiStartDate}
                      onChange={(e) => setSelectedSystemKpiStartDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={fieldLabel()}>Timeframe</label>
                    <select
                      className={inputClass()}
                      value={selectedSystemKpiPeriodType}
                      onChange={(e) => setSelectedSystemKpiPeriodType(e.target.value as SavedSystemKpi["periodType"])}
                    >
                      <option value="month">This month</option>
                      <option value="tax_year">This tax year</option>
                      <option value="date">Target date</option>
                    </select>
                  </div>
                </div>
                {selectedSystemKpiPeriodType === "date" ? (
                  <div>
                    <label className={fieldLabel()}>Target Date</label>
                    <input
                      type="date"
                      className={inputClass()}
                      value={selectedSystemKpiTargetDate}
                      min={selectedSystemKpiStartDate || undefined}
                      onChange={(e) => setSelectedSystemKpiTargetDate(e.target.value)}
                    />
                  </div>
                ) : null}
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                  Press <span className="font-semibold text-neutral-900">Enter</span> to save and <span className="font-semibold text-neutral-900">Esc</span> to close.
                </div>
                <div className="flex justify-end gap-3 border-t pt-5">
                  <button type="button" className="rounded-xl border px-4 py-2 text-sm font-semibold" onClick={() => { setSystemKpiModalOpen(false); setSystemKpiEditOpen(false); setSelectedSystemKpiStartDate(todayISO()); setSelectedSystemKpiTargetDate(""); }}>
                    Cancel
                  </button>
                  <button type="submit" className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">
                    {systemKpiEditOpen ? "Save Changes" : "Save KPI"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {activeSystemKpiDetail && !systemKpiEditOpen ? (
  <div className={modalBackdrop()} onMouseDown={() => { setActiveSystemKpiDetailId(null); setSystemKpiEditOpen(false); }}>
    <div className="w-full max-w-2xl rounded-2xl border bg-white shadow-sm" onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex items-start justify-between border-b p-5">
        <div>
          <div className="text-lg font-semibold text-neutral-900">{activeSystemKpiDetail.title}</div>
          <div className="mt-1 text-sm text-neutral-600">How this KPI score is worked out. Time progress means how much of the KPI period has passed from start date to target date.</div>
        </div>
        <button type="button" className="rounded-xl border px-3 py-1.5 text-sm" onClick={() => { setActiveSystemKpiDetailId(null); setSystemKpiEditOpen(false); }}>
          Close
        </button>
      </div>
      <div className="space-y-4 p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-neutral-50 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Current</div>
            <div className="mt-1 text-2xl font-semibold text-neutral-900">{formatSystemKpiValue(activeSystemKpiDetail.current, activeSystemKpiDetail.format)}</div>
          </div>
          <div className="rounded-xl bg-neutral-50 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Target</div>
            <div className="mt-1 text-2xl font-semibold text-neutral-900">{formatSystemKpiValue(activeSystemKpiDetail.target, activeSystemKpiDetail.format)}</div>
          </div>
          <div className="rounded-xl bg-neutral-50 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Status</div>
            <div className="mt-1 text-2xl font-semibold text-neutral-900">{activeSystemKpiDetail.completed ? "Completed" : activeSystemKpiDetail.missed ? "Review KPI" : activeSystemKpiDetail.schedule.label}</div>
          </div>
        </div>
        <div className="rounded-xl border bg-neutral-50 p-4 text-sm text-neutral-700">{activeSystemKpiDetail.periodLabel}</div>
        <div className="rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Part</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">Value</th>
              </tr>
            </thead>
            <tbody>
              {activeSystemKpiDetail.detailRows.map((row, index) => (
                <tr key={`${activeSystemKpiDetail.id}-${index}`} className="border-t">
                  <td className="px-4 py-3 text-neutral-700">{row.label}</td>
                  <td className="px-4 py-3 text-right font-medium text-neutral-900">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {activeSystemKpiDetail.completed ? (
          <div className="rounded-xl border border-neutral-300 bg-neutral-100 p-4">
            <div className="text-sm font-semibold text-neutral-900">This KPI has been achieved.</div>
            <div className="mt-3 flex flex-wrap justify-end gap-3">
              <button type="button" className="rounded-xl border px-4 py-2 text-sm font-semibold" onClick={() => openEditSystemKpi(activeSystemKpiDetail.id)}>
                Edit
              </button>
              <button type="button" className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white" onClick={() => archiveSystemKpi(activeSystemKpiDetail.id, "completed")}>
                Completed KPI
              </button>
            </div>
          </div>
        ) : activeSystemKpiDetail.missed ? (
          <div className="rounded-xl border border-neutral-300 bg-neutral-100 p-4">
            <div className="text-sm font-semibold text-neutral-900">This KPI has reached or passed its target date.</div>
            <div className="mt-3 flex flex-wrap justify-end gap-3">
              <button type="button" className="rounded-xl border px-4 py-2 text-sm font-semibold" onClick={() => openEditSystemKpi(activeSystemKpiDetail.id)}>
                Extend Target Date
              </button>
              <button type="button" className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white" onClick={() => archiveSystemKpi(activeSystemKpiDetail.id, "missed")}>
                Failed KPI
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-between gap-3 pt-2">
            <button type="button" className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50" onClick={() => archiveSystemKpi(activeSystemKpiDetail.id, "removed")}>
              Remove KPI
            </button>
            <button type="button" className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white" onClick={() => openEditSystemKpi(activeSystemKpiDetail.id)}>
              Edit
            </button>
          </div>
        )}
      </div>
    </div>
  </div>
) : null}

{systemKpiHistoryOpen ? (
  <div className={modalBackdrop()} onMouseDown={() => setSystemKpiHistoryOpen(false)}>
    <div className="w-full max-w-5xl rounded-2xl border bg-white shadow-sm" onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
        <div>
          <div className="text-lg font-semibold text-neutral-900">KPI History</div>
          <div className="mt-1 text-sm text-neutral-600">Past KPIs, grouped by month, including achieved, missed, and manually removed cards.</div>
        </div>
        <div className="flex gap-2">
          <button type="button" className="rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-neutral-50" onClick={exportSystemKpiHistoryPdf}>
            Export PDF
          </button>
          <button type="button" className="rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-neutral-50" onClick={() => setSystemKpiHistoryOpen(false)}>
            Close
          </button>
        </div>
      </div>
      <div className="max-h-[70vh] overflow-auto p-5">
        {groupedSystemKpiHistory.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-8 text-center text-sm text-neutral-500">
            No past KPIs yet.
          </div>
        ) : (
          <div className="space-y-6">
            {groupedSystemKpiHistory.map(([monthHeading, items]) => (
              <div key={monthHeading}>
                <div className="mb-3 text-lg font-semibold text-neutral-900">{monthHeading}</div>
                <div className="grid gap-3 md:grid-cols-2">
                  {items.map((item) => (
                    <div key={`${item.id}-${item.archivedAt}`} className="rounded-2xl border bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="font-semibold text-neutral-900">{item.title}</div>
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getKpiHistoryTone(item.outcome)}`}>{item.outcome}</span>
                      </div>
                      <div className="mt-3 space-y-1 text-sm text-neutral-700">
                        <div>{item.periodLabel}</div>
                        <div>Target: <span className="font-medium text-neutral-900">{formatSystemKpiValue(item.target, item.format)}</span></div>
                        <div>Final: <span className="font-medium text-neutral-900">{formatSystemKpiValue(item.finalValue, item.format)}</span></div>
                        <div>Archived: {fmtDate(item.archivedAt)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
) : null}

<div className="rounded-2xl border bg-white p-6 shadow-sm">
          <button
            type="button"
            onClick={() => setMonthlyPerformanceOpen((prev) => !prev)}
            className="flex w-full items-start justify-between gap-4 text-left"
          >
            <div>
              <div className="text-sm font-semibold text-neutral-900">Performance Chart</div>
              <div className="mt-1 text-xs text-neutral-700">
                Toggle between monthly and yearly financial year performance.
              </div>
            </div>
            <span className="rounded-full border px-2 py-0.5 text-[11px] text-neutral-700">
              {monthlyPerformanceOpen ? "Hide" : "Show"}
            </span>
          </button>

          {monthlyPerformanceOpen ? (
            <div className="mt-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-neutral-50 p-4">
                <div>
                  <div className="text-sm font-semibold text-neutral-900">Performance View</div>
                  <div className="mt-1 text-xs text-neutral-600">
                    Switch between monthly and yearly totals, and keep either table or chart view.
                  </div>
                  <div className="mt-2 text-xs text-neutral-500">
                    HMRC-accurate performance range: {fmtDateFromDate(fyBounds.start)} - {fmtDateFromDate(fyBounds.end)}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex rounded-xl border bg-white p-1">
                    <button
                      type="button"
                      onClick={() => setMonthlyPerformanceScope("monthly")}
                      className={[
                        "rounded-lg px-3 py-1.5 text-xs font-medium",
                        monthlyPerformanceScope === "monthly" ? "bg-neutral-900 text-white" : "text-neutral-700",
                      ].join(" ")}
                    >
                      Monthly View
                    </button>
                    <button
                      type="button"
                      onClick={() => setMonthlyPerformanceScope("yearly")}
                      className={[
                        "rounded-lg px-3 py-1.5 text-xs font-medium",
                        monthlyPerformanceScope === "yearly" ? "bg-neutral-900 text-white" : "text-neutral-700",
                      ].join(" ")}
                    >
                      Yearly View
                    </button>
                  </div>

                  <div className="inline-flex rounded-xl border bg-white p-1">
                    <button
                      type="button"
                      onClick={() => setMonthlyPerformanceView("table")}
                      className={[
                        "rounded-lg px-3 py-1.5 text-xs font-medium",
                        monthlyPerformanceView === "table" ? "bg-neutral-900 text-white" : "text-neutral-700",
                      ].join(" ")}
                    >
                      Table
                    </button>
                    <button
                      type="button"
                      onClick={() => setMonthlyPerformanceView("chart")}
                      className={[
                        "rounded-lg px-3 py-1.5 text-xs font-medium",
                        monthlyPerformanceView === "chart" ? "bg-neutral-900 text-white" : "text-neutral-700",
                      ].join(" ")}
                    >
                      Chart
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={exportPerformancePdf}
                    className="rounded-xl border bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    Export PDF
                  </button>

                  <button
                    type="button"
                    onClick={exportPerformanceCsv}
                    className="rounded-xl border bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    Export CSV
                  </button>
                </div>
              </div>

              {monthlyPerformanceScope === "monthly" ? (
                monthlyPerformanceView === "chart" ? (
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_250px]">
                    <div className="rounded-2xl border bg-neutral-50 p-5">
                      <div className="text-sm font-semibold text-neutral-900">Profit Trend</div>
                      <div className="mt-1 text-xs text-neutral-600">
                        Use the toggles to choose which monthly lines you want to see.
                      </div>
                      <ChartViewport>
                        {({ width, height }) => (
                          <LineChart width={width} height={height} data={profitTrendData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                            <YAxis yAxisId="left" tickFormatter={(value) => `£${Number(value).toLocaleString()}`} tick={{ fontSize: 12 }} />
                            <YAxis yAxisId="right" orientation="right" allowDecimals={false} tick={{ fontSize: 12 }} />
                            <Tooltip
                              formatter={(value: number, name: string) =>
                                name === "Units Sold" ? [Number(value).toLocaleString(), name] : [money(Number(value)), name]
                              }
                            />
                            <Legend />
                            {monthlyChartSeries.map((series) =>
                              monthlyChartLines[series.key] ? (
                                <Line
                                  key={series.key}
                                  type="monotone"
                                  dataKey={series.key}
                                  name={series.name}
                                  stroke={series.stroke}
                                  strokeWidth={2}
                                  dot={false}
                                  yAxisId={series.yAxisId ?? "left"}
                                />
                              ) : null
                            )}
                          </LineChart>
                        )}
                      </ChartViewport>
                    </div>

                    <div className="rounded-2xl border bg-white p-4">
                      <div className="text-sm font-semibold text-neutral-900">Chart Lines</div>
                      <div className="mt-1 text-xs text-neutral-600">
                        Turn individual metrics on or off.
                      </div>
                      <div className="mt-4 space-y-2">
                        {monthlyChartSeries.map((series) => (
                          <label
                            key={series.key}
                            className="flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2 text-sm"
                          >
                            <span className="flex items-center gap-2 text-neutral-800">
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: series.stroke }}
                              />
                              {series.name}
                            </span>
                            <input
                              type="checkbox"
                              checked={Boolean(monthlyChartLines[series.key])}
                              onChange={(e) =>
                                setMonthlyChartLines((prev) => ({
                                  ...prev,
                                  [series.key]: e.target.checked,
                                }))
                              }
                              className="h-4 w-4"
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full min-w-[1500px] bg-white">
                      <thead className="bg-neutral-50">
                        <tr>
                          <th className={monthHeadClass()}>Month</th>
                          <th className={monthHeadClass()}>Units Sold</th>
                          <th className={monthHeadClass()}>Amazon Fees</th>
                          <th className={monthHeadClass()}>Product Cost</th>
                          <th className={monthHeadClass()}>Shipments</th>
                          <th className={monthHeadClass()}>Refunds</th>
                          <th className={monthHeadClass()}>Write Off</th>
                          <th className={monthHeadClass()}>Miscellaneous</th>
                          <th className={monthHeadClass()}>Expenses</th>
                          <th className={monthHeadClass()}>Total Cost</th>
                          <th className={monthHeadClass()}>Sales</th>
                          <th className={monthHeadClass()}>P/L</th>
                          <th className={monthHeadClass()}>ROI</th>
                          <th className={monthHeadClass()}>Increase On Previous Month Sale</th>
                          <th className={monthHeadClass()}>AMZ Payout</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyPerformanceRows.map((row) => (
                          <tr key={row.month} className="border-t">
                            <td className="px-4 py-3 text-center text-xs font-semibold text-neutral-900">
                              {row.month}
                            </td>
                            <td className={monthCellClass()}>{row.unitsSold}</td>
                            <td className={monthCellClass()}>{money(row.amazonFees)}</td>
                            <td className={monthCellClass()}>{money(row.productCost)}</td>
                            <td className={monthCellClass()}>{money(row.shipments)}</td>
                            <td className={monthCellClass()}>{money(row.refunds)}</td>
                            <td className={monthCellClass()}>{money(row.writeOff)}</td>
                            <td className={monthCellClass()}>{money(row.misc)}</td>
                            <td className={monthCellClass()}>{money(row.expenses)}</td>
                            <td className="px-4 py-3 text-center text-xs font-semibold text-neutral-900">
                              {money(row.totalCost)}
                            </td>
                            <td className={monthCellClass()}>{money(row.sales)}</td>
                            <td
                              className={[
                                "px-4 py-3 text-center text-xs font-semibold",
                                row.profitLoss >= 0 ? "text-emerald-700" : "text-red-700",
                              ].join(" ")}
                            >
                              {money(row.profitLoss)}
                            </td>
                            <td
                              className={[
                                "px-4 py-3 text-center text-xs font-semibold",
                                row.roi == null
                                  ? "text-neutral-500"
                                  : row.roi > 0
                                    ? "text-emerald-700"
                                    : row.roi < 0
                                      ? "text-red-700"
                                      : "text-neutral-700",
                              ].join(" ")}
                            >
                              {row.roi == null ? "—" : `${row.roi.toFixed(2)}%`}
                            </td>
                            <td
                              className={[
                                "px-4 py-3 text-center text-xs font-semibold",
                                row.salesMoM == null
                                  ? "text-neutral-500"
                                  : row.salesMoM > 0
                                    ? "text-emerald-700"
                                    : row.salesMoM < 0
                                      ? "text-red-700"
                                      : "text-neutral-700",
                              ].join(" ")}
                            >
                              {row.salesMoM == null ? "—" : `${row.salesMoM.toFixed(2)}%`}
                            </td>
                            <td className={monthCellClass()}>{money(row.amzPayout)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : monthlyPerformanceView === "chart" ? (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="rounded-2xl border bg-neutral-50 p-5">
                    <div className="text-sm font-semibold text-neutral-900">Yearly Performance</div>
                    <div className="mt-1 text-xs text-neutral-600">
                      Whole-year totals for the selected financial year.
                    </div>
                    <ChartViewport>
                      {({ width, height }) => (
                        <BarChart width={width} height={height} data={yearlyPerformanceChartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="metric" tick={{ fontSize: 12 }} interval={0} angle={-18} textAnchor="end" height={70} />
                          <YAxis tickFormatter={(value) => `£${Number(value).toLocaleString()}`} tick={{ fontSize: 12 }} />
                          <Tooltip formatter={(value: number) => [money(Number(value)), "Value"]} />
                          <Legend />
                          <Bar dataKey="value" name="Financial Year Total" fill="#171717" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      )}
                    </ChartViewport>
                  </div>

                  <div className="rounded-2xl border bg-white p-4">
                    <div className="text-sm font-semibold text-neutral-900">Year Summary</div>
                    <div className="mt-1 text-xs text-neutral-600">
                      Totals for the whole financial year.
                    </div>
                    <div className="mt-4 space-y-2 text-sm">
                      <div className="flex items-center justify-between rounded-xl border px-3 py-2"><span className="text-neutral-600">Financial Year</span><span className="font-semibold text-neutral-900">{yearlyPerformanceSummary.label}</span></div>
                      <div className="flex items-center justify-between rounded-xl border px-3 py-2"><span className="text-neutral-600">Units Sold</span><span className="font-semibold text-neutral-900">{yearlyPerformanceSummary.unitsSold}</span></div>
                      <div className="flex items-center justify-between rounded-xl border px-3 py-2"><span className="text-neutral-600">Sales</span><span className="font-semibold text-neutral-900">{money(yearlyPerformanceSummary.sales)}</span></div>
                      <div className="flex items-center justify-between rounded-xl border px-3 py-2"><span className="text-neutral-600">P/L</span><span className="font-semibold text-neutral-900">{money(yearlyPerformanceSummary.profitLoss)}</span></div>
                      <div className="flex items-center justify-between rounded-xl border px-3 py-2"><span className="text-neutral-600">ROI</span><span className="font-semibold text-neutral-900">{yearlyPerformanceSummary.roi == null ? "—" : `${yearlyPerformanceSummary.roi.toFixed(2)}%`}</span></div>
                      <div className="flex items-center justify-between rounded-xl border px-3 py-2"><span className="text-neutral-600">AMZ Payout</span><span className="font-semibold text-neutral-900">{money(yearlyPerformanceSummary.amzPayout)}</span></div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full min-w-[1500px] bg-white">
                    <thead className="bg-neutral-50">
                      <tr>
                        <th className={monthHeadClass()}>Financial Year</th>
                        <th className={monthHeadClass()}>Units Sold</th>
                        <th className={monthHeadClass()}>Amazon Fees</th>
                        <th className={monthHeadClass()}>Product Cost</th>
                        <th className={monthHeadClass()}>Shipments</th>
                        <th className={monthHeadClass()}>Refunds</th>
                        <th className={monthHeadClass()}>Write Off</th>
                        <th className={monthHeadClass()}>Miscellaneous</th>
                        <th className={monthHeadClass()}>Expenses</th>
                        <th className={monthHeadClass()}>Total Cost</th>
                        <th className={monthHeadClass()}>Sales</th>
                        <th className={monthHeadClass()}>P/L</th>
                        <th className={monthHeadClass()}>ROI</th>
                        <th className={monthHeadClass()}>Increase On Previous Year Sale</th>
                        <th className={monthHeadClass()}>AMZ Payout</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t">
                        <td className="px-4 py-3 text-center text-xs font-semibold text-neutral-900">
                          {yearlyPerformanceSummary.label}
                        </td>
                        <td className={monthCellClass()}>{yearlyPerformanceSummary.unitsSold}</td>
                        <td className={monthCellClass()}>{money(yearlyPerformanceSummary.amazonFees)}</td>
                        <td className={monthCellClass()}>{money(yearlyPerformanceSummary.productCost)}</td>
                        <td className={monthCellClass()}>{money(yearlyPerformanceSummary.shipments)}</td>
                        <td className={monthCellClass()}>{money(yearlyPerformanceSummary.refunds)}</td>
                        <td className={monthCellClass()}>{money(yearlyPerformanceSummary.writeOff)}</td>
                        <td className={monthCellClass()}>{money(yearlyPerformanceSummary.misc)}</td>
                        <td className={monthCellClass()}>{money(yearlyPerformanceSummary.expenses)}</td>
                        <td className="px-4 py-3 text-center text-xs font-semibold text-neutral-900">
                          {money(yearlyPerformanceSummary.totalCost)}
                        </td>
                        <td className={monthCellClass()}>{money(yearlyPerformanceSummary.sales)}</td>
                        <td
                          className={[
                            "px-4 py-3 text-center text-xs font-semibold",
                            yearlyPerformanceSummary.profitLoss >= 0 ? "text-emerald-700" : "text-red-700",
                          ].join(" ")}
                        >
                          {money(yearlyPerformanceSummary.profitLoss)}
                        </td>
                        <td
                          className={[
                            "px-4 py-3 text-center text-xs font-semibold",
                            yearlyPerformanceSummary.roi == null
                              ? "text-neutral-500"
                              : yearlyPerformanceSummary.roi > 0
                                ? "text-emerald-700"
                                : yearlyPerformanceSummary.roi < 0
                                  ? "text-red-700"
                                  : "text-neutral-700",
                          ].join(" ")}
                        >
                          {yearlyPerformanceSummary.roi == null ? "—" : `${yearlyPerformanceSummary.roi.toFixed(2)}%`}
                        </td>
                        <td
                          className={[
                            "px-4 py-3 text-center text-xs font-semibold",
                            yearlyPerformanceSummary.salesYoY > 0
                              ? "text-emerald-700"
                              : yearlyPerformanceSummary.salesYoY < 0
                                ? "text-red-700"
                                : "text-neutral-700",
                          ].join(" ")}
                        >
                          {`${yearlyPerformanceSummary.salesYoY.toFixed(2)}%`}
                        </td>
                        <td className={monthCellClass()}>{money(yearlyPerformanceSummary.amzPayout)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex w-full items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-neutral-900">
                {hmrcPrototypePanel === "hmrc" ? "Financial Statements Prototype" : "HMRC / Accounts Summary"}
              </div>
              <div className="mt-1 text-xs text-neutral-700">
                {hmrcPrototypePanel === "hmrc"
                  ? "Overview, tax, P&amp;L and balance sheet prototype cards"
                  : "Working draft built from selected timeframe data"}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setHmrcPrototypePanel((prev) => (prev === "hmrc" ? "financials" : "hmrc"))}
                className="rounded-xl border px-3 py-2 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50"
              >
                {hmrcPrototypePanel === "hmrc" ? "HMRC / Accounts Summary" : "Financial Statements"}
              </button>

              <button
                type="button"
                onClick={() => setHmrcPrototypeOpen((prev) => !prev)}
                className="rounded-full border px-2 py-0.5 text-[11px] text-neutral-700 transition hover:bg-neutral-50"
              >
                {hmrcPrototypeOpen ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {hmrcPrototypeOpen ? (
            <div className="mt-6">
              {hmrcPrototypePanel === "hmrc" ? (
              <div className="rounded-2xl border bg-neutral-50 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-neutral-900">Prototype View Switcher</div>
                    <div className="mt-1 text-xs text-neutral-600">
                      Overview now replaces Open Reports. P&amp;L cards are fed from sold rows and operating cost rows. Finance cards are pulled directly from the finance page transaction types.
                    </div>
                    <div className="mt-2 text-xs text-neutral-500">
                      Calculating selected financial year only: {fmtDateFromDate(fyBounds.start)} - {fmtDateFromDate(fyBounds.end)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setHmrcPrototypeView("overview")}
                      className={`rounded-xl px-3 py-2 text-xs ${hmrcPrototypeView === "overview" ? "bg-neutral-900 text-white" : "border hover:bg-white"}`}
                    >
                      Overview
                    </button>

                    <button
                      type="button"
                      onClick={exportHmrcPrototypeCurrentViewPdf}
                      className="rounded-xl border px-3 py-2 text-xs font-medium hover:bg-white"
                    >
                      Export PDF
                    </button>
                    <button
                      type="button"
                      onClick={exportHmrcPrototypeCurrentViewData}
                      className="rounded-xl border px-3 py-2 text-xs font-medium hover:bg-white"
                    >
                      Export CSV
                    </button>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border bg-white p-4">
                  {hmrcPrototypeView === "overview" ? (
                    <div className="space-y-4">
                      <div className="text-sm font-semibold text-neutral-900">Overview</div>
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                        {prototypePlCardList.map((card) => (
                          <HmrcCard
                            key={`overview-${card.key}`}
                            title={card.title}
                            value={money(card.value)}
                            sub={card.sub}
                            onClick={() => setPrototypePlDetailKey(card.key)}
                          />
                        ))}
                      </div>
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <HmrcCard title="Gross Profit" value={money(prototypeProfitTaxSummary.grossProfit)} sub="Sales - Cost of Goods" onClick={() => setHmrcDetailKey("prototype_gross_profit")} />
                        <HmrcCard title="Net Profit Before Tax" value={money(prototypeProfitTaxSummary.netProfitBeforeTax)} sub="Gross Profit - Business Running Expenses" onClick={() => setHmrcDetailKey("prototype_net_profit_before_tax")} />
                        <HmrcCard title="Taxable Profit" value={money(prototypeProfitTaxSummary.taxableProfit)} sub="Net Profit Before Tax - Fixed Assets" onClick={() => setHmrcDetailKey("prototype_taxable_profit")} />
                        <HmrcCard title="Est Tax" value={money(prototypeProfitTaxSummary.estimatedTax)} sub="Taxable Profit × 19%" onClick={() => setHmrcDetailKey("prototype_est_tax")} />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <HmrcCard title="Finance In" value={money(prototypeFinanceSummary.financeIn)} sub="Total money in from finance page" onClick={() => setHmrcDetailKey("funding_in")} />
                        <HmrcCard title="Finance Out" value={money(prototypeFinanceSummary.financeOut)} sub="Total money out from finance page incl. tax payments" onClick={() => setHmrcDetailKey("funding_out")} />
                        <HmrcCard title="Net Finance" value={money(prototypeFinanceSummary.netFinance)} sub="Finance in - finance out" onClick={() => setHmrcDetailKey("net_finance")} />
                        <HmrcCard title="Running Balance" value={money(prototypeFinanceSummary.runningBalanceValue)} sub="Opening balance + full written formula" onClick={() => setHmrcDetailKey("prototype_running_balance")} />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <HmrcCard title="Opening Stock" value={money(openingStock)} sub={`${prevFyLabel} closing stock value`} onClick={() => setHmrcDetailKey("opening_stock")} />
                        <HmrcCard title="Closing Stock" value={money(closingStock)} sub={`${fyLabel} closing stock snapshot at 05 April`} onClick={() => setHmrcDetailKey("closing_stock")} />
                        <HmrcCard title="Opening Balance" value={money(prototypeFinanceSummary.openingBalance)} sub={`${prevFyLabel} closing balance`} onClick={() => setHmrcDetailKey("prototype_opening_balance")} />
                        <HmrcCard title="Closing Balance" value={money(prototypeFinanceSummary.closingBalance)} sub="Opening balance + period movement" onClick={() => setHmrcDetailKey("prototype_closing_balance")} />
                      </div>
                    </div>
                  ) : null}

                  {hmrcPrototypeView === "ct600" ? (
                    <div className="space-y-4">
                      <div className="text-sm font-semibold text-neutral-900">CT600 View</div>
                      <div className="rounded-xl border border-dashed bg-neutral-50 p-4 text-sm text-neutral-600">
                        Empty for now.
                      </div>
                    </div>
                  ) : null}

                  {hmrcPrototypeView === "pl" ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-neutral-900">P&amp;L View</div>
                          <div className="mt-1 text-xs text-neutral-600">
                            Sales is hard-wired to sold price per item. COG is hard-wired to item cost + VAT + shipping to receive the item. Equipment goes under Fixed Assets. Amazon fee, miscellaneous product cost, shipping, shipping tax, customer return fee, FBM shipping fee, and all non-Equipment expense categories sit under Business Running Expenses.
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={exportPrototypePlPdf}
                          className="rounded-xl border px-3 py-2 text-xs font-medium hover:bg-neutral-50"
                        >
                          Export P&amp;L PDF
                        </button>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                        {prototypePlCardList.map((card) => (
                          <HmrcCard
                            key={`pl-${card.key}`}
                            title={card.title}
                            value={money(card.value)}
                            sub={card.sub}
                            onClick={() => setPrototypePlDetailKey(card.key)}
                          />
                        ))}
                      </div>
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
                        <HmrcCard title="Opening Balance" value={money(prototypeFinanceSummary.openingBalance)} sub={`${prevFyLabel} closing balance`} onClick={() => setHmrcDetailKey("prototype_opening_balance")} />
                        <HmrcCard title="Closing Balance" value={money(prototypeFinanceSummary.closingBalance)} sub="Opening balance + period movement" onClick={() => setHmrcDetailKey("prototype_closing_balance")} />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <HmrcCard title="Finance In" value={money(prototypeFinanceSummary.financeIn)} sub="Total money in from finance page" onClick={() => setHmrcDetailKey("funding_in")} />
                        <HmrcCard title="Finance Out" value={money(prototypeFinanceSummary.financeOut)} sub="Total money out from finance page incl. tax payments" onClick={() => setHmrcDetailKey("funding_out")} />
                        <HmrcCard title="Net Finance" value={money(prototypeFinanceSummary.netFinance)} sub="Finance in - finance out" onClick={() => setHmrcDetailKey("net_finance")} />
                        <HmrcCard title="Running Balance" value={money(prototypeFinanceSummary.runningBalanceValue)} sub="Opening balance + full written formula" onClick={() => setHmrcDetailKey("prototype_running_balance")} />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <HmrcCard title="Gross Profit" value={money(prototypeProfitTaxSummary.grossProfit)} sub="Sales - Cost of Goods" onClick={() => setHmrcDetailKey("prototype_gross_profit")} />
                        <HmrcCard title="Net Profit Before Tax" value={money(prototypeProfitTaxSummary.netProfitBeforeTax)} sub="Gross Profit - Business Running Expenses" onClick={() => setHmrcDetailKey("prototype_net_profit_before_tax")} />
                        <HmrcCard title="Taxable Profit" value={money(prototypeProfitTaxSummary.taxableProfit)} sub="Net Profit Before Tax - Fixed Assets" onClick={() => setHmrcDetailKey("prototype_taxable_profit")} />
                        <HmrcCard title="Est Tax" value={money(prototypeProfitTaxSummary.estimatedTax)} sub="Taxable Profit × 19%" onClick={() => setHmrcDetailKey("prototype_est_tax")} />
                      </div>
                    </div>
                  ) : null}

                  {hmrcPrototypeView === "balance_sheet" ? (
                    <div className="space-y-4">
                      <div className="text-sm font-semibold text-neutral-900">Balance Sheet View</div>
                      <div className="rounded-xl border border-dashed bg-neutral-50 p-4 text-sm text-neutral-600">
                        Empty for now.
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              ) : (
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border bg-neutral-50 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-neutral-900">Accountant Working View</div>
                    <div className="mt-1 text-xs text-neutral-600">
                      Cleaner year-end view for profit, tax, balance sheet and control checks.
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href="/dashboard/reports" className="rounded-xl bg-neutral-900 px-3 py-2 text-xs text-white">
                      Open Reports
                    </Link>
                    <button type="button" onClick={() => setFilingPopupView("ct600")} className="rounded-xl border px-3 py-2 text-xs hover:bg-white">
                      CT600 View
                    </button>
                    <button type="button" onClick={() => setFilingPopupView("pl")} className="rounded-xl border px-3 py-2 text-xs hover:bg-white">
                      P&amp;L View
                    </button>
                    <button type="button" onClick={() => setFilingPopupView("balance_sheet")} className="rounded-xl border px-3 py-2 text-xs hover:bg-white">
                      Balance Sheet View
                    </button>
                  </div>
                </div>

                {financeErr ? (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    Finance summary is showing whatever rows were found. If totals look wrong, check the finance source table names in the dashboard code.
                  </div>
                ) : null}

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border bg-white p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Turnover</div>
                    <div className="mt-1 text-2xl font-semibold text-neutral-900">{money(turnover)}</div>
                    <div className="text-xs text-neutral-600">Gross sold income for the selected view</div>
                  </div>
                  <div className="rounded-xl border bg-white p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Profit Before Tax</div>
                    <div className="mt-1 text-2xl font-semibold text-neutral-900">{money(accountsProfitBeforeTax)}</div>
                    <div className="text-xs text-neutral-600">Accounts profit before corporation tax</div>
                  </div>
                  <div className="rounded-xl border bg-white p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Taxable Profit Estimate</div>
                    <div className="mt-1 text-2xl font-semibold text-neutral-900">{money(taxableProfit)}</div>
                    <div className="text-xs text-neutral-600">After capital allowances estimate</div>
                  </div>
                  <div className="rounded-xl border bg-white p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Corporation Tax Estimate</div>
                    <div className="mt-1 text-2xl font-semibold text-neutral-900">{money(estTax)}</div>
                    <div className="text-xs text-neutral-600">Small profits / main rate bands</div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border bg-white p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Current Assets</div>
                    <div className="mt-1 text-2xl font-semibold text-neutral-900">{money(estimatedCurrentAssets)}</div>
                    <div className="text-xs text-neutral-600">Cash and stock currently recognised</div>
                  </div>
                  <div className="rounded-xl border bg-white p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Fixed Assets</div>
                    <div className="mt-1 text-2xl font-semibold text-neutral-900">{money(estimatedFixedAssets)}</div>
                    <div className="text-xs text-neutral-600">Capital additions carried in the business</div>
                  </div>
                  <div className="rounded-xl border bg-white p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Current Liabilities</div>
                    <div className="mt-1 text-2xl font-semibold text-neutral-900">{money(estimatedCurrentLiabilities)}</div>
                    <div className="text-xs text-neutral-600">Current corporation tax estimate</div>
                  </div>
                  <div className="rounded-xl border bg-white p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Net Assets</div>
                    <div className="mt-1 text-2xl font-semibold text-neutral-900">{money(estimatedNetAssets)}</div>
                    <div className="text-xs text-neutral-600">Estimated equity after current liabilities</div>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-3">
                  <div className="xl:col-span-2">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-600">
                      Profit &amp; Loss Working Draft
                    </div>
                    <TableShell
                      headers={["Line Item", "Amount"]}
                      rows={[
                        ["Turnover", <span key="pl-turnover" className="font-semibold">{money(turnover)}</span>],
                        ["Opening Stock", <span key="pl-opening-stock" className="font-semibold">{money(openingStock)}</span>],
                        ["Purchases (Stock)", <span key="pl-stock-purchases" className="font-semibold">{money(stockPurchases)}</span>],
                        ["Closing Stock", <span key="pl-closing-stock" className="font-semibold">{money(closingStock)}</span>],
                        ["stCost of Sales", <span key="pl-cogs" className="font-semibold">{money(cogs)}</span>],
                        ["Gross Profit", <span key="pl-gp" className="font-semibold">{money(grossProfit)}</span>],
                        ["Allowable Expenses", <span key="pl-allow" className="font-semibold">{money(allowableExpenses)}</span>],
                        ["Disallowable Expenses", <span key="pl-disallow" className="font-semibold">{money(disallowableExpenses)}</span>],
                        ["Operating Expenses (Total)", <span key="pl-opex" className="font-semibold">{money(accountsOperatingExpenses)}</span>],
                        ["Profit Before Tax (Accounts)", <span key="pl-pbt" className="font-semibold">{money(accountsProfitBeforeTax)}</span>],
                        ["Capital Allowances Estimate", <span key="pl-ca" className="font-semibold">{money(capitalAllowancesEstimate)}</span>],
                        ["Taxable Profit Estimate", <span key="pl-taxable" className="font-semibold">{money(taxableProfit)}</span>],
                        ["Corporation Tax Estimate", <span key="pl-tax" className="font-semibold">{money(estTax)}</span>],
                        ["Profit After Tax Estimate", <span key="pl-pat" className="font-semibold">{money(estimatedProfitAfterTax)}</span>],
                      ]}
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-xl border bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Checks</div>
                        <div className="flex flex-wrap gap-2 text-[11px]">
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">Healthy</span>
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">Review</span>
                          <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-red-700">Issue</span>
                        </div>
                      </div>
                      <div className="mt-1 text-[11px] text-neutral-500">Source: dashboard calculations from selected tax year</div>
                      {filingWarnings.length === 0 ? (
                        <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">No obvious filing warnings from the current draft.</div>
                      ) : (
                        <ul className="mt-2 space-y-2 text-sm text-amber-700">
                          {filingWarnings.map((warning) => (
                            <li key={warning} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">• {warning}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="rounded-xl border bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Stock ageing summary</div>
                        <div className="text-[11px] text-neutral-500">Click any card</div>
                      </div>
                      <div className="mt-1 text-[11px] text-neutral-500">Source: ageing starts from Amazon check-in date</div>
                      <div className="mt-3 grid gap-2">
                        <button type="button" onClick={() => setHmrcDetailKey("stock_ageing_over45")} className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-left transition hover:-translate-y-0.5 hover:border-neutral-300">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[11px] uppercase tracking-wide text-neutral-500">Over 45 days</div>
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">View items</div>
                          </div>
                          <div className="mt-1 text-sm font-semibold text-neutral-900">{stockAgeingBuckets.over45.units} units</div>
                          <div className="text-xs text-neutral-600">Cost value {money(stockAgeingBuckets.over45.value)}</div>
                        </button>
                        <button type="button" onClick={() => setHmrcDetailKey("stock_ageing_over90")} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left transition hover:-translate-y-0.5 hover:border-amber-300">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[11px] uppercase tracking-wide text-amber-700">Over 90 days</div>
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-500">View items</div>
                          </div>
                          <div className="mt-1 text-sm font-semibold text-amber-900">{stockAgeingBuckets.over90.units} units</div>
                          <div className="text-xs text-amber-700">Cost value {money(stockAgeingBuckets.over90.value)}</div>
                        </button>
                        <button type="button" onClick={() => setHmrcDetailKey("stock_ageing_over180")} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-left transition hover:-translate-y-0.5 hover:border-red-300">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[11px] uppercase tracking-wide text-red-700">Over 180 days</div>
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-red-500">View items</div>
                          </div>
                          <div className="mt-1 text-sm font-semibold text-red-900">{stockAgeingBuckets.over180.units} units</div>
                          <div className="text-xs text-red-700">Cost value {money(stockAgeingBuckets.over180.value)}</div>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <div>
                    <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-600">
                      Balance Sheet Snapshot (Working Draft)
                    </div>
                    <TableShell
                      headers={["Line Item", "Amount"]}
                      rows={[
                        ["Closing Stock", <span key="bs-stock" className="font-semibold">{money(closingStock)}</span>],
                        ["Cash Running Balance", <span key="bs-cash" className="font-semibold">{money(runningBalance)}</span>],
                        ["Current Assets Estimate", <span key="bs-current-assets" className="font-semibold">{money(estimatedCurrentAssets)}</span>],
                        ["Fixed Assets / Capital Additions", <span key="bs-fixed-assets" className="font-semibold">{money(estimatedFixedAssets)}</span>],
                        ["Estimated Corporation Tax Liability", <span key="bs-tax-liability" className="font-semibold">{money(estimatedCurrentLiabilities)}</span>],
                        ["Estimated Net Assets", <span key="bs-net-assets" className="font-semibold">{money(estimatedNetAssets)}</span>],
                      ]}
                    />
                  </div>
                  <div>
                    <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-600">
                      Stock Movement
                    </div>
                    <TableShell
                      headers={["Line Item", "Amount"]}
                      rows={[
                        ["Opening Stock", <span key="sm-opening" className="font-semibold">{money(openingStock)}</span>],
                        ["+ Purchases", <span key="sm-purchases" className="font-semibold">{money(stockPurchases)}</span>],
                        ["- Closing Stock", <span key="sm-closing" className="font-semibold">{money(closingStock)}</span>],
                        ["= Cost of Goods Sold", <span key="sm-cogs" className="font-semibold">{money(cogs)}</span>],
                      ]}
                    />
                    <div className="mt-4 rounded-xl border bg-white p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Working summary</div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-neutral-700 md:grid-cols-4">
                        <div>Turnover</div><div className="text-right font-semibold">{money(turnover)}</div>
                        <div>Profit Before Tax</div><div className="text-right font-semibold">{money(accountsProfitBeforeTax)}</div>
                        <div>Taxable Profit Est.</div><div className="text-right font-semibold">{money(taxableProfit)}</div>
                        <div>Corporation Tax Est.</div><div className="text-right font-semibold">{money(estTax)}</div>
                        <div>Current Assets Est.</div><div className="text-right font-semibold">{money(estimatedCurrentAssets)}</div>
                        <div>Net Assets Est.</div><div className="text-right font-semibold">{money(estimatedNetAssets)}</div>
                        <div>Closing Stock</div><div className="text-right font-semibold">{money(closingStock)}</div>
                        <div>Cash Running Balance</div><div className="text-right font-semibold">{money(runningBalance)}</div>
                        <div>Finance Summary</div><div className="text-right font-semibold">{money(financeBreakdown.total)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
              )}
            </div>
          ) : null}
        </div>

        
        <Section
          title="Shipments"
          subtitle="Awaiting delivery items and shipments currently in transit"
          collapsible
          storageKey="dashboard_shipments_combined_open"
          defaultOpen
          right={
            <span
              onClick={async (e) => {
                e.stopPropagation();
                await reloadShipments();
              }}
              className="text-xs text-neutral-600 hover:text-neutral-900 cursor-pointer"
              role="button"
              tabIndex={0}
              onKeyDown={async (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  await reloadShipments();
                }
              }}
            >
              Refresh
            </span>
          }
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-neutral-900">Awaiting Shipment</div>
                  <div className="mt-1 text-xs text-neutral-700">Items waiting to be delivered</div>
                </div>
                <Link
                  href={buildInventoryHref("awaiting_delivery", range)}
                  className="text-xs text-neutral-600 hover:text-neutral-900"
                >
                  Open
                </Link>
              </div>
              <div className="mt-4">
                {shipmentErr ? (
                  <div className="rounded-xl border bg-red-50 p-3 text-sm text-red-700">
                    {shipmentErr}
                  </div>
                ) : (
                  <div className="max-h-[360px] overflow-auto rounded-xl border">
                    <table className="w-full min-w-[620px] text-sm">
                      <thead className="bg-neutral-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-700">Product</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-700">Purchase</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-700">Shop</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-700">Tracking</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-700">Action</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {awaitingShipmentRows.length === 0 ? (
                          <tr>
                            <td className="px-3 py-6 text-sm text-neutral-600" colSpan={5}>
                              No awaiting delivery items
                            </td>
                          </tr>
                        ) : (
                          awaitingShipmentRows.map((row) => (
                            <tr
                              key={String(row.id)}
                              className="cursor-pointer border-t transition hover:bg-neutral-50"
                              onDoubleClick={() => openEditFor(row)}
                            >
                              <td className="px-3 py-2 text-sm text-neutral-900">
                                <div className="font-semibold">{row.product?.asin ?? "—"}</div>
                                <div className="text-xs text-neutral-600">
                                  {row.product?.brand ?? "—"} • {row.product?.product_name ?? "—"}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-sm text-neutral-900">{fmtDate(row.purchase_date)}</td>
                              <td className="px-3 py-2 text-sm text-neutral-900">{row.shop ?? "—"}</td>
                              <td className="px-3 py-2 text-sm text-neutral-900">{row.tracking_no ?? "—"}</td>
                              <td className="px-3 py-2 text-sm text-neutral-900">
                                <button
                                  type="button"
                                  className="rounded-lg bg-neutral-900 px-3 py-1 text-xs text-white hover:opacity-95"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    await setDeliveredNow(String(row.id));
                                  }}
                                >
                                  Delivered
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-neutral-900">Open Shipments</div>
                  <div className="mt-1 text-xs text-neutral-700">Only shipments currently in transit</div>
                </div>
                <span className="rounded-full border px-2 py-0.5 text-[11px] text-neutral-700">
                  {openShipments.length} open
                </span>
              </div>
              <div className="mt-4">
                {shipmentErr ? (
                  <div className="rounded-xl border bg-red-50 p-3 text-sm text-red-700">
                    {shipmentErr}
                  </div>
                ) : (
                  <div className="max-h-[360px] overflow-auto space-y-3">
                    {openShipments.length === 0 ? (
                      <div className="rounded-xl border bg-white p-3 text-sm text-neutral-600">
                        No in-transit shipments
                      </div>
                    ) : (
                      openShipments.map((s) => {
                        const href = trackingUrl(s.carrier, s.tracking);
                        return (
                          <div
                            key={`${s.id}-${s.box}-${s.tracking}`}
                            className="cursor-pointer rounded-xl border bg-white p-3"
                            onDoubleClick={() => {
                              setShipDetailId(s.id);
                              setShipDetailOpen(true);
                            }}
                          >
                            <div className="text-sm font-semibold text-neutral-900">{s.box}</div>
                            <div className="mt-1 text-xs text-neutral-600">Shipment Date: {fmtDate(s.shipmentDate)}</div>
                            <div className="mt-1 text-xs text-neutral-700">
                              {s.carrier} • Tracking:{" "}
                              {href ? (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {s.tracking}
                                </a>
                              ) : (
                                s.tracking
                              )}
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-neutral-600">
                              <div>Units: {s.units}</div>
                              <div>Box Value: {money(s.boxValue)}</div>
                              <div>Shipment Cost: {money(s.cost)}</div>
                              <div>Status: In Transit</div>
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-3">
                              <Link
                                href={buildOpenShipmentsHref(range)}
                                className="text-xs text-neutral-600 underline hover:text-neutral-900"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Open shipment page
                              </Link>
                              <button
                                type="button"
                                className="rounded-lg bg-neutral-900 px-3 py-1 text-xs text-white hover:opacity-95"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openCheckin(s.id);
                                }}
                              >
                                Delivered
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Section>
      </div>

      {activeFilingDocument ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-2xl border bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-white px-6 py-4">
              <div>
                <div className="text-sm font-semibold text-neutral-900">{activeFilingDocument.title}</div>
                <div className="mt-1 text-xs text-neutral-600">{activeFilingDocument.subtitle}</div>
                <div className="mt-1 text-[11px] text-neutral-500">Esc closes this document • Use Print / Save PDF for a clean export</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => exportFilingDocumentPdf(filingPopupView!)}
                  className="rounded-xl bg-neutral-900 px-3 py-2 text-sm text-white hover:opacity-95"
                >
                  Print / Save PDF
                </button>
                <button
                  type="button"
                  onClick={() => setFilingPopupView(null)}
                  className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="max-h-[76vh] overflow-auto bg-neutral-100 p-6">
              <div className="mx-auto max-w-4xl space-y-6 rounded-[28px] border bg-white p-6 shadow-sm">
                {activeFilingDocument.sections.map((section) => (
                  <div key={section.title} className="rounded-2xl border bg-neutral-50 p-5">
                    <div className="text-sm font-semibold text-neutral-900">{section.title}</div>
                    <div className="mt-3 rounded-xl border bg-white">
                      <table className="w-full text-sm">
                        <thead className="bg-neutral-50">
                          <tr>
                            {section.headers.map((header) => (
                              <th key={header} className="px-3 py-2 text-left text-xs font-semibold text-neutral-700">
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="bg-white">
                          {section.rows.length === 0 ? (
                            <tr className="border-t">
                              <td colSpan={section.headers.length} className="px-3 py-5 text-sm text-neutral-500">
                                No records found for this section in the selected period.
                              </td>
                            </tr>
                          ) : section.rows.map((row, index) => (
                            <tr key={`${section.title}-${index}`} className="border-t">
                              {row.map((cell, cellIndex) => (
                                <td key={cellIndex} className="px-3 py-2 text-sm text-neutral-900">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeHmrcDetail ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-5xl overflow-hidden rounded-2xl border bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <div className="text-sm font-semibold text-neutral-900">{activeHmrcDetail.title}</div>
                {activeHmrcDetail.subtitle ? (
                  <div className="mt-1 text-xs text-neutral-600">{activeHmrcDetail.subtitle}</div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setHmrcDetailKey(null)}
                className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50"
              >
                Close
              </button>
            </div>

            <div className="max-h-[70vh] overflow-auto p-6">
              <TableShell headers={activeHmrcDetail.headers} rows={activeHmrcDetail.rows} />
            </div>
          </div>
        </div>
      ) : null}


      {addOpen ? (
        <div className={modalBackdrop()} onMouseDown={() => setAddOpen(false)}>
          <div className={modalCard()} onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b p-5">
              <div>
                <div className="text-lg font-semibold text-neutral-900">Add Purchase</div>
                <div className="mt-1 text-xs text-neutral-600">
                  Search your catalog, select a product, then enter purchase details.
                </div>
              </div>
              <button className={buttonClass()} onClick={() => setAddOpen(false)}>
                Close
              </button>
            </div>

            <form
              className="p-5"
              onSubmit={(e) => {
                e.preventDefault();
                createPurchase();
              }}
            >
              {createError ? (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {createError}
                </div>
              ) : null}

              <div className="rounded-2xl border p-4">
                <div className="mb-2 text-sm font-semibold text-neutral-900">Select Product</div>

                <input
                  ref={addPurchaseProductSearchRef}
                  className={inputClass()}
                  placeholder="Search code / ASIN / brand / product name…"
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                />

                <div className="mt-3 space-y-2">
                  {productMatches.map((p) => {
                    const active = selectedProductId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedProductId(p.id)}
                        className={[
                          "w-full rounded-xl border px-3 py-2 text-left text-sm",
                          active
                            ? "border-neutral-900 bg-neutral-900 text-white"
                            : "hover:bg-neutral-50",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-semibold">
                            {p.product_code} • {p.asin}
                          </div>
                          <div className="text-xs opacity-90">
                            {p.brand} • {p.product_name}
                          </div>
                        </div>
                      </button>
                    );
                  })}

                  {showAddCatalogButton ? (
                    <div className="flex items-center justify-between rounded-xl border bg-neutral-50 p-3">
                      <div className="text-sm text-neutral-800">No matching product found in catalog.</div>
                      <button
                        type="button"
                        className={buttonClass(true)}
                        onClick={() => {
                          setCatError(null);
                          setCatAsin("");
                          setCatBrand("");
                          setCatName("");
                          setAddCatalogOpen(true);
                        }}
                      >
                        + Add Catalog Item
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="mt-2 text-xs text-neutral-600">
                  Showing {productQuery.trim() ? "matching products" : "5 most recent products"}.
                </div>

                <div className="mt-2 text-xs text-neutral-600">
                  Selected:{" "}
                  {selectedProduct
                    ? `${selectedProduct.product_code} • ${selectedProduct.asin} • ${selectedProduct.brand} • ${selectedProduct.product_name}`
                    : "None"}
                </div>
              </div>

              <div className="mt-4 rounded-2xl border p-4">
                <div className="mb-3 text-sm font-semibold text-neutral-900">Purchase Details</div>

                <div className="grid gap-3 md:grid-cols-5">
                  <div>
                    <div className={fieldLabel()}>Order Date *</div>
                    <input
                      className={inputClass()}
                      type="date"
                      value={ePurchaseDate}
                      onChange={(e) => setEPurchaseDate(e.target.value)}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className={fieldLabel()}>Delivery Date (optional)</div>
                      <button
                        type="button"
                        className="text-xs underline underline-offset-2 text-neutral-600 hover:text-neutral-900"
                        onClick={() => setEDeliveryDate(todayISO())}
                      >
                        Today
                      </button>
                    </div>
                    <input
                      className={inputClass()}
                      type="date"
                      value={eDeliveryDate}
                      onChange={(e) => setEDeliveryDate(e.target.value)}
                    />
                  </div>

                  <div>
                    <div className={fieldLabel()}>Expiry Date (optional)</div>
                    <input
                      className={inputClass()}
                      type="date"
                      value={eExpiryDate}
                      onChange={(e) => setEExpiryDate(e.target.value)}
                    />
                  </div>

                  <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
                    <div className={fieldLabel()}>Shop *</div>
                    <input
                      className={inputClass()}
                      value={eShopStr}
                      onFocus={() => setShopDropdownOpen(true)}
                      onChange={(e) => {
                        setEShopStr(titleCaseEveryWord(e.target.value));
                        setShopDropdownOpen(true);
                      }}
                    />
                    {shopDropdownOpen && shopSuggestions.filter((shop) => shop.toLowerCase().includes(eShopStr.trim().toLowerCase())).length > 0 ? (
                      <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border bg-white shadow-sm">
                        {shopSuggestions
                          .filter((shop) => shop.toLowerCase().includes(eShopStr.trim().toLowerCase()))
                          .slice(0, 8)
                          .map((shop) => (
                            <button
                              key={shop}
                              type="button"
                              className="block w-full px-3 py-2 text-left text-sm text-neutral-900 hover:bg-neutral-50"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setEShopStr(shop);
                                setShopDropdownOpen(false);
                              }}
                            >
                              {shop}
                            </button>
                          ))}
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <div className={fieldLabel()}>Tracking (optional)</div>
                    <input
                      className={inputClass()}
                      value={eTrackingStr}
                      onChange={(e) => setETrackingStr(e.target.value)}
                    />
                  </div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-5">
                  <div>
                    <div className={fieldLabel()}>Quantity *</div>
                    <input
                      className={inputClass()}
                      inputMode="numeric"
                      value={String(eQty)}
                      onChange={(e) => setEQty(Math.max(1, Math.floor(Number(e.target.value || 1))))}
                    />
                  </div>

                  <div>
                    <div className={fieldLabel()}>Unit Cost (£) *</div>
                    <input
                      className={inputClass()}
                      inputMode="decimal"
                      value={eUnitCostStr}
                      onChange={(e) => setEUnitCostStr(sanitizeDecimalInput(e.target.value))}
                    />
                  </div>

                  <div>
                    <div className={fieldLabel()}>Tax (£) (total)</div>
                    <input
                      className={inputClass()}
                      inputMode="decimal"
                      value={eTaxStr}
                      onChange={(e) => setETaxStr(sanitizeDecimalInput(e.target.value))}
                    />
                  </div>

                  <div>
                    <div className={fieldLabel()}>Shipping (£) (total)</div>
                    <input
                      className={inputClass()}
                      inputMode="decimal"
                      value={eShippingStr}
                      onChange={(e) => setEShippingStr(sanitizeDecimalInput(e.target.value))}
                    />
                  </div>

                  <div>
                    <div className={fieldLabel()}>Discount (type inside field)</div>
                    <div className="relative">
                      <div className="absolute left-2 top-1/2 z-10 flex -translate-y-1/2 overflow-hidden rounded-lg border bg-white">
                        <button
                          type="button"
                          className={[
                            "px-2.5 py-1 text-xs",
                            eDiscountType === "percent" ? "bg-neutral-900 text-white" : "hover:bg-neutral-50",
                          ].join(" ")}
                          onClick={() => setEDiscountType("percent")}
                        >
                          %
                        </button>
                        <button
                          type="button"
                          className={[
                            "border-l px-2.5 py-1 text-xs",
                            eDiscountType === "fixed" ? "bg-neutral-900 text-white" : "hover:bg-neutral-50",
                          ].join(" ")}
                          onClick={() => setEDiscountType("fixed")}
                        >
                          £
                        </button>
                      </div>
                      <input
                        className={[inputClass(), "pl-20"].join(" ")}
                        inputMode="decimal"
                        value={eDiscountValueStr}
                        onChange={(e) => setEDiscountValueStr(sanitizeDecimalInput(e.target.value))}
                        placeholder="0"
                      />
                    </div>
                    <div className="mt-1 text-[11px] text-neutral-500">Percent is per-unit.</div>
                  </div>
                </div>

                <div className="mt-8 flex items-end justify-between">
                  <div className="text-sm text-neutral-600">
                    Status on create:{" "}
                    <span className={[
                      "rounded-full border px-2 py-1 text-xs",
                      statusPillColor(toNullDate(eDeliveryDate) ? "processing" : "awaiting_delivery"),
                    ].join(" ")}>
                      {toNullDate(eDeliveryDate) ? "Processing" : "Awaiting Delivery"}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-neutral-900">
                    Total (preview): {money(eTotalPreview)}
                  </div>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className={buttonClass()}
                    onClick={() => {
                      setAddOpen(false);
                      resetAddPurchaseForm();
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className={buttonClass(true)} disabled={createBusy}>
                    {createBusy ? "Adding…" : "Add Purchase"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {addCatalogOpen ? (
        <div className={modalBackdrop()} onMouseDown={() => setAddCatalogOpen(false)}>
          <div
            className="w-full max-w-2xl rounded-2xl border bg-white shadow-sm"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <form
              className="contents"
              onSubmit={(e) => {
                e.preventDefault();
                createCatalogProductFromInventory();
              }}
            >
              <div className="flex items-start justify-between border-b p-5">
                <div>
                  <div className="text-lg font-semibold text-neutral-900">Add Catalog Item</div>
                  <div className="mt-1 text-xs text-neutral-600">
                    Saves to Catalog then auto-selects it for your Purchase.
                  </div>
                  <div className="mt-2 text-xs text-neutral-500">
                    Press Enter to save. Press Esc to close.
                  </div>
                </div>
                <button type="button" className={buttonClass()} onClick={() => setAddCatalogOpen(false)}>
                  Close
                </button>
              </div>

              <div className="p-5" onMouseDown={() => shopDropdownOpen && setShopDropdownOpen(false)}>
                {catError ? (
                  <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {catError}
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className={fieldLabel()}>ASIN *</div>
                    <input
                      ref={addCatalogRef}
                      className={inputClass()}
                      value={catAsin}
                      onChange={(e) => setCatAsin(normalizeASIN(e.target.value))}
                      placeholder="e.g. B09BNXTL7N"
                    />
                  </div>

                  <div>
                    <div className={fieldLabel()}>Brand *</div>
                    <input
                      className={inputClass()}
                      value={catBrand}
                      onChange={(e) => setCatBrand(titleCaseEveryWord(e.target.value))}
                      placeholder="e.g. Lego"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <div className={fieldLabel()}>Product Name *</div>
                    <input
                      className={inputClass()}
                      value={catName}
                      onChange={(e) => setCatName(titleCaseEveryWord(e.target.value))}
                      placeholder="e.g. 40582"
                    />
                  </div>
                </div>

                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" className={buttonClass()} onClick={() => setAddCatalogOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className={buttonClass(true)} disabled={catBusy}>
                    {catBusy ? "Saving…" : "Save to Catalog"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}


      {editOpen && selectedPurchase ? (
        <div className={modalBackdrop()} onMouseDown={() => setEditOpen(false)}>
          <div className={modalCard()} onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b p-5">
              <div>
                <div className="text-lg font-semibold text-neutral-900">Edit Purchase</div>
                <div className="mt-1 text-xs text-neutral-600">
                  Same metrics as inventory edit popup.
                </div>
              </div>
              <button className={buttonClass()} onClick={() => setEditOpen(false)}>
                Close
              </button>
            </div>

            <form
              className="p-5"
              onSubmit={(e) => {
                e.preventDefault();
                saveEdit();
              }}
            >
              {editError ? (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {editError}
                </div>
              ) : null}

              <div className="rounded-2xl border p-4">
                <div className="mb-3 text-sm font-semibold text-neutral-900">Selected Product</div>
                <div className="text-sm text-neutral-800">
                  <span className="font-semibold">{selectedPurchase.product?.product_code ?? "-"}</span> •{" "}
                  {selectedPurchase.product?.asin ?? "-"} • {selectedPurchase.product?.brand ?? "-"} •{" "}
                  {selectedPurchase.product?.product_name ?? "-"}
                </div>

                <div className="mt-3 text-xs text-neutral-700">
                  Current status:{" "}
                  <span className="font-semibold">
                    {titleCaseEveryWord(String(selectedPurchase.status ?? "—").replace(/_/g, " "))}
                  </span>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border p-4">
                <div className="mb-3 text-sm font-semibold text-neutral-900">Update Details</div>

                <div className="grid gap-3 sm:grid-cols-12">
                  <div className="sm:col-span-3">
                    <div className={fieldLabel()}>Purchase Date *</div>
                    <input
                      className={inputClass()}
                      type="date"
                      value={ePurchaseDate}
                      onChange={(e) => setEPurchaseDate(e.target.value)}
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <div className={fieldLabel()}>Delivery Date (optional)</div>
                    <input
                      className={inputClass()}
                      type="date"
                      value={eDeliveryDate}
                      onChange={(e) => setEDeliveryDate(e.target.value)}
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <div className={fieldLabel()}>Expiry Date (optional)</div>
                    <input
                      className={inputClass()}
                      type="date"
                      value={eExpiryDate}
                      onChange={(e) => setEExpiryDate(e.target.value)}
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <div className={fieldLabel()}>Tracking (optional)</div>
                    <input
                      className={inputClass()}
                      value={eTrackingStr}
                      onChange={(e) => setETrackingStr(e.target.value)}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <div className={fieldLabel()}>Quantity</div>
                    <input
                      className={inputClass()}
                      type="number"
                      min={1}
                      value={eQty}
                      onChange={(e) => setEQty(Math.max(1, Number(e.target.value) || 1))}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <div className={fieldLabel()}>Unit Cost (£)</div>
                    <input
                      className={inputClass()}
                      inputMode="decimal"
                      value={eUnitCostStr}
                      onChange={(e) => setEUnitCostStr(sanitizeDecimalInput(e.target.value))}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <div className={fieldLabel()}>Tax (£)</div>
                    <input
                      className={inputClass()}
                      inputMode="decimal"
                      value={eTaxStr}
                      onChange={(e) => setETaxStr(sanitizeDecimalInput(e.target.value))}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <div className={fieldLabel()}>Shipping (£)</div>
                    <input
                      className={inputClass()}
                      inputMode="decimal"
                      value={eShippingStr}
                      onChange={(e) => setEShippingStr(sanitizeDecimalInput(e.target.value))}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <div className={fieldLabel()}>Discount Type</div>
                    <select
                      className={inputClass()}
                      value={eDiscountType}
                      onChange={(e) => setEDiscountType(e.target.value as DiscountType)}
                    >
                      <option value="percent">Percent</option>
                      <option value="fixed">Fixed £</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <div className={fieldLabel()}>Discount Value</div>
                    <input
                      className={inputClass()}
                      inputMode="decimal"
                      value={eDiscountValueStr}
                      onChange={(e) => setEDiscountValueStr(sanitizeDecimalInput(e.target.value))}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <div className={fieldLabel()}>Shop</div>
                    <input
                      className={inputClass()}
                      value={eShopStr}
                      onChange={(e) => setEShopStr(titleCaseEveryWord(e.target.value))}
                    />
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="text-xs text-neutral-700">Total (preview)</div>
                  <div className="text-sm font-semibold text-neutral-900">{money(eTotalPreview)}</div>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" className={buttonClass()} onClick={() => setEditOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className={buttonClass(true)} disabled={editBusy}>
                    {editBusy ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {shipDetailOpen && shipDetail ? (
        <div className={modalBackdrop()} onMouseDown={() => setShipDetailOpen(false)}>
          <div
            className="w-full max-w-3xl rounded-2xl border bg-white shadow-sm"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b p-5">
              <div>
                <div className="text-lg font-semibold text-neutral-900">Shipment details</div>
                <div className="mt-1 text-xs text-neutral-600">
                  Box: <b>{shipDetailBoxNo ?? "-"}</b>
                </div>
              </div>
              <button className={buttonClass()} onClick={() => setShipDetailOpen(false)}>
                Close
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className={fieldLabel()}>Shipment date</div>
                  <div className="text-sm text-neutral-900">{fmtDate(shipDetail.shipment_date ?? shipDetail.sent_date ?? shipDetail.shipped_date ?? shipDetail.created_at)}</div>
                </div>
                <div>
                  <div className={fieldLabel()}>Check-in date</div>
                  <div className="text-sm text-neutral-900">{fmtDate(shipDetail.checkin_date)}</div>
                </div>
                <div>
                  <div className={fieldLabel()}>Cost</div>
                  <div className="text-sm text-neutral-900">{money(toNumber(shipDetail.total ?? shipDetail.cost))}</div>
                </div>
                <div>
                  <div className={fieldLabel()}>Box value</div>
                  <div className="text-sm text-neutral-900">{money(toNumber(shipDetail.box_value))}</div>
                </div>
                <div>
                  <div className={fieldLabel()}>Units</div>
                  <div className="text-sm text-neutral-900">{toNumber(shipDetail.units ?? shipDetail.total_units ?? shipDetail.quantity)}</div>
                </div>
                <div>
                  <div className={fieldLabel()}>Carrier / Tracking</div>
                  <div className="text-sm text-neutral-900">
                    {(shipDetail.carrier ?? shipDetail.courier ?? "-") + " • "}
                    {(() => {
                      const detailTracking = shipDetail.tracking_no ?? shipDetail.tracking ?? "-";
                      const detailHref = trackingUrl(
                        shipDetail.carrier ?? shipDetail.courier ?? null,
                        detailTracking
                      );
                      return detailHref ? (
                        <a href={detailHref} target="_blank" rel="noreferrer" className="underline">
                          {detailTracking}
                        </a>
                      ) : (
                        detailTracking
                      );
                    })()}
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  className={buttonClass(true)}
                  onClick={() => openCheckin(String(shipDetail.id))}
                >
                  Delivered
                </button>
              </div>

              <div className="rounded-xl border bg-neutral-50 p-4">
                <div className="text-sm font-semibold text-neutral-900">Items in this shipment</div>
                {shipDetailGrouped.length === 0 ? (
                  <div className="mt-2 text-sm text-neutral-700">No items found.</div>
                ) : (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {shipDetailGrouped.map((g) => (
                      <div key={g.asin} className="rounded-xl border bg-white p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-semibold text-neutral-900">{g.asin}</div>
                          <div className="text-xs font-semibold text-neutral-900">x{g.qty}</div>
                        </div>
                        <div className="mt-1 text-[11px] text-neutral-600">
                          {g.brand} • {g.name}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activePrototypePlCard ? (
        <div className={modalBackdrop()} onMouseDown={() => setPrototypePlDetailKey(null)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl border bg-white shadow-sm" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b p-5">
              <div>
                <div className="text-lg font-semibold text-neutral-900">{activePrototypePlCard.title}</div>
                <div className="mt-1 text-xs text-neutral-600">{activePrototypePlCard.sub}</div>
              </div>
              <button type="button" className={buttonClass()} onClick={() => setPrototypePlDetailKey(null)}>
                Close
              </button>
            </div>

            <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
              <div className="rounded-xl border bg-neutral-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Value</div>
                <div className="mt-1 text-2xl font-semibold text-neutral-900">{money(activePrototypePlCard.value)}</div>
              </div>

              <div className="rounded-xl border bg-white">
                <div className="border-b px-4 py-3 text-sm font-semibold text-neutral-900">How this number was built</div>
                <div className="divide-y">
                  {activePrototypePlCard.lines.map((line, idx) => (
                    <div
                      key={`${activePrototypePlCard.key}-${idx}`}
                      className={`flex items-center justify-between gap-4 px-4 py-3 text-sm ${line.isSection ? "bg-neutral-50" : ""}`}
                    >
                      <div className={`${line.isSection ? "font-semibold text-neutral-900" : "text-neutral-700"} ${line.indentLevel === 1 ? "pl-4" : ""}`}>
                        {line.label}
                      </div>
                      <div className={`font-semibold ${line.isSection ? "text-neutral-900" : "text-neutral-900"}`}>
                        {line.isCount ? line.value.toLocaleString() : line.negative ? `(${money(line.value)})` : money(line.value)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {activePrototypePlCard.footer ? (
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
                  {activePrototypePlCard.footer}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {checkinOpen && checkinShipmentId ? (
        <div className={modalBackdrop()} onMouseDown={() => !checkinBusy && setCheckinOpen(false)}>
          <div
            className="w-full max-w-lg rounded-2xl border bg-white shadow-sm"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <form
              className="contents"
              onSubmit={(e) => {
                e.preventDefault();
                confirmShipmentDelivered();
              }}
            >
              <div className="flex items-start justify-between border-b p-5">
                <div>
                  <div className="text-lg font-semibold text-neutral-900">Shipment Delivered</div>
                  <div className="mt-1 text-xs text-neutral-600">
                    Enter the delivery / check-in date for this shipment.
                  </div>
                </div>
                <button
                  type="button"
                  className={buttonClass()}
                  onClick={() => setCheckinOpen(false)}
                  disabled={checkinBusy}
                >
                  Close
                </button>
              </div>

              <div className="space-y-3 p-5">
                <div>
                  <div className={fieldLabel()}>Delivery date *</div>
                  <input
                    className={inputClass()}
                    type="date"
                    value={checkinDate}
                    onChange={(e) => setCheckinDate(e.target.value)}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className={buttonClass()}
                    onClick={() => setCheckinOpen(false)}
                    disabled={checkinBusy}
                  >
                    Cancel
                  </button>
                  <button type="submit" className={buttonClass(true)} disabled={checkinBusy}>
                    {checkinBusy ? "Saving…" : "Confirm Delivered"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>                                                                                                                                 
  );
}