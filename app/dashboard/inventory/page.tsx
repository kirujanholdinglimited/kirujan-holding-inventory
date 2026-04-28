"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";

type StatusKey =
  | "all"
  | "awaiting_delivery"
  | "processing"
  | "sent_to_amazon"
  | "selling"
  | "sold"
  | "written_off"
  | "awaiting_refund"
  | "refunded"
  | "returned_items";

type WriteOffReason = string;
type DiscountType = "percent" | "fixed";
type RangeKey =
  | "1D"
  | "7D"
  | "4W"
  | "LM"
  | "CM"
  | "6M"
  | "1Y"
  | "FY";

type SortDirection = "asc" | "desc" | null;

type ProductRow = {
  id: string;
  asin: string;
  brand: string;
  product_name: string;
  product_code: number;
  barcode: string | null;
  amazon_code: string | null;
};

type PurchaseRow = {
  id: string;
  item_no: number | null;
  order_no: number | null;
  created_at: string;
  product_id: string;

  purchase_date: string | null;
  delivery_date: string | null;
  expiry_date: string | null;

  shop: string | null;
  tracking_no: string | null;

  quantity: number;
  remaining_qty: number | null;

  unit_cost: number | null;
  shipping_cost: number | null;
  tax_amount: number | null;

  discount_type: DiscountType | null;
  discount_value: number | null;

  total_cost: number | null;

  tax_year: string;
  status: Exclude<StatusKey, "all" | "returned_items">;

  write_off_reason: WriteOffReason | null;
  write_off_date: string | null;
  return_reason: string | null;
  returned_date: string | null;
  refunded_date: string | null;
  refund_amount: number | null;

  sold_amount: number | null;
  amazon_fees: number | null;
  misc_fees: number | null;
  order_date: string | null;

  amazon_payout: number | null;
  profit_loss: number | null;
  roi: number | null;

  shipment_box_id: string | null;
  sale_type: "FBM" | "FBA" | null;
  fbm_shipping_fee: number | null;
  fbm_tracking_no: string | null;
  return_shipping_fee: number | null;
  last_return_date: string | null;
};

type PurchaseWithProduct = PurchaseRow & { product?: ProductRow | null };

type ShipmentRow = {
  id: string;
  created_at: string;
  shipment_box_no: string | null;
  shipment_date: string | null;
  checkin_date: string | null;
  cost: number | null;
  tax: number | null;
  total: number | null;
  units: number | null;
  total_units: number | null;
  cost_per_item: number | null;
  box_value: number | null;
  weight_kg: number | null;
  tracking_no: string | null;
  carrier: string | null;
};

type SelectOption = {
  value: string;
  label: string;
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

function isIsoDateBefore(a: string, b: string) {
  if (!a || !b) return false;
  return a.slice(0, 10) < b.slice(0, 10);
}

function fmtDate(iso: string | null) {
  if (!iso) return "-";
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return iso;
  return `${day}-${m}-${y}`;
}

function daysBetween(startIso: string | null, endIso: string) {
  if (!startIso) return 0;
  const start = new Date(`${String(startIso).slice(0, 10)}T00:00:00`);
  const end = new Date(`${String(endIso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const diff = end.getTime() - start.getTime();
  return diff < 0 ? 0 : Math.floor(diff / (1000 * 60 * 60 * 24));
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

function normalizeSingleSpacing(input: string) {
  const hasTrailingSpace = /\s$/.test(input);
  const collapsed = input.replace(/\s+/g, " ").trimStart();
  return hasTrailingSpace ? collapsed.replace(/\s+$/g, "") + " " : collapsed.trimEnd();
}

function normalizeScannerValue(input: string | null | undefined) {
  return String(input ?? "")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();
}

function isEditableElement(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;

  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;

  return false;
}


const CODE39_PATTERNS: Record<string, string> = {
  "0": "nnnwwnwnn",
  "1": "wnnwnnnnw",
  "2": "nnwwnnnnw",
  "3": "wnwwnnnnn",
  "4": "nnnwwnnnw",
  "5": "wnnwwnnnn",
  "6": "nnwwwnnnn",
  "7": "nnnwnnwnw",
  "8": "wnnwnnwnn",
  "9": "nnwwnnwnn",
  A: "wnnnnwnnw",
  B: "nnwnnwnnw",
  C: "wnwnnwnnn",
  D: "nnnnwwnnw",
  E: "wnnnwwnnn",
  F: "nnwnwwnnn",
  G: "nnnnnwwnw",
  H: "wnnnnwwnn",
  I: "nnwnnwwnn",
  J: "nnnnwwwnn",
  K: "wnnnnnnww",
  L: "nnwnnnnww",
  M: "wnwnnnnwn",
  N: "nnnnwnnww",
  O: "wnnnwnnwn",
  P: "nnwnwnnwn",
  Q: "nnnnnnwww",
  R: "wnnnnnwwn",
  S: "nnwnnnwwn",
  T: "nnnnwnwwn",
  U: "wwnnnnnnw",
  V: "nwwnnnnnw",
  W: "wwwnnnnnn",
  X: "nwnnwnnnw",
  Y: "wwnnwnnnn",
  Z: "nwwnwnnnn",
  "-": "nwnnnnwnw",
  ".": "wwnnnnwnn",
  " ": "nwwnnnwnn",
  "$": "nwnwnwnnn",
  "/": "nwnwnnnwn",
  "+": "nwnnnwnwn",
  "%": "nnnwnwnwn",
  "*": "nwnnwnwnn",
};

function buildCode39Sequence(value: string) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return null;
  const framed = `*${normalized}*`;
  const patterns = framed.split("").map((ch) => CODE39_PATTERNS[ch]).filter(Boolean);
  if (patterns.length !== framed.length) return null;

  const narrow = 2;
  const wide = 5;
  const quiet = 10;
  let x = quiet;
  const bars: Array<{ x: number; width: number }> = [];

  patterns.forEach((pattern, charIndex) => {
    pattern.split("").forEach((widthKey, i) => {
      const width = widthKey === "w" ? wide : narrow;
      const isBar = i % 2 === 0;
      if (isBar) bars.push({ x, width });
      x += width;
    });

    if (charIndex < patterns.length - 1) {
      x += narrow;
    }
  });

  return { bars, width: x + quiet, quiet };
}

function buildFinaliseConfirmBarcodeValue(boxNo: string | null | undefined, units: number | null | undefined) {
  const normalizedBox = String(boxNo ?? "").trim().toUpperCase();
  const normalizedUnits = Math.max(0, Number(units ?? 0));
  if (!normalizedBox || !Number.isFinite(normalizedUnits) || normalizedUnits <= 0) return "";
  return `CF-${normalizedBox}-${normalizedUnits}`;
}

function Code39Barcode({ value, className = "" }: { value: string; className?: string }) {
  const barcode = useMemo(() => buildCode39Sequence(value), [value]);

  if (!barcode) return null;

  return (
    <div className={["rounded-xl border bg-white p-3", className].join(" ")}>
      <svg
        viewBox={`0 0 ${barcode.width} 72`}
        className="h-20 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Barcode for ${value}`}
      >
        <rect x="0" y="0" width={barcode.width} height="72" fill="#fff" />
        {barcode.bars.map((bar, index) => (
          <rect key={`${bar.x}-${index}`} x={bar.x} y="4" width={bar.width} height="56" fill="#000" />
        ))}
      </svg>
      <div className="mt-2 text-center text-sm font-semibold tracking-[0.18em] text-neutral-900">
        {String(value ?? "").toUpperCase()}
      </div>
    </div>
  );
}



function parseWriteOffDetails(input: string | null) {
  const raw = String(input ?? "").trim();
  if (!raw) {
    return {
      reason: "-",
      outcome: "No extra outcome",
    };
  }

  const parts = raw
    .split("•")
    .map((part) => part.trim())
    .filter(Boolean);

  const outcomePart = parts.find((part) => /^outcome\s*:/i.test(part)) ?? null;
  const reasonParts = parts.filter((part) => !/^outcome\s*:/i.test(part));

  return {
    reason: reasonParts.join(" • ") || raw,
    outcome: outcomePart ? outcomePart.replace(/^outcome\s*:/i, "").trim() : "No extra outcome",
  };
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

function inferRefundParts(row: PurchaseWithProduct | null | undefined) {
  const product = Number(row?.unit_cost ?? 0);
  const shipping = Number(row?.shipping_cost ?? 0);
  const tax = Number(row?.tax_amount ?? 0);
  const target = Number(row?.refund_amount ?? 0);

  const combos = [
    { product: false, shipping: false, tax: false },
    { product: true, shipping: false, tax: false },
    { product: false, shipping: true, tax: false },
    { product: false, shipping: false, tax: true },
    { product: true, shipping: true, tax: false },
    { product: true, shipping: false, tax: true },
    { product: false, shipping: true, tax: true },
    { product: true, shipping: true, tax: true },
  ];

  const roundedTarget = Math.round(target * 100);

  for (const combo of combos) {
    const total =
      (combo.product ? product : 0) +
      (combo.shipping ? shipping : 0) +
      (combo.tax ? tax : 0);

    if (Math.round(total * 100) === roundedTarget) {
      return combo;
    }
  }

  return { product: false, shipping: false, tax: false };
}

function computeUkTaxYear(isoDate: string) {
  const d = new Date(isoDate + "T00:00:00");
  const year = d.getFullYear();
  const apr6ThisYear = new Date(Date.UTC(year, 3, 6));
  const dUtc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  if (dUtc >= apr6ThisYear) return `${year}-${year + 1}`;
  return `${year - 1}-${year}`;
}

function statusLabel(s: StatusKey) {
  switch (s) {
    case "awaiting_delivery":
      return "Awaiting Delivery";
    case "processing":
      return "Processing";
    case "sent_to_amazon":
      return "Sent to Amazon";
    case "selling":
      return "Selling";
    case "sold":
      return "Sold";
    case "written_off":
      return "Written Off";
    case "awaiting_refund":
      return "Awaiting Refund";
    case "refunded":
      return "Refunded";
    case "returned_items":
      return "Returned Items";
    default:
      return "All";
  }
}

function statusPillColor(s: StatusKey) {
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
    case "awaiting_refund":
      return "border-orange-200 bg-orange-50 text-orange-800";
    case "refunded":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "returned_items":
      return "border-orange-200 bg-orange-50 text-orange-800";
    default:
      return "border-neutral-200 bg-neutral-50 text-neutral-700";
  }
}

function statusFilterBtn(active: boolean) {
  return [
    "rounded-xl border px-3 py-1.5 text-sm transition",
    active ? "border-neutral-900 bg-neutral-900 text-white" : "bg-white hover:bg-neutral-50",
  ].join(" ");
}

function buttonClass(primary?: boolean) {
  return primary
    ? "rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white hover:opacity-95"
    : "rounded-xl border px-4 py-2 text-sm hover:bg-neutral-50";
}

function miniBtn(primary?: boolean) {
  return primary
    ? "rounded-lg bg-neutral-900 px-2.5 py-1 text-xs text-white hover:opacity-95"
    : "rounded-lg border px-2.5 py-1 text-xs hover:bg-neutral-50";
}

function inputClass() {
  return "w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-200";
}

function selectClass() {
  return "w-full appearance-none rounded-xl border bg-white px-3 py-2 pr-10 text-sm outline-none focus:ring-2 focus:ring-neutral-200";
}

function fieldLabel() {
  return "text-xs font-medium text-neutral-700";
}

function modalBackdrop() {
  return "fixed inset-0 z-50 flex items-center justify-center bg-black/30";
}

function modalCard() {
  return "my-4 w-full max-w-5xl max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border bg-white shadow-sm";
}

function splitMoneyEvenly(total: number, n: number) {
  const pennies = Math.round((Number.isFinite(total) ? total : 0) * 100);
  const base = Math.floor(pennies / n);
  const rem = pennies % n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push((base + (i < rem ? 1 : 0)) / 100);
  }
  return out;
}

