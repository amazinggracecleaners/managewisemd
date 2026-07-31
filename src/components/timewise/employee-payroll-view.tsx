"use client";

import React, { useMemo, useRef, useState } from "react";
import type {
  Employee,
  PayrollPeriod,
  PayrollConfirmation,
  PayrollLineItem,
  Settings,
} from "@/shared/types/domain";
import html2canvas from "html2canvas";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Check,
  CheckCircle,
  Clock,
  Download,
  ExternalLink,
  WalletCards,
  CalendarRange,
  BadgeDollarSign,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  FileCheck2,
  CircleDollarSign,
  Hourglass,
} from "lucide-react";
import { PaystubCard } from "@/components/timewise/payroll/PaystubCard";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import jsPDF from "jspdf";
import { parseISO, format, isValid } from "date-fns";

interface EmployeePayrollViewProps {
  employee: Employee;
  payrollPeriods: PayrollPeriod[];
  confirmPayroll: (
    periodId: string,
    employeeId: string,
    revision: number
  ) => Promise<void>;
  payrollConfirmations: PayrollConfirmation[];
  onViewTimesheet?: (periodId: string, employeeId: string) => void;
  companyName?: string;
  settings: Settings;
}

function getPayrollLineEmployeeIds(period: PayrollPeriod): string[] {
  const ids = (period.lineItems ?? [])
    .map((item: PayrollLineItem) => item.employeeId)
    .filter(Boolean);

  return Array.from(new Set(ids));
}

function getPayrollConfirmationsForRevision(
  confirmations: PayrollConfirmation[],
  periodId: string,
  revision: number
) {
  return confirmations.filter(
    (c) =>
      c.periodId === periodId &&
      c.revision === revision &&
      c.confirmed === true
  );
}

function getPayrollConfirmationSummary(
  period: PayrollPeriod,
  confirmations: PayrollConfirmation[]
) {
  const revision = period.revision ?? 1;
  const employeeIds = getPayrollLineEmployeeIds(period);

  const confirmed = getPayrollConfirmationsForRevision(
    confirmations,
    period.id,
    revision
  );

  const confirmedEmployeeIds = new Set(confirmed.map((c) => c.employeeId));
  const confirmedCount = employeeIds.filter((id) =>
    confirmedEmployeeIds.has(id)
  ).length;

  const totalEmployees = employeeIds.length;
  const pendingCount = Math.max(0, totalEmployees - confirmedCount);
  const allConfirmed = totalEmployees > 0 && confirmedCount === totalEmployees;

  return {
    revision,
    employeeIds,
    totalEmployees,
    confirmedCount,
    pendingCount,
    allConfirmed,
    confirmedEmployeeIds,
  };
}

function deriveEmployeePayrollStatus(
  period: PayrollPeriod,
  employeeId: string,
  confirmations: PayrollConfirmation[]
): "draft" | "waiting_for_confirmation" | "ready_to_pay" | "paid" {

  const employeeLine = (period.lineItems ?? []).find(
    (item: PayrollLineItem) => item.employeeId === employeeId
  );
   

  // ✅ Paid overrides everything
  if ((employeeLine as any)?.paid === true) return "paid";
  if (period.status === "paid") return "paid";

  // Draft
  if (period.status === "draft") return "draft";

  // ✅ Single source of truth
  const summary = getPayrollConfirmationSummary(period, confirmations);
  const hasEmployeeConfirmed =
    summary.confirmedEmployeeIds.has(employeeId);

  const needsReconfirmation =
    (employeeLine as any)?.needsReconfirmation === true;
 

  // 🔥 Correct reconfirmation logic
  if (needsReconfirmation && !hasEmployeeConfirmed) {
    return "waiting_for_confirmation";
  }

  // Not confirmed yet
  if (!hasEmployeeConfirmed) {
    return "waiting_for_confirmation";
  }

  // Confirmed
  return "ready_to_pay";
}

  

