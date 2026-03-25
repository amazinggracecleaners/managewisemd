"use client";

import React, { useMemo, useState } from "react";
import type {
  Employee,
  PayrollPeriod,
  PayrollConfirmation,
  PayrollLineItem,
  Settings,
} from "@/shared/types/domain";
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
} from "lucide-react";
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

function derivePayrollStatus(
  period: PayrollPeriod,
  confirmations: PayrollConfirmation[]
): "draft" | "waiting_for_confirmation" | "ready_to_pay" | "paid" {
  if (period.status === "paid") return "paid";

  const summary = getPayrollConfirmationSummary(period, confirmations);

  if (
    period.status === "waiting_for_confirmation" &&
    summary.allConfirmed
  ) {
    return "ready_to_pay";
  }

  return (period.status as any) ?? "draft";
}

function canEmployeeConfirm(
  period: PayrollPeriod,
  employeeId: string,
  confirmations: PayrollConfirmation[]
) {
  const status = derivePayrollStatus(period, confirmations);
  if (status === "paid") return false;
  if (!(status === "waiting_for_confirmation" || status === "ready_to_pay")) {
    return false;
  }

  const summary = getPayrollConfirmationSummary(period, confirmations);

  // only employees with payroll lines can confirm
  if (!summary.employeeIds.includes(employeeId)) return false;

  // already confirmed for this revision
  if (summary.confirmedEmployeeIds.has(employeeId)) return false;

  return true;
}