function parseBoxNo(boxNo: string | null | undefined) {
  if (!boxNo) return null;
  const m = String(boxNo).trim().match(/^b(\d+)$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function nextBoxNo(existing: string[]) {
  const used = new Set<number>();
  for (const b of existing) {
    const n = parseBoxNo(b);
    if (n != null) used.add(n);
  }
  let i = 1;
  while (used.has(i)) i++;
  return `B${i}`;
}

function daysAtAmazon(checkinDate: string | null) {
  if (!checkinDate) return null;
  const start = new Date(`${checkinDate}T00:00:00`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.floor((today.getTime() - start.getTime()) / 86400000);
  return diff + 1;
}

function ageClass(days: number | null) {
  if (days == null) return "text-neutral-700";
  if (days < 30) return "font-semibold text-emerald-700";
  if (days < 60) return "font-semibold text-lime-700";
  if (days < 180) return "font-semibold text-yellow-700";
  if (days < 270) return "font-semibold text-orange-700";
  if (days < 300) return "font-semibold text-red-700";
  return "font-semibold text-red-900";
}

function profitLossTextClass(value: number | null) {
  if (value == null) return "text-neutral-700";
  if (value > 0) return "font-bold text-emerald-700";
  if (value < 0) return "font-bold text-red-700";
  return "font-bold text-neutral-700";
}

function roiTextClass(roi: number | null, targetROI: number) {
  if (roi == null) return "text-neutral-700";
  if (roi >= targetROI) return "font-bold text-emerald-700";
  if (roi >= 0) return "font-bold text-yellow-700";
  return "font-bold text-red-700";
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

function getFinancialYearStart(date = new Date()) {
  const year = date.getFullYear();
  const apr6 = new Date(year, 3, 6);
  return date >= apr6 ? apr6 : new Date(year - 1, 3, 6);
}

function getCurrentFyLabel(today = new Date()) {
  const year = today.getFullYear();
  const apr6 = new Date(year, 3, 6);
  return today >= apr6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function isValidTaxYearLabel(label: string | null | undefined) {
  if (!label) return false;
  if (!/^\d{4}-\d{4}$/.test(label)) return false;
  const [startYear, endYear] = label.split("-").map(Number);
  return Number.isFinite(startYear) && Number.isFinite(endYear) && endYear === startYear + 1;
}

function getFyBounds(label: string) {
  const [startYear, endYear] = label.split("-").map(Number);
  return {
    start: new Date(startYear, 3, 6),
    end: new Date(endYear, 3, 5, 23, 59, 59, 999),
  };
}

function inSelectedTaxYear(dateStr: string | null | undefined, fyLabel?: string | null) {
  if (!dateStr) return true;

  const dt = new Date(String(dateStr).slice(0, 10) + "T00:00:00");
  if (Number.isNaN(dt.getTime())) return true;

  const activeFyLabel = isValidTaxYearLabel(fyLabel) ? fyLabel : getCurrentFyLabel();
  const bounds = getFyBounds(activeFyLabel);
  return dt >= bounds.start && dt <= bounds.end;
}

function inSelectedRange(dateStr: string | null | undefined, range: RangeKey, fyLabel?: string | null) {
  if (!dateStr) return true;

  const dt = new Date(String(dateStr).slice(0, 10) + "T00:00:00");
  if (Number.isNaN(dt.getTime())) return true;

  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

  let start: Date;
  let realEnd = end;

  switch (range) {
    case "1D":
      start = new Date(end);
      start.setDate(start.getDate() - 1);
      break;
    case "7D":
      start = new Date(end);
      start.setDate(start.getDate() - 7);
      break;
    case "4W":
      start = new Date(end);
      start.setDate(start.getDate() - 28);
      break;
    case "LM":
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      realEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);
      break;
    case "CM":
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      break;
    case "6M":
      start = new Date(end);
      start.setMonth(start.getMonth() - 6);
      break;
    case "1Y":
      start = new Date(end);
      start.setFullYear(start.getFullYear() - 1);
      break;
    case "FY": {
      const activeFyLabel = isValidTaxYearLabel(fyLabel) ? fyLabel : getCurrentFyLabel(today);
      const bounds = getFyBounds(activeFyLabel);
      start = bounds.start;
      realEnd = bounds.end;
      break;
    }
    default:
      start = new Date(0);
  }

  return dt >= start && dt <= realEnd;
}

function shouldApplyTaxYearFilter(status: StatusKey) {
  return status === "all" || status === "sold" || status === "written_off";
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

  return null;
}

function daysSince(dateStr: string | null) {
  if (!dateStr) return null;
  const start = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today.getTime() - start.getTime()) / 86400000);
}

function compareValues(a: unknown, b: unknown, dir: Exclude<SortDirection, null>) {
  if (a == null && b == null) return 0;
  if (a == null) return dir === "asc" ? 1 : -1;
  if (b == null) return dir === "asc" ? -1 : 1;

  if (typeof a === "number" && typeof b === "number") {
    return dir === "asc" ? a - b : b - a;
  }

  const aDate = typeof a === "string" ? Date.parse(a) : NaN;
  const bDate = typeof b === "string" ? Date.parse(b) : NaN;
  if (!Number.isNaN(aDate) && !Number.isNaN(bDate)) {
    return dir === "asc" ? aDate - bDate : bDate - aDate;
  }

  const aa = String(a).toLowerCase();
  const bb = String(b).toLowerCase();

  if (aa < bb) return dir === "asc" ? -1 : 1;
  if (aa > bb) return dir === "asc" ? 1 : -1;
  return 0;
}

function sortHeaderClass() {
  return "cursor-pointer select-none py-3 pr-4 transition hover:text-neutral-900";
}

function sortIndicator(active: boolean, direction: SortDirection) {
  if (!active || !direction) return "↕";
  return direction === "asc" ? "↑" : "↓";
}

function SelectField(props: {
  value: string | number;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
}) {
  const { value, onChange, options, className } = props;

  return (
    <div className={["relative", className ?? ""].join(" ")}>
      <select
        className={selectClass()}
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={`${opt.value}-${opt.label}`} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-neutral-500">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </div>
    </div>
  );
}

function ShopInput(props: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const { value, onChange, options, placeholder, inputRef } = props;
  const [open, setOpen] = useState(false);

  const filteredOptions = useMemo(() => {
    const seen = new Set<string>();
    const q = value.trim().toLowerCase();

    return options
      .filter((opt) => {
        const s = String(opt ?? "").trim();
        if (!s) return false;
        const key = s.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return q ? key.includes(q) : true;
      })
      .slice(0, 8);
  }, [options, value]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        className={inputClass()}
        value={value}
        onChange={(e) => {
          onChange(titleCaseEveryWord(e.target.value));
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        autoComplete="off"
      />

      {open && filteredOptions.length > 0 ? (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border bg-white p-1 shadow-lg">
          {filteredOptions.map((opt) => (
            <button
              key={opt}
              type="button"
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-800 hover:bg-neutral-50"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(opt);
                setOpen(false);
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ReasonAutocompleteInput(props: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  inputRef?: any;
  placeholder?: string;
}) {
  const { value, onChange, options, inputRef, placeholder } = props;
  const [open, setOpen] = useState(false);

  const filteredOptions = useMemo(() => {
    const seen = new Set<string>();
    const q = value.trim().toLowerCase();

    return options
      .filter((opt) => {
        const s = String(opt ?? "").trim();
        if (!s) return false;
        const key = s.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return q ? key.includes(q) : true;
      })
      .slice(0, 8);
  }, [options, value]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        className={inputClass()}
        value={value}
        onChange={(e) => {
          const normalized = normalizeSingleSpacing(e.target.value);
          const formatted = normalized
            .split(" ")
            .map(w => w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : "")
            .join(" ");
          onChange(formatted);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        autoComplete="off"
      />

      {open && filteredOptions.length > 0 ? (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border bg-white p-1 shadow-lg">
          {filteredOptions.map((opt) => (
            <button
              key={opt}
              type="button"
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-800 hover:bg-neutral-50"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(opt);
                setOpen(false);
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SortableTh(props: {
  label: string;
  sortKey: string;
  activeKey: string | null;
  direction: SortDirection;
  onToggle: (key: string) => void;
  className?: string;
}) {
  const { label, sortKey, activeKey, direction, onToggle, className } = props;
  const active = activeKey === sortKey;

  return (
    <th
      className={[sortHeaderClass(), className ?? ""].join(" ")}
      onClick={() => onToggle(sortKey)}
      title="Click to sort ascending, descending, then reset"
    >
      <span className="inline-flex items-center gap-1">
        <span>{label}</span>
        <span className="text-[10px] text-neutral-400">{sortIndicator(active, direction)}</span>
      </span>
    </th>
  );
}

function DiscountInput(props: {
  value: string;
  onChange: (v: string) => void;
  discountType: DiscountType;
  setDiscountType: (t: DiscountType) => void;
}) {
  const { value, onChange, discountType, setDiscountType } = props;

  return (
    <div className="relative">
      <div className="absolute left-2 top-1/2 z-10 flex -translate-y-1/2 overflow-hidden rounded-lg border bg-white">
        <button
          type="button"
          className={[
            "px-2.5 py-1 text-xs",
            discountType === "percent" ? "bg-neutral-900 text-white" : "hover:bg-neutral-50",
          ].join(" ")}
          onClick={() => setDiscountType("percent")}
        >
          %
        </button>
        <button
          type="button"
          className={[
            "border-l px-2.5 py-1 text-xs",
            discountType === "fixed" ? "bg-neutral-900 text-white" : "hover:bg-neutral-50",
          ].join(" ")}
          onClick={() => setDiscountType("fixed")}
        >
          £
        </button>
      </div>

      <input
        className={[inputClass(), "pl-20"].join(" ")}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(sanitizeDecimalInput(e.target.value))}
        placeholder="0"
      />
    </div>
  );
}

async function getAllShipmentBoxNos() {
  const { data, error } = await supabase
    .from("shipments")
    .select("shipment_box_no")
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? [])
    .map((r: any) => String(r.shipment_box_no ?? "").trim())
    .filter(Boolean);
}

async function getNextAvailableBoxNoFromDatabase() {
  const allBoxNos = await getAllShipmentBoxNos();
  return nextBoxNo(allBoxNos);
}

async function getNextOrderNoFromDatabase() {
  const { data, error } = await supabase.rpc("get_next_order_no");

  if (error) throw error;

  const nextNo = Number(data);
  if (!Number.isFinite(nextNo) || nextNo <= 0) {
    throw new Error("Failed to generate next order number.");
  }

  return nextNo;
}

async function getNextItemNoFromDatabase() {
  const { data, error } = await supabase
    .from("purchases")
    .select("item_no")
    .not("item_no", "is", null)
    .order("item_no", { ascending: false })
    .limit(1);

  if (error) throw error;

  const currentMax = Number(data?.[0]?.item_no ?? 0);
  return Number.isFinite(currentMax) ? currentMax + 1 : 1;
}

async function createFreshOpenShipmentRow() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const nextNo = await getNextAvailableBoxNoFromDatabase();

    const { data, error } = await supabase
      .from("shipments")
      .insert({
        shipment_box_no: nextNo,
        carrier: "UPS",
        shipment_date: null,
        units: 0,
        total_units: 0,
        cost: 0,
        tax: 0,
        total: 0,
        cost_per_item: 0,
        box_value: 0,
        weight_kg: 0,
        tracking_no: "",
        checkin_date: null,
      })
      .select(
        "id, created_at, shipment_box_no, shipment_date, checkin_date, cost, tax, total, units, total_units, cost_per_item, box_value, weight_kg, tracking_no, carrier"
      )
      .single();

    if (!error) {
      return data as ShipmentRow;
    }

    const msg = String(error.message ?? "").toLowerCase();
    if (!msg.includes("duplicate key value") && !msg.includes("unique")) {
      throw error;
    }
  }

  throw new Error("Failed to create a new shipment box. Please try again.");
}

export default function InventoryPage() {
  const searchParams = useSearchParams();
  const urlStatus = (searchParams.get("status") as StatusKey | null) ?? "all";
  const urlRange = (searchParams.get("range") as RangeKey | null) ?? "FY";

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseWithProduct[]>([]);
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [openShipment, setOpenShipment] = useState<ShipmentRow | null>(null);
  const [shopHistory, setShopHistory] = useState<string[]>([]);
  const [writeOffReasonHistory, setWriteOffReasonHistory] = useState<string[]>([]);
  const [returnReasonHistory, setReturnReasonHistory] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const currentFyLabel = getCurrentFyLabel();
  const [selectedTaxYear, setSelectedTaxYear] = useState<string>(currentFyLabel);

  const [status, setStatus] = useState<StatusKey>(urlStatus);
  const [range, setRange] = useState<RangeKey>(urlRange);
  const [page, setPage] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [rowsPerPage, setRowsPerPage] = useState(100);

  const [purchaseSortKey, setPurchaseSortKey] = useState<string | null>(null);
  const [purchaseSortDirection, setPurchaseSortDirection] = useState<SortDirection>(null);
  const [shipmentSortKey, setShipmentSortKey] = useState<string | null>(null);
  const [shipmentSortDirection, setShipmentSortDirection] = useState<SortDirection>(null);

  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null);

  const [showInBox, setShowInBox] = useState(false);
  const [showProcessingBoxOnly, setShowProcessingBoxOnly] = useState(false);

  const [targetROI, setTargetROI] = useState<number>(30);
  const [targetROIOpen, setTargetROIOpen] = useState(false);
  const [targetROIStr, setTargetROIStr] = useState("30");

  const [addOpen, setAddOpen] = useState(false);
  const [addCatalogOpen, setAddCatalogOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const [deliveredOpen, setDeliveredOpen] = useState(false);
  const [deliveredTargetId, setDeliveredTargetId] = useState<string | null>(null);
  const [deliveredTargetIds, setDeliveredTargetIds] = useState<string[]>([]);
  const [deliveredDate, setDeliveredDate] = useState(todayISO());
  const [deliveredBusy, setDeliveredBusy] = useState(false);
  const [deliveredError, setDeliveredError] = useState<string | null>(null);
  const [awaitingSelectedIds, setAwaitingSelectedIds] = useState<string[]>([]);
  const [barcodeNotFoundOpen, setBarcodeNotFoundOpen] = useState(false);
  const [barcodeNotFoundValue, setBarcodeNotFoundValue] = useState("");
  const [barcodeNotFoundContext, setBarcodeNotFoundContext] = useState<"awaiting_delivery" | "processing">("awaiting_delivery");

  const [writeOffOpen, setWriteOffOpen] = useState(false);
  const [writeOffReasonText, setWriteOffReasonText] = useState("");
  const [writeOffOutcome, setWriteOffOutcome] = useState<"none" | "dispose" | "return_to_me">(
    "none"
  );
  const [writeOffExtraCostStr, setWriteOffExtraCostStr] = useState("0");
  const [writeOffDate, setWriteOffDate] = useState(todayISO());

  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreTargetId, setRestoreTargetId] = useState<string | null>(null);
  const [restoreStatus, setRestoreStatus] =
    useState<Exclude<StatusKey, "all">>("awaiting_delivery");
  const [writtenOffDetailOpen, setWrittenOffDetailOpen] = useState(false);
  const [writtenOffDetailId, setWrittenOffDetailId] = useState<string | null>(null);
  const [writtenOffEditMode, setWrittenOffEditMode] = useState(false);
  const [writtenOffEditReason, setWrittenOffEditReason] = useState("");
  const [writtenOffEditOutcome, setWrittenOffEditOutcome] = useState<"none" | "dispose" | "return_to_me">("none");
  const [writtenOffEditCostStr, setWrittenOffEditCostStr] = useState("0");
  const [writtenOffEditDate, setWrittenOffEditDate] = useState(todayISO());
  const [writtenOffEditBusy, setWrittenOffEditBusy] = useState(false);

  const [soldOpen, setSoldOpen] = useState(false);
  const [soldTargetId, setSoldTargetId] = useState<string | null>(null);
  const [soldAmountStr, setSoldAmountStr] = useState("0");
  const [soldAmazonFeesStr, setSoldAmazonFeesStr] = useState("0");
  const [soldMiscFeesStr, setSoldMiscFeesStr] = useState("0");
  const [soldFbmShippingFeeStr, setSoldFbmShippingFeeStr] = useState("0");
  const [soldFbmCarrierStr, setSoldFbmCarrierStr] = useState("");
  const [soldFbmTrackingNo, setSoldFbmTrackingNo] = useState("");
  const [soldMode, setSoldMode] = useState<"FBA" | "FBM">("FBA");
  const [soldOrderDate, setSoldOrderDate] = useState(todayISO());
  const [soldBusy, setSoldBusy] = useState(false);
  const [soldEditMode, setSoldEditMode] = useState(false);

  const [returnOpen, setReturnOpen] = useState(false);
  const [returnTargetId, setReturnTargetId] = useState<string | null>(null);
  const [returnCostStr, setReturnCostStr] = useState("0");
  const [returnDate, setReturnDate] = useState(todayISO());
  const [returnBusy, setReturnBusy] = useState(false);
  const [awaitingRefundOpen, setAwaitingRefundOpen] = useState(false);
  const [awaitingRefundTargetId, setAwaitingRefundTargetId] = useState<string | null>(null);
  const [awaitingRefundReason, setAwaitingRefundReason] = useState("");
  const [awaitingRefundIncludeProduct, setAwaitingRefundIncludeProduct] = useState(false);
  const [awaitingRefundIncludeShipping, setAwaitingRefundIncludeShipping] = useState(false);
  const [awaitingRefundIncludeVat, setAwaitingRefundIncludeVat] = useState(false);
  const [awaitingRefundError, setAwaitingRefundError] = useState<string | null>(null);
  const [awaitingRefundBusy, setAwaitingRefundBusy] = useState(false);
  const [awaitingRefundDate, setAwaitingRefundDate] = useState(todayISO());

  const [refundCompleteOpen, setRefundCompleteOpen] = useState(false);
  const [refundCompleteTargetId, setRefundCompleteTargetId] = useState<string | null>(null);
  const [refundCompleteDate, setRefundCompleteDate] = useState(todayISO());
  const [refundCompleteBusy, setRefundCompleteBusy] = useState(false);
  const [refundCompleteError, setRefundCompleteError] = useState<string | null>(null);

  const [returnedItemDetailOpen, setReturnedItemDetailOpen] = useState(false);
  const [returnedItemDetailId, setReturnedItemDetailId] = useState<string | null>(null);

  const [productQuery, setProductQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const [purchaseDate, setPurchaseDate] = useState(todayISO());
  const [deliveryDate, setDeliveryDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");

  const [shopStr, setShopStr] = useState("");
  const [trackingStr, setTrackingStr] = useState("");

  const [qty, setQty] = useState<number>(1);
  const [unitCostStr, setUnitCostStr] = useState("0");
  const [taxStr, setTaxStr] = useState("0");
  const [shippingStr, setShippingStr] = useState("0");
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discountValueStr, setDiscountValueStr] = useState("0");

  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [catAsin, setCatAsin] = useState("");
  const [catBrand, setCatBrand] = useState("");
  const [catName, setCatName] = useState("");
  const [catBarcode, setCatBarcode] = useState("");
  const [catAmazonBarcode, setCatAmazonBarcode] = useState("");
  const [catBusy, setCatBusy] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);

  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [ePurchaseDate, setEPurchaseDate] = useState(todayISO());
  const [eDeliveryDate, setEDeliveryDate] = useState("");
  const [eExpiryDate, setEExpiryDate] = useState("");
  const [eShopStr, setEShopStr] = useState("");
  const [eTrackingStr, setETrackingStr] = useState("");
  const [eQty, setEQty] = useState<number>(1);
  const [eUnitCostStr, setEUnitCostStr] = useState("0");
  const [eTaxStr, setETaxStr] = useState("0");
  const [eShippingStr, setEShippingStr] = useState("0");
  const [eMiscFeesStr, setEMiscFeesStr] = useState("0");
  const [eDiscountType, setEDiscountType] = useState<DiscountType>("percent");
  const [eDiscountValueStr, setEDiscountValueStr] = useState("0");

  const [editBoxOpen, setEditBoxOpen] = useState(false);
  const [editBoxAsin, setEditBoxAsin] = useState("");
  const [editBoxTargetQtyStr, setEditBoxTargetQtyStr] = useState("0");

  const [finaliseStep, setFinaliseStep] = useState<0 | 1 | 2 | 3>(0);
  const [amazonUnitsStr, setAmazonUnitsStr] = useState("");
  const [boxCostStr, setBoxCostStr] = useState("");
  const [boxWeightKgStr, setBoxWeightKgStr] = useState("");
  const [boxCarrier, setBoxCarrier] = useState("UPS");
  const [boxTrackingNo, setBoxTrackingNo] = useState("");
  const [boxShipDate, setBoxShipDate] = useState(todayISO());
  const [finaliseErr, setFinaliseErr] = useState<string | null>(null);
  const [finaliseBusy, setFinaliseBusy] = useState(false);
  const [finaliseCheckedIds, setFinaliseCheckedIds] = useState<string[]>([]);
  const [finaliseItemNotInBoxOpen, setFinaliseItemNotInBoxOpen] = useState(false);
  const [finaliseItemNotInBoxValue, setFinaliseItemNotInBoxValue] = useState("");

  const [checkinOpen, setCheckinOpen] = useState(false);
  const [checkinShipmentId, setCheckinShipmentId] = useState<string | null>(null);
  const [checkinDate, setCheckinDate] = useState(todayISO());
  const [checkinBusy, setCheckinBusy] = useState(false);

  const [shipDetailOpen, setShipDetailOpen] = useState(false);
  const [shipDetailId, setShipDetailId] = useState<string | null>(null);

  const addPurchaseProductSearchRef = useRef<HTMLInputElement | null>(null);
  const addPurchaseShopRef = useRef<HTMLInputElement | null>(null);
  const targetROIRef = useRef<HTMLInputElement | null>(null);
  const editBoxRef = useRef<HTMLInputElement | null>(null);
  const writeOffRef = useRef<HTMLInputElement | null>(null);
  const soldAmountRef = useRef<HTMLInputElement | null>(null);
  const returnRef = useRef<HTMLInputElement | null>(null);
  const awaitingRefundReasonRef = useRef<HTMLInputElement | null>(null);
  const refundCompleteDateRef = useRef<HTMLInputElement | null>(null);
  const soldPrintRef = useRef<HTMLFormElement | null>(null);
  const addCatalogRef = useRef<HTMLInputElement | null>(null);
  const checkinRef = useRef<HTMLInputElement | null>(null);
  const finaliseUnitsRef = useRef<HTMLInputElement | null>(null);
  const finaliseCostRef = useRef<HTMLInputElement | null>(null);
  const finaliseDateRef = useRef<HTMLInputElement | null>(null);
  const editDateRef = useRef<HTMLInputElement | null>(null);
  const deliveredDateRef = useRef<HTMLInputElement | null>(null);
  const processingClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const awaitingClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const timeframeOptions: SelectOption[] = [
    { value: "1D", label: "1 Day" },
    { value: "7D", label: "7 Days" },
    { value: "4W", label: "4 Weeks" },
    { value: "LM", label: "Last Month" },
    { value: "CM", label: "Current Month" },
    { value: "6M", label: "6 Months" },
    { value: "1Y", label: "1 Year" },
    { value: "FY", label: "Current Financial Year" },
  ];

  const rowsPerPageOptions: SelectOption[] = [
    { value: "10", label: "10" },
    { value: "50", label: "50" },
    { value: "100", label: "100" },
    { value: "250", label: "250" },
    { value: "500", label: "500" },
  ];

  const restoreStatusOptions: SelectOption[] = [
    { value: "awaiting_delivery", label: "Awaiting Delivery" },
    { value: "processing", label: "Processing" },
    { value: "sent_to_amazon", label: "Sent to Amazon" },
    { value: "selling", label: "Selling" },
    { value: "sold", label: "Sold" },
  ];

  const writeOffOutcomeOptions: SelectOption[] = [
    { value: "none", label: "No extra outcome" },
    { value: "dispose", label: "Disposed by Amazon" },
    { value: "return_to_me", label: "Returned to me" },
  ];

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

    const initial = readStoredTaxYear();
    if (isValidTaxYearLabel(initial)) setSelectedTaxYear(initial);

    const onTaxYearChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ taxYear?: string }>;
      const nextTaxYear = customEvent.detail?.taxYear ?? readStoredTaxYear();
      if (isValidTaxYearLabel(nextTaxYear)) setSelectedTaxYear(nextTaxYear);
    };

    window.addEventListener("dashboard-tax-year-change", onTaxYearChange as EventListener);
    window.addEventListener("storage", onTaxYearChange as EventListener);
    return () => {
      window.removeEventListener("dashboard-tax-year-change", onTaxYearChange as EventListener);
      window.removeEventListener("storage", onTaxYearChange as EventListener);
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 400);

    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (targetROIOpen) targetROIRef.current?.focus();
  }, [targetROIOpen]);

  useEffect(() => {
    if (editBoxOpen) editBoxRef.current?.focus();
  }, [editBoxOpen]);

  useEffect(() => {
    if (writeOffOpen) writeOffRef.current?.focus();
  }, [writeOffOpen]);

  useEffect(() => {
    if (soldOpen) soldAmountRef.current?.focus();
  }, [soldOpen]);

  useEffect(() => {
    if (returnOpen) returnRef.current?.focus();
  }, [returnOpen]);
  useEffect(() => {
    if (awaitingRefundOpen) awaitingRefundReasonRef.current?.focus();
  }, [awaitingRefundOpen]);

  useEffect(() => {
    if (refundCompleteOpen) refundCompleteDateRef.current?.focus();
  }, [refundCompleteOpen]);

  useEffect(() => {
    if (addOpen) addPurchaseProductSearchRef.current?.focus();
  }, [addOpen]);

  useEffect(() => {
    if (!addOpen) return;

    const normalizedQuery = normalizeScannerValue(productQuery);
    if (!normalizedQuery) return;

    const exactBarcodeMatch = products.find((product) => {
      return (
        normalizeScannerValue(product.barcode) === normalizedQuery ||
        normalizeScannerValue(product.amazon_code) === normalizedQuery
      );
    });

    if (!exactBarcodeMatch) return;

    if (selectedProductId !== exactBarcodeMatch.id) {
      setSelectedProductId(exactBarcodeMatch.id);
    }

    setCreateError(null);

    window.setTimeout(() => {
      addPurchaseShopRef.current?.focus();
    }, 0);
  }, [addOpen, productQuery, products, selectedProductId]);

  useEffect(() => {
    if (addCatalogOpen) addCatalogRef.current?.focus();
  }, [addCatalogOpen]);

  useEffect(() => {
    if (!addCatalogOpen) return;

    let buffer = "";
    let lastTime = 0;

    const handleScannedValue = (value: string) => {
      const scanned = value.trim();
      if (!scanned) return;

      if (/^x/i.test(scanned)) {
        setCatAmazonBarcode(scanned);
        return;
      }

      if (/^\d+$/.test(scanned)) {
        setCatBarcode(scanned);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const scannedTargetIsEditable = isEditableElement(e.target);
      const activeEl = document.activeElement;
      const activeElementIsEditable = !!(activeEl && isEditableElement(activeEl) && activeEl !== document.body);

      if (finaliseStep !== 1) {
        if (scannedTargetIsEditable) return;
        if (activeElementIsEditable) return;
      }

      const now = Date.now();
      if (now - lastTime > 100) {
        buffer = "";
      }
      lastTime = now;

      if (e.key === "Enter") {
        if (buffer) {
          e.preventDefault();
          handleScannedValue(buffer);
          buffer = "";
        }
        return;
      }

      if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [addCatalogOpen]);



  useEffect(() => {
    if (checkinOpen) checkinRef.current?.focus();
  }, [checkinOpen]);

  useEffect(() => {
    if (editOpen) editDateRef.current?.focus();
  }, [editOpen]);

  useEffect(() => {
    if (deliveredOpen) deliveredDateRef.current?.focus();
  }, [deliveredOpen]);

  useEffect(() => {
    if (status !== "awaiting_delivery") {
      setAwaitingSelectedIds([]);
    }
  }, [status]);

  useEffect(() => {
    setAwaitingSelectedIds((prev) => {
      const valid = new Set(
        purchases.filter((p) => p.status === "awaiting_delivery").map((p) => p.id)
      );
      return prev.filter((id) => valid.has(id));
    });
  }, [purchases]);

  useEffect(() => {
    return () => {
      if (processingClickTimeoutRef.current) clearTimeout(processingClickTimeoutRef.current);
      if (awaitingClickTimeoutRef.current) clearTimeout(awaitingClickTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (finaliseStep === 1) finaliseUnitsRef.current?.focus();
    if (finaliseStep === 2) finaliseCostRef.current?.focus();
    if (finaliseStep === 3) finaliseDateRef.current?.focus();
  }, [finaliseStep]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;

      if (finaliseItemNotInBoxOpen) {
        e.preventDefault();
        e.stopPropagation();
        setFinaliseItemNotInBoxOpen(false);
        return;
      }
      if (barcodeNotFoundOpen) {
        closeBarcodeNotFoundModal();
        return;
      }
      if (deliveredOpen && !deliveredBusy) {
        closeDeliveredModal();
        return;
      }
      if (addCatalogOpen) {
        setAddCatalogOpen(false);
        return;
      }
      if (addOpen) {
        setAddOpen(false);
        return;
      }
      if (editOpen) {
        setEditOpen(false);
        return;
      }
      if (writeOffOpen) {
        setWriteOffOpen(false);
        return;
      }
      if (restoreOpen) {
        setRestoreOpen(false);
        return;
      }
      if (writtenOffDetailOpen) {
        setWrittenOffDetailOpen(false);
        return;
      }
      if (soldOpen) {
        setSoldOpen(false);
        return;
      }
      if (returnOpen) {
        setReturnOpen(false);
        return;
      }
      if (awaitingRefundOpen) {
        setAwaitingRefundOpen(false);
        return;
      }
      if (refundCompleteOpen && !refundCompleteBusy) {
        setRefundCompleteOpen(false);
        return;
      }
      if (returnedItemDetailOpen) {
        setReturnedItemDetailOpen(false);
        return;
      }
      if (checkinOpen && !checkinBusy) {
        setCheckinOpen(false);
        return;
      }
      if (shipDetailOpen) {
        setShipDetailOpen(false);
        return;
      }
      if (editBoxOpen) {
        setEditBoxOpen(false);
        return;
      }
      if (targetROIOpen) {
        setTargetROIOpen(false);
        return;
      }
      if (finaliseStep !== 0 && !finaliseBusy) {
        setFinaliseStep(0);
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [
    finaliseItemNotInBoxOpen,
    barcodeNotFoundOpen,
    deliveredOpen,
    deliveredBusy,
    addCatalogOpen,
    addOpen,
    editOpen,
    writeOffOpen,
    restoreOpen,
    writtenOffDetailOpen,
    soldOpen,
    returnOpen,
    awaitingRefundOpen,
    refundCompleteOpen,
    refundCompleteBusy,
    returnedItemDetailOpen,
    checkinOpen,
    checkinBusy,
    shipDetailOpen,
    editBoxOpen,
    targetROIOpen,
    finaliseStep,
    finaliseBusy,
  ]);

  function togglePurchaseSort(key: string) {
    if (purchaseSortKey !== key) {
      setPurchaseSortKey(key);
      setPurchaseSortDirection("asc");
      return;
    }

    if (purchaseSortDirection === "asc") {
      setPurchaseSortDirection("desc");
      return;
    }

    if (purchaseSortDirection === "desc") {
      setPurchaseSortKey(null);
      setPurchaseSortDirection(null);
      return;
    }

    setPurchaseSortDirection("asc");
  }

  function toggleShipmentSort(key: string) {
    if (shipmentSortKey !== key) {
      setShipmentSortKey(key);
      setShipmentSortDirection("asc");
      return;
    }

    if (shipmentSortDirection === "asc") {
      setShipmentSortDirection("desc");
      return;
    }

    if (shipmentSortDirection === "desc") {
      setShipmentSortKey(null);
      setShipmentSortDirection(null);
      return;
    }

    setShipmentSortDirection("asc");
  }

  async function ensureOpenShipmentRow() {
    const { data: openRows, error: openErr } = await supabase
      .from("shipments")
      .select(
        "id, created_at, shipment_box_no, shipment_date, checkin_date, cost, tax, total, units, total_units, cost_per_item, box_value, weight_kg, tracking_no, carrier"
      )
      .is("shipment_date", null)
      .order("created_at", { ascending: true })
      .limit(1);

    if (openErr) throw openErr;

    if (openRows && openRows.length > 0) {
      return openRows[0] as ShipmentRow;
    }

    return await createFreshOpenShipmentRow();
  }

  async function loadProductsForPopup() {
    if (!addOpen) return;

    let q = supabase
      .from("products")
      .select("id, asin, brand, product_name, product_code, barcode, amazon_code")
      .order("product_code", { ascending: false });

    if (!productQuery.trim()) {
      const { data, error } = await q.limit(5);
      if (!error) setProducts((data ?? []) as ProductRow[]);
      return;
    }

    const text = productQuery.trim();
    const numeric = Number(text);

    if (Number.isFinite(numeric)) {
      const { data, error } = await q
        .or(`product_code.eq.${numeric},barcode.ilike.%${text}%,amazon_code.ilike.%${text}%`)
        .limit(5);
      if (!error) setProducts((data ?? []) as ProductRow[]);
      return;
    }

    const { data, error } = await q
      .or(`asin.ilike.%${text}%,brand.ilike.%${text}%,product_name.ilike.%${text}%,barcode.ilike.%${text}%,amazon_code.ilike.%${text}%`)
      .limit(5);

    if (!error) setProducts((data ?? []) as ProductRow[]);
  }

  async function loadShopHistory() {
    const { data, error } = await supabase
      .from("purchases")
      .select("shop")
      .not("shop", "is", null)
      .order("shop", { ascending: true });

    if (error) throw error;

    const seen = new Set<string>();
    const shops = (data ?? [])
      .map((r: any) => titleCaseEveryWord(String(r.shop ?? "").trim()))
      .filter((s: string) => {
        if (!s) return false;
        const key = s.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    setShopHistory(shops);
  }

  async function loadWriteOffReasonHistory() {
    const { data, error } = await supabase
      .from("purchases")
      .select("write_off_reason")
      .not("write_off_reason", "is", null)
      .order("write_off_reason", { ascending: true });

    if (error) throw error;

    const seen = new Set<string>();
    const reasons = (data ?? [])
      .map((r: any) => titleCaseEveryWord(String(r.write_off_reason ?? "").trim()))
      .filter((s: string) => {
        if (!s) return false;
        const key = s.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    setWriteOffReasonHistory(reasons);
  }

  async function loadReturnReasonHistory() {
    const { data, error } = await supabase
      .from("purchases")
      .select("return_reason")
      .not("return_reason", "is", null)
      .order("return_reason", { ascending: true });

    if (error) throw error;

    const seen = new Set<string>();
    const reasons = (data ?? [])
      .map((r: any) => titleCaseEveryWord(String(r.return_reason ?? "").trim()))
      .filter((s: string) => {
        if (!s) return false;
        const key = s.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    setReturnReasonHistory(reasons);
  }

  function getRowDateForRangeRaw(row: PurchaseWithProduct) {
    if (row.status === "sold") return row.order_date ?? row.created_at;
    if (row.status === "awaiting_refund" || row.status === "refunded") return row.returned_date ?? row.created_at;
    if (row.status === "selling") return row.created_at;
    if (row.status === "sent_to_amazon") return row.created_at;
    return row.purchase_date ?? row.created_at;
  }

  async function loadAll() {
    setLoading(true);
    setPageError(null);

    try {
      await Promise.all([loadShopHistory(), loadWriteOffReasonHistory(), loadReturnReasonHistory()]);
      const open = await ensureOpenShipmentRow();
      setOpenShipment(open);

      let productIdsForSearch: string[] | null = null;

      if (search.trim()) {
        const searchText = search.trim();
        const numeric = Number(searchText);

        if (Number.isFinite(numeric)) {
          const { data: productMatches, error: prodErr } = await supabase
            .from("products")
            .select("id")
            .eq("product_code", numeric);

          if (prodErr) throw prodErr;
          productIdsForSearch = (productMatches ?? []).map((r: any) => r.id);
        } else {
          const { data: productMatches, error: prodErr } = await supabase
            .from("products")
            .select("id")
            .or(
              `asin.ilike.%${searchText}%,brand.ilike.%${searchText}%,product_name.ilike.%${searchText}%`
            );

          if (prodErr) throw prodErr;
          productIdsForSearch = (productMatches ?? []).map((r: any) => r.id);
        }
      }

      if (status === "sent_to_amazon") {
        let shipQuery = supabase
          .from("shipments")
          .select(
            "id, created_at, shipment_box_no, shipment_date, checkin_date, cost, tax, total, units, total_units, cost_per_item, box_value, weight_kg, tracking_no, carrier"
          )
          .not("shipment_date", "is", null)
          .is("checkin_date", null)
          .order("shipment_date", { ascending: false })
          .range(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

        if (search.trim()) {
          const q = search.trim();
          shipQuery = shipQuery.or(
            `shipment_box_no.ilike.%${q}%,tracking_no.ilike.%${q}%,carrier.ilike.%${q}%`
          );
        }

        const { data: shipData, error: shipErr } = await shipQuery;
        if (shipErr) throw shipErr;

        const rows = (shipData ?? []) as ShipmentRow[];
        setShipments(rows.slice(0, rowsPerPage));
        setHasNextPage(rows.length > rowsPerPage);
        setPurchases([]);
        setLoading(false);
        return;
      }

      let purchaseQuery = supabase
        .from("purchases")
        .select(`
          id,
          item_no,
          order_no,
          created_at,
          product_id,
          purchase_date,
          delivery_date,
          expiry_date,
          shop,
          tracking_no,
          quantity,
          remaining_qty,
          unit_cost,
          shipping_cost,
          tax_amount,
          discount_type,
          discount_value,
          total_cost,
          tax_year,
          status,
          write_off_reason,
          write_off_date,
          return_reason,
          returned_date,
          refunded_date,
          refund_amount,
          sold_amount,
          amazon_fees,
          misc_fees,
          order_date,
          amazon_payout,
          profit_loss,
          roi,
          shipment_box_id,
          sale_type,
          fbm_shipping_fee,
          fbm_tracking_no,
          return_shipping_fee,
          last_return_date,
          product:products(id, asin, brand, product_name, product_code, barcode, amazon_code)
        `)
        .order("created_at", { ascending: false })
        .range(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

      if (status === "returned_items") {
        purchaseQuery = purchaseQuery.in("status", ["awaiting_refund", "refunded"]);
      } else if (status !== "all") {
        purchaseQuery = purchaseQuery.eq("status", status);
      }

      if (productIdsForSearch && productIdsForSearch.length > 0) {
        purchaseQuery = purchaseQuery.in("product_id", productIdsForSearch);
      }

      if (search.trim() && (!productIdsForSearch || productIdsForSearch.length === 0)) {
        const searchText = search.trim();
        const numericSearch = Number(searchText);

        if (Number.isFinite(numericSearch)) {
          purchaseQuery = purchaseQuery.or(
            `shop.ilike.%${searchText}%,tracking_no.ilike.%${searchText}%,item_no.eq.${numericSearch},order_no.eq.${numericSearch}`
          );
        } else {
          purchaseQuery = purchaseQuery.or(`shop.ilike.%${searchText}%,tracking_no.ilike.%${searchText}%`);
        }
      }

      const { data: purData, error: purErr } = await purchaseQuery;
      if (purErr) throw purErr;

      let rows = (purData ?? []) as PurchaseWithProduct[];
      rows = rows.filter((r) => {
        if (!shouldApplyTaxYearFilter(status)) return true;
        const rowDate = getRowDateForRangeRaw(r);
        return inSelectedTaxYear(rowDate, selectedTaxYear) && inSelectedRange(rowDate, range, selectedTaxYear);
      });
      setHasNextPage(rows.length > rowsPerPage);
      rows = rows.slice(0, rowsPerPage);

      const shipmentBoxIds = Array.from(
        new Set(rows.map((r) => r.shipment_box_id).filter(Boolean))
      ) as string[];

      let shipmentRows: ShipmentRow[] = [];
      if (shipmentBoxIds.length > 0 || open?.shipment_box_no) {
        const idsToLoad = open?.shipment_box_no
          ? Array.from(new Set([...shipmentBoxIds, open.shipment_box_no]))
          : shipmentBoxIds;

        const { data: shipData, error: shipErr } = await supabase
          .from("shipments")
          .select(
            "id, created_at, shipment_box_no, shipment_date, checkin_date, cost, tax, total, units, total_units, cost_per_item, box_value, weight_kg, tracking_no, carrier"
          )
          .in("shipment_box_no", idsToLoad);

        if (shipErr) throw shipErr;
        shipmentRows = (shipData ?? []) as ShipmentRow[];
      }

      setPurchases(rows);
      setShipments(shipmentRows);
    } catch (e: any) {
      setPageError(e?.message ?? "Failed to load inventory.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [status, range, page, search, rowsPerPage, selectedTaxYear]);

  useEffect(() => {
    loadProductsForPopup();
  }, [addOpen, productQuery]);

  useEffect(() => {
    setPage(0);
  }, [status, range, rowsPerPage, selectedTaxYear]);

  const shipmentMap = useMemo(() => {
    const map = new Map<string, ShipmentRow>();
    shipments.forEach((s) => {
      if (s.shipment_box_no) map.set(s.shipment_box_no, s);
    });
    return map;
  }, [shipments]);

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

  const shopOptions = useMemo(() => shopHistory, [shopHistory]);

  const writeOffReasonOptions = useMemo(() => {
    const set = new Set<string>();

    writeOffReasonHistory.forEach((reason) => {
      const s = String(reason ?? "").trim();
      if (s) set.add(s);
    });

    purchases.forEach((p) => {
      const s = titleCaseEveryWord(String(p.write_off_reason ?? "").trim());
      if (s) set.add(s);
    });

    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [purchases, writeOffReasonHistory]);

  const returnReasonOptions = useMemo(() => {
    const set = new Set<string>();

    returnReasonHistory.forEach((reason) => {
      const s = String(reason ?? "").trim();
      if (s) set.add(s);
    });

    purchases.forEach((p) => {
      const s = titleCaseEveryWord(String(p.return_reason ?? "").trim());
      if (s) set.add(s);
    });

    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [purchases, returnReasonHistory]);

  const unitCost = useMemo(() => parseDecimalOrZero(unitCostStr), [unitCostStr]);
  const tax = useMemo(() => parseDecimalOrZero(taxStr), [taxStr]);
  const shipping = useMemo(() => parseDecimalOrZero(shippingStr), [shippingStr]);
  const discountValue = useMemo(() => parseDecimalOrZero(discountValueStr), [discountValueStr]);

  const totalCostPreview = useMemo(() => {
    const u = unitCost || 0;
    const q = qty || 0;

    if (discountType === "percent") {
      const perUnitDisc = (u * (discountValue || 0)) / 100;
      const discountedUnit = Math.max(0, u - perUnitDisc);
      return discountedUnit * q + (tax || 0) + (shipping || 0);
    }

    const totalBefore = u * q + (tax || 0) + (shipping || 0);
    return Math.max(0, totalBefore - (discountValue || 0));
  }, [discountType, discountValue, qty, shipping, tax, unitCost]);

  const currentBoxNo = openShipment?.shipment_box_no ?? null;

  const getShipmentForPurchase = (row: PurchaseWithProduct | null | undefined) => {
    const boxNo = row?.shipment_box_id ?? null;
    if (!boxNo) return null;
    return shipmentMap.get(boxNo) ?? null;
  };

  const getAmazonInboundPerItem = (row: PurchaseWithProduct | null | undefined) => {
    const shipment = getShipmentForPurchase(row);
    if (!shipment) return 0;

    const explicit = Number(shipment.cost_per_item ?? 0);
    if (explicit > 0) return explicit;

    const units = Number(shipment.units ?? shipment.total_units ?? 0);
    const cost = Number(shipment.cost ?? 0);
    return units > 0 ? cost / units : 0;
  };

  const getPurchaseTotals = (row: PurchaseWithProduct | null | undefined) => {
    const baseTotal = Number(row?.total_cost ?? 0);
    const miscFees = Number(row?.misc_fees ?? 0);
    const amazonFees = Number(row?.amazon_fees ?? 0);
    const amazonInboundPerItem = getAmazonInboundPerItem(row);
    const returnShippingFee = Number(row?.return_shipping_fee ?? 0);
    const fbmShippingFee = Number(row?.fbm_shipping_fee ?? 0);

    return {
      baseTotal,
      amazonInboundPerItem,
      miscFees,
      amazonFees,
      returnShippingFee,
      fbmShippingFee,
      processingTotal:
        baseTotal + miscFees + returnShippingFee + fbmShippingFee + amazonFees,
      sellingTotal:
        baseTotal +
        amazonInboundPerItem +
        miscFees +
        returnShippingFee +
        fbmShippingFee +
        amazonFees,
      soldTotal:
        baseTotal +
        amazonInboundPerItem +
        miscFees +
        returnShippingFee +
        fbmShippingFee +
        amazonFees,
    };
  };

  const boxRows = useMemo(() => {
    if (!currentBoxNo) return [];
    return purchases.filter((p) => (p.shipment_box_id ?? null) === currentBoxNo);
  }, [purchases, currentBoxNo]);

  const unitsInBox = boxRows.length;
  const finaliseConfirmBarcodeValue = useMemo(
    () => buildFinaliseConfirmBarcodeValue(currentBoxNo, unitsInBox),
    [currentBoxNo, unitsInBox]
  );

  const boxValue = useMemo(() => {
    return boxRows.reduce((sum, r) => sum + Number(r.total_cost ?? 0), 0);
  }, [boxRows]);

  const boxGrouped = useMemo(() => {
    const map = new Map<string, { asin: string; brand: string; name: string; qty: number }>();

    for (const r of boxRows) {
      const asin = r.product?.asin ?? "-";
      const cur = map.get(asin);

      if (cur) {
        cur.qty += 1;
      } else {
        map.set(asin, {
          asin,
          brand: r.product?.brand ?? "-",
          name: r.product?.product_name ?? "-",
          qty: 1,
        });
      }
    }

    return Array.from(map.values());
  }, [boxRows]);

  const finaliseChecklistRows = useMemo(() => {
    return [...boxRows].sort((a, b) => {
      const createdCompare = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (createdCompare !== 0) return createdCompare;
      return String(a.id).localeCompare(String(b.id));
    });
  }, [boxRows]);

  const allFinaliseChecklistScanned =
    finaliseChecklistRows.length > 0 && finaliseChecklistRows.every((row) => finaliseCheckedIds.includes(row.id));

  function getPurchaseSortValue(row: PurchaseWithProduct, key: string) {
    const totals = getPurchaseTotals(row);
    const shipment = getShipmentForPurchase(row);
    const dayCount = daysAtAmazon(shipment?.checkin_date ?? null);

    switch (key) {
      case "status":
        return statusLabel(row.status);
      case "item_no":
        return Number(row.item_no ?? 0);
      case "order_no":
        return Number(row.order_no ?? 0);
      case "purchase_date":
        return row.purchase_date ?? "";
      case "delivery_date":
        return row.delivery_date ?? "";
      case "last_return_date":
        return row.last_return_date ?? "";
      case "asin":
        return row.product?.asin ?? "";
      case "brand":
        return row.product?.brand ?? "";
      case "product_name":
        return row.product?.product_name ?? "";
      case "unit_cost":
        return Number(row.unit_cost ?? 0);
      case "tax_amount":
        return Number(row.tax_amount ?? 0);
      case "shipping_cost":
        return Number(row.shipping_cost ?? 0);
      case "ship_amz":
        return totals.amazonInboundPerItem;
      case "misc_fees":
        return Number(row.misc_fees ?? 0);
      case "return_shipping_fee":
        return Number(row.return_shipping_fee ?? 0);
      case "fbm_shipping_fee":
        return Number(row.fbm_shipping_fee ?? 0);
      case "sale_type":
        return row.sale_type ?? "";
      case "discount":
        return row.discount_type === "percent"
          ? Number(row.discount_value ?? 0)
          : Number(row.discount_value ?? 0);
      case "amazon_fees":
        return Number(row.amazon_fees ?? 0);
      case "refund_amount":
        return Number(row.refund_amount ?? 0);
      case "returned_date":
        return row.returned_date ?? "";
      case "refunded_date":
        return row.refunded_date ?? "";
      case "return_reason":
        return row.return_reason ?? "";
      case "total":
        return status === "sold"
          ? totals.soldTotal
          : status === "selling"
            ? totals.sellingTotal
            : totals.baseTotal;
      case "shipment_box_id":
        return row.shipment_box_id ?? "";
      case "tracking_no":
        return row.tracking_no ?? "";
      case "age":
        return dayCount ?? -1;
      case "sold_amount":
        return Number(row.sold_amount ?? 0);
      case "profit_loss":
  return Number(row.sold_amount ?? 0) - totals.soldTotal;
      case "roi":
        return Number(row.roi ?? 0);
      default:
        return "";
    }
  }

  function getShipmentSortValue(row: ShipmentRow, key: string) {
    switch (key) {
      case "status":
        return "In Transit";
      case "shipment_box_no":
        return row.shipment_box_no ?? "";
      case "shipment_date":
        return row.shipment_date ?? "";
      case "checkin_date":
        return row.checkin_date ?? "";
      case "cost":
        return Number(row.cost ?? 0);
      case "tax":
        return Number(row.tax ?? 0);
      case "total":
        return Number(row.total ?? 0);
      case "units":
        return Number(row.units ?? row.total_units ?? 0);
      case "box_value":
        return Number(row.box_value ?? 0);
      case "tracking_no":
        return row.tracking_no ?? "";
      case "carrier":
        return row.carrier ?? "";
      default:
        return "";
    }
  }

  const sortedPurchases = useMemo(() => {
    if (!purchaseSortKey || !purchaseSortDirection) return purchases;

    return [...purchases].sort((a, b) =>
      compareValues(
        getPurchaseSortValue(a, purchaseSortKey),
        getPurchaseSortValue(b, purchaseSortKey),
        purchaseSortDirection
      )
    );
  }, [purchases, purchaseSortKey, purchaseSortDirection, status]);

  const visiblePurchases = useMemo(() => {
    const processingFilterActive = status === "processing";

    let rows = sortedPurchases;
    if (processingFilterActive && showProcessingBoxOnly && currentBoxNo) {
      rows = rows.filter((row) => (row.shipment_box_id ?? null) === currentBoxNo);
    }

    if (!processingFilterActive) return rows;

    const workingRows = [...rows];
    const usingDefaultProcessingSort = !purchaseSortKey || !purchaseSortDirection;

    if (usingDefaultProcessingSort) {
      workingRows.sort((a, b) => {
        const aAsin = a.product?.asin ?? "";
        const bAsin = b.product?.asin ?? "";
        const asinCompare = compareValues(aAsin, bAsin, "asc");
        if (asinCompare !== 0) return asinCompare;

        const aBrand = a.product?.brand ?? "";
        const bBrand = b.product?.brand ?? "";
        const brandCompare = compareValues(aBrand, bBrand, "asc");
        if (brandCompare !== 0) return brandCompare;

        const aName = a.product?.product_name ?? "";
        const bName = b.product?.product_name ?? "";
        const nameCompare = compareValues(aName, bName, "asc");
        if (nameCompare !== 0) return nameCompare;

        const purchaseCompare = compareValues(a.purchase_date ?? "", b.purchase_date ?? "", "asc");
        if (purchaseCompare !== 0) return purchaseCompare;

        return compareValues(a.created_at ?? "", b.created_at ?? "", "asc");
      });
    }

    workingRows.sort((a, b) => {
      const aSelected = a.id === selectedPurchaseId ? 1 : 0;
      const bSelected = b.id === selectedPurchaseId ? 1 : 0;
      if (aSelected !== bSelected) return aSelected - bSelected;
      return 0;
    });

    return workingRows;
  }, [
    sortedPurchases,
    status,
    showProcessingBoxOnly,
    currentBoxNo,
    purchaseSortKey,
    purchaseSortDirection,
    selectedPurchaseId,
  ]);

  useEffect(() => {
    if (status !== "awaiting_delivery") return;
    if (barcodeNotFoundOpen) return;
    if (finaliseItemNotInBoxOpen) return;
    if (deliveredOpen) return;
    if (addOpen || addCatalogOpen || editOpen || writeOffOpen || restoreOpen || soldOpen || returnOpen) {
      return;
    }
    if (checkinOpen || shipDetailOpen || editBoxOpen || targetROIOpen || finaliseStep !== 0) {
      return;
    }

    let buffer = "";
    let lastTime = 0;

    const handleScannedValue = (value: string) => {
      const scanned = normalizeScannerValue(value);
      if (!scanned) return;

      const match = visiblePurchases.find(
        (row) => normalizeScannerValue(row.tracking_no) === scanned
      );

      if (!match) {
        setBarcodeNotFoundContext("awaiting_delivery");
        setBarcodeNotFoundValue(scanned);
        setBarcodeNotFoundOpen(true);
        return;
      }

      setSelectedPurchaseId(match.id);
      setAwaitingSelectedIds([match.id]);
      openDeliveredModal(match.id);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableElement(e.target)) return;

      const activeEl = document.activeElement;
      if (activeEl && isEditableElement(activeEl) && activeEl !== document.body) return;

      const now = Date.now();
      if (now - lastTime > 100) {
        buffer = "";
      }
      lastTime = now;

      if (e.key === "Enter") {
        if (buffer) {
          e.preventDefault();
          e.stopPropagation();
          handleScannedValue(buffer);
          buffer = "";
        }
        return;
      }

      if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [
    status,
    barcodeNotFoundOpen,
    deliveredOpen,
    addOpen,
    addCatalogOpen,
    editOpen,
    writeOffOpen,
    restoreOpen,
    soldOpen,
    returnOpen,
    awaitingRefundOpen,
    refundCompleteOpen,
    refundCompleteBusy,
    returnedItemDetailOpen,
    checkinOpen,
    shipDetailOpen,
    editBoxOpen,
    targetROIOpen,
    finaliseStep,
    visiblePurchases,
  ]);

  useEffect(() => {
    if (status !== "processing") return;
    if (barcodeNotFoundOpen) return;
    if (deliveredOpen) return;
    if (addOpen || addCatalogOpen || editOpen || writeOffOpen || restoreOpen || soldOpen || returnOpen) {
      return;
    }
    if (checkinOpen || shipDetailOpen || editBoxOpen || targetROIOpen) {
      return;
    }
    if (finaliseStep !== 0 && finaliseStep !== 1) {
      return;
    }

    let buffer = "";
    let lastTime = 0;

    const handleScannedValue = async (value: string) => {
      const scanned = normalizeScannerValue(value);
      if (!scanned) return;

      if (finaliseStep === 1 && finaliseConfirmBarcodeValue && scanned === normalizeScannerValue(finaliseConfirmBarcodeValue)) {
        setAmazonUnitsStr(String(unitsInBox));
        setFinaliseErr(null);
        setTimeout(() => {
          setAmazonUnitsStr(String(unitsInBox));
          setFinaliseErr(null);
          confirmUnitsStep(unitsInBox);
        }, 0);
        return;
      }

      if (finaliseStep === 1) {
        setAmazonUnitsStr(scanned);

        const uncheckedMatch = finaliseChecklistRows.find((row) => {
          if (finaliseCheckedIds.includes(row.id)) return false;
          const productBarcode = normalizeScannerValue(row.product?.barcode);
          const amazonBarcode = normalizeScannerValue(row.product?.amazon_code);
          return productBarcode === scanned || amazonBarcode === scanned;
        });

        if (uncheckedMatch) {
          setFinaliseCheckedIds((prev) => [...prev, uncheckedMatch.id]);
          setAmazonUnitsStr("");
          setFinaliseErr(null);
          return;
        }

        setFinaliseItemNotInBoxValue(scanned);
        setFinaliseItemNotInBoxOpen(true);
        setFinaliseErr(null);
        return;
      }

      if (finaliseStep !== 0) return;

      if (currentBoxNo && scanned === normalizeScannerValue(currentBoxNo)) {
        openFinalise();
        return;
      }

      const match = purchases
        .filter((row) => row.status === "processing")
        .filter((row) => !row.shipment_box_id)
        .filter((row) => {
          const productBarcode = normalizeScannerValue(row.product?.barcode);
          const amazonBarcode = normalizeScannerValue(row.product?.amazon_code);
          return productBarcode === scanned || amazonBarcode === scanned;
        })
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];

      if (!match) {
        setBarcodeNotFoundContext("processing");
        setBarcodeNotFoundValue(scanned);
        setBarcodeNotFoundOpen(true);
        return;
      }

      setSelectedPurchaseId(match.id);
      await setInBox(match.id, true);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const targetIsEditable = isEditableElement(e.target);
      const activeEl = document.activeElement;
      const activeElementIsEditable = !!(activeEl && isEditableElement(activeEl) && activeEl !== document.body);

      if (finaliseStep !== 1) {
        if (targetIsEditable) return;
        if (activeElementIsEditable) return;
      }

      const now = Date.now();
      if (now - lastTime > 100) {
        buffer = "";
      }
      lastTime = now;

      if (e.key === "Enter") {
        if (buffer) {
          e.preventDefault();
          e.stopPropagation();
          void handleScannedValue(buffer);
          buffer = "";
        }
        return;
      }

      if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [
    status,
    barcodeNotFoundOpen,
    deliveredOpen,
    addOpen,
    addCatalogOpen,
    editOpen,
    writeOffOpen,
    restoreOpen,
    soldOpen,
    returnOpen,
    awaitingRefundOpen,
    refundCompleteOpen,
    refundCompleteBusy,
    returnedItemDetailOpen,
    checkinOpen,
    shipDetailOpen,
    editBoxOpen,
    targetROIOpen,
    finaliseStep,
    purchases,
    currentBoxNo,
    finaliseStep,
    finaliseConfirmBarcodeValue,
    unitsInBox,
    finaliseChecklistRows,
    finaliseCheckedIds,
    finaliseItemNotInBoxOpen,
  ]);

  const sortedShipments = useMemo(() => {
    if (!shipmentSortKey || !shipmentSortDirection) return shipments;

    return [...shipments].sort((a, b) =>
      compareValues(
        getShipmentSortValue(a, shipmentSortKey),
        getShipmentSortValue(b, shipmentSortKey),
        shipmentSortDirection
      )
    );
  }, [shipments, shipmentSortKey, shipmentSortDirection]);

  function resetAddPurchaseForm() {
    setProductQuery("");
    setSelectedProductId(null);
    setPurchaseDate(todayISO());
    setDeliveryDate("");
    setExpiryDate("");
    setShopStr("");
    setTrackingStr("");
    setQty(1);
    setUnitCostStr("0");
    setTaxStr("0");
    setShippingStr("0");
    setDiscountType("percent");
    setDiscountValueStr("0");
    setCreateError(null);
  }

  function closeDeliveredModal() {
    setDeliveredOpen(false);
    setDeliveredTargetId(null);
    setDeliveredTargetIds([]);
    setDeliveredDate(todayISO());
    setDeliveredError(null);
  }

  function closeBarcodeNotFoundModal() {
    setBarcodeNotFoundOpen(false);
    setBarcodeNotFoundValue("");
    setBarcodeNotFoundContext("awaiting_delivery");
  }

  function openDeliveredModal(purchaseId: string) {
    setDeliveredTargetId(purchaseId);
    setDeliveredTargetIds([purchaseId]);
    setDeliveredDate(todayISO());
    setDeliveredError(null);
    setDeliveredOpen(true);
  }

  function openBulkDeliveredModal() {
    if (awaitingSelectedIds.length === 0) return;
    setDeliveredTargetId(awaitingSelectedIds[0] ?? null);
    setDeliveredTargetIds(awaitingSelectedIds);
    setDeliveredDate(todayISO());
    setDeliveredError(null);
    setDeliveredOpen(true);
  }

  async function confirmDeliveredDate() {
    const targetIds = deliveredTargetIds.length > 0
      ? deliveredTargetIds
      : deliveredTargetId
        ? [deliveredTargetId]
        : [];

    if (targetIds.length === 0) return;

    const effectiveDeliveryDate = deliveredDate || todayISO();
    const targetRows = purchases.filter((p) => targetIds.includes(p.id));

    if (effectiveDeliveryDate > todayISO()) {
      if (deliveredDateRef.current) {
        deliveredDateRef.current.setCustomValidity("Value must be 17/03/2026 or earlier.");
        deliveredDateRef.current.reportValidity();
      }
      setDeliveredError(null);
      return;
    }

    const invalidRows = targetRows.filter(
      (p) => !!p.purchase_date && isIsoDateBefore(effectiveDeliveryDate, p.purchase_date)
    );

    if (invalidRows.length > 0) {
      const earliestAllowed = targetRows
        .map((p) => String(p.purchase_date ?? "").trim())
        .filter(Boolean)
        .sort()[0];

      if (deliveredDateRef.current && earliestAllowed) {
        deliveredDateRef.current.setCustomValidity(
          `Value must be ${fmtDate(earliestAllowed)} or later.`
        );
        deliveredDateRef.current.reportValidity();
      }
      setDeliveredError(null);
      return;
    }

    try {
      setDeliveredBusy(true);
      setDeliveredError(null);
      const { error } = await supabase
        .from("purchases")
        .update({
          status: "processing",
          delivery_date: effectiveDeliveryDate,
        })
        .in("id", targetIds);

      if (error) throw error;

      closeDeliveredModal();
      setAwaitingSelectedIds([]);
      await loadAll();
    } catch (e: any) {
      setDeliveredError(e?.message ?? "Failed to save delivery date.");
    } finally {
      setDeliveredBusy(false);
    }
  }

  async function revertToAwaiting(purchaseId: string) {
    const { error } = await supabase
      .from("purchases")
      .update({
        status: "awaiting_delivery",
        delivery_date: null,
      })
      .eq("id", purchaseId);

    if (error) throw error;
    await loadAll();
  }

  function openAwaitingRefundModal(purchaseId: string) {
    setAwaitingRefundTargetId(purchaseId);
    setAwaitingRefundReason("");
    setAwaitingRefundIncludeProduct(false);
    setAwaitingRefundIncludeShipping(false);
    setAwaitingRefundIncludeVat(false);
    setAwaitingRefundDate(todayISO());
    setAwaitingRefundError(null);
    setAwaitingRefundOpen(true);
  }

  async function saveAwaitingRefund() {
    if (!awaitingRefundTargetId) return;

    const row = purchases.find((p) => p.id === awaitingRefundTargetId) ?? null;
    if (!row) return;

    const refundAmount =
      (awaitingRefundIncludeProduct ? Number(row.unit_cost ?? 0) : 0) +
      (awaitingRefundIncludeShipping ? Number(row.shipping_cost ?? 0) : 0) +
      (awaitingRefundIncludeVat ? Number(row.tax_amount ?? 0) : 0);

    if (refundAmount <= 0) {
      setAwaitingRefundError("Select the amount you're getting refunded.");
      return;
    }

    if (!awaitingRefundReason.trim()) {
      setAwaitingRefundError("Select reason.");
      return;
    }

    const effectiveReturnedDate = awaitingRefundDate || todayISO();
    const purchaseDate = String(row.purchase_date ?? "").trim();

    if (purchaseDate && effectiveReturnedDate < purchaseDate) {
      setAwaitingRefundError("Return cannot be before purchase date.");
      return;
    }

    try {
      setAwaitingRefundBusy(true);
      setAwaitingRefundError(null);

      const { error } = await supabase
        .from("purchases")
        .update({
          status: "awaiting_refund",
          refund_amount: refundAmount,
          return_reason: awaitingRefundReason.trim(),
          returned_date: effectiveReturnedDate,
          refunded_date: null,
        })
        .eq("id", awaitingRefundTargetId);

      if (error) throw error;

      setAwaitingRefundOpen(false);
      setEditOpen(false);
      await loadAll();
    } catch (e: any) {
      setAwaitingRefundError(e?.message ?? "Failed to save returned item.");
    } finally {
      setAwaitingRefundBusy(false);
    }
  }

  function openRefundCompleteModal(purchaseId: string) {
    setRefundCompleteTargetId(purchaseId);
    setRefundCompleteDate(todayISO());
    setRefundCompleteError(null);
    setRefundCompleteOpen(true);
  }

  function openReturnedItemDetailModal(purchaseId: string) {
    setSelectedPurchaseId(purchaseId);
    setReturnedItemDetailId(purchaseId);
    setReturnedItemDetailOpen(true);
  }

  async function saveRefundComplete() {
    if (!refundCompleteTargetId) return;

    const refundRow = purchases.find((p) => p.id === refundCompleteTargetId) ?? null;
    const effectiveRefundedDate = refundCompleteDate || todayISO();
    const returnedDate = String(refundRow?.returned_date ?? "").trim();

    if (returnedDate && effectiveRefundedDate < returnedDate) {
      setRefundCompleteError("Refunded date cannot be before returned date.");
      return;
    }

    try {
      setRefundCompleteBusy(true);
      setRefundCompleteError(null);

      const { error } = await supabase
        .from("purchases")
        .update({
          status: "refunded",
          refunded_date: effectiveRefundedDate,
        })
        .eq("id", refundCompleteTargetId);

      if (error) throw error;

      setRefundCompleteOpen(false);
      await loadAll();
    } catch (e: any) {
      setRefundCompleteError(e?.message ?? "Failed to save refund date.");
    } finally {
      setRefundCompleteBusy(false);
    }
  }

  function toggleAwaitingSelection(purchaseId: string) {
    setAwaitingSelectedIds((prev) =>
      prev.includes(purchaseId) ? prev.filter((id) => id !== purchaseId) : [...prev, purchaseId]
    );
  }

  function toggleAwaitingSelectionForVisible(visibleIds: string[]) {
    if (visibleIds.length === 0) return;

    setAwaitingSelectedIds((prev) => {
      const allVisibleSelected = visibleIds.every((id) => prev.includes(id));
      if (allVisibleSelected) {
        return prev.filter((id) => !visibleIds.includes(id));
      }
      return Array.from(new Set([...prev, ...visibleIds]));
    });
  }


  function handleAwaitingRowClick(purchaseId: string) {
    setSelectedPurchaseId(purchaseId);

    if (awaitingClickTimeoutRef.current) {
      clearTimeout(awaitingClickTimeoutRef.current);
    }

    awaitingClickTimeoutRef.current = setTimeout(() => {
      awaitingClickTimeoutRef.current = null;
      toggleAwaitingSelection(purchaseId);
    }, 220);
  }

  function handleAwaitingRowDoubleClick(row: PurchaseWithProduct) {
    if (awaitingClickTimeoutRef.current) {
      clearTimeout(awaitingClickTimeoutRef.current);
      awaitingClickTimeoutRef.current = null;
    }

    openEditFor(row);
  }

  function handleProcessingRowClick(purchaseId: string, isInBox: boolean) {
    setSelectedPurchaseId((prev) => (prev === purchaseId ? null : purchaseId));

    if (processingClickTimeoutRef.current) {
      clearTimeout(processingClickTimeoutRef.current);
    }

    processingClickTimeoutRef.current = setTimeout(async () => {
      processingClickTimeoutRef.current = null;
      if (!currentBoxNo) return;
      await setInBox(purchaseId, !isInBox);
    }, 220);
  }

  function handleProcessingRowDoubleClick(row: PurchaseWithProduct) {
    if (processingClickTimeoutRef.current) {
      clearTimeout(processingClickTimeoutRef.current);
      processingClickTimeoutRef.current = null;
    }

    openEditFor(row);
  }

  async function setInBox(purchaseId: string, inBox: boolean) {
    if (!currentBoxNo) {
      alert("No open box found.");
      return;
    }

    const { error } = await supabase
      .from("purchases")
      .update({
        shipment_box_id: inBox ? currentBoxNo : null,
      })
      .eq("id", purchaseId);

    if (error) throw error;

    setSelectedPurchaseId((prev) => (prev === purchaseId ? null : prev));
    await loadAll();
  }

  async function removeNewestFromBoxByAsin(asin: string, n: number) {
    if (!currentBoxNo || n <= 0) return;

    const targets = boxRows
      .filter((r) => (r.product?.asin ?? "-") === asin)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, n);

    const ids = targets.map((t) => t.id);
    if (ids.length === 0) return;

    const { error } = await supabase
      .from("purchases")
      .update({ shipment_box_id: null })
      .in("id", ids);

    if (error) throw error;
    await loadAll();
  }

  async function addOldestToBoxByAsin(asin: string, n: number) {
    if (!currentBoxNo || n <= 0) return;

    const candidates = purchases
      .filter((r) => (r.product?.asin ?? "-") === asin)
      .filter((r) => r.status === "processing")
      .filter((r) => !r.shipment_box_id)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .slice(0, n);

    const ids = candidates.map((c) => c.id);
    if (ids.length === 0) return;

    const { error } = await supabase
      .from("purchases")
      .update({ shipment_box_id: currentBoxNo })
      .in("id", ids);

    if (error) throw error;
    await loadAll();
  }

  function openEditBoxQty(asin: string, currentQty: number) {
    setEditBoxAsin(asin);
    setEditBoxTargetQtyStr(String(currentQty));
    setEditBoxOpen(true);
  }

  async function saveEditBoxQty() {
    const target = Math.max(0, Math.floor(parseDecimalOrZero(editBoxTargetQtyStr)));
    const current = boxGrouped.find((g) => g.asin === editBoxAsin)?.qty ?? 0;

    if (target < current) {
      await removeNewestFromBoxByAsin(editBoxAsin, current - target);
    } else if (target > current) {
      await addOldestToBoxByAsin(editBoxAsin, target - current);
    }

    setEditBoxOpen(false);
  }

  function openFinalise() {
    setFinaliseErr(null);
    setAmazonUnitsStr("");
    setBoxCostStr("");
    setBoxWeightKgStr("");
    setBoxCarrier("UPS");
    setBoxTrackingNo("");
    setBoxShipDate(todayISO());
    setFinaliseCheckedIds([]);
    setFinaliseStep(1);
  }

  function openPacklistPrint() {
    if (!currentBoxNo) {
      alert("No open box found.");
      return;
    }

    if (boxRows.length === 0) {
      alert("No items in the current box.");
      return;
    }

    const escapeHtml = (value: string | number | null | undefined) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const pageSize = 8;
    const groupedRows = [...boxGrouped].sort((a, b) => {
      const asinCompare = String(a.asin ?? "").localeCompare(String(b.asin ?? ""));
      if (asinCompare !== 0) return asinCompare;
      return String(a.name ?? "").localeCompare(String(b.name ?? ""));
    });
    const pages: Array<typeof groupedRows> = [];
    for (let i = 0; i < groupedRows.length; i += pageSize) {
      pages.push(groupedRows.slice(i, i + pageSize));
    }

    const generatedAt = new Date();
    const generatedDate = generatedAt.toLocaleDateString("en-GB");
    const generatedTime = generatedAt.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const summaryRows = [
      ["Box", currentBoxNo],
      ["Units", String(unitsInBox)],
      ["SKUs", String(groupedRows.length)],
      ["Value", money(boxValue)],
      ["Ship Date", boxShipDate.trim() ? fmtDate(boxShipDate.trim()) : "-"],
      ["Generated", `${generatedDate} ${generatedTime}`],
    ];

    const finaliseConfirmBarcode = buildFinaliseConfirmBarcodeValue(currentBoxNo, unitsInBox);
    const finaliseConfirmBarcodeSequence = buildCode39Sequence(finaliseConfirmBarcode);

    const pagesHtml = pages
      .map((pageItems, pageIndex) => {
        const itemsHtml = pageItems
          .map(
            (item, itemIndex) => `
              <div class="item-row">
                <div class="check-col">
                  <div class="tick"></div>
                  <div class="line-no">${escapeHtml(pageIndex * pageSize + itemIndex + 1)}</div>
                </div>
                <div class="item-main">
                  <div class="item-top">
                    <span class="qty-pill">QTY ${escapeHtml(item.qty)}</span>
                    <span class="asin">${escapeHtml(item.asin)}</span>
                  </div>
                  <div class="item-brand">${escapeHtml(item.brand)}</div>
                  <div class="item-name">${escapeHtml(item.name)}</div>
                </div>
              </div>
            `
          )
          .join("");

        const summaryHtml = summaryRows
          .map(
            ([label, value]) => `
              <div class="summary-card">
                <div class="summary-label">${escapeHtml(label)}</div>
                <div class="summary-value">${escapeHtml(value)}</div>
              </div>
            `
          )
          .join("");

        return `
          <section class="page">
            <div class="header">
              <div class="header-top">
                <div>
                  <div class="title">PACK LIST</div>
                  <div class="subtitle">Final box verification checklist</div>
                </div>
                <div class="page-chip">${escapeHtml(pageIndex + 1)}/${escapeHtml(pages.length)}</div>
              </div>
              <div class="box-banner">BOX ${escapeHtml(currentBoxNo)}</div>
            </div>

            <div class="summary-grid">${summaryHtml}</div>

            ${pageIndex === 0 && finaliseConfirmBarcodeSequence ? `
              <div class="confirm-barcode-card">
                <div class="confirm-barcode-label">Scan to auto-fill &amp; confirm units</div>
                <div class="confirm-barcode-svg">
                  <svg viewBox="0 0 ${finaliseConfirmBarcodeSequence.width} 72" preserveAspectRatio="none" aria-label="Confirm barcode for ${escapeHtml(finaliseConfirmBarcode)}">
                    <rect x="0" y="0" width="${finaliseConfirmBarcodeSequence.width}" height="72" fill="#fff" />
                    ${finaliseConfirmBarcodeSequence.bars.map((bar) => `<rect x="${bar.x}" y="4" width="${bar.width}" height="56" fill="#000" />`).join("")}
                  </svg>
                </div>
                <div class="confirm-barcode-text">${escapeHtml(finaliseConfirmBarcode)}</div>
              </div>
            ` : ""}

            <div class="section-bar">
              <span>Items to check off</span>
              <span>${escapeHtml(pageItems.length)} item${pageItems.length === 1 ? "" : "s"} on this page</span>
            </div>

            <div class="items-list">${itemsHtml}</div>

            <div class="bottom-strip">
              <div class="checker-box">
                <span class="checker-label">Checked By</span>
                <span class="checker-line"></span>
              </div>
              <div class="checker-box">
                <span class="checker-label">Final Count</span>
                <span class="checker-line"></span>
              </div>
            </div>
          </section>
        `;
      })
      .join("");

    const printWindow = window.open("about:blank", "_blank", "width=500,height=800");
    if (!printWindow) {
      alert("Unable to open print preview.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charSet="utf-8" />
          <title>Packlist - Box ${escapeHtml(currentBoxNo)}</title>
          <style>
            @page {
              size: 4in 6in;
              margin: 0.16in;
            }

            * { box-sizing: border-box; }

            html, body {
              margin: 0;
              padding: 0;
              font-family: Arial, Helvetica, sans-serif;
              color: #000;
              background: #fff;
            }

            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            .page {
              width: 100%;
              min-height: calc(6in - 0.32in);
              display: flex;
              flex-direction: column;
              gap: 0.08in;
              page-break-after: always;
            }

            .page:last-child { page-break-after: auto; }

            .header {
              border: 1.6px solid #000;
              padding: 0.08in;
              background: linear-gradient(180deg, #ffffff 0%, #f4f4f4 100%);
            }

            .header-top {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              gap: 0.08in;
            }

            .title {
              font-size: 15px;
              font-weight: 800;
              letter-spacing: 0.08em;
            }

            .subtitle {
              margin-top: 0.02in;
              font-size: 9px;
              letter-spacing: 0.02em;
            }

            .page-chip {
              border: 1px solid #000;
              padding: 0.03in 0.05in;
              font-size: 9px;
              font-weight: 700;
              min-width: 0.34in;
              text-align: center;
              background: #fff;
            }

            .box-banner {
              margin-top: 0.06in;
              border-top: 1px solid #000;
              padding-top: 0.06in;
              font-size: 22px;
              font-weight: 800;
              letter-spacing: 0.04em;
            }

            .summary-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 0.05in;
            }

            .summary-card {
              border: 1px solid #000;
              padding: 0.055in 0.06in;
              background: #fff;
              min-height: 0.42in;
              display: flex;
              flex-direction: column;
              justify-content: center;
            }

            .summary-label {
              font-size: 8px;
              font-weight: 700;
              letter-spacing: 0.08em;
              text-transform: uppercase;
            }

            .summary-value {
              margin-top: 0.02in;
              font-size: 12px;
              font-weight: 800;
              line-height: 1.15;
              word-break: break-word;
            }

            .confirm-barcode-card {
              border: 1.6px solid #000;
              background: #fff;
              padding: 0.06in 0.07in 0.07in;
            }

            .confirm-barcode-label {
              font-size: 8px;
              font-weight: 700;
              letter-spacing: 0.12em;
              text-transform: uppercase;
              margin-bottom: 0.04in;
            }

            .confirm-barcode-svg {
              border: 1px solid #000;
              background: #fff;
              padding: 0.04in 0.05in;
            }

            .confirm-barcode-svg svg {
              display: block;
              width: 100%;
              height: 0.58in;
            }

            .confirm-barcode-text {
              margin-top: 0.04in;
              text-align: center;
              font-size: 11px;
              font-weight: 800;
              letter-spacing: 0.18em;
            }

            .section-bar {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 0.08in;
              border-top: 1.6px solid #000;
              border-bottom: 1px solid #000;
              padding: 0.045in 0;
              font-size: 9px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.05em;
            }

            .items-list {
              display: flex;
              flex-direction: column;
              border-bottom: 1.6px solid #000;
            }

            .item-row {
              display: flex;
              gap: 0.08in;
              align-items: flex-start;
              padding: 0.055in 0;
              border-top: 1px solid #000;
            }

            .check-col {
              width: 0.34in;
              min-width: 0.34in;
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 0.03in;
            }

            .tick {
              width: 0.20in;
              min-width: 0.20in;
              height: 0.20in;
              border: 1.6px solid #000;
              background: #fff;
            }

            .line-no {
              font-size: 8px;
              font-weight: 700;
              line-height: 1;
            }

            .item-main {
              flex: 1;
              min-width: 0;
            }

            .item-top {
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 0.06in;
            }

            .qty-pill {
              display: inline-flex;
              align-items: center;
              border: 1px solid #000;
              padding: 0.02in 0.04in;
              font-size: 9px;
              font-weight: 800;
              letter-spacing: 0.04em;
              background: #f5f5f5;
            }

            .asin {
              font-size: 10px;
              font-weight: 800;
              text-align: right;
              word-break: break-word;
            }

            .item-brand {
              margin-top: 0.03in;
              font-size: 9px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.03em;
              word-break: break-word;
            }

            .item-name {
              margin-top: 0.02in;
              font-size: 10px;
              line-height: 1.2;
              word-break: break-word;
            }

            .bottom-strip {
              margin-top: auto;
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 0.06in;
              padding-top: 0.04in;
            }

            .checker-box {
              border: 1px solid #000;
              min-height: 0.42in;
              padding: 0.05in 0.06in;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
            }

            .checker-label {
              font-size: 8px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.06em;
            }

            .checker-line {
              display: block;
              border-top: 1px solid #000;
              margin-top: 0.16in;
              width: 100%;
            }
          </style>
        </head>
        <body>
          ${pagesHtml}
          <script>
            window.onload = function () {
              window.focus();
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }


  function confirmUnitsStep(overrideUnits?: number) {
    setFinaliseErr(null);
    const entered = Math.floor(
      overrideUnits != null ? Number(overrideUnits) : parseDecimalOrZero(amazonUnitsStr)
    );

    if (!entered || entered <= 0) {
      setFinaliseErr("Enter the Amazon units number.");
      return;
    }

    if (entered !== unitsInBox) {
      setFinaliseErr(`Units do not match. Selected: ${unitsInBox} • Amazon: ${entered}`);
      return;
    }

    setFinaliseStep(2);
  }

  function confirmBoxDetailsStep() {
    const cost = parseDecimalOrZero(boxCostStr);
    const weight = parseDecimalOrZero(boxWeightKgStr);
    const carrier = boxCarrier.trim();
    const tracking = boxTrackingNo.trim();

    if (!boxCostStr.trim() || cost <= 0) {
      setFinaliseErr("Cost is required.");
      return;
    }
    if (!boxWeightKgStr.trim() || weight <= 0) {
      setFinaliseErr("Weight is required.");
      return;
    }
    if (!tracking) {
      setFinaliseErr("Tracking no is required.");
      return;
    }
    if (!carrier) {
      setFinaliseErr("Carrier is required.");
      return;
    }

    setFinaliseErr(null);
    setFinaliseStep(3);
  }

  async function confirmShipmentDateAndComplete() {
    if (!openShipment || !currentBoxNo) {
      setFinaliseErr("No open box found.");
      return;
    }

    if (!boxCostStr.trim()) {
      setFinaliseErr("Cost is required.");
      return;
    }
    if (!boxWeightKgStr.trim()) {
      setFinaliseErr("Weight is required.");
      return;
    }
    if (!boxTrackingNo.trim()) {
      setFinaliseErr("Tracking no is required.");
      return;
    }

    const shipDate = boxShipDate.trim();
    const rawCost = parseDecimalOrZero(boxCostStr);
    const rawWeight = parseDecimalOrZero(boxWeightKgStr);
    const rawUnits = unitsInBox;

    if (!shipDate) {
      setFinaliseErr("Shipment date is required.");
      return;
    }

    const latestDeliveryDateInBox = boxRows
      .map((row) => String(row.delivery_date ?? "").trim())
      .filter(Boolean)
      .sort()
      .slice(-1)[0] ?? "";

    if (latestDeliveryDateInBox && shipDate < latestDeliveryDateInBox) {
      if (finaliseDateRef.current) {
        finaliseDateRef.current.setCustomValidity(
          `Value must be ${latestDeliveryDateInBox.split("-").reverse().join("/")} or later.`
        );
        finaliseDateRef.current.reportValidity();
      }
      setFinaliseErr("");
      return;
    }

const safeCost = Number.isFinite(rawCost) ? rawCost : 0;
const safeTax = safeCost * 0.2;
const safeTotal = safeCost + safeTax;

const safeWeight = Number.isFinite(rawWeight) ? rawWeight : 0;
const safeUnits = Number.isFinite(rawUnits) ? rawUnits : 0;
const safePerItemCost = safeUnits > 0 ? safeTotal / safeUnits : 0;

const safeBoxValue = Number.isFinite(boxValue) ? boxValue : 0;
const safeCarrier = titleCaseEveryWord(boxCarrier.trim() || "UPS");
const safeTracking = boxTrackingNo.trim() || "";

    setFinaliseBusy(true);
    setFinaliseErr(null);

    try {
      const { error: shipErr } = await supabase
        .from("shipments")
        .update({
          shipment_box_no: currentBoxNo,
          cost: safeCost,
          tax: safeTax,
          total: safeTotal,
          units: safeUnits,
          total_units: safeUnits,
          cost_per_item: safePerItemCost,
          box_value: safeBoxValue,
          weight_kg: safeWeight,
          carrier: safeCarrier,
          tracking_no: safeTracking,
          shipment_date: shipDate,
        })
        .eq("id", openShipment.id);

      if (shipErr) throw shipErr;

      const { error: purchErr } = await supabase
        .from("purchases")
        .update({
          shipment_box_id: currentBoxNo,
          status: "sent_to_amazon",
        })
        .eq("shipment_box_id", currentBoxNo);

      if (purchErr) throw purchErr;

      await createFreshOpenShipmentRow();

      setFinaliseStep(0);
      setFinaliseBusy(false);
      await loadAll();
    } catch (e: any) {
      setFinaliseBusy(false);
      setFinaliseErr(e?.message ?? "Failed to finalise box.");
    }
  }

  function openCheckin(shipmentId: string) {
    setCheckinShipmentId(shipmentId);
    setCheckinDate(todayISO());
    setCheckinOpen(true);
  }

  async function confirmCheckin() {
    if (checkinRef.current) {
      checkinRef.current.setCustomValidity("");
    }

    if (!checkinShipmentId) return;

    const d = checkinDate.trim();
    if (!d) {
      alert("Check-in date is required.");
      return;
    }

    const shipment = shipments.find((s) => s.id === checkinShipmentId) ?? null;
    if (!shipment?.shipment_box_no) {
      alert("Shipment not found.");
      return;
    }

    const shipmentDate = String(shipment.shipment_date ?? "").trim();
    if (shipmentDate && d < shipmentDate) {
      if (checkinRef.current) {
        const shipmentDateDisplay = shipmentDate.split("-").reverse().join("/");
        checkinRef.current.setCustomValidity(
          `Value must be ${shipmentDateDisplay} or later.`
        );
        checkinRef.current.reportValidity();
      }
      return;
    }

    const todayIso = todayISO();
    if (d > todayIso) {
      if (checkinRef.current) {
        checkinRef.current.setCustomValidity(
          `Value must be ${fmtDate(todayIso)} or earlier.`
        );
        checkinRef.current.reportValidity();
      }
      return;
    }

    setCheckinBusy(true);
    try {
      const { error: shipErr } = await supabase
        .from("shipments")
        .update({ checkin_date: d })
        .eq("id", checkinShipmentId);

      if (shipErr) throw shipErr;

      const { error: purchErr } = await supabase
        .from("purchases")
        .update({ status: "selling" })
        .eq("shipment_box_id", shipment.shipment_box_no);

      if (purchErr) throw purchErr;

      setCheckinOpen(false);
      setCheckinShipmentId(null);
      await loadAll();
    } catch (e: any) {
      alert(e?.message ?? "Failed to save check-in.");
    } finally {
      setCheckinBusy(false);
    }
  }

  const shipDetail = useMemo(() => {
    if (!shipDetailId) return null;
    return shipments.find((s) => s.id === shipDetailId) ?? null;
  }, [shipments, shipDetailId]);

  const shipDetailItems = useMemo(() => {
    if (!shipDetail?.shipment_box_no) return [];
    return purchases.filter((p) => (p.shipment_box_id ?? null) === shipDetail.shipment_box_no);
  }, [purchases, shipDetail?.shipment_box_no]);

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

  function openWriteOff(purchaseId: string) {
    setSelectedPurchaseId(purchaseId);
    setWriteOffReasonText("");
    setWriteOffOutcome("none");
    setWriteOffExtraCostStr("0");
    setWriteOffDate(todayISO());
    setWriteOffOpen(true);
  }

  async function confirmWriteOff() {
    if (!selectedPurchaseId) return;

    const row = purchases.find((p) => p.id === selectedPurchaseId) ?? null;
    const reason = writeOffReasonText.trim();
    const extraCost = parseDecimalOrZero(writeOffExtraCostStr);
    const effectiveWriteOffDate = writeOffDate?.trim() ? writeOffDate : todayISO();

    if (!reason) {
      alert("Write-off reason is required.");
      return;
    }

    const currentMisc = Number(row?.misc_fees ?? 0);
    const nextMisc = currentMisc + extraCost;

    const outcomeText =
      writeOffOutcome === "dispose"
        ? "Outcome: Disposed By Amazon"
        : writeOffOutcome === "return_to_me"
          ? "Outcome: Returned To Me"
          : null;

    const finalReason = outcomeText ? `${reason} • ${outcomeText}` : reason;

    const { error } = await supabase
      .from("purchases")
      .update({
        status: "written_off",
        write_off_reason: finalReason,
        write_off_date: effectiveWriteOffDate,
        tax_year: computeUkTaxYear(effectiveWriteOffDate),
        misc_fees: nextMisc,
      })
      .eq("id", selectedPurchaseId);

    if (error) {
      alert(error.message ?? "Failed to write off.");
      return;
    }

    setWriteOffOpen(false);
    setWriteOffReasonText("");
    setWriteOffOutcome("none");
    setWriteOffExtraCostStr("0");
    setWriteOffDate(todayISO());
    await loadAll();
  }

  function openRestoreModal(purchaseId: string) {
    setRestoreTargetId(purchaseId);
    setRestoreStatus("awaiting_delivery");
    setRestoreOpen(true);
  }

  function openWrittenOffDetail(purchaseId: string) {
    setSelectedPurchaseId(purchaseId);
    setWrittenOffDetailId(purchaseId);
    setWrittenOffDetailOpen(true);
  }

  async function confirmRestore() {
    if (!restoreTargetId) return;

    const restoreRow = purchases.find((p) => p.id === restoreTargetId) ?? null;
    const clearReturnFields = restoreRow?.status === "awaiting_refund" || restoreRow?.status === "refunded";
    const clearWriteOffFields = restoreRow?.status === "written_off";
    const nextRestoreStatus: Exclude<StatusKey, "all"> = clearReturnFields
      ? "awaiting_delivery"
      : restoreStatus;

    const { error } = await supabase
      .from("purchases")
      .update({
        status: nextRestoreStatus,
        write_off_reason: clearWriteOffFields ? null : restoreRow?.write_off_reason ?? null,
        write_off_date: clearWriteOffFields ? null : restoreRow?.write_off_date ?? null,
        return_reason: clearReturnFields ? null : restoreRow?.return_reason ?? null,
        returned_date: clearReturnFields ? null : restoreRow?.returned_date ?? null,
        refunded_date: clearReturnFields ? null : restoreRow?.refunded_date ?? null,
        refund_amount: clearReturnFields ? null : restoreRow?.refund_amount ?? null,
      })
      .eq("id", restoreTargetId);

    if (error) {
      alert(error.message ?? "Failed to restore item.");
      return;
    }

    setRestoreOpen(false);
    setRestoreTargetId(null);
    await loadAll();
  }

  function openSold(purchaseId: string, mode: "FBA" | "FBM" = "FBA") {
    const row = purchases.find((p) => p.id === purchaseId) ?? null;
    const isExistingSold = row?.status === "sold";
    const isFreshSale = row?.status === "selling";

    const effectiveMode = (
      isExistingSold
        ? (row?.sale_type ?? mode)
        : mode
    ) as "FBA" | "FBM";

    setSoldTargetId(purchaseId);
    setSoldMode(effectiveMode);
    setSoldEditMode(!isExistingSold);

    setSoldAmountStr(
      isExistingSold ? String(Number(row?.sold_amount ?? 0)) : isFreshSale ? "0" : String(Number(row?.sold_amount ?? 0))
    );
    setSoldAmazonFeesStr(
      isExistingSold ? String(Number(row?.amazon_fees ?? 0)) : isFreshSale ? "0" : String(Number(row?.amazon_fees ?? 0))
    );
    setSoldMiscFeesStr(isExistingSold ? String(Number(row?.misc_fees ?? 0)) : "0");
    setSoldFbmShippingFeeStr(isExistingSold ? String(Number(row?.fbm_shipping_fee ?? 0)) : "0");
    setSoldFbmTrackingNo(isExistingSold ? String(row?.fbm_tracking_no ?? "") : "");
    setSoldOrderDate(row?.order_date ?? todayISO());
    setSoldOpen(true);
  }

  function openReturn(purchaseId: string) {
    setReturnTargetId(purchaseId);
    setReturnCostStr("0");
    setReturnDate(todayISO());
    setReturnOpen(true);
  }


const writtenOffDetailRow = useMemo(() => {
  return purchases.find((p) => p.id === writtenOffDetailId) ?? null;
}, [purchases, writtenOffDetailId]);

const writtenOffDetailShipment = useMemo(() => {
  const boxNo = writtenOffDetailRow?.shipment_box_id ?? null;
  if (!boxNo) return null;
  return shipmentMap.get(boxNo) ?? null;
}, [shipmentMap, writtenOffDetailRow?.shipment_box_id]);

const writtenOffDetailParsed = useMemo(() => {
  return parseWriteOffDetails(writtenOffDetailRow?.write_off_reason ?? null);
}, [writtenOffDetailRow?.write_off_reason]);

useEffect(() => {
  if (!writtenOffDetailOpen || !writtenOffDetailRow) {
    setWrittenOffEditMode(false);
    setWrittenOffEditReason("");
    setWrittenOffEditOutcome("none");
    setWrittenOffEditCostStr("0");
    return;
  }

  const parsed = parseWriteOffDetails(writtenOffDetailRow.write_off_reason ?? null);
  const normalizedOutcome =
    parsed.outcome.toLowerCase() === "disposed by amazon"
      ? "dispose"
      : parsed.outcome.toLowerCase() === "returned to me"
        ? "return_to_me"
        : "none";

  setWrittenOffEditMode(false);
  setWrittenOffEditReason(parsed.reason === "-" ? "" : parsed.reason);
  setWrittenOffEditOutcome(normalizedOutcome as "none" | "dispose" | "return_to_me");
  setWrittenOffEditCostStr(String(Number(writtenOffDetailRow.misc_fees ?? 0)));
  setWrittenOffEditDate(writtenOffDetailRow.write_off_date ?? todayISO());
}, [writtenOffDetailOpen, writtenOffDetailRow]);

useEffect(() => {
  if (!writtenOffDetailOpen) return;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Enter") return;

    const target = e.target as HTMLElement | null;
    const tag = (target?.tagName || "").toLowerCase();
    if (tag === "textarea") return;

    e.preventDefault();

    if (writtenOffEditMode) {
      if (!writtenOffEditBusy) {
        void saveWrittenOffDetails();
      }
      return;
    }

    setWrittenOffDetailOpen(false);
  };

  document.addEventListener("keydown", onKeyDown, true);
  return () => document.removeEventListener("keydown", onKeyDown, true);
}, [
  writtenOffDetailOpen,
  writtenOffEditMode,
  writtenOffEditBusy,
  writtenOffEditReason,
  writtenOffEditOutcome,
  writtenOffEditCostStr,
  writtenOffEditDate,
  writtenOffDetailRow,
  writtenOffDetailParsed.reason,
  writtenOffDetailParsed.outcome,
]);

async function saveWrittenOffDetails() {
  if (!writtenOffDetailRow) return;

  const reason = writtenOffEditReason.trim();
  if (!reason) {
    alert("Write-off reason is required.");
    return;
  }

  const cost = parseDecimalOrZero(writtenOffEditCostStr);
  const effectiveWriteOffDate = writtenOffEditDate?.trim() ? writtenOffEditDate : todayISO();
  const outcomeText =
    writtenOffEditOutcome === "dispose"
      ? "Outcome: Disposed By Amazon"
      : writtenOffEditOutcome === "return_to_me"
        ? "Outcome: Returned To Me"
        : null;
  const finalReason = outcomeText ? `${reason} • ${outcomeText}` : reason;

  try {
    setWrittenOffEditBusy(true);
    const { error } = await supabase
      .from("purchases")
      .update({
        write_off_reason: finalReason,
        write_off_date: effectiveWriteOffDate,
        tax_year: computeUkTaxYear(effectiveWriteOffDate),
        misc_fees: cost,
      })
      .eq("id", writtenOffDetailRow.id);

    if (error) throw error;

    setWrittenOffEditMode(false);
    await loadAll();
  } catch (e: any) {
    alert(e?.message ?? "Failed to update write-off details.");
  } finally {
    setWrittenOffEditBusy(false);
  }
}

const writtenOffCostBreakdown = useMemo(() => {
  const productCost = Number(writtenOffDetailRow?.unit_cost ?? 0);
  const taxCost = Number(writtenOffDetailRow?.tax_amount ?? 0);
  const shippingCost = Number(writtenOffDetailRow?.shipping_cost ?? 0);
  const writtenOffCost = Number(writtenOffDetailRow?.misc_fees ?? 0);
  const miscCost = 0;
  const returnShippingCost = Number(writtenOffDetailRow?.return_shipping_fee ?? 0);
  const fbmShippingCost = Number(writtenOffDetailRow?.fbm_shipping_fee ?? 0);
  const amazonFees = Number(writtenOffDetailRow?.amazon_fees ?? 0);

  let amazonInboundPerItem = 0;
  if (writtenOffDetailShipment) {
    const explicit = Number(writtenOffDetailShipment.cost_per_item ?? 0);
    if (explicit > 0) {
      amazonInboundPerItem = explicit;
    } else {
      const units = Number(
        writtenOffDetailShipment.units ?? writtenOffDetailShipment.total_units ?? 0
      );
      const shipCost = Number(writtenOffDetailShipment.cost ?? 0);
      amazonInboundPerItem = units > 0 ? shipCost / units : 0;
    }
  }

  const totalCostBasis =
    productCost +
    taxCost +
    shippingCost +
    amazonInboundPerItem +
    amazonFees +
    returnShippingCost +
    fbmShippingCost +
    writtenOffCost;

  return {
    productCost,
    taxCost,
    shippingCost,
    amazonInboundPerItem,
    amazonFees,
    miscCost,
    writtenOffCost,
    returnShippingCost,
    fbmShippingCost,
    totalCostBasis,
  };
}, [writtenOffDetailRow, writtenOffDetailShipment]);

  const soldTargetRow = useMemo(() => {
    return purchases.find((p) => p.id === soldTargetId) ?? null;
  }, [purchases, soldTargetId]);

  const returnTargetRow = useMemo(() => {
    return purchases.find((p) => p.id === returnTargetId) ?? null;
  }, [purchases, returnTargetId]);
  const awaitingRefundTargetRow = useMemo(() => {
    return purchases.find((p) => p.id === awaitingRefundTargetId) ?? null;
  }, [purchases, awaitingRefundTargetId]);

  const awaitingRefundTotal = useMemo(() => {
    if (!awaitingRefundTargetRow) return 0;
    return (awaitingRefundIncludeProduct ? Number(awaitingRefundTargetRow.unit_cost ?? 0) : 0) +
      (awaitingRefundIncludeShipping ? Number(awaitingRefundTargetRow.shipping_cost ?? 0) : 0) +
      (awaitingRefundIncludeVat ? Number(awaitingRefundTargetRow.tax_amount ?? 0) : 0);
  }, [
    awaitingRefundTargetRow,
    awaitingRefundIncludeProduct,
    awaitingRefundIncludeShipping,
    awaitingRefundIncludeVat,
  ]);

  const refundCompleteTargetRow = useMemo(() => {
    return purchases.find((p) => p.id === refundCompleteTargetId) ?? null;
  }, [purchases, refundCompleteTargetId]);

  const returnedItemDetailRow = useMemo(() => {
    return purchases.find((p) => p.id === returnedItemDetailId) ?? null;
  }, [purchases, returnedItemDetailId]);

  const returnedItemRefundParts = useMemo(() => {
    return inferRefundParts(returnedItemDetailRow);
  }, [returnedItemDetailRow]);

  const soldTargetShipment = useMemo(() => {
    const boxNo = soldTargetRow?.shipment_box_id ?? null;
    if (!boxNo) return null;
    return shipmentMap.get(boxNo) ?? null;
  }, [shipmentMap, soldTargetRow?.shipment_box_id]);

  const soldCostBreakdown = useMemo(() => {
    const productCost = Number(soldTargetRow?.unit_cost ?? 0);
    const taxCost = Number(soldTargetRow?.tax_amount ?? 0);
    const shippingCost = Number(soldTargetRow?.shipping_cost ?? 0);
    const miscCost = Number(soldTargetRow?.misc_fees ?? 0);
    const returnShippingCost = Number(soldTargetRow?.return_shipping_fee ?? 0);
    const existingFbmShippingFee = Number(soldTargetRow?.fbm_shipping_fee ?? 0);
    const amazonFees = Number(soldTargetRow?.amazon_fees ?? 0);

    let amazonInboundPerItem = 0;
    if (soldTargetShipment) {
      const explicit = Number(soldTargetShipment.cost_per_item ?? 0);
      if (explicit > 0) {
        amazonInboundPerItem = explicit;
      } else {
        const units = Number(soldTargetShipment.units ?? soldTargetShipment.total_units ?? 0);
        const shipCost = Number(soldTargetShipment.cost ?? 0);
        amazonInboundPerItem = units > 0 ? shipCost / units : 0;
      }
    }

    const landedCost =
      productCost +
      taxCost +
      shippingCost +
      amazonInboundPerItem +
      miscCost +
      returnShippingCost +
      existingFbmShippingFee +
      amazonFees;

    return {
      productCost,
      taxCost,
      shippingCost,
      amazonInboundPerItem,
      miscCost,
      returnShippingCost,
      existingFbmShippingFee,
      amazonFees,
      landedCost,
      shipmentBoxNo: soldTargetRow?.shipment_box_id ?? "-",
    };
  }, [soldTargetRow, soldTargetShipment]);

  const soldPreview = useMemo(() => {
    const sale = soldAmountStr.trim() === "" ? Number(soldTargetRow?.sold_amount ?? 0) : parseDecimalOrZero(soldAmountStr);
    const aFees =
      soldAmazonFeesStr.trim() === ""
        ? Number(soldTargetRow?.amazon_fees ?? 0)
        : parseDecimalOrZero(soldAmazonFeesStr);
    const enteredMiscFees = parseDecimalOrZero(soldMiscFeesStr);
    const newFbmShippingFee = parseDecimalOrZero(soldFbmShippingFeeStr);

    const productCost = Number(soldTargetRow?.unit_cost ?? 0);
    const taxCost = Number(soldTargetRow?.tax_amount ?? 0);
    const shippingCost = Number(soldTargetRow?.shipping_cost ?? 0);
    const amazonInbound = soldCostBreakdown.amazonInboundPerItem;
    const existingMisc = Number(soldTargetRow?.misc_fees ?? 0);
    const existingReturnShip = Number(soldTargetRow?.return_shipping_fee ?? 0);
    const existingFbmShip = Number(soldTargetRow?.fbm_shipping_fee ?? 0);
    const previewMiscFees = soldTargetRow?.status === "sold" ? enteredMiscFees : existingMisc + enteredMiscFees;

    const previewFbmShipping = soldMode === "FBM" ? newFbmShippingFee : existingFbmShip;

const baseCostExAmazonFees =
  productCost +
  taxCost +
  shippingCost +
  amazonInbound +
  previewMiscFees +
  existingReturnShip +
  previewFbmShipping;

    const totalCost = baseCostExAmazonFees + aFees;
    const amazonPayout = sale - aFees;
    const profitLoss = sale - totalCost;
    const roi = totalCost > 0 ? (profitLoss / totalCost) * 100 : 0;

    return {
      amazonPayout,
      profitLoss,
      roi,
      totalCost,
    };
  }, [
    soldAmountStr,
    soldAmazonFeesStr,
    soldMiscFeesStr,
    soldFbmShippingFeeStr,
    soldMode,
    soldTargetRow,
    soldCostBreakdown.amazonInboundPerItem,
  ]);

  const displayedSoldTotalCost = soldEditMode ? soldPreview.totalCost : soldCostBreakdown.landedCost;

  const displayedSoldAmazonFees =
    soldEditMode
      ? (soldAmazonFeesStr.trim() === ""
          ? Number(soldTargetRow?.amazon_fees ?? 0)
          : parseDecimalOrZero(soldAmazonFeesStr))
      : Number(soldTargetRow?.amazon_fees ?? 0);

  const displayedSoldMiscCost =
    soldEditMode
      ? (soldTargetRow?.status === "sold"
          ? parseDecimalOrZero(soldMiscFeesStr)
          : Number(soldTargetRow?.misc_fees ?? 0) + parseDecimalOrZero(soldMiscFeesStr))
      : Number(soldTargetRow?.misc_fees ?? 0);

  const displayedSoldFbmShipping =
    soldEditMode
      ? (soldMode === "FBM"
          ? parseDecimalOrZero(soldFbmShippingFeeStr)
          : Number(soldTargetRow?.fbm_shipping_fee ?? 0))
      : Number(soldTargetRow?.fbm_shipping_fee ?? 0);

const displayedAmazonPayout = soldEditMode
  ? soldPreview.amazonPayout
  : Number(soldTargetRow?.sold_amount ?? 0) - Number(soldTargetRow?.amazon_fees ?? 0);

const displayedProfitLoss = soldEditMode
  ? soldPreview.profitLoss
  : displayedAmazonPayout - (displayedSoldTotalCost - Number(soldTargetRow?.amazon_fees ?? 0));

const displayedROI = soldEditMode
  ? soldPreview.roi
  : displayedSoldTotalCost > 0
    ? (displayedProfitLoss / displayedSoldTotalCost) * 100
    : 0;

  function resetSoldFormFromRow(row: PurchaseWithProduct | null, modeOverride?: "FBA" | "FBM") {
    const effectiveMode = ((modeOverride ?? row?.sale_type ?? "FBA") as "FBA" | "FBM");
    const isExistingSold = row?.status === "sold";
    const isFreshSale = row?.status === "selling";

    setSoldMode(effectiveMode);
    setSoldAmountStr(
      isExistingSold ? String(Number(row?.sold_amount ?? 0)) : isFreshSale ? "0" : String(Number(row?.sold_amount ?? 0))
    );
    setSoldAmazonFeesStr(
      isExistingSold ? String(Number(row?.amazon_fees ?? 0)) : isFreshSale ? "0" : String(Number(row?.amazon_fees ?? 0))
    );
    setSoldMiscFeesStr(isExistingSold ? String(Number(row?.misc_fees ?? 0)) : "0");
    setSoldFbmShippingFeeStr(isExistingSold ? String(Number(row?.fbm_shipping_fee ?? 0)) : "0");
    setSoldFbmCarrierStr(isExistingSold ? String(row?.tracking_no ?? "") : "");
    setSoldFbmTrackingNo(isExistingSold ? String(row?.fbm_tracking_no ?? "") : "");
    setSoldOrderDate(row?.order_date ?? todayISO());
  }

  function cancelSoldEdit() {
    resetSoldFormFromRow(soldTargetRow, soldTargetRow?.sale_type ?? soldMode);
    setSoldEditMode(false);
  }

async function confirmSold() {
  if (!soldTargetId) return;

  const existingOrderNo = Number(soldTargetRow?.order_no ?? 0);
  const isEditingExistingSoldItem = soldTargetRow?.status === "sold";

  const sale = parseDecimalOrZero(soldAmountStr);
  const aFees = parseDecimalOrZero(soldAmazonFeesStr);
  const enteredMiscFees = parseDecimalOrZero(soldMiscFeesStr);
  const shippingFeeRaw = soldFbmShippingFeeStr.trim();
  const carrierRaw = soldFbmCarrierStr.trim();
  const trackingNoRaw = soldFbmTrackingNo.trim();
  const newFbmShippingFee = parseDecimalOrZero(soldFbmShippingFeeStr);
  const orderDate = soldOrderDate?.trim() ? soldOrderDate : todayISO();
  const purchaseDate = soldTargetRow?.purchase_date ?? null;

  if (sale < 0.01) {
    alert("Sold amount must be at least £0.01.");
    return;
  }

  if (aFees < 0.01) {
    alert("Amazon fees must be at least £0.01.");
    return;
  }

  if (soldMode === "FBM" && shippingFeeRaw === "") {
    alert("Shipping fee is required. Enter 0 if there is no shipping fee.");
    return;
  }

  if (soldMode === "FBM" && carrierRaw === "") {
    alert("Carrier is required.");
    return;
  }

  if (soldMode === "FBM" && trackingNoRaw === "") {
    alert("Tracking number is required.");
    return;
  }

  if (purchaseDate && orderDate < purchaseDate) {
    alert("Order date cannot be before purchase date.");
    return;
  }

  const existingMisc = Number(soldTargetRow?.misc_fees ?? 0);
  const existingReturnShip = Number(soldTargetRow?.return_shipping_fee ?? 0);
  const existingFbmShipping = Number(soldTargetRow?.fbm_shipping_fee ?? 0);
  const nextMisc = isEditingExistingSoldItem ? enteredMiscFees : existingMisc + enteredMiscFees;
  const nextFbmShipping = soldMode === "FBM" ? newFbmShippingFee : existingFbmShipping;

  const productCost = Number(soldTargetRow?.unit_cost ?? 0);
  const taxCost = Number(soldTargetRow?.tax_amount ?? 0);
  const shippingCost = Number(soldTargetRow?.shipping_cost ?? 0);
  const amazonInbound = soldCostBreakdown.amazonInboundPerItem;

  const baseCostExAmazonFees =
    productCost +
    taxCost +
    shippingCost +
    amazonInbound +
    nextMisc +
    existingReturnShip +
    nextFbmShipping;

  const totalCost = baseCostExAmazonFees + aFees;
  const amazonPayout = sale - aFees;
  const profitLoss = sale - totalCost;
  const roi = totalCost > 0 ? (profitLoss / totalCost) * 100 : 0;

  setSoldBusy(true);

  try {
    const orderNoToSave =
      isEditingExistingSoldItem && existingOrderNo > 0
        ? existingOrderNo
        : await getNextOrderNoFromDatabase();

    const payload = {
      order_no: orderNoToSave,
      sold_amount: sale,
      amazon_fees: aFees,
      misc_fees: nextMisc,
      fbm_shipping_fee: nextFbmShipping,
      tracking_no: soldMode === "FBM" ? carrierRaw : soldTargetRow?.tracking_no ?? null,
      fbm_tracking_no: soldMode === "FBM" ? trackingNoRaw : soldTargetRow?.fbm_tracking_no ?? null,
      sale_type: soldMode,
      order_date: orderDate,
      amazon_payout: amazonPayout,
      profit_loss: profitLoss,
      roi,
      status: "sold",
    };

    const { error } = await supabase
      .from("purchases")
      .update(payload)
      .eq("id", soldTargetId);

    if (error) throw error;

    setSoldEditMode(false);
    setSoldOpen(false);
    setSoldTargetId(null);
    await loadAll();
  } catch (e: any) {
    alert(e?.message ?? "Failed to mark as sold.");
  } finally {
    setSoldBusy(false);
  }
}

  async function confirmReturn() {
    if (!returnTargetId || !returnTargetRow) return;

    const effectiveReturnDate = returnDate?.trim() ? returnDate : todayISO();
    const returnCost = parseDecimalOrZero(returnCostStr);
    const lastSoldDate = String(returnTargetRow.order_date ?? "").trim();

    if (!effectiveReturnDate) {
      alert("Return date is required.");
      return;
    }

    if (returnCost < 0.01) {
      alert("Return cost must be at least £0.01.");
      return;
    }

    if (lastSoldDate && isIsoDateBefore(effectiveReturnDate, lastSoldDate)) {
      alert(`Return date cannot be before the last sold date (${fmtDate(lastSoldDate)}).`);
      return;
    }

    const currentReturnShipping = Number(returnTargetRow.return_shipping_fee ?? 0);
    const nextReturnShipping = currentReturnShipping + returnCost;

    setReturnBusy(true);
    try {
      const { error } = await supabase
        .from("purchases")
        .update({
          return_shipping_fee: nextReturnShipping,
          last_return_date: effectiveReturnDate,
          status: (returnTargetRow.sale_type === "FBM" ? "processing" : "selling"),
          tracking_no: returnTargetRow.sale_type === "FBM" ? null : returnTargetRow.tracking_no,
          fbm_tracking_no: returnTargetRow.sale_type === "FBM" ? null : returnTargetRow.fbm_tracking_no,
        })
        .eq("id", returnTargetId);

      if (error) throw error;

      setReturnOpen(false);
      setReturnTargetId(null);
      setReturnCostStr("0");
      setReturnDate(todayISO());
      await loadAll();
    } catch (e: any) {
      alert(e?.message ?? "Failed to return item.");
    } finally {
      setReturnBusy(false);
    }
  }

  async function createPurchase() {
    setCreateBusy(true);
    setCreateError(null);

    try {
      if (!selectedProductId) return setCreateError("Select a product first.");
      if (!purchaseDate) return setCreateError("Purchase date is required.");
      if (!qty || qty <= 0) return setCreateError("Quantity must be at least 1.");
      if (!shopStr.trim()) return setCreateError("Shop is required.");
      if (unitCost < 0.01) return setCreateError("Unit cost must be at least £0.01.");

      const pDate = purchaseDate;
      const q = qty;
      const nextItemNo = await getNextItemNoFromDatabase();

      const deliveryNull = toNullDate(deliveryDate);
      const expiryNull = toNullDate(expiryDate);
      const shopNull = toNullText(shopStr);
      const trackingNull = toNullText(trackingStr);

      const initialStatus: Exclude<StatusKey, "all"> = deliveryNull
        ? "processing"
        : "awaiting_delivery";

      const taxParts = splitMoneyEvenly(tax || 0, q);
      const shipParts = splitMoneyEvenly(shipping || 0, q);
      const fixedDiscountParts =
        discountType === "fixed" ? splitMoneyEvenly(discountValue || 0, q) : [];

      const rowsToInsert = Array.from({ length: q }, (_, i) => ({
        item_no: nextItemNo + i,
        order_no: null,
        product_id: selectedProductId,
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
        discount_type: discountType,
        discount_value: discountType === "fixed" ? fixedDiscountParts[i] ?? 0 : discountValue || 0,
        total_cost:
          discountType === "percent"
            ? Math.max(0, unitCost - (unitCost * (discountValue || 0)) / 100) +
              (taxParts[i] ?? 0) +
              (shipParts[i] ?? 0)
            : Math.max(0, unitCost + (taxParts[i] ?? 0) + (shipParts[i] ?? 0) - (fixedDiscountParts[i] ?? 0)),
        tax_year: computeUkTaxYear(pDate),
        status: initialStatus,
        write_off_reason: null,
        write_off_date: null,
        return_reason: null,
        returned_date: null,
        refunded_date: null,
        refund_amount: null,
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
      await loadAll();
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
      const barcodeNorm = catBarcode.trim();
      const amazonBarcodeNorm = catAmazonBarcode.trim();

      if (!asinNorm) return setCatError("ASIN is required.");
      if (!brandNorm.trim()) return setCatError("Brand is required.");
      if (!nameNorm.trim()) return setCatError("Product name is required.");

      const { data, error } = await supabase
        .from("products")
        .insert({
          asin: asinNorm,
          brand: brandNorm,
          product_name: nameNorm,
          barcode: barcodeNorm || null,
          amazon_code: amazonBarcodeNorm || null,
        })
        .select("id, asin, brand, product_name, product_code, barcode, amazon_code")
        .single();

      if (error) throw error;

      const newP = data as ProductRow;
      setProducts((prev) => [newP, ...prev].slice(0, 5));
      setSelectedProductId(newP.id);
      setProductQuery(String(newP.product_code));

      setAddCatalogOpen(false);
      setCatAsin("");
      setCatBrand("");
      setCatName("");
      setCatBarcode("");
      setCatAmazonBarcode("");
    } catch (e: any) {
      setCatError(e?.message ?? "Failed to create product.");
    } finally {
      setCatBusy(false);
    }
  }

  const selectedPurchase = useMemo(() => {
    if (!selectedPurchaseId) return null;
    return purchases.find((p) => p.id === selectedPurchaseId) ?? null;
  }, [purchases, selectedPurchaseId]);

  function openEditFor(p: PurchaseWithProduct) {
    setEditError(null);
    setSelectedPurchaseId(p.id);
    setEPurchaseDate(p.purchase_date ?? todayISO());
    setEDeliveryDate(p.delivery_date ?? "");
    setEExpiryDate(p.expiry_date ?? "");
    setEShopStr(p.shop ?? "");
    setETrackingStr(p.tracking_no ?? "");
    setEQty(p.quantity ?? 1);
    setEUnitCostStr(String(Number(p.unit_cost ?? 0)));
    setETaxStr(String(Number(p.tax_amount ?? 0)));
    setEShippingStr(String(Number(p.shipping_cost ?? 0)));
    setEMiscFeesStr(String(Number(p.misc_fees ?? 0)));
    setEDiscountType((p.discount_type ?? "percent") as DiscountType);
    setEDiscountValueStr(String(Number(p.discount_value ?? 0)));
    setEditOpen(true);
  }

  function openSentToAmazonDetailForRow(row: PurchaseWithProduct) {
    const shipment = getShipmentForPurchase(row);
    if (shipment?.id) {
      setShipDetailId(shipment.id);
      setShipDetailOpen(true);
      return;
    }
    openEditFor(row);
  }

  const eUnit = useMemo(() => parseDecimalOrZero(eUnitCostStr), [eUnitCostStr]);
  const eTax = useMemo(() => parseDecimalOrZero(eTaxStr), [eTaxStr]);
  const eShip = useMemo(() => parseDecimalOrZero(eShippingStr), [eShippingStr]);
  const eMisc = useMemo(() => parseDecimalOrZero(eMiscFeesStr), [eMiscFeesStr]);
  const eDiscVal = useMemo(() => parseDecimalOrZero(eDiscountValueStr), [eDiscountValueStr]);

  const eTotalPreview = useMemo(() => {
    const u = eUnit || 0;
    const q = eQty || 0;

    if (eDiscountType === "percent") {
      const perUnitDisc = (u * (eDiscVal || 0)) / 100;
      const discountedUnit = Math.max(0, u - perUnitDisc);
      return discountedUnit * q + (eTax || 0) + (eShip || 0) + (eMisc || 0);
    }

    const totalBefore = u * q + (eTax || 0) + (eShip || 0);
    return Math.max(0, totalBefore - (eDiscVal || 0)) + (eMisc || 0);
  }, [eDiscVal, eDiscountType, eQty, eShip, eTax, eUnit, eMisc]);


  const editLiveCostBreakdown = useMemo(() => {
    const amazonInboundPerItem = getPurchaseTotals(selectedPurchase).amazonInboundPerItem;
    const amazonFees = Number(selectedPurchase?.amazon_fees ?? 0);
    const returnFees = Number(selectedPurchase?.return_shipping_fee ?? 0);
    const fbmShipping = Number(selectedPurchase?.fbm_shipping_fee ?? 0);

    const discountedBase =
      eDiscountType === "percent"
        ? Math.max(0, eUnit - (eUnit * (eDiscVal || 0)) / 100) * eQty + (eTax || 0) + (eShip || 0)
        : Math.max(0, eUnit * eQty + (eTax || 0) + (eShip || 0) - (eDiscVal || 0));

    return {
      unitCost:
        eDiscountType === "percent"
          ? Math.max(0, eUnit - (eUnit * (eDiscVal || 0)) / 100)
          : Math.max(0, eUnit - ((eDiscVal || 0) / Math.max(1, eQty))),
      tax: eTax,
      shipping: eShip,
      shipToAmazon: amazonInboundPerItem,
      amazonFees,
      miscCost: eMisc,
      returnFees,
      fbmShipping,
      totalCostBasis: discountedBase + eMisc + amazonInboundPerItem + amazonFees + returnFees + fbmShipping,
    };
  }, [selectedPurchase, eDiscountType, eUnit, eDiscVal, eQty, eTax, eShip, eMisc]);


  async function saveEdit() {
    if (!selectedPurchase) return;
    setEditBusy(true);
    setEditError(null);

    try {
      if (!ePurchaseDate) return setEditError("Purchase date is required.");
      if (!eQty || eQty <= 0) return setEditError("Quantity must be at least 1.");
      if (!eShopStr.trim()) return setEditError("Shop is required.");
      if (eUnit < 0.01) return setEditError("Unit cost must be at least £0.01.");

      const newDelivery = toNullDate(eDeliveryDate);

      let nextStatus: Exclude<StatusKey, "all"> = selectedPurchase.status;
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
          misc_fees: eMisc || 0,
          discount_type: eDiscountType,
          discount_value: eDiscVal || 0,
          total_cost:
            eDiscountType === "percent"
              ? Math.max(0, eUnit - (eUnit * (eDiscVal || 0)) / 100) * eQty + (eTax || 0) + (eShip || 0)
              : Math.max(0, eUnit * eQty + (eTax || 0) + (eShip || 0) - (eDiscVal || 0)),
          tax_year: computeUkTaxYear(ePurchaseDate),
          write_off_reason:
            nextStatus == "written_off" ? selectedPurchase.write_off_reason : null,
          write_off_date:
            nextStatus == "written_off" ? selectedPurchase.write_off_date : null,
          return_reason:
            nextStatus === "awaiting_refund" || nextStatus === "refunded"
              ? selectedPurchase.return_reason
              : null,
          returned_date:
            nextStatus === "awaiting_refund" || nextStatus === "refunded"
              ? selectedPurchase.returned_date
              : null,
          refunded_date:
            nextStatus === "refunded" ? selectedPurchase.refunded_date : null,
          refund_amount:
            nextStatus === "awaiting_refund" || nextStatus === "refunded"
              ? selectedPurchase.refund_amount
              : null,
        })
        .eq("id", selectedPurchase.id);

      if (error) throw error;

      setEditOpen(false);
      await loadAll();
    } catch (e: any) {
      setEditError(e?.message ?? "Failed to update purchase.");
    } finally {
      setEditBusy(false);
    }
  }

  async function deleteSelected() {
    if (!selectedPurchaseId) return;
    const yes = window.confirm("Delete this purchase row? This cannot be undone.");
    if (!yes) return;

    try {
      const { error } = await supabase.from("purchases").delete().eq("id", selectedPurchaseId);
      if (error) throw error;
      setSelectedPurchaseId(null);
      await loadAll();
    } catch (e: any) {
      alert(e?.message ?? "Failed to delete row.");
    }
  }

  function escHtml(value: unknown) {
    return String(value ?? "-")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function openSoldPrintView(mode: "print" | "pdf") {
    if (typeof window === "undefined") return;
    if (!soldTargetRow) return;

    const printWindow = window.open("", "_blank", "width=1100,height=900");
    if (!printWindow) return;

    const saleType = soldTargetRow?.sale_type ?? soldMode;
    const generatedAt = new Date().toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const metaRows = [
      ["Order Number", soldTargetRow?.order_no ?? "-"],
      ["Item ID", soldTargetRow?.item_no ?? "-"],
      ["ASIN", soldTargetRow?.product?.asin ?? "-"],
      ["Brand", soldTargetRow?.product?.brand ?? "-"],
      ["Product", soldTargetRow?.product?.product_name ?? "-"],
      ["Shop", soldTargetRow?.shop ?? "-"],
      ["Tax Year", soldTargetRow?.tax_year ?? "-"],
      ["Status", statusLabel((soldTargetRow?.status as StatusKey) ?? "sold")],
    ];

    const movementRows = [
      ["Order Date", fmtDate(soldTargetRow?.purchase_date ?? null)],
      ["Delivery Date", fmtDate(soldTargetRow?.delivery_date ?? null)],
      ["Shipment Date", fmtDate(soldTargetShipment?.shipment_date ?? null)],
      ["Check-in Date", saleType === "FBM" ? "N/A" : fmtDate(soldTargetShipment?.checkin_date ?? null)],
      ["Order Date", fmtDate((soldOrderDate || soldTargetRow?.order_date) ?? null)],
      ["Shipment Box", saleType === "FBM" ? "N/A" : soldTargetRow?.shipment_box_id ?? "-"],
      ["Sale Type", saleType],
      ["Last Return Date", fmtDate(soldTargetRow?.last_return_date ?? null)],
    ];

    const moneyRows = [
      ["Unit Cost", money(soldCostBreakdown.productCost)],
      ["Tax", money(soldCostBreakdown.taxCost)],
      ["Shipping", money(soldCostBreakdown.shippingCost)],
      ["Ship to Amazon", money(soldCostBreakdown.amazonInboundPerItem)],
      ["Amazon Fees", money(soldCostBreakdown.amazonFees)],
      ["Misc Cost", money(soldCostBreakdown.miscCost)],
      ["Return Fees", money(soldCostBreakdown.returnShippingCost)],
      ["FBM Shipping", money(soldCostBreakdown.existingFbmShippingFee)],
      ["Total Cost Basis", money(displayedSoldTotalCost)],
    ];

    const summaryRows = [
      ["Sold Price", money(parseDecimalOrZero(soldAmountStr))],
      ["Total Cost", money(displayedSoldTotalCost)],
      ["Amazon Payout", money(soldPreview.amazonPayout)],
      ["Profit / Loss", money(soldPreview.profitLoss), soldPreview.profitLoss > 0 ? "pos" : soldPreview.profitLoss < 0 ? "neg" : ""],
      ["ROI", `${displayedROI.toFixed(2)}%`, soldPreview.roi >= targetROI ? "pos" : soldPreview.roi < 0 ? "neg" : "warn"],
    ];

    const renderInfoTable = (rows: Array<[string, string | number]>) => `
      <table class="info-table">
        <tbody>
          ${rows
            .map(
              ([label, value]) => `
                <tr>
                  <td>${escHtml(label)}</td>
                  <td>${escHtml(value)}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    `;

    const renderSummary = summaryRows
      .map(
        ([label, value, extraClass]) => `
          <div class="summary-card ${escHtml(extraClass)}">
            <div class="summary-label">${escHtml(label)}</div>
            <div class="summary-value">${escHtml(value)}</div>
          </div>
        `
      )
      .join("");

    printWindow.document.open();
    printWindow.document.write(`
      <html>
        <head>
          <title>${mode === "pdf" ? "Sale Details PDF" : "Sale Details"}</title>
          <style>
            @page { size: A4 portrait; margin: 10mm; }
            * { box-sizing: border-box; }
            html, body {
              margin: 0;
              padding: 0;
              background: #f5f5f5;
              color: #171717;
              font-family: Arial, Helvetica, sans-serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            body {
              padding: 0;
            }
            .sheet {
              width: 190mm;
              min-height: 277mm;
              margin: 0 auto;
              background: #ffffff;
              padding: 10mm;
            }
            .topbar {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 14px;
              padding-bottom: 8mm;
              border-bottom: 2px solid #111827;
            }
            .brand-block {
              max-width: 70%;
            }
            .eyebrow {
              font-size: 10px;
              font-weight: 700;
              letter-spacing: 0.16em;
              text-transform: uppercase;
              color: #6b7280;
              margin-bottom: 3mm;
            }
            .title {
              margin: 0;
              font-size: 24px;
              line-height: 1.1;
              font-weight: 700;
              color: #111827;
            }
            .subtitle {
              margin-top: 2mm;
              font-size: 11px;
              line-height: 1.5;
              color: #525252;
            }
            .meta-panel {
              min-width: 52mm;
              border: 1px solid #d4d4d8;
              border-radius: 12px;
              overflow: hidden;
            }
            .meta-head {
              background: #111827;
              color: #ffffff;
              font-size: 10px;
              font-weight: 700;
              letter-spacing: 0.12em;
              text-transform: uppercase;
              padding: 8px 10px;
            }
            .meta-body {
              padding: 10px;
              display: grid;
              gap: 8px;
            }
            .meta-row-label {
              font-size: 10px;
              color: #6b7280;
              text-transform: uppercase;
              letter-spacing: 0.08em;
            }
            .meta-row-value {
              font-size: 13px;
              font-weight: 700;
              color: #111827;
            }
            .grid-two {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 8px;
              margin-top: 8mm;
            }
            .section {
              border: 1px solid #d4d4d8;
              border-radius: 14px;
              overflow: hidden;
              background: #ffffff;
            }
            .section-head {
              background: #f8fafc;
              border-bottom: 1px solid #e5e7eb;
              padding: 9px 12px;
              font-size: 11px;
              font-weight: 700;
              letter-spacing: 0.12em;
              text-transform: uppercase;
              color: #374151;
            }
            .section-body {
              padding: 8px 12px 10px;
            }
            .info-table {
              width: 100%;
              border-collapse: collapse;
            }
            .info-table td {
              padding: 7px 0;
              font-size: 12px;
              vertical-align: top;
              border-bottom: 1px solid #f1f5f9;
            }
            .info-table tr:last-child td {
              border-bottom: 0;
            }
            .info-table td:first-child {
              width: 42%;
              color: #6b7280;
              font-weight: 600;
            }
            .info-table td:last-child {
              color: #111827;
              font-weight: 700;
              text-align: right;
            }
            .summary-section {
              margin-top: 8px;
            }
            .summary-grid {
              display: grid;
              grid-template-columns: repeat(5, 1fr);
              gap: 8px;
            }
            .summary-card {
              border: 1px solid #d4d4d8;
              border-radius: 14px;
              padding: 10px 10px 12px;
              background: linear-gradient(180deg, #ffffff 0%, #fafafa 100%);
              min-height: 68px;
            }
            .summary-label {
              font-size: 9px;
              font-weight: 700;
              letter-spacing: 0.12em;
              text-transform: uppercase;
              color: #6b7280;
              margin-bottom: 7px;
            }
            .summary-value {
              font-size: 17px;
              line-height: 1.15;
              font-weight: 700;
              color: #111827;
            }
            .pos .summary-value { color: #047857; }
            .neg .summary-value { color: #b91c1c; }
            .warn .summary-value { color: #a16207; }
            .footer {
              margin-top: 8mm;
              padding-top: 4mm;
              border-top: 1px solid #d4d4d8;
              display: flex;
              justify-content: space-between;
              gap: 12px;
              font-size: 10px;
              color: #6b7280;
            }
            @media print {
              html, body { background: #ffffff; }
              .sheet {
                width: auto;
                min-height: auto;
                margin: 0;
                padding: 0;
              }
            }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="topbar">
              <div class="brand-block">
                <div class="eyebrow">Inventory Management</div>
                <h1 class="title">Sale Details Report</h1>
                <div class="subtitle">
                  Professional single-page summary for printing and PDF export from the Sold filter.
                </div>
              </div>
              <div class="meta-panel">
                <div class="meta-head">Document Summary</div>
                <div class="meta-body">
                  <div>
                    <div class="meta-row-label">Sale Type</div>
                    <div class="meta-row-value">${escHtml(saleType)}</div>
                  </div>
                  <div>
                    <div class="meta-row-label">Order Number</div>
                    <div class="meta-row-value">${escHtml(soldTargetRow?.order_no ?? "-")}</div>
                  </div>
                  <div>
                    <div class="meta-row-label">Generated</div>
                    <div class="meta-row-value">${escHtml(generatedAt)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="grid-two">
              <div class="section">
                <div class="section-head">Product Details</div>
                <div class="section-body">
                  ${renderInfoTable(metaRows)}
                </div>
              </div>
              <div class="section">
                <div class="section-head">Key Dates &amp; Movement</div>
                <div class="section-body">
                  ${renderInfoTable(movementRows)}
                </div>
              </div>
            </div>

            <div class="grid-two" style="margin-top: 8px;">
              <div class="section">
                <div class="section-head">Cost Breakdown</div>
                <div class="section-body">
                  ${renderInfoTable(moneyRows)}
                </div>
              </div>
              <div class="section summary-section">
                <div class="section-head">Current Calculations</div>
                <div class="section-body">
                  <div class="summary-grid">${renderSummary}</div>
                </div>
              </div>
            </div>

            <div class="footer">
              <div>Generated from Inventory &gt; Sold filter</div>
              <div>${escHtml(mode === "pdf" ? "Prepared for PDF export" : "Prepared for printing")}</div>
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  }


  const isAwaitingFilter = status === "awaiting_delivery";
  const isSoldFilter = status === "sold";
  const isProcessingFilter = status === "processing";
  const isSentToAmazonFilter = status === "sent_to_amazon";
  const isSellingFilter = status === "selling";
  const isWrittenOffFilter = status === "written_off";
  const isReturnedItemsFilter = status === "returned_items";

  const showTopSearch = !(isProcessingFilter || isSellingFilter || isAwaitingFilter);
  const showSoldMetrics = isSoldFilter;
  const showShipmentBoxColumn = !isWrittenOffFilter && !isAwaitingFilter && !isSoldFilter && !isReturnedItemsFilter;

  const showPurchaseCol = !isSentToAmazonFilter && !isSellingFilter && !isSoldFilter;
  const showDeliveryCol =
    !isAwaitingFilter && !isSentToAmazonFilter && !isSellingFilter && !isSoldFilter;

  const awaitingVisibleIds = isAwaitingFilter ? visiblePurchases.map((r) => r.id) : [];
  const allVisibleAwaitingSelected =
    awaitingVisibleIds.length > 0 && awaitingVisibleIds.every((id) => awaitingSelectedIds.includes(id));
  const selectedAwaitingCount = awaitingSelectedIds.length;

  function getRowClass(
    isSelected: boolean,
    isAwaitingSelected: boolean,
    isInBox: boolean,
    isProcessingFilter: boolean,
  ) {
    if (isAwaitingSelected) return "bg-amber-100 ring-1 ring-inset ring-amber-300";

    if (!isProcessingFilter) return "";

    if (isInBox) return "bg-emerald-50 ring-1 ring-inset ring-emerald-300";
    return "";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="text-sm font-semibold text-neutral-900">Inventory</div>
          <div className="mt-1 text-xs text-neutral-600">
            Add purchases, track status, and manage movements.
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          {isSoldFilter ? (
            <div className="rounded-xl border bg-white px-3 py-2 shadow-sm">
              <div className="text-[11px] text-neutral-500">Target ROI</div>
              <button
                type="button"
                className="mt-1 text-sm font-semibold text-neutral-900 underline underline-offset-2"
                onClick={() => {
                  setTargetROIStr(String(targetROI));
                  setTargetROIOpen(true);
                }}
              >
                {targetROI}%
              </button>
            </div>
          ) : null}

          {showTopSearch ? (
            <input
              className="w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-200 sm:w-80"
              placeholder="Search ASIN / brand / product / code / status / item ID / order ID…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <button
              className={buttonClass()}
              disabled={!selectedPurchaseId}
              onClick={() => {
                const row = purchases.find((p) => p.id === selectedPurchaseId);
                if (row) openEditFor(row);
              }}
            >
              Edit
            </button>

            <button className={buttonClass()} disabled={!selectedPurchaseId} onClick={deleteSelected}>
              Delete
            </button>

            <button
              className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-xl bg-neutral-900 px-4 text-sm text-white hover:opacity-95"
              onClick={() => {
                resetAddPurchaseForm();
                setAddOpen(true);
              }}
            >
              + Add Purchase
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {(
              [
                "all",
                "awaiting_delivery",
                "processing",
                "sent_to_amazon",
                "selling",
                "sold",
                "written_off",
                "returned_items",
              ] as StatusKey[]
            ).map((k) => (
              <button key={k} className={statusFilterBtn(status === k)} onClick={() => setStatus(k)}>
                {statusLabel(k)}
              </button>
            ))}
          </div>

          {status === "awaiting_delivery" || status === "processing" || status === "sent_to_amazon" || status === "selling" ? null : (
            <div className="flex items-center gap-2">
              <div className="text-xs text-neutral-600">Timeframe: {getRangeLabel(range)}</div>
              <SelectField
                value={range}
                onChange={(value) => setRange(value as RangeKey)}
                options={timeframeOptions}
                className="min-w-[190px]"
              />
            </div>
          )}
        </div>

        {isAwaitingFilter ? (
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="space-y-3">
              <input
                className={inputClass()}
                placeholder="Search ASIN / brand / product / code / status…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />

              <div className="flex flex-col gap-2 rounded-xl border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-neutral-700">
                  Selected awaiting-delivery rows: <b>{selectedAwaitingCount}</b>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={buttonClass()}
                    onClick={() => toggleAwaitingSelectionForVisible(awaitingVisibleIds)}
                    disabled={awaitingVisibleIds.length === 0}
                  >
                    {allVisibleAwaitingSelected ? "Unselect Visible" : "Select Visible"}
                  </button>
                  <button
                    type="button"
                    className={buttonClass()}
                    onClick={() => setAwaitingSelectedIds([])}
                    disabled={selectedAwaitingCount === 0}
                  >
                    Clear Selected
                  </button>
                  <button
                    type="button"
                    className={buttonClass(true)}
                    onClick={openBulkDeliveredModal}
                    disabled={selectedAwaitingCount === 0}
                  >
                    Mark Selected Delivered
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {isProcessingFilter ? (
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-neutral-900">Current packing box</div>
              <div className="mt-1 text-xs text-neutral-600">
                Current box: <b>{currentBoxNo ?? "(no open box found)"}</b>
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                Open box is pulled from Shipments where shipment_date is empty.
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass()}
                  onClick={() => setShowInBox((s) => !s)}
                >
                  {showInBox ? "Hide currently in box" : "Show currently in box"}
                </button>

                <button
                  type="button"
                  className={showProcessingBoxOnly ? buttonClass(true) : buttonClass()}
                  onClick={() => setShowProcessingBoxOnly((s) => !s)}
                >
                  {showProcessingBoxOnly ? "Show All" : "Show In Box In Table"}
                </button>
              </div>

              <div className="mt-4 max-w-md">
                {currentBoxNo ? (
                  <button
                    type="button"
                    className="block w-full text-left"
                    onClick={openFinalise}
                    title="Scan this barcode to open Finalise box"
                  >
                    <Code39Barcode value={currentBoxNo} />
                  </button>
                ) : null}
              </div>

              {showInBox ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {boxGrouped.length === 0 ? (
                    <div className="text-xs text-neutral-600">No items added yet.</div>
                  ) : (
                    boxGrouped.map((g) => (
                      <div
                        key={g.asin}
                        className="cursor-pointer rounded-xl border bg-white p-3 hover:bg-neutral-50"
                        onDoubleClick={() => openEditBoxQty(g.asin, g.qty)}
                        title="Double-click to edit qty"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs font-semibold text-neutral-900">{g.asin}</div>
                          <div className="flex items-center gap-2">
                            <div className="text-xs font-semibold text-neutral-900">x{g.qty}</div>
                            <button
                              type="button"
                              className={miniBtn()}
                              onClick={async (e) => {
                                e.stopPropagation();
                                await removeNewestFromBoxByAsin(g.asin, g.qty);
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                        <div className="mt-1 text-[11px] text-neutral-600">
                          {g.brand} • {g.name}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : null}
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="rounded-xl border bg-neutral-50 px-4 py-3 text-right">
                <div className="text-xs text-neutral-600">Units in box</div>
                <div className="text-lg font-semibold text-neutral-900">{unitsInBox}</div>
                <div className="mt-2 text-xs text-neutral-600">Value of box</div>
                <div className="text-sm font-semibold text-neutral-900">{money(boxValue)}</div>
              </div>

              <button
                type="button"
                className={buttonClass(true)}
                onClick={openFinalise}
                disabled={!currentBoxNo || unitsInBox === 0}
              >
                Finalise box
              </button>
            </div>
          </div>

          <div className="mt-4">
            <input
              className={inputClass()}
              placeholder="Search ASIN / brand / product / code / status…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>
      ) : null}

      {isSellingFilter ? (
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <input
            className={inputClass()}
            placeholder="Search ASIN / brand / product / code / status…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
      ) : null}

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        {loading ? (
          <div className="text-sm text-neutral-700">Loading…</div>
        ) : pageError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {pageError}
          </div>
        ) : isSentToAmazonFilter ? (
          sortedShipments.length === 0 ? (
            <div className="text-sm text-neutral-700">No shipments found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-neutral-600">
                  <tr className="border-b">
                    <SortableTh
                      label="Status"
                      sortKey="status"
                      activeKey={shipmentSortKey}
                      direction={shipmentSortDirection}
                      onToggle={toggleShipmentSort}
                    />
                    <SortableTh
                      label="Shipment Box No"
                      sortKey="shipment_box_no"
                      activeKey={shipmentSortKey}
                      direction={shipmentSortDirection}
                      onToggle={toggleShipmentSort}
                    />
                    <SortableTh
                      label="Shipment Date"
                      sortKey="shipment_date"
                      activeKey={shipmentSortKey}
                      direction={shipmentSortDirection}
                      onToggle={toggleShipmentSort}
                    />
                    <SortableTh
                      label="Cost"
                      sortKey="cost"
                      activeKey={shipmentSortKey}
                      direction={shipmentSortDirection}
                      onToggle={toggleShipmentSort}
                    />
                    <SortableTh
                      label="Tax"
                      sortKey="tax"
                      activeKey={shipmentSortKey}
                      direction={shipmentSortDirection}
                      onToggle={toggleShipmentSort}
                    />
                    <SortableTh
                      label="Total"
                      sortKey="total"
                      activeKey={shipmentSortKey}
                      direction={shipmentSortDirection}
                      onToggle={toggleShipmentSort}
                    />
                    <SortableTh
                      label="Units"
                      sortKey="units"
                      activeKey={shipmentSortKey}
                      direction={shipmentSortDirection}
                      onToggle={toggleShipmentSort}
                    />
                    <SortableTh
                      label="Box Value"
                      sortKey="box_value"
                      activeKey={shipmentSortKey}
                      direction={shipmentSortDirection}
                      onToggle={toggleShipmentSort}
                    />
                    <SortableTh
                      label="Tracking Number"
                      sortKey="tracking_no"
                      activeKey={shipmentSortKey}
                      direction={shipmentSortDirection}
                      onToggle={toggleShipmentSort}
                    />
                    <SortableTh
                      label="Carrier"
                      sortKey="carrier"
                      activeKey={shipmentSortKey}
                      direction={shipmentSortDirection}
                      onToggle={toggleShipmentSort}
                    />
                    <th className="py-3 pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedShipments.map((s) => {
                    const trackHref = trackingUrl(s.carrier, s.tracking_no);

                    return (
                      <tr
                        key={s.id}
                        className="cursor-pointer border-b last:border-b-0 transition hover:bg-neutral-50"
                        onDoubleClick={() => {
                          setShipDetailId(s.id);
                          setShipDetailOpen(true);
                        }}
                      >
                        <td className="py-3 pr-4">
                          <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2 py-1 text-xs text-purple-800">
                            In Transit
                          </span>
                        </td>
                        <td className="py-3 pr-4">{s.shipment_box_no ?? "-"}</td>
                        <td className="py-3 pr-4">{fmtDate(s.shipment_date)}</td>
                        <td className="py-3 pr-4">{s.cost == null ? "-" : money(Number(s.cost))}</td>
                        <td className="py-3 pr-4">{s.tax == null ? "-" : money(Number(s.tax))}</td>
                        <td className="py-3 pr-4">{s.total == null ? "-" : money(Number(s.total))}</td>
                        <td className="py-3 pr-4">{Number(s.units ?? s.total_units ?? 0) || "-"}</td>
                        <td className="py-3 pr-4">{s.box_value == null ? "-" : money(Number(s.box_value))}</td>
                        <td className="py-3 pr-4">
                          {trackHref ? (
                            <a
                              href={trackHref}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {s.tracking_no ?? "-"}
                            </a>
                          ) : (
                            s.tracking_no ?? "-"
                          )}
                        </td>
                        <td className="py-3 pr-4">{s.carrier ?? "-"}</td>
                        <td className="py-3 pr-4">
                          <button
                            type="button"
                            className={miniBtn(true)}
                            onClick={(e) => {
                              e.stopPropagation();
                              openCheckin(s.id);
                            }}
                          >
                            Item received by Amazon
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-600">Rows per page</span>
                  <SelectField
                    value={rowsPerPage}
                    onChange={(value) => setRowsPerPage(Number(value))}
                    options={rowsPerPageOptions}
                    className="min-w-[92px]"
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    className={buttonClass()}
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    Previous
                  </button>

                  <div className="text-xs text-neutral-600">Page {page + 1}</div>

                  <button
                    type="button"
                    className={buttonClass()}
                    disabled={!hasNextPage}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )
        ) : visiblePurchases.length === 0 ? (
          <div className="text-sm text-neutral-700">No purchases found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-neutral-600">
                <tr className="border-b">
                  <SortableTh
                    label="Status"
                    sortKey="status"
                    activeKey={purchaseSortKey}
                    direction={purchaseSortDirection}
                    onToggle={togglePurchaseSort}
                  />
                  {!isReturnedItemsFilter && !isAwaitingFilter && !isProcessingFilter && !isSellingFilter ? (
                    <SortableTh
                      label="Order No"
                      sortKey="order_no"
                      activeKey={purchaseSortKey}
                      direction={purchaseSortDirection}
                      onToggle={togglePurchaseSort}
                    />
                  ) : null}
                  <SortableTh
                    label="Item ID"
                    sortKey="item_no"
                    activeKey={purchaseSortKey}
                    direction={purchaseSortDirection}
                    onToggle={togglePurchaseSort}
                  />

                  {isAwaitingFilter ? (
                    <>

                      <SortableTh
                        label="ASIN"
                        sortKey="asin"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Brand"
                        sortKey="brand"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Product"
                        sortKey="product_name"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Total Cost"
                        sortKey="total"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Product Tracking"
                        sortKey="tracking_no"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Purchase"
                        sortKey="purchase_date"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                    </>
                  ) : isProcessingFilter ? (
                    <>
                      <SortableTh
                        label="ASIN"
                        sortKey="asin"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Brand"
                        sortKey="brand"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Product"
                        sortKey="product_name"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Total Cost"
                        sortKey="total"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Shipment Box"
                        sortKey="shipment_box_id"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Purchase"
                        sortKey="purchase_date"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Delivery"
                        sortKey="delivery_date"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                    </>
                  ) : isSellingFilter ? (
                    <>
                      <SortableTh
                        label="ASIN"
                        sortKey="asin"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Brand"
                        sortKey="brand"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Product"
                        sortKey="product_name"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Total Cost"
                        sortKey="total"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Shipment Box"
                        sortKey="shipment_box_id"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Age"
                        sortKey="age"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                    </>
                  ) : isReturnedItemsFilter ? (
                    <>
                      <SortableTh
                        label="Returned Date"
                        sortKey="returned_date"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Days Waiting"
                        sortKey="returned_date"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Refunded Date"
                        sortKey="refunded_date"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="ASIN"
                        sortKey="asin"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Brand"
                        sortKey="brand"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Product"
                        sortKey="product_name"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Cost of Item"
                        sortKey="unit_cost"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Shipping"
                        sortKey="shipping_cost"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="VAT"
                        sortKey="tax_amount"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Refund Amount"
                        sortKey="refund_amount"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Reason"
                        sortKey="return_reason"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                    </>
                  ) : isWrittenOffFilter ? (
                    <>
                      <SortableTh
                        label="Order ID"
                        sortKey="order_no"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="ASIN"
                        sortKey="asin"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Brand"
                        sortKey="brand"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Product"
                        sortKey="product_name"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Total Cost"
                        sortKey="total"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Reason"
                        sortKey="status"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                    </>
                  ) : (
                    <>
                      <SortableTh
                        label="Purchase"
                        sortKey="purchase_date"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="ASIN"
                        sortKey="asin"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Brand"
                        sortKey="brand"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Product"
                        sortKey="product_name"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Total Cost"
                        sortKey="total"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Type"
                        sortKey="sale_type"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="Sold Price"
                        sortKey="sold_amount"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="P/L"
                        sortKey="profit_loss"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                      <SortableTh
                        label="ROI"
                        sortKey="roi"
                        activeKey={purchaseSortKey}
                        direction={purchaseSortDirection}
                        onToggle={togglePurchaseSort}
                      />
                    </>
                  )}

                  <th className="py-3 pr-4">Actions</th>
                </tr>
              </thead>

              <tbody>
                {visiblePurchases.map((r) => {
                  const p = r.product;
                  const disc =
                    r.discount_type === "percent"
                      ? `${Number(r.discount_value ?? 0)}%`
                      : `£${Number(r.discount_value ?? 0)}`;

                  const isSelected = selectedPurchaseId === r.id;
                  const isInBox = !!currentBoxNo && (r.shipment_box_id ?? null) === currentBoxNo;
                  const totals = getPurchaseTotals(r);
                  const dayCount = daysAtAmazon(getShipmentForPurchase(r)?.checkin_date ?? null);
                  const canReturn = (daysSince(r.order_date) ?? 9999) <= 45;

                  const isAwaitingSelected = awaitingSelectedIds.includes(r.id);

                  return (
                    <tr
                      key={r.id}
                      className={[
                        "cursor-pointer border-b last:border-b-0 transition hover:bg-neutral-50",
                        getRowClass(isSelected, isAwaitingSelected, isInBox, isProcessingFilter),
                      ].join(" ")}
                      onClick={() => {
                        if (isAwaitingFilter) handleAwaitingRowClick(r.id);
                        else if (isProcessingFilter) return;
                        else setSelectedPurchaseId(r.id);
                      }}
                      onDoubleClick={() => {
                        if (isAwaitingFilter) handleAwaitingRowDoubleClick(r);
                        else if (isProcessingFilter) handleProcessingRowDoubleClick(r);
                        else if (isSellingFilter) openSold(r.id, "FBA");
                        else if (isSoldFilter) openSold(r.id, (r.sale_type ?? "FBA") as "FBA" | "FBM");
                        else if (isWrittenOffFilter) openWrittenOffDetail(r.id);
                        else if (isReturnedItemsFilter) openReturnedItemDetailModal(r.id);
                        else if (r.status === "selling") openSold(r.id, "FBA");
                        else if (r.status === "sold") openSold(r.id, (r.sale_type ?? "FBA") as "FBA" | "FBM");
                        else if (r.status === "written_off") openWrittenOffDetail(r.id);
                        else if (r.status === "sent_to_amazon") openSentToAmazonDetailForRow(r);
                        else openEditFor(r);
                      }}
                      title={
                        isSellingFilter
                          ? "Double-click to open sold popup"
                          : isSoldFilter
                            ? "Double-click to view full sold breakdown"
                            : isWrittenOffFilter
                              ? "Double-click to view written off details"
                              : isReturnedItemsFilter
                                ? "Double-click to view returned item details"
                                : r.status === "selling"
                                ? "Double-click to open sold popup"
                                : r.status === "sold"
                                  ? "Double-click to view full sold breakdown"
                                  : r.status === "written_off"
                                    ? "Double-click to view written off details"
                                    : r.status === "sent_to_amazon"
                                      ? "Double-click to view shipment details"
                                      : "Double-click to edit"
                      }
                    >
                      <td className="py-3 pr-4">
                        <span
                          className={[
                            "inline-flex items-center rounded-full border px-2 py-1 text-xs",
                            statusPillColor(r.status),
                          ].join(" ")}
                        >
                          {statusLabel(r.status)}
                        </span>

                        {r.status === "written_off" && r.write_off_reason ? (
                          <div className="mt-2 text-xs text-neutral-600">
                            Reason: <b>{titleCaseEveryWord(r.write_off_reason)}</b>
                          </div>
                        ) : null}
                      </td>

                      {!isReturnedItemsFilter && !isAwaitingFilter && !isProcessingFilter && !isSellingFilter ? (
                        <td className="py-3 pr-4 font-medium text-neutral-900">{r.status === "sold" || r.status === "written_off" ? (r.order_no ?? "-") : "-"}</td>
                      ) : null}

                      <td className="py-3 pr-4 font-medium text-neutral-900">{r.item_no ?? "-"}</td>

                      {isAwaitingFilter ? (
                        <>

                          <td className="py-3 pr-4">{p?.asin ?? "-"}</td>
                          <td className="py-3 pr-4">{p?.brand ?? "-"}</td>
                          <td className="py-3 pr-4">{p?.product_name ?? "-"}</td>
                          <td className="py-3 pr-4 font-semibold text-neutral-900">{money(Number(r.total_cost ?? 0))}</td>
                          <td className="py-3 pr-4">{r.tracking_no ?? "-"}</td>
                          <td className="py-3 pr-4">{fmtDate(r.purchase_date)}</td>
                        </>
                      ) : isProcessingFilter ? (
                        <>
                          <td className="py-3 pr-4">{p?.asin ?? "-"}</td>
                          <td className="py-3 pr-4">{p?.brand ?? "-"}</td>
                          <td className="py-3 pr-4">{p?.product_name ?? "-"}</td>
                          <td className="py-3 pr-4 font-semibold text-neutral-900">{money(totals.processingTotal)}</td>
                          <td className="py-3 pr-4">{r.shipment_box_id ?? "-"}</td>
                          <td className="py-3 pr-4">{fmtDate(r.purchase_date)}</td>
                          <td className="py-3 pr-4">{fmtDate(r.delivery_date)}</td>
                        </>
                      ) : isSellingFilter ? (
                        <>
                          <td className="py-3 pr-4">{p?.asin ?? "-"}</td>
                          <td className="py-3 pr-4">{p?.brand ?? "-"}</td>
                          <td className="py-3 pr-4">{p?.product_name ?? "-"}</td>
                          <td className="py-3 pr-4 font-semibold text-neutral-900">{money(totals.sellingTotal)}</td>
                          <td className="py-3 pr-4">{r.shipment_box_id ?? "-"}</td>
                          <td className={["py-3 pr-4", ageClass(dayCount)].join(" ")}>{dayCount ?? "-"}</td>
                        </>
                      ) : isReturnedItemsFilter ? (
                        <>
                          <td className="py-3 pr-4">{fmtDate(r.returned_date ?? null)}</td>
                          <td className="py-3 pr-4">
                            {r.status === "awaiting_refund" ? (
                              <span
                                className={[
                                  "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                                  daysBetween(r.returned_date ?? r.created_at, todayISO()) > 14
                                    ? "border-red-200 bg-red-50 text-red-700"
                                    : daysBetween(r.returned_date ?? r.created_at, todayISO()) > 7
                                      ? "border-amber-200 bg-amber-50 text-amber-700"
                                      : "border-neutral-200 bg-neutral-50 text-neutral-700",
                                ].join(" ")}
                              >
                                {daysBetween(r.returned_date ?? r.created_at, todayISO())}
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="py-3 pr-4">{fmtDate(r.refunded_date ?? null)}</td>
                          <td className="py-3 pr-4">{p?.asin ?? "-"}</td>
                          <td className="py-3 pr-4">{p?.brand ?? "-"}</td>
                          <td className="py-3 pr-4">{p?.product_name ?? "-"}</td>
                          <td className="py-3 pr-4 font-semibold text-neutral-900">{money(Number(r.unit_cost ?? 0))}</td>
                          <td className="py-3 pr-4 font-semibold text-neutral-900">{money(Number(r.shipping_cost ?? 0))}</td>
                          <td className="py-3 pr-4 font-semibold text-neutral-900">{money(Number(r.tax_amount ?? 0))}</td>
                          <td className="py-3 pr-4 font-semibold text-neutral-900">{money(Number(r.refund_amount ?? 0))}</td>
                          <td className="py-3 pr-4">{titleCaseEveryWord(String(r.return_reason ?? "-"))}</td>
                        </>
                      ) : isWrittenOffFilter ? (
                        <>
                          <td className="py-3 pr-4">{fmtDate(r.write_off_date ?? null)}</td>
                          <td className="py-3 pr-4">{p?.asin ?? "-"}</td>
                          <td className="py-3 pr-4">{p?.brand ?? "-"}</td>
                          <td className="py-3 pr-4">{p?.product_name ?? "-"}</td>
                          <td className="py-3 pr-4 font-semibold text-neutral-900">
                            {money(
                              Number(r.unit_cost ?? 0) +
                              Number(r.tax_amount ?? 0) +
                              Number(r.shipping_cost ?? 0) +
                              getAmazonInboundPerItem(r) +
                              Number(r.amazon_fees ?? 0) +
                              Number(r.return_shipping_fee ?? 0) +
                              Number(r.fbm_shipping_fee ?? 0) +
                              Number(r.misc_fees ?? 0)
                            )}
                          </td>
                          <td className="py-3 pr-4">
                            {titleCaseEveryWord(parseWriteOffDetails(r.write_off_reason ?? null).reason)}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-3 pr-4">{fmtDate(r.purchase_date)}</td>
                          <td className="py-3 pr-4">{p?.asin ?? "-"}</td>
                          <td className="py-3 pr-4">{p?.brand ?? "-"}</td>
                          <td className="py-3 pr-4">{p?.product_name ?? "-"}</td>
                          <td className="py-3 pr-4 font-semibold text-neutral-900">{money(totals.soldTotal)}</td>
                          <td className="py-3 pr-4">{r.sale_type ?? "-"}</td>
                          <td className="py-3 pr-4">
                            {r.sold_amount == null ? "-" : money(Number(r.sold_amount))}
                          </td>
                          <td className={profitLossTextClass(Number(r.sold_amount ?? 0) - totals.soldTotal)}>
  {money(Number(r.sold_amount ?? 0) - totals.soldTotal)}
</td>
                          <td
                            className={[
                              "py-3 pr-4",
                              roiTextClass(
                                r.sold_amount == null || totals.soldTotal <= 0
                                  ? null
                                  : ((Number(r.sold_amount) - totals.soldTotal) / totals.soldTotal) * 100,
                                targetROI
                              ),
                            ].join(" ")}
                          >
                            {r.sold_amount == null || totals.soldTotal <= 0
                              ? "-"
                              : `${(((Number(r.sold_amount) - totals.soldTotal) / totals.soldTotal) * 100).toFixed(2)}%`}
                          </td>
                        </>
                      )}

                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap gap-2">
                          {r.status === "awaiting_delivery" ? (
                            <>
                              <button
                                type="button"
                                className={miniBtn(true)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDeliveredModal(r.id);
                                }}
                              >
                                Delivered
                              </button>

                              <button
                                type="button"
                                className={miniBtn()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openAwaitingRefundModal(r.id);
                                }}
                              >
                                Returned
                              </button>
                            </>
                          ) : null}

                          {r.status === "processing" ? (
                            <>
                              <button
                                type="button"
                                className={miniBtn(true)}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  setSelectedPurchaseId(r.id);
                                  await setInBox(r.id, !isInBox);
                                }}
                                disabled={!currentBoxNo}
                              >
                                {isInBox ? "Remove from Box" : "Add to Box"}
                              </button>

                              {!isInBox ? (
                                <button
                                  type="button"
                                  className={miniBtn()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openSold(r.id, "FBM");
                                  }}
                                >
                                  FBM Sold
                                </button>
                              ) : null}
                            </>
                          ) : null}

                          {r.status === "selling" ? (
                            <>
                              <button
                                type="button"
                                className={miniBtn(true)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openSold(r.id, "FBA");
                                }}
                              >
                                Sold
                              </button>

                              <button
                                type="button"
                                className={miniBtn()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openWriteOff(r.id);
                                }}
                              >
                                Write Off
                              </button>
                            </>
                          ) : null}

                          {r.status === "sold" && canReturn ? (
                            <button
                              type="button"
                              className={miniBtn()}
                              onClick={(e) => {
                                e.stopPropagation();
                                openReturn(r.id);
                              }}
                            >
                              Return
                            </button>
                          ) : null}

                          {r.status === "written_off" ? (
                            <button
                              type="button"
                              className={miniBtn()}
                              onClick={(e) => {
                                e.stopPropagation();
                                openWrittenOffDetail(r.id);
                              }}
                            >
                              Restore Item
                            </button>
                          ) : null}

                          {r.status === "awaiting_refund" ? (
                            <>
                              <button
                                type="button"
                                className={miniBtn(true)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openRefundCompleteModal(r.id);
                                }}
                              >
                                Refunded
                              </button>


                              <button
                                type="button"
                                className={miniBtn()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openRestoreModal(r.id);
                                }}
                              >
                                Restore
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-600">Rows per page</span>
                <SelectField
                  value={rowsPerPage}
                  onChange={(value) => setRowsPerPage(Number(value))}
                  options={rowsPerPageOptions}
                  className="min-w-[92px]"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className={buttonClass()}
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Previous
                </button>

                <div className="text-xs text-neutral-600">Page {page + 1}</div>

                <button
                  type="button"
                  className={buttonClass()}
                  disabled={!hasNextPage}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {awaitingRefundOpen && awaitingRefundTargetRow ? (
        <div className={modalBackdrop()} onMouseDown={() => setAwaitingRefundOpen(false)}>
          <div className="w-full max-w-xl rounded-2xl border bg-white shadow-sm" onMouseDown={(e) => e.stopPropagation()}>
            <form
              className="contents"
              onSubmit={(e) => {
                e.preventDefault();
                saveAwaitingRefund();
              }}
            >
              <div className="flex items-start justify-between border-b p-5">
                <div>
                  <div className="text-lg font-semibold text-neutral-900">Returned Item</div>
                  <div className="mt-1 text-xs text-neutral-600">Select the refund parts and enter the returned reason below.</div>
                </div>
                <button type="button" className={buttonClass()} onClick={() => setAwaitingRefundOpen(false)}>
                  Close
                </button>
              </div>

              <div className="space-y-4 p-5">
                {awaitingRefundError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {awaitingRefundError}
                  </div>
                ) : null}

                <div>
                  <div className={fieldLabel()}>Cost Breakdown *</div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      className={[
                        "rounded-xl border px-4 py-3 text-left text-sm transition",
                        awaitingRefundIncludeProduct ? "border-neutral-900 bg-neutral-900 text-white" : "bg-white hover:bg-neutral-50",
                      ].join(" ")}
                      onClick={() => setAwaitingRefundIncludeProduct((v) => !v)}
                    >
                      <div className="font-semibold">Product Cost</div>
                      <div className="mt-1 text-xs">{money(Number(awaitingRefundTargetRow.unit_cost ?? 0))}</div>
                    </button>
                    <button
                      type="button"
                      className={[
                        "rounded-xl border px-4 py-3 text-left text-sm transition",
                        awaitingRefundIncludeShipping ? "border-neutral-900 bg-neutral-900 text-white" : "bg-white hover:bg-neutral-50",
                      ].join(" ")}
                      onClick={() => setAwaitingRefundIncludeShipping((v) => !v)}
                    >
                      <div className="font-semibold">Shipping</div>
                      <div className="mt-1 text-xs">{money(Number(awaitingRefundTargetRow.shipping_cost ?? 0))}</div>
                    </button>
                    <button
                      type="button"
                      className={[
                        "rounded-xl border px-4 py-3 text-left text-sm transition",
                        awaitingRefundIncludeVat ? "border-neutral-900 bg-neutral-900 text-white" : "bg-white hover:bg-neutral-50",
                      ].join(" ")}
                      onClick={() => setAwaitingRefundIncludeVat((v) => !v)}
                    >
                      <div className="font-semibold">VAT</div>
                      <div className="mt-1 text-xs">{money(Number(awaitingRefundTargetRow.tax_amount ?? 0))}</div>
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <div className={fieldLabel()}>Returned Reason *</div>
                    <ReasonAutocompleteInput
                      value={awaitingRefundReason}
                      onChange={setAwaitingRefundReason}
                      options={returnReasonOptions}
                      inputRef={awaitingRefundReasonRef}
                      placeholder="Start typing a returned reason"
                    />
                  </div>

                  <div>
                    <div className={fieldLabel()}>Returned Date</div>
                    <input
                      className={inputClass()}
                      type="date"
                      value={awaitingRefundDate}
                      onChange={(e) => setAwaitingRefundDate(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <div className={fieldLabel()}>Total</div>
                  <input
                    className="w-full rounded-xl border bg-neutral-100 px-3 py-2 text-sm text-neutral-700 outline-none"
                    value={money(awaitingRefundTotal)}
                    readOnly
                  />
                </div>

                <div className="flex justify-end">
                  <button type="submit" className={buttonClass(true)} disabled={awaitingRefundBusy}>
                    {awaitingRefundBusy ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {refundCompleteOpen && refundCompleteTargetRow ? (
        <div className={modalBackdrop()} onMouseDown={() => setRefundCompleteOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl border bg-white shadow-sm" onMouseDown={(e) => e.stopPropagation()}>
            <form
              className="contents"
              onSubmit={(e) => {
                e.preventDefault();
                saveRefundComplete();
              }}
            >
              <div className="flex items-start justify-between border-b p-5">
                <div>
                  <div className="text-lg font-semibold text-neutral-900">Refunded</div>
                  <div className="mt-1 text-xs text-neutral-600">Confirm the refund date and amount below.</div>
                </div>
                <button type="button" className={buttonClass()} onClick={() => setRefundCompleteOpen(false)}>
                  Close
                </button>
              </div>

              <div className="space-y-4 p-5">
                {refundCompleteError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {refundCompleteError}
                  </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <div className={fieldLabel()}>Date of Refund *</div>
                    <input
                      ref={refundCompleteDateRef}
                      className={inputClass()}
                      type="date"
                      value={refundCompleteDate}
                      onChange={(e) => setRefundCompleteDate(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <div className={fieldLabel()}>Total</div>
                    <input
                      className={[inputClass(), "bg-neutral-100 text-neutral-700"].join(" ")}
                      value={money(Number(refundCompleteTargetRow.refund_amount ?? 0))}
                      readOnly
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button type="button" className={buttonClass()} onClick={() => setRefundCompleteOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className={buttonClass(true)} disabled={refundCompleteBusy}>
                    {refundCompleteBusy ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {targetROIOpen ? (
        <div className={modalBackdrop()} onMouseDown={() => setTargetROIOpen(false)}>
          <div
            className="w-full max-w-md rounded-2xl border bg-white shadow-sm"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <form
              className="contents"
              onSubmit={(e) => {
                e.preventDefault();
                setTargetROI(parseDecimalOrZero(targetROIStr));
                setTargetROIOpen(false);
              }}
            >
              <div className="flex items-start justify-between border-b p-5">
                <div>
                  <div className="text-lg font-semibold text-neutral-900">Target ROI</div>
                  <div className="mt-1 text-xs text-neutral-600">
                    Set your target ROI percentage.
                  </div>
                </div>
                <button type="button" className={buttonClass()} onClick={() => setTargetROIOpen(false)}>
                  Close
                </button>
              </div>

              <div className="space-y-3 p-5">
                <div>
                  <div className={fieldLabel()}>Target ROI %</div>
                  <input
                    ref={targetROIRef}
                    className={inputClass()}
                    inputMode="decimal"
                    value={targetROIStr}
                    onChange={(e) => setTargetROIStr(sanitizeDecimalInput(e.target.value))}
                  />
                </div>

              <div className="flex justify-end gap-2">
                  <button type="button" className={buttonClass()} onClick={() => setTargetROIOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" autoFocus className={buttonClass(true)}>
                    Save
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      
{writtenOffDetailOpen && writtenOffDetailRow ? (
  <div className={modalBackdrop()} onMouseDown={() => setWrittenOffDetailOpen(false)}>
    <div
      className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border bg-white shadow-sm"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between border-b p-5">
        <div>
          <div className="text-lg font-semibold text-neutral-900">Write Off Details</div>
          <div className="mt-1 text-xs text-neutral-600">
            Review the full history for this written off item below.
          </div>
        </div>
        <button className={buttonClass()} onClick={() => setWrittenOffDetailOpen(false)}>
          Close
        </button>
      </div>

      <div className="space-y-4 p-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border p-4">
            <div className="mb-3 text-sm font-semibold text-neutral-900">Product Details</div>
            <div className="grid gap-y-2 text-sm text-neutral-800 sm:grid-cols-[140px_1fr]">
              <div className="font-semibold">Item ID:</div><div>{writtenOffDetailRow?.product?.product_code ?? "-"}</div>
              <div className="font-semibold">ASIN:</div><div>{writtenOffDetailRow?.product?.asin ?? "-"}</div>
              <div className="font-semibold">Brand:</div><div>{writtenOffDetailRow?.product?.brand ?? "-"}</div>
              <div className="font-semibold">Product:</div><div>{writtenOffDetailRow?.product?.product_name ?? "-"}</div>
              <div className="font-semibold">Barcode:</div><div>{writtenOffDetailRow?.product?.barcode ?? "-"}</div>
              <div className="font-semibold">Amazon Code:</div><div>{writtenOffDetailRow?.product?.amazon_code ?? "-"}</div>
              <div className="font-semibold">Shop:</div><div>{writtenOffDetailRow?.shop ?? "-"}</div>
              <div className="font-semibold">Tax Year:</div><div>{writtenOffDetailRow?.write_off_date ? computeUkTaxYear(writtenOffDetailRow.write_off_date) : (writtenOffDetailRow?.tax_year ?? "-")}</div>
              <div className="font-semibold">Status:</div><div>{statusLabel((writtenOffDetailRow?.status as StatusKey) ?? "written_off")}</div>
            </div>
          </div>

          <div className="rounded-2xl border p-4">
            <div className="mb-3 text-sm font-semibold text-neutral-900">Key Dates &amp; Movement</div>
            <div className="grid gap-y-2 text-sm text-neutral-800 sm:grid-cols-[150px_1fr]">
              <div className="font-semibold">Purchase Date:</div><div>{fmtDate(writtenOffDetailRow?.purchase_date ?? null)}</div>
              <div className="font-semibold">Delivery Date:</div><div>{fmtDate(writtenOffDetailRow?.delivery_date ?? null)}</div>
              <div className="font-semibold">Shipment Date:</div><div>{fmtDate(writtenOffDetailShipment?.shipment_date ?? null)}</div>
              <div className="font-semibold">Check-in Date:</div><div>{fmtDate(writtenOffDetailShipment?.checkin_date ?? null)}</div>
              <div className="font-semibold">Order Date:</div><div>{fmtDate(writtenOffDetailRow?.order_date ?? null)}</div>
              <div className="font-semibold">Shipment Box:</div><div>{writtenOffDetailRow?.shipment_box_id ?? "-"}</div>
              <div className="font-semibold">Sale Type:</div><div>{writtenOffDetailRow?.sale_type ?? "-"}</div>
              <div className="font-semibold">Write Off Date:</div><div>{fmtDate(writtenOffDetailRow?.write_off_date ?? null)}</div>
              <div className="font-semibold">Last Return Date:</div><div>{fmtDate(writtenOffDetailRow?.last_return_date ?? null)}</div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-neutral-900">Item Actions</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonClass()}
                onClick={() => {
                  setWrittenOffDetailOpen(false);
                  openRestoreModal(writtenOffDetailRow.id);
                }}
              >
                Restore Item
              </button>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.05fr_1.35fr]">
            <div className="rounded-xl border bg-neutral-50 p-4">
              <div className="text-sm font-semibold text-neutral-900">Cost Breakdown</div>
              <div className="mt-3 space-y-2 text-sm text-neutral-800">
                <div className="flex items-center justify-between"><span>Unit Cost</span><b>{money(writtenOffCostBreakdown.productCost)}</b></div>
                <div className="flex items-center justify-between"><span>Tax</span><b>{money(writtenOffCostBreakdown.taxCost)}</b></div>
                <div className="flex items-center justify-between"><span>Shipping</span><b>{money(writtenOffCostBreakdown.shippingCost)}</b></div>
                <div className="flex items-center justify-between"><span>Ship to Amazon</span><b>{money(writtenOffCostBreakdown.amazonInboundPerItem)}</b></div>
                <div className="flex items-center justify-between"><span>Amazon Fees</span><b>{money(writtenOffCostBreakdown.amazonFees)}</b></div>
                <div className="flex items-center justify-between"><span>Misc Cost</span><b>{money(writtenOffCostBreakdown.miscCost)}</b></div>
                <div className="flex items-center justify-between"><span>Return Fees</span><b>{money(writtenOffCostBreakdown.returnShippingCost)}</b></div>
                <div className="flex items-center justify-between"><span>FBM Shipping</span><b>{money(writtenOffCostBreakdown.fbmShippingCost)}</b></div>
                <div className="flex items-center justify-between"><span>Written Off Cost</span><b>{money(writtenOffCostBreakdown.writtenOffCost)}</b></div>
                <div className="flex items-center justify-between border-t pt-2"><span>Total Cost Basis</span><b>{money(writtenOffCostBreakdown.totalCostBasis)}</b></div>
              </div>
            </div>

            <div className="rounded-2xl border p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-neutral-900">Write Off Details</div>
                {!writtenOffEditMode ? (
                  <button
                    type="button"
                    className={miniBtn()}
                    onClick={() => setWrittenOffEditMode(true)}
                  >
                    Edit
                  </button>
                ) : null}
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-12">
                <div className="xl:col-span-12">
                  <div className={fieldLabel()}>Reason</div>
                  {writtenOffEditMode ? (
                    <ReasonAutocompleteInput
                      key={`${writtenOffDetailRow?.id ?? ""}-${writtenOffEditMode ? "edit" : "view"}-${writtenOffDetailParsed.reason}`}
                      value={writtenOffEditReason}
                      onChange={setWrittenOffEditReason}
                      options={writeOffReasonOptions}
                      placeholder="Start typing a reason"
                    />
                  ) : (
                    <input
                      className={inputClass()}
                      value={writtenOffDetailParsed.reason}
                      readOnly
                    />
                  )}
                </div>
                <div className="xl:col-span-6">
                  <div className={fieldLabel()}>Outcome</div>
                  {writtenOffEditMode ? (
                    <SelectField
                      value={writtenOffEditOutcome}
                      onChange={(value) =>
                        setWrittenOffEditOutcome(value as "none" | "dispose" | "return_to_me")
                      }
                      options={writeOffOutcomeOptions}
                    />
                  ) : (
                    <input className={inputClass()} value={writtenOffDetailParsed.outcome} readOnly />
                  )}
                </div>
                <div className="xl:col-span-6">
                  <div className={fieldLabel()}>Write Off Date</div>
                  <input
                    className={inputClass()}
                    type="date"
                    value={writtenOffEditMode ? writtenOffEditDate : (writtenOffDetailRow?.write_off_date ?? "")}
                    onChange={(e) => setWrittenOffEditDate(e.target.value)}
                    readOnly={!writtenOffEditMode}
                  />
                </div>
                <div className="xl:col-span-6">
                  <div className={fieldLabel()}>Write Off Cost (£)</div>
                  <input
                    className={inputClass()}
                    inputMode="decimal"
                    value={writtenOffEditMode ? writtenOffEditCostStr : Number(writtenOffDetailRow?.misc_fees ?? 0).toFixed(2)}
                    onChange={(e) => setWrittenOffEditCostStr(sanitizeDecimalInput(e.target.value))}
                    readOnly={!writtenOffEditMode}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border p-4">
          <div className="mb-3 text-sm font-semibold text-neutral-900">Current Calculations</div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-xl border bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">Write Off Cost</div>
              <div className="mt-1 text-2xl font-semibold text-neutral-900">
                {money(writtenOffCostBreakdown.writtenOffCost)}
              </div>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">Total Cost Basis</div>
              <div className="mt-1 text-2xl font-semibold text-neutral-900">
                {money(writtenOffCostBreakdown.totalCostBasis)}
              </div>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">Loss Value</div>
              <div className="mt-1 text-2xl font-semibold text-red-700">
                {money(writtenOffCostBreakdown.totalCostBasis)}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          {writtenOffEditMode ? (
            <>
              <button
                className={buttonClass()}
                type="button"
                onClick={() => {
                  setWrittenOffEditMode(false);
                  setWrittenOffEditReason(writtenOffDetailParsed.reason === "-" ? "" : writtenOffDetailParsed.reason);
                  setWrittenOffEditOutcome(
                    writtenOffDetailParsed.outcome.toLowerCase() === "disposed by amazon"
                      ? "dispose"
                      : writtenOffDetailParsed.outcome.toLowerCase() === "returned to me"
                        ? "return_to_me"
                        : "none"
                  );
                  setWrittenOffEditCostStr(String(Number(writtenOffDetailRow?.misc_fees ?? 0)));
                  setWrittenOffEditDate(writtenOffDetailRow?.write_off_date ?? todayISO());
                }}
                disabled={writtenOffEditBusy}
              >
                Cancel Edit
              </button>
              <button
                className={buttonClass(true)}
                type="button"
                onClick={saveWrittenOffDetails}
                disabled={writtenOffEditBusy}
              >
                {writtenOffEditBusy ? "Saving…" : "Save Changes"}
              </button>
            </>
          ) : (
            <button className={buttonClass()} type="button" onClick={() => setWrittenOffDetailOpen(false)}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  </div>
) : null}

{restoreOpen && restoreTargetId ? (
        <div className={modalBackdrop()} onMouseDown={() => setRestoreOpen(false)}>
          <div
            className="w-full max-w-lg rounded-2xl border bg-white shadow-sm"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <form
              className="contents"
              onSubmit={(e) => {
                e.preventDefault();
                confirmRestore();
              }}
            >
              <div className="flex items-start justify-between border-b p-5">
                <div>
                  <div className="text-lg font-semibold text-neutral-900">Restore Item</div>
                  <div className="mt-1 text-xs text-neutral-600">
                    {(purchases.find((p) => p.id === restoreTargetId)?.status === "awaiting_refund" ||
                      purchases.find((p) => p.id === restoreTargetId)?.status === "refunded")
                      ? "Are you sure you want to restore this purchase to awaiting delivery?"
                      : "Choose the status to restore this item to."}
                  </div>
                </div>
                <button type="button" className={buttonClass()} onClick={() => setRestoreOpen(false)}>
                  Close
                </button>
              </div>

              <div className="space-y-3 p-5">
                {(purchases.find((p) => p.id === restoreTargetId)?.status === "awaiting_refund" ||
                  purchases.find((p) => p.id === restoreTargetId)?.status === "refunded") ? (
                  <div className="flex justify-end gap-2">
                    <button type="button" className={buttonClass()} onClick={() => setRestoreOpen(false)}>
                      No
                    </button>
                    <button type="submit" autoFocus className={buttonClass(true)}>
                      Yes
                    </button>
                  </div>
                ) : (
                  <>
                    <div>
                      <div className={fieldLabel()}>Set status to</div>
                      <SelectField
                        value={restoreStatus}
                        onChange={(value) => setRestoreStatus(value as Exclude<StatusKey, "all">)}
                        options={restoreStatusOptions}
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <button type="button" className={buttonClass()} onClick={() => setRestoreOpen(false)}>
                        Cancel
                      </button>
                      <button type="submit" autoFocus className={buttonClass(true)}>
                        Restore
                      </button>
                    </div>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editBoxOpen ? (
        <div className={modalBackdrop()} onMouseDown={() => setEditBoxOpen(false)}>
          <div
            className="w-full max-w-lg rounded-2xl border bg-white shadow-sm"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <form
              className="contents"
              onSubmit={(e) => {
                e.preventDefault();
                saveEditBoxQty();
              }}
            >
              <div className="flex items-start justify-between border-b p-5">
                <div>
                  <div className="text-lg font-semibold text-neutral-900">Edit units in box</div>
                  <div className="mt-1 text-xs text-neutral-600">
                    ASIN: <b>{editBoxAsin}</b>
                  </div>
                </div>
                <button type="button" className={buttonClass()} onClick={() => setEditBoxOpen(false)}>
                  Close
                </button>
              </div>

              <div className="space-y-3 p-5">
                <div>
                  <div className={fieldLabel()}>Units in box</div>
                  <input
                    ref={editBoxRef}
                    className={inputClass()}
                    inputMode="numeric"
                    value={editBoxTargetQtyStr}
                    onChange={(e) => setEditBoxTargetQtyStr(e.target.value.replace(/[^\d]/g, ""))}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button type="button" className={buttonClass()} onClick={() => setEditBoxOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" autoFocus className={buttonClass(true)}>
                    Save
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {finaliseStep !== 0 ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/30 p-4" onMouseDown={() => !finaliseBusy && setFinaliseStep(0)}>
          <div
            className="w-full max-w-lg rounded-2xl border bg-white shadow-sm"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <form
              className="contents"
              onSubmit={(e) => {
                e.preventDefault();
                if (finaliseStep === 1) confirmUnitsStep();
                if (finaliseStep === 2) confirmBoxDetailsStep();
                if (finaliseStep === 3) confirmShipmentDateAndComplete();
              }}
            >
              <div className="flex items-start justify-between border-b p-5">
                <div>
                  <div className="text-lg font-semibold text-neutral-900">Finalise box</div>
                  <div className="mt-1 text-xs text-neutral-600">
                    Current box: <b>{currentBoxNo ?? "-"}</b>
                  </div>
                </div>
                <button
                  type="button"
                  className={buttonClass()}
                  onClick={() => !finaliseBusy && setFinaliseStep(0)}
                >
                  Close
                </button>
              </div>

              <div className="space-y-3 p-5">
                {finaliseErr ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {finaliseErr}
                  </div>
                ) : null}

                {finaliseStep === 1 ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className={fieldLabel()}>Selected units</div>
                        <input className={inputClass()} value={String(unitsInBox)} disabled />
                      </div>

                      <div>
                        <div className={fieldLabel()}>Amazon units *</div>
                        <input
                          ref={finaliseUnitsRef}
                          className={inputClass()}
                          inputMode="numeric"
                          value={amazonUnitsStr}
                          onChange={(e) => setAmazonUnitsStr(e.target.value.replace(/[^\d]/g, ""))}
                          placeholder="Type Amazon units"
                        />
                      </div>
                    </div>

                    {allFinaliseChecklistScanned ? (
                      <div className="space-y-3">
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
                          All items scanned and box ready to be finalised
                        </div>

                        {finaliseConfirmBarcodeValue ? (
                          <div className="rounded-xl border bg-neutral-50 p-3">
                            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-700">
                              Scan to auto-fill box
                            </div>
                            <Code39Barcode value={finaliseConfirmBarcodeValue} className="border-0 bg-transparent p-0" />
                          </div>
                        ) : null}
                      </div>
                    ) : finaliseChecklistRows.length > 0 ? (
                      <div className="rounded-xl border bg-white p-3">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-700">
                            Items waiting to be scanned
                          </div>
                          <div className="text-xs text-neutral-600">
                            {finaliseCheckedIds.length}/{finaliseChecklistRows.length} checked
                          </div>
                        </div>

                        <div className="space-y-2">
                          {finaliseChecklistRows.map((row, index) => {
                            const checked = finaliseCheckedIds.includes(row.id);
                            const itemBarcode = row.product?.amazon_code || row.product?.barcode || "";
                            return (
                              <button
                                type="button"
                                key={row.id}
                                onClick={() => {
                                  setFinaliseCheckedIds((prev) =>
                                    prev.includes(row.id)
                                      ? prev.filter((id) => id !== row.id)
                                      : [...prev, row.id]
                                  );
                                }}
                                className={[
                                  "flex w-full items-start gap-3 rounded-xl border px-3 py-2 text-left transition",
                                  checked
                                    ? "border-emerald-300 bg-emerald-50"
                                    : "border-neutral-200 bg-neutral-50 hover:bg-neutral-100",
                                ].join(" ")}
                              >
                                <div
                                  className={[
                                    "mt-0.5 flex h-5 w-5 items-center justify-center rounded border text-xs font-bold",
                                    checked
                                      ? "border-emerald-600 bg-emerald-600 text-white"
                                      : "border-neutral-400 bg-white text-transparent",
                                  ].join(" ")}
                                >
                                  ✓
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="truncate text-sm font-semibold text-neutral-900">
                                      {index + 1}. {row.product?.asin ?? "-"}
                                    </div>
                                    <div className={["text-xs font-medium", checked ? "text-emerald-700" : "text-neutral-500"].join(" ")}>
                                      {checked ? "Scanned" : "Waiting"}
                                    </div>
                                  </div>

                                  <div className="mt-1 text-xs text-neutral-700">
                                    {row.product?.brand ?? "-"} • {row.product?.product_name ?? "-"}
                                  </div>

                                  <div className="mt-1 text-[11px] text-neutral-500">
                                    {itemBarcode ? `Scan: ${itemBarcode}` : "No barcode saved"}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        className={buttonClass()}
                        onClick={openPacklistPrint}
                      >
                        Packlist
                      </button>
                      <div className="flex gap-2">
                        <button type="button" className={buttonClass()} onClick={() => setFinaliseStep(0)}>
                          Cancel
                        </button>
                        <button type="submit" autoFocus className={buttonClass(true)}>
                          Confirm units
                        </button>
                      </div>
                    </div>
                  </>
                ) : null}

                {finaliseStep === 2 ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <div className={fieldLabel()}>Units</div>
                        <input className={inputClass()} value={String(unitsInBox)} disabled />
                      </div>

                      <div>
                        <div className={fieldLabel()}>Cost (£) *</div>
                        <input
                          ref={finaliseCostRef}
                          className={inputClass()}
                          inputMode="decimal"
                          value={boxCostStr}
                          onChange={(e) => setBoxCostStr(sanitizeDecimalInput(e.target.value))}
                          placeholder="0.00"
                        />
                      </div>

                      <div>
                        <div className={fieldLabel()}>Weight (kg) *</div>
                        <input
                          className={inputClass()}
                          inputMode="decimal"
                          value={boxWeightKgStr}
                          onChange={(e) => setBoxWeightKgStr(sanitizeDecimalInput(e.target.value))}
                          placeholder="0.00"
                        />
                      </div>

                      <div>
                        <div className={fieldLabel()}>Tracking no *</div>
                        <input
                          className={inputClass()}
                          value={boxTrackingNo}
                          onChange={(e) => setBoxTrackingNo(e.target.value)}
                          placeholder="Required"
                        />
                      </div>

                      <div>
                        <div className={fieldLabel()}>Carrier *</div>
                        <input
                          className={inputClass()}
                          value={boxCarrier}
                          onChange={(e) => setBoxCarrier(titleCaseEveryWord(e.target.value))}
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2">
                      <button type="button" className={buttonClass()} onClick={() => setFinaliseStep(0)}>
                        Cancel
                      </button>
                      <button type="submit" autoFocus className={buttonClass(true)}>
                        Confirm details
                      </button>
                    </div>
                  </>
                ) : null}

                {finaliseStep === 3 ? (
                  <>
                    <div>
                      <div className={fieldLabel()}>Shipment date *</div>
                      <input
                        ref={finaliseDateRef}
                        className={inputClass()}
                        type="date"
                        value={boxShipDate}
                        min={(boxRows
                          .map((row) => String(row.delivery_date ?? "").trim())
                          .filter(Boolean)
                          .sort()
                          .slice(-1)[0]) || undefined}
                        max={todayISO()}
                        onChange={(e) => {
                          e.currentTarget.setCustomValidity("");
                          setBoxShipDate(e.target.value);
                        }}
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className={buttonClass()}
                        onClick={() => setFinaliseStep(0)}
                        disabled={finaliseBusy}
                      >
                        Cancel
                      </button>
                      <button type="submit" className={buttonClass(true)} disabled={finaliseBusy}>
                        {finaliseBusy ? "Saving…" : "Confirm & Complete"}
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </form>
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
                confirmCheckin();
              }}
            >
              <div className="flex items-start justify-between border-b p-5">
                <div>
                  <div className="text-lg font-semibold text-neutral-900">Check-in at Amazon</div>
                  <div className="mt-1 text-xs text-neutral-600">
                    Enter the date Amazon checked this box in.
                  </div>
                </div>
                <button type="button" className={buttonClass()} onClick={() => setCheckinOpen(false)}>
                  Close
                </button>
              </div>

              <div className="space-y-3 p-5">
                <div>
                  <div className={fieldLabel()}>Check-in date *</div>
                  <input
                    ref={checkinRef}
                    className={inputClass()}
                    type="date"
                    value={checkinDate}
                    min={
                      String(
                        shipments.find((s) => s.id === checkinShipmentId)?.shipment_date ?? ""
                      ).trim() || undefined
                    }
                    max={todayISO()}
                    onChange={(e) => {
                      e.currentTarget.setCustomValidity("");
                      setCheckinDate(e.target.value);
                    }}
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
                    {checkinBusy ? "Saving…" : "Confirm"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deliveredOpen && deliveredTargetIds.length > 0 ? (
        <div
          className={modalBackdrop()}
          onMouseDown={() => {
            if (deliveredBusy) return;
            closeDeliveredModal();
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border bg-white shadow-sm"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b p-5">
              <div>
                <div className="text-lg font-semibold text-neutral-900">Set Delivery Date</div>
                <div className="mt-1 text-xs text-neutral-600">
                  Press Enter to save the pre-filled date, or change it first. Press Esc to close.
                </div>
                <div className="mt-2 text-xs text-neutral-500">
                  {deliveredTargetIds.length > 1
                    ? `${deliveredTargetIds.length} selected orders will be marked as delivered.`
                    : "1 selected order will be marked as delivered."}
                </div>
              </div>
              <button
                type="button"
                className={buttonClass()}
                onClick={() => {
                  if (deliveredBusy) return;
                  closeDeliveredModal();
                }}
                disabled={deliveredBusy}
              >
                Close
              </button>
            </div>

            <form
              className="space-y-4 p-5"
              onSubmit={(e) => {
                e.preventDefault();
                confirmDeliveredDate();
              }}
            >
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className={fieldLabel()}>Delivery Date</div>
                  <button
                    type="button"
                    className="text-xs text-neutral-700 underline"
                    onClick={() => setDeliveredDate(todayISO())}
                    disabled={deliveredBusy}
                  >
                    Today
                  </button>
                </div>
                <input
                  ref={deliveredDateRef}
                  className={inputClass()}
                  type="date"
                  value={deliveredDate}
                  min={(() => {
                    const targetIds = deliveredTargetIds.length > 0
                      ? deliveredTargetIds
                      : deliveredTargetId
                        ? [deliveredTargetId]
                        : [];
                    const minPurchaseDate = purchases
                      .filter((p) => targetIds.includes(p.id))
                      .map((p) => String(p.purchase_date ?? "").trim())
                      .filter(Boolean)
                      .sort()[0];
                    return minPurchaseDate || undefined;
                  })()}
                  max={todayISO()}
                  onChange={(e) => {
                    e.currentTarget.setCustomValidity("");
                    setDeliveredDate(e.target.value);
                    if (deliveredError) setDeliveredError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape" && !deliveredBusy) {
                      e.preventDefault();
                      e.stopPropagation();
                      closeDeliveredModal();
                    }
                  }}
                  required
                />
              </div>

              {deliveredError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {deliveredError}
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className={buttonClass()}
                  onClick={() => {
                    if (deliveredBusy) return;
                    closeDeliveredModal();
                  }}
                  disabled={deliveredBusy}
                >
                  Cancel
                </button>
                <button type="submit" className={buttonClass(true)} disabled={deliveredBusy}>
                  {deliveredBusy ? "Saving…" : "Save Delivery Date"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {finaliseItemNotInBoxOpen ? (
        <div
          className={modalBackdrop()}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setFinaliseItemNotInBoxOpen(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border bg-white shadow-sm"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <form
              className="space-y-4 p-5"
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setFinaliseItemNotInBoxOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setFinaliseItemNotInBoxOpen(false);
                }
              }}
            >
              <div>
                <div className="text-lg font-semibold text-neutral-900">Item is not in the box</div>
                <div className="mt-1 text-sm text-neutral-600">
                  Item is not in the box.
                </div>
              </div>

              <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3">
                <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Scanned Value
                </div>
                <div className="mt-1 break-all text-sm font-medium text-neutral-900">
                  {finaliseItemNotInBoxValue || "-"}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button type="button" className={buttonClass(false)}>
                  Add item to items waiting to be scanned
                </button>
                <button type="submit" className={buttonClass(true)} autoFocus>
                  OK
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {barcodeNotFoundOpen ? (
        <div
          className={modalBackdrop()}
          onMouseDown={() => closeBarcodeNotFoundModal()}
        >
          <div
            className="w-full max-w-md rounded-2xl border bg-white shadow-sm"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <form
              className="space-y-4 p-5"
              onSubmit={(e) => {
                e.preventDefault();
                closeBarcodeNotFoundModal();
              }}
            >
              <div>
                <div className="text-lg font-semibold text-neutral-900">Barcode Not Found</div>
                <div className="mt-1 text-sm text-neutral-600">
                  {barcodeNotFoundContext === "processing"
                    ? "This item is not ready to be shipped."
                    : "The scanned barcode was not found in Awaiting Delivery items."}
                </div>
              </div>

              <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3">
                <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Scanned Value
                </div>
                <div className="mt-1 break-all text-sm font-medium text-neutral-900">
                  {barcodeNotFoundValue || "-"}
                </div>
              </div>

              <div className="text-sm text-neutral-600">Please try again.</div>

              <div className="flex justify-end">
                <button type="submit" className={buttonClass(true)} autoFocus>
                  OK
                </button>
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
                  Box: <b>{shipDetail.shipment_box_no ?? "-"}</b>
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
                  <div className="text-sm text-neutral-900">{fmtDate(shipDetail.shipment_date)}</div>
                </div>
                <div>
                  <div className={fieldLabel()}>Check-in date</div>
                  <div className="text-sm text-neutral-900">{fmtDate(shipDetail.checkin_date)}</div>
                </div>
                <div>
                  <div className={fieldLabel()}>Cost</div>
                  <div className="text-sm text-neutral-900">
                    {shipDetail.cost == null ? "-" : money(Number(shipDetail.cost))}
                  </div>
                </div>
                <div>
                  <div className={fieldLabel()}>Box value</div>
                  <div className="text-sm text-neutral-900">
                    {shipDetail.box_value == null ? "-" : money(Number(shipDetail.box_value))}
                  </div>
                </div>
                <div>
                  <div className={fieldLabel()}>Units</div>
                  <div className="text-sm text-neutral-900">
                    {Number(shipDetail.units ?? shipDetail.total_units ?? 0) || "-"}
                  </div>
                </div>
                <div>
                  <div className={fieldLabel()}>Carrier / Tracking</div>
                  <div className="text-sm text-neutral-900">
                    {(shipDetail.carrier ?? "-") + " • " + (shipDetail.tracking_no ?? "-")}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-neutral-50 p-4">
                <div className="text-sm font-semibold text-neutral-900">Items in this box</div>
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

      {soldOpen && soldTargetId ? (
        <div className={modalBackdrop()} onMouseDown={() => setSoldOpen(false)}>
          <div
            className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border bg-white shadow-sm"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b p-5">
              <div>
                <div className="text-lg font-semibold text-neutral-900">
                  {soldTargetRow?.status === "sold"
                    ? "Sale Details"
                    : soldMode === "FBM"
                      ? "Mark as FBM Sold"
                      : "Mark as FBA Sold"}
                </div>
                <div className="mt-1 text-xs text-neutral-600">
                  {soldTargetRow?.status === "sold"
                    ? "Review the full history for this item below. Only the sale section is editable here."
                    : "Complete the sale details below to calculate payout, profit/loss, and ROI."}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" className={buttonClass()} onClick={() => openSoldPrintView("print")}>
                  Print
                </button>
                <button type="button" className={buttonClass()} onClick={() => openSoldPrintView("pdf")}>
                  Export to PDF
                </button>
                <button className={buttonClass()} onClick={() => setSoldOpen(false)}>
                  Close
                </button>
              </div>
            </div>

            <form
              ref={soldPrintRef}
              className="space-y-4 p-5"
              onSubmit={(e) => {
                e.preventDefault();
                confirmSold();
              }}
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border p-4">
                  <div className="mb-3 text-sm font-semibold text-neutral-900">Product Details</div>
                  <div className="grid gap-y-2 text-sm text-neutral-800 sm:grid-cols-[140px_1fr]">
                    <div className="font-semibold">Order Number:</div><div>{soldTargetRow?.order_no ?? "-"}</div>
                    <div className="font-semibold">Item ID:</div><div>{soldTargetRow?.item_no ?? "-"}</div>
                    <div className="font-semibold">ASIN:</div><div>{soldTargetRow?.product?.asin ?? "-"}</div>
                    <div className="font-semibold">Brand:</div><div>{soldTargetRow?.product?.brand ?? "-"}</div>
                    <div className="font-semibold">Product:</div><div>{soldTargetRow?.product?.product_name ?? "-"}</div>
                    <div className="font-semibold">Barcode:</div><div>{soldTargetRow?.product?.barcode ?? "-"}</div>
                    <div className="font-semibold">Amazon Code:</div><div>{soldTargetRow?.product?.amazon_code ?? "-"}</div>
                    <div className="font-semibold">Shop:</div><div>{soldTargetRow?.shop ?? "-"}</div>
                    <div className="font-semibold">Tax Year:</div><div>{soldTargetRow?.tax_year ?? "-"}</div>
                    <div className="font-semibold">Status:</div><div>{statusLabel((soldTargetRow?.status as StatusKey) ?? "sold")}</div>
                  </div>
                </div>

                <div className="rounded-2xl border p-4">
                  <div className="mb-3 text-sm font-semibold text-neutral-900">Key Dates &amp; Movement</div>
                  <div className="grid gap-y-2 text-sm text-neutral-800 sm:grid-cols-[150px_1fr]">
                    <div className="font-semibold">Purchase Date:</div><div>{fmtDate(soldTargetRow?.purchase_date ?? null)}</div>
                    <div className="font-semibold">Delivery Date:</div><div>{fmtDate(soldTargetRow?.delivery_date ?? null)}</div>
                    {soldMode === "FBM" ? (
                      <>
                        <div className="font-semibold">Check-in Date:</div><div>N/A</div>
                        <div className="font-semibold">Order Date:</div><div>{fmtDate((soldOrderDate || soldTargetRow?.order_date) ?? null)}</div>
                        <div className="font-semibold">Carrier:</div><div>{soldEditMode ? (soldFbmCarrierStr || "-") : (soldTargetRow?.tracking_no ?? "-")}</div>
                        <div className="font-semibold">Tracking Number:</div><div>{soldEditMode ? (soldFbmTrackingNo || "-") : (soldTargetRow?.fbm_tracking_no ?? "-")}</div>
                        <div className="font-semibold">Sale Type:</div><div>{soldTargetRow?.sale_type ?? soldMode}</div>
                        <div className="font-semibold">Last Return Date:</div><div>{fmtDate(soldTargetRow?.last_return_date ?? null)}</div>
                      </>
                    ) : (
                      <>
                        <div className="font-semibold">Shipment Date:</div><div>{fmtDate(soldTargetShipment?.shipment_date ?? null)}</div>
                        <div className="font-semibold">Check-in Date:</div><div>{fmtDate(soldTargetShipment?.checkin_date ?? null)}</div>
                        <div className="font-semibold">Order Date:</div><div>{fmtDate((soldOrderDate || soldTargetRow?.order_date) ?? null)}</div>
                        <div className="font-semibold">Shipment Box:</div><div>{soldTargetRow?.shipment_box_id ?? "-"}</div>
                        <div className="font-semibold">Sale Type:</div><div>{soldTargetRow?.sale_type ?? soldMode}</div>
                        <div className="font-semibold">Last Return Date:</div><div>{fmtDate(soldTargetRow?.last_return_date ?? null)}</div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-neutral-900">Item Actions</div>
                  <div className="flex flex-wrap gap-2">
                    {soldTargetRow?.status === "sold" ? (
                      <button
                        type="button"
                        className={buttonClass()}
                        onClick={() => {
                          setSoldOpen(false);
                          openReturn(soldTargetId);
                        }}
                      >
                        Returned Item
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={buttonClass()}
                      onClick={() => {
                        setSoldOpen(false);
                        openWriteOff(soldTargetId);
                      }}
                    >
                      Write Off
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[1.05fr_1.35fr]">
                  <div className="rounded-xl border bg-neutral-50 p-4">
                    <div className="text-sm font-semibold text-neutral-900">Cost Breakdown</div>
                    <div className="mt-3 space-y-2 text-sm text-neutral-800">
                      <div className="flex items-center justify-between"><span>Unit Cost</span><b>{money(soldCostBreakdown.productCost)}</b></div>
                      <div className="flex items-center justify-between"><span>Tax</span><b>{money(soldCostBreakdown.taxCost)}</b></div>
                      <div className="flex items-center justify-between"><span>Shipping</span><b>{money(soldCostBreakdown.shippingCost)}</b></div>
                      <div className="flex items-center justify-between"><span>Ship to Amazon</span><b>{money(soldCostBreakdown.amazonInboundPerItem)}</b></div>
                      <div className="flex items-center justify-between"><span>Amazon Fees</span><b>{money(displayedSoldAmazonFees)}</b></div>
                      <div className="flex items-center justify-between"><span>Misc Cost</span><b>{money(displayedSoldMiscCost)}</b></div>
                      <div className="flex items-center justify-between"><span>Return Fees</span><b>{money(soldCostBreakdown.returnShippingCost)}</b></div>
                      <div className="flex items-center justify-between"><span>FBM Shipping</span><b>{money(displayedSoldFbmShipping)}</b></div>
                      <div className="flex items-center justify-between border-t pt-2"><span>Total Cost Basis</span><b>{money(displayedSoldTotalCost)}</b></div>
                    </div>
                  </div>

                  <div className="rounded-2xl border p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-neutral-900">{soldTargetRow?.status === "sold" ? (soldEditMode ? "Edit Sale" : "Sale Details") : "Edit Sale"}</div>
                      {soldTargetRow?.status === "sold" && !soldEditMode ? (
                        <button
                          type="button"
                          className={miniBtn()}
                          onClick={() => setSoldEditMode(true)}
                        >
                          Edit
                        </button>
                      ) : null}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-12">
                      <div className="xl:col-span-4">
                        <div className={fieldLabel()}>Order Date</div>
                        <input
                          className={inputClass()}
                          type="date"
                          value={soldOrderDate}
                          min={soldTargetRow?.purchase_date ?? undefined}
                          onChange={(e) => setSoldOrderDate(e.target.value)}
                          disabled={soldTargetRow?.status === "sold" && !soldEditMode}
                        />
                      </div>

                      <div className="xl:col-span-4">
                        <div className={fieldLabel()}>Sold Price (£) *</div>
                        <input
                          ref={soldAmountRef}
                          className={inputClass()}
                          inputMode="decimal"
                          value={soldAmountStr}
                          onChange={(e) => setSoldAmountStr(sanitizeDecimalInput(e.target.value))}
                          placeholder="0.00"
                          disabled={soldTargetRow?.status === "sold" && !soldEditMode}
                        />
                      </div>

                      {soldMode !== "FBM" ? (
                        <>
                          <div className="xl:col-span-4">
                            <div className={fieldLabel()}>Amazon Fees (£) *</div>
                            <input
                              className={inputClass()}
                              inputMode="decimal"
                              value={soldAmazonFeesStr}
                              onChange={(e) => setSoldAmazonFeesStr(sanitizeDecimalInput(e.target.value))}
                              placeholder="0.00"
                              disabled={soldTargetRow?.status === "sold" && !soldEditMode}
                            />
                          </div>

                          <div className="xl:col-span-12">
                            <div className={fieldLabel()}>Miscellaneous Cost (£)</div>
                            <input
                              className={inputClass()}
                              inputMode="decimal"
                              value={
                                soldTargetRow?.status === "sold" && !soldEditMode
                                  ? Number(soldTargetRow?.misc_fees ?? 0).toFixed(2)
                                  : soldMiscFeesStr
                              }
                              onChange={(e) => setSoldMiscFeesStr(sanitizeDecimalInput(e.target.value))}
                              placeholder="0.00"
                              disabled={soldTargetRow?.status === "sold" && !soldEditMode}
                            />
                          </div>

                          <div className="xl:col-span-12">
                            <div className={fieldLabel()}>Total Amazon Payout (£)</div>
                            <input
                              className={inputClass()}
                              inputMode="decimal"
                              value={displayedAmazonPayout.toFixed(2)}
                              readOnly
                              placeholder="0.00"
                            />
                          </div>
                        </>
                      ) : null}

                      {soldMode === "FBM" ? (
                        <>
                          <div className="xl:col-span-4">
                            <div className={fieldLabel()}>Amazon Fees (£) *</div>
                            <input
                              className={inputClass()}
                              inputMode="decimal"
                              value={soldAmazonFeesStr}
                              onChange={(e) => setSoldAmazonFeesStr(sanitizeDecimalInput(e.target.value))}
                              placeholder="0.00"
                              disabled={soldTargetRow?.status === "sold" && !soldEditMode}
                            />
                          </div>

                          <div className="xl:col-span-4">
                            <div className={fieldLabel()}>Ship £ *</div>
                            <input
                              className={inputClass()}
                              inputMode="decimal"
                              value={soldFbmShippingFeeStr}
                              onChange={(e) => setSoldFbmShippingFeeStr(sanitizeDecimalInput(e.target.value))}
                              placeholder="0.00"
                              disabled={soldTargetRow?.status === "sold" && !soldEditMode}
                            />
                          </div>

                          <div className="xl:col-span-4">
                            <div className={fieldLabel()}>Carrier *</div>
                            <input
                              className={inputClass()}
                              value={soldFbmCarrierStr}
                              onChange={(e) => setSoldFbmCarrierStr(e.target.value)}
                              placeholder="Carrier"
                              disabled={soldTargetRow?.status === "sold" && !soldEditMode}
                            />
                          </div>

                          <div className="xl:col-span-4">
                            <div className={fieldLabel()}>Tracking Number *</div>
                            <input
                              className={inputClass()}
                              value={soldFbmTrackingNo}
                              onChange={(e) => setSoldFbmTrackingNo(e.target.value)}
                              placeholder="Tracking no"
                              disabled={soldTargetRow?.status === "sold" && !soldEditMode}
                            />
                          </div>

                          <div className="xl:col-span-12">
                            <div className={fieldLabel()}>Miscellaneous Cost (£)</div>
                            <input
                              className={inputClass()}
                              inputMode="decimal"
                              value={
                                soldTargetRow?.status === "sold" && !soldEditMode
                                  ? Number(soldTargetRow?.misc_fees ?? 0).toFixed(2)
                                  : soldMiscFeesStr
                              }
                              onChange={(e) => setSoldMiscFeesStr(sanitizeDecimalInput(e.target.value))}
                              placeholder="0.00"
                              disabled={soldTargetRow?.status === "sold" && !soldEditMode}
                            />
                          </div>

                          <div className="xl:col-span-12">
                            <div className={fieldLabel()}>Total Cost (£)</div>
                            <input
                              className={inputClass()}
                              inputMode="decimal"
                              value={displayedSoldTotalCost.toFixed(2)}
                              readOnly
                              placeholder="0.00"
                              disabled={soldTargetRow?.status === "sold" && !soldEditMode}
                            />
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border p-4">
                <div className="mb-3 text-sm font-semibold text-neutral-900">Current Calculations</div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-xl border bg-white p-4">
                    <div className="text-xs uppercase tracking-wide text-neutral-500">Sold Price</div>
                    <div className="mt-1 text-2xl font-semibold text-neutral-900">{money(parseDecimalOrZero(soldAmountStr))}</div>
                  </div>
                  <div className="rounded-xl border bg-white p-4">
                    <div className="text-xs uppercase tracking-wide text-neutral-500">Total Cost</div>
                    <div className="mt-1 text-2xl font-semibold text-neutral-900">
                      {money(displayedSoldTotalCost)}
                    </div>
                  </div>
                  <div className="rounded-xl border bg-white p-4">
                    <div className="text-xs uppercase tracking-wide text-neutral-500">Amazon Payout</div>
                    <div className="mt-1 text-2xl font-semibold text-neutral-900">{money(displayedAmazonPayout)}</div>
                  </div>
                  <div className="rounded-xl border bg-white p-4">
                    <div className="text-xs uppercase tracking-wide text-neutral-500">Profit / Loss</div>
                    <div className={["mt-1 text-2xl font-semibold", profitLossTextClass(displayedProfitLoss)].join(" ")}>
                      {money(displayedProfitLoss)}
                    </div>
                  </div>
                  <div className="rounded-xl border bg-white p-4">
                    <div className="text-xs uppercase tracking-wide text-neutral-500">ROI</div>
                    <div className={["mt-1 text-2xl font-semibold", roiTextClass(displayedROI, targetROI)].join(" ")}>
                      {displayedROI.toFixed(2)}%
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                {soldTargetRow?.status === "sold" && !soldEditMode ? (
                  <>
                    <button className={buttonClass()} type="button" onClick={() => setSoldOpen(false)}>
                      Close
                    </button>
                    <button
                      className={buttonClass(true)}
                      type="button"
                      onClick={() => setSoldEditMode(true)}
                    >
                      Edit Sale
                    </button>
                  </>
                ) : soldTargetRow?.status === "sold" ? (
                  <>
                    <button className={buttonClass()} type="button" onClick={cancelSoldEdit}>
                      Cancel Edit
                    </button>
                    <button className={buttonClass(true)} type="submit" disabled={soldBusy}>
                      {soldBusy ? "Saving…" : "Save Changes"}
                    </button>
                  </>
                ) : (
                  <>
                    <button className={buttonClass()} type="button" onClick={() => setSoldOpen(false)}>
                      Cancel
                    </button>
                    <button className={buttonClass(true)} type="submit" disabled={soldBusy}>
                      {soldBusy ? "Saving…" : "Confirm Sold"}
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {returnOpen && returnTargetId ? (
        <div className={modalBackdrop()} onMouseDown={() => setReturnOpen(false)}>
          <div
            className="w-full max-w-lg rounded-2xl border bg-white shadow-sm"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <form
              className="contents"
              onSubmit={(e) => {
                e.preventDefault();
                confirmReturn();
              }}
            >
              <div className="flex items-start justify-between border-b p-5">
                <div>
                  <div className="text-lg font-semibold text-neutral-900">Returned Item</div>
                  <div className="mt-1 text-xs text-neutral-600">
                    Enter the return date and return cost. Both fields are required before saving.
                  </div>
                </div>
                <button type="button" className={buttonClass()} onClick={() => setReturnOpen(false)}>
                  Close
                </button>
              </div>

              <div className="space-y-3 p-5">
                <div>
                  <div className={fieldLabel()}>Return Date *</div>
                  <input
                    className={inputClass()}
                    type="date"
                    value={returnDate}
                    min={returnTargetRow?.order_date ?? undefined}
                    onChange={(e) => setReturnDate(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <div className={fieldLabel()}>Return Cost (£) *</div>
                  <input
                    ref={returnRef}
                    className={inputClass()}
                    inputMode="decimal"
                    value={returnCostStr}
                    onChange={(e) => setReturnCostStr(sanitizeDecimalInput(e.target.value))}
                    placeholder="0.00"
                    required
                  />
                </div>

                <div className="text-xs text-neutral-600">
                  Last sold date: {fmtDate(returnTargetRow?.order_date ?? null)}
                </div>

                <div className="flex justify-end gap-2">
                  <button type="button" className={buttonClass()} onClick={() => setReturnOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className={buttonClass(true)} disabled={returnBusy}>
                    {returnBusy ? "Saving…" : "Save Return"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {writeOffOpen && selectedPurchaseId ? (
        <div className={modalBackdrop()} onMouseDown={() => setWriteOffOpen(false)}>
          <div
            className="w-full max-w-lg rounded-2xl border bg-white shadow-sm"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <form
              className="contents"
              onSubmit={(e) => {
                e.preventDefault();
                confirmWriteOff();
              }}
            >
              <div className="flex items-start justify-between border-b p-5">
                <div>
                  <div className="text-lg font-semibold text-neutral-900">Write Off</div>
                  <div className="mt-1 text-xs text-neutral-600">
                    Start typing to reuse a previous reason, or type a new one.
                  </div>
                </div>
                <button type="button" className={buttonClass()} onClick={() => setWriteOffOpen(false)}>
                  Close
                </button>
              </div>

              <div className="space-y-3 p-5">
                <div>
                  <div className={fieldLabel()}>Reason *</div>
                  <ReasonAutocompleteInput
                    inputRef={writeOffRef}
                    value={writeOffReasonText}
                    onChange={setWriteOffReasonText}
                    options={writeOffReasonOptions}
                    placeholder="Start typing a reason"
                  />
                </div>

                <div>
                  <div className={fieldLabel()}>Outcome</div>
                  <SelectField
                    value={writeOffOutcome}
                    onChange={(value) =>
                      setWriteOffOutcome(value as "none" | "dispose" | "return_to_me")
                    }
                    options={writeOffOutcomeOptions}
                  />
                </div>

                <div>
                  <div className={fieldLabel()}>Write Off Date</div>
                  <input
                    className={inputClass()}
                    type="date"
                    value={writeOffDate}
                    onChange={(e) => setWriteOffDate(e.target.value)}
                    max={todayISO()}
                  />
                </div>

                <div>
                  <div className={fieldLabel()}>Extra cost (£)</div>
                  <input
                    className={inputClass()}
                    inputMode="decimal"
                    value={writeOffExtraCostStr}
                    onChange={(e) => setWriteOffExtraCostStr(sanitizeDecimalInput(e.target.value))}
                    placeholder="0.00"
                  />
                  <div className="mt-1 text-[11px] text-neutral-500">
                    This gets added to Written Off £ and stays accumulative.
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button type="button" className={buttonClass()} onClick={() => setWriteOffOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" autoFocus className={buttonClass(true)}>
                    Confirm Write Off
                  </button>
                </div>
              </div>
            </form>
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
                          setCatBarcode("");
                          setCatAmazonBarcode("");
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

                <div className="grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-5">
                    <div>
                      <div className={fieldLabel()}>Order Date *</div>
                      <input
                        className={inputClass()}
                        type="date"
                        value={purchaseDate}
                        onChange={(e) => setPurchaseDate(e.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <div className={fieldLabel()}>Delivery Date (optional)</div>
                        <button
                          type="button"
                          className="text-xs text-neutral-700 underline"
                          onClick={() => setDeliveryDate(todayISO())}
                        >
                          Today
                        </button>
                      </div>
                      <input
                        className={inputClass()}
                        type="date"
                        value={deliveryDate}
                        onChange={(e) => setDeliveryDate(e.target.value)}
                      />
                    </div>

                    <div>
                      <div className={fieldLabel()}>Expiry Date (optional)</div>
                      <input
                        className={inputClass()}
                        type="date"
                        value={expiryDate}
                        onChange={(e) => setExpiryDate(e.target.value)}
                      />
                    </div>

                    <div>
                      <div className={fieldLabel()}>Shop *</div>
                      <ShopInput
                        inputRef={addPurchaseShopRef}
                        value={shopStr}
                        onChange={setShopStr}
                        options={shopOptions}
                      />
                    </div>

                    <div>
                      <div className={fieldLabel()}>Tracking (optional)</div>
                      <input
                        className={inputClass()}
                        value={trackingStr}
                        onChange={(e) => setTrackingStr(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.stopPropagation();
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-5">
                    <div>
                      <div className={fieldLabel()}>Quantity *</div>
                      <input
                        className={inputClass()}
                        type="number"
                        min={1}
                        step={1}
                        value={qty}
                        onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                      />
                    </div>

                    <div>
                      <div className={fieldLabel()}>Unit Cost (£) *</div>
                      <input
                        className={inputClass()}
                        inputMode="decimal"
                        value={unitCostStr}
                        onChange={(e) => setUnitCostStr(sanitizeDecimalInput(e.target.value))}
                      />
                    </div>

                    <div>
                      <div className={fieldLabel()}>Tax (£) (total)</div>
                      <input
                        className={inputClass()}
                        inputMode="decimal"
                        value={taxStr}
                        onChange={(e) => setTaxStr(sanitizeDecimalInput(e.target.value))}
                      />
                    </div>

                    <div>
                      <div className={fieldLabel()}>Shipping (£) (total)</div>
                      <input
                        className={inputClass()}
                        inputMode="decimal"
                        value={shippingStr}
                        onChange={(e) => setShippingStr(sanitizeDecimalInput(e.target.value))}
                      />
                    </div>

                    <div>
                      <div className={fieldLabel()}>Discount (type inside field)</div>
                      <DiscountInput
                        value={discountValueStr}
                        onChange={setDiscountValueStr}
                        discountType={discountType}
                        setDiscountType={setDiscountType}
                      />
                      <div className="mt-1 text-[11px] text-neutral-500">
                        {discountType === "percent"
                          ? "Percent is per-unit."
                          : "£ discount is TOTAL (split evenly across units)."}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-neutral-700">
                    Status on create:{" "}
                    <span
                      className={[
                        "inline-flex items-center rounded-full border px-2 py-1 text-xs",
                        statusPillColor(toNullDate(deliveryDate) ? "processing" : "awaiting_delivery"),
                      ].join(" ")}
                    >
                      {statusLabel(toNullDate(deliveryDate) ? "processing" : "awaiting_delivery")}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-neutral-900">
                    Total (preview): {money(totalCostPreview)}
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


      {returnedItemDetailOpen && returnedItemDetailRow ? (
        <div className={modalBackdrop()} onMouseDown={() => setReturnedItemDetailOpen(false)}>
          <div className={modalCard()} onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b p-5">
              <div>
                <div className="text-lg font-semibold text-neutral-900">Product Details</div>
                <div className="mt-1 text-xs text-neutral-600">
                  Review the returned item details below.
                </div>
              </div>
              <button className={buttonClass()} onClick={() => setReturnedItemDetailOpen(false)}>
                Close
              </button>
            </div>

            <div className="p-5">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border p-4">
                  <div className="mb-3 text-sm font-semibold text-neutral-900">Product Details</div>
                  <div className="grid gap-y-2 text-sm text-neutral-800 sm:grid-cols-[140px_1fr]">
                    <div className="font-semibold">Item ID:</div><div>{returnedItemDetailRow.product?.product_code ?? "-"}</div>
                    <div className="font-semibold">ASIN:</div><div>{returnedItemDetailRow.product?.asin ?? "-"}</div>
                    <div className="font-semibold">Brand:</div><div>{returnedItemDetailRow.product?.brand ?? "-"}</div>
                    <div className="font-semibold">Product:</div><div>{returnedItemDetailRow.product?.product_name ?? "-"}</div>
                    <div className="font-semibold">Barcode:</div><div>{returnedItemDetailRow.product?.barcode ?? "-"}</div>
                    <div className="font-semibold">Amazon Code:</div><div>{returnedItemDetailRow.product?.amazon_code ?? "-"}</div>
                    <div className="font-semibold">Shop:</div><div>{returnedItemDetailRow.shop ?? "-"}</div>
                    <div className="font-semibold">Tax Year:</div><div>{returnedItemDetailRow.tax_year ?? "-"}</div>
                    <div className="font-semibold">Status:</div><div>{statusLabel((returnedItemDetailRow.status as StatusKey) ?? "all")}</div>
                  </div>
                </div>

                <div className="rounded-2xl border p-4">
                  <div className="mb-3 text-sm font-semibold text-neutral-900">Key Dates &amp; Movement</div>
                  <div className="grid gap-y-2 text-sm text-neutral-800 sm:grid-cols-[150px_1fr]">
                    <div className="font-semibold">Purchase Date:</div><div>{fmtDate(returnedItemDetailRow.purchase_date ?? null)}</div>
                    <div className="font-semibold">Delivery Date:</div><div>{fmtDate(returnedItemDetailRow.delivery_date ?? null)}</div>
                    <div className="font-semibold">Returned Date:</div><div>{fmtDate(returnedItemDetailRow.returned_date ?? null)}</div>
                    <div className="font-semibold">Refunded Date:</div><div>{fmtDate(returnedItemDetailRow.refunded_date ?? null)}</div>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-neutral-900">Item Actions</div>

                  {returnedItemDetailRow.status === "awaiting_refund" ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={buttonClass(true)}
                        onClick={() => {
                          setReturnedItemDetailOpen(false);
                          openRefundCompleteModal(returnedItemDetailRow.id);
                        }}
                      >
                        Refunded
                      </button>

                      <button
                        type="button"
                        className={buttonClass()}
                        onClick={() => {
                          setReturnedItemDetailOpen(false);
                          openRestoreModal(returnedItemDetailRow.id);
                        }}
                      >
                        Restore
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border bg-neutral-50 p-4">
                    <div className="text-sm font-semibold text-neutral-900">Cost Breakdown</div>
                    <div className="mt-3 space-y-2 text-sm text-neutral-800">
                      <div className="flex items-center justify-between"><span>Unit Cost</span><b>{money(Number(returnedItemDetailRow.unit_cost ?? 0))}</b></div>
                      <div className="flex items-center justify-between"><span>Tax</span><b>{money(Number(returnedItemDetailRow.tax_amount ?? 0))}</b></div>
                      <div className="flex items-center justify-between"><span>Shipping</span><b>{money(Number(returnedItemDetailRow.shipping_cost ?? 0))}</b></div>
                      <div className="flex items-center justify-between border-t pt-2"><span>Total Cost Basis</span><b>{money(Number(returnedItemDetailRow.unit_cost ?? 0) + Number(returnedItemDetailRow.tax_amount ?? 0) + Number(returnedItemDetailRow.shipping_cost ?? 0))}</b></div>
                    </div>
                  </div>

                  <div className="rounded-xl border p-4">
                    <div className="text-sm font-semibold text-neutral-900">Refund Details</div>
                    <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-y-2 gap-x-4 text-sm text-neutral-800">
                      <div className="font-semibold">Unit Cost</div>
                      <div>{money(Number(returnedItemDetailRow.unit_cost ?? 0))}</div>
                      <div className="text-right font-semibold">{money(returnedItemRefundParts.product ? Number(returnedItemDetailRow.unit_cost ?? 0) : 0)}</div>

                      <div className="font-semibold">Tax</div>
                      <div>{money(Number(returnedItemDetailRow.tax_amount ?? 0))}</div>
                      <div className="text-right font-semibold">{money(returnedItemRefundParts.tax ? Number(returnedItemDetailRow.tax_amount ?? 0) : 0)}</div>

                      <div className="font-semibold">Shipping</div>
                      <div>{money(Number(returnedItemDetailRow.shipping_cost ?? 0))}</div>
                      <div className="text-right font-semibold">{money(returnedItemRefundParts.shipping ? Number(returnedItemDetailRow.shipping_cost ?? 0) : 0)}</div>

                      <div className="col-span-3 border-t pt-2 mt-1 flex items-center justify-between">
                        <span className="font-semibold">Total Refunded</span>
                        <b>{money(Number(returnedItemDetailRow.refund_amount ?? 0))}</b>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {editOpen && selectedPurchase ? (
        <div className={modalBackdrop()} onMouseDown={() => setEditOpen(false)}>
          <div className={modalCard()} onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b p-5">
              <div>
                <div className="text-lg font-semibold text-neutral-900">
                  {(["awaiting_delivery", "processing"] as string[]).includes(selectedPurchase.status)
                    ? "Product Details"
                    : "Edit Purchase"}
                </div>
                <div className="mt-1 text-xs text-neutral-600">
                  {(["awaiting_delivery", "processing"] as string[]).includes(selectedPurchase.status)
                    ? "Review the item history and update product details below."
                    : "Status is automatic (delivery date) + row buttons. Use Write Off here if needed."}
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

              {(["awaiting_delivery", "processing"] as string[]).includes(selectedPurchase.status) ? (
                <>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border p-4">
                      <div className="mb-3 text-sm font-semibold text-neutral-900">Product Details</div>
                      <div className="grid gap-y-2 text-sm text-neutral-800 sm:grid-cols-[140px_1fr]">
                        <div className="font-semibold">Item ID:</div><div>{selectedPurchase.product?.product_code ?? "-"}</div>
                        <div className="font-semibold">ASIN:</div><div>{selectedPurchase.product?.asin ?? "-"}</div>
                        <div className="font-semibold">Brand:</div><div>{selectedPurchase.product?.brand ?? "-"}</div>
                        <div className="font-semibold">Product:</div><div>{selectedPurchase.product?.product_name ?? "-"}</div>
                        <div className="font-semibold">Barcode:</div><div>{selectedPurchase.product?.barcode ?? "-"}</div>
                        <div className="font-semibold">Amazon Code:</div><div>{selectedPurchase.product?.amazon_code ?? "-"}</div>
                        <div className="font-semibold">Shop:</div><div>{selectedPurchase.shop ?? "-"}</div>
                        <div className="font-semibold">Tax Year:</div><div>{selectedPurchase.tax_year ?? "-"}</div>
                        <div className="font-semibold">Status:</div><div>{statusLabel((selectedPurchase.status as StatusKey) ?? "all")}</div>
                      </div>
                    </div>

                    <div className="rounded-2xl border p-4">
                      <div className="mb-3 text-sm font-semibold text-neutral-900">Key Dates &amp; Movement</div>
                      <div className="grid gap-y-2 text-sm text-neutral-800 sm:grid-cols-[150px_1fr]">
                        <div className="font-semibold">Purchase Date:</div><div>{fmtDate(selectedPurchase.purchase_date ?? null)}</div>
                        <div className="font-semibold">Delivery Date:</div><div>{fmtDate(selectedPurchase.delivery_date ?? null)}</div>
                        {selectedPurchase.sale_type === "FBM" ? (
                          <>
                            <div className="font-semibold">Check-in Date:</div><div>N/A</div>
                            <div className="font-semibold">Order Date:</div><div>{fmtDate(selectedPurchase.order_date ?? null)}</div>
                            <div className="font-semibold">Carrier:</div><div>-</div>
                            <div className="font-semibold">Tracking Number:</div><div>{selectedPurchase.fbm_tracking_no ?? "-"}</div>
                            <div className="font-semibold">Sale Type:</div><div>{selectedPurchase.sale_type ?? "-"}</div>
                            <div className="font-semibold">Last Return Date:</div><div>{fmtDate(selectedPurchase.last_return_date ?? null)}</div>
                          </>
                        ) : (
                          <>
                            <div className="font-semibold">Shipment Date:</div><div>{fmtDate(getShipmentForPurchase(selectedPurchase)?.shipment_date ?? null)}</div>
                            <div className="font-semibold">Check-in Date:</div><div>{fmtDate(getShipmentForPurchase(selectedPurchase)?.checkin_date ?? null)}</div>
                            <div className="font-semibold">Order Date:</div><div>{fmtDate(selectedPurchase.order_date ?? null)}</div>
                            <div className="font-semibold">Shipment Box:</div><div>{selectedPurchase.shipment_box_id ?? "-"}</div>
                            <div className="font-semibold">Sale Type:</div><div>{selectedPurchase.sale_type ?? "-"}</div>
                            <div className="font-semibold">Last Return Date:</div><div>{fmtDate(selectedPurchase.last_return_date ?? null)}</div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-neutral-900">Item Actions</div>
                      <div className="flex flex-wrap gap-2">
                        {selectedPurchase.status === "awaiting_delivery" ? (
                          <>
                            <button
                              type="button"
                              className={buttonClass(true)}
                              onClick={() => {
                                setEditOpen(false);
                                openDeliveredModal(selectedPurchase.id);
                              }}
                            >
                              Delivered
                            </button>

                            <button
                              type="button"
                              className={buttonClass()}
                              onClick={() => {
                                setEditOpen(false);
                                openAwaitingRefundModal(selectedPurchase.id);
                              }}
                            >
                              Returned
                            </button>
                          </>
                        ) : null}

                        <button
                          type="button"
                          className={buttonClass()}
                          onClick={() => {
                            setEditOpen(false);
                            openWriteOff(selectedPurchase.id);
                          }}
                        >
                          Write Off
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[1.05fr_1.35fr]">
                      <div className="rounded-xl border bg-neutral-50 p-4">
                        <div className="text-sm font-semibold text-neutral-900">Cost Breakdown</div>
                        <div className="mt-3 space-y-2 text-sm text-neutral-800">
                          <div className="flex items-center justify-between"><span>Unit Cost</span><b>{money(editLiveCostBreakdown.unitCost)}</b></div>
                          <div className="flex items-center justify-between"><span>Tax</span><b>{money(editLiveCostBreakdown.tax)}</b></div>
                          <div className="flex items-center justify-between"><span>Shipping</span><b>{money(editLiveCostBreakdown.shipping)}</b></div>
                          <div className="flex items-center justify-between"><span>Ship to Amazon</span><b>{money(editLiveCostBreakdown.shipToAmazon)}</b></div>
                          <div className="flex items-center justify-between"><span>Amazon Fees</span><b>{money(editLiveCostBreakdown.amazonFees)}</b></div>
                          <div className="flex items-center justify-between"><span>Misc Cost</span><b>{money(editLiveCostBreakdown.miscCost)}</b></div>
                          <div className="flex items-center justify-between"><span>Return Fees</span><b>{money(editLiveCostBreakdown.returnFees)}</b></div>
                          <div className="flex items-center justify-between"><span>FBM Shipping</span><b>{money(editLiveCostBreakdown.fbmShipping)}</b></div>
                          <div className="flex items-center justify-between border-t pt-2"><span>Total Cost Basis</span><b>{money(editLiveCostBreakdown.totalCostBasis)}</b></div>
                        </div>
                      </div>

                      <div className="rounded-2xl border p-4">
                        <div className="mb-4 text-sm font-semibold text-neutral-900">Product Details</div>

                        <div className="grid gap-4">
                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <div className="flex flex-col">
                              <div className="mb-1 h-8 flex items-center">
                                <div className={fieldLabel()}>Order Date *</div>
                              </div>
                              <input
                                ref={editDateRef}
                                className={inputClass()}
                                type="date"
                                value={ePurchaseDate}
                                onChange={(e) => setEPurchaseDate(e.target.value)}
                              />
                            </div>

                            <div className="flex flex-col">
                              <div className="mb-1 h-8 flex items-center justify-between gap-2">
                                <div className={fieldLabel()}>Delivery Date (optional)</div>
                                <button
                                  type="button"
                                  className="text-xs text-neutral-700 underline underline-offset-2"
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

                            <div className="flex flex-col">
                              <div className="mb-1 h-8 flex items-center">
                                <div className={fieldLabel()}>Expiry Date (optional)</div>
                              </div>
                              <input
                                className={inputClass()}
                                type="date"
                                value={eExpiryDate}
                                onChange={(e) => setEExpiryDate(e.target.value)}
                              />
                            </div>

                            <div className="flex flex-col">
                              <div className="mb-1 h-8 flex items-center">
                                <div className={fieldLabel()}>Shop *</div>
                              </div>
                              <ShopInput
                                value={eShopStr}
                                onChange={setEShopStr}
                                options={shopOptions}
                              />
                            </div>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <div className="flex flex-col">
                              <div className="mb-1 h-8 flex items-center">
                                <div className={fieldLabel()}>Quantity</div>
                              </div>
                              <input
                                className={inputClass()}
                                type="number"
                                min={1}
                                value={eQty}
                                onChange={(e) => setEQty(Math.max(1, Number(e.target.value) || 1))}
                              />
                            </div>

                            <div className="flex flex-col">
                              <div className="mb-1 h-8 flex items-center">
                                <div className={fieldLabel()}>Unit Cost (£) (per unit)</div>
                              </div>
                              <input
                                className={inputClass()}
                                inputMode="decimal"
                                value={eUnitCostStr}
                                onChange={(e) => setEUnitCostStr(sanitizeDecimalInput(e.target.value))}
                              />
                            </div>

                            <div className="flex flex-col">
                              <div className="mb-1 h-8 flex items-center">
                                <div className={fieldLabel()}>Tax (£) (total)</div>
                              </div>
                              <input
                                className={inputClass()}
                                inputMode="decimal"
                                value={eTaxStr}
                                onChange={(e) => setETaxStr(sanitizeDecimalInput(e.target.value))}
                              />
                            </div>

                            <div className="flex flex-col">
                              <div className="mb-1 h-8 flex items-center">
                                <div className={fieldLabel()}>Shipping (£) (total)</div>
                              </div>
                              <input
                                className={inputClass()}
                                inputMode="decimal"
                                value={eShippingStr}
                                onChange={(e) => setEShippingStr(sanitizeDecimalInput(e.target.value))}
                              />
                            </div>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            <div className="flex flex-col">
                              <div className="mb-1 h-8 flex items-center">
                                <div className={fieldLabel()}>Tracking (optional)</div>
                              </div>
                              <input
                                className={inputClass()}
                                value={eTrackingStr}
                                onChange={(e) => setETrackingStr(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                  }
                                }}
                              />
                            </div>

                            <div className="flex flex-col">
                              <div className="mb-1 h-8 flex items-center">
                                <div className={fieldLabel()}>Discount (type inside field)</div>
                              </div>
                              <DiscountInput
                                value={eDiscountValueStr}
                                onChange={setEDiscountValueStr}
                                discountType={eDiscountType}
                                setDiscountType={setEDiscountType}
                              />
                              <div className="mt-1 text-[11px] text-neutral-500">
                                {eDiscountType === "percent"
                                  ? "Percent is per-unit."
                                  : "£ discount is TOTAL (split evenly across units)."}
                              </div>
                            </div>

                            <div className="flex flex-col">
                              <div className="mb-1 h-8 flex items-center">
                                <div className={fieldLabel()}>Miscellaneous Cost (£)</div>
                              </div>
                              <input
                                className={inputClass()}
                                inputMode="decimal"
                                value={eMiscFeesStr}
                                onChange={(e) => setEMiscFeesStr(sanitizeDecimalInput(e.target.value))}
                              />
                            </div>

                            <div className="flex flex-col">
                              <div className="mb-1 h-8 flex items-center">
                                <div className={fieldLabel()}>Total (preview)</div>
                              </div>
                              <div className="flex h-[42px] items-center justify-end rounded-xl border bg-neutral-50 px-3 text-sm font-semibold text-neutral-900">
                                {money(eTotalPreview)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
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
                </>
              ) : (
                <>
                  <div className="rounded-2xl border p-4">
                    <div className="mb-3 text-sm font-semibold text-neutral-900">Selected Product</div>
                    <div className="text-sm text-neutral-800">
                      <span className="font-semibold">{selectedPurchase.product?.product_code ?? "-"}</span> •{" "}
                      {selectedPurchase.product?.asin ?? "-"} • {selectedPurchase.product?.brand ?? "-"} •{" "}
                      {selectedPurchase.product?.product_name ?? "-"}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs text-neutral-700">
                        Current status:{" "}
                        <span
                          className={[
                            "inline-flex items-center rounded-full border px-2 py-1 text-xs",
                            statusPillColor(selectedPurchase.status),
                          ].join(" ")}
                        >
                          {statusLabel(selectedPurchase.status)}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {selectedPurchase.status === "sold" ? (
                          <button
                            type="button"
                            className={buttonClass()}
                            onClick={() => {
                              setEditOpen(false);
                              openReturn(selectedPurchase.id);
                            }}
                          >
                            Returned Item
                          </button>
                        ) : null}

                        <button
                          type="button"
                          className={buttonClass()}
                          onClick={() => {
                            setEditOpen(false);
                            openWriteOff(selectedPurchase.id);
                          }}
                        >
                          Write Off
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border p-4">
                    <div className="mb-3 text-sm font-semibold text-neutral-900">Update Details</div>

                    <div className="grid gap-3">
                      <div className="grid gap-3 sm:grid-cols-5">
                        <div>
                          <div className={fieldLabel()}>Order Date *</div>
                          <input
                            ref={editDateRef}
                            className={inputClass()}
                            type="date"
                            value={ePurchaseDate}
                            onChange={(e) => setEPurchaseDate(e.target.value)}
                          />
                        </div>

                        <div>
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <div className={fieldLabel()}>Delivery Date (optional)</div>
                            <button
                              type="button"
                              className="text-xs text-neutral-700 underline"
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

                        <div>
                          <div className={fieldLabel()}>Shop (optional)</div>
                          <ShopInput
                            value={eShopStr}
                            onChange={setEShopStr}
                            options={shopOptions}
                          />
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

                      <div className="grid gap-3 sm:grid-cols-5">
                        <div>
                          <div className={fieldLabel()}>Quantity</div>
                          <input
                            className={inputClass()}
                            type="number"
                            min={1}
                            value={eQty}
                            onChange={(e) => setEQty(Math.max(1, Number(e.target.value) || 1))}
                          />
                        </div>

                        <div>
                          <div className={fieldLabel()}>Unit Cost (£) (per unit)</div>
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
                          <DiscountInput
                            value={eDiscountValueStr}
                            onChange={setEDiscountValueStr}
                            discountType={eDiscountType}
                            setDiscountType={setEDiscountType}
                          />
                          <div className="mt-1 text-[11px] text-neutral-500">
                            {eDiscountType === "percent"
                              ? "Percent is per-unit."
                              : "£ discount is TOTAL (split evenly across units)."}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
                </>
              )}
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
                </div>
                <button type="button" className={buttonClass()} onClick={() => setAddCatalogOpen(false)}>
                  Close
                </button>
              </div>

              <div className="p-5">
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

                  <div>
                    <div className={fieldLabel()}>Barcode</div>
                    <input
                      className={inputClass()}
                      value={catBarcode}
                      onChange={(e) => setCatBarcode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          e.stopPropagation();
                        }
                      }}
                      placeholder="e.g. 5010991234567"
                    />
                  </div>

                  <div>
                    <div className={fieldLabel()}>Amazon Barcode</div>
                    <input
                      className={inputClass()}
                      value={catAmazonBarcode}
                      onChange={(e) => setCatAmazonBarcode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          e.stopPropagation();
                        }
                      }}
                      placeholder="e.g. X001ABC123"
                    />
                  </div>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" className={buttonClass()} onClick={() => setAddCatalogOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className={buttonClass(true)} disabled={catBusy}>
                    {catBusy ? "Saving…" : "Create Product"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
} 
