

"use client";

import React, { useMemo, useState, useEffect } from 'react';
import type { Employee, Entry, Site, PayrollPeriod, PayrollLineItem, PayrollConfirmation, Session } from '@/shared/types/domain';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Banknote, UserCheck, ChevronLeft, ChevronRight, Download, Lock, Trash2, CalendarDays } from 'lucide-react';
import { groupSessions } from '@/lib/time-utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { add, sub, format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO, isSameDay, isValid } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type PayFrequency = 'weekly' | 'bi-weekly' | 'semi-monthly' | 'monthly' | 'custom';

interface PayrollViewProps {
    employees: Employee[];
    sites: Site[];
    timeEntries: Entry[];
    payrollPeriods: PayrollPeriod[];
    savePayrollPeriod: (period: PayrollPeriod) => Promise<void>;
    deletePayrollPeriod: (periodId: string) => Promise<void>;
    payrollConfirmations: PayrollConfirmation[];
}

export function PayrollView({ employees, sites, timeEntries, payrollPeriods, savePayrollPeriod, deletePayrollPeriod, payrollConfirmations = [] }: PayrollViewProps) {
    const [payFrequency, setPayFrequency] = useState<PayFrequency>('monthly');
    const [currentDate, setCurrentDate] = useState(new Date());

    const [customStartDate, setCustomStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [customEndDate, setCustomEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
    
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
    const availableYears = useMemo(() => {
        const years = new Set(payrollPeriods.map(p => p.startDate.substring(0, 4)));
        years.add(String(new Date().getFullYear()));
        return Array.from(years).sort((a,b) => b.localeCompare(a));
    }, [payrollPeriods]);


    const { periodId, startDate, endDate } = useMemo(() => {
        let start: Date, end: Date;
        if (payFrequency === 'custom') {
            start = parseISO(customStartDate);
            end = parseISO(customEndDate);
        } else {
             switch (payFrequency) {
                case 'weekly':
                    start = startOfWeek(currentDate);
                    end = endOfWeek(currentDate);
                    break;
                case 'bi-weekly':
                    const weekStart = startOfWeek(currentDate);
                    const dayOffset = (currentDate.getDay() - weekStart.getDay() + 7) % 7;
                    if (dayOffset < 7) {
                        start = weekStart;
                        end = endOfWeek(add(weekStart, { weeks: 1 }));
                    } else {
                        start = add(weekStart, { weeks: 1 });
                        end = endOfWeek(add(weekStart, { weeks: 2 }));
                    }
                    break;
                case 'semi-monthly':
                    if (currentDate.getDate() <= 15) {
                        start = startOfMonth(currentDate);
                        end = new Date(currentDate.getFullYear(), currentDate.getMonth(), 15, 23, 59, 59);
                    } else {
                        start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 16);
                        end = endOfMonth(currentDate);
                    }
                    break;
                case 'monthly':
                default:
                    start = startOfMonth(currentDate);
                    end = endOfMonth(currentDate);
                    break;
            }
        }
        
        const startStr = format(start, 'yyyy-MM-dd');
        const endStr = format(end, 'yyyy-MM-dd');
        
        return {
            periodId: `${startStr}_${endStr}`,
            startDate: start.toISOString(),
            endDate: end.toISOString()
        };
    }, [currentDate, payFrequency, customStartDate, customEndDate]);
    
    const [lineItems, setLineItems] = useState<PayrollLineItem[]>([]);
    
    const currentPeriod = useMemo(() => payrollPeriods.find(p => p.id === periodId), [payrollPeriods, periodId]);
    const siteMap = useMemo(() => new Map(sites.map(s => [s.name, s])), [sites]);
    const employeeMap = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);

    useEffect(() => {
        if (currentPeriod?.status === 'final' || currentPeriod?.status === 'locked' || currentPeriod?.status === 'paid') {
            setLineItems(currentPeriod.lineItems ?? []);
            return;
        }

        const fromTime = parseISO(startDate).getTime();
        const toTime = endOfMonth(parseISO(endDate)).getTime(); // make sure to include the full end day

        // include the entire end day up to 23:59:59.999
        const filteredEntries = timeEntries.filter(entry => entry.ts >= fromTime && entry.ts <= toTime);
        const sessions = groupSessions(filteredEntries);

        const newLineItems = employees.map(employee => {
            const employeeSessions = sessions.filter(
  (s): s is Session & { in: NonNullable<Session["in"]>; out: NonNullable<Session["out"]> } =>
    s.employee === employee.name && !!s.in && !!s.out
);

            
            let totalMinutes = 0;
            let regularMinutes = 0;
            let bonusMinutes = 0;
            let basePay = 0;
            let flatBonus = 0;

            employeeSessions.forEach(session => {
                const sessionMinutes = parseFloat(session.minutes.toFixed(2));
                totalMinutes += sessionMinutes;
                
                const site = siteMap.get(session.in.site || 'General');
                
                // Regular pay for all hours
                basePay += (sessionMinutes / 60) * employee.payRate;

                if (site?.bonusType === 'hourly' && site.bonusAmount) {
                    // Add bonus pay for this session's hours
                    basePay += (sessionMinutes / 60) * site.bonusAmount;
                    bonusMinutes += sessionMinutes;
                } else {
                    regularMinutes += sessionMinutes;
                }
                
                // Flat bonuses
                if (site?.bonusType === 'flat' && site.bonusAmount) {
                    flatBonus += site.bonusAmount;
                }
            });

            const grossPay = basePay + flatBonus;

            return {
                employeeId: employee.id,
                employeeName: employee.name,
                revision: 0,
                minutes: totalMinutes,
                regularMinutes: regularMinutes,
                bonusMinutes: bonusMinutes,
                flatBonus: flatBonus,
                gross: grossPay,
                deductions: 0,
                net: grossPay,
            };
        }).sort((a,b) => a.employeeName.localeCompare(b.employeeName));

        setLineItems(newLineItems);
    }, [startDate, endDate, timeEntries, employees, siteMap, currentPeriod]);
    
    const yearlySummary = useMemo(() => {
        const yearPeriods = payrollPeriods.filter(
            p => p.startDate.startsWith(selectedYear) && p.status === 'paid'
        );

        const summary = new Map<string, { employeeName: string; gross: number; net: number }>();

        employees.forEach(emp => {
            summary.set(emp.id, { employeeName: emp.name, gross: 0, net: 0 });
        });

        yearPeriods.forEach(period => {
            period.lineItems.forEach(item => {
                if (summary.has(item.employeeId)) {
                    const current = summary.get(item.employeeId)!;
                    current.gross += item.gross || 0;
                    current.net += item.net || 0;
                }
            });
        });
        
        return Array.from(summary.values()).filter(s => s.gross > 0 || s.net > 0).sort((a,b) => a.employeeName.localeCompare(b.employeeName));

    }, [payrollPeriods, employees, selectedYear]);

    const handleLineItemChange = (employeeId: string, field: 'deductions' | 'flatBonus', value: number) => {
        if (isLocked) return;
        setLineItems(prev => prev.map(item => {
            if (item.employeeId !== employeeId) return item;

            const next = { ...item, [field]: value };
            const grossWithoutFlat = (item.gross || 0) - (item.flatBonus || 0);
            next.gross = grossWithoutFlat + (next.flatBonus || 0);
            next.net = next.gross - (next.deductions || 0);
            return next;
        }));
    };

    const handleDeleteLineItem = (employeeId: string) => {
        if (isLocked) return;
        if (!window.confirm("Are you sure you want to remove this employee from this payroll period?")) return;
        setLineItems(prev => prev.filter(item => item.employeeId !== employeeId));
    };

    const handleFinalize = () => {
        if (!window.confirm("Finalize payroll for this period? Employees can confirm now.")) return;
        const periodToSave: PayrollPeriod = {
            id: periodId,
            startDate,
            endDate,
            status: 'final',
            revision: (currentPeriod?.revision || 0) + 1,
            lineItems: lineItems.map(li => ({...li, revision: (li.revision || 0) + 1})),
        };
        savePayrollPeriod(periodToSave);
    };

    const handleManagerSaveDuringFinal = () => {
      if (!currentPeriod) return;

      const nextLineItems = lineItems.map(li => {
        const original = currentPeriod.lineItems.find(orig => orig.employeeId === li.employeeId);
        if (JSON.stringify(original) !== JSON.stringify(li)) {
          return { ...li, revision: (li.revision || 0) + 1 };
        }
        return li;
      });

      const next: PayrollPeriod = {
        ...currentPeriod,
        status: 'final',
        revision: currentPeriod.revision,
        lineItems: nextLineItems,
      };
      savePayrollPeriod(next);
    };

    const handleLock = () => {
      if (!currentPeriod) return;
      savePayrollPeriod({ ...currentPeriod, status: 'locked' });
    };

    const handleMarkAsPaid = () => {
        if (!currentPeriod) return;
        if (currentPeriod.status !== 'locked') {
          alert("Lock the period before marking as paid.");
          return;
        }
        savePayrollPeriod({ ...currentPeriod, status: 'paid' });
    };

    const handleReopen = () => {
        if (!currentPeriod || currentPeriod.status === 'paid' || !window.confirm("Reopen this payroll period? This will allow edits and reset the confirm window.")) return;
        savePayrollPeriod({ ...currentPeriod, status: 'draft' });
    };

    const handleDelete = () => {
        if (!currentPeriod || !window.confirm("Are you sure you want to permanently delete this payroll period? This cannot be undone.")) return;
        deletePayrollPeriod(currentPeriod.id);
    };
    
    const changeDate = (amount: number) => {
        switch(payFrequency) {
            case 'weekly': setCurrentDate(prev => add(prev, { weeks: amount })); break;
            case 'bi-weekly': setCurrentDate(prev => add(prev, { weeks: 2 * amount })); break;
            case 'semi-monthly': setCurrentDate(prev => add(prev, { days: (amount > 0 ? 16 : -16) })); break;
            case 'monthly': setCurrentDate(prev => add(prev, { months: amount })); break;
        }
    };

    const downloadCSV = () => {
        const header = ["Employee Name", "Regular Hours", "Bonus Hours", "Gross Pay", "Flat Bonus", "Deductions", "Net Pay"];
        const rows = lineItems.map(item => [
            item.employeeName,
            ((item.regularMinutes || 0) / 60).toFixed(2),
            ((item.bonusMinutes || 0) / 60).toFixed(2),
            (item.gross || 0).toFixed(2),
            (item.flatBonus || 0).toFixed(2),
            (item.deductions || 0).toFixed(2),
            (item.net || 0).toFixed(2)
        ]);

        const csvContent = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `payroll-${periodId}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const grandTotalNet = useMemo(() => lineItems.reduce((sum, item) => sum + (item.net || 0), 0), [lineItems]);
    const totalGross = useMemo(() => lineItems.reduce((s,i)=>s + (i.gross || 0), 0), [lineItems]);
    const isLocked = currentPeriod?.status === 'locked' || currentPeriod?.status === 'paid';

    const confirmedIds = useMemo(() => new Set(
      (payrollConfirmations ?? [])
        .filter(c => c.periodId === periodId && c.confirmed)
        .map(c => `${c.employeeId}-${c.revision}`)
    ), [payrollConfirmations, periodId]);

    const allConfirmed = useMemo(() => lineItems.length > 0 && lineItems.every(li => confirmedIds.has(`${li.employeeId}-${li.revision}`)), [lineItems, confirmedIds]);
    const confirmedCount = useMemo(() => lineItems.filter(li => confirmedIds.has(`${li.employeeId}-${li.revision}`)).length, [lineItems, confirmedIds]);

    const toMillis = (at: number | any) => (at?.toMillis ? at.toMillis() : at);

    return (
        <TooltipProvider>
        <Card>
            <CardHeader>
                <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                    <div>
                        <CardTitle>Payroll</CardTitle>
                        <CardDescription>
                            Calculate payroll for specific periods or view yearly summaries.
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
                            <Button onClick={downloadCSV} variant="outline" size="sm" disabled={lineItems.length === 0}>
                                <Download className="mr-2 h-4 w-4" /> CSV
                            </Button>

                            {currentPeriod?.status === 'final' && (
                                <Button variant="secondary" onClick={handleManagerSaveDuringFinal}>Save Changes</Button>
                            )}

                            {currentPeriod?.status === 'final' && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                <span>
                                    <Button onClick={handleLock} disabled={!allConfirmed}>
                                    <Lock className="mr-2" /> Lock Period
                                    </Button>
                                </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {allConfirmed ? 'Locking the period will prevent further changes.' : `Waiting for ${lineItems.length - confirmedCount} more confirmation(s).`}
                                </TooltipContent>
                            </Tooltip>
                            )}
                            
                            {currentPeriod?.status === 'locked' && (
                                <Button onClick={handleMarkAsPaid}>Mark as Paid</Button>
                            )}
                            
                            {currentPeriod?.status === 'locked' && (
                                <Button onClick={handleReopen} variant="destructive">Re-open Period</Button>
                            )}
                            
                            {currentPeriod?.status === 'draft' && (
                                <Button onClick={handleFinalize}>Finalize Payroll</Button>
                            )}

                            {currentPeriod?.status === 'draft' && (
                                <Button onClick={handleDelete} variant="destructive" size="sm">
                                    <Trash2 className="mr-2 h-4 w-4" /> Delete Period
                                </Button>
                            )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end mb-6">
                            <div className="space-y-2">
                                <Label>Pay Frequency</Label>
                                <Select value={payFrequency} onValueChange={(v: PayFrequency) => setPayFrequency(v)} disabled={isLocked}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
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
                                {payFrequency === 'custom' ? (
                                    <div className="flex items-center gap-2">
                                        <Input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} disabled={isLocked} />
                                        <span>-</span>
                                        <Input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} disabled={isLocked} />
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <Button variant="outline" size="icon" onClick={() => changeDate(-1)} disabled={isLocked}><ChevronLeft /></Button>
                                        <div className="flex-grow text-center font-medium p-2 border rounded-md">
                                            {format(parseISO(startDate), 'MMM d')} - {isValid(parseISO(endDate)) ? format(parseISO(endDate), 'MMM d, yyyy') : ''}
                                        </div>
                                        <Button variant="outline" size="icon" onClick={() => changeDate(1)} disabled={isLocked}><ChevronRight /></Button>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="mb-4 flex gap-2 items-center">
                        {currentPeriod?.status === 'final' && (
                            <Badge variant={allConfirmed ? "default" : "secondary"}>
                                Confirmed {confirmedCount}/{lineItems.length}
                            </Badge>
                            )}
                            {isLocked && (
                            <Badge className="bg-primary/80">
                                {`Status: ${currentPeriod?.status} (rev. ${currentPeriod?.revision ?? 0})`}
                            </Badge>
                            )}
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
                                        lineItems.map(item => {
                                        const employee = employeeMap.get(item.employeeId);
                                        const hasConfirmed = confirmedIds.has(`${item.employeeId}-${item.revision}`);
                                        return (
                                            <TableRow key={item.employeeId}>
                                                <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <span>{item.employeeName}</span>
                                                    </TooltipTrigger>
                                                    <TooltipContent>Rev. {item.revision}</TooltipContent>
                                                    </Tooltip>

                                                    {employee?.bankInfo?.bankName && (
                                                        <Tooltip>
                                                        <TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground"><Banknote className="h-4 w-4" /></Button></TooltipTrigger>
                                                        <TooltipContent><div className="text-xs">
                                                            <p><strong>Bank:</strong> {employee.bankInfo.bankName}</p>
                                                            <p><strong>Routing:</strong> {employee.bankInfo.routingNumber}</p>
                                                            <p><strong>Account:</strong> {employee.bankInfo.accountNumber}</p>
                                                        </div></TooltipContent>
                                                        </Tooltip>
                                                    )}
                                                    {hasConfirmed && (
                                                        <Tooltip><TooltipTrigger><UserCheck className="h-4 w-4 text-green-600" /></TooltipTrigger><TooltipContent><p>Payroll confirmed by employee for this revision.</p></TooltipContent></Tooltip>
                                                    )}
                                                </div>
                                                </TableCell>
                                                <TableCell>{((item.regularMinutes) / 60).toFixed(2)}</TableCell>
                                                <TableCell>{((item.bonusMinutes || 0) / 60).toFixed(2)}</TableCell>
                                                <TableCell>${(item.gross || 0).toFixed(2)}</TableCell>
                                                <TableCell>
                                                    <Input 
                                                        type="number" 
                                                        value={Number.isFinite(item.flatBonus) ? item.flatBonus : ''}
                                                        onChange={e => handleLineItemChange(item.employeeId, 'flatBonus', Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0)}
                                                        className="w-24 h-8"
                                                        disabled={isLocked}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Input 
                                                        type="number" 
                                                        value={Number.isFinite(item.deductions) ? item.deductions : ''}
                                                        onChange={e => handleLineItemChange(item.employeeId, 'deductions', Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0)}
                                                        className="w-24 h-8"
                                                        disabled={isLocked}
                                                    />
                                                </TableCell>
                                                <TableCell className="text-right font-mono">${(item.net || 0).toFixed(2)}</TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleDeleteLineItem(item.employeeId)}
                                                    disabled={isLocked}
                                                    title="Remove employee from this payroll"
                                                    >
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                        })
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={8} className="h-24 text-center">No employees or time entries for this period.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                        <div className="mt-4 pr-4 grid grid-cols-2 sm:grid-cols-3 gap-2 text-right">
                            <div className="font-medium">Total Gross: ${totalGross.toFixed(2)}</div>
                            <div className="font-medium">Total Net: ${grandTotalNet.toFixed(2)}</div>
                            <div className="text-sm text-muted-foreground">Confirmed: {confirmedCount}/{lineItems.length}</div>
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
                                    {availableYears.map(year => (
                                        <SelectItem key={year} value={year}>{year}</SelectItem>
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
                                        yearlySummary.map(summary => (
                                            <TableRow key={summary.employeeName}>
                                                <TableCell className="font-medium">{summary.employeeName}</TableCell>
                                                <TableCell className="text-right font-mono">${summary.gross.toFixed(2)}</TableCell>
                                                <TableCell className="text-right font-mono">${summary.net.toFixed(2)}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
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

    

    