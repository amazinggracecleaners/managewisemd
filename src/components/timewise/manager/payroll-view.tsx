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
  Users,
  CheckCircle2,
  Clock3,
  WalletCards,
  TrendingUp,
  Calculator,
  Settings2,
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


type TaxCalculationMode = "automatic" | "manual";

type TaxSettings = {
  workState: string;
  federalWithholdingRate: number;
  stateWithholdingRate: number;
  localWithholdingRate: number;
  employeeSocialSecurityRate: number;
  employeeMedicareRate: number;
  employerSocialSecurityRate: number;
  employerMedicareRate: number;
  federalUnemploymentRate: number;
  stateUnemploymentRate: number;
};

const US_STATES = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"],
  ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"],
  ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"],
  ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"],
  ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"],
  ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"],
  ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"],
  ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"],
  ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"],
  ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"],
  ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"],
  ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"],
  ["WI", "Wisconsin"], ["WY", "Wyoming"], ["DC", "District of Columbia"],
] as const;

const DEFAULT_TAX_SETTINGS: TaxSettings = {
  workState: "KY",
  federalWithholdingRate: 0,
  stateWithholdingRate: 0,
  localWithholdingRate: 0,
  employeeSocialSecurityRate: 6.2,
  employeeMedicareRate: 1.45,
  employerSocialSecurityRate: 6.2,
  employerMedicareRate: 1.45,
  federalUnemploymentRate: 0,
  stateUnemploymentRate: 0,
};

function percentOf(base: number, rate: number): number {
  return Math.round(base * (rate / 100) * 100) / 100;
}


type PayrollTaxField =
  | "federalWithholding"
  | "stateWithholding"
  | "localWithholding"
  | "socialSecurityTax"
  | "medicareTax"
  | "preTaxDeductions"
  | "postTaxDeductions"
  | "garnishments";

type EmployerTaxField =
  | "employerSocialSecurityTax"
  | "employerMedicareTax"
  | "federalUnemploymentTax"
  | "stateUnemploymentTax";

type TaxReadyPayrollLineItem = PayrollLineItem & {
  taxCalculationMode?: TaxCalculationMode;
  workState?: string;
  federalWithholding?: number;
  stateWithholding?: number;
  localWithholding?: number;
  socialSecurityTax?: number;
  medicareTax?: number;
  preTaxDeductions?: number;
  postTaxDeductions?: number;
  garnishments?: number;
  employerSocialSecurityTax?: number;
  employerMedicareTax?: number;
  federalUnemploymentTax?: number;
  stateUnemploymentTax?: number;
  taxableWages?: number;
};

const EMPLOYEE_TAX_FIELDS: PayrollTaxField[] = [
  "federalWithholding",
  "stateWithholding",
  "localWithholding",
  "socialSecurityTax",
  "medicareTax",
  "preTaxDeductions",
  "postTaxDeductions",
  "garnishments",
];

const EMPLOYER_TAX_FIELDS: EmployerTaxField[] = [
  "employerSocialSecurityTax",
  "employerMedicareTax",
  "federalUnemploymentTax",
  "stateUnemploymentTax",
];

