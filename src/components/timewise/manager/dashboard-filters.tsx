"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileDown, Sparkles, RotateCcw } from "lucide-react";
import { format, startOfMonth, endOfMonth, add } from "date-fns";

interface DashboardFiltersProps {
  fromDate: string;
  setFromDate: (date: string) => void;
  toDate: string;
  setToDate: (date: string) => void;
  search: string;
  setSearch: (query: string) => void;
  exportCSV: () => void;
  exportSessionsCSV: () => void;
  onGenerateSummary: () => void;
  isGenerating: boolean;
}

export function DashboardFilters({
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  search,
  setSearch,
  exportCSV,
  exportSessionsCSV,
  onGenerateSummary,
  isGenerating,
}: DashboardFiltersProps) {

  const resetFilters = () => {
    setFromDate("");
    setToDate("");
    setSearch("");
  };
  
  const setMonthRange = (offset = 0) => {
    const now = new Date();
    const targetMonth = add(now, { months: offset });
    const first = startOfMonth(targetMonth);
    const last = endOfMonth(targetMonth);
    const toISO = (d: Date) => d.toISOString().slice(0, 10);
    setFromDate(toISO(first));
    setToDate(toISO(last));
};


  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 items-end gap-4">
        <div className="space-y-2">
          <Label htmlFor="from-date">From</Label>
          <Input
            id="from-date"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="to-date">To</Label>
          <Input
            id="to-date"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
        <div className="space-y-2 md:col-span-2 lg:col-span-2">
          <Label htmlFor="search-employee">Search Employees</Label>
          <Input
            id="search-employee"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g., Maria..."
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2 justify-between">
         <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setMonthRange(0)}>This Month</Button>
            <Button variant="outline" onClick={() => setMonthRange(-1)}>Last Month</Button>
            <Button variant="outline" onClick={resetFilters} title="Reset Filters">
                <RotateCcw className="h-4 w-4" />
            </Button>
         </div>
         <div className="flex flex-wrap gap-2">
            <Button onClick={onGenerateSummary} disabled={isGenerating}>
              <Sparkles className="mr-2 h-4 w-4"/>
              {isGenerating ? 'Generating...' : 'AI Summary'}
            </Button>
            <div className="flex gap-2">
                <Button onClick={exportCSV} variant="secondary">
                  <FileDown className="mr-2 h-4 w-4" />
                  Entries CSV
                </Button>
                <Button onClick={exportSessionsCSV} variant="secondary">
                  <FileDown className="mr-2 h-4 w-4"/>
                  Sessions CSV
                </Button>
            </div>
        </div>
      </div>
    </div>
  );
}