function PayrollStatusBadge({
  status,
}: {
  status: "draft" | "waiting_for_confirmation" | "ready_to_pay" | "paid";
}) {
  const className =
    status === "paid"
      ? "bg-green-600 text-white"
      : status === "ready_to_pay"
      ? "bg-blue-600 text-white"
      : status === "waiting_for_confirmation"
      ? "bg-yellow-500 text-white"
      : "bg-gray-500 text-white";

  const label =
    status === "paid"
      ? "Paid"
      : status === "ready_to_pay"
      ? "Ready to Pay"
      : status === "waiting_for_confirmation"
      ? "Waiting for Confirmation"
      : "Draft";

  return <Badge className={className}>{label}</Badge>;
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

  const downloadPaystub = (args: {
    period: PayrollPeriod;
    employeeData: PayrollLineItem;
  }) => {
    const { period, employeeData } = args;
    setPdfFor(period.id);

    try {
      const doc = new jsPDF();
      const rev = period.revision ?? 1;
      const status = derivePayrollStatus(period, payrollConfirmations);

      doc.setFontSize(16);
      doc.text(`${companyName || "OpsWiseMD"} — Paystub`, 14, 18);
      doc.setFontSize(10);
      doc.text(`Employee: ${employee.name} (ID: ${employee.id})`, 14, 26);
      doc.text(`Period: ${fmt(period.startDate)} — ${fmt(period.endDate)}`, 14, 32);
      doc.text(`Revision: ${rev}`, 14, 38);
      doc.text(`Status: ${status}`, 14, 44);

      doc.rect(12, 50, 186, 70);
      let y = 58;

      const line = (label: string, value: string) => {
        doc.text(label, 16, y);
        doc.text(value, 190, y, { align: "right" });
        y += 8;
      };

      line("Regular Hours", toHours((employeeData as any).regularMinutes));
      line("Bonus Hours", toHours((employeeData as any).bonusMinutes));
      line("Flat Bonus", money.format(Number(employeeData.flatBonus ?? 0)));
      line("Deductions", money.format(Number(employeeData.deductions ?? 0)));

      doc.setFont("helvetica", "bold");
      line("Net Pay", money.format(Number(employeeData.net ?? 0)));
      doc.setFont("helvetica", "normal");

      doc.text("Employee confirmation (if applicable): ___________________________", 14, 130);
      doc.text("Manager signature: _____________________________________________", 14, 138);
      doc.text(`Generated: ${format(new Date(), "MMM d, yyyy h:mm a")}`, 14, 148);

      const filename = `paystub_${employee.id}_${period.id}_rev${rev}.pdf`;
      doc.save(filename);
    } finally {
      setPdfFor(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payroll Confirmation</CardTitle>
        <CardDescription>
          Review your payroll periods, confirm when requested, and track payment status.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {relevantPeriods.length > 0 ? (
          <Accordion type="single" collapsible className="w-full">
            {relevantPeriods.map((period) => {
              const employeeData = period.lineItems.find(
                (item: PayrollLineItem) => item.employeeId === employee.id
              );
              if (!employeeData) return null;

              const summary = getPayrollConfirmationSummary(period, payrollConfirmations);
              const revision = summary.revision;
              const status = derivePayrollStatus(period, payrollConfirmations);

              const hasConfirmedThisRev = summary.confirmedEmployeeIds.has(employee.id);
              const isPaid = status === "paid";
              const employeeCanConfirm = canEmployeeConfirm(
                period,
                employee.id,
                payrollConfirmations
              );

              const net = Number(employeeData.net ?? 0);
              const netClass = net < 0 ? "text-red-600" : "";

              const onConfirm = async () => {
                if (!employeeCanConfirm || submittingFor) return;

                setSubmittingFor(period.id);
                try {
                  await confirmPayroll(period.id, employee.id, revision);
                } finally {
                  setSubmittingFor(null);
                }
              };

              const safePeriodId = period.id || `${period.startDate}-${period.endDate}`;

              return (
                <AccordionItem value={safePeriodId} key={safePeriodId}>
                  <AccordionTrigger>
                    <div className="flex justify-between items-center w-full pr-4 gap-4">
                      <div className="text-left">
                        <span>
                          Payroll for {fmt(period.startDate, "MMM d")} -{" "}
                          {fmt(period.endDate, "MMM d, yyyy")}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground align-middle">
                          rev {revision}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        
                        <PayrollStatusBadge status={status} />
                        {isPaid ? (
                          <span className="flex items-center gap-2 text-green-700 font-semibold">
                            <CheckCircle className="h-4 w-4" /> Paid
                          </span>
                        ) : hasConfirmedThisRev ? (
                          <span className="flex items-center gap-2 text-green-600">
                            <CheckCircle className="h-4 w-4" /> Confirmed
                          </span>
                        ) : status === "waiting_for_confirmation" ? (
                          <span className="flex items-center gap-2 text-yellow-600">
                            <Clock className="h-4 w-4" /> Awaiting Your Confirmation
                          </span>
                        ) : status === "ready_to_pay" ? (
                          <span className="flex items-center gap-2 text-blue-600">
                            <Clock className="h-4 w-4" /> Ready to Pay
                          </span>
                        ) : (
                          <span className="flex items-center gap-2 text-muted-foreground">
                            {status}
                          </span>
                        )}
                      </div>
                    </div>
                  </AccordionTrigger>

                  <AccordionContent>
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm font-medium">Regular Hours</p>
                          <p className="text-lg font-bold">
                            {toHours((employeeData as any).regularMinutes)}
                          </p>
                        </div>

                        <div>
                          <p className="text-sm font-medium">Bonus Hours</p>
                          <p className="text-lg font-bold">
                            {toHours((employeeData as any).bonusMinutes)}
                          </p>
                        </div>

                        <div>
                          <p className="text-sm font-medium">Flat Bonus</p>
                          <p className="text-lg font-bold text-blue-600">
                            +{money.format(Number(employeeData.flatBonus ?? 0))}
                          </p>
                        </div>

                        <div>
                          <p className="text-sm font-medium">Deductions</p>
                          <p className="text-lg font-bold text-red-600">
                            -{money.format(Number(employeeData.deductions ?? 0))}
                          </p>
                        </div>

                        <div className="col-span-2 text-right">
                          <p className="text-sm font-medium">Net Pay</p>
                          <p className={`text-2xl font-bold ${netClass}`}>
                            {money.format(net)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-col sm:flex-row gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className="w-full sm:w-auto"
                          onClick={() => downloadPaystub({ period, employeeData })}
                          disabled={Boolean(pdfFor)}
                          aria-busy={pdfFor === period.id}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          {pdfFor === period.id ? "Preparing PDF…" : "Download paystub (PDF)"}
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          className="w-full sm:w-auto"
                          onClick={() => handleViewTimesheet(period.id, employee.id)}
                        >
                          <ExternalLink className="mr-2 h-4 w-4" /> View timesheet details
                        </Button>
                      </div>

                      {employeeCanConfirm && (
                        <Button
                          className="w-full mt-4"
                          onClick={onConfirm}
                          disabled={Boolean(submittingFor)}
                          aria-busy={submittingFor === period.id}
                        >
                          <Check className="mr-2 h-4 w-4" />
                          {submittingFor === period.id
                            ? "Submitting confirmation…"
                            : `I confirm these hours and pay are correct (rev ${revision})`}
                        </Button>
                      )}

                      {hasConfirmedThisRev && !isPaid && (
                        <div
                          className="text-center mt-4 p-2 bg-blue-100 text-blue-800 rounded-md"
                          aria-live="polite"
                        >
                          Your confirmation has been recorded.
                        </div>
                      )}

                      {!hasConfirmedThisRev && status === "draft" && (
                        <div
                          className="text-center mt-4 p-2 bg-gray-100 text-gray-700 rounded-md"
                          aria-live="polite"
                        >
                          This payroll period is still in draft and is not ready for confirmation yet.
                        </div>
                      )}

                      {!hasConfirmedThisRev &&
                        status === "ready_to_pay" &&
                        !employeeCanConfirm && (
                          <div
                            className="text-center mt-4 p-2 bg-blue-100 text-blue-800 rounded-md"
                            aria-live="polite"
                          >
                            This payroll period is pending payment.
                          </div>
                        )}

                      {isPaid && (
                        <div
                          className="text-center mt-4 p-2 bg-green-100 text-green-800 rounded-md"
                          aria-live="polite"
                        >
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
          <div className="flex items-center justify-center h-24 text-muted-foreground">
            No payroll periods available for your review.
          </div>
        )}
      </CardContent>
    </Card>
  );
}