"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

type LegoRow = {
  id: string;
  product_no: number;
  lego_no: string;
  current_max: number;
  all_time_min: number;
  all_time_max: number;
  created_at: string;
  updated_at: string;
};

type SortKey =
  | "lego_no_asc"
  | "product_no_asc"
  | "current_max_desc"
  | "all_time_min_asc"
  | "all_time_max_desc"
  | "updated_at_desc";

function money(n: number) {
  return `£${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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

function normalizeLegoNo(v: string) {
  return v.replace(/[^\d]/g, "");
}

function inputClass() {
  return "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-300 focus:ring-4 focus:ring-neutral-100";
}

function buttonClass(primary?: boolean, danger?: boolean) {
  if (danger) {
    return "inline-flex items-center justify-center whitespace-nowrap rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 shadow-sm transition hover:bg-red-100 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60";
  }

  return primary
    ? "inline-flex items-center justify-center whitespace-nowrap rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
    : "inline-flex items-center justify-center whitespace-nowrap rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60";
}

function smallActionButtonClass() {
  return "inline-flex items-center justify-center whitespace-nowrap rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 active:scale-[0.99]";
}

function linkButtonClass(kind: "auction" | "bin" | "offer" | "sold") {
  const base =
    "inline-flex min-w-[76px] items-center justify-center whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm transition active:scale-[0.99]";

  switch (kind) {
    case "auction":
      return `${base} border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100`;
    case "bin":
      return `${base} border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100`;
    case "offer":
      return `${base} border border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100`;
    case "sold":
      return `${base} border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100`;
  }
}

function fieldLabel() {
  return "mb-1 text-xs font-medium text-neutral-700";
}

function modalBackdrop() {
  return "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px]";
}

function buildAuctionUrl(legoNo: string) {
  const q = encodeURIComponent(`LEGO ${legoNo}`);
  return `https://www.ebay.co.uk/sch/i.html?_nkw=${q}&LH_Auction=1&LH_ItemCondition=1000&_sop=15`;
}

function buildBinUrl(legoNo: string) {
  const q = encodeURIComponent(`LEGO ${legoNo}`);
  return `https://www.ebay.co.uk/sch/i.html?_nkw=${q}&LH_BIN=1&LH_ItemCondition=1000&_sop=15`;
}

function buildOfferUrl(legoNo: string) {
  const q = encodeURIComponent(`LEGO ${legoNo}`);
  return `https://www.ebay.co.uk/sch/i.html?_nkw=${q}&LH_BO=1&LH_ItemCondition=1000&_sop=15`;
}

function buildSoldUrl(legoNo: string) {
  const q = encodeURIComponent(`LEGO ${legoNo}`);
  return `https://www.ebay.co.uk/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1&LH_ItemCondition=1000&_sop=10`;
}

