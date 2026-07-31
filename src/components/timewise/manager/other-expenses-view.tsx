"use client";

import React, { useState, useMemo } from 'react';
import type { OtherExpense, Site } from '@/shared/types/domain';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  PlusCircle,
  Trash2,
  Edit,
  Download,
  Paperclip,
  CalendarDays,
  ReceiptText,
  Tags,
  CircleDollarSign,
  WalletCards,
  Store,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { format, parse, parseISO, isValid } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface OtherExpensesViewProps {
    otherExpenses: OtherExpense[];
    sites: Site[];
    addOtherExpense: (expense: Omit<OtherExpense, 'id'>, receiptFile?: File) => Promise<void>;
    updateOtherExpense: (id: string, updates: Partial<OtherExpense>, receiptFile?: File) => Promise<void>;
    deleteOtherExpense: (id: string) => Promise<void>;
    fromDate: string;
    toDate: string;
}

// Treat as image if we know the mime OR if the URL looks like an image
const isImageReceipt = (url?: string, mime?: string) =>
  (mime?.startsWith('image/')) ||
  (url ? /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(url) : false);

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));
const months = [
    { value: '0', label: 'January' }, { value: '1', label: 'February' }, { value: '2', label: 'March' },
    { value: '3', label: 'April' }, { value: '4', label: 'May' }, { value: '5', label: 'June' },
    { value: '6', 'label': 'July' }, { value: '7', label: 'August' }, { value: '8', label: 'September' },
    { value: '9', label: 'October' }, { value: '10', label: 'November' }, { value: '11', label: 'December' }
];

export function OtherExpensesView({ 
    otherExpenses, 
    sites,
    addOtherExpense, 
    updateOtherExpense, 
    deleteOtherExpense, 
    fromDate: customFromDate, 
    toDate: customToDate 
}: OtherExpensesViewProps) {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingExpense, setEditingExpense] = useState<OtherExpense | null>(null);

    const [date, setDate] = useState('');
const [expenseDate, setExpenseDate] = useState('');
const [paidDate, setPaidDate] = useState('');
    const [description, setDescription] = useState('');
    const [vendor, setVendor] = useState('');
    const [amount, setAmount] = useState('');
    const [receiptFile, setReceiptFile] = useState<File | undefined>();
    const [existingReceiptUrl, setExistingReceiptUrl] = useState<string | undefined>();
    
    const [siteId, setSiteId] = useState<string | undefined>();
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();

    const [viewType, setViewType] = useState<'custom' | 'monthly' | 'annually'>('custom');
    const [selectedYear, setSelectedYear] = useState(String(currentYear));
    const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth()));
    const [groupBy, setGroupBy] = useState<'description' | 'vendor' | 'site'>('description');
const [accountingView, setAccountingView] = useState<
  "operational" | "cash"
