

"use client";

import React, { useState, useMemo } from 'react';
import type { Invoice, InvoiceLineItem, Site } from '@/shared/types/domain';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusCircle, Trash2, Edit, Download } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, parseISO, isValid } from 'date-fns';
import { uuid } from '@/lib/time-utils';
import { Badge } from '@/components/ui/badge';
import { cn, cleanForFirestore } from '@/lib/utils';
import { useInvoices } from '@/features/invoices/hooks/useInvoices';
import { withComputed } from '@/lib/invoice-math';
import { exportInvoiceToPDF } from '@/lib/invoice-export';
import { useToast } from "@/hooks/use-toast";
import { generateRecurringInvoicesForMonth } from "@/lib/recurring-invoices";
import { Checkbox } from "@/components/ui/checkbox";

interface InvoiceViewProps {
    sites: Site[];
}

const statusColors: Record<Invoice['status'], string> = {
    draft: 'bg-gray-500',
    sent: 'bg-blue-500',
    paid: 'bg-green-600',
    void: 'bg-red-700',
};

const computeInvoiceTotal = (inv: Partial<Invoice>): number => {
    if (!inv.lineItems) return 0;
    return Math.max(0, inv.lineItems.reduce((sum, li) => sum + (li.quantity || 0) * (li.unitPrice || 0), 0));
}

