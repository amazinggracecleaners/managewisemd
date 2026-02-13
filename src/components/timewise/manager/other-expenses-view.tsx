

"use client";

import React, { useState, useMemo } from 'react';
import type { OtherExpense, Site } from '@/shared/types/domain';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusCircle, Trash2, Edit, Download, Paperclip } from 'lucide-react';
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
             const expDate = parseISO(exp.date);
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
            setDescription(expense.description || '');
            setVendor(expense.vendor || '');
            setAmount(String(expense.amount));
            setExistingReceiptUrl(expense.receiptUrl);
            setSiteId(expense.siteId);
        } else {
            setDate(format(new Date(), 'yyyy-MM-dd'));
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
        const expenseData: Partial<OtherExpense> = { date, description, amount: numAmount };

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
        } catch (error) {
            // Error toast is shown by the page-level function
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
            } else if (groupBy === 'description') {
                key = expense.description || 'Uncategorized';
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
            <Card>
                <CardHeader>
                    <CardTitle>Date Range</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
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
                </CardContent>
            </Card>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <div className="flex justify-between items-center flex-wrap gap-2">
                            <div>
                                <CardTitle>Expense Summary</CardTitle>
                                <CardDescription>A pivot table summarizing expenses for the selected period.</CardDescription>
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
                                <Button onClick={downloadSummaryCSV} variant="outline" size="sm" disabled={expenseSummary.length === 0}>
                                    <Download className="mr-2 h-4 w-4" /> CSV
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-96">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="capitalize">{groupBy}</TableHead>
                                        <TableHead>Count</TableHead>
                                        <TableHead className="text-right">Total Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {expenseSummary.length > 0 ? (
                                        expenseSummary.map(item => (
                                            <TableRow key={item.key}>
                                                <TableCell className="font-medium">{item.key}</TableCell>
                                                <TableCell>{item.count}</TableCell>
                                                <TableCell className="text-right">${item.totalAmount.toFixed(2)}</TableCell>
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
                <Card>
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <div>
                                <CardTitle>Expense Log</CardTitle>
                                <CardDescription>Log and manage miscellaneous business expenses.</CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button onClick={downloadCSV} variant="outline" size="sm" disabled={filteredExpenses.length === 0}>
                                    <Download className="mr-2 h-4 w-4" /> CSV
                                </Button>
                                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button onClick={() => handleOpenDialog()} size="sm">
                                            <PlusCircle className="mr-2 h-4 w-4" /> Add Expense
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>{editingExpense ? 'Edit' : 'Add'} Expense</DialogTitle>
                                        </DialogHeader>
                                        <div className="space-y-4 py-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="date">Date</Label>
                                                <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
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
                                        <DialogFooter>
                                            <DialogClose asChild>
                                                <Button variant="outline" disabled={isSaving}>Cancel</Button>
                                            </DialogClose>
                                            <Button onClick={handleSubmit} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save'}</Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[300px]">
                            <Table>
                                <TableHeader>
                                  <TableRow>
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
                                              <TableRow key={expense.id}>
                                                <TableCell>{expense.date}</TableCell>
                                                <TableCell>{siteName}</TableCell>
                                                <TableCell>{expense.vendor || '—'}</TableCell>
                                                <TableCell>{expense.description || '—'}</TableCell>
                                                <TableCell>${expense.amount.toFixed(2)}</TableCell>

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
                        <div className="text-right font-bold mt-4">
                            Total for Period: ${totalExpenses.toFixed(2)}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