function canEmployeeConfirm(
  period: PayrollPeriod,
  employeeId: string,
  confirmations: PayrollConfirmation[]
) {
  const status = deriveEmployeePayrollStatus(
  period,
  employeeId,
  confirmations
);
  if (status === "paid") return false;
  if (!(status === "waiting_for_confirmation" || status === "ready_to_pay")) {
    return false;
  }

  const summary = getPayrollConfirmationSummary(period, confirmations);

  // only employees with payroll lines can confirm
  if (!summary.employeeIds.includes(employeeId)) return false;

  // already confirmed for this revision
  const employeeLine = (period.lineItems ?? []).find(
  (item: PayrollLineItem) => item.employeeId === employeeId
);

const needsReconfirmation =
  (employeeLine as any)?.needsReconfirmation === true;

// already confirmed for this revision, unless manager corrected payroll
if (summary.confirmedEmployeeIds.has(employeeId) && !needsReconfirmation) {
  return false;
}

  return true;
}

function PayrollStatusBadge({
  status,
}: {
  status: "draft" | "waiting_for_confirmation" | "ready_to_pay" | "paid";
}) {
  const config = {
    paid: {
      label: "Paid",
      className:
        "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
      icon: CheckCircle,
    },
    ready_to_pay: {
      label: "Ready to Pay",
      className:
        "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300",
      icon: FileCheck2,
    },
    waiting_for_confirmation: {
      label: "Awaiting Confirmation",
      className:
        "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
      icon: Hourglass,
    },
    draft: {
      label: "Draft",
      className:
        "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300",
      icon: Clock,
    },
  } as const;

  const item = config[status];
  const Icon = item.icon;

  return (
    <Badge
      variant="outline"
      className={`rounded-full px-3 py-1 font-semibold ${item.className}`}
    >
      <Icon className="mr-1.5 h-3.5 w-3.5" />
      {item.label}
    </Badge>
  );
}

