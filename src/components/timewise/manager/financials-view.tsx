"use client";

import React, { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { parseISO, isValid } from "date-fns";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

import type {
  Invoice,
  OtherExpense,
  PayrollPeriod,
  MileageLog,
  Entry,
  Settings,
  Employee,
} from "@/shared/types/domain";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { groupSessions } from "@/lib/time-utils";
import { Info } from "lucide-react";
import {
  TooltipProvider,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="ml-1 inline-flex items-center text-muted-foreground hover:text-foreground"
        >
          <Info className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-sm leading-snug">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
function revenueMarginBadge(margin: number) {
  if (margin >= 20) {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
        Healthy {margin.toFixed(2)}%
      </span>
    );
  }

  if (margin >= 10) {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 shadow-sm dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
        Watch {margin.toFixed(2)}%
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 shadow-sm dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
      Action Needed {margin.toFixed(2)}%
    </span>
  );
}
type AccountingView = "operational" | "cash" | "both";

function isCashView(view: AccountingView) {
  return view === "cash";
}
type MonthKey = `${number}-${string}`; // e.g. "2025-Jan"

function toDateMaybe(x: any): Date | null {
  if (!x) return null;
  if (typeof x === "string") {
    const d = parseISO(x);
    return isValid(d) ? d : null;
  }
  if (x?.toDate) {
    try {
      return x.toDate();
    } catch {
      /* ignore */
    }
  }
  const d = new Date(x);
  return Number.isFinite(d.getTime()) ? d : null;
}

function inRange(d: Date, min?: Date | null, max?: Date | null) {
  if (min && d < min) return false;
  if (max && d > max) return false;
  return true;
}

function monthKey(d: Date): MonthKey {
  const m = d.toLocaleString("en-US", { month: "short" });
  return `${d.getFullYear()}-${m}` as MonthKey;
}

function getInvoiceTotal(inv: any): number {
  if (typeof inv?.total === "number") return inv.total;
  if (Array.isArray(inv?.lineItems)) {
    return inv.lineItems.reduce(
      (s: number, it: any) =>
        s +
        (Number(
          it?.total ??
            Number(it?.quantity || 0) * Number(it?.unitPrice || 0)
        ) || 0),
      0
    );
  }
  return Number(inv?.amount || 0) || 0;
}

function getPayrollTotal(p: PayrollPeriod): number {
  if (!Array.isArray(p.lineItems)) return 0;

  return p.lineItems.reduce((sum, item) => {
    return sum + Number(item.gross || 0);
  }, 0);
}

function getLivePayrollGrossFromEntries(args: {
  startDate: Date;
  endDate: Date;
  entries: Entry[];
  employees: Employee[];
  settings?: Settings | null;
}) {
  const { startDate, endDate, entries, employees, settings } = args;

  const fromTime = startDate.getTime();
  const toTime = endDate.getTime();

  const siteMap = new Map(
    (settings?.sites ?? []).map((s) => [s.name, s])
  );

  const filteredEntries = entries.filter(
    (entry) => entry.ts >= fromTime && entry.ts <= toTime
  );

  const sessions = groupSessions(
    filteredEntries.slice().sort((a, b) => a.ts - b.ts)
  );

  let totalGross = 0;

  for (const employee of employees) {
    const employeeSessions = sessions.filter(
      (s) => s.employee === employee.name && !!s.in && !!s.out
    );

    let basePay = 0;
    let flatBonus = 0;

    for (const session of employeeSessions) {
      const sessionMinutes = Number(session.minutes ?? 0);
      const site = siteMap.get(session.in?.site || "General");

      basePay +=
        (sessionMinutes / 60) *
        Number((employee as any).payRate ?? (employee as any).wage ?? 0);

      if (site?.bonusType === "hourly" && site.bonusAmount) {
        basePay += (sessionMinutes / 60) * Number(site.bonusAmount || 0);
      }

      if (site?.bonusType === "flat" && site.bonusAmount) {
        flatBonus += Number(site.bonusAmount || 0);
      }
    }

    totalGross += basePay + flatBonus;
  }

  return totalGross;
}

function getMileageCost(m: any, fallbackRate: number): number {
  if (typeof m?.amount === "number") return m.amount;
  const miles = Number(m?.miles ?? m?.distance ?? 0) || 0;
  const rate = Number(m?.rate ?? fallbackRate) || fallbackRate;
  return miles * rate;
}

function getPayrollProgressForMonth(
  monthlyRows: Array<{ month: string; payroll: number }>,
  selectedYear: string,
  selectedMonth: string
) {
  const year = Number(selectedYear);
  const month = Number(selectedMonth);

  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  const today = new Date();

  const monthLabel = start.toLocaleString("en-US", { month: "short" });
  const key = `${year}-${monthLabel}`;

  const row = monthlyRows.find((r) => r.month === key);
  const accrued = row?.payroll ?? 0;

  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() === month;

  const totalDays = end.getDate();
  const elapsedDays = isCurrentMonth ? Math.max(1, today.getDate()) : totalDays;

  const projected =
    elapsedDays > 0 ? (accrued / elapsedDays) * totalDays : accrued;

  return {
    accrued,
    projected,
    elapsedDays,
    totalDays,
    isCurrentMonth,
  };
}

export interface FinancialsViewProps {
  invoices?: Invoice[] | null;
  otherExpenses?: OtherExpense[] | null;
  mileageLogs?: MileageLog[] | null;
  payrollPeriods?: PayrollPeriod[] | null;
  entries?: Entry[] | null;
  employees?: Employee[] | null;
  settings?: Settings | null;
  fromDate?: string;
  toDate?: string;
  mileageRate?: number;
}

function ensureArray<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));
const months = [
  { value: "0", label: "January" },
  { value: "1", label: "February" },
  { value: "2", label: "March" },
  { value: "3", label: "April" },
  { value: "4", label: "May" },
  { value: "5", label: "June" },
  { value: "6", label: "July" },
  { value: "7", label: "August" },
  { value: "8", label: "September" },
  { value: "9", label: "October" },
  { value: "10", label: "November" },
  { value: "11", label: "December" },
];

