"use client";

import React, { useMemo, useState, useEffect } from "react";
import type {
  Employee,
  Entry,
  Site,
  PayrollPeriod,
  PayrollLineItem,
  PayrollConfirmation,
  Session,
  PayrollStatus,
} from "@/shared/types/domain";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Banknote,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  Download,
  Trash2,
  Send,
  DollarSign,
  FileText,
} from "lucide-react";
import { groupSessions } from "@/lib/time-utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import {
  add,
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  parseISO,
  isValid,
} from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { getFunctions, httpsCallable } from "firebase/functions";
import { createPayrollConfirmationNotifications } from "@/lib/payroll-notifications";
import { app, db } from "@/firebase/client";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import jsPDF from "jspdf";

type PayFrequency =
  | "weekly"
  | "bi-weekly"
  | "semi-monthly"
  | "monthly"
  | "custom";

type PaymentMethod = "cash" | "zelle" | "bank";

interface PayrollViewProps {
  employees: Employee[];
  sites: Site[];
  timeEntries: Entry[];
  payrollPeriods: PayrollPeriod[];
  savePayrollPeriod: (period: PayrollPeriod) => Promise<void>;
  deletePayrollPeriod: (periodId: string) => Promise<void>;
  payrollConfirmations: PayrollConfirmation[];
  companyId: string;
}

function getPayrollLineEmployeeIds(period: PayrollPeriod): string[] {
  const ids = (period.lineItems ?? [])
    .map((item) => item.employeeId)
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
  period: PayrollPeriod | undefined,
  confirmations: PayrollConfirmation[]
): PayrollStatus {
  if (!period) return "draft";

  const raw = (period.status as string | undefined) ?? "draft";

  if (raw === "paid") return "paid";
  if (raw === "locked") return "ready_to_pay";
  if (raw === "final") return "waiting_for_confirmation";

  const summary = getPayrollConfirmationSummary(period, confirmations);

  if (raw === "waiting_for_confirmation" && summary.allConfirmed) {
    return "ready_to_pay";
  }

  return raw as PayrollStatus;
}

