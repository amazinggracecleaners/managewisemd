"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import type { Invoice, InvoiceLineItem, Site } from "@/shared/types/domain";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  PlusCircle,
  Trash2,
  Edit,
  Download,
  FileText,
  DollarSign,
  CheckCircle2,
  Clock3,
  AlertCircle,
  Search,
  RefreshCw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, parseISO, isValid } from "date-fns";
import { uuid } from "@/lib/time-utils";
import { Badge } from "@/components/ui/badge";
import { cleanForFirestore } from "@/lib/firestore-utils";
import { cn}from "@/lib/utils";
import { useInvoices } from "@/features/invoices/hooks/useInvoices";
import { withComputed } from "@/lib/invoice-math";
import { exportInvoiceToPDF } from "@/lib/invoice-export";
import { useToast } from "@/hooks/use-toast";
import { generateRecurringInvoicesForMonth } from "@/lib/recurring-invoices";
import { Checkbox } from "@/components/ui/checkbox";

interface InvoicePaymentSettings {
  defaultPaidDay?: number;
  paidDateMonthOffset?: 0 | 1;
}

interface InvoiceViewProps {
  sites: Site[];
  invoiceSettings?: InvoicePaymentSettings;
}

const statusColors: Record<string, string> = {
  draft:
    "border border-amber-200 bg-gradient-to-r from-amber-100 to-orange-100 text-amber-800 shadow-sm dark:border-amber-800 dark:from-amber-950/50 dark:to-orange-950/40 dark:text-amber-300",
  sent:
    "border border-blue-200 bg-gradient-to-r from-blue-100 to-sky-100 text-blue-800 shadow-sm dark:border-blue-800 dark:from-blue-950/50 dark:to-sky-950/40 dark:text-blue-300",
  unpaid:
    "border border-orange-200 bg-gradient-to-r from-orange-100 to-amber-100 text-orange-800 shadow-sm dark:border-orange-800 dark:from-orange-950/50 dark:to-amber-950/40 dark:text-orange-300",
  partially_paid:
    "border border-violet-200 bg-gradient-to-r from-violet-100 to-purple-100 text-violet-800 shadow-sm dark:border-violet-800 dark:from-violet-950/50 dark:to-purple-950/40 dark:text-violet-300",
  paid:
    "border border-emerald-200 bg-gradient-to-r from-emerald-100 to-green-100 text-emerald-800 shadow-sm dark:border-emerald-800 dark:from-emerald-950/50 dark:to-green-950/40 dark:text-emerald-300",
  void:
    "border border-rose-200 bg-gradient-to-r from-rose-100 to-red-100 text-rose-800 shadow-sm dark:border-rose-800 dark:from-rose-950/50 dark:to-red-950/40 dark:text-rose-300",
};

const todayISO = () => format(new Date(), "yyyy-MM-dd");

const hasPaidDateArrived = (paidDate?: string | null) => {
  if (!paidDate) return false;
  const parsed = parseISO(paidDate);
  if (!isValid(parsed)) return false;
  return paidDate <= todayISO();
};

// Company-specific payment schedule.
// Example A: day 27 + following month => September service -> October 27.
// Example B: day 3 + same month => September service -> September 3.
const getDefaultPaidDate = (
  serviceOrInvoiceDate?: string | null,
  invoiceSettings?: InvoicePaymentSettings
) => {
  const base = serviceOrInvoiceDate ? parseISO(serviceOrInvoiceDate) : new Date();
  const validBase = isValid(base) ? base : new Date();

  const requestedDay = Math.min(31, Math.max(1, Number(invoiceSettings?.defaultPaidDay ?? 27)));
  const monthOffset = invoiceSettings?.paidDateMonthOffset ?? 1;

  const targetYear = validBase.getFullYear();
  const targetMonth = validBase.getMonth() + monthOffset;
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const safeDay = Math.min(requestedDay, lastDayOfTargetMonth);

  return format(new Date(targetYear, targetMonth, safeDay), "yyyy-MM-dd");
};

const getMonthBounds = (monthISO: string) => {
  const start = parseISO(`${monthISO}-01`);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);

  return {
    invoiceDate: format(start, "yyyy-MM-dd"),
    serviceStartDate: format(start, "yyyy-MM-dd"),
    serviceEndDate: format(end, "yyyy-MM-dd"),
  };
};

const isoToDisplayDate = (value?: string | null) => {
  if (!value) return "";

  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (!match) return value;

  const [, year, month, day] = match;

  return `${month}/${day}/${year}`;
};

