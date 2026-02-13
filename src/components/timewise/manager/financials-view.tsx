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

type MonthKey = `${number}-${string}`; // e.g. "2025-Jan"

function toDateMaybe(x: any): Date | null {
  if (!x) return null;
  if (typeof x === "string") {
    const d = parseISO(x);
    return isValid(d) ? d : null;
  }
  // Firestore Timestamp?
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
  if (Array.isArray(p?.lineItems)) {
    return p.lineItems.reduce(
      (sum, item) => sum + (item.net || item.gross || 0),
      0
    );
  }
  return 0;
}

function getMileageCost(m: any, fallbackRate: number): number {
  if (typeof m?.amount === "number") return m.amount;
  const miles = Number(m?.miles ?? m?.distance ?? 0) || 0;
  const rate = Number(m?.rate ?? fallbackRate) || fallbackRate;
  return miles * rate;
}

export interface FinancialsViewProps {
  invoices?: Invoice[] | null;
  otherExpenses?: OtherExpense[] | null;
  mileageLogs?: MileageLog[] | null;
  payrollPeriods?: PayrollPeriod[] | null;
  entries?: Entry[] | null;
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

  const [viewType, setViewType] = useState<"custom" | "monthly" | "annually">(
    "custom"
  );
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [selectedMonth, setSelectedMonth] = useState(
    String(new Date().getMonth())
  );

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
    const end = customToDate
      ? parseISO(customToDate + "T23:59:59")
      : null;
    return { minDate: start, maxDate: end };
  }, [viewType, selectedYear, selectedMonth, customFromDate, customToDate]);

  const {
    kpis,
    monthlyRows,
    chartSeries,
    expenseBreakdown,
  } = useMemo(() => {
    const monthly = new Map<
      MonthKey,
      { revenue: number; other: number; payroll: number; mileage: number }
    >();

    const minMs = minDate ? minDate.getTime() : -Infinity;
    const maxMs = maxDate ? maxDate.getTime() : Infinity;

    // Revenue (all invoices in range)
    for (const inv of invs) {
      const d = toDateMaybe(
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

    // Other expenses
    for (const exp of exps) {
      const d = toDateMaybe((exp as any).date ?? (exp as any).createdAt);
      if (!d || !inRange(d, minDate, maxDate)) continue;
      const key = monthKey(d);
      const row =
        monthly.get(key) ??
        { revenue: 0, other: 0, payroll: 0, mileage: 0 };
      row.other += Number((exp as any).amount || 0);
      monthly.set(key, row);
    }

    // Payroll (use endDate; only paid)
    for (const p of pays) {
      const d = toDateMaybe((p as any).endDate ?? (p as any).date);
      if (!d || !inRange(d, minDate, maxDate)) continue;
      if (p.status !== "paid") continue;
      const key = monthKey(d);
      const row =
        monthly.get(key) ??
        { revenue: 0, other: 0, payroll: 0, mileage: 0 };
      row.payroll += getPayrollTotal(p);
      monthly.set(key, row);
    }

    // Mileage
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

    // Service charge (standard rate × serviced days)
    const serviceByMonth = new Map<MonthKey, number>();

    if (settings?.sites?.length && allEntries.length) {
      const idByName = new Map<string, string>();
      const priceBySiteId = new Map<string, number>();

      for (const s of settings.sites) {
        if (!s.name) continue;
        const id = s.id || s.name;
        idByName.set(s.name.trim().toLowerCase(), id);
        priceBySiteId.set(id, s.servicePrice ?? 0);
      }

      const sessions = groupSessions(allEntries);

      const daysByMonth = new Map<
        MonthKey,
        Map<string, Set<string>>
      >();

      for (const sess of sessions) {
        if (!sess.in ||!sess.out) continue;

        const siteName = sess.in?.site;
        if (!siteName) continue;

        const siteId = idByName.get(siteName.trim().toLowerCase());
        if (!siteId) continue;

        const price = priceBySiteId.get(siteId) ?? 0;
        if (!price) continue;

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
        let total = 0;
        for (const [siteId, daySet] of perMonth.entries()) {
          const price = priceBySiteId.get(siteId) ?? 0;
          if (!price) continue;
          total += price * daySet.size;
        }
        serviceByMonth.set(mk, total);
      }
    }

    const allMonthKeys = new Set<MonthKey>();
    for (const k of monthly.keys()) allMonthKeys.add(k);
    for (const k of serviceByMonth.keys()) allMonthKeys.add(k);

    const sorted = Array.from(allMonthKeys).sort((a, b) => {
      const [Ay, Am] = a.split("-");
      const [By, Bm] = b.split("-");
      const A = new Date(
        Number(Ay),
        new Date(`${Am} 1, 2000`).getMonth(),
        1
      );
      const B = new Date(
        Number(By),
        new Date(`${Bm} 1, 2000`).getMonth(),
        1
      );
      return A.getTime() - B.getTime();
    });

    const rows = sorted.map((k) => {
      const v =
        monthly.get(k) ?? { revenue: 0, other: 0, payroll: 0, mileage: 0 };
      const serviceCharge = serviceByMonth.get(k) ?? 0;
      const expenses = v.other + v.payroll + v.mileage;
      const net = v.revenue - expenses;
      const revMinusService = v.revenue - serviceCharge;

      return {
        month: k,
        serviceCharge,
        revenue: v.revenue,
        payroll: v.payroll,
        other: v.other,
        mileage: v.mileage,
        expenses,
        net,
        revMinusService,
      };
    });

    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
    const totalServiceCharge = rows.reduce(
      (s, r) => s + r.serviceCharge,
      0
    );
    const totalPayroll = rows.reduce((s, r) => s + r.payroll, 0);
    const totalOther = rows.reduce((s, r) => s + r.other, 0);
    const totalMileage = rows.reduce((s, r) => s + r.mileage, 0);
    const totalExpenses = totalPayroll + totalOther + totalMileage;
    const netIncome = totalRevenue - totalExpenses;
    const revenueVsServiceDiff = totalRevenue - totalServiceCharge;

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
        totalServiceCharge,
        revenueVsServiceDiff,
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
  }, [
    invs,
    exps,
    miles,
    pays,
    allEntries,
    settings,
    minDate,
    maxDate,
    mileageRate,
  ]);

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Intro */}
        <Card>
          <CardHeader>
            <CardTitle>Financial summary</CardTitle>
            <CardDescription>
              Professional view of revenue, standard service charges, and
              operating costs for the selected reporting period.
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Date Range / View Type */}
        <Card>
          <CardHeader>
            <CardTitle>Reporting period</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
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
                <Select
                  value={selectedYear}
                  onValueChange={setSelectedYear}
                >
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
                <Select
                  value={selectedMonth}
                  onValueChange={setSelectedMonth}
                >
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
          </CardContent>
        </Card>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center">
                Total revenue
                <InfoTip text="Sum of all invoice amounts issued within the selected period." />
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              ${kpis.totalRevenue.toFixed(2)}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center">
                Standard service charge
                <InfoTip text="Sum of each site's standard service rate multiplied by the number of days it was serviced." />
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              ${kpis.totalServiceCharge.toFixed(2)}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center">
                Revenue vs service charge
                <InfoTip text="Total revenue minus standard service charge. Positive values indicate performance above standard; negative values indicate below-standard billing." />
              </CardTitle>
            </CardHeader>
            <CardContent
              className={`text-2xl font-semibold ${
                kpis.revenueVsServiceDiff >= 0
                  ? "text-emerald-600"
                  : "text-red-600"
              }`}
            >
              ${kpis.revenueVsServiceDiff.toFixed(2)}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center">
                Total operating expenses
                <InfoTip text="Combined total of payroll, mileage reimbursements, and other operating expenses." />
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              ${kpis.totalExpenses.toFixed(2)}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center">
                Net income
                <InfoTip text="Revenue minus all operating expenses for the selected period." />
              </CardTitle>
            </CardHeader>
            <CardContent
              className={`text-2xl font-semibold ${
                kpis.netIncome >= 0
                  ? "text-emerald-600"
                  : "text-red-600"
              }`}
            >
              ${kpis.netIncome.toFixed(2)}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Expense mix</CardTitle>
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
                        fill={["#8884d8", "#82ca9d", "#ffc658"][i % 3]}
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(v: any) =>
                      `$${Number(v).toFixed(2)}`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Revenue vs Expenses + Net */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue vs. expenses</CardTitle>
            <CardDescription>
              Month-over-month view of billed revenue, operating expenses, and net result.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v) => `$${v}`} />
                <RechartsTooltip
                  formatter={(v: any) =>
                    `$${Number(v).toFixed(2)}`
                  }
                />
                <Legend />
                <Bar dataKey="Revenue" fill="#82ca9d" />
                <Bar dataKey="Expenses" fill="#8884d8" />
                <Line
                  type="monotone"
                  dataKey="Net"
                  stroke="#ff7300"
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Monthly detail */}
        <Card>
          <CardHeader>
            <CardTitle>Monthly breakdown</CardTitle>
            <CardDescription>
              Comparison of standard service charges, actual revenue, and expense categories by month.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">
                    <span className="inline-flex items-center justify-end w-full">
                      Service charge
                      <InfoTip text="Standard site rates × serviced days for this month." />
                    </span>
                  </TableHead>
                  <TableHead className="text-right">
                    <span className="inline-flex items-center justify-end w-full">
                      Revenue
                      <InfoTip text="Total of all invoices dated in this month." />
                    </span>
                  </TableHead>
                  <TableHead className="text-right">
                    <span className="inline-flex items-center justify-end w-full">
                      Revenue vs service
                      <InfoTip text="Revenue minus standard service charge for the month." />
                    </span>
                  </TableHead>
                  <TableHead className="text-right">
                    <span className="inline-flex items-center justify-end w-full">
                      Payroll
                      <InfoTip text="Total paid payroll whose period ends in this month." />
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="h-24 text-center"
                    >
                      No financial data is available for this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  monthlyRows.map((r) => (
                    <TableRow key={r.month}>
                      <TableCell className="font-medium">
                        {r.month}
                      </TableCell>
                      <TableCell className="text-right">
                        ${r.serviceCharge.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        ${r.revenue.toFixed(2)}
                      </TableCell>
                      <TableCell
                        className={`text-right ${
                          r.revMinusService >= 0
                            ? "text-emerald-600"
                            : "text-red-600"
                        }`}
                      >
                        ${r.revMinusService.toFixed(2)}
                      </TableCell>
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
                          r.net >= 0
                            ? "text-emerald-600"
                            : "text-red-600"
                        }`}
                      >
                        ${r.net.toFixed(2)}
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
