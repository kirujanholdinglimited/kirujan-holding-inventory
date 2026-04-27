// app/dashboard/shipments/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

type ShipmentStatusKey = "preparing" | "in_transit" | "received_by_amazon";

type ShipmentRow = {
  id: string;
  created_at: string;

  shipment_box_no: string;

  shipment_date: string | null;
  checkin_date: string | null;

  cost: number | null;
  tax: number | null;
  total: number | null;

  units: number | null;

  cost_per_item: number | null;
  box_value: number | null;
  weight_kg: number | null;

  tracking_no: string | null;
  carrier: string | null;
};

function money(n: number) {
  return `£${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "-";
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return iso;
  return `${day}-${m}-${y}`;
}

function sanitizeDecimalInput(v: string) {
  let out = v.replace(/[^\d.]/g, "");
  const firstDot = out.indexOf(".");
  if (firstDot !== -1) {
    out = out.slice(0, firstDot + 1) + out.slice(firstDot + 1).replace(/\./g, "");
  }
  return out;
}

function parseDecimalOrNull(v: string) {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parseDecimalOrZero(v: string) {
  const t = v.trim();
  if (!t) return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function parseIntOrNull(v: string) {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

function toNullDate(v: string) {
  const t = v.trim();
  return t ? t : null;
}

function toNullText(v: string) {
  const t = v.trim();
  return t ? t : null;
}

function buttonClass(primary?: boolean) {
  return primary
    ? "whitespace-nowrap rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white hover:opacity-95"
    : "whitespace-nowrap rounded-xl border px-4 py-2 text-sm hover:bg-neutral-50";
}

function miniBtn(primary?: boolean) {
  return primary
    ? "whitespace-nowrap rounded-lg bg-neutral-900 px-2.5 py-1 text-xs text-white hover:opacity-95"
    : "whitespace-nowrap rounded-lg border px-2.5 py-1 text-xs hover:bg-neutral-50";
}

function inputClass() {
  return "w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-200";
}

function inputClassDisabled() {
  return "w-full rounded-xl border bg-neutral-50 px-3 py-2 text-sm outline-none text-neutral-700";
}

function fieldLabel() {
  return "text-xs font-medium text-neutral-700";
}

function modalBackdrop() {
  return "fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4";
}

function modalCard() {
  return "w-full max-w-5xl rounded-2xl border bg-white shadow-sm";
}

function parseBoxNo(box: string | null | undefined) {
  const t = (box ?? "").trim().toUpperCase();
  const m = /^B(\d+)$/.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function statusLabel(s: ShipmentStatusKey) {
  switch (s) {
    case "preparing":
      return "Preparing";
    case "in_transit":
      return "In Transit";
    case "received_by_amazon":
      return "Received by Amazon";
  }
}

function statusPillColor(s: ShipmentStatusKey) {
  switch (s) {
    case "preparing":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "in_transit":
      return "border-indigo-200 bg-indigo-50 text-indigo-800";
    case "received_by_amazon":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
}

function computeShipmentStatus(r: ShipmentRow): ShipmentStatusKey {
  if (r.checkin_date) return "received_by_amazon";
  if ((r.tracking_no ?? "").trim()) return "in_transit";
  return "preparing";
}

function getTrackingUrl(carrier: string | null, trackingNo: string | null) {
  const t = (trackingNo ?? "").trim();
  const c = (carrier ?? "").trim().toLowerCase();

  if (!t) return null;

  if (c.includes("ups")) {
    return `https://www.ups.com/track?tracknum=${encodeURIComponent(t)}`;
  }

  if (c.includes("royal")) {
    return `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(t)}`;
  }

  if (c.includes("evri") || c.includes("hermes")) {
    return `https://www.evri.com/track/parcel/${encodeURIComponent(t)}`;
  }

  if (c.includes("dpd")) {
    return `https://track.dpd.co.uk/parcels/${encodeURIComponent(t)}`;
  }

  if (c.includes("parcelforce")) {
    return `https://www.parcelforce.com/track-trace?trackNumber=${encodeURIComponent(t)}`;
  }

  return null;
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

