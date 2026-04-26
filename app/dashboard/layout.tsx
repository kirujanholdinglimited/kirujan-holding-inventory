"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "../../lib/supabase";

const TAX_YEAR_STORAGE_KEY = "dashboard_selected_fy_v1";
const TAX_YEAR_OPTIONS_STORAGE_KEY = "dashboard_tax_year_options_v1";
const SIDEBAR_STORAGE_KEY = "dashboard_sidebar_open_v1";

function getUkTaxYearLabel(d: Date) {
  const year = d.getUTCFullYear();
  const apr6 = new Date(Date.UTC(year, 3, 6));
  return d >= apr6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function getNextTaxYearLabel(label: string) {
  const [startYear] = label.split("-").map(Number);
  return `${startYear + 1}-${startYear + 2}`;
}

function isValidTaxYearLabel(label: string) {
  if (!/^\d{4}-\d{4}$/.test(label)) return false;
  const [startYear, endYear] = label.split("-").map(Number);
  return Number.isFinite(startYear) && Number.isFinite(endYear) && endYear === startYear + 1;
}

function sortTaxYears(years: string[]) {
  return [...years].sort((a, b) => {
    const [aStart] = a.split("-").map(Number);
    const [bStart] = b.split("-").map(Number);
    return aStart - bStart;
  });
}

function formatTaxYearRange(label: string) {
  const [a, b] = label.split("-").map(Number);
  return `6 Apr ${a} – 5 Apr ${b}`;
}

function navClass(isActive: boolean) {
  return isActive
    ? "block rounded-xl px-3 py-2 text-sm bg-neutral-900 text-white"
    : "block rounded-xl px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-100";
}

function pageTitleFromPath(path: string) {
  if (path === "/dashboard") return "Dashboard";
  if (path.startsWith("/dashboard/inventory")) return "Inventory";
  if (path.startsWith("/dashboard/sales")) return "Sales";
  if (path.startsWith("/dashboard/expenses")) return "Expenses";
  if (path.startsWith("/dashboard/shipments")) return "Shipments";
  if (path.startsWith("/dashboard/reports")) return "Reports";
  if (path.startsWith("/dashboard/catalog")) return "Catalog";
  if (path.startsWith("/dashboard/lego")) return "Lego";
  if (path.startsWith("/dashboard/finance")) return "Finance";
  if (path.startsWith("/dashboard/payout")) return "Payout";
  return "Dashboard";
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const current = useMemo(() => getUkTaxYearLabel(new Date()), []);
  const defaultTaxYearOptions = useMemo(() => {
    const [startYear] = current.split("-").map(Number);
    return sortTaxYears([
      `${startYear - 1}-${startYear}`,
      current,
      `${startYear + 1}-${startYear + 2}`,
    ]);
  }, [current]);

  const [taxYear, setTaxYear] = useState(current);
  const [taxYearOptions, setTaxYearOptions] = useState<string[]>(defaultTaxYearOptions);
  const [taxYearDropdownOpen, setTaxYearDropdownOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;

      // Refresh-loop fix:
      // Do not force redirect from the dashboard layout.
      // If "/" sends the user back to "/dashboard", this line creates an endless loop.
      // Auth protection can be added back safely later with middleware or a dedicated guard.
      if (!data.session) {
        console.warn("No Supabase session found. Redirect disabled to prevent refresh loop.");
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      const savedSidebarOpen = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);

      if (savedSidebarOpen === "open") {
        setSidebarOpen(true);
        return;
      }

      if (savedSidebarOpen === "closed") {
        setSidebarOpen(false);
        return;
      }

      if (window.innerWidth < 1100) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    } catch {
      if (window.innerWidth < 1100) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    }
  }, []);

  function handleSetSidebarOpen(nextSidebarOpen: boolean) {
    setSidebarOpen(nextSidebarOpen);

    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, nextSidebarOpen ? "open" : "closed");
    } catch {
      // ignore storage errors
    }
  }

  useEffect(() => {
    try {
      const savedTaxYearRaw = window.localStorage.getItem(TAX_YEAR_STORAGE_KEY);
      const savedTaxYear =
        savedTaxYearRaw != null
          ? (() => {
              try {
                return JSON.parse(savedTaxYearRaw);
              } catch {
                return savedTaxYearRaw;
              }
            })()
          : null;
      const savedOptionsRaw = window.localStorage.getItem(TAX_YEAR_OPTIONS_STORAGE_KEY);
      const savedOptions = savedOptionsRaw ? JSON.parse(savedOptionsRaw) : null;

      const mergedOptions = sortTaxYears(
        Array.from(
          new Set([
            ...defaultTaxYearOptions,
            ...(Array.isArray(savedOptions) ? savedOptions.filter((x) => typeof x === "string") : []),
          ])
        )
      );

      setTaxYearOptions(mergedOptions);

      if (savedTaxYear && isValidTaxYearLabel(savedTaxYear) && mergedOptions.includes(savedTaxYear)) {
        setTaxYear(savedTaxYear);
      } else {
        setTaxYear(current);
        window.localStorage.setItem(TAX_YEAR_STORAGE_KEY, JSON.stringify(current));
      }

      window.localStorage.setItem(TAX_YEAR_OPTIONS_STORAGE_KEY, JSON.stringify(mergedOptions));
    } catch {
      setTaxYear(current);
      setTaxYearOptions(defaultTaxYearOptions);
    }
  }, [current, defaultTaxYearOptions]);

  useEffect(() => {
    const onStorage = () => {
      try {
        const savedTaxYearRaw = window.localStorage.getItem(TAX_YEAR_STORAGE_KEY);
        const savedTaxYear =
          savedTaxYearRaw != null
            ? (() => {
                try {
                  return JSON.parse(savedTaxYearRaw);
                } catch {
                  return savedTaxYearRaw;
                }
              })()
            : null;
        const savedOptionsRaw = window.localStorage.getItem(TAX_YEAR_OPTIONS_STORAGE_KEY);
        const savedOptions = savedOptionsRaw ? JSON.parse(savedOptionsRaw) : null;

        const mergedOptions = sortTaxYears(
          Array.from(
            new Set([
              ...defaultTaxYearOptions,
              ...(Array.isArray(savedOptions) ? savedOptions.filter((x) => typeof x === "string") : []),
            ])
          )
        );

        setTaxYearOptions(mergedOptions);
        if (savedTaxYear && isValidTaxYearLabel(savedTaxYear) && mergedOptions.includes(savedTaxYear)) {
          setTaxYear(savedTaxYear);
        }
      } catch {
        // ignore invalid storage values
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [defaultTaxYearOptions]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTaxYearDropdownOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function handleSelectTaxYear(nextTaxYear: string) {
    setTaxYear(nextTaxYear);
    setTaxYearDropdownOpen(false);
    try {
      window.localStorage.setItem(TAX_YEAR_STORAGE_KEY, JSON.stringify(nextTaxYear));
      window.dispatchEvent(new CustomEvent("dashboard-tax-year-change", { detail: { taxYear: nextTaxYear } }));
    } catch {
      // ignore storage errors
    }
  }

  function handleCreateNextTaxYear() {
    const latest = sortTaxYears(taxYearOptions)[taxYearOptions.length - 1] ?? current;
    const next = getNextTaxYearLabel(latest);
    const nextOptions = sortTaxYears(Array.from(new Set([...taxYearOptions, next])));
    setTaxYearOptions(nextOptions);
    setTaxYear(next);
    setTaxYearDropdownOpen(false);

    try {
      window.localStorage.setItem(TAX_YEAR_STORAGE_KEY, JSON.stringify(next));
      window.localStorage.setItem(TAX_YEAR_OPTIONS_STORAGE_KEY, JSON.stringify(nextOptions));
      window.dispatchEvent(new CustomEvent("dashboard-tax-year-change", { detail: { taxYear: next } }));
    } catch {
      // ignore storage errors
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/dashboard";
  }

  const title = pageTitleFromPath(pathname);

  return (
    <div className="min-h-screen overflow-x-hidden bg-neutral-100 text-neutral-900">
      <div className="flex min-h-screen min-w-0">
        <aside
          className={[
            "hidden shrink-0 md:block sticky top-0 h-screen overflow-y-auto border-r bg-white transition-all duration-300",
            sidebarOpen ? "w-64 p-4" : "w-0 p-0 border-r-0 overflow-hidden",
          ].join(" ")}
        >
          {sidebarOpen && (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <Link href="/dashboard" className="block">
                    <div className="text-lg font-bold text-neutral-900">KHL Tracker</div>
                    <div className="mt-1 text-xs text-neutral-900">Private • UK Tax Year</div>
                  </Link>
                </div>

                <button
                  onClick={() => handleSetSidebarOpen(false)}
                  className="rounded-xl border px-3 py-2 text-xs hover:bg-neutral-50"
                >
                  Close
                </button>
              </div>

              <nav className="mt-6 space-y-1">
                <Link className={navClass(pathname === "/dashboard")} href="/dashboard">
                  Dashboard
                </Link>

                <Link className={navClass(pathname.startsWith("/dashboard/catalog"))} href="/dashboard/catalog">
                  Catalog
                </Link>

                <Link className={navClass(pathname.startsWith("/dashboard/inventory"))} href="/dashboard/inventory">
                  Inventory
                </Link>

                <Link className={navClass(pathname.startsWith("/dashboard/sales"))} href="/dashboard/sales">
                  Sales
                </Link>

                <Link className={navClass(pathname.startsWith("/dashboard/expenses"))} href="/dashboard/expenses">
                  Expenses
                </Link>

                <Link className={navClass(pathname.startsWith("/dashboard/finance"))} href="/dashboard/finance">
                  Finance
                </Link>

                <Link className={navClass(pathname.startsWith("/dashboard/shipments"))} href="/dashboard/shipments">
                  Shipments
                </Link>

                <Link className={navClass(pathname.startsWith("/dashboard/lego"))} href="/dashboard/lego">
                  Lego
                </Link>

                <Link className={navClass(pathname.startsWith("/dashboard/reports"))} href="/dashboard/reports">
                  Reports
                </Link>

                <Link className={navClass(pathname.startsWith("/dashboard/payout"))} href="/dashboard/payout">
                  Payout
                </Link>
              </nav>

              <button
                onClick={signOut}
                className="mt-8 w-full rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50"
              >
                Sign out
              </button>
            </>
          )}
        </aside>

        <main className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
          <header className="sticky top-0 z-20 shrink-0 border-b bg-white">
            <div
              className="flex w-full min-w-0 items-center justify-between px-4 py-3"
              onMouseDown={() => taxYearDropdownOpen && setTaxYearDropdownOpen(false)}
            >
              <div className="flex items-center gap-3">
                {!sidebarOpen && (
                  <button
                    onClick={() => handleSetSidebarOpen(true)}
                    className="hidden md:block rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50"
                  >
                    Menu
                  </button>
                )}

                <div>
                  <div className="text-sm font-semibold text-neutral-900">{title}</div>
                  <div className="text-xs text-neutral-900">{formatTaxYearRange(taxYear)}</div>
                </div>
              </div>

              <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2 rounded-2xl border bg-neutral-50 px-3 py-2 shadow-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Tax Year</span>

                  <button
                    type="button"
                    onClick={() => setTaxYearDropdownOpen((prev) => !prev)}
                    className="min-w-[150px] rounded-xl border bg-white px-3 py-2 text-left text-sm font-semibold text-neutral-900 shadow-sm hover:bg-neutral-50"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span>{taxYear}</span>
                      <span className="text-xs text-neutral-500">▼</span>
                    </div>
                  </button>
                </div>

                {taxYearDropdownOpen ? (
                  <div className="absolute right-0 top-full z-30 mt-2 w-[240px] overflow-hidden rounded-2xl border bg-white shadow-lg">
                    {sortTaxYears(taxYearOptions).map((year) => (
                      <button
                        key={year}
                        type="button"
                        className={[
                          "block w-full px-4 py-3 text-left text-sm hover:bg-neutral-50",
                          year === taxYear ? "font-semibold text-neutral-950" : "text-neutral-900",
                        ].join(" ")}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectTaxYear(year);
                        }}
                      >
                        <div>{year}</div>
                        <div className="mt-0.5 text-xs font-normal text-neutral-500">{formatTaxYearRange(year)}</div>
                      </button>
                    ))}

                    <div className="border-t bg-neutral-50 p-2">
                      <button
                        type="button"
                        className="block w-full rounded-xl border bg-white px-3 py-2 text-left text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleCreateNextTaxYear();
                        }}
                      >
                        + New Tax Year
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            <div className="w-full min-w-0 px-6 py-8">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