>("operational");

     const { fromDate, toDate: toDateObj } = useMemo(() => {
        if (viewType === 'monthly') {
            const year = parseInt(selectedYear, 10);
            const month = parseInt(selectedMonth, 10);
            const start = new Date(year, month, 1);
            const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
            return { fromDate: start, toDate: end };
        }
        if (viewType === 'annually') {
            const year = parseInt(selectedYear, 10);
            const start = new Date(year, 0, 1);
            const end = new Date(year, 11, 31, 23, 59, 59, 999);
            return { fromDate: start, toDate: end };
        }
        // Custom
        const start = customFromDate ? new Date(`${customFromDate}T00:00:00`) : null;
        const end = customToDate ? new Date(`${customToDate}T23:59:59`) : null;
        return { fromDate: start, toDate: end };
    }, [viewType, selectedYear, selectedMonth, customFromDate, customToDate]);

    const filteredExpenses = useMemo(() => {
        const fromTime = fromDate?.getTime();
        const toTime = toDateObj?.getTime();

        return otherExpenses.filter(exp => {
            if (!exp.date || !isValid(parseISO(exp.date))) return false;
            const effectiveDate =
  accountingView === "cash"
    ? exp.paidDate || exp.date
    : exp.expenseDate || exp.date;

if (!effectiveDate || !isValid(parseISO(effectiveDate))) {
  return false;
}

const expDate = parseISO(effectiveDate);
             if (!fromTime && !toTime) return true;
             if (fromTime && expDate.getTime() < fromTime) return false;
             if (toTime && expDate.getTime() > toTime) return false;
             return true;
        })
    }, [otherExpenses, fromDate, toDateObj]);


    const handleOpenDialog = (expense: OtherExpense | null = null) => {
        setEditingExpense(expense);
        if (expense) {
            setDate(expense.date);
            setExpenseDate(expense.expenseDate || expense.date || '');
setPaidDate(expense.paidDate || '');
            setDescription(expense.description || '');
            setVendor(expense.vendor || '');
            setAmount(String(expense.amount));
            setExistingReceiptUrl(expense.receiptUrl);
            setSiteId(expense.siteId);
        } else {
            setDate(format(new Date(), 'yyyy-MM-dd'));
            setExpenseDate(format(new Date(), 'yyyy-MM-dd'));
setPaidDate('');
            setDescription('');
            setVendor('');
            setAmount('');
            setExistingReceiptUrl(undefined);
            setSiteId(undefined);
        }
        setReceiptFile(undefined);
        setIsSaving(false);
        setIsDialogOpen(true);
    };

    const handleSubmit = async () => {
        const numAmount = parseFloat(amount);
        if (!date || !description.trim() || !Number.isFinite(numAmount) || numAmount < 0) {
            toast({ variant: "destructive", title: "Invalid Input", description: "Date, description, and a valid non-negative amount are required." });
            return;
        }

        setIsSaving(true);
        const expenseData: Partial<OtherExpense> = {
  date,
  expenseDate,
  paidDate: paidDate || null,
  description,
  amount: numAmount,
};

        if(vendor.trim()) {
            expenseData.vendor = vendor.trim();
        }
        
        if (siteId) {
            expenseData.siteId = siteId;
        } else if (editingExpense && editingExpense.siteId) {
            // Explicitly remove siteId if it was present before but is now unselected
            expenseData.siteId = null as any; 
        }

        try {
            if (editingExpense) {
                await updateOtherExpense(editingExpense.id, expenseData, receiptFile);
            } else {
                await addOtherExpense(expenseData as Omit<OtherExpense, 'id'>, receiptFile);
            }
            setIsDialogOpen(false);
        } catch (error: any) {
  console.error("[Expense Upload Error]", error);

  toast({
    variant: "destructive",
    title: "Failed to upload receipt",
    description: error?.message || "Unknown error",
  });
} finally {
            setIsSaving(false);
        }
    };
    
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setReceiptFile(e.target.files[0]);
        }
    }

    const downloadCSV = () => {
        const header = ["Date", "Description", "Site", "Amount", "Receipt URL"];
        const rows = filteredExpenses.map(exp => {
            const siteName = sites.find(s => s.id === exp.siteId)?.name || exp.siteName || exp.site || '';
            return [
                exp.date,
                exp.description || "",
                siteName,
                exp.amount.toFixed(2),
                exp.receiptUrl || ""
            ];
        });
        const csvContent = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `other-expenses-${format(new Date(), 'yyyy-MM-dd')}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const expenseSummary = useMemo(() => {
        const summary = new Map<string, { totalAmount: number; count: number }>();
        const siteNameMap = new Map(sites.map(s => [s.id, s.name]));

        filteredExpenses.forEach(expense => {
            let key = 'Uncategorized';
            if (groupBy === 'vendor') {
                key = expense.vendor || 'Other';
            } else if (groupBy === 'site') {
                key = (expense.siteId ? siteNameMap.get(expense.siteId) : undefined) || expense.siteName || expense.site || 'No Site';
           } else if (groupBy === "description") {
  if (expense.source === "site-rs-fee") {
    key = "R/S";
  } else if (expense.source === "site-other-fee") {
    key = expense.category || "Other Fee";
  } else {
    key = expense.description || expense.category || "Uncategorized";
  }
}
            const entry = summary.get(key) || { totalAmount: 0, count: 0 };
            entry.totalAmount += expense.amount;
            entry.count += 1;
            summary.set(key, entry);
        });
        return Array.from(summary.entries()).map(([key, data]) => ({
            key,
            ...data
        })).sort((a,b) => b.totalAmount - a.totalAmount);
    }, [filteredExpenses, groupBy, sites]);

    const downloadSummaryCSV = () => {
        const header = [groupBy.charAt(0).toUpperCase() + groupBy.slice(1), "Count", "Total Amount"];
        const rows = expenseSummary.map(item => [
            item.key,
            item.count,
            item.totalAmount.toFixed(2),
        ]);

        const csvContent = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `expenses-summary-by-${groupBy}-${format(new Date(), 'yyyy-MM-dd')}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const totalExpenses = useMemo(() => {
        return filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    }, [filteredExpenses]);


    return (
        <div className="space-y-6">
            <Card className="overflow-hidden border-0 bg-gradient-to-r from-slate-950 via-indigo-950 to-violet-900 text-white shadow-xl">
                <CardHeader className="relative">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_35%)]" />
                    <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-2">
                            <div className="flex items-center gap-3">
                                <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/20 backdrop-blur">
                                    <WalletCards className="h-6 w-6 text-violet-100" />
                                </div>
                                <div>
                                    <CardTitle className="text-2xl text-white">Other Expenses</CardTitle>
                                    <CardDescription className="mt-1 text-slate-200">
                                        Track operating costs, receipts, vendors, and site-related spending.
                                    </CardDescription>
                                </div>
                            </div>
                        </div>
                        <div className="rounded-2xl bg-white/10 px-5 py-3 text-right ring-1 ring-white/20 backdrop-blur">
                            <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-200">Selected period</p>
                            <p className="mt-1 text-2xl font-bold text-white">${totalExpenses.toFixed(2)}</p>
                            <p className="text-xs text-slate-300">{filteredExpenses.length} expense{filteredExpenses.length === 1 ? "" : "s"}</p>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            <Card className="border-indigo-100 bg-gradient-to-br from-white to-indigo-50/70 shadow-md dark:border-indigo-950 dark:from-slate-950 dark:to-indigo-950/30">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <span className="rounded-lg bg-indigo-100 p-2 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                            <CalendarDays className="h-4 w-4" />
                        </span>
                        Reporting Period
                    </CardTitle>
                    <CardDescription>
                        Choose the reporting range and accounting perspective.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 items-end md:grid-cols-4">
                    <div className="space-y-2">
                        <Label>View Type</Label>
                        <Select value={viewType} onValueChange={(v: any) => setViewType(v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="custom">Custom Range (from Dashboard)</SelectItem>
                                <SelectItem value="monthly">Monthly</SelectItem>
                                <SelectItem value="annually">Annually</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {viewType !== 'custom' && (
                         <div className="space-y-2">
                            <Label>Year</Label>
                            <Select value={selectedYear} onValueChange={setSelectedYear}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    {viewType === 'monthly' && (
                        <div className="space-y-2">
                             <Label>Month</Label>
                             <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div className="space-y-2">
  <Label>Accounting View</Label>

  <Select
    value={accountingView}
    onValueChange={(v: "operational" | "cash") =>
      setAccountingView(v)
    }
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
    </SelectContent>
  </Select>
</div>
                </CardContent>
            </Card>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <Card className="overflow-hidden border-violet-100 shadow-lg transition-shadow hover:shadow-xl dark:border-violet-950">
                    <CardHeader className="border-b border-violet-100 bg-gradient-to-r from-violet-50 via-fuchsia-50 to-white dark:border-violet-950 dark:from-violet-950/40 dark:via-fuchsia-950/20 dark:to-slate-950">
                        <div className="flex justify-between items-center flex-wrap gap-2">
                            <div className="flex items-start gap-3">
                                <span className="rounded-xl bg-violet-100 p-2.5 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                                    <Tags className="h-5 w-5" />
                                </span>
                                <div>
                                    <CardTitle>Expense Summary</CardTitle>
                                    <CardDescription className="mt-1">
                                        A categorized view of spending for the selected period.
                                    </CardDescription>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-48">
                                    <Select value={groupBy} onValueChange={(v: any) => setGroupBy(v)}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="description">Group by Description</SelectItem>
                                            <SelectItem value="vendor">Group by Vendor</SelectItem>
                                            <SelectItem value="site">Group by Site</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <Button onClick={downloadSummaryCSV} variant="outline" size="sm" disabled={expenseSummary.length === 0} className="border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-950">
                                    <Download className="mr-2 h-4 w-4" /> CSV
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="grid grid-cols-2 gap-3 border-b bg-slate-50/80 p-4 dark:bg-slate-900/60">
                            <div className="rounded-xl border border-rose-100 bg-rose-50 p-3 dark:border-rose-950 dark:bg-rose-950/30">
                                <p className="text-xs font-medium uppercase tracking-wide text-rose-600 dark:text-rose-300">Total spending</p>
                                <p className="mt-1 text-xl font-bold text-rose-700 dark:text-rose-200">${totalExpenses.toFixed(2)}</p>
                            </div>
                            <div className="rounded-xl border border-violet-100 bg-violet-50 p-3 dark:border-violet-950 dark:bg-violet-950/30">
                                <p className="text-xs font-medium uppercase tracking-wide text-violet-600 dark:text-violet-300">Categories</p>
                                <p className="mt-1 text-xl font-bold text-violet-700 dark:text-violet-200">{expenseSummary.length}</p>
                            </div>
                        </div>
                        <ScrollArea className="h-96">
                            <Table>
                                <TableHeader className="sticky top-0 z-10 bg-violet-50/95 backdrop-blur dark:bg-violet-950/80">
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="capitalize">{groupBy}</TableHead>
                                        <TableHead>Count</TableHead>
                                        <TableHead className="text-right">Total Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {expenseSummary.length > 0 ? (
                                        expenseSummary.map(item => (
                                            <TableRow key={item.key} className="transition-colors hover:bg-violet-50/60 dark:hover:bg-violet-950/20">
                                                <TableCell className="font-medium">{item.key}</TableCell>
                                                <TableCell>
                                                    <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                                                        {item.count}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-right font-semibold text-rose-600 dark:text-rose-300">${item.totalAmount.toFixed(2)}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={3} className="h-24 text-center">No expenses to summarize for this period.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </CardContent>
                </Card>
                <Card className="overflow-hidden border-emerald-100 shadow-lg transition-shadow hover:shadow-xl dark:border-emerald-950">
                    <CardHeader className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-cyan-50 to-white dark:border-emerald-950 dark:from-emerald-950/35 dark:via-cyan-950/20 dark:to-slate-950">
                        <div className="flex justify-between items-center">
                            <div className="flex items-start gap-3">
                                <span className="rounded-xl bg-emerald-100 p-2.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                    <ReceiptText className="h-5 w-5" />
                                </span>
                                <div>
                                    <CardTitle>Expense Log</CardTitle>
                                    <CardDescription className="mt-1">
                                        Review receipts, vendors, sites, and individual transactions.
                                    </CardDescription>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button onClick={downloadCSV} variant="outline" size="sm" disabled={filteredExpenses.length === 0} className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950">
                                    <Download className="mr-2 h-4 w-4" /> CSV
                                </Button>
                                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button onClick={() => handleOpenDialog()} size="sm" className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md hover:from-emerald-700 hover:to-teal-700">
                                            <PlusCircle className="mr-2 h-4 w-4" /> Add Expense
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-lg overflow-hidden border-0 p-0 shadow-2xl">
                                        <div className="bg-gradient-to-r from-emerald-700 via-teal-700 to-cyan-700 px-6 py-5 text-white">
                                            <div className="flex items-center gap-3">
                                                <span className="rounded-xl bg-white/15 p-2 ring-1 ring-white/20">
                                                    <CircleDollarSign className="h-5 w-5" />
                                                </span>
                                                <div>
                                                    <p className="text-xs uppercase tracking-[0.18em] text-emerald-100">Expense record</p>
                                                    <p className="font-semibold">{editingExpense ? 'Update transaction details' : 'Create a new transaction'}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <DialogHeader className="px-6 pt-5">
                                            <DialogTitle>{editingExpense ? 'Edit' : 'Add'} Expense</DialogTitle>
                                        </DialogHeader>
                                        <ScrollArea className="max-h-[65vh] px-6">
                                        <div className="space-y-4 py-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="date">Legacy Date</Label>
                                                <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                                            </div>
                                            <div className="space-y-2">
  <Label htmlFor="expenseDate">
    Expense Date
  </Label>

  <Input
    id="expenseDate"
    type="date"
    value={expenseDate}
    onChange={(e) => setExpenseDate(e.target.value)}
  />
</div>

<div className="space-y-2">
  <Label htmlFor="paidDate">
    Paid Date
  </Label>

  <Input
    id="paidDate"
    type="date"
    value={paidDate}
    onChange={(e) => setPaidDate(e.target.value)}
  />
</div>
                                            <div className="space-y-2">
                                                <Label>Site (optional)</Label>
                                                <Select value={siteId ?? "__none__"} onValueChange={(v) => setSiteId(v === "__none__" ? undefined : v)}>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="No site (general expense)" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="__none__">No site</SelectItem>
                                                        {(sites ?? []).map(s => (
                                                            <SelectItem key={s.id ?? s.name} value={s.id ?? s.name}>
                                                                {s.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                             <div className="space-y-2">
                                                <Label htmlFor="vendor">Vendor (optional)</Label>
                                                <Input id="vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="e.g., Home Depot" />
                                            </div>
                                             <div className="space-y-2">
                                                <Label htmlFor="description">Description</Label>
                                                <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g., Cleaning Supplies" required/>
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="amount">Amount ($)</Label>
                                                <Input id="amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g., 125.50" required />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="receipt">Receipt (image/PDF, optional)</Label>
                                                <Input id="receipt" type="file" onChange={handleFileChange} accept="image/*,application/pdf" capture="environment" />
                                                {existingReceiptUrl && !receiptFile && (
                                                    <div className="text-sm text-muted-foreground">
                                                        Current receipt: <a href={existingReceiptUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">View</a>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        </ScrollArea>
                                        <DialogFooter className="border-t bg-slate-50 px-6 py-4 dark:bg-slate-900">
                                            <DialogClose asChild>
                                                <Button variant="outline" disabled={isSaving}>Cancel</Button>
                                            </DialogClose>
                                            <Button onClick={handleSubmit} disabled={isSaving} className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700">{isSaving ? 'Saving...' : 'Save Expense'}</Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <ScrollArea className="h-[360px]">
                            <Table>
                                <TableHeader className="sticky top-0 z-10 bg-emerald-50/95 backdrop-blur dark:bg-emerald-950/80">
                                  <TableRow className="hover:bg-transparent">
                                    <TableHead>Date</TableHead>
                                    <TableHead>Site</TableHead>
                                    <TableHead>Vendor</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead>Amount</TableHead>
                                    <TableHead>Receipt</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredExpenses.length > 0 ? (
                                        filteredExpenses.sort((a,b) => parseISO(b.date).getTime() - parseISO(a.date).getTime()).map(expense => {
                                            const showImage = isImageReceipt(expense.receiptUrl, expense.receiptMime);
                                            const siteName = sites.find(s => s.id === expense.siteId)?.name ?? "No Site";
                                            return (
                                              <TableRow key={expense.id} className="transition-colors hover:bg-emerald-50/60 dark:hover:bg-emerald-950/20">
                                                <TableCell>
  {accountingView === "cash"
    ? expense.paidDate || expense.date
    : expense.expenseDate || expense.date}
</TableCell>
                                                <TableCell>{siteName}</TableCell>
                                                <TableCell>{expense.vendor || '—'}</TableCell>
                                                <TableCell>{expense.description || '—'}</TableCell>
                                                <TableCell className="font-semibold text-rose-600 dark:text-rose-300">${expense.amount.toFixed(2)}</TableCell>

                                                <TableCell>
                                                  {expense.receiptUrl ? (
                                                    showImage ? (
                                                      <a
                                                        href={expense.receiptUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        title="View receipt"
                                                        className="inline-block"
                                                      >
                                                        <img
                                                          src={expense.receiptUrl}
                                                          alt="Receipt"
                                                          className="h-12 w-12 rounded object-cover border"
                                                          loading="lazy"
                                                        />
                                                      </a>
                                                    ) : (
                                                      <a
                                                        href={expense.receiptUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="underline"
                                                      >
                                                        View receipt
                                                      </a>
                                                    )
                                                  ) : (
                                                    '—'
                                                  )}
                                                </TableCell>

                                                <TableCell className="text-right">
                                                  {expense.receiptUrl && (
                                                    <Button asChild variant="ghost" size="icon" title="Open receipt">
                                                      <a href={expense.receiptUrl} target="_blank" rel="noopener noreferrer">
                                                        <Paperclip className="h-4 w-4" />
                                                      </a>
                                                    </Button>
                                                  )}
                                                  <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(expense)}>
                                                    <Edit className="h-4 w-4" />
                                                  </Button>
                                                  <Button variant="ghost" size="icon" onClick={() => { if (window.confirm("Are you sure you want to delete this expense?")) { deleteOtherExpense(expense.id) }}}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                  </Button>
                                                </TableCell>
                                              </TableRow>
                                            );
                                          })
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={7} className="h-24 text-center">No other expenses logged for this period.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                        <div className="flex items-center justify-between border-t bg-gradient-to-r from-slate-50 to-emerald-50 px-5 py-4 dark:from-slate-950 dark:to-emerald-950/30">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Store className="h-4 w-4" />
                                {filteredExpenses.length} transaction{filteredExpenses.length === 1 ? "" : "s"} in this period
                            </div>
                            <div className="rounded-xl bg-rose-100 px-4 py-2 text-right dark:bg-rose-950/40">
                                <p className="text-xs font-medium uppercase tracking-wide text-rose-600 dark:text-rose-300">Total for period</p>
                                <p className="text-xl font-bold text-rose-700 dark:text-rose-200">${totalExpenses.toFixed(2)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}