const flexibleDateToISO = (
  value: string
): string | null => {
  const trimmed = value.trim();

  if (!trimmed) return null;

  // Already yyyy-MM-dd
  const isoMatch = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (isoMatch) {
    const [, year, month, day] = isoMatch;

    const candidate =
      `${year}-${month}-${day}`;

    return isValid(parseISO(candidate))
      ? candidate
      : null;
  }

  // MM/DD/YYYY
  const slashMatch = trimmed.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
  );

  if (slashMatch) {
    const [, monthRaw, dayRaw, year] =
      slashMatch;

    const month = monthRaw.padStart(2, "0");
    const day = dayRaw.padStart(2, "0");

    const candidate =
      `${year}-${month}-${day}`;

    return isValid(parseISO(candidate))
      ? candidate
      : null;
  }

  // MMDDYYYY — example 09062026
  const numberMatch = trimmed.match(
    /^(\d{2})(\d{2})(\d{4})$/
  );

  if (numberMatch) {
    const [, month, day, year] =
      numberMatch;

    const candidate =
      `${year}-${month}-${day}`;

    return isValid(parseISO(candidate))
      ? candidate
      : null;
  }

  return null;
};

function FlexibleDateInput({
  id,
  value,
  onChange,
  allowEmpty = false,
}: {
  id: string;
  value?: string | null;
  onChange: (value: string | null) => void;
  allowEmpty?: boolean;
}) {
  const [textValue, setTextValue] =
    useState(() => isoToDisplayDate(value));

  useEffect(() => {
    setTextValue(isoToDisplayDate(value));
  }, [value]);

  const commitTypedDate = () => {
    if (!textValue.trim() && allowEmpty) {
      onChange(null);
      return;
    }

    const iso = flexibleDateToISO(textValue);

    if (!iso) {
      setTextValue(isoToDisplayDate(value));
      return;
    }

    setTextValue(isoToDisplayDate(iso));
    onChange(iso);
  };

  return (
    <div className="flex gap-2">
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        placeholder="MM/DD/YYYY"
        value={textValue}
        onChange={(e) =>
          setTextValue(e.target.value)
        }
        onBlur={commitTypedDate}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitTypedDate();
          }
        }}
        className="min-w-0 flex-1"
      />

      <Input
        type="date"
        aria-label={`${id} calendar`}
        value={value || ""}
        onChange={(e) => {
          const next =
            e.target.value || null;

          setTextValue(
            isoToDisplayDate(next)
          );

          onChange(next);
        }}
        className="w-36"
      />
    </div>
  );
}

const prepareRecurringInvoice = (
  invoice: Omit<Invoice, "id">,
  targetMonthISO: string,
  invoiceSettings?: InvoicePaymentSettings
) => {
  const { invoiceDate, serviceStartDate, serviceEndDate } = getMonthBounds(targetMonthISO);

  return {
    ...invoice,
    date: invoiceDate,
    serviceStartDate,
    serviceEndDate,
    status: "draft" as Invoice["status"],
    paidDate: getDefaultPaidDate(serviceStartDate, invoiceSettings),
    amountPaid: null,
    statusManuallyOverridden: false,
  } as Omit<Invoice, "id">;
};

