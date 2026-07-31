"use client";

import React, { useState, useMemo } from "react";
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

interface InvoiceViewProps {
  sites: Site[];
}

const statusColors: Record<Invoice["status"], string> = {
  draft:
    "border border-amber-200 bg-gradient-to-r from-amber-100 to-orange-100 text-amber-800 shadow-sm dark:border-amber-800 dark:from-amber-950/50 dark:to-orange-950/40 dark:text-amber-300",
  sent:
    "border border-blue-200 bg-gradient-to-r from-blue-100 to-sky-100 text-blue-800 shadow-sm dark:border-blue-800 dark:from-blue-950/50 dark:to-sky-950/40 dark:text-blue-300",
  paid:
    "border border-emerald-200 bg-gradient-to-r from-emerald-100 to-green-100 text-emerald-800 shadow-sm dark:border-emerald-800 dark:from-emerald-950/50 dark:to-green-950/40 dark:text-emerald-300",
  void:
    "border border-rose-200 bg-gradient-to-r from-rose-100 to-red-100 text-rose-800 shadow-sm dark:border-rose-800 dark:from-rose-950/50 dark:to-red-950/40 dark:text-rose-300",
};

export function InvoiceView({ sites }: InvoiceViewProps) {
  const { invoices, create: addInvoice, update: updateInvoice, remove: deleteInvoice } = useInvoices();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [draftInvoice, setDraftInvoice] = useState<Partial<Invoice>>({});

  const { toast } = useToast();

  const [monthISO, setMonthISO] = useState(new Date().toISOString().slice(0, 7));
  const [filterMode, setFilterMode] = useState<"all" | "month" | "year">("month");
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
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

  const displayedInvoices = useMemo(() => {
    let filtered = [...invoices];

    if (filterMode === "month") {
      filtered = filtered.filter((inv) => inv.date?.startsWith(filterMonth));
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
  }, [invoices, filterMode, filterMonth, filterYear, invoiceSearch, sortBy]);

  const invoiceKPIs = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    return displayedInvoices.reduce(
      (totals, invoice) => {
        const amount = withComputed(invoice).total || 0;

        if (invoice.status !== "void") {
          totals.totalInvoiced += amount;
        }

        if (invoice.status === "paid") {
          totals.paid += amount;
        }

        if (invoice.status !== "paid" && invoice.status !== "void") {
          totals.outstanding += amount;

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

    newInvoices.forEach((inv) => addInvoice(inv));

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
serviceEndDate: format(new Date(), "yyyy-MM-dd"),
paidDate: null,
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

    const baseInvoice: Omit<Invoice, "id"> = {
      ...(draftInvoice as Omit<Invoice, "id">),
      siteName: draftInvoice.siteName,
      invoiceNumber: draftInvoice.invoiceNumber,
      date: draftInvoice.date,
      serviceStartDate: (draftInvoice as any).serviceStartDate || null,
serviceEndDate: (draftInvoice as any).serviceEndDate || null,
paidDate: (draftInvoice as any).paidDate || null,
      dueDate: draftInvoice.dueDate,
      status: (draftInvoice.status ?? "draft") as Invoice["status"],
      lineItems: finalLineItems,
      taxRate: draftInvoice.taxRate ?? 0,
      discountAmount: draftInvoice.discountAmount ?? 0,
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
            <label className="text-sm font-medium text-blue-100">Billing month</label>
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
                        <Input
                          id="date"
                          type="date"
                          value={draftInvoice.date}
                          onChange={(e) => setDraftInvoice((prev) => ({ ...prev, date: e.target.value }))}
                        />
                      </div>
<div className="space-y-2">
  <Label htmlFor="serviceStartDate">
    Service Start
  </Label>

  <Input
    id="serviceStartDate"
    type="date"
    value={(draftInvoice as any).serviceStartDate || ""}
    onChange={(e) =>
      setDraftInvoice((prev) => ({
        ...prev,
        serviceStartDate: e.target.value,
      }))
    }
  />
</div>

<div className="space-y-2">
  <Label htmlFor="serviceEndDate">
    Service End
  </Label>

  <Input
    id="serviceEndDate"
    type="date"
    value={(draftInvoice as any).serviceEndDate || ""}
    onChange={(e) =>
      setDraftInvoice((prev) => ({
        ...prev,
        serviceEndDate: e.target.value,
      }))
    }
  />
</div>
                      <div className="space-y-2">
                        <Label htmlFor="dueDate">Due Date</Label>
                        <Input
                          id="dueDate"
                          type="date"
                          value={draftInvoice.dueDate}
                          onChange={(e) => setDraftInvoice((prev) => ({ ...prev, dueDate: e.target.value }))}
                        />
                      </div>
<div className="space-y-2">
  <Label htmlFor="paidDate">
    Paid Date
  </Label>

  <Input
    id="paidDate"
    type="date"
    value={(draftInvoice as any).paidDate || ""}
    onChange={(e) =>
      setDraftInvoice((prev) => ({
        ...prev,
        paidDate: e.target.value,
      }))
    }
  />
</div>
                      <div className="space-y-2">
                        <Label htmlFor="status">Status</Label>
                        <Select
                          value={draftInvoice.status}
                          onValueChange={(v: any) =>
  setDraftInvoice((prev) => ({
    ...prev,
    status: v,
    paidDate:
      v === "paid"
        ? prev.paidDate || format(new Date(), "yyyy-MM-dd")
        : prev.paidDate,
  }))
}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="sent">Sent</SelectItem>
                            <SelectItem value="paid">Paid</SelectItem>
                            <SelectItem value="void">Void</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      </div>
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
                            }))
                          }
                        />
                        <Label htmlFor="recurring">Repeat this invoice every month</Label>
                      </div>

                      {draftInvoice.recurring && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                          <div className="space-y-1">
                            <Label htmlFor="recurringDayOfMonth">Billing day of month</Label>
                            <Input
                              id="recurringDayOfMonth"
                              type="number"
                              min={1}
                              max={31}
                              value={draftInvoice.recurringDayOfMonth ?? ""}
                              onChange={(e) =>
                                setDraftInvoice((prev) => ({
                                  ...prev,
                                  recurringDayOfMonth: e.target.value
                                    ? Number(e.target.value)
                                    : undefined,
                                }))
                              }
                            />
                            <p className="text-xs text-muted-foreground">
                              If blank, we’ll use the day from the invoice date.
                            </p>
                          </div>

                          <div className="space-y-1">
                            <Label htmlFor="recurringEnd">End date (optional)</Label>
                            <Input
                              id="recurringEnd"
                              type="date"
                              value={draftInvoice.recurringEnd ?? ""}
                              onChange={(e) =>
                                setDraftInvoice((prev) => ({
                                  ...prev,
                                  recurringEnd: e.target.value || null,
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
    <SelectTrigger className="w-52">
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
              <SelectTrigger className="w-36">
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
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="w-40"
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
                className="w-28"
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
                      <Badge className={cn("rounded-full px-3 py-1 font-semibold capitalize", statusColors[inv.status])}>
                        {inv.status}
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