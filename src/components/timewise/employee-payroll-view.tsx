"use client";

import React, { useMemo, useState } from "react";
import type {
  Employee,
  PayrollPeriod,
  PayrollConfirmation,
  PayrollLineItem,
} from "@/shared/types/domain";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, CheckCircle, Clock } from "lucide-react";
import { Download, FileText, ExternalLink } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
}

export function EmployeePayrollView({
  employee,
  payrollPeriods,
  confirmPayroll,
  payrollConfirmations = [],
  onViewTimesheet,
  companyName,
}: EmployeePayrollViewProps) {
  const [submittingFor, setSubmittingFor] = useState<string | null>(null);
  const [pdfFor, setPdfFor] = useState<string | null>(null);
  
  const handleViewTimesheet = onViewTimesheet ?? (() => { /* no-op */ });

  const fmt = (iso?: string, f = "MMM d, yyyy") => {
    if (!iso) return "?";
    const d = parseISO(iso);
    return isValid(d) ? format(d, f) : "?";
  };

  const confirmedKeySet = useMemo(() => {
    const s = new Set<string>();
    for (const c of (payrollConfirmations ?? [])) {
      if (c.confirmed) s.add(`${c.periodId}|${c.employeeId}|${c.revision ?? 0}`);
    }
    return s;
  }, [payrollConfirmations]);


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
          p?.status !== "draft" &&
          Array.isArray(p?.lineItems) &&
          p.lineItems.some((item: PayrollLineItem) => item.employeeId === employee.id)
      )
      .sort((a, b) => safeDate(b.startDate) - safeDate(a.startDate));
  }, [employee.id, payrollPeriods]);

  // helper to generate a simple paystub PDF
  const downloadPaystub = (args: {
    period: PayrollPeriod;
    employeeData: PayrollLineItem;
  }) => {
    const { period, employeeData } = args;
    setPdfFor(period.id);
    try {
      const doc = new jsPDF();
      const rev = employeeData.revision ?? 0;

      // Header
      doc.setFontSize(16);
      doc.text(`${companyName || "OpsWiseMD"} — Paystub`, 14, 18);
      doc.setFontSize(10);
      doc.text(`Employee: ${employee.name} (ID: ${employee.id})`, 14, 26);
      doc.text(
        `Period: ${fmt(period.startDate)} — ${fmt(period.endDate)}`,
        14,
        32
      );
      doc.text(`Revision: ${rev}`, 14, 38);
      doc.text(`Status: ${period.status}`, 14, 44);

      // Box
      doc.rect(12, 50, 186, 70);
      let y = 58;
      const line = (label: string, value: string) => {
        doc.text(label, 16, y);
        doc.text(value, 190, y, { align: "right" });
        y += 8;
      };

      line("Regular Hours", toHours(employeeData.regularMinutes));
      line("Bonus Hours", toHours(employeeData.bonusMinutes));
      line("Flat Bonus", money.format(Number(employeeData.flatBonus ?? 0)));
      line("Deductions", money.format(Number(employeeData.deductions ?? 0)));
      const FONT = "helvetica" as const;
      doc.setFont(FONT, "bold");
      line("Net Pay", money.format(Number(employeeData.net ?? 0)));
      doc.setFont(FONT, "normal");

      // Footer
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
          Review your finalized payroll periods and confirm your hours and pay.
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

              const rev = employeeData.revision ?? 0;

              const hasConfirmedThisRev = confirmedKeySet.has(
                `${period.id}|${employee.id}|${rev}`
              );

              const isPaid = period.status === "paid";

              const net = Number(employeeData.net ?? 0);
              const netClass = net < 0 ? "text-red-600" : "";

              const onConfirm = async () => {
                if (submittingFor || hasConfirmedThisRev || isPaid) return;
                setSubmittingFor(period.id);
                try {
                  await confirmPayroll(period.id, employee.id, rev);
                } finally {
                  setSubmittingFor(null);
                }
              };
              
              const safePeriodId = period.id || `${period.startDate}-${period.endDate}`;
              return (
                <AccordionItem value={safePeriodId} key={safePeriodId}>
                  <AccordionTrigger>
                    <div className="flex justify-between items-center w-full pr-4">
                      <span className="text-left">
                        Payroll for {fmt(period.startDate, "MMM d")} -
                        {" "}
                        {fmt(period.endDate, "MMM d, yyyy")}
                        <span className="ml-2 text-xs text-muted-foreground align-middle">rev {rev}</span>
                      </span>
                      {isPaid ? (
                        <span className="flex items-center gap-2 text-green-700 font-semibold">
                          <CheckCircle className="h-4 w-4" /> Paid
                        </span>
                      ) : hasConfirmedThisRev ? (
                        <span className="flex items-center gap-2 text-green-600">
                          <CheckCircle className="h-4 w-4" /> Confirmed
                        </span>
                      ) : period.status === "final" ? (
                        <span className="flex items-center gap-2 text-yellow-600">
                          <Clock className="h-4 w-4" /> Awaiting Confirmation
                        </span>
                      ) : (
                        <span className="flex items-center gap-2 text-muted-foreground">
                          {period.status}
                        </span>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm font-medium">Regular Hours</p>
                          <p className="text-lg font-bold">{toHours(employeeData.regularMinutes)}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium">Bonus Hours</p>
                          <p className="text-lg font-bold">{toHours(employeeData.bonusMinutes)}</p>
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

                      {/* actions row */}
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

                      {period.status === "final" && !hasConfirmedThisRev && (
                        <Button
                          className="w-full mt-4"
                          onClick={onConfirm}
                          disabled={Boolean(submittingFor) || hasConfirmedThisRev || isPaid}
                          aria-busy={submittingFor === period.id}
                        >
                          <Check className="mr-2 h-4 w-4" />
                          {submittingFor === period.id
                            ? "Submitting confirmation…"
                            : `I confirm these hours and pay are correct (rev ${rev})`}
                        </Button>
                      )}

                      {hasConfirmedThisRev && !isPaid && (
                        <div
                          className="text-center mt-4 p-2 bg-blue-100 text-blue-800 rounded-md"
                          aria-live="polite"
                        >
                          Your confirmation has been recorded. Waiting for payment processing.
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
            No finalized payroll periods available for review.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