function formatDateTime(v: string) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";

  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LegoPage() {
  const [rows, setRows] = useState<LegoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("lego_no_asc");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<LegoRow | null>(null);
  const [legoNoStr, setLegoNoStr] = useState("");
  const [currentMaxStr, setCurrentMaxStr] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [deleteBusy, setDeleteBusy] = useState(false);

  async function loadAll() {
    setLoading(true);
    setPageError(null);

    try {
      const { data, error } = await supabase
        .from("lego_tracker")
        .select(
          "id, product_no, lego_no, current_max, all_time_min, all_time_max, created_at, updated_at"
        )
        .order("lego_no", { ascending: true });

      if (error) throw error;
      setRows((data ?? []) as LegoRow[]);
    } catch (e: any) {
      setPageError(e?.message ?? "Failed to load LEGO tracker.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setModalOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const filteredRows = useMemo(() => {
    const q = normalizeLegoNo(search);
    const base = q ? rows.filter((r) => r.lego_no.includes(q)) : [...rows];

    base.sort((a, b) => {
      switch (sortBy) {
        case "product_no_asc":
          return Number(a.product_no ?? 0) - Number(b.product_no ?? 0);
        case "current_max_desc":
          return Number(b.current_max ?? 0) - Number(a.current_max ?? 0);
        case "all_time_min_asc":
          return Number(a.all_time_min ?? 0) - Number(b.all_time_min ?? 0);
        case "all_time_max_desc":
          return Number(b.all_time_max ?? 0) - Number(a.all_time_max ?? 0);
        case "updated_at_desc":
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        case "lego_no_asc":
        default:
          return String(a.lego_no).localeCompare(String(b.lego_no), undefined, {
            numeric: true,
          });
      }
    });

    return base;
  }, [rows, search, sortBy]);

  const exactMatch = useMemo(() => {
    const q = normalizeLegoNo(search);
    if (!q) return null;
    return rows.find((r) => r.lego_no === q) ?? null;
  }, [rows, search]);

  const canShowAddButton = useMemo(() => {
    const q = normalizeLegoNo(search);
    return !!q && !exactMatch;
  }, [search, exactMatch]);

  function resetModalState() {
    setEditingRow(null);
    setLegoNoStr("");
    setCurrentMaxStr("");
    setSaveError(null);
    setSaveBusy(false);
    setDeleteBusy(false);
  }

  function closeModal() {
    setModalOpen(false);
    resetModalState();
  }

  function openAddModal() {
    const q = normalizeLegoNo(search);
    setEditingRow(null);
    setLegoNoStr(q);
    setCurrentMaxStr("");
    setSaveError(null);
    setModalOpen(true);
  }

  function openEditModal(row: LegoRow) {
    setEditingRow(row);
    setLegoNoStr(row.lego_no);
    setCurrentMaxStr(String(Number(row.current_max ?? 0)));
    setSaveError(null);
    setModalOpen(true);
  }

  async function saveRow() {
    const legoNo = normalizeLegoNo(legoNoStr);
    const currentMax = parseDecimalOrZero(currentMaxStr);

    if (!legoNo) {
      setSaveError("LEGO number is required.");
      return;
    }

    if (currentMax <= 0) {
      setSaveError("Current max price must be above £0.00.");
      return;
    }

    setSaveBusy(true);
    setSaveError(null);

    try {
      if (editingRow) {
        const nextMin = Math.min(Number(editingRow.all_time_min ?? currentMax), currentMax);
        const nextMax = Math.max(Number(editingRow.all_time_max ?? currentMax), currentMax);

        const { error } = await supabase
          .from("lego_tracker")
          .update({
            current_max: currentMax,
            all_time_min: nextMin,
            all_time_max: nextMax,
          })
          .eq("id", editingRow.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("lego_tracker").insert({
          lego_no: legoNo,
          current_max: currentMax,
          all_time_min: currentMax,
          all_time_max: currentMax,
        });

        if (error) throw error;
      }

      closeModal();
      await loadAll();
    } catch (e: any) {
      setSaveError(e?.message ?? "Failed to save LEGO set.");
    } finally {
      setSaveBusy(false);
    }
  }

  async function deleteRow() {
    if (!editingRow) return;

    setDeleteBusy(true);
    setSaveError(null);

    try {
      const { error } = await supabase.from("lego_tracker").delete().eq("id", editingRow.id);
      if (error) throw error;

      if (selectedId === editingRow.id) {
        setSelectedId(null);
      }

      closeModal();
      await loadAll();
    } catch (e: any) {
      setSaveError(e?.message ?? "Failed to delete LEGO set.");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function copyLegoNo(legoNo: string, e?: React.MouseEvent<HTMLButtonElement>) {
    e?.stopPropagation();

    try {
      await navigator.clipboard.writeText(legoNo);
    } catch {
      // no-op
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-sm font-semibold text-neutral-900">Lego</div>
          <div className="mt-1 text-xs text-neutral-600">
            Track current max price and all-time min / max for LEGO sets.
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm shadow-sm">
          Tracking: <span className="font-semibold text-neutral-900">{rows.length}</span> LEGO sets
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative w-full lg:flex-1">
            <input
              className={`${inputClass()} pr-11`}
              placeholder="Search LEGO number…"
              value={search}
              onChange={(e) => setSearch(normalizeLegoNo(e.target.value))}
            />

            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-sm font-medium text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-700"
                aria-label="Clear search"
                title="Clear"
              >
                ×
              </button>
            ) : null}
          </div>

          <div className="w-full lg:w-56">
            <select
              className={inputClass()}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
            >
              <option value="lego_no_asc">Sort: Lego No</option>
              <option value="product_no_asc">Sort: Product No</option>
              <option value="current_max_desc">Sort: Current Max</option>
              <option value="all_time_min_asc">Sort: All Time Min</option>
              <option value="all_time_max_desc">Sort: All Time Max</option>
              <option value="updated_at_desc">Sort: Last Updated</option>
            </select>
          </div>

          {canShowAddButton ? (
            <div className="flex justify-end">
              <button type="button" className={buttonClass(true)} onClick={openAddModal}>
                + Add New Lego Set
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        {loading ? (
          <div className="text-sm text-neutral-700">Loading…</div>
        ) : pageError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {pageError}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="text-sm text-neutral-700">No LEGO sets found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-neutral-600">
                <tr className="border-b border-neutral-200">
                  <th className="py-3 pr-4">Product No</th>
                  <th className="py-3 pr-4">Lego No</th>
                  <th className="py-3 pr-4">Copy</th>
                  <th className="py-3 pr-4 text-center">Current Max</th>
                  <th className="py-3 pr-4">Auction</th>
                  <th className="py-3 pr-4">BIN</th>
                  <th className="py-3 pr-4">Offer</th>
                  <th className="py-3 pr-4">Sold</th>
                  <th className="py-3 pr-4 text-center">All Time Min</th>
                  <th className="py-3 pr-4 text-center">All Time Max</th>
                  <th className="py-3 pr-4">Last Updated</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.map((row) => {
                  const isSelected = selectedId === row.id;

                  return (
                    <tr
                      key={row.id}
                      className={[
                        "cursor-pointer border-b border-neutral-100 last:border-b-0 transition",
                        isSelected ? "bg-neutral-50" : "hover:bg-neutral-50/70",
                      ].join(" ")}
                      onClick={() => setSelectedId(row.id)}
                      onDoubleClick={() => openEditModal(row)}
                      title="Double-click to update current max"
                    >
                      <td className="py-3 pr-4 font-semibold text-neutral-900">
                        {row.product_no ?? "—"}
                      </td>

                      <td className="py-3 pr-4 font-semibold text-neutral-900">{row.lego_no}</td>

                      <td className="py-3 pr-4">
                        <button
                          type="button"
                          className={smallActionButtonClass()}
                          onClick={(e) => copyLegoNo(row.lego_no, e)}
                        >
                          Copy
                        </button>
                      </td>

                      <td className="py-3 pr-4 text-center">{money(Number(row.current_max ?? 0))}</td>

                      <td className="py-3 pr-4">
                        <a
                          href={buildAuctionUrl(row.lego_no)}
                          target="_blank"
                          rel="noreferrer"
                          className={linkButtonClass("auction")}
                          onClick={(e) => e.stopPropagation()}
                        >
                          Auction
                        </a>
                      </td>

                      <td className="py-3 pr-4">
                        <a
                          href={buildBinUrl(row.lego_no)}
                          target="_blank"
                          rel="noreferrer"
                          className={linkButtonClass("bin")}
                          onClick={(e) => e.stopPropagation()}
                        >
                          BIN
                        </a>
                      </td>

                      <td className="py-3 pr-4">
                        <a
                          href={buildOfferUrl(row.lego_no)}
                          target="_blank"
                          rel="noreferrer"
                          className={linkButtonClass("offer")}
                          onClick={(e) => e.stopPropagation()}
                        >
                          Offer
                        </a>
                      </td>

                      <td className="py-3 pr-4">
                        <a
                          href={buildSoldUrl(row.lego_no)}
                          target="_blank"
                          rel="noreferrer"
                          className={linkButtonClass("sold")}
                          onClick={(e) => e.stopPropagation()}
                        >
                          Sold
                        </a>
                      </td>

                      <td className="py-3 pr-4 text-center">{money(Number(row.all_time_min ?? 0))}</td>
                      <td className="py-3 pr-4 text-center">{money(Number(row.all_time_max ?? 0))}</td>
                      <td className="py-3 pr-4">{formatDateTime(row.updated_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen ? (
        <div className={modalBackdrop()} onMouseDown={closeModal}>
          <div
            className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-neutral-200 p-5">
              <div>
                <div className="text-lg font-semibold text-neutral-900">
                  {editingRow ? "Update Lego Set" : "Add New Lego Set"}
                </div>
                <div className="mt-1 text-xs text-neutral-600">
                  Enter the current max price and press Enter to save.
                </div>
              </div>

              <button type="button" className={buttonClass()} onClick={closeModal}>
                Close
              </button>
            </div>

            <form
              className="space-y-3 p-5"
              onSubmit={(e) => {
                e.preventDefault();
                saveRow();
              }}
            >
              {saveError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {saveError}
                </div>
              ) : null}

              <div>
                <div className={fieldLabel()}>Lego No</div>
                <input
                  className={inputClass()}
                  value={legoNoStr}
                  onChange={(e) => setLegoNoStr(normalizeLegoNo(e.target.value))}
                  disabled={!!editingRow}
                />
              </div>

              <div>
                <div className={fieldLabel()}>Current Max Price (£)</div>
                <input
                  className={inputClass()}
                  inputMode="decimal"
                  value={currentMaxStr}
                  onChange={(e) => setCurrentMaxStr(sanitizeDecimalInput(e.target.value))}
                  autoFocus
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <div>
                  {editingRow ? (
                    <button
                      type="button"
                      className={buttonClass(false, true)}
                      onClick={deleteRow}
                      disabled={deleteBusy || saveBusy}
                    >
                      {deleteBusy ? "Deleting…" : "Delete"}
                    </button>
                  ) : null}
                </div>

                <div className="flex gap-2">
                  <button type="button" className={buttonClass()} onClick={closeModal}>
                    Cancel
                  </button>
                  <button type="submit" className={buttonClass(true)} disabled={saveBusy || deleteBusy}>
                    {saveBusy ? "Saving…" : "Save"}
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
