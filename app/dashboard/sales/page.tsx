"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Product = {
  asin: string;
  brand: string;
  product_name: string;
  product_code: number;
};

type Row = {
  id: string;
  product: Product | null;

  purchase_date: string | null;
  delivery_date: string | null;

  shop: string | null;

  quantity: number | null;

  unit_cost: number | null;
  shipping_cost: number | null;
  tax_amount: number | null;

  total_cost: number | null;

  misc_fees: number | null;
  amazon_fees: number | null;

  sold_amount: number | null;
  amazon_payout: number | null;

  profit_loss: number | null;
  roi: number | null;

  order_date: string | null;

  shipment_box_id: string | null;
  tax_year: string | null;

  order_no?: number | null;
  item_no?: number | null;
  sale_type?: string | null;
  tracking_no?: string | null;
  fbm_tracking_no?: string | null;
  last_return_date?: string | null;

  status: string | null;
};

type Shipment = {
  shipment_box_no: string | null;
  shipment_date: string | null;
  checkin_date: string | null;
  cost_per_item: number | null;
  units: number | null;
  cost: number | null;
};

function money(v: number) {
  return `£${Number(v || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function date(v: string | null) {
  if (!v) return "-";
  return String(v).slice(0, 10);
}

function inputClass() {
  return "w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none";
}

function toNumber(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function sanitizeDecimalInput(v: string) {
  let out = v.replace(/[^\d.]/g, "");
  const firstDot = out.indexOf(".");
  if (firstDot !== -1) {
    out =
      out.slice(0, firstDot + 1) +
      out.slice(firstDot + 1).replace(/\./g, "");
  }
  return out;
}

function parseDate(v: string | null | undefined) {
  if (!v) return null;
  const text = String(v).slice(0, 10);
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

function exportRowsToCsv(rows: Row[], shipmentMap: Map<string, Shipment>) {
  const headers = [
    "No",
    "Purchase Date",
    "Delivery Date",
    "Shipment Date",
    "Check-in Date",
    "Order Date",
    "ASIN",
    "Brand",
    "Product",
    "Code",
    "Shop",
    "Shipment Box",
    "Qty",
    "Unit Cost",
    "Tax",
    "Shipping",
    "Ship to Amazon",
    "Misc",
    "Amazon Fees",
    "Total Cost",
    "Sold Price",
    "Amazon Payout",
    "Profit/Loss",
    "ROI %",
    "Margin %",
    "Tax Year",
  ];

  const escapeCsv = (value: unknown) => {
    const s = String(value ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const getShipmentForPurchase = (row: Row) => {
    const boxNo = row.shipment_box_id ?? null;
    if (!boxNo) return null;
    return shipmentMap.get(boxNo) ?? null;
  };

  const getAmazonInboundPerItem = (row: Row) => {
    const shipment = getShipmentForPurchase(row);
    if (!shipment) return 0;

    const explicit = toNumber(shipment.cost_per_item);
    if (explicit > 0) return explicit;

    const units = toNumber(shipment.units);
    const cost = toNumber(shipment.cost);
    return units > 0 ? cost / units : 0;
  };

  const lines = rows.map((row, index) => {
    const shipment = getShipmentForPurchase(row);
    const qty = toNumber(row.quantity) || 1;
    const unitCost = toNumber(row.unit_cost);
    const tax = toNumber(row.tax_amount);
    const shipping = toNumber(row.shipping_cost);
    const misc = toNumber(row.misc_fees);
    const amazonFees = toNumber(row.amazon_fees);
    const sale = toNumber(row.sold_amount);
    const amazonPayout = toNumber(row.amazon_payout);
    const shipToAmazon = getAmazonInboundPerItem(row);

    const totalCost =
      toNumber(row.total_cost) > 0
        ? toNumber(row.total_cost) + shipToAmazon + misc + amazonFees
        : unitCost * qty + tax + shipping + shipToAmazon + misc + amazonFees;

    const profit =
      row.profit_loss == null ? sale - totalCost : toNumber(row.profit_loss);

    const roi =
      row.roi == null
        ? totalCost > 0
          ? (profit / totalCost) * 100
          : 0
        : toNumber(row.roi);

    const margin = sale > 0 ? (profit / sale) * 100 : 0;

    return [
      index + 1,
      date(row.purchase_date),
      date(row.delivery_date),
      date(shipment?.shipment_date ?? null),
      date(shipment?.checkin_date ?? null),
      date(row.order_date),
      row.product?.asin ?? "",
      row.product?.brand ?? "",
      row.product?.product_name ?? "",
      row.product?.product_code ?? "",
      row.shop ?? "",
      row.shipment_box_id ?? "",
      qty,
      unitCost.toFixed(2),
      tax.toFixed(2),
      shipping.toFixed(2),
      shipToAmazon.toFixed(2),
      misc.toFixed(2),
      amazonFees.toFixed(2),
      totalCost.toFixed(2),
      sale.toFixed(2),
      amazonPayout.toFixed(2),
      profit.toFixed(2),
      roi.toFixed(2),
      margin.toFixed(2),
      row.tax_year ?? "",
    ]
      .map(escapeCsv)
      .join(",");
  });

  const csv = [headers.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `sales-export-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


function exportRowsToPdf(rows: Row[], shipmentMap: Map<string, Shipment>, fyLabel: string) {
  if (typeof window === "undefined") return;

  const getShipmentForPurchase = (row: Row) => {
    const boxNo = row.shipment_box_id ?? null;
    if (!boxNo) return null;
    return shipmentMap.get(boxNo) ?? null;
  };

  const getAmazonInboundPerItem = (row: Row) => {
    const shipment = getShipmentForPurchase(row);
    if (!shipment) return 0;

    const explicit = toNumber(shipment.cost_per_item);
    if (explicit > 0) return explicit;

    const units = toNumber(shipment.units);
    const cost = toNumber(shipment.cost);
    return units > 0 ? cost / units : 0;
  };

  const getTotalCost = (row: Row) => {
    const qty = toNumber(row.quantity) || 1;
    const unitCost = toNumber(row.unit_cost);
    const tax = toNumber(row.tax_amount);
    const shipping = toNumber(row.shipping_cost);
    const shipToAmazon = getAmazonInboundPerItem(row);
    const misc = toNumber(row.misc_fees);
    const amazonFees = toNumber(row.amazon_fees);

    return toNumber(row.total_cost) > 0
      ? toNumber(row.total_cost) + shipToAmazon + misc + amazonFees
      : unitCost * qty + tax + shipping + shipToAmazon + misc + amazonFees;
  };

  const getProfit = (row: Row) => {
    const soldPrice = toNumber(row.sold_amount);
    return row.profit_loss == null
      ? soldPrice - getTotalCost(row)
      : toNumber(row.profit_loss);
  };

  const getRoi = (row: Row) => {
    const totalCost = getTotalCost(row);
    return row.roi == null
      ? totalCost > 0
        ? (getProfit(row) / totalCost) * 100
        : 0
      : toNumber(row.roi);
  };

  const totals = rows.reduce(
    (acc, row) => {
      acc.units += toNumber(row.quantity) || 1;
      acc.sales += toNumber(row.sold_amount);
      acc.amazonPayout += toNumber(row.amazon_payout);
      acc.totalCost += getTotalCost(row);
      acc.profit += getProfit(row);
      return acc;
    },
    { units: 0, sales: 0, amazonPayout: 0, totalCost: 0, profit: 0 }
  );

  const escapeHtml = (value: unknown) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const bodyRows = rows
    .map((row, index) => {
      const shipment = getShipmentForPurchase(row);
      const profit = getProfit(row);
      const roi = getRoi(row);
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(date(row.order_date))}</td>
          <td>${escapeHtml(row.product?.asin ?? "-")}</td>
          <td>${escapeHtml(row.product?.brand ?? "-")}</td>
          <td>${escapeHtml(row.product?.product_name ?? "-")}</td>
          <td>${escapeHtml(row.shop ?? "-")}</td>
          <td>${escapeHtml(row.shipment_box_id ?? "-")}</td>
          <td class="num">${escapeHtml(money(toNumber(row.sold_amount)))}</td>
          <td class="num">${escapeHtml(money(getTotalCost(row)))}</td>
          <td class="num">${escapeHtml(money(toNumber(row.amazon_payout)))}</td>
          <td class="num ${profit >= 0 ? "pos" : "neg"}">${escapeHtml(money(profit))}</td>
          <td class="num ${roi >= 0 ? "pos" : "neg"}">${escapeHtml(roi.toFixed(2))}%</td>
        </tr>
      `;
    })
    .join("");

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Sales Export ${escapeHtml(fyLabel)}</title>
        <style>
          body { font-family: Arial, Helvetica, sans-serif; margin: 24px; color: #111; }
          .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 18px; }
          .title { font-size: 24px; font-weight: 700; }
          .sub { font-size: 12px; color:#555; margin-top: 4px; }
          .summary { display:grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 18px 0 22px; }
          .card { border:1px solid #d4d4d8; border-radius: 14px; padding: 12px; }
          .card-label { font-size: 11px; text-transform: uppercase; color:#666; letter-spacing:.04em; }
          .card-value { font-size: 20px; font-weight: 700; margin-top: 6px; }
          table { width:100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #d4d4d8; padding: 8px 10px; text-align: left; }
          th { background:#f5f5f5; font-weight: 700; }
          .num { text-align:right; white-space:nowrap; }
          .pos { color:#166534; font-weight:700; }
          .neg { color:#b91c1c; font-weight:700; }
          .footer { margin-top: 14px; font-size: 11px; color:#666; }
          @media print { body { margin: 12px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">Sales Export</div>
            <div class="sub">Selected tax year: ${escapeHtml(fyLabel)} (filtered by sold date)</div>
          </div>
          <div class="sub">Generated: ${escapeHtml(new Date().toLocaleString("en-GB"))}</div>
        </div>

        <div class="summary">
          <div class="card"><div class="card-label">Rows</div><div class="card-value">${rows.length}</div></div>
          <div class="card"><div class="card-label">Sales</div><div class="card-value">${escapeHtml(money(totals.sales))}</div></div>
          <div class="card"><div class="card-label">Total Cost</div><div class="card-value">${escapeHtml(money(totals.totalCost))}</div></div>
          <div class="card"><div class="card-label">Profit</div><div class="card-value">${escapeHtml(money(totals.profit))}</div></div>
        </div>

        <table>
          <thead>
            <tr>
              <th>No.</th>
              <th>Order Date</th>
              <th>ASIN</th>
              <th>Brand</th>
              <th>Product</th>
              <th>Shop</th>
              <th>Shipment Box</th>
              <th class="num">Sold Price</th>
              <th class="num">Total Cost</th>
              <th class="num">Amazon Payout</th>
              <th class="num">P/L</th>
              <th class="num">ROI</th>
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>

        <div class="footer">Prepared from Sales page export.</div>
      </body>
    </html>
  `;

  const printWindow = window.open("", "_blank", "width=1200,height=900");
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 250);
}
export default function SalesPage() {
  const currentFyLabel = getCurrentFyLabel();
  const [selectedFyLabel, setSelectedFyLabel] = useState<string>(
    readStoredTaxYear() ?? currentFyLabel
  );

  const [rows, setRows] = useState<Row[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [exportOpen, setExportOpen] = useState(false);

  const [selected, setSelected] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [formOrderDate, setFormOrderDate] = useState("");
  const [formSoldAmount, setFormSoldAmount] = useState("");
  const [formAmazonFees, setFormAmazonFees] = useState("");
  const [formMiscFees, setFormMiscFees] = useState("");

  const fyLabel = isValidTaxYearLabel(selectedFyLabel)
    ? selectedFyLabel
    : currentFyLabel;
  const fyBounds = useMemo(() => getFyBounds(fyLabel), [fyLabel]);

  async function loadAll() {
    setLoading(true);
    setError(null);

    const purchasesRes = await supabase
      .from("purchases")
      .select(`
        id,
        product_id,
        purchase_date,
        delivery_date,
        shop,
        quantity,
        unit_cost,
        shipping_cost,
        tax_amount,
        total_cost,
        misc_fees,
        amazon_fees,
        sold_amount,
        amazon_payout,
        profit_loss,
        roi,
        order_date,
        shipment_box_id,
        tax_year,
        order_no,
        item_no,
        sale_type,
        tracking_no,
        fbm_tracking_no,
        last_return_date,
        status,
        product:products(asin,brand,product_name,product_code)
      `)
      .eq("status", "sold")
      .order("order_date", { ascending: false });

    if (purchasesRes.error) {
      setError(purchasesRes.error.message);
      setRows([]);
      setShipments([]);
      setLoading(false);
      return;
    }

    const purchaseRows = (purchasesRes.data ?? []) as Row[];
    setRows(purchaseRows);

    const shipmentBoxNos = Array.from(
      new Set(
        purchaseRows
          .map((r) => r.shipment_box_id)
          .filter((v): v is string => Boolean(v))
      )
    );

    if (shipmentBoxNos.length === 0) {
      setShipments([]);
      setLoading(false);
      return;
    }

    const shipmentsRes = await supabase
      .from("shipments")
      .select(
        "shipment_box_no, shipment_date, checkin_date, cost_per_item, units, cost"
      )
      .in("shipment_box_no", shipmentBoxNos);

    if (shipmentsRes.error) {
      setError(shipmentsRes.error.message);
      setShipments([]);
      setLoading(false);
      return;
    }

    setShipments((shipmentsRes.data ?? []) as Shipment[]);
    setLoading(false);
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
  }, []);

  const shipmentMap = useMemo(() => {
    const map = new Map<string, Shipment>();
    shipments.forEach((s) => {
      if (s.shipment_box_no) map.set(s.shipment_box_no, s);
    });
    return map;
  }, [shipments]);

  const getShipmentForPurchase = (row: Row) => {
    const boxNo = row.shipment_box_id ?? null;
    if (!boxNo) return null;
    return shipmentMap.get(boxNo) ?? null;
  };

  const getAmazonInboundPerItem = (row: Row) => {
    const shipment = getShipmentForPurchase(row);
    if (!shipment) return 0;

    const explicit = toNumber(shipment.cost_per_item);
    if (explicit > 0) return explicit;

    const units = toNumber(shipment.units);
    const cost = toNumber(shipment.cost);
    return units > 0 ? cost / units : 0;
  };

  const getTotalCost = (row: Row) => {
    const qty = toNumber(row.quantity) || 1;
    const unitCost = toNumber(row.unit_cost);
    const tax = toNumber(row.tax_amount);
    const shipping = toNumber(row.shipping_cost);
    const shipToAmazon = getAmazonInboundPerItem(row);
    const misc = toNumber(row.misc_fees);
    const amazonFees = toNumber(row.amazon_fees);

    return toNumber(row.total_cost) > 0
      ? toNumber(row.total_cost) + shipToAmazon + misc + amazonFees
      : unitCost * qty + tax + shipping + shipToAmazon + misc + amazonFees;
  };

  const getProfit = (row: Row) => {
    const soldPrice = toNumber(row.sold_amount);
    return row.profit_loss == null
      ? soldPrice - getTotalCost(row)
      : toNumber(row.profit_loss);
  };

  const getRoi = (row: Row) => {
    const totalCost = getTotalCost(row);
    return row.roi == null
      ? totalCost > 0
        ? (getProfit(row) / totalCost) * 100
        : 0
      : toNumber(row.roi);
  };

  const getMargin = (row: Row) => {
    const soldPrice = toNumber(row.sold_amount);
    return soldPrice > 0 ? (getProfit(row) / soldPrice) * 100 : 0;
  };

  const taxYearRows = useMemo(() => {
    return rows.filter((row) => {
      const soldDate = parseDate(row.order_date);
      return Boolean(
        soldDate && soldDate >= fyBounds.start && soldDate <= fyBounds.end
      );
    });
  }, [rows, fyBounds]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return taxYearRows;

    return taxYearRows.filter((row) => {
      return (
        String(row.product?.asin ?? "").toLowerCase().includes(q) ||
        String(row.product?.brand ?? "").toLowerCase().includes(q) ||
        String(row.product?.product_name ?? "").toLowerCase().includes(q) ||
        String(row.product?.product_code ?? "").toLowerCase().includes(q) ||
        String(row.shop ?? "").toLowerCase().includes(q) ||
        String(row.tax_year ?? "").toLowerCase().includes(q) ||
        String(row.shipment_box_id ?? "").toLowerCase().includes(q) ||
        String(row.order_date ?? "").toLowerCase().includes(q) ||
        String(row.purchase_date ?? "").toLowerCase().includes(q) ||
        String(row.delivery_date ?? "").toLowerCase().includes(q)
      );
    });
  }, [taxYearRows, search]);

  const totals = useMemo(() => {
    let unitsSold = 0;
    let sales = 0;
    let amazonFees = 0;
    let misc = 0;
    let shipping = 0;
    let tax = 0;
    let shipToAmazon = 0;
    let totalCost = 0;
    let amazonPayout = 0;
    let profit = 0;

    for (const row of taxYearRows) {
      unitsSold += toNumber(row.quantity) || 1;
      sales += toNumber(row.sold_amount);
      amazonFees += toNumber(row.amazon_fees);
      misc += toNumber(row.misc_fees);
      shipping += toNumber(row.shipping_cost);
      tax += toNumber(row.tax_amount);
      shipToAmazon += getAmazonInboundPerItem(row);
      totalCost += getTotalCost(row);
      amazonPayout += toNumber(row.amazon_payout);
      profit += getProfit(row);
    }

    const avgMargin = sales > 0 ? (profit / sales) * 100 : 0;

    return {
      unitsSold,
      sales,
      amazonFees,
      misc,
      shipping,
      tax,
      shipToAmazon,
      totalCost,
      amazonPayout,
      profit,
      avgMargin,
    };
  }, [taxYearRows]);

  function openRowDetails(row: Row) {
    setSelected(row);
    setSaveError(null);
    setFormOrderDate(date(row.order_date) === "-" ? "" : date(row.order_date));
    setFormSoldAmount(String(toNumber(row.sold_amount)));
    setFormAmazonFees(String(toNumber(row.amazon_fees)));
    setFormMiscFees(String(toNumber(row.misc_fees)));
  }

  function closeModal() {
    if (saving) return;
    setSelected(null);
    setSaveError(null);
  }

  async function saveSaleEdits() {
    if (!selected) return;

    setSaveError(null);

    const soldAmount = toNumber(formSoldAmount);
    const amazonFees = toNumber(formAmazonFees);
    const miscFees = toNumber(formMiscFees);
    const orderDate = formOrderDate.trim();

    if (!orderDate) {
      setSaveError("Order date is required.");
      return;
    }

    if (selected.purchase_date && orderDate < selected.purchase_date) {
      setSaveError("Order date cannot be before purchase date.");
      return;
    }

    if (soldAmount < 0.01) {
      setSaveError("Sold amount must be at least £0.01.");
      return;
    }

    if (amazonFees < 0.01) {
      setSaveError("Amazon fees must be at least £0.01.");
      return;
    }

    const qty = toNumber(selected.quantity) || 1;
    const unitCost = toNumber(selected.unit_cost);
    const tax = toNumber(selected.tax_amount);
    const shipping = toNumber(selected.shipping_cost);
    const shipToAmazon = getAmazonInboundPerItem(selected);

    const baseCost =
      toNumber(selected.total_cost) > 0
        ? toNumber(selected.total_cost) + shipToAmazon + miscFees
        : unitCost * qty + tax + shipping + shipToAmazon + miscFees;

    const amazonPayout = soldAmount - amazonFees;
    const profitLoss = soldAmount - (baseCost + amazonFees);
    const roi = baseCost > 0 ? (profitLoss / baseCost) * 100 : 0;

    setSaving(true);

    const { error: updateError } = await supabase
      .from("purchases")
      .update({
        order_date: orderDate,
        sold_amount: soldAmount,
        amazon_fees: amazonFees,
        misc_fees: miscFees,
        amazon_payout: amazonPayout,
        profit_loss: profitLoss,
        roi,
      })
      .eq("id", selected.id);

    setSaving(false);

    if (updateError) {
      setSaveError(updateError.message);
      return;
    }

    await loadAll();

    setSelected((prev) =>
      prev && prev.id === selected.id
        ? {
            ...prev,
            order_date: orderDate,
            sold_amount: soldAmount,
            amazon_fees: amazonFees,
            misc_fees: miscFees,
            amazon_payout: amazonPayout,
            profit_loss: profitLoss,
            roi,
          }
        : prev
    );
  }

  return (
    <div className="w-full">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[18px] font-semibold text-black">Sales</h1>
          <p className="text-[13px] text-neutral-600">
            Detailed sold items view pulled directly from inventory
          </p>
          <p className="mt-1 text-[12px] text-neutral-500">
            Hard-wired to the selected tax year using sold date ({fyLabel})
          </p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <div className="rounded-[18px] border border-neutral-400 bg-white px-4 py-3">
          <div className="text-[12px] uppercase tracking-wide text-neutral-500">
            Units Sold
          </div>
          <div className="mt-1 text-[18px] font-semibold text-black">
            {totals.unitsSold}
          </div>
        </div>

        <div className="rounded-[18px] border border-neutral-400 bg-white px-4 py-3">
          <div className="text-[12px] uppercase tracking-wide text-neutral-500">
            Sales
          </div>
          <div className="mt-1 text-[18px] font-semibold text-black">
            {money(totals.sales)}
          </div>
        </div>

        <div className="rounded-[18px] border border-neutral-400 bg-white px-4 py-3">
          <div className="text-[12px] uppercase tracking-wide text-neutral-500">
            Amazon Fees
          </div>
          <div className="mt-1 text-[18px] font-semibold text-black">
            {money(totals.amazonFees)}
          </div>
        </div>

        <div className="rounded-[18px] border border-neutral-400 bg-white px-4 py-3">
          <div className="text-[12px] uppercase tracking-wide text-neutral-500">
            Misc
          </div>
          <div className="mt-1 text-[18px] font-semibold text-black">
            {money(totals.misc)}
          </div>
        </div>

        <div className="rounded-[18px] border border-neutral-400 bg-white px-4 py-3">
          <div className="text-[12px] uppercase tracking-wide text-neutral-500">
            Ship to Amazon
          </div>
          <div className="mt-1 text-[18px] font-semibold text-black">
            {money(totals.shipToAmazon)}
          </div>
        </div>

        <div className="rounded-[18px] border border-neutral-400 bg-white px-4 py-3">
          <div className="text-[12px] uppercase tracking-wide text-neutral-500">
            Total Cost
          </div>
          <div className="mt-1 text-[18px] font-semibold text-black">
            {money(totals.totalCost)}
          </div>
        </div>

        <div className="rounded-[18px] border border-neutral-400 bg-white px-4 py-3">
          <div className="text-[12px] uppercase tracking-wide text-neutral-500">
            Amazon Payout
          </div>
          <div className="mt-1 text-[18px] font-semibold text-black">
            {money(totals.amazonPayout)}
          </div>
        </div>

        <div className="rounded-[18px] border border-neutral-400 bg-white px-4 py-3">
          <div className="text-[12px] uppercase tracking-wide text-neutral-500">
            Profit
          </div>
          <div
            className={[
              "mt-1 text-[18px] font-semibold",
              totals.profit >= 0 ? "text-emerald-700" : "text-red-700",
            ].join(" ")}
          >
            {money(totals.profit)}
          </div>
          <div
            className={[
              "mt-1 text-[12px] font-medium",
              totals.avgMargin >= 0 ? "text-emerald-700" : "text-red-700",
            ].join(" ")}
          >
            Avg margin {totals.avgMargin.toFixed(2)}%
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ASIN / brand / product / code / shop / box / date"
          className="h-10 w-[360px] rounded-full border border-neutral-400 bg-white px-4 text-sm outline-none"
        />

        <button
          type="button"
          onClick={() => setExportOpen(true)}
          className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white"
          disabled={filteredRows.length === 0}
        >
          Export
        </button>
      </div>

      <div className="overflow-hidden rounded-[18px] border border-neutral-400 bg-white">
        <div className="max-h-[70vh] overflow-auto">
          <table className="min-w-[2200px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-neutral-400">
                <th className="px-4 py-4 text-left text-[12px] font-semibold uppercase tracking-wide text-neutral-700">
                  No.
                </th>
                <th className="px-4 py-4 text-left text-[12px] font-semibold uppercase tracking-wide text-neutral-700">
                  Purchase Date
                </th>
                <th className="px-4 py-4 text-left text-[12px] font-semibold uppercase tracking-wide text-neutral-700">
                  Delivery Date
                </th>
                <th className="px-4 py-4 text-left text-[12px] font-semibold uppercase tracking-wide text-neutral-700">
                  Shipment Date
                </th>
                <th className="px-4 py-4 text-left text-[12px] font-semibold uppercase tracking-wide text-neutral-700">
                  Check-in Date
                </th>
                <th className="px-4 py-4 text-left text-[12px] font-semibold uppercase tracking-wide text-neutral-700">
                  Order Date
                </th>
                <th className="px-4 py-4 text-left text-[12px] font-semibold uppercase tracking-wide text-neutral-700">
                  ASIN
                </th>
                <th className="px-4 py-4 text-left text-[12px] font-semibold uppercase tracking-wide text-neutral-700">
                  Brand
                </th>
                <th className="px-4 py-4 text-left text-[12px] font-semibold uppercase tracking-wide text-neutral-700">
                  Product
                </th>
                <th className="px-4 py-4 text-left text-[12px] font-semibold uppercase tracking-wide text-neutral-700">
                  Code
                </th>
                <th className="px-4 py-4 text-left text-[12px] font-semibold uppercase tracking-wide text-neutral-700">
                  Shop
                </th>
                <th className="px-4 py-4 text-left text-[12px] font-semibold uppercase tracking-wide text-neutral-700">
                  Shipment Box
                </th>
                <th className="px-4 py-4 text-right text-[12px] font-semibold uppercase tracking-wide text-neutral-700">
                  Qty
                </th>
                <th className="px-4 py-4 text-right text-[12px] font-semibold uppercase tracking-wide text-neutral-700">
                  Unit Cost
                </th>
                <th className="px-4 py-4 text-right text-[12px] font-semibold uppercase tracking-wide text-neutral-700">
                  Tax
                </th>
                <th className="px-4 py-4 text-right text-[12px] font-semibold uppercase tracking-wide text-neutral-700">
                  Shipping
                </th>
                <th className="px-4 py-4 text-right text-[12px] font-semibold uppercase tracking-wide text-neutral-700">
                  Ship to Amazon
                </th>
                <th className="px-4 py-4 text-right text-[12px] font-semibold uppercase tracking-wide text-neutral-700">
                  Misc
                </th>
                <th className="px-4 py-4 text-right text-[12px] font-semibold uppercase tracking-wide text-neutral-700">
                  Amazon Fees
                </th>
                <th className="px-4 py-4 text-right text-[12px] font-semibold uppercase tracking-wide text-neutral-700">
                  Total Cost
                </th>
                <th className="px-4 py-4 text-right text-[12px] font-semibold uppercase tracking-wide text-neutral-700">
                  Sold Price
                </th>
                <th className="px-4 py-4 text-right text-[12px] font-semibold uppercase tracking-wide text-neutral-700">
                  Amazon Payout
                </th>
                <th className="px-4 py-4 text-right text-[12px] font-semibold uppercase tracking-wide text-neutral-700">
                  P/L
                </th>
                <th className="px-4 py-4 text-right text-[12px] font-semibold uppercase tracking-wide text-neutral-700">
                  ROI
                </th>
                <th className="px-4 py-4 text-right text-[12px] font-semibold uppercase tracking-wide text-neutral-700">
                  Margin
                </th>
                <th className="px-4 py-4 text-left text-[12px] font-semibold uppercase tracking-wide text-neutral-700">
                  Tax Year
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={26} className="px-4 py-8 text-center text-sm text-neutral-500">
                    Loading sales...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={26} className="px-4 py-8 text-center text-sm text-red-600">
                    {error}
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={26} className="px-4 py-8 text-center text-sm text-neutral-500">
                    No sales found in {fyLabel}.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, index) => {
                  const shipment = getShipmentForPurchase(row);
                  const qty = toNumber(row.quantity) || 1;
                  const unitCost = toNumber(row.unit_cost);
                  const tax = toNumber(row.tax_amount);
                  const shipping = toNumber(row.shipping_cost);
                  const shipToAmazon = getAmazonInboundPerItem(row);
                  const misc = toNumber(row.misc_fees);
                  const amazonFees = toNumber(row.amazon_fees);
                  const soldPrice = toNumber(row.sold_amount);
                  const amazonPayout = toNumber(row.amazon_payout);
                  const profit = getProfit(row);
                  const roi = getRoi(row);
                  const margin = getMargin(row);

                  return (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-b border-neutral-300 last:border-b-0 hover:bg-neutral-50"
                      onDoubleClick={() => openRowDetails(row)}
                    >
                      <td className="px-4 py-4 text-[14px] font-semibold text-black">
                        {index + 1}
                      </td>

                      <td className="px-4 py-4 text-[14px] text-black">{date(row.purchase_date)}</td>
                      <td className="px-4 py-4 text-[14px] text-black">{date(row.delivery_date)}</td>
                      <td className="px-4 py-4 text-[14px] text-black">{date(shipment?.shipment_date ?? null)}</td>
                      <td className="px-4 py-4 text-[14px] text-black">{date(shipment?.checkin_date ?? null)}</td>
                      <td className="px-4 py-4 text-[14px] text-black">{date(row.order_date)}</td>
                      <td className="px-4 py-4 text-[14px] text-black">{row.product?.asin ?? "-"}</td>
                      <td className="px-4 py-4 text-[14px] text-black">{row.product?.brand ?? "-"}</td>
                      <td className="px-4 py-4 text-[14px] text-black">{row.product?.product_name ?? "-"}</td>
                      <td className="px-4 py-4 text-[14px] text-black">{row.product?.product_code ?? "-"}</td>
                      <td className="px-4 py-4 text-[14px] text-black">{row.shop ?? "-"}</td>
                      <td className="px-4 py-4 text-[14px] text-black">{row.shipment_box_id ?? "-"}</td>
                      <td className="px-4 py-4 text-right text-[14px] text-black">{qty}</td>
                      <td className="px-4 py-4 text-right text-[14px] text-black">{money(unitCost)}</td>
                      <td className="px-4 py-4 text-right text-[14px] text-black">{money(tax)}</td>
                      <td className="px-4 py-4 text-right text-[14px] text-black">{money(shipping)}</td>
                      <td className="px-4 py-4 text-right text-[14px] text-black">{money(shipToAmazon)}</td>
                      <td className="px-4 py-4 text-right text-[14px] text-black">{money(misc)}</td>
                      <td className="px-4 py-4 text-right text-[14px] text-black">{money(amazonFees)}</td>
                      <td className="px-4 py-4 text-right text-[14px] font-semibold text-black">{money(getTotalCost(row))}</td>
                      <td className="px-4 py-4 text-right text-[14px] text-black">{money(soldPrice)}</td>
                      <td className="px-4 py-4 text-right text-[14px] text-black">{money(amazonPayout)}</td>

                      <td
                        className={[
                          "px-4 py-4 text-right text-[14px] font-semibold",
                          profit >= 0 ? "text-emerald-700" : "text-red-700",
                        ].join(" ")}
                      >
                        {money(profit)}
                      </td>

                      <td
                        className={[
                          "px-4 py-4 text-right text-[14px] font-semibold",
                          roi >= 0 ? "text-emerald-700" : "text-red-700",
                        ].join(" ")}
                      >
                        {roi.toFixed(2)}%
                      </td>

                      <td
                        className={[
                          "px-4 py-4 text-right text-[14px] font-semibold",
                          margin >= 0 ? "text-emerald-700" : "text-red-700",
                        ].join(" ")}
                      >
                        {margin.toFixed(2)}%
                      </td>

                      <td className="px-4 py-4 text-[14px] text-black">{row.tax_year ?? "-"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {!loading && !error && filteredRows.length > 0 && (
              <tfoot>
                <tr className="border-t border-neutral-400">
                  <td colSpan={12} className="px-4 py-4 text-[13px] font-semibold text-black">
                    Totals
                  </td>
                  <td className="px-4 py-4 text-right text-[14px] font-semibold text-black">
                    {totals.unitsSold}
                  </td>
                  <td className="px-4 py-4" />
                  <td className="px-4 py-4 text-right text-[14px] font-semibold text-black">
                    {money(totals.tax)}
                  </td>
                  <td className="px-4 py-4 text-right text-[14px] font-semibold text-black">
                    {money(totals.shipping)}
                  </td>
                  <td className="px-4 py-4 text-right text-[14px] font-semibold text-black">
                    {money(totals.shipToAmazon)}
                  </td>
                  <td className="px-4 py-4 text-right text-[14px] font-semibold text-black">
                    {money(totals.misc)}
                  </td>
                  <td className="px-4 py-4 text-right text-[14px] font-semibold text-black">
                    {money(totals.amazonFees)}
                  </td>
                  <td className="px-4 py-4 text-right text-[14px] font-semibold text-black">
                    {money(totals.totalCost)}
                  </td>
                  <td className="px-4 py-4 text-right text-[14px] font-semibold text-black">
                    {money(totals.sales)}
                  </td>
                  <td className="px-4 py-4 text-right text-[14px] font-semibold text-black">
                    {money(totals.amazonPayout)}
                  </td>
                  <td
                    className={[
                      "px-4 py-4 text-right text-[14px] font-semibold",
                      totals.profit >= 0 ? "text-emerald-700" : "text-red-700",
                    ].join(" ")}
                  >
                    {money(totals.profit)}
                  </td>
                  <td className="px-4 py-4" />
                  <td
                    className={[
                      "px-4 py-4 text-right text-[14px] font-semibold",
                      totals.avgMargin >= 0 ? "text-emerald-700" : "text-red-700",
                    ].join(" ")}
                  >
                    {totals.avgMargin.toFixed(2)}%
                  </td>
                  <td className="px-4 py-4" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {exportOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={() => setExportOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border bg-white shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b p-5">
              <div>
                <div className="text-lg font-semibold text-neutral-900">Export Sales</div>
                <div className="mt-1 text-xs text-neutral-600">
                  Choose how you want to export the currently filtered sales.
                </div>
              </div>
              <button
                type="button"
                className="rounded-xl border px-4 py-2 text-sm hover:bg-neutral-50"
                onClick={() => setExportOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="space-y-3 p-5">
              <button
                type="button"
                className="w-full rounded-xl border px-4 py-3 text-sm font-medium hover:bg-neutral-50"
                onClick={() => {
                  exportRowsToCsv(filteredRows, shipmentMap);
                  setExportOpen(false);
                }}
              >
                Export to CSV
              </button>

              <button
                type="button"
                className="w-full rounded-xl bg-black px-4 py-3 text-sm font-medium text-white"
                onClick={() => {
                  exportRowsToPdf(filteredRows, shipmentMap, fyLabel);
                  setExportOpen(false);
                }}
              >
                Export to PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={closeModal}
        >
          <div
            className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl border bg-white shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b p-5">
              <div>
                <div className="text-lg font-semibold text-neutral-900">Sale Details</div>
                <div className="mt-1 text-xs text-neutral-600">
                  Double-check and edit this sold row here.
                </div>
              </div>
              <button
                type="button"
                className="rounded-xl border px-4 py-2 text-sm hover:bg-neutral-50"
                onClick={closeModal}
                disabled={saving}
              >
                Close
              </button>
            </div>

            <div className="space-y-4 p-5">
              {saveError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {saveError}
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border bg-neutral-50 p-4">
                  <div className="mb-3 text-sm font-semibold text-neutral-900">
                    Product Details
                  </div>

                  <div className="grid gap-y-2 text-sm text-neutral-800 sm:grid-cols-[140px_1fr]">
                    <div className="font-semibold">Order Number:</div><div>{(selected as any)?.order_no ?? "-"}</div>
                    <div className="font-semibold">Item ID:</div><div>{(selected as any)?.item_no ?? "-"}</div>
                    <div className="font-semibold">ASIN:</div><div>{selected.product?.asin ?? "-"}</div>
                    <div className="font-semibold">Brand:</div><div>{selected.product?.brand ?? "-"}</div>
                    <div className="font-semibold">Product:</div><div>{selected.product?.product_name ?? "-"}</div>
                    <div className="font-semibold">Shop:</div><div>{selected.shop ?? "-"}</div>
                    <div className="font-semibold">Tax Year:</div><div>{selected.tax_year ?? "-"}</div>
                    <div className="font-semibold">Status:</div><div>{selected.status ?? "-"}</div>
                  </div>
                </div>

                <div className="rounded-xl border bg-neutral-50 p-4">
                  <div className="mb-3 text-sm font-semibold text-neutral-900">
                    Key Dates &amp; Movement
                  </div>

                  <div className="grid gap-y-2 text-sm text-neutral-800 sm:grid-cols-[150px_1fr]">
                    <div className="font-semibold">Purchase Date:</div><div>{date(selected.purchase_date)}</div>
                    <div className="font-semibold">Delivery Date:</div><div>{date(selected.delivery_date)}</div>
                    {((selected as any)?.sale_type ?? "AMZ") === "FBM" ? (
                      <>
                        <div className="font-semibold">Check-in Date:</div><div>N/A</div>
                        <div className="font-semibold">Order Date:</div><div>{date(selected.order_date)}</div>
                        <div className="font-semibold">Carrier:</div><div>{(selected as any)?.tracking_no ?? "-"}</div>
                        <div className="font-semibold">Tracking Number:</div><div>{(selected as any)?.fbm_tracking_no ?? "-"}</div>
                        <div className="font-semibold">Sale Type:</div><div>{(selected as any)?.sale_type ?? "-"}</div>
                        <div className="font-semibold">Last Return Date:</div><div>{date((selected as any)?.last_return_date ?? null)}</div>
                      </>
                    ) : (
                      <>
                        <div className="font-semibold">Shipment Date:</div><div>{date(getShipmentForPurchase(selected)?.shipment_date ?? null)}</div>
                        <div className="font-semibold">Check-in Date:</div><div>{date(getShipmentForPurchase(selected)?.checkin_date ?? null)}</div>
                        <div className="font-semibold">Order Date:</div><div>{date(selected.order_date)}</div>
                        <div className="font-semibold">Shipment Box:</div><div>{selected.shipment_box_id ?? "-"}</div>
                        <div className="font-semibold">Sale Type:</div><div>{(selected as any)?.sale_type ?? "AMZ"}</div>
                        <div className="font-semibold">Last Return Date:</div><div>{date((selected as any)?.last_return_date ?? null)}</div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <div className="mb-3 text-sm font-semibold text-neutral-900">
                  Edit Sale
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-black">
                      Order Date
                    </label>
                    <input
                      type="date"
                      value={formOrderDate}
                      onChange={(e) => setFormOrderDate(e.target.value)}
                      className={inputClass()}
                      min={selected.purchase_date ?? undefined}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-black">
                      Sold Price (£)
                    </label>
                    <input
                      type="text"
                      value={formSoldAmount}
                      onChange={(e) => setFormSoldAmount(sanitizeDecimalInput(e.target.value))}
                      className={inputClass()}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-black">
                      Amazon Fees (£)
                    </label>
                    <input
                      type="text"
                      value={formAmazonFees}
                      onChange={(e) => setFormAmazonFees(sanitizeDecimalInput(e.target.value))}
                      className={inputClass()}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-black">
                      Misc Fees (£)
                    </label>
                    <input
                      type="text"
                      value={formMiscFees}
                      onChange={(e) => setFormMiscFees(sanitizeDecimalInput(e.target.value))}
                      className={inputClass()}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-neutral-50 p-4">
                <div className="mb-3 text-sm font-semibold text-neutral-900">
                  Current Calculations
                </div>

                <div className="grid gap-2 text-sm text-neutral-800 md:grid-cols-2">
                  <div><b>Qty:</b> {toNumber(selected.quantity) || 1}</div>
                  <div><b>Unit Cost:</b> {money(toNumber(selected.unit_cost))}</div>
                  <div><b>Tax:</b> {money(toNumber(selected.tax_amount))}</div>
                  <div><b>Shipping:</b> {money(toNumber(selected.shipping_cost))}</div>
                  <div><b>Ship to Amazon:</b> {money(getAmazonInboundPerItem(selected))}</div>
                  <div><b>Total Cost:</b> {money(getTotalCost(selected))}</div>
                  <div><b>Amazon Payout:</b> {money(toNumber(selected.amazon_payout))}</div>
                  <div
                    className={
                      getProfit(selected) >= 0 ? "text-emerald-700" : "text-red-700"
                    }
                  >
                    <b>Profit / Loss:</b> {money(getProfit(selected))}
                  </div>
                  <div
                    className={
                      getRoi(selected) >= 0 ? "text-emerald-700" : "text-red-700"
                    }
                  >
                    <b>ROI:</b> {getRoi(selected).toFixed(2)}%
                  </div>
                  <div
                    className={
                      getMargin(selected) >= 0 ? "text-emerald-700" : "text-red-700"
                    }
                  >
                    <b>Margin:</b> {getMargin(selected).toFixed(2)}%
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-xl border px-4 py-2 text-sm hover:bg-neutral-50"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  onClick={saveSaleEdits}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
