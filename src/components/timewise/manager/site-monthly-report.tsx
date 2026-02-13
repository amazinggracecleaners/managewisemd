
"use client";

import React, { useMemo } from "react";
import { aggregateMonthlySiteProfit, exportSiteMonthCSV } from "@/lib/profit";
import type {
    Entry,
    Employee,
    MileageLog,
    OtherExpense,
    Invoice,
    Settings,
  } from "@/shared/types/domain";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

type Props = {
  fromDate?: string; // "YYYY-MM-DD" from Manager filters (optional)
  entries: any[];
  employees: any[];
  mileageLogs: any[];
  otherExpenses: any[];
  invoices: Invoice[];
  settings: Settings;
  deleteSiteAction: (siteId: string) => void;
};

const chip = (v: number) => (
  <span
    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
      v >= 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
    }`}
    title={v.toFixed(2)}
  >
    {v >= 0 ? "Profit" : "Loss"} {Math.abs(v).toFixed(2)}
  </span>
);

export function SiteMonthlyReport({
  fromDate,
  entries,
  employees,
  mileageLogs,
  otherExpenses,
  invoices,
  settings,
  deleteSiteAction,
}: Props) {
  const monthISO = useMemo(() => {
    // derive "YYYY-MM" from fromDate if present
    if (!fromDate) return undefined;
    const [y, m] = fromDate.split("-"); // naive, safe for "YYYY-MM-DD"
    if (y && m) return `${y}-${m}`;
    return undefined;
  }, [fromDate]);

  const { rows, totals } = useMemo(
    () =>
      aggregateMonthlySiteProfit({
        entries,
        employees,
        mileageLogs,
        otherExpenses,
        invoices,
        settings,
        monthISO,
      }),
    [entries, employees, mileageLogs, otherExpenses, invoices, monthISO, settings]
  );

  if (!rows.length) {
    return (
      <div className="mt-6 border rounded-xl p-4">
        <h3 className="text-base font-semibold mb-3">Site Profitability (Monthly)</h3>
        <p className="text-sm text-muted-foreground">No data for the selected month.</p>
      </div>
    );
  }

  return (
    <div className="mt-6 border rounded-xl p-4">
       <div className="flex justify-between items-center mb-3">
          <h3 className="text-base font-semibold">Site Profitability (Monthly)</h3>
          <button
            onClick={() => exportSiteMonthCSV({ rows: rows as any, totals, monthISO })}
            className="inline-flex items-center rounded-lg px-3 py-1.5 text-sm border hover:bg-muted"
          >
            Export CSV
          </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left">
            <tr className="border-b">
              <th className="py-2 pr-3">Site</th>
              <th className="py-2 pr-3 text-right">Service Charge</th>
              <th className="py-2 pr-3 text-right">Labor</th>
              <th className="py-2 pr-3 text-right">Mileage</th>
              <th className="py-2 pr-3 text-right">Other</th>
              <th className="py-2 pr-3 text-right">Net</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pl-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.siteId} className="border-b last:border-0">
                <td className="py-2 pr-3">{r.siteName}</td>
                <td className="py-2 pr-3 text-right">{r.serviceCharge.toFixed(2)}</td>
                <td className="py-2 pr-3 text-right">{r.labor.toFixed(2)}</td>
                <td className="py-2 pr-3 text-right">{r.mileage.toFixed(2)}</td>
                <td className="py-2 pr-3 text-right">{r.other.toFixed(2)}</td>
                <td className="py-2 pr-3 text-right font-medium">{r.net.toFixed(2)}</td>
                <td className="py-2 pr-0">{chip(r.net)}</td>
                <td className="py-2 pl-3 text-right">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteSiteAction(r.siteId)}
                        title={`Delete ${r.siteName}`}
                    >
                        <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t font-semibold">
              <td className="py-2 pr-3">Total</td>
              <td className="py-2 pr-3 text-right">{totals.serviceCharge.toFixed(2)}</td>
              <td className="py-2 pr-3 text-right">{totals.labor.toFixed(2)}</td>
              <td className="py-2 pr-3 text-right">{totals.mileage.toFixed(2)}</td>
              <td className="py-2 pr-3 text-right">{totals.other.toFixed(2)}</td>
              <td className="py-2 pr-3 text-right">{totals.net.toFixed(2)}</td>
              <td className="py-2 pr-0"></td>
              <td className="py-2 pl-3"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