function money(value: number | undefined): number {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function getEmployeeTaxesAndDeductions(item: TaxReadyPayrollLineItem): number {
  return EMPLOYEE_TAX_FIELDS.reduce((sum, field) => sum + money(item[field]), 0);
}

function getEmployerTaxes(item: TaxReadyPayrollLineItem): number {
  return EMPLOYER_TAX_FIELDS.reduce((sum, field) => sum + money(item[field]), 0);
}

function calculateTaxReadyLine(item: TaxReadyPayrollLineItem): TaxReadyPayrollLineItem {
  const gross = money(item.gross);
  const preTax = money(item.preTaxDeductions);
  const taxableWages = Math.max(0, gross - preTax);
  const deductions = getEmployeeTaxesAndDeductions(item);
  const net = Math.max(0, gross - deductions);

  return {
    ...item,
    taxableWages,
    deductions,
    net,
  };
}


function calculateAutomaticTaxes(
  item: TaxReadyPayrollLineItem,
  settings: TaxSettings
): TaxReadyPayrollLineItem {
  const gross = money(item.gross);
  const preTaxDeductions = money(item.preTaxDeductions);
  const taxableWages = Math.max(0, gross - preTaxDeductions);

  const next: TaxReadyPayrollLineItem = {
    ...item,
    taxCalculationMode: "automatic",
    workState: settings.workState,
    taxableWages,
    federalWithholding: percentOf(taxableWages, settings.federalWithholdingRate),
    stateWithholding: percentOf(taxableWages, settings.stateWithholdingRate),
    localWithholding: percentOf(taxableWages, settings.localWithholdingRate),
    socialSecurityTax: percentOf(taxableWages, settings.employeeSocialSecurityRate),
    medicareTax: percentOf(taxableWages, settings.employeeMedicareRate),
    employerSocialSecurityTax: percentOf(
      taxableWages,
      settings.employerSocialSecurityRate
    ),
    employerMedicareTax: percentOf(
      taxableWages,
      settings.employerMedicareRate
    ),
    federalUnemploymentTax: percentOf(
      taxableWages,
      settings.federalUnemploymentRate
    ),
    stateUnemploymentTax: percentOf(
      taxableWages,
      settings.stateUnemploymentRate
    ),
  };

  return calculateTaxReadyLine(next);
}

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
      ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:from-emerald-950/50 dark:to-green-950/40 dark:text-emerald-300"
      : status === "ready_to_pay"
      ? "border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:from-blue-950/50 dark:to-sky-950/40 dark:text-blue-300"
      : status === "waiting_for_confirmation"
      ? "border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:from-amber-950/50 dark:to-orange-950/40 dark:text-amber-300"
      : "border border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:from-slate-900 dark:to-slate-800 dark:text-slate-300";

  const label =
    status === "paid"
      ? "Paid"
      : status === "ready_to_pay"
      ? "Ready to Pay"
      : status === "waiting_for_confirmation"
      ? "Waiting for Confirmation"
      : "Draft";

  return (
    <Badge className={`${className} rounded-full px-3 py-1 font-semibold`}>
      {label}
    </Badge>
  );
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

  const [lineItems, setLineItems] = useState<TaxReadyPayrollLineItem[]>([]);
  const [paymentMethodByEmployee, setPaymentMethodByEmployee] = useState<
    Record<string, PaymentMethod>
  >({});

  const [taxCalculationMode, setTaxCalculationMode] =
    useState<TaxCalculationMode>("automatic");
  const [taxSettings, setTaxSettings] =
    useState<TaxSettings>(DEFAULT_TAX_SETTINGS);

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
      setLineItems(
        (currentPeriod.lineItems ?? []).map((item) => {
          const taxItem = item as TaxReadyPayrollLineItem;
          return (taxItem.taxCalculationMode ?? taxCalculationMode) === "automatic"
            ? calculateAutomaticTaxes(taxItem, taxSettings)
            : calculateTaxReadyLine(taxItem);
        })
      );

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

/*
 * IMPORTANT:
 * Build complete sessions BEFORE filtering by payroll period.
 *
 * Example:
 * IN  — July 31, 11:15 PM
 * OUT — August 1, 1:30 AM
 *
 * Both entries are available to groupSessions(), so the shift
 * becomes one completed 2h15 session.
 */
const allSessions = groupSessions(
  timeEntries
    .slice()
    .sort((a, b) => a.ts - b.ts)
);

/*
 * Payroll rule:
 * The entire completed shift belongs to the payroll period
 * in which the employee CLOCKED IN.
 */
const sessions = allSessions.filter((session) => {
  if (!session.in) {
    return false;
  }

  return (
    session.in.ts >= fromTime &&
    session.in.ts <= toTime
  );
});

    const newLineItems = employees
  .filter(
    (employee) => (employee.status || "active") !== "inactive"
  )
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

        const baseLine = {
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
          taxCalculationMode,
          workState: taxSettings.workState,
        } as TaxReadyPayrollLineItem;

        return taxCalculationMode === "automatic"
          ? calculateAutomaticTaxes(baseLine, taxSettings)
          : calculateTaxReadyLine(baseLine);
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
    taxCalculationMode,
    taxSettings,
  ]);

  const yearlySummary = useMemo(() => {
  const summary = new Map<
    string,
    { employeeName: string; gross: number; taxes: number; deductions: number; employerTaxes: number; net: number }
  >();

  employees.forEach((emp) => {
    summary.set(emp.id, { employeeName: emp.name, gross: 0, taxes: 0, deductions: 0, employerTaxes: 0, net: 0 });
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
          taxes: 0,
          deductions: 0,
          employerTaxes: 0,
          net: 0,
        });
      }

      const current = summary.get(item.employeeId)!;
      const taxItem = item as TaxReadyPayrollLineItem;
      current.gross += money(taxItem.gross);
      current.taxes +=
        money(taxItem.federalWithholding) +
        money(taxItem.stateWithholding) +
        money(taxItem.localWithholding) +
        money(taxItem.socialSecurityTax) +
        money(taxItem.medicareTax);
      current.deductions +=
        money(taxItem.preTaxDeductions) +
        money(taxItem.postTaxDeductions) +
        money(taxItem.garnishments);
      current.employerTaxes += getEmployerTaxes(taxItem);
      current.net += money(taxItem.net);
    });
  });

  return Array.from(summary.values())
    .filter((s) => s.gross > 0 || s.net > 0 || s.taxes > 0 || s.deductions > 0)
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}, [payrollPeriods, employees, selectedYear]);
  const isPaid = currentStatus === "paid";
