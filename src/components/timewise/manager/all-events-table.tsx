"use client";

import React, { useState, useMemo, useCallback } from "react";
import type { Session, Entry, Site, Employee, MileageLog, OtherExpense, Settings } from "@/shared/types/domain";
import { formatDT } from "@/lib/time-utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ExternalLink, Trash2, Edit } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { deleteField } from "firebase/firestore";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


// --- Profitability helpers ---
// Normalizes a ts to YYYY-MM-DD for day-bucketing
const yyyymmdd = (ts: number) => new Date(ts).toISOString().slice(0, 10);

function money(n: number) {
  // you can format by locale/currency in settings if you like
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}


interface AllEventsTableProps {
  sessions: Session[];
  sites: Site[];
  employees: Employee[];
  mileageLogs: MileageLog[];
  otherExpenses: OtherExpense[];
  settings?: { mileageRate?: number; defaultHourlyWage?: number; };
  updateEntry: (id: string, updates: Partial<Entry>) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
}

export function AllEventsTable({ sessions, sites, employees, mileageLogs, otherExpenses, settings, updateEntry, deleteEntry }: AllEventsTableProps) {
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // --- Profitability Calculations ---
  const mileageRate = settings?.mileageRate ?? 0;
  const defaultWage = settings?.defaultHourlyWage ?? 0;

  const wageByEmployeeName = useMemo(() => {
    const m = new Map<string, number>();
    (employees ?? []).forEach(e => {
      const wage = (e.payRate ?? defaultWage) as number;
      if (e.name) m.set(e.name, wage);
    });
    return m;
  }, [employees, defaultWage]);

  // Pre-calculate costs per site per day for efficient lookup
  const costsBySiteDate = useMemo(() => {
    const costMap = new Map<string, { mileage: number, other: number }>();
    
    // Mileage
    (mileageLogs ?? []).forEach(log => {
      const date = log.date;
      const siteName = (log.siteName || "").trim();
      if (!date || !siteName) return;

      const key = `${siteName}__${date}`;
      const existing = costMap.get(key) || { mileage: 0, other: 0 };
      existing.mileage += (log.distance || 0) * mileageRate;
      costMap.set(key, existing);
    });

    // Other Expenses
    (otherExpenses ?? []).forEach(exp => {
      const date = exp.date;
      const siteName = (exp.siteName || exp.site || "").trim();
      if (!date || !siteName) return;

      const key = `${siteName}__${date}`;
      const existing = costMap.get(key) || { mileage: 0, other: 0 };
      existing.other += (exp.amount || 0);
      costMap.set(key, existing);
    });

    return costMap;
  }, [mileageLogs, otherExpenses, mileageRate]);

  const revenuePerVisitBySite = useMemo(() => {
    const m = new Map<string, number>();
    (sites ?? []).forEach(s => {
      const rev = Number((s as any).servicePrice ?? 0);
      if (s.name) m.set(s.name, rev);
    });
    return m;
  }, [sites]);

  const profitabilityForSession = useCallback((session: Session) => {
    const siteName = session.in?.site ?? session.out?.site ?? "";
    if (!siteName) {
      return { profit: 0, revenue: 0, laborCost: 0, mileageCost: 0, otherCost: 0 };
    }
  
    const startTs = session.in?.ts ?? session.out?.ts ?? 0;
    const endTs = session.out?.ts ?? session.in?.ts ?? startTs;
  
    if (!startTs || !endTs || endTs <= startTs) {
      return { profit: 0, revenue: 0, laborCost: 0, mileageCost: 0, otherCost: 0 };
    }
    const minutes = (endTs - startTs) / 60000;
  
    const date = yyyymmdd(startTs);
  
    // Revenue
    const revenue = revenuePerVisitBySite.get(siteName) ?? 0;
  
    // Labor (minutes → hours)
    const hourly = wageByEmployeeName.get(session.employee) ?? defaultWage;
    const laborCost = (minutes / 60) * hourly;
  
    // Mileage & Other
    const costKey = `${siteName}__${date}`;
    const associatedCosts = costsBySiteDate.get(costKey) || { mileage: 0, other: 0 };
  
    const profit = revenue - laborCost - associatedCosts.mileage - associatedCosts.other;
    return { 
      profit, 
      revenue, 
      laborCost, 
      mileageCost: associatedCosts.mileage, 
      otherCost: associatedCosts.other
    };
  }, [
    revenuePerVisitBySite,
    wageByEmployeeName,
    defaultWage,
    costsBySiteDate
  ]);

  const monthTotals = useMemo(() => {
    let rev=0, labor=0, mil=0, oth=0;
    sessions.forEach(s => {
      const { revenue, laborCost, mileageCost, otherCost } = profitabilityForSession(s);
      rev += revenue; labor += laborCost; mil += mileageCost; oth += otherCost;
    });
    return { rev, labor, mil, oth, profit: rev - labor - mil - oth };
  }, [sessions, profitabilityForSession]);


  type RowData = {
    key: string;
    entry: Entry;
    session: Session;
    when: string;
    employee: string;
    action: "IN" | "OUT";
  };

  const allRows: RowData[] = sessions
    .flatMap((s) => {
      const rows: { e: Entry; label: "IN" | "OUT", session: Session }[] = [];
      if (s.in) rows.push({ e: s.in, label: "IN", session: s });
      if (s.out) rows.push({ e: s.out, label: "OUT", session: s });
      return rows.map((r) => ({
        key: r.e.id,
        entry: r.e,
        session: r.session,
        when: formatDT(r.e.ts),
        employee: s.employee,
        action: r.label,
      }));
    })
    .sort((a, b) => b.entry.ts - a.entry.ts);
    
  const handleOpenDialog = (entry: Entry) => {
    const date = new Date(entry.ts);
    const localISO = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    setEditingEntry({ ...entry, ts: localISO as any });
    setIsDialogOpen(true);
  };
  
  const handleDataChange = (field: keyof Entry, value: any) => {
    if (!editingEntry) return;
    setEditingEntry({ ...editingEntry, [field]: value });
  };
  
  const handleSave = () => {
    if (!editingEntry) return;

    const employee = employees.find(e => e.id === editingEntry.employeeId);
    
    const updates: Partial<Entry> & { note?: any } = {
        employee: employee?.name || editingEntry.employee,
        employeeId: editingEntry.employeeId,
        site: editingEntry.site,
    };
    
    if (editingEntry.note && editingEntry.note.trim()) {
        updates.note = editingEntry.note.trim();
    } else {
        updates.note = deleteField();
    }

    try {
        const newTs = new Date(editingEntry.ts as any).getTime();
        if (isNaN(newTs)) {
          alert("Invalid date format.");
          return;
        }
        updates.ts = newTs;
    } catch (e) {
      alert("Invalid date format.");
      return;
    }

    updateEntry(editingEntry.id, updates);
    setIsDialogOpen(false);
    setEditingEntry(null);
  };


  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <h3 className="text-lg font-semibold mb-2">All Clock Events</h3>
      <div className="rounded-lg border">
        <ScrollArea className="h-[420px]">
         <TooltipProvider>
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="text-right">Profitability</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allRows.length > 0 ? (
                allRows.map((row) => {
                  const { profit, revenue, laborCost, mileageCost, otherCost } = profitabilityForSession(row.session);
                  const positive = profit >= 0;

                  return (
                  <TableRow key={row.key}>
                    <TableCell className="text-xs">
                        {row.when}
                    </TableCell>
                    <TableCell>{row.employee}</TableCell>
                    <TableCell>
                      <Badge
                        variant={row.action === "IN" ? "default" : "secondary"}
                        className={
                          row.action === "IN"
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                        }
                      >
                        {row.action}
                      </Badge>
                    </TableCell>
                    <TableCell>{row.entry.site}</TableCell>
                    <TableCell>
                      {row.entry.lat && row.entry.lng ? (
                        <Button asChild variant="ghost" size="icon">
                          <a
                            href={`https://maps.google.com/?q=${row.entry.lat},${row.entry.lng}`}
                            target="_blank"
                            rel="noreferrer"
                            title="View on map"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell
                      className="truncate max-w-[12rem]"
                      title={typeof row.entry.note === "string" ? row.entry.note : ""}
                    >
                      {typeof row.entry.note === "string" ? row.entry.note : "—"}
                    </TableCell>
                    <td className="text-right">
                     <Tooltip>
                        <TooltipTrigger>
                           <span
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              positive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                            }`}
                          >
                            {money(profit)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="text-xs space-y-1">
                            <div className="flex justify-between gap-2"><span>Revenue:</span><span className="font-mono">{money(revenue)}</span></div>
                            <div className="flex justify-between gap-2"><span>Labor:</span><span className="font-mono">{money(laborCost)}</span></div>
                            <div className="flex justify-between gap-2"><span>Mileage:</span><span className="font-mono">{money(mileageCost)}</span></div>
                            <div className="flex justify-between gap-2"><span>Other:</span><span className="font-mono">{money(otherCost)}</span></div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </td>
                    <TableCell className="text-right">
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(row.entry)} title="Edit time">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <Button variant="ghost" size="icon" onClick={() => deleteEntry(row.entry.id)} title="Delete entry">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                    </TableCell>
                  </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No entries to show for the selected filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            <TableFooter>
                <TableRow>
                    <TableCell colSpan={6} className="text-right font-semibold">Total for Period</TableCell>
                    <TableCell className={`text-right font-bold ${monthTotals.profit >= 0 ? "text-green-700" : "text-red-700"}`}>
                        {money(monthTotals.profit)}
                    </TableCell>
                    <TableCell />
                </TableRow>
            </TableFooter>
          </Table>
         </TooltipProvider>
        </ScrollArea>
      </div>

       <DialogContent>
          <DialogHeader>
              <DialogTitle>Edit Time Entry</DialogTitle>
          </DialogHeader>
          {editingEntry && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="entry-time">Timestamp</Label>
                <Input 
                  id="entry-time"
                  type="datetime-local"
                  value={editingEntry.ts as any}
                  onChange={(e) => handleDataChange('ts', e.target.value)}
                />
              </div>
               <div className="space-y-2">
                <Label htmlFor="entry-employee">Employee</Label>
                <Select value={editingEntry.employeeId} onValueChange={(val) => handleDataChange('employeeId', val)}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
                        {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                    </SelectContent>
                </Select>
              </div>
               <div className="space-y-2">
                <Label htmlFor="entry-site">Site</Label>
                <Select value={editingEntry.site} onValueChange={(val) => handleDataChange('site', val)}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
                         {sites.map(s => <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>)}
                    </SelectContent>
                </Select>
              </div>
               <div className="space-y-2">
                <Label htmlFor="entry-note">Note</Label>
                <Textarea 
                  id="entry-note"
                  value={editingEntry.note || ''}
                  onChange={(e) => handleDataChange('note', e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
              <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button onClick={handleSave}>Save Changes</Button>
          </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
