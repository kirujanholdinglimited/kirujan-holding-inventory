"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

type ProductRow = {
  id: string;
  asin: string | null;
  brand: string | null;
  product_name: string | null;
  product_code: number | null;
};

/* -------------------- Formatting helpers -------------------- */

// Keep user typing comfortable: preserve ONE trailing space if they just typed a space.
function titleCaseLive(input: string) {
  const hasTrailingSpace = /\s$/.test(input);

  // Collapse internal multi-spaces but do NOT kill trailing space during typing
  const core = input.replace(/\s+/g, " ").trim();

  const cased = core
    ? core
        .split(" ")
        .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ""))
        .join(" ")
    : "";

  return hasTrailingSpace ? (cased ? cased + " " : "") : cased;
}

function normalizeAsin(input: string) {
  // Remove spaces and uppercase
  return input.replace(/\s+/g, "").trim().toUpperCase();
}

function friendlyDbError(message: string) {
  const m = (message || "").toLowerCase();

  // ASIN unique index/constraint names (yours showed products_asin_key)
  if (m.includes("products_asin_key") || m.includes("products_asin_unique") || (m.includes("duplicate") && m.includes("asin"))) {
    return "ASIN already exists.";
  }

  // Product name unique index/constraint
  if (
    m.includes("products_product_name_key") ||
    m.includes("products_product_name_unique") ||
    (m.includes("duplicate") && m.includes("product_name"))
  ) {
    return "Product name already exists.";
  }

  return message || "Something went wrong. Please try again.";
}

/* -------------------- UI helpers -------------------- */