export default function ShipmentsPage() {
  const currentFyLabel = getCurrentFyLabel();
  const [selectedFyLabel, setSelectedFyLabel] = useState<string>(
    readStoredTaxYear() ?? currentFyLabel
  );

  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [selectedShipmentId, setSelectedShipmentId] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [addBusy, setAddBusy] = useState(false);

  const [eBoxNo, setEBoxNo] = useState("");
  const [eShipmentDate, setEShipmentDate] = useState<string>("");
  const [eCheckinDate, setECheckinDate] = useState<string>("");

  const [eCostStr, setECostStr] = useState("");
  const [eUnitsStr, setEUnitsStr] = useState("");

  const [eCostPerItemStr, setECostPerItemStr] = useState("");
  const [eBoxValueStr, setEBoxValueStr] = useState("");
  const [eWeightStr, setEWeightStr] = useState("");

  const [eTrackingNo, setETrackingNo] = useState("");
  const [eCarrier, setECarrier] = useState("UPS");

  async function loadAll() {
    setLoading(true);
    setPageError(null);

    try {
      const { data, error } = await supabase
        .from("shipments")
        .select(
          `
          id,
          created_at,
          shipment_box_no,
          shipment_date,
          checkin_date,
          cost,
          tax,
          total,
          units,
          cost_per_item,
          box_value,
          weight_kg,
          tracking_no,
          carrier
        `
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      setShipments((data ?? []) as ShipmentRow[]);
    } catch (e: any) {
      setPageError(e?.message ?? "Failed to load shipments.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const fyLabel = isValidTaxYearLabel(selectedFyLabel)
    ? selectedFyLabel
    : currentFyLabel;
  const fyBounds = useMemo(() => getFyBounds(fyLabel), [fyLabel]);

  const filteredShipments = useMemo(() => {
    const q = search.trim().toLowerCase();

    return shipments.filter((r) => {
      const shipmentDt = parseDate(r.shipment_date);
      const matchesTaxYear = Boolean(
        shipmentDt && shipmentDt >= fyBounds.start && shipmentDt <= fyBounds.end
      );

      if (!matchesTaxYear) return false;

      if (!q) return true;
      return (
        (r.shipment_box_no ?? "").toLowerCase().includes(q) ||
        (r.tracking_no ?? "").toLowerCase().includes(q) ||
        (r.carrier ?? "").toLowerCase().includes(q) ||
        (r.shipment_date ?? "").toLowerCase().includes(q) ||
        (r.checkin_date ?? "").toLowerCase().includes(q)
      );
    });
  }, [shipments, search, fyBounds]);

  const shipmentTotals = useMemo(() => {
    return filteredShipments.reduce(
      (acc, row) => {
        acc.boxes += 1;
        acc.units += Number(row.units ?? 0);
        acc.cost += Number(row.cost ?? 0);
        acc.tax += Number(row.tax ?? 0);
        acc.total += Number(row.total ?? 0);
        acc.boxValue += Number(row.box_value ?? 0);
        return acc;
      },
      { boxes: 0, units: 0, cost: 0, tax: 0, total: 0, boxValue: 0 }
    );
  }, [filteredShipments]);

  const selectedShipment = useMemo(() => {
    if (!selectedShipmentId) return null;
    return shipments.find((s) => s.id === selectedShipmentId) ?? null;
  }, [shipments, selectedShipmentId]);

  const eCost = useMemo(() => parseDecimalOrNull(eCostStr), [eCostStr]);
  const eUnits = useMemo(() => parseIntOrNull(eUnitsStr), [eUnitsStr]);

  const eTaxCalc = useMemo(() => {
    if (eCost == null) return null;
    return Number((eCost * 0.2).toFixed(2));
  }, [eCost]);

  const eTotalCalc = useMemo(() => {
    if (eCost == null) return null;
    return Number((eCost + (eTaxCalc ?? 0)).toFixed(2));
  }, [eCost, eTaxCalc]);

  const eCostPerItemCalc = useMemo(() => {
    if (eTotalCalc == null) return null;
    if (!eUnits || eUnits <= 0) return null;
    return Number((eTotalCalc / eUnits).toFixed(2));
  }, [eTotalCalc, eUnits]);

  useEffect(() => {
    setECostPerItemStr(eCostPerItemCalc == null ? "" : String(eCostPerItemCalc));
  }, [eCostPerItemCalc]);

  async function addShipmentAuto() {
    if (addBusy) return;
    setAddBusy(true);
    setPageError(null);

    try {
      const { data, error } = await supabase
        .from("shipments")
        .select("shipment_box_no")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;

      let maxN = 0;
      for (const row of (data ?? []) as any[]) {
        const n = parseBoxNo(row?.shipment_box_no);
        if (n != null && n > maxN) maxN = n;
      }

      const nextBox = `B${maxN + 1}`;

      const { data: inserted, error: insErr } = await supabase
        .from("shipments")
        .insert({
          shipment_box_no: nextBox,
          shipment_date: null,
          carrier: "UPS",
        })
        .select(
          `
          id,
          created_at,
          shipment_box_no,
          shipment_date,
          checkin_date,
          cost,
          tax,
          total,
          units,
          cost_per_item,
          box_value,
          weight_kg,
          tracking_no,
          carrier
        `
        )
        .single();

      if (insErr) throw insErr;

      const newRow = inserted as ShipmentRow;
      setShipments((prev) => [newRow, ...prev]);
      setSelectedShipmentId(newRow.id);
    } catch (e: any) {
      setPageError(e?.message ?? "Failed to add shipment.");
    } finally {
      setAddBusy(false);
    }
  }

  function openEditFor(s: ShipmentRow) {
    setEditError(null);
    setSelectedShipmentId(s.id);

    setEBoxNo(s.shipment_box_no ?? "");
    setEShipmentDate(s.shipment_date ?? "");
    setECheckinDate(s.checkin_date ?? "");

    setECostStr(s.cost == null ? "" : String(Number(s.cost)));
    setEUnitsStr(s.units == null ? "" : String(Number(s.units)));

    setEBoxValueStr(s.box_value == null ? "" : String(Number(s.box_value)));
    setEWeightStr(s.weight_kg == null ? "" : String(Number(s.weight_kg)));

    setETrackingNo(s.tracking_no ?? "");
    setECarrier((s.carrier ?? "UPS").trim() ? (s.carrier ?? "UPS") : "UPS");

    setEditOpen(true);
  }

  async function saveEdit() {
    if (!selectedShipment) return;
    setEditBusy(true);
    setEditError(null);

    try {
      if (!eBoxNo.trim()) return setEditError("Shipment BoxNo is required.");

      const units = parseIntOrNull(eUnitsStr);
      const cost = parseDecimalOrNull(eCostStr);
      const carrier = (eCarrier ?? "").trim() ? eCarrier.trim() : "UPS";

      const patch: any = {
        shipment_box_no: eBoxNo.trim(),
        shipment_date: toNullDate(eShipmentDate),
        checkin_date: toNullDate(eCheckinDate),
        cost: cost,
        units: units,
        weight_kg: eWeightStr.trim() ? parseDecimalOrZero(eWeightStr) : null,
        tracking_no: toNullText(eTrackingNo),
        carrier: carrier,
      };

      const { error } = await supabase
        .from("shipments")
        .update(patch)
        .eq("id", selectedShipment.id);

      if (error) throw error;

      setEditOpen(false);
      await loadAll();
    } catch (e: any) {
      setEditError(e?.message ?? "Failed to update shipment.");
    } finally {
      setEditBusy(false);
    }
  }

  async function deleteSelected() {
    if (!selectedShipmentId) return;
    const yes = window.confirm("Delete this shipment row? This cannot be undone.");
    if (!yes) return;

    try {
      const { error } = await supabase.from("shipments").delete().eq("id", selectedShipmentId);
      if (error) throw error;

      setSelectedShipmentId(null);
      await loadAll();
    } catch (e: any) {
      alert(e?.message ?? "Failed to delete row.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="text-sm font-semibold text-neutral-900">Shipments</div>
          <div className="mt-1 text-xs text-neutral-600">
            Track shipment boxes, costs, units, weights and tracking.
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            Hard-wired to the selected tax year using shipment date ({fyLabel})
          </div>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:flex-nowrap">
          <div className="min-w-0 lg:w-[320px]">
            <input
              className={inputClass()}
              placeholder="Search box / tracking / carrier / dates…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
            <button
              className={buttonClass()}
              disabled={!selectedShipmentId}
              onClick={() => {
                const row = shipments.find((s) => s.id === selectedShipmentId);
                if (row) openEditFor(row);
              }}
              title={!selectedShipmentId ? "Select a row first" : "Edit selected"}
            >
              Edit
            </button>

            <button
              className={buttonClass()}
              disabled={!selectedShipmentId}
              onClick={deleteSelected}
              title={!selectedShipmentId ? "Select a row first" : "Delete selected"}
            >
              Delete
            </button>

            <button className={buttonClass(true)} onClick={addShipmentAuto} disabled={addBusy}>
              {addBusy ? "Adding…" : "+ Add Shipment"}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Boxes</div>
          <div className="mt-1 text-lg font-semibold text-neutral-900">{shipmentTotals.boxes}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Units</div>
          <div className="mt-1 text-lg font-semibold text-neutral-900">{shipmentTotals.units}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Cost</div>
          <div className="mt-1 text-lg font-semibold text-neutral-900">{money(shipmentTotals.cost)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Tax</div>
          <div className="mt-1 text-lg font-semibold text-neutral-900">{money(shipmentTotals.tax)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Total</div>
          <div className="mt-1 text-lg font-semibold text-neutral-900">{money(shipmentTotals.total)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Box Value</div>
          <div className="mt-1 text-lg font-semibold text-neutral-900">{money(shipmentTotals.boxValue)}</div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        {loading ? (
          <div className="text-sm text-neutral-700">Loading…</div>
        ) : pageError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {pageError}
          </div>
        ) : filteredShipments.length === 0 ? (
          <div className="text-sm text-neutral-700">No shipments found in {fyLabel}.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-neutral-600">
                <tr className="border-b">
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Shipment BoxNo</th>
                  <th className="py-3 pr-4">Shipment Date</th>
                  <th className="py-3 pr-4">Checkin Date</th>
                  <th className="py-3 pr-4">Cost</th>
                  <th className="py-3 pr-4">Tax</th>
                  <th className="py-3 pr-4">Total</th>
                  <th className="py-3 pr-4">Units</th>
                  <th className="py-3 pr-4">Cost Per Item</th>
                  <th className="py-3 pr-4">Box Value</th>
                  <th className="py-3 pr-4">Weight (KG)</th>
                  <th className="py-3 pr-4">Tracking No</th>
                  <th className="py-3 pr-4">Carrier</th>
                  <th className="py-3 pr-4">Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredShipments.map((r) => {
                  const isSelected = selectedShipmentId === r.id;
                  const st = computeShipmentStatus(r);
                  const trackingUrl = getTrackingUrl(r.carrier, r.tracking_no);

                  return (
                    <tr
                      key={r.id}
                      className={[
                        "border-b last:border-b-0 cursor-pointer transition",
                        "hover:bg-neutral-50",
                        isSelected ? "bg-neutral-100" : "",
                      ].join(" ")}
                      onClick={() => setSelectedShipmentId(r.id)}
                      onDoubleClick={() => openEditFor(r)}
                      title="Click to select • Double-click to edit"
                    >
                      <td className="py-3 pr-4">
                        <span
                          className={[
                            "inline-flex items-center rounded-full border px-2 py-1 text-xs whitespace-nowrap",
                            statusPillColor(st),
                          ].join(" ")}
                        >
                          {statusLabel(st)}
                        </span>
                      </td>

                      <td className="py-3 pr-4 font-semibold text-neutral-900 whitespace-nowrap">
                        {r.shipment_box_no}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">{fmtDate(r.shipment_date)}</td>
                      <td className="py-3 pr-4 whitespace-nowrap">{fmtDate(r.checkin_date)}</td>

                      <td className="py-3 pr-4 whitespace-nowrap">
                        {r.cost == null ? "-" : money(Number(r.cost))}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        {r.tax == null ? "-" : money(Number(r.tax))}
                      </td>
                      <td className="py-3 pr-4 font-semibold text-neutral-900 whitespace-nowrap">
                        {r.total == null ? "-" : money(Number(r.total))}
                      </td>

                      <td className="py-3 pr-4 whitespace-nowrap">{r.units ?? "-"}</td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        {r.cost_per_item == null ? "-" : money(Number(r.cost_per_item))}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        {r.box_value == null ? "-" : money(Number(r.box_value))}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        {r.weight_kg == null ? "-" : String(r.weight_kg)}
                      </td>

                      <td className="py-3 pr-4 whitespace-nowrap">
                        {r.tracking_no ? (
                          trackingUrl ? (
                            <a
                              href={trackingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 underline hover:text-blue-800"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {r.tracking_no}
                            </a>
                          ) : (
                            r.tracking_no
                          )
                        ) : (
                          "-"
                        )}
                      </td>

                      <td className="py-3 pr-4 whitespace-nowrap">
                        {(r.carrier ?? "").trim() ? r.carrier : "UPS"}
                      </td>

                      <td className="py-3 pr-4">
                        <div className="flex flex-nowrap items-center gap-2">
                          <button
                            type="button"
                            className={miniBtn()}
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditFor(r);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className={miniBtn(true)}
                            onClick={async (e) => {
                              e.stopPropagation();
                              setSelectedShipmentId(r.id);
                              await deleteSelected();
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editOpen && selectedShipment && (
        <div className={modalBackdrop()} onMouseDown={() => setEditOpen(false)}>
          <div className={modalCard()} onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b p-5">
              <div>
                <div className="text-lg font-semibold text-neutral-900">Edit Shipment</div>
                <div className="mt-1 text-xs text-neutral-600">
                  Tax auto (20% of Cost). Total auto (Cost + Tax). Cost/Item auto = Total ÷ Units.
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
              {editError && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {editError}
                </div>
              )}

              <div className="rounded-2xl border p-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <div className={fieldLabel()}>Shipment BoxNo *</div>
                    <input
                      className={inputClass()}
                      value={eBoxNo}
                      onChange={(e) => setEBoxNo(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <div className={fieldLabel()}>Shipment Date</div>
                    <input
                      className={inputClass()}
                      type="date"
                      value={eShipmentDate}
                      onChange={(e) => setEShipmentDate(e.target.value)}
                    />
                  </div>

                  <div>
                    <div className={fieldLabel()}>Checkin Date</div>
                    <input
                      className={inputClass()}
                      type="date"
                      value={eCheckinDate}
                      onChange={(e) => setECheckinDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <div className={fieldLabel()}>Cost (£)</div>
                    <input
                      className={inputClass()}
                      inputMode="decimal"
                      value={eCostStr}
                      onChange={(e) => setECostStr(sanitizeDecimalInput(e.target.value))}
                    />
                  </div>

                  <div>
                    <div className={fieldLabel()}>Tax (£) (20%)</div>
                    <input
                      className={inputClassDisabled()}
                      value={eTaxCalc == null ? "" : String(eTaxCalc)}
                      readOnly
                    />
                  </div>

                  <div>
                    <div className={fieldLabel()}>Total (£)</div>
                    <input
                      className={inputClassDisabled()}
                      value={eTotalCalc == null ? "" : String(eTotalCalc)}
                      readOnly
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <div className={fieldLabel()}>Units</div>
                    <input
                      className={inputClass()}
                      inputMode="numeric"
                      value={eUnitsStr}
                      onChange={(e) => setEUnitsStr(e.target.value.replace(/[^\d]/g, ""))}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <div className="text-[11px] text-neutral-500 mt-6">
                      Cost Per Item auto = Total ÷ Units
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <div className={fieldLabel()}>Cost Per Item (£)</div>
                    <input className={inputClassDisabled()} value={eCostPerItemStr} readOnly />
                  </div>

                  <div>
                    <div className={fieldLabel()}>Box Value (£)</div>
                    <input className={inputClassDisabled()} value={eBoxValueStr} readOnly />
                  </div>

                  <div>
                    <div className={fieldLabel()}>Weight (KG)</div>
                    <input
                      className={inputClass()}
                      inputMode="decimal"
                      value={eWeightStr}
                      onChange={(e) => setEWeightStr(sanitizeDecimalInput(e.target.value))}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <div className={fieldLabel()}>Tracking No</div>
                    <input
                      className={inputClass()}
                      value={eTrackingNo}
                      onChange={(e) => setETrackingNo(e.target.value)}
                    />
                  </div>

                  <div>
                    <div className={fieldLabel()}>Carrier</div>
                    <input
                      className={inputClass()}
                      value={eCarrier}
                      onChange={(e) => setECarrier(e.target.value)}
                      placeholder="UPS"
                    />
                  </div>
                </div>

                <div className="flex flex-nowrap justify-end gap-2 pt-2">
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
      )}
    </div>
  );
}
 