export function InvoiceView({ sites }: InvoiceViewProps) {
    const { invoices, create: addInvoice, update: updateInvoice, remove: deleteInvoice } = useInvoices();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);

    const [draftInvoice, setDraftInvoice] = useState<Partial<Invoice>>({});

    const derivedTotals = useMemo(() => {
        const inv = withComputed({ lineItems: draftInvoice.lineItems, taxRate: draftInvoice.taxRate, discountAmount: draftInvoice.discountAmount });
        return {
            subtotal: inv.subtotal,
            tax: inv.tax,
            discount: inv.discount,
            total: inv.total,
        };
    }, [draftInvoice.lineItems, draftInvoice.taxRate, draftInvoice.discountAmount]);

    const { toast } = useToast();

    const [monthISO, setMonthISO] = useState(
      new Date().toISOString().slice(0, 7) // "YYYY-MM"
    );
  
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
              siteName: '',
              invoiceNumber: `INV-${Date.now()}`,
              date: format(new Date(), 'yyyy-MM-dd'),
              dueDate: format(new Date(), 'yyyy-MM-dd'),
              lineItems: [{ id: uuid(), description: '', quantity: 1, unitPrice: 0, total: 0 }],
              status: 'draft',
            });
        }
        setIsDialogOpen(true);
    };

    const handleLineItemChange = (index: number, field: keyof InvoiceLineItem, value: any) => {
        const newLineItems = [...(draftInvoice.lineItems || [])];
        const item = newLineItems[index] as InvoiceLineItem;
        (item[field] as any) = value;

        if (field === 'quantity' || field === 'unitPrice') {
            const quantity = Number(item.quantity) || 0;
            const unitPrice = Number(item.unitPrice) || 0;
            item.total = quantity * unitPrice;
        }
        setDraftInvoice(prev => ({...prev, lineItems: newLineItems}));
    };

    const addLineItem = () => {
        setDraftInvoice(prev => ({...prev, lineItems: [...(prev.lineItems || []), { id: uuid(), description: '', quantity: 1, unitPrice: 0, total: 0 }]}));
    };

    const removeLineItem = (index: number) => {
        setDraftInvoice(prev => ({...prev, lineItems: (prev.lineItems || []).filter((_, i) => i !== index)}));
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

  // Build a "base invoice" where required fields are guaranteed (no undefined)
  const baseInvoice: Omit<Invoice, "id"> = {
    // keep any optional fields you already have (notes, recurring, etc.)
    ...(draftInvoice as Omit<Invoice, "id">),

    // force required fields as non-optional
    siteName: draftInvoice.siteName,
    invoiceNumber: draftInvoice.invoiceNumber,
    date: draftInvoice.date,
    dueDate: draftInvoice.dueDate,
    status: (draftInvoice.status ?? "draft") as Invoice["status"],
    lineItems: finalLineItems,

    // normalize these if your Invoice type includes them (optional; keeps numbers clean)
    taxRate: draftInvoice.taxRate ?? 0,
    discountAmount: draftInvoice.discountAmount ?? 0,
  };

  // Compute totals (subtotal/tax/discount/total)
  const computed = withComputed(baseInvoice);

  // If your Invoice type includes subtotal/tax/discount/total, this is perfect:
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
        const rows = invoices.map(inv => {
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

        const csvContent = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `invoices-${format(new Date(), 'yyyy-MM-dd')}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    
    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle>Invoices</CardTitle>
                        <CardDescription>Create, manage, and track invoices.</CardDescription>
                    </div>
                </div>
                 <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
                    <div className="flex items-center gap-2">
                        <label className="text-sm text-muted-foreground">
                            Billing month
                        </label>
                        <Input
                            type="month"
                            value={monthISO}
                            onChange={(e) => setMonthISO(e.target.value)}
                            className="w-40"
                        />
                        <Button size="sm" variant="outline" onClick={handleGenerateRecurring}>
                            Generate recurring for this month
                        </Button>
                    </div>
                    <div className="flex items-center gap-2">
                         <Button onClick={downloadCSV} variant="outline" size="sm" disabled={invoices.length === 0}>
                            <Download className="mr-2 h-4 w-4" /> CSV
                        </Button>
                        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                            <DialogTrigger asChild>
                                <Button onClick={() => handleOpenDialog()}>
                                    <PlusCircle className="mr-2 h-4 w-4" /> Create Invoice
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-4xl">
                                <DialogHeader>
                                    <DialogTitle>{editingInvoice ? 'Edit' : 'Create'} Invoice</DialogTitle>
                                </DialogHeader>
                                <ScrollArea className="max-h-[70vh]">
                                    <div className="space-y-4 py-4 px-2">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="siteName">Site</Label>
                                                <Select value={draftInvoice.siteName} onValueChange={(v) => setDraftInvoice(prev => ({...prev, siteName: v}))}>
                                                    <SelectTrigger><SelectValue placeholder="Select a site..." /></SelectTrigger>
                                                    <SelectContent>
                                                        {sites.map(s => <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="invoiceNumber">Invoice #</Label>
                                                <Input id="invoiceNumber" value={draftInvoice.invoiceNumber} onChange={(e) => setDraftInvoice(prev => ({...prev, invoiceNumber: e.target.value}))} />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="date">Date</Label>
                                                <Input id="date" type="date" value={draftInvoice.date} onChange={(e) => setDraftInvoice(prev => ({...prev, date: e.target.value}))} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="dueDate">Due Date</Label>
                                                <Input id="dueDate" type="date" value={draftInvoice.dueDate} onChange={(e) => setDraftInvoice(prev => ({...prev, dueDate: e.target.value}))} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="status">Status</Label>
                                                <Select value={draftInvoice.status} onValueChange={(v: any) => setDraftInvoice(prev => ({...prev, status: v}))}>
                                                    <SelectTrigger><SelectValue/></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="draft">Draft</SelectItem>
                                                        <SelectItem value="sent">Sent</SelectItem>
                                                        <SelectItem value="paid">Paid</SelectItem>
                                                        <SelectItem value="void">Void</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        
                                        <div className="space-y-2 pt-4">
                                            <Label>Line Items</Label>
                                            <div className="space-y-2">
                                                {(draftInvoice.lineItems || []).map((item, index) => (
                                                    <div key={item.id || index} className="flex items-center gap-2 p-2 border rounded-md">
                                                        <Input 
                                                            placeholder="Description" 
                                                            className="flex-grow" 
                                                            value={item.description}
                                                            onChange={(e) => handleLineItemChange(index, 'description', e.target.value)}
                                                        />
                                                        <Input 
                                                            type="number" 
                                                            placeholder="Qty" 
                                                            className="w-20"
                                                            value={item.quantity}
                                                            onChange={(e) => handleLineItemChange(index, 'quantity', e.target.value)}
                                                        />
                                                        <Input 
                                                            type="number" 
                                                            placeholder="Price" 
                                                            className="w-24"
                                                            value={item.unitPrice}
                                                            onChange={(e) => handleLineItemChange(index, 'unitPrice', e.target.value)}
                                                        />
                                                        <span className="w-24 text-right font-mono">${((item.quantity || 0) * (item.unitPrice || 0)).toFixed(2)}</span>
                                                        <Button variant="ghost" size="icon" onClick={() => removeLineItem(index)}>
                                                            <Trash2 className="h-4 w-4 text-destructive" />
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                            <Button variant="outline" size="sm" onClick={addLineItem}><PlusCircle className="mr-2 h-4 w-4" /> Add Item</Button>
                                        </div>
                                        
                                        <div className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="notes">Notes (optional)</Label>
                                                <Input id="notes" value={draftInvoice.notes ?? ''} onChange={e => setDraftInvoice(prev => ({...prev, notes: e.target.value}))} />
                                            </div>
                                            <div className="space-y-4">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <Label htmlFor="taxRate">Tax Rate (%)</Label>
                                                        <Input type="number" id="taxRate" placeholder="e.g. 7.5" value={(draftInvoice.taxRate || 0) * 100} onChange={e => setDraftInvoice(prev => ({...prev, taxRate: parseFloat(e.target.value) / 100 || undefined}))} />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label htmlFor="discountAmount">Discount ($)</Label>
                                                        <Input type="number" id="discountAmount" placeholder="e.g. 50" value={draftInvoice.discountAmount || ''} onChange={e => setDraftInvoice(prev => ({...prev, discountAmount: parseFloat(e.target.value) || undefined}))} />
                                                    </div>
                                                </div>
                                                <div className="space-y-1 text-sm text-right">
                                                    <div className="flex justify-between"><span>Subtotal:</span><span>${derivedTotals.subtotal.toFixed(2)}</span></div>
                                                    <div className="flex justify-between"><span>Tax:</span><span>${derivedTotals.tax.toFixed(2)}</span></div>
                                                    <div className="flex justify-between text-red-600"><span>Discount:</span><span>-${derivedTotals.discount.toFixed(2)}</span></div>
                                                    <div className="flex justify-between font-bold text-base border-t mt-1 pt-1"><span>Total:</span><span>${derivedTotals.total.toFixed(2)}</span></div>
                                                </div>
                                            </div>
                                        </div>
                                         <div className="space-y-3 border-t pt-4 mt-4">
                                          <div className="flex items-center gap-2">
                                            <Checkbox
                                              id="recurring"
                                              checked={draftInvoice.recurring ?? false}
                                              onCheckedChange={(checked) =>
                                                setDraftInvoice((prev) => ({
                                                  ...prev,
                                                  recurring: !!checked,
                                                  // default start if just turned on
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
                                <DialogFooter>
                                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                                    <Button onClick={handleSubmit}>Save Invoice</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-96">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Status</TableHead>
                                <TableHead>Invoice #</TableHead>
                                <TableHead>Site</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Due Date</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {invoices.length > 0 ? (
                                invoices.sort((a,b) => {
                                    if (!a.date || !b.date) return 0;
                                    return parseISO(b.date).getTime() - parseISO(a.date).getTime()
                                }).map(inv => (
                                    <TableRow key={inv.id}>
                                        <TableCell>
                                            <Badge className={cn('text-white capitalize', statusColors[inv.status])}>
                                                {inv.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="font-medium">{inv.invoiceNumber}</TableCell>
                                        <TableCell>{inv.siteName}</TableCell>
                                        <TableCell>{inv.date && isValid(parseISO(inv.date)) ? format(parseISO(inv.date), 'yyyy-MM-dd') : 'N/A'}</TableCell>
                                        <TableCell>{inv.dueDate && isValid(parseISO(inv.dueDate)) ? format(parseISO(inv.dueDate), 'yyyy-MM-dd') : 'N/A'}</TableCell>
                                        <TableCell className="text-right font-mono">${(withComputed(inv).total || 0).toFixed(2)}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => exportInvoiceToPDF(inv)}>
                                                <Download className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(inv)}>
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => deleteInvoice(inv.id)}>
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center">No invoices yet.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