const isLocked = isPaid;
const isEditable = !isLocked;

  const sendPayrollNotifications = async (
  periodToNotify: PayrollPeriod,
  onlyReconfirmation: boolean = false
) => {
  const targetLineItems = onlyReconfirmation
    ? (periodToNotify.lineItems ?? []).filter(
        (li) => (li as any).needsReconfirmation === true
      )
    : periodToNotify.lineItems ?? [];

  if (!targetLineItems.length) return;

  try {
    await Promise.all(
      targetLineItems.map((li) =>
        addDoc(collection(db, "companies", companyId, "employee_notifications"), {
          employeeId: li.employeeId,
          employeeName: li.employeeName,
          type: onlyReconfirmation
            ? "payroll-reconfirmation"
            : "payroll-confirmation",
          title: onlyReconfirmation
            ? "Payroll reconfirmation requested"
            : "Payroll confirmation requested",
          message: onlyReconfirmation
            ? `Your payroll for ${periodToNotify.startDate} to ${periodToNotify.endDate} was corrected and is ready for review.`
            : `Your payroll for ${periodToNotify.startDate} to ${periodToNotify.endDate} is ready for confirmation.`,
          periodId: periodToNotify.id,
          revision: periodToNotify.revision ?? 1,
          createdAt: serverTimestamp(),
          read: false,
        })
      )
    );
  } catch (error) {
    console.error("Failed to create payroll notifications:", error);
  }

  
    try {
      const fn = getFunctions(app, "us-central1");

      const sendPayrollConfirmationSms = httpsCallable<
        {
  companyId: string;
  periodId: string;
  employeeIds: string[];
  type: "confirmation" | "reconfirmation";
},
        { success: boolean; count: number; results: any[] }
      >(fn, "sendPayrollConfirmationSms");

      await sendPayrollConfirmationSms({
  companyId,
  periodId: periodToNotify.id,
  employeeIds: targetLineItems.map((li) => li.employeeId),
  type: onlyReconfirmation ? "reconfirmation" : "confirmation",
});
    } catch (error) {
      console.error("Failed to send payroll SMS:", error);
    }
  
};

  const handleLineItemChange = (
    employeeId: string,
    field: "flatBonus" | PayrollTaxField | EmployerTaxField,
    value: number
  ) => {
    if (isPaid) return;

    setLineItems((prev) =>
      prev.map((item) => {
        if (item.employeeId !== employeeId || item.paid) return item;

        const previousValue = money(item[field]);
        const previousCorrections =
          (item as TaxReadyPayrollLineItem & {
            corrections?: Record<string, unknown>;
          }).corrections ?? {};

        const next: TaxReadyPayrollLineItem = {
          ...item,
          [field]: value,
          needsReconfirmation: true,
          wasCorrected: true,
          corrections: {
            ...previousCorrections,
            [field]: {
              before: previousValue,
              after: value,
              changedAt: new Date().toISOString(),
            },
          },
        } as TaxReadyPayrollLineItem;

        if (field === "flatBonus") {
          const grossWithoutFlat = money(item.gross) - money(item.flatBonus);
          next.gross = grossWithoutFlat + money(next.flatBonus);
        }

        const mode = next.taxCalculationMode ?? taxCalculationMode;
        return mode === "automatic"
          ? calculateAutomaticTaxes(next, taxSettings)
          : calculateTaxReadyLine(next);
      })
    );
  };


  const updateTaxSetting = <K extends keyof TaxSettings>(
    field: K,
    value: TaxSettings[K]
  ) => {
    setTaxSettings((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const applyAutomaticTaxes = () => {
    setTaxCalculationMode("automatic");
    setLineItems((previous) =>
      previous.map((item) =>
        item.paid
          ? item
          : calculateAutomaticTaxes(
              {
                ...item,
                taxCalculationMode: "automatic",
                workState: taxSettings.workState,
              },
              taxSettings
            )
      )
    );
  };

  const switchToManualTaxes = () => {
    setTaxCalculationMode("manual");
    setLineItems((previous) =>
      previous.map((item) => ({
        ...item,
        taxCalculationMode: "manual",
        workState: taxSettings.workState,
      }))
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

    const nextRevision = currentPeriod.revision ?? 1;

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
    await sendPayrollNotifications(next, true);
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
      "Taxable Wages",
      "Federal Withholding",
      "State Withholding",
      "Local Withholding",
      "Social Security",
      "Medicare",
      "Pre-Tax Deductions",
      "Post-Tax Deductions",
      "Garnishments",
      "Total Employee Deductions",
      "Net Pay",
      "Employer Social Security",
      "Employer Medicare",
      "Federal Unemployment",
      "State Unemployment",
      "Employer Tax Cost",
      "Paid",
      "Payment Method",
    ];

    const rows = lineItems.map((item) => [
      item.employeeName,
      ((item.regularMinutes || 0) / 60).toFixed(2),
      ((item.bonusMinutes || 0) / 60).toFixed(2),
      money(item.gross).toFixed(2),
      money(item.taxableWages).toFixed(2),
      money(item.federalWithholding).toFixed(2),
      money(item.stateWithholding).toFixed(2),
      money(item.localWithholding).toFixed(2),
      money(item.socialSecurityTax).toFixed(2),
      money(item.medicareTax).toFixed(2),
      money(item.preTaxDeductions).toFixed(2),
      money(item.postTaxDeductions).toFixed(2),
      money(item.garnishments).toFixed(2),
      getEmployeeTaxesAndDeductions(item).toFixed(2),
      money(item.net).toFixed(2),
      money(item.employerSocialSecurityTax).toFixed(2),
      money(item.employerMedicareTax).toFixed(2),
      money(item.federalUnemploymentTax).toFixed(2),
      money(item.stateUnemploymentTax).toFixed(2),
      getEmployerTaxes(item).toFixed(2),
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

  const totalEmployeeTaxes = useMemo(
    () =>
      lineItems.reduce(
        (sum, item) =>
          sum +
          money(item.federalWithholding) +
          money(item.stateWithholding) +
          money(item.localWithholding) +
          money(item.socialSecurityTax) +
          money(item.medicareTax),
        0
      ),
    [lineItems]
  );

  const totalOtherDeductions = useMemo(
    () =>
      lineItems.reduce(
        (sum, item) =>
          sum +
          money(item.preTaxDeductions) +
          money(item.postTaxDeductions) +
          money(item.garnishments),
        0
      ),
    [lineItems]
  );

  const totalEmployerTaxes = useMemo(
    () => lineItems.reduce((sum, item) => sum + getEmployerTaxes(item), 0),
    [lineItems]
  );

  const totalEmployerCost = totalGross + totalEmployerTaxes;
console.log("Payroll Confirmations", payrollConfirmations);
  const confirmedIds = useMemo(() => {
  if (!currentPeriod) return new Set<string>();

  const revision = currentPeriod.revision ?? 1;

  return new Set(
    (payrollConfirmations ?? [])
      .filter((c) => {
        const line = currentPeriod.lineItems?.find(
          (li) => li.employeeId === c.employeeId
        );

        if ((line as any)?.needsReconfirmation === true) {
          return false;
        }

        return (
          c.periodId === currentPeriod.id &&
         c.confirmed &&
          c.revision === revision
        );
      })
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
    const taxItem = item as TaxReadyPayrollLineItem;
    doc.text(`Gross Pay: $${money(taxItem.gross).toFixed(2)}`, 14, 101);
    doc.text(`Taxable Wages: $${money(taxItem.taxableWages).toFixed(2)}`, 14, 109);
    doc.text(`Federal Withholding: $${money(taxItem.federalWithholding).toFixed(2)}`, 14, 117);
    doc.text(`State Withholding: $${money(taxItem.stateWithholding).toFixed(2)}`, 14, 125);
    doc.text(`Local Withholding: $${money(taxItem.localWithholding).toFixed(2)}`, 14, 133);
    doc.text(`Social Security: $${money(taxItem.socialSecurityTax).toFixed(2)}`, 14, 141);
    doc.text(`Medicare: $${money(taxItem.medicareTax).toFixed(2)}`, 14, 149);
    doc.text(`Other Deductions: $${(
      money(taxItem.preTaxDeductions) +
      money(taxItem.postTaxDeductions) +
      money(taxItem.garnishments)
    ).toFixed(2)}`, 14, 157);
    doc.text(`Total Deductions: $${getEmployeeTaxesAndDeductions(taxItem).toFixed(2)}`, 14, 165);
    doc.setFontSize(13);
    doc.text(`Net Pay: $${money(taxItem.net).toFixed(2)}`, 14, 175);
    doc.setFontSize(11);
    doc.text(`Payment Method: ${taxItem.paymentMethod || "—"}`, 14, 184);

    if (taxItem.paidAt) {
      doc.text(`Paid At: ${new Date(taxItem.paidAt).toLocaleString()}`, 14, 192);
    }

    doc.save(
      `paystub-${item.employeeName.replace(/\s+/g, "-").toLowerCase()}-${currentPeriod?.id}.pdf`
    );
  };

  return (
    <TooltipProvider>
      <Card className="overflow-hidden border-0 bg-slate-50/70 shadow-xl dark:bg-slate-950">
        <CardHeader className="border-b border-blue-100 bg-gradient-to-r from-slate-950 via-blue-950 to-indigo-950 text-white dark:border-slate-800">
          <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/15 bg-white/10 shadow-md backdrop-blur-sm">
                <WalletCards className="h-7 w-7 text-white" />
              </div>
              <div>
                <CardTitle className="text-2xl font-semibold tracking-tight text-white">
                  Payroll
                </CardTitle>
                <CardDescription className="mt-1 max-w-3xl text-blue-100">
                  Calculate payroll for specific periods, track confirmations, pay employees individually, and generate paystubs.
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          <Tabs defaultValue="period">
            <TabsList className="grid w-full grid-cols-3 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
              <TabsTrigger value="period" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-blue-900 data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-blue-200">
                Period Payroll
              </TabsTrigger>
              <TabsTrigger value="yearly" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-blue-900 data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-blue-200">
                Yearly Summary
              </TabsTrigger>
              <TabsTrigger value="taxes" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-blue-900 data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-blue-200">
                Taxes & Deductions
              </TabsTrigger>
            </TabsList>

            <TabsContent value="period" className="mt-4">
              <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="group rounded-xl border border-emerald-200 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md dark:border-emerald-900 dark:bg-slate-950">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Total Gross Pay</p>
                      <p className="mt-2 text-2xl font-semibold tracking-tight text-emerald-900 dark:text-emerald-100">
                        ${totalGross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="rounded-xl bg-emerald-600 p-3 text-white shadow-md transition-opacity group-hover:opacity-90">
                      <TrendingUp className="h-6 w-6" />
                    </div>
                  </div>
                </div>

                <div className="group rounded-xl border border-blue-200 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md dark:border-blue-900 dark:bg-slate-950">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Total Net Pay</p>
                      <p className="mt-2 text-2xl font-semibold tracking-tight text-blue-900 dark:text-blue-100">
                        ${grandTotalNet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="rounded-xl bg-blue-700 p-3 text-white shadow-md transition-opacity group-hover:opacity-90">
                      <DollarSign className="h-6 w-6" />
                    </div>
                  </div>
                </div>

                <div className="group rounded-xl border border-amber-200 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md dark:border-amber-900 dark:bg-slate-950">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Employees Paid</p>
                      <p className="mt-2 text-2xl font-semibold tracking-tight text-amber-900 dark:text-amber-100">
                        {paidCount}/{payableLineItems.length || 0}
                      </p>
                    </div>
                    <div className="rounded-xl bg-amber-500 p-3 text-white shadow-md transition-opacity group-hover:opacity-90">
                      <Users className="h-6 w-6" />
                    </div>
                  </div>
                </div>

                <div className="group rounded-xl border border-violet-200 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md dark:border-violet-900 dark:bg-slate-950">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-violet-700 dark:text-violet-300">Confirmed</p>
                      <p className="mt-2 text-2xl font-semibold tracking-tight text-violet-900 dark:text-violet-100">
                        {confirmedCount}/{lineItems.length}
                      </p>
                    </div>
                    <div className="rounded-xl bg-indigo-600 p-3 text-white shadow-md transition-opacity group-hover:opacity-90">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-4 flex flex-wrap justify-end gap-2">
                <Button
                  onClick={downloadCSV}
                  variant="outline"
                  size="sm"
                  disabled={lineItems.length === 0}
                  className="border-0 bg-emerald-600 text-white shadow-md transition-colors hover:bg-emerald-700 hover:shadow-xl"
                >
                  <Download className="mr-2 h-4 w-4" /> CSV
                </Button>

                {currentStatus === "draft" && (
                  <Button
                    onClick={handleSendForConfirmation}
                    className="bg-blue-700 text-white shadow-md transition-colors hover:bg-blue-800 hover:shadow-xl"
                  >
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
                    className="bg-indigo-700 text-white shadow-md transition-colors hover:bg-indigo-800 hover:shadow-xl"
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

              <div className="mb-6 grid grid-cols-1 items-end gap-4 rounded-xl border border-blue-200 bg-white p-5 shadow-sm md:grid-cols-2 dark:border-blue-900 dark:bg-slate-950">
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

              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
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
<div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/20">
  <div className="mb-2 flex items-center justify-between text-sm font-medium text-emerald-800 dark:text-emerald-300">
    <span>Payroll payment progress</span>
    <span>
  {payableLineItems.length === 0 ? "—" : `${paidProgressPct}%`}
</span>
  </div>

  <div className="h-3 w-full overflow-hidden rounded-full bg-emerald-100 shadow-inner dark:bg-emerald-950/50">
    <div
      className={`h-full transition-all ${
  paidProgressPct === 100
    ? "bg-emerald-600"
    : paidProgressPct > 50
    ? "bg-amber-500"
    : "bg-rose-600"
}`}
      style={{ width: `${paidProgressPct}%` }}
    />
  </div>
</div>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md dark:border-slate-800 dark:bg-slate-950">
              <ScrollArea className="h-96">
                <Table>
                  <TableHeader className="bg-slate-900">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-white">Employee</TableHead>
                      <TableHead className="text-white">Regular Hours</TableHead>
                      <TableHead className="text-white">Bonus Hours</TableHead>
                      <TableHead className="text-white">Gross</TableHead>
                      <TableHead className="text-white">Flat Bonus</TableHead>
                      <TableHead className="text-white">Taxes & Deductions</TableHead>
                      <TableHead className="text-right text-white">Net Pay</TableHead>
                      <TableHead className="text-right text-white">Actions</TableHead>
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
                                ? "bg-amber-50/80 transition-colors hover:bg-amber-100/80 dark:bg-amber-950/20 dark:hover:bg-amber-950/30"
                                : "odd:bg-white even:bg-slate-50/70 transition-colors hover:bg-blue-50/80 dark:odd:bg-slate-950 dark:even:bg-slate-900/60 dark:hover:bg-blue-950/20"
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

                                {hasConfirmed && !item.paid && !(item as any)?.needsReconfirmation && (
  <Badge variant="secondary">Confirmed</Badge>
)}

                                {(item as any)?.needsReconfirmation && !item.paid && (
  <Badge className="bg-orange-500 text-white">
    Corrected
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
                              <div className="min-w-[130px]">
                                <div className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                                  ${getEmployeeTaxesAndDeductions(item).toFixed(2)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Manage in Taxes tab
                                </div>
                              </div>
                            </TableCell>

                            <TableCell className="text-right font-mono font-bold text-emerald-700 dark:text-emerald-300">
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
                                    className="bg-emerald-600 text-white shadow-md transition-colors hover:bg-emerald-700 hover:shadow-md"
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
                                  className="border-blue-200 bg-blue-50 text-blue-700 shadow-sm hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300"
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
                                  className="rounded-full hover:bg-rose-100 dark:hover:bg-rose-950/50"
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
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm dark:border-emerald-900 dark:from-emerald-950/30 dark:to-green-950/20">
                  <p className="text-sm text-emerald-700 dark:text-emerald-300">Gross Payroll</p>
                  <p className="mt-1 text-xl font-semibold text-emerald-900 dark:text-emerald-100">${totalGross.toFixed(2)}</p>
                </div>
                <div className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm dark:border-blue-900 dark:from-blue-950/30 dark:to-sky-950/20">
                  <p className="text-sm text-blue-700 dark:text-blue-300">Net Payroll</p>
                  <p className="mt-1 text-xl font-semibold text-blue-900 dark:text-blue-100">${grandTotalNet.toFixed(2)}</p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm dark:border-amber-900 dark:bg-slate-950">
                  <p className="text-sm text-amber-700 dark:text-amber-300">Employee Taxes</p>
                  <p className="mt-1 text-xl font-semibold text-amber-900 dark:text-amber-100">${totalEmployeeTaxes.toFixed(2)}</p>
                </div>
                <div className="rounded-xl border border-violet-200 bg-white p-4 shadow-sm dark:border-violet-900 dark:bg-slate-950">
                  <p className="text-sm text-violet-700 dark:text-violet-300">Other Deductions</p>
                  <p className="mt-1 text-xl font-semibold text-violet-900 dark:text-violet-100">${totalOtherDeductions.toFixed(2)}</p>
                </div>
                <div className="rounded-xl border border-slate-300 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                  <p className="text-sm text-slate-600 dark:text-slate-300">Employer Payroll Cost</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">${totalEmployerCost.toFixed(2)}</p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="yearly" className="mt-4">
              <div className="mb-6 flex items-center gap-4 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 shadow-sm dark:border-blue-900 dark:bg-slate-950">
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

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md dark:border-slate-800 dark:bg-slate-950">
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader className="bg-slate-900">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-white">Employee</TableHead>
                      <TableHead className="text-right text-white">Gross</TableHead>
                      <TableHead className="text-right text-white">Employee Taxes</TableHead>
                      <TableHead className="text-right text-white">Other Deductions</TableHead>
                      <TableHead className="text-right text-white">Employer Taxes</TableHead>
                      <TableHead className="text-right text-white">Net Pay</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {yearlySummary.length > 0 ? (
                      yearlySummary.map((summary) => (
                        <TableRow key={summary.employeeName} className="odd:bg-white even:bg-slate-50/70 transition-colors hover:bg-blue-50/80 dark:odd:bg-slate-950 dark:even:bg-slate-900/60 dark:hover:bg-blue-950/20">
                          <TableCell className="font-medium">
                            {summary.employeeName}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            ${summary.gross.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-amber-700 dark:text-amber-300">
                            ${summary.taxes.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-violet-700 dark:text-violet-300">
                            ${summary.deductions.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-slate-700 dark:text-slate-300">
                            ${summary.employerTaxes.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-emerald-700 dark:text-emerald-300">
                            ${summary.net.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="h-24 text-center text-muted-foreground"
                        >
                          No paid payroll data for {selectedYear}.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
              </div>
            </TabsContent>

            <TabsContent value="taxes" className="mt-4">
              <div className="mb-5 rounded-xl border border-blue-200 bg-white p-5 shadow-sm dark:border-blue-900 dark:bg-slate-950">
                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Settings2 className="h-5 w-5 text-blue-700 dark:text-blue-300" />
                      <h3 className="font-semibold text-slate-900 dark:text-white">
                        Tax calculation settings
                      </h3>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Select the employee work state, enter verified rates, then choose automatic calculation or manual entry.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={taxCalculationMode === "automatic" ? "default" : "outline"}
                      onClick={applyAutomaticTaxes}
                      className={taxCalculationMode === "automatic" ? "bg-blue-700 hover:bg-blue-800" : ""}
                    >
                      <Calculator className="mr-2 h-4 w-4" />
                      Automatic
                    </Button>
                    <Button
                      type="button"
                      variant={taxCalculationMode === "manual" ? "default" : "outline"}
                      onClick={switchToManualTaxes}
                      className={taxCalculationMode === "manual" ? "bg-slate-800 hover:bg-slate-900" : ""}
                    >
                      <Settings2 className="mr-2 h-4 w-4" />
                      Manual
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Employee Work State</Label>
                    <Select
                      value={taxSettings.workState}
                      onValueChange={(value) => updateTaxSetting("workState", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                      <SelectContent>
                        {US_STATES.map(([code, name]) => (
                          <SelectItem key={code} value={code}>
                            {name} ({code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {[
                    ["federalWithholdingRate", "Federal withholding %"],
                    ["stateWithholdingRate", "State withholding %"],
                    ["localWithholdingRate", "Local withholding %"],
                    ["employeeSocialSecurityRate", "Employee Social Security %"],
                    ["employeeMedicareRate", "Employee Medicare %"],
                    ["employerSocialSecurityRate", "Employer Social Security %"],
                    ["employerMedicareRate", "Employer Medicare %"],
                    ["federalUnemploymentRate", "FUTA %"],
                    ["stateUnemploymentRate", "SUTA %"],
                  ].map(([field, label]) => (
                    <div key={field} className="space-y-2">
                      <Label>{label}</Label>
                      <div className="relative">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={taxSettings[field as keyof TaxSettings] as number}
                          onChange={(event) =>
                            updateTaxSetting(
                              field as keyof TaxSettings,
                              Math.max(0, Number(event.target.value) || 0) as never
                            )
                          }
                          className="pr-8 text-right"
                          disabled={taxCalculationMode === "manual"}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          %
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 text-sm dark:border-slate-800">
                  <div className="text-muted-foreground">
                    State: <span className="font-medium text-foreground">{taxSettings.workState}</span>
                    {" • "}
                    Mode: <span className="font-medium capitalize text-foreground">{taxCalculationMode}</span>
                  </div>
                  {taxCalculationMode === "automatic" && (
                    <Button type="button" onClick={applyAutomaticTaxes} className="bg-blue-700 hover:bg-blue-800">
                      Recalculate Payroll Taxes
                    </Button>
                  )}
                </div>
              </div>

              <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900 shadow-sm dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                <div className="flex items-start gap-3">
                  <Clock3 className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-semibold">Payroll tax and deduction worksheet</p>
                    <p className="mt-1 text-amber-800 dark:text-amber-300">
                      Automatic mode applies the percentage rates entered above to taxable wages.
                      Manual mode lets you override each employee amount. Official withholding can also
                      depend on W-4 elections, wage bases, filing status, local jurisdiction, and current tax law.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm dark:border-amber-900 dark:bg-slate-950">
                  <p className="text-sm text-amber-700 dark:text-amber-300">Employee Taxes</p>
                  <p className="mt-1 text-2xl font-semibold">${totalEmployeeTaxes.toFixed(2)}</p>
                </div>
                <div className="rounded-xl border border-violet-200 bg-white p-4 shadow-sm dark:border-violet-900 dark:bg-slate-950">
                  <p className="text-sm text-violet-700 dark:text-violet-300">Other Deductions</p>
                  <p className="mt-1 text-2xl font-semibold">${totalOtherDeductions.toFixed(2)}</p>
                </div>
                <div className="rounded-xl border border-slate-300 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                  <p className="text-sm text-slate-600 dark:text-slate-300">Employer Taxes</p>
                  <p className="mt-1 text-2xl font-semibold">${totalEmployerTaxes.toFixed(2)}</p>
                </div>
                <div className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm dark:border-blue-900 dark:bg-slate-950">
                  <p className="text-sm text-blue-700 dark:text-blue-300">Total Employer Cost</p>
                  <p className="mt-1 text-2xl font-semibold">${totalEmployerCost.toFixed(2)}</p>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md dark:border-slate-800 dark:bg-slate-950">
                <ScrollArea className="h-[560px]">
                  <Table>
                    <TableHeader className="bg-slate-900">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="sticky left-0 z-10 min-w-[180px] bg-slate-900 text-white">Employee</TableHead>
                        <TableHead className="min-w-[120px] text-right text-white">Gross</TableHead>
                        <TableHead className="min-w-[120px] text-right text-white">Taxable Wages</TableHead>
                        <TableHead className="min-w-[130px] text-white">Federal</TableHead>
                        <TableHead className="min-w-[130px] text-white">State</TableHead>
                        <TableHead className="min-w-[130px] text-white">Local</TableHead>
                        <TableHead className="min-w-[130px] text-white">Social Security</TableHead>
                        <TableHead className="min-w-[130px] text-white">Medicare</TableHead>
                        <TableHead className="min-w-[130px] text-white">Pre-Tax</TableHead>
                        <TableHead className="min-w-[130px] text-white">Post-Tax</TableHead>
                        <TableHead className="min-w-[130px] text-white">Garnishments</TableHead>
                        <TableHead className="min-w-[130px] text-white">Employer SS</TableHead>
                        <TableHead className="min-w-[130px] text-white">Employer Medicare</TableHead>
                        <TableHead className="min-w-[130px] text-white">FUTA</TableHead>
                        <TableHead className="min-w-[130px] text-white">SUTA</TableHead>
                        <TableHead className="min-w-[130px] text-right text-white">Net Pay</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineItems.length > 0 ? (
                        lineItems.map((item) => {
                          const fields: Array<{
                            field: PayrollTaxField | EmployerTaxField;
                            label: string;
                          }> = [
                            { field: "federalWithholding", label: "Federal withholding" },
                            { field: "stateWithholding", label: "State withholding" },
                            { field: "localWithholding", label: "Local withholding" },
                            { field: "socialSecurityTax", label: "Social Security" },
                            { field: "medicareTax", label: "Medicare" },
                            { field: "preTaxDeductions", label: "Pre-tax deductions" },
                            { field: "postTaxDeductions", label: "Post-tax deductions" },
                            { field: "garnishments", label: "Garnishments" },
                            { field: "employerSocialSecurityTax", label: "Employer Social Security" },
                            { field: "employerMedicareTax", label: "Employer Medicare" },
                            { field: "federalUnemploymentTax", label: "Federal unemployment tax" },
                            { field: "stateUnemploymentTax", label: "State unemployment tax" },
                          ];

                          return (
                            <TableRow key={`tax-${item.employeeId}`} className="odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-950 dark:even:bg-slate-900/60">
                              <TableCell className="sticky left-0 z-10 bg-inherit font-medium">
                                <div>{item.employeeName}</div>
                                <div className="text-xs text-muted-foreground">
                                  Total deductions: ${getEmployeeTaxesAndDeductions(item).toFixed(2)}
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-mono">${money(item.gross).toFixed(2)}</TableCell>
                              <TableCell className="text-right font-mono">${money(item.taxableWages).toFixed(2)}</TableCell>
                              {fields.map(({ field, label }) => (
                                <TableCell key={field}>
                                  <Input
                                    aria-label={`${label} for ${item.employeeName}`}
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={money(item[field])}
                                    onChange={(event) =>
                                      handleLineItemChange(
                                        item.employeeId,
                                        field,
                                        Math.max(0, Number(event.target.value) || 0)
                                      )
                                    }
                                    className="h-8 w-28 text-right font-mono"
                                    disabled={
                                      isPaid ||
                                      !!item.paid ||
                                      taxCalculationMode === "automatic"
                                    }
                                  />
                                </TableCell>
                              ))}
                              <TableCell className="text-right font-mono font-semibold text-emerald-700 dark:text-emerald-300">
                                ${money(item.net).toFixed(2)}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={16} className="h-24 text-center text-muted-foreground">
                            No payroll lines are available for this period.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            </TabsContent>

          </Tabs>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}