export function FinancialsView({
  invoices,
  otherExpenses,
  mileageLogs,
  payrollPeriods,
  entries,
  employees,
  settings,
  fromDate: customFromDate,
  toDate: customToDate,
  mileageRate = 0.67,
}: FinancialsViewProps) {
  const invs = ensureArray(invoices);
  const exps = ensureArray(otherExpenses);
  const miles = ensureArray(mileageLogs);
  const pays = ensureArray(payrollPeriods);
  const allEntries = ensureArray(entries);
  const emps = ensureArray(employees);

  const [viewType, setViewType] = useState<"custom" | "monthly" | "annually">(
    "custom"
  );
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [selectedMonth, setSelectedMonth] = useState(
    String(new Date().getMonth())
  );
const [accountingView, setAccountingView] =
  useState<AccountingView>("both");

  const { minDate, maxDate } = useMemo(() => {
    if (viewType === "monthly") {
      const year = parseInt(selectedYear, 10);
      const month = parseInt(selectedMonth, 10);
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
      return { minDate: start, maxDate: end };
    }
    if (viewType === "annually") {
      const year = parseInt(selectedYear, 10);
      const start = new Date(year, 0, 1);
      const end = new Date(year, 11, 31, 23, 59, 59, 999);
      return { minDate: start, maxDate: end };
    }
    const start = customFromDate ? parseISO(customFromDate) : null;
    const end = customToDate ? parseISO(customToDate + "T23:59:59") : null;
    return { minDate: start, maxDate: end };
  }, [viewType, selectedYear, selectedMonth, customFromDate, customToDate]);

const buildFinancialData = (view: "operational" | "cash") => {  
    const monthly = new Map<
      MonthKey,
      { revenue: number; other: number; payroll: number; mileage: number }
    >();

    const minMs = minDate ? minDate.getTime() : -Infinity;
    const maxMs = maxDate ? maxDate.getTime() : Infinity;

    for (const inv of invs) {
  const d =
  view === "cash"
    ? toDateMaybe(
        (inv as any).paidDate ??
          (inv as any).paymentDate ??
          (inv as any).paidAt
      )
    : toDateMaybe(
        (inv as any).serviceEndDate ??
          (inv as any).serviceDate ??
          (inv as any).date ??
          (inv as any).issuedAt ??
          (inv as any).createdAt
      );

  if (!d || !inRange(d, minDate, maxDate)) continue;

  const key = monthKey(d);
      const row =
        monthly.get(key) ??
        { revenue: 0, other: 0, payroll: 0, mileage: 0 };
      row.revenue += getInvoiceTotal(inv);
      monthly.set(key, row);
    }

    for (const exp of exps) {
      const d =
      view === "cash"
  
    ? toDateMaybe(
        (exp as any).paidDate ??
          (exp as any).paymentDate ??
          (exp as any).date ??
          (exp as any).createdAt
      )
    : toDateMaybe(
        (exp as any).expenseDate ??
          (exp as any).date ??
          (exp as any).createdAt
      );
      if (!d || !inRange(d, minDate, maxDate)) continue;
      const key = monthKey(d);
      const row =
        monthly.get(key) ??
        { revenue: 0, other: 0, payroll: 0, mileage: 0 };
      row.other += Number((exp as any).amount || 0);
      monthly.set(key, row);
    }

    // Payroll from saved payroll periods gross totals

const payrollMonths = new Set<MonthKey>();

for (const p of pays) {
  const d = toDateMaybe(
    (p as any).endDate ??
    (p as any).payDate ??
    (p as any).createdAt
  );

  if (!d || !inRange(d, minDate, maxDate)) continue;

  const key = monthKey(d);

  const row =
    monthly.get(key) ??
    { revenue: 0, other: 0, payroll: 0, mileage: 0 };

  row.payroll += getPayrollTotal(p);
  payrollMonths.add(key);

  monthly.set(key, row);
}

// If no saved payroll exists for the selected month/range,
// calculate live payroll using the same Payroll formula.
if (minDate && maxDate) {
  const key = monthKey(minDate);

  if (!payrollMonths.has(key)) {
    const row =
      monthly.get(key) ??
      { revenue: 0, other: 0, payroll: 0, mileage: 0 };

    row.payroll += getLivePayrollGrossFromEntries({
      startDate: minDate,
      endDate: maxDate,
      entries: allEntries,
      employees: emps,
      settings,
    });

    monthly.set(key, row);
  }
}

    for (const m of miles) {
      const d = toDateMaybe((m as any).date ?? (m as any).createdAt);
      if (!d || !inRange(d, minDate, maxDate)) continue;
      const key = monthKey(d);
      const row =
        monthly.get(key) ??
        { revenue: 0, other: 0, payroll: 0, mileage: 0 };
      row.mileage += getMileageCost(m, mileageRate);
      monthly.set(key, row);
    }

    const contractRevenueByMonth = new Map<MonthKey, number>();

    if (settings?.sites?.length && allEntries.length) {
      const idByName = new Map<string, string>();
      const revenueBySiteId = new Map<string, number>();

      for (const s of settings.sites) {
        if (!s.name) continue;
        const id = s.id || s.name;
        idByName.set(s.name.trim().toLowerCase(), id);
        revenueBySiteId.set(id, s.revenue ?? 0);
      }

      const sessions = groupSessions(allEntries);
      const daysByMonth = new Map<MonthKey, Map<string, Set<string>>>();

      for (const sess of sessions) {
        if (!sess.in || !sess.out) continue;

        const siteName = sess.in?.site;
        if (!siteName) continue;

        const siteId = idByName.get(siteName.trim().toLowerCase());
        if (!siteId) continue;

        const revenue = revenueBySiteId.get(siteId) ?? 0;
        if (!revenue) continue;

        const sessionStart = sess.in.ts;
        const sessionEnd = sess.out.ts;

        const overlapStart = Math.max(sessionStart, minMs);
        const overlapEnd = Math.min(sessionEnd, maxMs);
        if (overlapEnd <= overlapStart) continue;

        const d = new Date(overlapStart);
        const mk = monthKey(d);
        const dayKey = d.toISOString().slice(0, 10);

        let perMonth = daysByMonth.get(mk);
        if (!perMonth) {
          perMonth = new Map();
          daysByMonth.set(mk, perMonth);
        }

        let daySet = perMonth.get(siteId);
        if (!daySet) {
          daySet = new Set();
          perMonth.set(siteId, daySet);
        }
        daySet.add(dayKey);
      }

      for (const [mk, perMonth] of daysByMonth.entries()) {
  let totalContractRevenue = 0;

  /*
   * Each site is counted only once for the month.
   *
   * Site revenue is monthly contract revenue,
   * so it must not be multiplied by the number
   * of serviced days.
   */
  for (const siteId of perMonth.keys()) {
    const siteRevenue =
      revenueBySiteId.get(siteId) ?? 0;

    if (siteRevenue <= 0) continue;

    totalContractRevenue += siteRevenue;
  }

  contractRevenueByMonth.set(
    mk,
    totalContractRevenue
  );
}
    }

    const allMonthKeys = new Set<MonthKey>();

for (const key of monthly.keys()) {
  allMonthKeys.add(key);
}

for (const key of contractRevenueByMonth.keys()) {
  allMonthKeys.add(key);
}

const sorted = Array.from(allMonthKeys).sort((a, b) => {
  const [aYear, aMonth] = a.split("-");
  const [bYear, bMonth] = b.split("-");

  const aDate = new Date(
    Number(aYear),
    new Date(`${aMonth} 1, 2000`).getMonth(),
    1
  );

  const bDate = new Date(
    Number(bYear),
    new Date(`${bMonth} 1, 2000`).getMonth(),
    1
  );

  return aDate.getTime() - bDate.getTime();
});

const rows = sorted.map((key) => {
  const values =
    monthly.get(key) ?? {
      revenue: 0,
      other: 0,
      payroll: 0,
      mileage: 0,
    };

  const contractRevenue =
    contractRevenueByMonth.get(key) ?? 0;

  const expenses =
    values.other +
    values.payroll +
    values.mileage;

  const net =
    values.revenue - expenses;

  const revenueVariance =
    values.revenue - contractRevenue;

  const revenueMargin =
    values.revenue > 0
      ? (net / values.revenue) * 100
      : 0;

  return {
    month: key,
    contractRevenue,
    revenue: values.revenue,
    revenueVariance,
    payroll: values.payroll,
    other: values.other,
    mileage: values.mileage,
    expenses,
    net,
    revenueMargin,
  };
});

const totalRevenue = rows.reduce(
  (sum, row) => sum + row.revenue,
  0
);

const totalContractRevenue = rows.reduce(
  (sum, row) => sum + row.contractRevenue,
  0
);

const totalPayroll = rows.reduce(
  (sum, row) => sum + row.payroll,
  0
);

const totalOther = rows.reduce(
  (sum, row) => sum + row.other,
  0
);

const totalMileage = rows.reduce(
  (sum, row) => sum + row.mileage,
  0
);

const totalExpenses =
  totalPayroll +
  totalOther +
  totalMileage;

const netIncome =
  totalRevenue - totalExpenses;

const revenueVariance =
  totalRevenue - totalContractRevenue;

    const series = rows.map((r) => ({
      month: r.month,
      Revenue: Number(r.revenue.toFixed(2)),
      Expenses: Number(r.expenses.toFixed(2)),
      Net: Number(r.net.toFixed(2)),
    }));

    const breakdown = [
      { name: "Payroll", value: Number(totalPayroll.toFixed(2)) },
      { name: "Other", value: Number(totalOther.toFixed(2)) },
      { name: "Mileage", value: Number(totalMileage.toFixed(2)) },
    ];

    return {
      kpis: {
  totalRevenue,
  totalContractRevenue,
  revenueVariance,
  totalExpenses,
  netIncome,
  totalPayroll,
  totalOther,
  totalMileage,
},
      monthlyRows: rows,
      chartSeries: series,
      expenseBreakdown: breakdown,
    };
  };
  const operationalData = useMemo(
  () => buildFinancialData("operational"),
  [
    invs,
    exps,
    miles,
    pays,
    allEntries,
    emps,
    settings,
    minDate,
    maxDate,
    mileageRate,
  ]
);

const cashData = useMemo(
  () => buildFinancialData("cash"),
  [
    invs,
    exps,
    miles,
    pays,
    allEntries,
    emps,
    settings,
    minDate,
    maxDate,
    mileageRate,
  ]
);


const activeData =
  accountingView === "cash"
    ? cashData
    : operationalData;

const {
  kpis,
  monthlyRows,
  chartSeries,
  expenseBreakdown,
} = activeData;

  const payrollProgress = useMemo(() => {
    if (viewType !== "monthly") return null;
    return getPayrollProgressForMonth(
      monthlyRows,
      selectedYear,
      selectedMonth
    );
  }, [viewType, monthlyRows, selectedYear, selectedMonth]);

  return (
    <TooltipProvider>
      <div className="space-y-6 rounded-3xl bg-gradient-to-br from-slate-50 via-white to-blue-50/70 p-1 sm:p-2 dark:from-slate-950 dark:via-slate-950 dark:to-blue-950/20">
        <Card className="overflow-hidden border-0 bg-gradient-to-r from-slate-950 via-blue-950 to-indigo-950 text-white shadow-xl">
          <CardHeader className="relative py-8">
            <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-cyan-400/15 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-violet-400/15 blur-3xl" />
            <CardTitle className="relative text-2xl font-bold tracking-tight sm:text-3xl">
  Financial summary —{" "}
  {accountingView === "operational"
    ? "Operational P&L"
    : accountingView === "cash"
    ? "Cash Flow"
    : "Operational P&L vs Cash Flow"}
</CardTitle>
            <CardDescription className="relative max-w-3xl text-sm leading-6 text-blue-100/85">
              Professional view of revenue, standard service charges, and
              operating costs for the selected reporting period.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="border-slate-200/80 bg-white/90 shadow-md backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
          <CardHeader className="border-b bg-gradient-to-r from-slate-50 to-blue-50/60 dark:from-slate-900 dark:to-blue-950/30">
            <CardTitle className="text-lg text-slate-800 dark:text-slate-100">Reporting period</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 p-5 md:grid-cols-4 md:items-end">
            <div className="space-y-2">
              <Label>View type</Label>
              <Select
                value={viewType}
                onValueChange={(v: any) => setViewType(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select view" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">
                    Custom range (from dashboard)
                  </SelectItem>
                  <SelectItem value="monthly">Month to month</SelectItem>
                  <SelectItem value="annually">Year to date</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {viewType !== "custom" && (
              <div className="space-y-2">
                <Label>Year</Label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={y}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {viewType === "monthly" && (
              <div className="space-y-2">
                <Label>Month</Label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select month" />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
  <Label>Accounting view</Label>
  <Select
    value={accountingView}
    onValueChange={(v: AccountingView) => setAccountingView(v)}
  >
    <SelectTrigger>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
  <SelectItem value="operational">
    Operational P&L
  </SelectItem>

  <SelectItem value="cash">
    Cash Flow
  </SelectItem>

  <SelectItem value="both">
    Side-by-Side
  </SelectItem>
</SelectContent>
  </Select>
</div>
          </CardContent>
        </Card>
        {accountingView === "both" && (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <Card className="overflow-hidden border-emerald-200/80 bg-gradient-to-br from-white to-emerald-50/80 shadow-lg dark:border-emerald-900 dark:from-slate-900 dark:to-emerald-950/25">
      <CardHeader className="border-b border-emerald-100 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30">
        <CardTitle className="text-emerald-800 dark:text-emerald-300">Operational P&amp;L</CardTitle>
        <CardDescription>
          Revenue earned and expenses accrued.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div>Revenue: ${operationalData.kpis.totalRevenue.toFixed(2)}</div>
        <div>Expenses: ${operationalData.kpis.totalExpenses.toFixed(2)}</div>
        <div className="font-semibold">
          Net Income: ${operationalData.kpis.netIncome.toFixed(2)}
        </div>
        <div>
          Margin:{" "}
          {revenueMarginBadge(
            operationalData.kpis.totalRevenue > 0
              ? (operationalData.kpis.netIncome /
                  operationalData.kpis.totalRevenue) *
                  100
              : 0
          )}
        </div>
      </CardContent>
    </Card>

    <Card className="overflow-hidden border-blue-200/80 bg-gradient-to-br from-white to-blue-50/80 shadow-lg dark:border-blue-900 dark:from-slate-900 dark:to-blue-950/25">
      <CardHeader className="border-b border-blue-100 bg-blue-50/70 dark:border-blue-900 dark:bg-blue-950/30">
        <CardTitle className="text-blue-800 dark:text-blue-300">Cash Flow</CardTitle>
        <CardDescription>
          Cash collected and cash-based expenses.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div>Cash Revenue: ${cashData.kpis.totalRevenue.toFixed(2)}</div>
        <div>Cash Expenses: ${cashData.kpis.totalExpenses.toFixed(2)}</div>
        <div className="font-semibold">
          Net Cash Flow: ${cashData.kpis.netIncome.toFixed(2)}
        </div>
        <div>
          Margin:{" "}
          {revenueMarginBadge(
            cashData.kpis.totalRevenue > 0
              ? (cashData.kpis.netIncome / cashData.kpis.totalRevenue) * 100
              : 0
          )}
        </div>
      </CardContent>
    </Card>
  </div>
)}

{accountingView === "both" && (
  <p className="rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-700 shadow-sm dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
    The chart and monthly breakdown below display Operational P&amp;L data.
  </p>
)}

        {accountingView !== "both" && (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          <Card className="overflow-hidden border-emerald-200 bg-gradient-to-br from-white to-emerald-50 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-emerald-900 dark:from-slate-900 dark:to-emerald-950/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                Total revenue
                <InfoTip
  text={
    accountingView === "operational"
      ? "Revenue recognized from services performed during the selected period."
      : "Cash revenue received during the selected period from paid invoices."
  }
/>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold tracking-tight">
              ${kpis.totalRevenue.toFixed(2)}
            </CardContent>
          </Card>

          {accountingView === "operational" && (
  <Card className="overflow-hidden border-blue-200 bg-gradient-to-br from-white to-blue-50 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-blue-900 dark:from-slate-900 dark:to-blue-950/30">
    <CardHeader className="pb-2">
      <CardTitle className="flex items-center text-sm font-semibold text-blue-800 dark:text-blue-300">
  Contract revenue
  <InfoTip text="Sum of the monthly revenue stored in each serviced site's profile. Each site is counted once per month." />
</CardTitle>
    </CardHeader>

    <CardContent className="text-2xl font-bold tracking-tight">
      ${kpis.totalContractRevenue.toFixed(2)}
    </CardContent>
  </Card>
)}

          {accountingView === "operational" && (
  <Card className="overflow-hidden border-violet-200 bg-gradient-to-br from-white to-violet-50 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-violet-900 dark:from-slate-900 dark:to-violet-950/30">
    <CardHeader className="pb-2">
      <CardTitle className="flex items-center text-sm font-semibold text-violet-800 dark:text-violet-300">
  Revenue variance
  <InfoTip text="Invoice revenue minus monthly contract revenue." />
</CardTitle>
    </CardHeader>

    <CardContent
      className={`text-2xl font-semibold ${
        kpis.revenueVariance>= 0
          ? "text-emerald-600"
          : "text-red-600"
      }`}
    >
      ${kpis.revenueVariance.toFixed(2)}
    </CardContent>
  </Card>
)}

          <Card className="overflow-hidden border-rose-200 bg-gradient-to-br from-white to-rose-50 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-rose-900 dark:from-slate-900 dark:to-rose-950/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center text-sm font-semibold text-rose-800 dark:text-rose-300">
                Total operating expenses
                <InfoTip text="Combined total of payroll, mileage reimbursements, and other operating expenses." />
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold tracking-tight">
              ${kpis.totalExpenses.toFixed(2)}
            </CardContent>
          </Card>

          {viewType === "monthly" && payrollProgress && (
            <Card className="overflow-hidden border-amber-200 bg-gradient-to-br from-white to-amber-50 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-amber-900 dark:from-slate-900 dark:to-amber-950/30">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center text-sm font-semibold text-amber-800 dark:text-amber-300">
                  Payroll Progress
                  <InfoTip text="Accrued labor so far this month compared with a projected full-month payroll based on the current pace." />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-2xl font-bold tracking-tight">
                  ${payrollProgress.accrued.toFixed(2)} / $
                  {payrollProgress.projected.toFixed(2)} projected
                </div>

                <div className="h-2.5 w-full overflow-hidden rounded-full bg-amber-100 dark:bg-amber-950">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        payrollProgress.projected > 0
                          ? (payrollProgress.accrued /
                              payrollProgress.projected) *
                              100
                          : 0
                      )}%`,
                    }}
                  />
                </div>

                <p className="text-sm text-muted-foreground">
                  Day {payrollProgress.elapsedDays} of{" "}
                  {payrollProgress.totalDays}
                </p>
              </CardContent>
            </Card>
          )}

          <Card className="overflow-hidden border-cyan-200 bg-gradient-to-br from-white to-cyan-50 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-cyan-900 dark:from-slate-900 dark:to-cyan-950/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center text-sm font-semibold text-cyan-800 dark:text-cyan-300">
               {accountingView === "operational"
  ? "Net income"
  : "Net cash flow"}
                <InfoTip text="Revenue minus all operating expenses for the selected period." />
              </CardTitle>
            </CardHeader>
            <CardContent
              className={`text-2xl font-semibold ${
                kpis.netIncome >= 0 ? "text-emerald-600" : "text-red-600"
              }`}
            >
              ${kpis.netIncome.toFixed(2)}
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-indigo-200 bg-gradient-to-br from-white to-indigo-50 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-indigo-900 dark:from-slate-900 dark:to-indigo-950/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-indigo-800 dark:text-indigo-300">Expense mix</CardTitle>
              <CardDescription>
                Relative share of payroll, other expenses, and mileage.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expenseBreakdown}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={70}
                    label
                  >
                    {expenseBreakdown.map((_, i) => (
                      <Cell
                        key={i}
                        fill={["#6366f1", "#f43f5e", "#f59e0b"][i % 3]}
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(v: any) => `$${Number(v).toFixed(2)}`}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>)}

        <Card className="overflow-hidden border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900">
          <CardHeader className="border-b bg-gradient-to-r from-blue-50 via-white to-emerald-50 dark:from-blue-950/30 dark:via-slate-900 dark:to-emerald-950/30">
            <CardTitle className="text-xl text-slate-800 dark:text-slate-100">Revenue vs. expenses</CardTitle>
            <CardDescription>
              Month-over-month view of billed revenue, operating expenses, and
              net result.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartSeries}>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#cbd5e1" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v) => `$${v}`} />
                <RechartsTooltip
                  formatter={(v: any) => `$${Number(v).toFixed(2)}`}
                />
                <Legend />
                <Bar dataKey="Revenue" fill="#10b981" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Expenses" fill="#6366f1" radius={[6, 6, 0, 0]} />
                <Line type="monotone" dataKey="Net" stroke="#f97316" strokeWidth={3} dot={{ r: 4 }} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900">
          <CardHeader className="border-b bg-gradient-to-r from-slate-50 to-indigo-50/70 dark:from-slate-900 dark:to-indigo-950/30">
            <CardTitle className="text-xl text-slate-800 dark:text-slate-100">Monthly breakdown</CardTitle>
            <CardDescription>
              Comparison of standard service charges, actual revenue, and
              expense categories by month.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-100/90 dark:bg-slate-800/90">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Month</TableHead>
                  {accountingView === "operational" && (
                  <TableHead className="text-right">
            
                    <span className="inline-flex items-center justify-end w-full">
  Contract revenue
  <InfoTip text="Monthly revenue stored in the Site profile. Each serviced site is counted once for the month." />
</span>
                  </TableHead>)}
                  <TableHead className="text-right">
                    <span className="inline-flex items-center justify-end w-full">
                      Revenue
                      <InfoTip
  text={
    accountingView === "operational"
      ? "Revenue recognized from work/service performed during this month."
      : "Cash revenue received during this month from paid invoices."
  }
/>
                    </span>
                  </TableHead>
                  {accountingView === "operational" && (
                  <TableHead className="text-right">
                    <span className="inline-flex items-center justify-end w-full">
  Revenue variance
  <InfoTip text="Invoice revenue minus monthly contract revenue." />
</span>
                  </TableHead>)}
                  <TableHead className="text-right">
                    <span className="inline-flex items-center justify-end w-full">
                      Payroll
                      <InfoTip text="Accrued labor cost from worked employee time in this month, even before payroll is paid." />
                    </span>
                  </TableHead>
                  <TableHead className="text-right">
                    <span className="inline-flex items-center justify-end w-full">
                      Other
                      <InfoTip text="Non-mileage, non-payroll operating expenses." />
                    </span>
                  </TableHead>
                  <TableHead className="text-right">
                    <span className="inline-flex items-center justify-end w-full">
                      Mileage
                      <InfoTip text="Travel reimbursement based on logged miles and rate." />
                    </span>
                  </TableHead>
                  <TableHead className="text-right">
                    <span className="inline-flex items-center justify-end w-full">
                      Total expenses
                      <InfoTip text="Payroll + other expenses + mileage for the month." />
                    </span>
                  </TableHead>
                  <TableHead className="text-right">
                    <span className="inline-flex items-center justify-end w-full">
                      Net
                      <InfoTip text="Revenue minus total expenses for the month." />
                    </span>
                  </TableHead>
                  <TableHead className="text-right">
  <span className="inline-flex items-center justify-end w-full">
    Revenue Margin
    <InfoTip text="Net income divided by revenue. Measures overall profitability of the month." />
  </span>
</TableHead>
 
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="h-24 text-center">
                      No financial data is available for this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  monthlyRows.map((r) => (
                    <TableRow key={r.month} className="transition-colors hover:bg-blue-50/60 dark:hover:bg-blue-950/20">
                      <TableCell className="font-semibold text-slate-700 dark:text-slate-200">{r.month}</TableCell>

                      {accountingView === "operational" && (
  <TableCell className="text-right">
    ${r.contractRevenue.toFixed(2)}
  </TableCell>
)}
                      <TableCell className="text-right">
                        ${r.revenue.toFixed(2)}
                      </TableCell>
                      {accountingView === "operational" && (
  <TableCell
    className={`text-right ${
      r.revenueVariance >= 0
        ? "text-emerald-600"
        : "text-red-600"
    }`}
  >
    ${r.revenueVariance.toFixed(2)}
  </TableCell>
)}
                      <TableCell className="text-right">
                        ${r.payroll.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        ${r.other.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        ${r.mileage.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        ${r.expenses.toFixed(2)}
                      </TableCell>
                      <TableCell
                        className={`text-right ${
                          r.net >= 0 ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        ${r.net.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
  {revenueMarginBadge(r.revenueMargin)}
</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}