function Section({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-neutral-900">{title}</div>
          {subtitle && <div className="mt-1 text-xs text-neutral-600">{subtitle}</div>}
        </div>
        {right}
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
}

function ModalShell({
  open,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl rounded-2xl border bg-white p-6 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold text-neutral-900">{title}</div>
            {subtitle && <div className="mt-1 text-xs text-neutral-600">{subtitle}</div>}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50"
          >
            Close
          </button>
        </div>

        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

/* -------------------- Page -------------------- */

export default function CatalogPage() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageErr, setPageErr] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Create modal state
  const [openCreate, setOpenCreate] = useState(false);
  const [createAsin, setCreateAsin] = useState("");
  const [createBrand, setCreateBrand] = useState("");
  const [createName, setCreateName] = useState("");
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [savingCreate, setSavingCreate] = useState(false);

  // Edit modal state
  const [openEdit, setOpenEdit] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState<number | null>(null);
  const [editAsin, setEditAsin] = useState("");
  const [editBrand, setEditBrand] = useState("");
  const [editName, setEditName] = useState("");
  const [editErr, setEditErr] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const selectedRow = useMemo(
    () => (selectedId ? rows.find((r) => r.id === selectedId) ?? null : null),
    [rows, selectedId]
  );

  const nextCodePreview = useMemo(() => {
    const max = rows.reduce((acc, r) => Math.max(acc, r.product_code ?? 0), 0);
    return max + 1;
  }, [rows]);

  async function load() {
    setLoading(true);
    setPageErr(null);

    const { data, error } = await supabase
      .from("products")
      .select("id, asin, brand, product_name, product_code")
      .order("product_code", { ascending: true });

    if (error) {
      setRows([]);
      setPageErr(error.message);
    } else {
      setRows((data ?? []) as ProductRow[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((r) => {
      const code = String(r.product_code ?? "");
      const asin = (r.asin ?? "").toLowerCase();
      const brand = (r.brand ?? "").toLowerCase();
      const name = (r.product_name ?? "").toLowerCase();
      return (
        code.includes(needle) ||
        asin.includes(needle) ||
        brand.includes(needle) ||
        name.includes(needle)
      );
    });
  }, [rows, q]);

  function openCreateModal() {
    setCreateErr(null);
    setCreateAsin("");
    setCreateBrand("");
    setCreateName("");
    setOpenCreate(true);
  }

  function openEditModal(row: ProductRow) {
    setEditErr(null);
    setEditId(row.id);
    setEditCode(row.product_code ?? null);
    setEditAsin(row.asin ?? "");
    setEditBrand(row.brand ?? "");
    setEditName(row.product_name ?? "");
    setOpenEdit(true);
  }

  async function createProduct() {
    setCreateErr(null);

    const asin = normalizeAsin(createAsin);
    const brand = titleCaseLive(createBrand).trim();
    const name = titleCaseLive(createName).trim();

    if (!asin) return setCreateErr("ASIN is required.");
    if (!brand) return setCreateErr("Brand is required.");
    if (!name) return setCreateErr("Product name is required.");

    setSavingCreate(true);

    // product_code is IDENTITY in DB, do NOT send it
    const { error } = await supabase.from("products").insert([
      {
        asin,
        brand,
        product_name: name,
      },
    ]);

    setSavingCreate(false);

    if (error) {
      setCreateErr(friendlyDbError(error.message));
      return;
    }

    setOpenCreate(false);
    await load();
  }

  async function saveEdit() {
    if (!editId) return;

    setEditErr(null);

    const asin = normalizeAsin(editAsin);
    const brand = titleCaseLive(editBrand).trim();
    const name = titleCaseLive(editName).trim();

    if (!asin) return setEditErr("ASIN is required.");
    if (!brand) return setEditErr("Brand is required.");
    if (!name) return setEditErr("Product name is required.");

    setSavingEdit(true);

    const { error } = await supabase
      .from("products")
      .update({
        asin,
        brand,
        product_name: name,
      })
      .eq("id", editId);

    setSavingEdit(false);

    if (error) {
      setEditErr(friendlyDbError(error.message));
      return;
    }

    setOpenEdit(false);
    await load();
  }

  async function deleteSelected() {
    if (!selectedRow) return;

    const ok = window.confirm(
      `Delete this product?\n\nCode: ${selectedRow.product_code ?? "-"}\nASIN: ${selectedRow.asin ?? "-"}\nName: ${selectedRow.product_name ?? "-"}`
    );
    if (!ok) return;

    const { error } = await supabase.from("products").delete().eq("id", selectedRow.id);
    if (error) {
      alert(friendlyDbError(error.message));
      return;
    }

    setSelectedId(null);
    await load();
  }

  return (
    <div className="space-y-6">
      <Section
        title="Catalog"
        subtitle="Product list (ASIN • Brand • Product Name • Code)"
        right={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="w-72 max-w-full">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search asin / brand / name / code…"
                className="w-full rounded-xl border bg-white px-3 py-2 text-sm"
              />
            </div>

            <button
              type="button"
              onClick={openCreateModal}
              className="rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white"
            >
              + Add Product
            </button>

            <button
              type="button"
              disabled={!selectedRow}
              onClick={() => selectedRow && openEditModal(selectedRow)}
              className="rounded-xl border px-4 py-2 text-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Edit
            </button>

            <button
              type="button"
              disabled={!selectedRow}
              onClick={deleteSelected}
              className="rounded-xl border px-4 py-2 text-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Delete
            </button>
          </div>
        }
      >
        {pageErr && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {pageErr}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-neutral-700">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-neutral-700">No products found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-neutral-600">
                <tr className="border-b">
                  <th className="py-3 pr-4">Code</th>
                  <th className="py-3 pr-4">ASIN</th>
                  <th className="py-3 pr-4">Brand</th>
                  <th className="py-3 pr-4">Product Name</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const isSelected = r.id === selectedId;
                  return (
                    <tr
                      key={r.id}
                      className={`border-b last:border-b-0 cursor-pointer ${
                        isSelected ? "bg-neutral-50" : "hover:bg-neutral-50"
                      }`}
                      onClick={() => setSelectedId(r.id)}
                      onDoubleClick={() => openEditModal(r)}
                      title="Double click to edit"
                    >
                      <td className="py-3 pr-4 font-semibold text-neutral-900">
                        {r.product_code ?? "-"}
                      </td>
                      <td className="py-3 pr-4">{r.asin ?? "-"}</td>
                      <td className="py-3 pr-4">{r.brand ?? "-"}</td>
                      <td className="py-3 pr-4">{r.product_name ?? "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="mt-3 text-xs text-neutral-500">
              Tip: click to select • double-click to edit • press Enter to save in the popup
            </div>
          </div>
        )}
      </Section>

      {/* ---------------- Create Modal ---------------- */}
      <ModalShell
        open={openCreate}
        title="Add Product"
        subtitle="Product code is automatic and cannot be edited."
        onClose={() => setOpenCreate(false)}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createProduct();
          }}
        >
          {createErr && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {createErr}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs text-neutral-600">Product Code</label>
              <input
                value={String(nextCodePreview)}
                disabled
                className="mt-1 w-full rounded-xl border bg-neutral-100 px-3 py-2 text-sm text-neutral-600"
              />
            </div>

            <div>
              <label className="text-xs text-neutral-600">ASIN</label>
              <input
                value={createAsin}
                onChange={(e) => setCreateAsin(e.target.value)}
                onBlur={(e) => setCreateAsin(normalizeAsin(e.target.value))}
                className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"
                placeholder="e.g. B07NDB2SFH"
              />
            </div>

            <div>
              <label className="text-xs text-neutral-600">Brand</label>
              <input
                value={createBrand}
                onChange={(e) => setCreateBrand(titleCaseLive(e.target.value))}
                className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"
                placeholder="e.g. Lego Star Wars"
              />
            </div>

            <div>
              <label className="text-xs text-neutral-600">Product Name</label>
              <input
                value={createName}
                onChange={(e) => setCreateName(titleCaseLive(e.target.value))}
                className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"
                placeholder="e.g. X Wing Fighter"
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpenCreate(false)}
              className="rounded-xl border px-4 py-2 text-sm hover:bg-neutral-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={savingCreate}
              className="rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {savingCreate ? "Saving…" : "Create Product"}
            </button>
          </div>
        </form>
      </ModalShell>

      {/* ---------------- Edit Modal ---------------- */}
      <ModalShell
        open={openEdit}
        title="Edit Product"
        subtitle="Press Enter to save."
        onClose={() => setOpenEdit(false)}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveEdit();
          }}
        >
          {editErr && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {editErr}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs text-neutral-600">Product Code</label>
              <input
                value={editCode == null ? "" : String(editCode)}
                disabled
                className="mt-1 w-full rounded-xl border bg-neutral-100 px-3 py-2 text-sm text-neutral-600"
              />
            </div>

            <div>
              <label className="text-xs text-neutral-600">ASIN</label>
              <input
                value={editAsin}
                onChange={(e) => setEditAsin(e.target.value)}
                onBlur={(e) => setEditAsin(normalizeAsin(e.target.value))}
                className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-neutral-600">Brand</label>
              <input
                value={editBrand}
                onChange={(e) => setEditBrand(titleCaseLive(e.target.value))}
                className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-neutral-600">Product Name</label>
              <input
                value={editName}
                onChange={(e) => setEditName(titleCaseLive(e.target.value))}
                className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpenEdit(false)}
              className="rounded-xl border px-4 py-2 text-sm hover:bg-neutral-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={savingEdit}
              className="rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {savingEdit ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </ModalShell>
    </div>
  );
}