export function InvoiceView({ sites, invoiceSettings }: InvoiceViewProps) {
  const { invoices, create: addInvoice, update: updateInvoice, remove: deleteInvoice } = useInvoices();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [draftInvoice, setDraftInvoice] = useState<Partial<Invoice>>({});

  const { toast } = useToast();
  const autoGeneratedMonthRef = useRef<string | null>(null);

  const [monthISO, setMonthISO] = useState(
  new Date().toISOString().slice(0, 7)
);

const [filterMode, setFilterMode] =
  useState<"all" | "month" | "year">("month");

const [filterYear, setFilterYear] = useState(
  String(new Date().getFullYear())
);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [sortBy, setSortBy] = useState<
  "site-asc" | "site-desc" | "date-newest" | "date-oldest" | "invoice"
>("site-asc");
  const derivedTotals = useMemo(() => {
    const inv = withComputed({
      lineItems: draftInvoice.lineItems,
      taxRate: draftInvoice.taxRate,
      discountAmount: draftInvoice.discountAmount,
    });

    return {
      subtotal: inv.subtotal,
      tax: inv.tax,
      discount: inv.discount,
      total: inv.total,
    };
  }, [draftInvoice.lineItems, draftInvoice.taxRate, draftInvoice.discountAmount]);

  const partialAmountPaid = Number((draftInvoice as any).amountPaid) || 0;
  const partialBalanceDue = Math.max(derivedTotals.total - partialAmountPaid, 0);

  // Persist the Paid status once the scheduled Paid Date arrives.
  // A manager can override the automatic status; the override prevents this effect
  // from changing it back again until the Paid Date is edited.
  useEffect(() => {
    invoices.forEach((invoice) => {
      const status = String(invoice.status);
      const paidDate = (invoice as any).paidDate as string | null | undefined;
      const manuallyOverridden = Boolean((invoice as any).statusManuallyOverridden);

      if (
        !manuallyOverridden &&
        status !== "paid" &&
        status !== "void" &&
        hasPaidDateArrived(paidDate)
      ) {
        updateInvoice(invoice.id, {
          status: "paid" as Invoice["status"],
          statusManuallyOverridden: false,
        } as any);
      }
    });
  }, [invoices, updateInvoice]);

  // Automatically create any missing recurring invoices for the current month.
  // Recurring invoices always start as Draft; the manager changes them to Sent.
  // This also acts as a catch-up if nobody opened the invoice screen on the 1st.
  useEffect(() => {
    const currentMonthISO = new Date().toISOString().slice(0, 7);

    if (autoGeneratedMonthRef.current === currentMonthISO) return;

    const hasRecurringTemplate = invoices.some((invoice) => Boolean(invoice.recurring));
    if (!hasRecurringTemplate) return;

    const generated = generateRecurringInvoicesForMonth({
      targetMonthISO: currentMonthISO,
      allInvoices: invoices,
    });

    autoGeneratedMonthRef.current = currentMonthISO;

    if (!generated.length) return;

    generated
      .map((invoice) => prepareRecurringInvoice(invoice, currentMonthISO, invoiceSettings))
      .forEach((invoice) => addInvoice(invoice));

    toast({
      title: "Monthly draft invoices created",
      description: `Created ${generated.length} recurring draft invoice${
        generated.length > 1 ? "s" : ""
      } for ${currentMonthISO}.`,
    });
 }, [invoices, addInvoice, toast, invoiceSettings]);
  const displayedInvoices = useMemo(() => {
    let filtered = [...invoices];

    if (filterMode === "month") {
  filtered = filtered.filter((inv) =>
    inv.date?.startsWith(monthISO)
  );
}

    if (filterMode === "year") {
      filtered = filtered.filter((inv) => inv.date?.startsWith(filterYear));
    }
const q = invoiceSearch.trim().toLowerCase();

if (q) {
  filtered = filtered.filter((inv) =>
    [
      inv.invoiceNumber,
      inv.siteName,
      inv.status,
      inv.date,
      inv.dueDate,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q))
  );
}
   filtered.sort((a, b) => {
  switch (sortBy) {
    case "site-asc":
      return (a.siteName || "").localeCompare(
        b.siteName || "",
        undefined,
        { sensitivity: "base" }
      );

    case "site-desc":
      return (b.siteName || "").localeCompare(
        a.siteName || "",
        undefined,
        { sensitivity: "base" }
      );

    case "date-newest":
      return (
        (b.date ? parseISO(b.date).getTime() : 0) -
        (a.date ? parseISO(a.date).getTime() : 0)
      );

    case "date-oldest":
      return (
        (a.date ? parseISO(a.date).getTime() : 0) -
        (b.date ? parseISO(b.date).getTime() : 0)
      );

    case "invoice":
      return (a.invoiceNumber || "").localeCompare(
        b.invoiceNumber || "",
        undefined,
        { numeric: true, sensitivity: "base" }
      );

    default:
      return 0;
  }
});

    return filtered;
  }, [
  invoices,
  filterMode,
  monthISO,
  filterYear,
  invoiceSearch,
  sortBy,
]);

  const invoiceKPIs = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    return displayedInvoices.reduce(
      (totals, invoice) => {
        const amount = withComputed(invoice).total || 0;
        const status = String(invoice.status);
        const amountPaid = status === "partially_paid"
          ? Math.max(0, Number((invoice as any).amountPaid) || 0)
          : 0;
        const balanceDue = Math.max(amount - amountPaid, 0);

        if (status !== "void") {
          totals.totalInvoiced += amount;
        }

        if (status === "paid") {
          totals.paid += amount;
        } else if (status === "partially_paid") {
          totals.paid += Math.min(amountPaid, amount);
        }

        if (status !== "paid" && status !== "void") {
          totals.outstanding += status === "partially_paid" ? balanceDue : amount;

          if (
            invoice.dueDate &&
            isValid(parseISO(invoice.dueDate)) &&
            parseISO(invoice.dueDate).getTime() < today.getTime()
          ) {
            totals.overdue += 1;
          }
        }

        return totals;
      },
      {
        totalInvoiced: 0,
        paid: 0,
        outstanding: 0,
        overdue: 0,
      }
    );
  }, [displayedInvoices]);

  const handleGenerateRecurring = () => {
    const newInvoices = generateRecurringInvoicesForMonth({
      targetMonthISO: monthISO,
      allInvoices: invoices,
    });

    if (!newInvoices.length) {
      toast({
        title: "No recurring invoices to create",
        description:
          "Either there are no templates marked as 'repeat monthly' or this month is already generated.",
      });
      return;
    }

    newInvoices
      .map((inv) => prepareRecurringInvoice(inv, monthISO, invoiceSettings))
      .forEach((inv) => addInvoice(inv));

    toast({
      title: "Recurring invoices created",
      description: `Generated ${newInvoices.length} invoice${
        newInvoices.length > 1 ? "s" : ""
      } for ${monthISO}.`,
    });
  };

  const handleOpenDialog = (invoice: Invoice | null = null) => {
    setEditingInvoice(invoice);

    if (invoice) {
      setDraftInvoice(invoice);
    } else {
      setDraftInvoice({
        siteName: "",
        invoiceNumber: `INV-${Date.now()}`,
        date: format(new Date(), "yyyy-MM-dd"),
        serviceStartDate: format(new Date(), "yyyy-MM-01"),
        serviceEndDate: format(
          new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0),
          "yyyy-MM-dd"
        ),
        paidDate: getDefaultPaidDate(format(new Date(), "yyyy-MM-01"), invoiceSettings),
        dueDate: format(new Date(), "yyyy-MM-dd"),
        lineItems: [{ id: uuid(), description: "", quantity: 1, unitPrice: 0, total: 0 }],
        status: "draft",
      });
    }

    setIsDialogOpen(true);
  };

  const handleLineItemChange = (index: number, field: keyof InvoiceLineItem, value: any) => {
    const newLineItems = [...(draftInvoice.lineItems || [])];
    const item = newLineItems[index] as InvoiceLineItem;

    (item[field] as any) = value;

    if (field === "quantity" || field === "unitPrice") {
      const quantity = Number(item.quantity) || 0;
      const unitPrice = Number(item.unitPrice) || 0;
      item.total = quantity * unitPrice;
    }

    setDraftInvoice((prev) => ({ ...prev, lineItems: newLineItems }));
  };

  const addLineItem = () => {
    setDraftInvoice((prev) => ({
      ...prev,
      lineItems: [
        ...(prev.lineItems || []),
        { id: uuid(), description: "", quantity: 1, unitPrice: 0, total: 0 },
      ],
    }));
  };

  const removeLineItem = (index: number) => {
    setDraftInvoice((prev) => ({
      ...prev,
      lineItems: (prev.lineItems || []).filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = () => {
    if (
      !draftInvoice.siteName ||
      !draftInvoice.invoiceNumber ||
      !draftInvoice.date ||
      !draftInvoice.dueDate ||
      (draftInvoice.lineItems || []).length === 0
    ) {
      alert("Please fill out all required fields.");
      return;
    }


    if (String(draftInvoice.status) === "partially_paid") {
      const amountPaid = Number((draftInvoice as any).amountPaid) || 0;
      const invoiceTotal = derivedTotals.total;

      if (amountPaid <= 0) {
        alert("Amount Paid must be greater than $0 for a partially paid invoice.");
        return;
      }

      if (amountPaid >= invoiceTotal) {
        setDraftInvoice((prev) => ({
          ...prev,
          status: "paid" as Invoice["status"],
          paidDate: (prev as any).paidDate || todayISO(),
          amountPaid: null,
          statusManuallyOverridden: true,
        } as any));
        alert("The amount paid covers the full invoice. Status has been changed to Paid. Please save again.");
        return;
      }
    }

    const finalLineItems: InvoiceLineItem[] = (draftInvoice.lineItems || []).map((li) => {
      const quantity = Number(li.quantity) || 0;
      const unitPrice = Number(li.unitPrice) || 0;

      return {
        id: li.id || uuid(),
        description: li.description || "",
        quantity,
        unitPrice,
        total: quantity * unitPrice,
      };
    });

    const baseInvoice = {
      ...(draftInvoice as Omit<Invoice, "id">),
      siteName: draftInvoice.siteName,
      invoiceNumber: draftInvoice.invoiceNumber,
      date: draftInvoice.date,
      serviceStartDate: (draftInvoice as any).serviceStartDate || null,
      serviceEndDate: (draftInvoice as any).serviceEndDate || null,
      paidDate: (draftInvoice as any).paidDate || null,
      amountPaid:
        String(draftInvoice.status) === "partially_paid"
          ? Number((draftInvoice as any).amountPaid) || 0
          : null,
      statusManuallyOverridden: Boolean((draftInvoice as any).statusManuallyOverridden),
      dueDate: draftInvoice.dueDate,
      status: (draftInvoice.status ?? "draft") as Invoice["status"],
      lineItems: finalLineItems,
      taxRate: draftInvoice.taxRate ?? 0,
      discountAmount: draftInvoice.discountAmount ?? 0,
    } as Omit<Invoice, "id"> & {
      amountPaid?: number | null;
      statusManuallyOverridden?: boolean;
    };

    const computed = withComputed(baseInvoice);
    const cleanedData = cleanForFirestore(computed);

    if (editingInvoice) {
      updateInvoice(editingInvoice.id, cleanedData);
    } else {
      addInvoice(cleanedData as Omit<Invoice, "id">);
    }

    setIsDialogOpen(false);
  };

  const downloadCSV = () => {
    const header = ["Invoice #", "Date", "Due Date", "Site", "Status", "Subtotal", "Tax", "Discount", "Total"];
    const rows = displayedInvoices.map((inv) => {
      const computed = withComputed(inv);
      return [
        inv.invoiceNumber,
        inv.date,
        inv.dueDate,
        inv.siteName,
        inv.status,
        computed.subtotal.toFixed(2),
        computed.tax.toFixed(2),
        computed.discount.toFixed(2),
        computed.total.toFixed(2),
      ];
    });

    const csvContent = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute("download", `invoices-${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.style.visibility = "hidden";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Card className="overflow-hidden border-0 bg-gradient-to-b from-slate-50 via-white to-blue-50/40 shadow-2xl dark:from-slate-950 dark:via-slate-950 dark:to-blue-950/20">
      <CardHeader className="space-y-5 border-b border-blue-100 bg-gradient-to-r from-blue-700 via-indigo-700 to-violet-700 text-white dark:border-slate-800">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/15 shadow-lg backdrop-blur-sm">
            <FileText className="h-7 w-7 text-white" />
          </div>
          <div>
            <CardTitle className="text-3xl font-bold tracking-tight text-white">
              Invoices
            </CardTitle>
            <CardDescription className="mt-1 text-blue-100">
              Create, manage and track customer invoices
            </CardDescription>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/15 bg-white/10 p-4 shadow-inner backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm font-medium text-blue-100">
  Invoice Month
</label>
            <Input
              type="month"
              value={monthISO}
              onChange={(e) => setMonthISO(e.target.value)}
              className="w-40 border-white/30 bg-white/95 text-slate-900 shadow-sm"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerateRecurring}
              className="border-0 bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg transition-all hover:-translate-y-0.5 hover:from-violet-700 hover:to-indigo-700 hover:shadow-xl"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Generate Recurring
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={downloadCSV}
              variant="outline"
              size="sm"
              disabled={displayedInvoices.length === 0}
              className="border-0 bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg transition-all hover:-translate-y-0.5 hover:from-emerald-600 hover:to-teal-700 hover:shadow-xl"
            >
              <Download className="mr-2 h-4 w-4" /> CSV
            </Button>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  onClick={() => handleOpenDialog()}
                  className="h-10 bg-gradient-to-r from-blue-500 to-cyan-500 px-5 text-white shadow-lg transition-all hover:-translate-y-0.5 hover:from-blue-600 hover:to-cyan-600 hover:shadow-xl"
                >
                  <PlusCircle className="mr-2 h-4 w-4" /> Create Invoice
                </Button>
              </DialogTrigger>

              <DialogContent className="max-w-4xl overflow-hidden border-0 p-0 shadow-2xl">
                <DialogHeader className="bg-gradient-to-r from-blue-700 via-indigo-700 to-violet-700 px-6 py-5 text-white">
                  <DialogTitle className="text-2xl text-white">
                    {editingInvoice ? "Edit" : "Create"} Invoice
                  </DialogTitle>
                </DialogHeader>

                <ScrollArea className="max-h-[70vh]">
                  <div className="space-y-5 bg-gradient-to-b from-slate-50 to-white px-6 py-5 dark:from-slate-950 dark:to-slate-900">
                    <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 shadow-sm dark:border-blue-900 dark:bg-blue-950/20">
                      <div className="mb-4 flex items-center gap-2 font-semibold text-blue-800 dark:text-blue-300">
                        <FileText className="h-4 w-4" />
                        Customer Information
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="siteName">Site</Label>
                        <Select
                          value={draftInvoice.siteName}
                          onValueChange={(v) => setDraftInvoice((prev) => ({ ...prev, siteName: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a site..." />
                          </SelectTrigger>
                          <SelectContent>
                            {sites.map((s) => (
                              <SelectItem key={s.name} value={s.name}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="invoiceNumber">Invoice #</Label>
                        <Input
                          id="invoiceNumber"
                          value={draftInvoice.invoiceNumber}
                          onChange={(e) =>
                            setDraftInvoice((prev) => ({ ...prev, invoiceNumber: e.target.value }))
                          }
                        />
                      </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 shadow-sm dark:border-indigo-900 dark:bg-indigo-950/20">
                      <div className="mb-4 flex items-center gap-2 font-semibold text-indigo-800 dark:text-indigo-300">
                        <Clock3 className="h-4 w-4" />
                        Invoice Dates
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
                      <div className="space-y-2">
                        <Label htmlFor="date">Date</Label>
                        <FlexibleDateInput
  id="date"
  value={draftInvoice.date || ""}
  onChange={(date) =>
    setDraftInvoice((prev) => ({
      ...prev,
      date: date || "",
    }))
  }
/>
                      </div>
<div className="space-y-2">
  <Label htmlFor="serviceStartDate">
    Service Start
  </Label>

  <FlexibleDateInput
  id="serviceStartDate"
  value={
    (draftInvoice as any)
      .serviceStartDate || ""
  }
  onChange={(serviceStartDate) =>
    setDraftInvoice((prev) => ({
      ...prev,
      serviceStartDate,
    }))
  }
/>
</div>

<div className="space-y-2">
  <Label htmlFor="serviceEndDate">
    Service End
  </Label>

  <FlexibleDateInput
  id="serviceEndDate"
  value={
    (draftInvoice as any)
      .serviceEndDate || ""
  }
  onChange={(serviceEndDate) =>
    setDraftInvoice((prev) => ({
      ...prev,
      serviceEndDate,
    }))
  }
/>
</div>
                      <div className="space-y-2">
                        <Label htmlFor="dueDate">Due Date</Label>
                        <FlexibleDateInput
  id="dueDate"
  value={draftInvoice.dueDate || ""}
  onChange={(dueDate) =>
    setDraftInvoice((prev) => ({
      ...prev,
      dueDate: dueDate || "",
    }))
  }
/>
                      </div>
<div className="space-y-2">
  <Label htmlFor="paidDate">Paid Date</Label>

  <FlexibleDateInput
  id="paidDate"
  value={
    (draftInvoice as any)
      .paidDate || ""
  }
  allowEmpty
  onChange={(paidDate) => {
    setDraftInvoice((prev) => ({
      ...prev,

      paidDate,

      // Manager changed the Paid Date.
      // Allow automatic date-based status
      // logic to apply again.
      statusManuallyOverridden: false,

      status:
        paidDate &&
        hasPaidDateArrived(paidDate)
          ? ("paid" as Invoice["status"])
          : String(prev.status) === "paid"
            ? ("unpaid" as Invoice["status"])
            : prev.status,
    } as any));
  }}
/>
</div>

<div className="space-y-2">
  <Label htmlFor="status">Status</Label>

  <Select
    value={String(draftInvoice.status || "draft")}
    onValueChange={(v) =>
      setDraftInvoice((prev) => ({
        ...prev,
        status: v as Invoice["status"],
        statusManuallyOverridden: true,
        paidDate:
          v === "paid"
            ? (prev as any).paidDate || todayISO()
            : (prev as any).paidDate,
        amountPaid: v === "partially_paid" ? (prev as any).amountPaid ?? "" : null,
      } as any))
    }
  >
    <SelectTrigger>
      <SelectValue />
    </SelectTrigger>

    <SelectContent>
      <SelectItem value="draft">Draft</SelectItem>
      <SelectItem value="sent">Sent</SelectItem>
      <SelectItem value="unpaid">Unpaid</SelectItem>
      <SelectItem value="partially_paid">Partially Paid</SelectItem>
      <SelectItem value="paid">Paid</SelectItem>
      <SelectItem value="void">Void</SelectItem>
    </SelectContent>
  </Select>
</div>
                      </div>

                      {String(draftInvoice.status) === "partially_paid" && (
                        <div className="mt-4 grid grid-cols-1 gap-4 rounded-xl border border-violet-200 bg-white/80 p-4 sm:grid-cols-2 dark:border-violet-900 dark:bg-slate-950/70">
                          <div className="space-y-2">
                            <Label htmlFor="amountPaid">Amount Paid</Label>
                            <Input
                              id="amountPaid"
                              type="number"
                              min="0"
                              step="0.01"
                              max={derivedTotals.total || undefined}
                              value={(draftInvoice as any).amountPaid ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const amount = raw === "" ? "" : Math.max(0, Number(raw) || 0);

                                setDraftInvoice((prev) => ({
                                  ...prev,
                                  amountPaid: amount,
                                } as any));
                              }}
                              placeholder="0.00"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="balanceDue">Balance Due</Label>
                            <Input
                              id="balanceDue"
                              type="text"
                              value={`$${partialBalanceDue.toFixed(2)}`}
                              readOnly
                              className="bg-slate-100 font-mono font-semibold dark:bg-slate-900"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/20">
                      <div className="flex items-center gap-2 text-base font-semibold text-emerald-800 dark:text-emerald-300">
                        <DollarSign className="h-4 w-4" />
                        Line Items
                      </div>
                      <div className="space-y-2">
                        {(draftInvoice.lineItems || []).map((item, index) => (
                          <div key={item.id || index} className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-white p-3 shadow-sm transition hover:shadow-md dark:border-emerald-900 dark:bg-slate-950">
                            <Input
                              placeholder="Description"
                              className="flex-grow"
                              value={item.description}
                              onChange={(e) => handleLineItemChange(index, "description", e.target.value)}
                            />
                            <Input
                              type="number"
                              placeholder="Qty"
                              className="w-20"
                              value={item.quantity}
                              onChange={(e) => handleLineItemChange(index, "quantity", e.target.value)}
                            />
                            <Input
                              type="number"
                              placeholder="Price"
                              className="w-24"
                              value={item.unitPrice}
                              onChange={(e) => handleLineItemChange(index, "unitPrice", e.target.value)}
                            />
                            <span className="w-24 rounded-lg bg-emerald-100 px-2 py-1 text-right font-mono font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                              ${((item.quantity || 0) * (item.unitPrice || 0)).toFixed(2)}
                            </span>
                            <Button variant="ghost" size="icon" onClick={() => removeLineItem(index)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>

                      <Button variant="outline" size="sm" onClick={addLineItem}>
                        <PlusCircle className="mr-2 h-4 w-4" /> Add Item
                      </Button>
                    </div>

                    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm dark:border-amber-900 dark:bg-amber-950/20">
                      <div className="mb-4 flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300">
                        <DollarSign className="h-4 w-4" />
                        Totals
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="notes">Notes (optional)</Label>
                        <Input
                          id="notes"
                          value={draftInvoice.notes ?? ""}
                          onChange={(e) => setDraftInvoice((prev) => ({ ...prev, notes: e.target.value }))}
                        />
                      </div>

                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="taxRate">Tax Rate (%)</Label>
                            <Input
                              type="number"
                              id="taxRate"
                              placeholder="e.g. 7.5"
                              value={(draftInvoice.taxRate || 0) * 100}
                              onChange={(e) =>
                                setDraftInvoice((prev) => ({
                                  ...prev,
                                  taxRate: parseFloat(e.target.value) / 100 || undefined,
                                }))
                              }
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="discountAmount">Discount ($)</Label>
                            <Input
                              type="number"
                              id="discountAmount"
                              placeholder="e.g. 50"
                              value={draftInvoice.discountAmount || ""}
                              onChange={(e) =>
                                setDraftInvoice((prev) => ({
                                  ...prev,
                                  discountAmount: parseFloat(e.target.value) || undefined,
                                }))
                              }
                            />
                          </div>
                        </div>

                        <div className="space-y-2 rounded-xl border border-emerald-200 bg-white p-4 text-sm shadow-sm dark:border-emerald-900 dark:bg-slate-950">
                          <div className="flex justify-between">
                            <span>Subtotal:</span>
                            <span>${derivedTotals.subtotal.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Tax:</span>
                            <span>${derivedTotals.tax.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-red-600">
                            <span>Discount:</span>
                            <span>-${derivedTotals.discount.toFixed(2)}</span>
                          </div>
                          <div className="mt-2 flex justify-between border-t border-emerald-200 pt-3 text-lg font-bold text-emerald-700 dark:border-emerald-900 dark:text-emerald-300">
                            <span>Total:</span>
                            <span>${derivedTotals.total.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                      </div>
                    </div>

                    <div className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50/70 p-4 shadow-sm dark:border-violet-900 dark:bg-violet-950/20">
                      <div className="flex items-center gap-2 font-semibold text-violet-800 dark:text-violet-300">
                        <RefreshCw className="h-4 w-4" />
                        Recurring Invoice
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="recurring"
                          checked={draftInvoice.recurring ?? false}
                          onCheckedChange={(checked) =>
                            setDraftInvoice((prev) => ({
                              ...prev,
                              recurring: !!checked,
                              recurringStart:
                                !prev.recurring && !!checked
                                  ? prev.date || format(new Date(), "yyyy-MM-dd")
                                  : prev.recurringStart,
                              recurringDayOfMonth:
                                !!checked
                                  ? prev.recurringDayOfMonth ?? 1
                                  : prev.recurringDayOfMonth,
                            }))
                          }
                        />
                        <Label htmlFor="recurring">Repeat this invoice every month</Label>
                      </div>

                      {draftInvoice.recurring && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                          <div className="space-y-1">
                            <Label>Invoice creation day</Label>
                            <div className="flex h-10 items-center rounded-md border bg-background px-3 text-sm font-medium">
                              1st of each month
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Recurring invoices are created as Draft for the current month's service period.
                            </p>
                          </div>

                          <div className="space-y-1">
                            <Label htmlFor="recurringEnd">End date (optional)</Label>
                            <FlexibleDateInput
  id="recurringEnd"
  value={draftInvoice.recurringEnd ?? ""}
  allowEmpty
  onChange={(recurringEnd) =>
    setDraftInvoice((prev) => ({
      ...prev,
      recurringEnd,
    }))
  }
/>
                            <p className="text-xs text-muted-foreground">
                              Leave empty to keep repeating until you turn it off.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </ScrollArea>

                <DialogFooter className="border-t bg-white px-6 py-4 dark:bg-slate-950">
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button
                    onClick={handleSubmit}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg hover:from-blue-700 hover:to-indigo-700"
                  >
                    Save Invoice
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/15 bg-white/10 p-4 shadow-inner backdrop-blur-sm">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search invoice #, site, status, date..."
              value={invoiceSearch}
              onChange={(e) => setInvoiceSearch(e.target.value)}
              className="w-72 rounded-xl border-white/30 bg-white/95 pl-10 text-slate-900 shadow-sm placeholder:text-slate-400"
            />
          </div>
<div className="flex items-center gap-2">
  <Label className="text-blue-100">Sort By</Label>

  <Select
    value={sortBy}
    onValueChange={(v: any) => setSortBy(v)}
  >
    <SelectTrigger className="w-52 border-white/30 bg-white text-slate-900 shadow-sm">
  <SelectValue />
</SelectTrigger>

    <SelectContent>
      <SelectItem value="site-asc">
        Site (A-Z)
      </SelectItem>

      <SelectItem value="site-desc">
        Site (Z-A)
      </SelectItem>

      <SelectItem value="date-newest">
        Date (Newest)
      </SelectItem>

      <SelectItem value="date-oldest">
        Date (Oldest)
      </SelectItem>

      <SelectItem value="invoice">
        Invoice Number
      </SelectItem>
    </SelectContent>
  </Select>
</div>
          <div className="flex items-center gap-2">
            <Label className="text-blue-100">Show</Label>
            <Select
              value={filterMode}
              onValueChange={(v: "all" | "month" | "year") => setFilterMode(v)}
            >
              <SelectTrigger className="w-40 border-white/30 bg-white text-slate-900 shadow-sm">
  <SelectValue />
</SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All invoices</SelectItem>
                <SelectItem value="month">By month</SelectItem>
                <SelectItem value="year">By year</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filterMode === "month" && (
            <div className="flex items-center gap-2">
              <Label className="text-blue-100">Month</Label>
              <Input
  type="month"
  value={monthISO}
  onChange={(e) => setMonthISO(e.target.value)}
  className="w-44 border-white/30 bg-white text-slate-900 shadow-sm"
/>
            </div>
          )}

          {filterMode === "year" && (
            <div className="flex items-center gap-2">
              <Label className="text-blue-100">Year</Label>
              <Input
                type="number"
                min="2000"
                max="2100"
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className="w-28 border-white/30 bg-white text-slate-900 shadow-sm"
              />
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-5">
        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="group rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-100 p-5 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl dark:border-emerald-900 dark:from-emerald-950/40 dark:to-green-950/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Total Invoiced</p>
                <p className="mt-2 text-3xl font-bold tracking-tight text-emerald-900 dark:text-emerald-100">
                  ${invoiceKPIs.totalInvoiced.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="rounded-2xl bg-emerald-600 p-3 text-white shadow-lg transition-transform group-hover:scale-110">
                <DollarSign className="h-6 w-6" />
              </div>
            </div>
          </div>

          <div className="group rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-sky-100 p-5 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl dark:border-blue-900 dark:from-blue-950/40 dark:to-sky-950/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Paid</p>
                <p className="mt-2 text-3xl font-bold tracking-tight text-blue-900 dark:text-blue-100">
                  ${invoiceKPIs.paid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="rounded-2xl bg-blue-600 p-3 text-white shadow-lg transition-transform group-hover:scale-110">
                <CheckCircle2 className="h-6 w-6" />
              </div>
            </div>
          </div>

          <div className="group rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-100 p-5 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl dark:border-amber-900 dark:from-amber-950/40 dark:to-orange-950/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Outstanding</p>
                <p className="mt-2 text-3xl font-bold tracking-tight text-amber-900 dark:text-amber-100">
                  ${invoiceKPIs.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="rounded-2xl bg-amber-500 p-3 text-white shadow-lg transition-transform group-hover:scale-110">
                <Clock3 className="h-6 w-6" />
              </div>
            </div>
          </div>

          <div className="group rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-red-100 p-5 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl dark:border-rose-900 dark:from-rose-950/40 dark:to-red-950/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-rose-700 dark:text-rose-300">Overdue</p>
                <p className="mt-2 text-3xl font-bold tracking-tight text-rose-900 dark:text-rose-100">
                  {invoiceKPIs.overdue} {invoiceKPIs.overdue === 1 ? "invoice" : "invoices"}
                </p>
              </div>
              <div className="rounded-2xl bg-rose-600 p-3 text-white shadow-lg transition-transform group-hover:scale-110">
                <AlertCircle className="h-6 w-6" />
              </div>
            </div>
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-950">
        <ScrollArea className="h-96">
          <Table>
            <TableHeader className="bg-gradient-to-r from-slate-900 to-blue-950">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-white">Status</TableHead>
                <TableHead className="text-white">Invoice #</TableHead>
                <TableHead className="text-white">Site</TableHead>
                <TableHead className="text-white">Date</TableHead>
                <TableHead className="text-white">Due Date</TableHead>
                <TableHead className="text-right text-white">Total</TableHead>
                <TableHead className="text-right text-white">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {displayedInvoices.length > 0 ? (
                displayedInvoices.map((inv) => (
                  <TableRow
                    key={inv.id}
                    className="odd:bg-white even:bg-slate-50/70 transition-colors hover:bg-blue-50/90 dark:odd:bg-slate-950 dark:even:bg-slate-900/60 dark:hover:bg-blue-950/20"
                  >
                    <TableCell>
                      <Badge className={cn("rounded-full px-3 py-1 font-semibold capitalize", statusColors[String(inv.status)] || statusColors.draft)}>
                        {String(inv.status).replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-semibold text-blue-700 dark:text-blue-300">
                      {inv.invoiceNumber}
                    </TableCell>
                    <TableCell>{inv.siteName}</TableCell>
                    <TableCell>
                      {inv.date && isValid(parseISO(inv.date))
                        ? format(parseISO(inv.date), "yyyy-MM-dd")
                        : "N/A"}
                    </TableCell>
                    <TableCell>
                      {inv.dueDate && isValid(parseISO(inv.dueDate))
                        ? format(parseISO(inv.dueDate), "yyyy-MM-dd")
                        : "N/A"}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-emerald-700 dark:text-emerald-300">
                      ${(withComputed(inv).total || 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full bg-indigo-50 text-indigo-600 shadow-sm transition-all hover:scale-110 hover:bg-indigo-100 hover:text-indigo-700 dark:bg-indigo-950/30 dark:hover:bg-indigo-950/60"
                        onClick={() => exportInvoiceToPDF(inv)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full bg-blue-50 text-blue-600 shadow-sm transition-all hover:scale-110 hover:bg-blue-100 hover:text-blue-700 dark:bg-blue-950/30 dark:hover:bg-blue-950/60"
                        onClick={() => handleOpenDialog(inv)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full bg-rose-50 shadow-sm transition-all hover:scale-110 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-950/60"
                        onClick={() => deleteInvoice(inv.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    No invoices found for this filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}