export function EmployeePayrollView({
  employee,
  payrollPeriods,
  confirmPayroll,
  payrollConfirmations = [],
  onViewTimesheet,
  companyName,
  settings,
}: EmployeePayrollViewProps) {
  const [submittingFor, setSubmittingFor] = useState<string | null>(null);
  const [pdfFor, setPdfFor] = useState<string | null>(null);
  const paystubRef = useRef<HTMLDivElement | null>(null);

  const handleViewTimesheet = onViewTimesheet ?? (() => {});

  const fmt = (iso?: string, f = "MMM d, yyyy") => {
    if (!iso) return "?";
    const d = parseISO(iso);
    return isValid(d) ? format(d, f) : "?";
  };

  const money = useMemo(
    () => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }),
    []
  );

  const toHours = (mins?: number) => ((mins ?? 0) / 60).toFixed(2);

  const relevantPeriods = useMemo(() => {
    const safeDate = (d?: string) => {
      if (!d) return 0;
      const parsed = parseISO(d);
      return isValid(parsed) ? parsed.getTime() : 0;
    };

    return (payrollPeriods ?? [])
      .filter(
        (p) =>
          Array.isArray(p?.lineItems) &&
          p.lineItems.some((item: PayrollLineItem) => item.employeeId === employee.id)
      )
      .sort((a, b) => safeDate(b.startDate) - safeDate(a.startDate));
  }, [employee.id, payrollPeriods]);

 const downloadPaystub = async (args: {
  period: PayrollPeriod;
  employeeData: PayrollLineItem;
}) => {
  const { period } = args;

  if (!paystubRef.current) return;

  setPdfFor(period.id);

  try {
    const canvas = await html2canvas(paystubRef.current, {
      scale: 10,
      backgroundColor: "#ffffff",
      useCORS: true,
      windowWidth: paystubRef.current.scrollWidth,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");

    const pageWidth = pdf.internal.pageSize.getWidth();
const pageHeight = pdf.internal.pageSize.getHeight();

/* Bigger printable size */
let imgWidth = 200; // increase size here
let imgHeight = (canvas.height * imgWidth) / canvas.width;

/* If too tall, reduce slightly */
if (imgHeight > 280) {
  imgHeight = 280;
  imgWidth = (canvas.width * imgHeight) / canvas.height;
}

/* Center horizontally, top aligned */
const x = (pageWidth - imgWidth) / 2;
const y = 5;

    pdf.addImage(imgData, "PNG", x, y, imgWidth, imgHeight);

    pdf.save(`paystub_${employee.id}_${period.id}.pdf`);
  } finally {
    setPdfFor(null);
  }
};
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-blue-200/60 bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 p-6 text-white shadow-2xl dark:border-blue-900/60">
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="absolute -bottom-20 left-1/3 h-56 w-56 rounded-full bg-violet-500/15 blur-3xl" />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-blue-100 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              Employee Payroll Center
            </div>

            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 p-3.5 shadow-lg shadow-cyan-500/20">
                <WalletCards className="h-7 w-7 text-white" />
              </div>

              <div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Payroll & Pay Stubs
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100/85">
                  Review earnings, download official pay stubs, confirm payroll,
                  and track payment status for every pay period.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-blue-200">
              Employee
            </p>
            <p className="mt-1 font-semibold">{employee.name}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="overflow-hidden border-blue-200 bg-gradient-to-br from-white to-blue-50 shadow-sm dark:border-blue-900 dark:from-slate-950 dark:to-blue-950/20">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700 dark:text-blue-300">
                Pay Periods
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                {relevantPeriods.length}
              </p>
            </div>
            <div className="rounded-2xl bg-blue-500 p-3 text-white shadow-lg shadow-blue-500/20">
              <CalendarRange className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-emerald-200 bg-gradient-to-br from-white to-emerald-50 shadow-sm dark:border-emerald-900 dark:from-slate-950 dark:to-emerald-950/20">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
                Paid Periods
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                {
                  relevantPeriods.filter(
                    (period) =>
                      deriveEmployeePayrollStatus(
                        period,
                        employee.id,
                        payrollConfirmations
                      ) === "paid"
                  ).length
                }
              </p>
            </div>
            <div className="rounded-2xl bg-emerald-500 p-3 text-white shadow-lg shadow-emerald-500/20">
              <CircleDollarSign className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-amber-200 bg-gradient-to-br from-white to-amber-50 shadow-sm dark:border-amber-900 dark:from-slate-950 dark:to-amber-950/20">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
                Needs Attention
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                {
                  relevantPeriods.filter(
                    (period) =>
                      deriveEmployeePayrollStatus(
                        period,
                        employee.id,
                        payrollConfirmations
                      ) === "waiting_for_confirmation"
                  ).length
                }
              </p>
            </div>
            <div className="rounded-2xl bg-amber-500 p-3 text-white shadow-lg shadow-amber-500/20">
              <Hourglass className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden rounded-3xl border-slate-200 shadow-xl dark:border-slate-800">
        <CardHeader className="border-b bg-gradient-to-r from-white via-slate-50 to-blue-50/60 p-5 dark:from-slate-950 dark:via-slate-950 dark:to-blue-950/20">
          <CardTitle className="flex items-center gap-2 text-xl">
            <ReceiptText className="h-5 w-5 text-blue-600" />
            Payroll History
          </CardTitle>
          <CardDescription>
            Open a pay period to review the pay stub, download the PDF, view
            timesheet details, or confirm payroll.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {relevantPeriods.length > 0 ? (
            <Accordion type="single" collapsible className="w-full">
              {relevantPeriods.map((period) => {
                const employeeData = period.lineItems.find(
                  (item: PayrollLineItem) => item.employeeId === employee.id
                );
                if (!employeeData) return null;

                const summary = getPayrollConfirmationSummary(
                  period,
                  payrollConfirmations
                );
                const revision = summary.revision;
                const status = deriveEmployeePayrollStatus(
                  period,
                  employee.id,
                  payrollConfirmations
                );

                const employeeLine = period.lineItems.find(
                  (item: PayrollLineItem) => item.employeeId === employee.id
                );

                const needsReconfirmation =
                  (employeeLine as any)?.needsReconfirmation === true;
                const wasCorrected = (employeeLine as any)?.wasCorrected === true;
                const isReconfirmed = status === "ready_to_pay" && wasCorrected;
                const hasConfirmedThisRev =
                  summary.confirmedEmployeeIds.has(employee.id) &&
                  !needsReconfirmation;
                const isPaid = status === "paid";
                const employeeCanConfirm = canEmployeeConfirm(
                  period,
                  employee.id,
                  payrollConfirmations
                );

                const regularHours =
                  Number((employeeData as any).regularMinutes ?? 0) / 60;
                const bonusHours =
                  Number((employeeData as any).bonusMinutes ?? 0) / 60;
                const flatBonus = Number(employeeData.flatBonus ?? 0);
                const gross = Number(employeeData.gross ?? 0);
                const totalDeductions = Number(employeeData.deductions ?? 0);
                const net = Number(employeeData.net ?? 0);

                const federalTax = Number(
                  (employeeData as any).federalWithholding ??
                    (employeeData as any).federalTax ??
                    0
                );
                const stateTax = Number(
                  (employeeData as any).stateWithholding ??
                    (employeeData as any).stateTax ??
                    0
                );
                const localTax = Number(
                  (employeeData as any).localWithholding ??
                    (employeeData as any).localTax ??
                    0
                );
                const socialSecurity = Number(
                  (employeeData as any).socialSecurity ??
                    (employeeData as any).socialSecurityTax ??
                    0
                );
                const medicare = Number(
                  (employeeData as any).medicare ??
                    (employeeData as any).medicareTax ??
                    0
                );
                const otherDeductions = Math.max(
                  0,
                  totalDeductions -
                    federalTax -
                    stateTax -
                    localTax -
                    socialSecurity -
                    medicare
                );

                const deductions = [
                  federalTax > 0
                    ? { label: "Federal Withholding", amount: federalTax }
                    : null,
                  stateTax > 0
                    ? { label: "State Withholding", amount: stateTax }
                    : null,
                  localTax > 0
                    ? { label: "Local Withholding", amount: localTax }
                    : null,
                  socialSecurity > 0
                    ? { label: "Social Security", amount: socialSecurity }
                    : null,
                  medicare > 0
                    ? { label: "Medicare", amount: medicare }
                    : null,
                  otherDeductions > 0
                    ? { label: "Other Deductions", amount: otherDeductions }
                    : null,
                ].filter(Boolean) as { label: string; amount: number }[];

                if (deductions.length === 0 && totalDeductions !== 0) {
                  deductions.push({
                    label: "Deductions",
                    amount: totalDeductions,
                  });
                }

                const onConfirm = async () => {
                  if (!employeeCanConfirm || submittingFor) return;

                  setSubmittingFor(period.id);
                  try {
                    await confirmPayroll(period.id, employee.id, revision);

                    period.lineItems = period.lineItems?.map((item) =>
                      item.employeeId === employee.id
                        ? {
                            ...item,
                            needsReconfirmation: false,
                            wasCorrected: false,
                          }
                        : item
                    );
                  } finally {
                    setSubmittingFor(null);
                  }
                };

                const safePeriodId =
                  period.id || `${period.startDate}-${period.endDate}`;

                return (
                  <AccordionItem
                    value={safePeriodId}
                    key={safePeriodId}
                    className="border-slate-200 px-5 dark:border-slate-800"
                  >
                    <AccordionTrigger className="py-5 hover:no-underline">
                      <div className="flex w-full flex-col gap-3 pr-4 text-left sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                          <div className="rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 p-3 text-blue-700 dark:from-blue-950/50 dark:to-indigo-950/50 dark:text-blue-300">
                            <CalendarRange className="h-5 w-5" />
                          </div>

                          <div>
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {fmt(period.startDate, "MMM d")} –{" "}
                              {fmt(period.endDate, "MMM d, yyyy")}
                            </p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              Payroll revision {revision}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                            {money.format(net)}
                          </div>
                          <PayrollStatusBadge status={status} />
                        </div>
                      </div>
                    </AccordionTrigger>

                    <AccordionContent>
                      <div className="space-y-5 pb-6">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-inner dark:border-slate-800 dark:bg-slate-900/60">
                          <div ref={paystubRef}>
                            <PaystubCard
                              companyName={
                                companyName || "Amazing Grace Cleaners LLC"
                              }
                              logoUrl="/Mathieu_logo_AGC.jpg"
                              employeeName={employee.name}
                              employeeId={employee.id}
                              employeeAddress={(employee as any).address || ""}
                              payDate={fmt(period.endDate)}
                              payPeriodStart={fmt(period.startDate)}
                              payPeriodEnd={fmt(period.endDate)}
                              payRate={Number((employee as any).payRate ?? 0)}
                              regularHours={regularHours}
                              bonusHours={bonusHours}
                              flatBonus={flatBonus}
                              grossPay={gross}
                              deductions={deductions}
                              netPay={net}
                              companyContact={`${companyName || "Amazing Grace Cleaners LLC"} • amazinggracecleaners1@gmail.com • (859) 740-0101`}
                            />
                          </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                          <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-900 dark:bg-blue-950/25">
                            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                              Regular Hours
                            </p>
                            <p className="mt-2 text-xl font-bold text-slate-900 dark:text-white">
                              {toHours((employeeData as any).regularMinutes)}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4 dark:border-violet-900 dark:bg-violet-950/25">
                            <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                              Bonus Hours
                            </p>
                            <p className="mt-2 text-xl font-bold text-slate-900 dark:text-white">
                              {toHours((employeeData as any).bonusMinutes)}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4 dark:border-cyan-900 dark:bg-cyan-950/25">
                            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
                              Flat Bonus
                            </p>
                            <p className="mt-2 text-xl font-bold text-cyan-700 dark:text-cyan-300">
                              {money.format(flatBonus)}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-rose-100 bg-rose-50/70 p-4 dark:border-rose-900 dark:bg-rose-950/25">
                            <p className="text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">
                              Deductions
                            </p>
                            <p className="mt-2 text-xl font-bold text-rose-700 dark:text-rose-300">
                              {money.format(totalDeductions)}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 shadow-sm dark:border-emerald-900 dark:from-emerald-950/30 dark:to-teal-950/20">
                            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                              Net Pay
                            </p>
                            <p
                              className={`mt-2 text-2xl font-bold ${
                                net < 0
                                  ? "text-rose-600"
                                  : "text-emerald-700 dark:text-emerald-300"
                              }`}
                            >
                              {money.format(net)}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row">
                          <Button
                            type="button"
                            className="h-11 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 font-semibold text-white shadow-lg shadow-blue-600/20 hover:from-blue-700 hover:to-indigo-700"
                            onClick={() =>
                              downloadPaystub({ period, employeeData })
                            }
                            disabled={Boolean(pdfFor)}
                            aria-busy={pdfFor === period.id}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            {pdfFor === period.id
                              ? "Preparing PDF…"
                              : "Download Pay Stub"}
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 rounded-xl px-5"
                            onClick={() =>
                              handleViewTimesheet(period.id, employee.id)
                            }
                          >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            View Timesheet
                          </Button>
                        </div>

                        {employeeCanConfirm && (
                          <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 dark:border-amber-900 dark:from-amber-950/30 dark:to-orange-950/20">
                            <div className="mb-3 flex items-start gap-3">
                              <ShieldCheck className="mt-0.5 h-5 w-5 text-amber-600" />
                              <div>
                                <p className="font-semibold text-amber-900 dark:text-amber-100">
                                  Your confirmation is required
                                </p>
                                <p className="text-sm text-amber-700 dark:text-amber-300">
                                  Review the hours and pay information above before confirming.
                                </p>
                              </div>
                            </div>

                            <Button
                              className="h-11 w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 font-semibold text-white shadow-lg shadow-amber-500/20 hover:from-amber-600 hover:to-orange-600"
                              onClick={onConfirm}
                              disabled={Boolean(submittingFor)}
                              aria-busy={submittingFor === period.id}
                            >
                              <Check className="mr-2 h-4 w-4" />
                              {submittingFor === period.id
                                ? "Submitting confirmation…"
                                : `I Confirm These Hours and Pay (Revision ${revision})`}
                            </Button>
                          </div>
                        )}

                        {hasConfirmedThisRev && !isPaid && (
                          <div
                            className="flex items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-center font-medium text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300"
                            aria-live="polite"
                          >
                            <CheckCircle className="h-5 w-5" />
                            {isReconfirmed
                              ? "Your corrected payroll has been reconfirmed."
                              : "Your confirmation has been recorded."}
                          </div>
                        )}

                        {!hasConfirmedThisRev && status === "draft" && (
                          <div
                            className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                            aria-live="polite"
                          >
                            This payroll period is still in draft and is not ready
                            for confirmation.
                          </div>
                        )}

                        {!hasConfirmedThisRev &&
                          status === "ready_to_pay" &&
                          !employeeCanConfirm && (
                            <div
                              className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-center text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300"
                              aria-live="polite"
                            >
                              This payroll period is pending payment.
                            </div>
                          )}

                        {isPaid && (
                          <div
                            className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
                            aria-live="polite"
                          >
                            <CheckCircle className="h-5 w-5" />
                            This payroll period has been paid.
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
              <div className="mb-4 rounded-3xl bg-gradient-to-br from-blue-100 to-violet-100 p-5 text-blue-600 dark:from-blue-950/40 dark:to-violet-950/40 dark:text-blue-300">
                <BadgeDollarSign className="h-8 w-8" />
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white">
                No payroll periods available
              </h3>
              <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
                Your payroll history and pay stubs will appear here once payroll
                has been prepared.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}