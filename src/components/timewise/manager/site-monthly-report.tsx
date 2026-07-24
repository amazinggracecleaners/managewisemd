
"use client";

import React, { useMemo } from "react";
import { aggregateMonthlySiteProfit, exportSiteMonthCSV } from "@/lib/profit";
import type {
    Entry,
    Employee,
    MileageLog,
    OtherExpense,
     CleaningSchedule,
    Settings,
    ServiceFeedback,
     Site,
  } from "@/shared/types/domain";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

type Props = {
  fromDate?: string; // "YYYY-MM-DD" from Manager filters (optional)
  entries: any[];
  employees: any[];
  sites: Site[];
  mileageLogs: any[];
  otherExpenses: any[];
  schedules: CleaningSchedule[];
  settings: Settings;
  serviceFeedbacks: ServiceFeedback[];
onAddServiceFeedbackAction: (feedback: Omit<ServiceFeedback, "id">) => void;
  deleteSiteAction: (siteId: string) => void;
};

const chip = (v: number) => (
  <span
    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold shadow-sm ${
      v >= 0
        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
        : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
    }`}
    title={v.toFixed(2)}
  >
    {v >= 0 ? "Profit" : "Loss"} ${Math.abs(v).toFixed(2)}
  </span>
);

const getRevenueProfit = (r: any) => {
  const revenue = Number(r.revenue ?? 0);
  const labor = Number(r.labor ?? 0);
  const mileage = Number(r.mileage ?? 0);
  const other = Number(r.other ?? 0);

  return revenue - labor - mileage - other;
};

const getRevenueMargin = (r: any) => {
  const revenue = Number(r.revenue ?? 0);
  const profit = getRevenueProfit(r);

  return revenue > 0 ? (profit / revenue) * 100 : 0;
};

const revenueMarginChip = (margin: number) => {
  if (margin >= 20) {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
        Healthy {margin.toFixed(2)}%
      </span>
    );
  }

  if (margin >= 10) {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 shadow-sm dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
        Watch {margin.toFixed(2)}%
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 shadow-sm dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
      Action Needed {margin.toFixed(2)}%
    </span>
  );
};

export function SiteMonthlyReport({
  fromDate,
  entries,
  employees,
   sites,
  mileageLogs,
  otherExpenses,
   schedules,
  settings,
  deleteSiteAction,
serviceFeedbacks,
onAddServiceFeedbackAction,
}: Props) {
  const [selectedRow, setSelectedRow] = React.useState<any | null>(null);
  const [feedbackType, setFeedbackType] = React.useState<
  "none" | "complaint" | "compliment"
>("none");

const [feedbackCategory, setFeedbackCategory] = React.useState("");
const [feedbackNotes, setFeedbackNotes] = React.useState("");
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
         sites,
        mileageLogs,
        otherExpenses,
        schedules,
        settings,
        monthISO,
      }),
    [entries, employees,  sites, mileageLogs, otherExpenses, schedules,monthISO, settings]
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
  <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_35px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950">
       <div className="flex flex-col gap-3 border-b border-slate-200 bg-gradient-to-r from-sky-50 via-white to-violet-50 px-5 py-4 dark:border-slate-800 dark:from-sky-950/30 dark:via-slate-950 dark:to-violet-950/20 sm:flex-row sm:items-center sm:justify-between">
  <div>
    <h3 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
      Site Profitability
    </h3>

    <p className="text-xs text-muted-foreground">
      Monthly performance by site
    </p>
  </div>

  <button
    onClick={() =>
      exportSiteMonthCSV({
        rows: rows as any,
        totals,
        monthISO,
      })
    }
    className="inline-flex items-center justify-center rounded-xl border border-sky-200 bg-white px-3.5 py-2 text-sm font-semibold text-sky-700 shadow-sm transition hover:bg-sky-50 dark:border-sky-900 dark:bg-slate-950 dark:text-sky-300 dark:hover:bg-sky-950/30"
  >
    Export CSV
  </button>
</div>
      <div className="overflow-x-auto p-4">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-left text-slate-100 dark:bg-slate-800">
 
            <tr className="border-b">
              <th className="px-4 py-3 font-semibold">
  Site
</th>
              <th className="px-3 py-3 text-right font-semibold text-sky-200">
  Service Charge
</th>
              <th className="px-3 py-3 text-right font-semibold text-amber-200">
  Labor
</th>
              <th className="px-3 py-3 text-right font-semibold text-violet-200">
  Mileage
</th>
              <th className="px-3 py-3 text-right font-semibold text-cyan-200">
  Other
</th>
              <th className="px-3 py-3 font-semibold">
  Status
</th>
<th className="px-3 py-3 text-right font-semibold text-emerald-200">
  Revenue Profit
</th>
<th className="px-3 py-3 text-right font-semibold">
  Revenue Margin
</th>

              <th className="px-4 py-3 text-right font-semibold">
  Actions
</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
  key={r.siteId}
  className="
  cursor-pointer
  border-b border-slate-100
  transition-colors
  last:border-0
  odd:bg-white
  even:bg-slate-50/60
  hover:bg-sky-50/80
  dark:border-slate-800
  dark:odd:bg-slate-950
  dark:even:bg-slate-900/40
  dark:hover:bg-sky-950/20
"
  onClick={() => setSelectedRow(r)}
>
                <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
  {r.siteName}
</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums text-sky-700 dark:text-sky-300">
  ${r.serviceCharge.toFixed(2)}
</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums text-amber-700 dark:text-amber-300">
  ${r.labor.toFixed(2)}
</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums text-violet-700 dark:text-violet-300">
  ${r.mileage.toFixed(2)}
</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums text-cyan-700 dark:text-cyan-300">
  ${r.other.toFixed(2)}
</td>

<td className="px-3 py-3">
  {chip(r.net)}
</td>

<td
  className={`px-3 py-3 text-right font-bold tabular-nums ${
    getRevenueProfit(r) >= 0
      ? "text-emerald-700 dark:text-emerald-300"
      : "text-rose-700 dark:text-rose-300"
  }`}
>
  ${getRevenueProfit(r).toFixed(2)}
</td>

<td className="px-3 py-3 text-right">
  {revenueMarginChip(getRevenueMargin(r))}
</td>

                <td className="px-4 py-3 text-right">
                    <Button
                        variant="ghost"
                        size="icon"
                          onClick={(e) => {
      e.stopPropagation();
      deleteSiteAction(r.siteId);
    }}
                        title={`Delete ${r.siteName}`}
                    >
                        <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                </td>
              </tr>
            ))}
          </tbody>
         <tfoot>
 <tr className="border-t border-slate-300 bg-slate-900 font-semibold text-white dark:border-slate-700 dark:bg-slate-800">
    <td className="px-4 py-3">
  Total
</td>

    <td className="px-3 py-3 text-right tabular-nums text-sky-200">
  ${totals.serviceCharge.toFixed(2)}
</td>

    <td className="px-3 py-3 text-right tabular-nums text-amber-200">
  ${totals.labor.toFixed(2)}
</td>

    <td className="px-3 py-3 text-right tabular-nums text-violet-200">
  ${totals.mileage.toFixed(2)}
</td>

    <td className="px-3 py-3 text-right tabular-nums text-cyan-200">
  ${totals.other.toFixed(2)}
</td>

    {/* Status */}
    <td className="py-2 pr-3"></td>

    {/* Revenue Profit */}
    <td className="py-2 pr-3 text-right"></td>

    {/* Revenue Margin */}
    <td className="py-2 pr-3 text-right"></td>

    {/* Actions */}
    <td className="py-2 pl-3"></td>
  </tr>
</tfoot>
        </table>

        {selectedRow && (
  <div className="m-4 mt-5 rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-sky-50/50 p-5 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-sky-950/20">
    <div className="flex justify-between items-start mb-3">
      <h4 className="font-semibold text-base">
        {selectedRow.siteName} — Detail
      </h4>

      <Button
        variant="outline"
        size="sm"
        onClick={() => setSelectedRow(null)}
      >
        Close
      </Button>
    </div>

    {(() => {
      const revenue = Number(selectedRow.revenue ?? 0);
      const serviceCharge = Number(selectedRow.serviceCharge ?? 0);
      const labor = Number(selectedRow.labor ?? 0);
      const mileage = Number(selectedRow.mileage ?? 0);
      const other = Number(selectedRow.other ?? 0);

      const revenueVsServiceCharge = revenue - serviceCharge;
      const revenueProfit = revenue - labor - mileage - other;
      const revenueMargin =
        revenue > 0 ? (revenueProfit / revenue) * 100 : 0;

      return (
  <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2 lg:grid-cols-4">
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900 dark:bg-sky-950/30">
      <div className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
        Service Charge
      </div>

      <div className="mt-1 text-xl font-bold tabular-nums text-sky-950 dark:text-sky-100">
        ${serviceCharge.toFixed(2)}
      </div>
    </div>

    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
      <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
        Revenue
      </div>

      <div className="mt-1 text-xl font-bold tabular-nums text-emerald-950 dark:text-emerald-100">
        ${revenue.toFixed(2)}
      </div>
    </div>

    <div
      className={`rounded-xl border p-4 ${
        revenueVsServiceCharge >= 0
          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
          : "border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30"
      }`}
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Revenue vs Service Charge
      </div>

      <div
        className={`mt-1 text-xl font-bold tabular-nums ${
          revenueVsServiceCharge >= 0
            ? "text-emerald-700 dark:text-emerald-300"
            : "text-rose-700 dark:text-rose-300"
        }`}
      >
        ${revenueVsServiceCharge.toFixed(2)}
      </div>
    </div>

    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
      <div className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
        Labor
      </div>

      <div className="mt-1 text-xl font-bold tabular-nums text-amber-950 dark:text-amber-100">
        ${labor.toFixed(2)}
      </div>
    </div>

    <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-900 dark:bg-violet-950/30">
      <div className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
        Mileage
      </div>

      <div className="mt-1 text-xl font-bold tabular-nums text-violet-950 dark:text-violet-100">
        ${mileage.toFixed(2)}
      </div>
    </div>

    <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 dark:border-cyan-900 dark:bg-cyan-950/30">
  <div className="text-xs font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
    Other Expenses
  </div>

  <div className="mt-1 text-xl font-bold tabular-nums text-cyan-950 dark:text-cyan-100">
    ${other.toFixed(2)}
  </div>
</div>
    <div
      className={`rounded-xl border p-4 ${
        revenueProfit >= 0
          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
          : "border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30"
      }`}
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Revenue-Based Profit
      </div>

      <div
        className={`mt-1 text-xl font-bold tabular-nums ${
          revenueProfit >= 0
            ? "text-emerald-700 dark:text-emerald-300"
            : "text-rose-700 dark:text-rose-300"
        }`}
      >
        ${revenueProfit.toFixed(2)}
      </div>
    </div>

    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Revenue-Based Margin
      </div>

      <div className="mt-2">
        {revenueMarginChip(revenueMargin)}
      </div>
    </div>
  </div>
);
    })()}

    <div className="mt-4 border-t pt-4 space-y-3">
  <h5 className="font-semibold">Client Feedback / Quality</h5>

  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
    <select
      className="border rounded-md px-3 py-2 text-sm bg-background"
      value={feedbackType}
      onChange={(e) => {
        setFeedbackType(e.target.value as any);
        setFeedbackCategory("");
      }}
    >
      <option value="none">No issue reported</option>
      <option value="complaint">Complaint received</option>
      <option value="compliment">Compliment received</option>
    </select>

    <select
      className="border rounded-md px-3 py-2 text-sm bg-background"
      value={feedbackCategory}
      onChange={(e) => setFeedbackCategory(e.target.value)}
    >
      <option value="">Select category</option>

      {feedbackType === "complaint" && (
  <>
    <option value="Restroom">Restroom</option>
    <option value="Floors">Floors</option>
    <option value="Trash Removal">Trash Removal</option>
    <option value="Dusting">Dusting</option>
    <option value="Glass">Glass</option>
    <option value="Vacuuming">Vacuuming</option>
    <option value="Mopping">Mopping</option>
    <option value="Break Room">Break Room</option>
    <option value="Supplies Not Refilled">Supplies Not Refilled</option>
    <option value="Missed Area">Missed Area</option>
    <option value="Missed Service">Missed Service</option>
    <option value="Late Service">Late Service</option>
    <option value="Quality of Cleaning">Quality of Cleaning</option>
    <option value="Poor Communication">Poor Communication</option>
    <option value="Security / Access">Security / Access</option>
    <option value="Other">Other</option>
  </>
)}

      {feedbackType === "compliment" && (
        <>
          <option value="Excellent Cleaning">Excellent Cleaning</option>
          <option value="Professional Staff">Professional Staff</option>
          <option value="Reliability">Reliability</option>
          <option value="Good Communication">Good Communication</option>
          <option value="Other">Other</option>
        </>
      )}

      
    </select>

    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        onAddServiceFeedbackAction({
          siteId: selectedRow.siteId,
          siteName: selectedRow.siteName,
          scheduleDate: fromDate || new Date().toISOString().slice(0, 10),
          type: feedbackType,
          category: feedbackCategory || "Other",
          notes: feedbackNotes,
          resolved:
            feedbackType === "none" || feedbackType === "compliment",
          createdAt: new Date().toISOString(),
        });

        setFeedbackType("none");
        setFeedbackCategory("");
        setFeedbackNotes("");
      }}
    >
      Save Feedback
    </Button>
  </div>

  <textarea
    className="w-full border rounded-md px-3 py-2 text-sm bg-background"
    placeholder="What did the client say? Add details here..."
    value={feedbackNotes}
    onChange={(e) => setFeedbackNotes(e.target.value)}
  />

  <div className="space-y-2 text-sm">
    {(serviceFeedbacks || [])
      .filter((f) => f.siteId === selectedRow.siteId)
      .map((f) => (
        <div key={f.id} className="rounded-md border p-2">
          <strong>{f.type}</strong> — {f.category || "No category"}
          {f.notes && <div>{f.notes}</div>}
        </div>
      ))}
  </div>
</div>
  </div>
)}
      </div>
    </div>
  );
}