function PayrollStatusBadge({ status }: { status: PayrollStatus }) {
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

export function PayrollView({
  employees,
  sites,
  timeEntries,
  payrollPeriods,
  savePayrollPeriod,
  deletePayrollPeriod,
  payrollConfirmations = [],
  companyId,
}: PayrollViewProps) {
  const [payFrequency, setPayFrequency] = useState<PayFrequency>("monthly");
  const [currentDate, setCurrentDate] = useState(new Date());

  const [customStartDate, setCustomStartDate] = useState(
    format(startOfMonth(new Date()), "yyyy-MM-dd")
  );
  const [customEndDate, setCustomEndDate] = useState(
    format(endOfMonth(new Date()), "yyyy-MM-dd")
  );

  const [selectedYear, setSelectedYear] = useState(
    String(new Date().getFullYear())
  );

  const [lineItems, setLineItems] = useState<PayrollLineItem[]>([]);
  const [paymentMethodByEmployee, setPaymentMethodByEmployee] = useState<
    Record<string, PaymentMethod>
  >({});

  const availableYears = useMemo(() => {
    const years = new Set(
      payrollPeriods.map((p) => p.startDate.substring(0, 4))
    );
    years.add(String(new Date().getFullYear()));
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [payrollPeriods]);

  const { periodId, startDate, endDate } = useMemo(() => {
    let start: Date;
    let end: Date;

    if (payFrequency === "custom") {
      start = parseISO(customStartDate);
      end = parseISO(customEndDate);
    } else {
      switch (payFrequency) {
        case "weekly":
          start = startOfWeek(currentDate);
          end = endOfWeek(currentDate);
          break;
        case "bi-weekly": {
          const weekStart = startOfWeek(currentDate);
          const dayOffset =
            (currentDate.getDay() - weekStart.getDay() + 7) % 7;
          if (dayOffset < 7) {
            start = weekStart;
            end = endOfWeek(add(weekStart, { weeks: 1 }));
          } else {
            start = add(weekStart, { weeks: 1 });
            end = endOfWeek(add(weekStart, { weeks: 2 }));
          }
          break;
        }
        case "semi-monthly":
          if (currentDate.getDate() <= 15) {
            start = startOfMonth(currentDate);
            end = new Date(
              currentDate.getFullYear(),
              currentDate.getMonth(),
              15,
              23,
              59,
              59
            );
          } else {
            start = new Date(
              currentDate.getFullYear(),
              currentDate.getMonth(),
              16
            );
            end = endOfMonth(currentDate);
          }
          break;
        case "monthly":
        default:
          start = startOfMonth(currentDate);
          end = endOfMonth(currentDate);
          break;
      }
    }

    const startStr = format(start, "yyyy-MM-dd");
    const endStr = format(end, "yyyy-MM-dd");

    return {
  periodId: `${startStr}_${endStr}`,
  startDate: startStr,
  endDate: endStr,
};
  }, [currentDate, payFrequency, customStartDate, customEndDate]);

  const currentPeriod = useMemo(
    () => payrollPeriods.find((p) => p.id === periodId),
    [payrollPeriods, periodId]
  );

  const siteMap = useMemo(
    () => new Map(sites.map((s) => [s.name, s])),
    [sites]
  );
  const employeeMap = useMemo(
    () => new Map(employees.map((e) => [e.id, e])),
    [employees]
  );

  const currentStatus = useMemo(() => {
  if (!currentPeriod) return "draft";

  const payableItems =
    currentPeriod.lineItems?.filter(
      (item) => (item.net ?? 0) > 0 || (item.gross ?? 0) > 0
    ) ?? [];

  const allPayablePaid =
    payableItems.length > 0 &&
    payableItems.every((item) => item.paid === true);

  if (allPayablePaid || currentPeriod.status === "paid") {
    return "paid";
  }

  return derivePayrollStatus(currentPeriod, payrollConfirmations);
}, [currentPeriod, payrollConfirmations]);

  const confirmationSummary = useMemo(() => {
    if (!currentPeriod) {
      return {
        revision: 1,
        employeeIds: [] as string[],
        totalEmployees: 0,
        confirmedCount: 0,
        pendingCount: 0,
        allConfirmed: false,
        confirmedEmployeeIds: new Set<string>(),
      };
    }
    return getPayrollConfirmationSummary(currentPeriod, payrollConfirmations);
  }, [currentPeriod, payrollConfirmations]);

const payableLineItems = useMemo(() => {
  return lineItems.filter(
    (item) => (item.net ?? 0) > 0 || (item.gross ?? 0) > 0
  );
}, [lineItems]);

const paidCount = useMemo(() => {
  return payableLineItems.filter((item) => item.paid).length;
}, [payableLineItems]);

const paidProgressPct = useMemo(() => {
  if (payableLineItems.length === 0) return 0;
  return Math.round((paidCount / payableLineItems.length) * 100);
}, [paidCount, payableLineItems.length]);

  useEffect(() => {
    if (currentPeriod && currentStatus !== "draft") {
      setLineItems(currentPeriod.lineItems ?? []);

      const restoredMethods: Record<string, PaymentMethod> = {};
      (currentPeriod.lineItems ?? []).forEach((item) => {
        if (item.paymentMethod) {
          restoredMethods[item.employeeId] = item.paymentMethod;
        }
      });
      setPaymentMethodByEmployee(restoredMethods);
      return;
    }

    const fromTime = parseISO(startDate).getTime();
    const toTime = new Date(parseISO(endDate)).setHours(23, 59, 59, 999);

    const filteredEntries = timeEntries.filter(
      (entry) => entry.ts >= fromTime && entry.ts <= toTime
    );

    const sessions = groupSessions(filteredEntries);

    const newLineItems = employees
      .map((employee) => {
        const employeeSessions = sessions.filter(
          (
            s
          ): s is Session & {
            in: NonNullable<Session["in"]>;
            out: NonNullable<Session["out"]>;
          } => s.employee === employee.name && !!s.in && !!s.out
        );

        let totalMinutes = 0;
        let regularMinutes = 0;
        let bonusMinutes = 0;
        let basePay = 0;
        let flatBonus = 0;

        employeeSessions.forEach((session) => {
          const sessionMinutes = Number(session.minutes ?? 0);
          totalMinutes += sessionMinutes;

          const site = siteMap.get(session.in.site || "General");

          basePay += (sessionMinutes / 60) * employee.payRate;

          if (site?.bonusType === "hourly" && site.bonusAmount) {
            basePay += (sessionMinutes / 60) * site.bonusAmount;
            bonusMinutes += sessionMinutes;
          } else {
            regularMinutes += sessionMinutes;
          }

          if (site?.bonusType === "flat" && site.bonusAmount) {
            flatBonus += site.bonusAmount;
          }
        });

        const grossPay = basePay + flatBonus;

        return {
          employeeId: employee.id,
          employeeName: employee.name,
          revision: currentPeriod?.revision ?? 1,
          minutes: totalMinutes,
          regularMinutes,
          bonusMinutes,
          flatBonus,
          gross: grossPay,
          deductions: 0,
          net: grossPay,
          paid: false,
          paidAt: undefined,
          paymentMethod: undefined,
        } as PayrollLineItem;
      })
      .filter((item) => (item.minutes ?? 0) > 0 || (item.gross ?? 0) > 0)
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName));

    setLineItems(newLineItems);
    setPaymentMethodByEmployee({});
  }, [
    startDate,
    endDate,
    timeEntries,
    employees,
    siteMap,
    currentPeriod,
    currentStatus,
  ]);

  const yearlySummary = useMemo(() => {
  const summary = new Map<
    string,
    { employeeName: string; gross: number; net: number }
  >();

  employees.forEach((emp) => {
    summary.set(emp.id, { employeeName: emp.name, gross: 0, net: 0 });
  });

  payrollPeriods.forEach((period) => {
    const periodDate = period.endDate || period.startDate || "";
    const periodYear = periodDate.slice(0, 4);

    if (periodYear !== selectedYear) return;

    period.lineItems?.forEach((item) => {
      const itemIsPaid = item.paid === true || period.status === "paid";

      if (!itemIsPaid) return;

      if (!summary.has(item.employeeId)) {
        summary.set(item.employeeId, {
          employeeName: item.employeeName,
          gross: 0,
          net: 0,
        });
      }

      const current = summary.get(item.employeeId)!;
      current.gross += Number(item.gross ?? 0);
      current.net += Number(item.net ?? 0);
    });
  });

  return Array.from(summary.values())
    .filter((s) => s.gross > 0 || s.net > 0)
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}, [payrollPeriods, employees, selectedYear]);
  const isPaid = currentStatus === "paid";
const isLocked = isPaid;
const isEditable = !isLocked;

  const sendPayrollNotifications = async (periodToNotify: PayrollPeriod) => {
    try {
      await createPayrollConfirmationNotifications({
        companyId,
        period: periodToNotify,
        employees,
      });
    } catch (error) {
      console.error("Failed to create in-app payroll notifications:", error);
    }

    try {
      const fn = getFunctions(app, "us-central1");

      const sendPayrollConfirmationSms = httpsCallable<
        { companyId: string; periodId: string },
        { success: boolean; count: number; results: any[] }
      >(fn, "sendPayrollConfirmationSms");

      await sendPayrollConfirmationSms({
        companyId,
        periodId: periodToNotify.id,
      });
    } catch (error) {
      console.error("Failed to send payroll SMS:", error);
    }
  };

  const handleLineItemChange = (
    employeeId: string,
    field: "deductions" | "flatBonus",
    value: number
  ) => {
    if (isPaid) return;

    setLineItems((prev) =>
      prev.map((item) => {
        if (item.employeeId !== employeeId) return item;
        if (item.paid) return item;

        const next = { ...item, [field]: value };
        const grossWithoutFlat = (item.gross || 0) - (item.flatBonus || 0);
        next.gross = grossWithoutFlat + (next.flatBonus || 0);
        next.net = (next.gross || 0) - (next.deductions || 0);
        return next;
      })
    );
  };

  const handleDeleteLineItem = (employeeId: string) => {
    if (!isEditable) return;
    if (
      !window.confirm(
        "Are you sure you want to remove this employee from this payroll period?"
      )
    ) {
      return;
    }
    setLineItems((prev) => prev.filter((item) => item.employeeId !== employeeId));
  };

  const handleSendForConfirmation = async () => {
    if (!lineItems.length) {
      alert("No payroll lines exist for this period.");
      return;
    }

    if (
      !window.confirm(
        "Send this payroll period to employees for confirmation?"
      )
    ) {
      return;
    }

    const nextRevision = currentPeriod?.revision ?? 1;

    const periodToSave: PayrollPeriod = {
      id: periodId,
      startDate,
      endDate,
      status: "waiting_for_confirmation",
      revision: nextRevision,
      sentForConfirmationAt: new Date().toISOString(),
      lineItems: lineItems.map((li) => ({
        ...li,
        revision: nextRevision,
      })),
    };

    await savePayrollPeriod(periodToSave);
    await sendPayrollNotifications(periodToSave);
  };

  const handleSaveWaitingOrReady = async () => {
    if (!currentPeriod || isPaid) return;

    const nextRevision = (currentPeriod.revision ?? 0) + 1;

    const next: PayrollPeriod = {
      ...currentPeriod,
      status: "waiting_for_confirmation",
      revision: nextRevision,
      sentForConfirmationAt: new Date().toISOString(),
      lineItems: lineItems.map((li) => ({
        ...li,
        revision: nextRevision,
      })),
    };

    await savePayrollPeriod(next);
    await sendPayrollNotifications(next);
  };

  const handleMarkEmployeePaid = async (employeeId: string) => {
  if (!currentPeriod) return;

  const paymentMethod = paymentMethodByEmployee[employeeId];
  if (!paymentMethod) {
    alert("Please select a payment method first.");
    return;
  }

  const updatedLineItems = lineItems.map((item) => {
    if (item.employeeId !== employeeId) return item;

    return {
      ...item,
      paid: true,
      paidAt: Date.now(),
      paymentMethod,
    };
  });

  // 🔥 CHECK IF ALL EMPLOYEES ARE PAID
  const payableLineItems = updatedLineItems.filter(
  (item) => (item.net ?? 0) > 0 || (item.gross ?? 0) > 0
);

const allPaid =
  payableLineItems.length > 0 &&
  payableLineItems.every((item) => item.paid === true);
  if (
  allPaid &&
  !window.confirm(
    "This is the last payable employee. Marking this employee as paid will lock the payroll period as PAID. Continue?"
  )
) {
  return;
}

  // 🔥 BUILD UPDATED PERIOD
  const updatedPeriod: PayrollPeriod = {
    ...currentPeriod,
    lineItems: updatedLineItems,
    status: allPaid ? "paid" : currentPeriod.status,
    paidAt: allPaid
      ? new Date().toISOString()
      : currentPeriod.paidAt,
  };

  // 🔥 SAVE
  await savePayrollPeriod(updatedPeriod);

  setLineItems(updatedLineItems);

  // 🔔 Notify employee
  const employee = employees.find((e) => e.id === employeeId);
  const paidItem = updatedLineItems.find((li) => li.employeeId === employeeId);

  if (employee && paidItem) {
    await addDoc(
      collection(db, "companies", companyId, "employee_notifications"),
      {
        type: "payment",
        employeeId: employee.id,
        employeeName: employee.name,
        title: "You’ve been paid",
        message: `You have been paid $${(paidItem.net || 0).toFixed(2)} for payroll period ${currentPeriod.startDate} to ${currentPeriod.endDate}.`,
        periodId: currentPeriod.id,
        revision: currentPeriod.revision ?? 1,
        paymentMethod: paidItem.paymentMethod,
        createdAt: serverTimestamp(),
        read: false,
      }
    );
  }
};

  const handleReopen = async () => {
    if (!currentPeriod || isPaid) return;
    if (
      !window.confirm(
        "Reopen this payroll period? This will return it to draft and require confirmations again."
      )
    ) {
      return;
    }

    await savePayrollPeriod({
      ...currentPeriod,
      status: "draft",
    });
  };

  const handleDelete = async () => {
    if (!currentPeriod) return;
    if (
      !window.confirm(
        "Are you sure you want to permanently delete this payroll period? This cannot be undone."
      )
    ) {
      return;
    }
    await deletePayrollPeriod(currentPeriod.id);
  };

  const changeDate = (amount: number) => {
    switch (payFrequency) {
      case "weekly":
        setCurrentDate((prev) => add(prev, { weeks: amount }));
        break;
      case "bi-weekly":
        setCurrentDate((prev) => add(prev, { weeks: 2 * amount }));
        break;
      case "semi-monthly":
        setCurrentDate((prev) => add(prev, { days: amount > 0 ? 16 : -16 }));
        break;
      case "monthly":
        setCurrentDate((prev) => add(prev, { months: amount }));
        break;
    }
  };

  const downloadCSV = () => {
    const header = [
      "Employee Name",
      "Regular Hours",
      "Bonus Hours",
      "Gross Pay",
      "Flat Bonus",
      "Deductions",
      "Net Pay",
      "Paid",
      "Payment Method",
    ];

    const rows = lineItems.map((item) => [
      item.employeeName,
      ((item.regularMinutes || 0) / 60).toFixed(2),
      ((item.bonusMinutes || 0) / 60).toFixed(2),
      (item.gross || 0).toFixed(2),
      (item.flatBonus || 0).toFixed(2),
      (item.deductions || 0).toFixed(2),
      (item.net || 0).toFixed(2),
      item.paid ? "Yes" : "No",
      item.paymentMethod || "",
    ]);

    const csvContent = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `payroll-${periodId}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const grandTotalNet = useMemo(
    () => lineItems.reduce((sum, item) => sum + (item.net || 0), 0),
    [lineItems]
  );

  const totalGross = useMemo(
    () => lineItems.reduce((sum, item) => sum + (item.gross || 0), 0),
    [lineItems]
  );

  const confirmedIds = useMemo(() => {
    if (!currentPeriod) return new Set<string>();

    const revision = currentPeriod.revision ?? 1;
    return new Set(
      (payrollConfirmations ?? [])
        .filter(
          (c) =>
            c.periodId === currentPeriod.id &&
            c.confirmed &&
            c.revision === revision
        )
        .map((c) => c.employeeId)
    );
  }, [payrollConfirmations, currentPeriod]);

  const confirmedCount = useMemo(() => {
    return lineItems.filter((li) => confirmedIds.has(li.employeeId)).length;
  }, [lineItems, confirmedIds]);

  const allConfirmed = useMemo(() => {
    return lineItems.length > 0 && confirmedCount === lineItems.length;
  }, [lineItems.length, confirmedCount]);

  const generateEmployeePaystub = async (item: PayrollLineItem) => {
    const doc = new jsPDF();

    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = "/Mathieu_logo_AGC.jpg";

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Logo load failed"));
      });

      doc.addImage(img, "JPEG", 14, 10, 36, 36);
    } catch (error) {
      console.warn("Logo load failed for paystub:", error);
    }

    doc.setFontSize(18);
    doc.text("Amazing Grace Cleaners", 55, 20);
    doc.setFontSize(12);
    doc.text("Employee Paystub", 55, 28);

    doc.setFontSize(11);
    doc.text(`Employee: ${item.employeeName}`, 14, 55);
    doc.text(
      `Pay Period: ${String(currentPeriod?.startDate).slice(0, 10)} to ${String(currentPeriod?.endDate).slice(0, 10)}`,
      14,
      63
    );
    doc.text(
      `Revision: ${item.revision ?? currentPeriod?.revision ?? 1}`,
      14,
      71
    );

    doc.text(
      `Regular Hours: ${((item.regularMinutes || 0) / 60).toFixed(2)}`,
      14,
      85
    );
    doc.text(
      `Bonus Hours: ${((item.bonusMinutes || 0) / 60).toFixed(2)}`,
      14,
      93
    );
    doc.text(`Gross Pay: $${(item.gross || 0).toFixed(2)}`, 14, 101);
    doc.text(`Flat Bonus: $${(item.flatBonus || 0).toFixed(2)}`, 14, 109);
    doc.text(`Deductions: $${(item.deductions || 0).toFixed(2)}`, 14, 117);
    doc.text(`Net Pay: $${(item.net || 0).toFixed(2)}`, 14, 125);
    doc.text(`Payment Method: ${item.paymentMethod || "—"}`, 14, 133);

    if (item.paidAt) {
      doc.text(`Paid At: ${new Date(item.paidAt).toLocaleString()}`, 14, 141);
    }

    doc.save(
      `paystub-${item.employeeName.replace(/\s+/g, "-").toLowerCase()}-${currentPeriod?.id}.pdf`
    );
  };

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
            <div>
              <CardTitle>Payroll</CardTitle>
              <CardDescription>
                Calculate payroll for specific periods, track confirmations, pay employees individually, and generate paystubs.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <Tabs defaultValue="period">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="period">Period Payroll</TabsTrigger>
              <TabsTrigger value="yearly">Yearly Summary</TabsTrigger>
            </TabsList>

            <TabsContent value="period" className="mt-4">
              <div className="flex gap-2 flex-wrap justify-end mb-4">
                <Button
                  onClick={downloadCSV}
                  variant="outline"
                  size="sm"
                  disabled={lineItems.length === 0}
                >
                  <Download className="mr-2 h-4 w-4" /> CSV
                </Button>

                {currentStatus === "draft" && (
                  <Button onClick={handleSendForConfirmation}>
                    <Send className="mr-2 h-4 w-4" />
                    Send for Confirmation
                  </Button>
                )}

                {(currentStatus === "waiting_for_confirmation" ||
                  currentStatus === "ready_to_pay") && (
                  <Button
                    variant="secondary"
                    onClick={handleSaveWaitingOrReady}
                    disabled={isPaid}
                  >
                    Save & Re-send confirmation
                  </Button>
                )}

                {(currentStatus === "waiting_for_confirmation" ||
                  currentStatus === "ready_to_pay") &&
                  !isPaid && (
                    <Button onClick={handleReopen} variant="destructive">
                      Re-open Period
                    </Button>
                  )}

                {currentStatus === "draft" && currentPeriod && (
                  <Button
                    onClick={handleDelete}
                    variant="destructive"
                    size="sm"
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Delete Period
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end mb-6">
                <div className="space-y-2">
                  <Label>Pay Frequency</Label>
                  <Select
                    value={payFrequency}
                    onValueChange={(v: PayFrequency) => setPayFrequency(v)}
                    
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="bi-weekly">Bi-Weekly</SelectItem>
                      <SelectItem value="semi-monthly">Semi-Monthly</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Pay Period</Label>
                  {payFrequency === "custom" ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                       
                      />
                      <span>-</span>
                      <Input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => changeDate(-1)}
                        
                      >
                        <ChevronLeft />
                      </Button>

                      <div className="flex-grow text-center font-medium p-2 border rounded-md">
                        {format(parseISO(startDate), "MMM d")} -{" "}
                        {isValid(parseISO(endDate))
                          ? format(parseISO(endDate), "MMM d, yyyy")
                          : ""}
                      </div>

                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => changeDate(1)}
                       
                      >
                        <ChevronRight />
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="mb-4 flex gap-2 items-center flex-wrap">
                <PayrollStatusBadge status={currentStatus} />

                <Badge variant={allConfirmed ? "default" : "secondary"}>
                  Confirmed {confirmedCount}/{lineItems.length}
                </Badge>
<Badge variant="outline">
  Paid {paidCount}/{payableLineItems.length || 0}
</Badge>
                <Badge variant="outline">
                  Pending {Math.max(0, lineItems.length - confirmedCount)}
                </Badge>

                {currentPeriod?.revision != null && (
                  <Badge variant="outline">Rev. {currentPeriod.revision}</Badge>
                )}
              </div>
<div className="mb-4">
  <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
    <span>Payroll payment progress</span>
    <span>
  {payableLineItems.length === 0 ? "—" : `${paidProgressPct}%`}
</span>
  </div>

  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
    <div
      className={`h-full transition-all ${
  paidProgressPct === 100
    ? "bg-green-600"
    : paidProgressPct > 50
    ? "bg-yellow-500"
    : "bg-red-500"
}`}
      style={{ width: `${paidProgressPct}%` }}
    />
  </div>
</div>
              <ScrollArea className="h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Regular Hours</TableHead>
                      <TableHead>Bonus Hours</TableHead>
                      <TableHead>Gross</TableHead>
                      <TableHead>Flat Bonus</TableHead>
                      <TableHead>Deductions</TableHead>
                      <TableHead className="text-right">Net Pay</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {lineItems.length > 0 ? (
                      lineItems.map((item) => {
                        const employee = employeeMap.get(item.employeeId);
                        const hasConfirmed = confirmedIds.has(item.employeeId);

                        return (
                          <TableRow
                            key={item.employeeId}
                            className={
                              !hasConfirmed && !item.paid
                                ? "bg-amber-50/70 dark:bg-amber-950/20"
                                : ""
                            }
                          >
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span>{item.employeeName}</span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Rev. {item.revision ?? currentPeriod?.revision ?? 1}
                                  </TooltipContent>
                                </Tooltip>

                                {!hasConfirmed && !item.paid && (
                                  <Badge variant="destructive">
                                    Awaiting confirmation
                                  </Badge>
                                )}

                                {hasConfirmed && !item.paid && (
                                  <Badge variant="secondary">
                                    Confirmed
                                  </Badge>
                                )}

                                {item.paid && (
                                  <Badge className="bg-green-600 text-white">
                                    Paid
                                  </Badge>
                                )}

                                {item.paid && item.paymentMethod && (
                                  <Badge variant="outline">
                                    {item.paymentMethod.toUpperCase()}
                                  </Badge>
                                )}

                                {employee?.bankInfo?.bankName && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-muted-foreground"
                                      >
                                        <Banknote className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <div className="text-xs">
                                        <p>
                                          <strong>Bank:</strong>{" "}
                                          {employee.bankInfo.bankName}
                                        </p>
                                        <p>
                                          <strong>Routing:</strong>{" "}
                                          {employee.bankInfo.routingNumber}
                                        </p>
                                        <p>
                                          <strong>Account:</strong>{" "}
                                          {employee.bankInfo.accountNumber}
                                        </p>
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                )}

                                {!item.paid && hasConfirmed && (
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <UserCheck className="h-4 w-4 text-green-600" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>
                                        Payroll confirmed by employee for this revision.
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </TableCell>

                            <TableCell>
                              {((item.regularMinutes || 0) / 60).toFixed(2)}
                            </TableCell>

                            <TableCell>
                              {((item.bonusMinutes || 0) / 60).toFixed(2)}
                            </TableCell>

                            <TableCell>
                              ${(item.gross || 0).toFixed(2)}
                            </TableCell>

                            <TableCell>
                              <Input
                                type="number"
                                value={
                                  Number.isFinite(item.flatBonus)
                                    ? item.flatBonus
                                    : ""
                                }
                                onChange={(e) =>
                                  handleLineItemChange(
                                    item.employeeId,
                                    "flatBonus",
                                    Number.isFinite(Number(e.target.value))
                                      ? Number(e.target.value)
                                      : 0
                                  )
                                }
                                className="w-24 h-8"
                                disabled={isPaid || !!item.paid}
                              />
                            </TableCell>

                            <TableCell>
                              <Input
                                type="number"
                                value={
                                  Number.isFinite(item.deductions)
                                    ? item.deductions
                                    : ""
                                }
                                onChange={(e) =>
                                  handleLineItemChange(
                                    item.employeeId,
                                    "deductions",
                                    Number.isFinite(Number(e.target.value))
                                      ? Number(e.target.value)
                                      : 0
                                  )
                                }
                                className="w-24 h-8"
                                disabled={isPaid || !!item.paid}
                              />
                            </TableCell>

                            <TableCell className="text-right font-mono">
                              ${(item.net || 0).toFixed(2)}
                            </TableCell>

                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2 flex-wrap">
                                {!item.paid && (
                                  <Select
                                    value={paymentMethodByEmployee[item.employeeId] ?? ""}
                                    onValueChange={(v: PaymentMethod) =>
                                      setPaymentMethodByEmployee((prev) => ({
                                        ...prev,
                                        [item.employeeId]: v,
                                      }))
                                    }
                                  >
                                    <SelectTrigger className="w-[120px] h-9">
                                      <SelectValue placeholder="Method" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="cash">Cash</SelectItem>
                                      <SelectItem value="zelle">Zelle</SelectItem>
                                      <SelectItem value="bank">Bank</SelectItem>
                                    </SelectContent>
                                  </Select>
                                )}

                                {!item.paid ? (
                                  <Button
                                    size="sm"
                                    onClick={() =>
                                      handleMarkEmployeePaid(item.employeeId)
                                    }
                                  >
                                    <DollarSign className="mr-2 h-4 w-4" />
                                    Mark Paid
                                  </Button>
                                ) : (
                                  <Badge className="bg-green-600 text-white">
                                    Paid
                                  </Badge>
                                )}

                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => generateEmployeePaystub(item)}
                                >
                                  <FileText className="mr-2 h-4 w-4" />
                                  Paystub
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    handleDeleteLineItem(item.employeeId)
                                  }
                                  disabled={!isEditable}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={8} className="h-24 text-center">
                          No employees or time entries for this period.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>

              <div className="mt-4 pr-4 grid grid-cols-2 sm:grid-cols-3 gap-2 text-right">
                <div className="font-medium">
                  Total Gross: ${totalGross.toFixed(2)}
                </div>
                <div className="font-medium">
                  Total Net: ${grandTotalNet.toFixed(2)}
                </div>
                <div className="text-sm text-muted-foreground">
                  Confirmed: {confirmedCount}/{lineItems.length}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="yearly" className="mt-4">
              <div className="flex items-center gap-4 mb-6">
                <Label htmlFor="year-select">Select Year</Label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger id="year-select" className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableYears.map((year) => (
                      <SelectItem key={year} value={year}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-right">Total Gross Pay</TableHead>
                      <TableHead className="text-right">Total Net Pay</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {yearlySummary.length > 0 ? (
                      yearlySummary.map((summary) => (
                        <TableRow key={summary.employeeName}>
                          <TableCell className="font-medium">
                            {summary.employeeName}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            ${summary.gross.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            ${summary.net.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="h-24 text-center text-muted-foreground"
                        >
                          No paid payroll data for {selectedYear}.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}