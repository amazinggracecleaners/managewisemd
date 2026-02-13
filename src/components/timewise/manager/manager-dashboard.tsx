"use client";

import type {
  Session,
  Settings,
  Entry,
  Employee,
  Site,
  MileageLog,
  OtherExpense,
  Invoice,
} from "@/shared/types/domain";

import { DashboardFilters } from "./dashboard-filters";
import { ActiveShifts } from "./active-shifts";
import { EmployeeTotals } from "./employee-totals";
import { AllEventsTable } from "./all-events-table";
import { SiteMonthlyReport } from "./site-monthly-report";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface ManagerDashboardProps {
  activeShifts: Session[];
  totalsByEmployee: { employee: string; minutes: number }[];
  filteredSessions: Session[];
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
  updateEntry: (id: string, updates: Partial<Entry>) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  employees: Employee[];
  sites: Site[];
  mileageLogs: MileageLog[];
  otherExpenses: OtherExpense[];
  allEntries: Entry[];
  invoices: Invoice[];
  durationsBySite: Map<string, { minutes: number; byEmployee: Record<string, number> }>;
  deleteSite: (siteId: string) => void;
  settings: Settings;
}

export function ManagerDashboard({
  activeShifts,
  totalsByEmployee,
  filteredSessions,
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
  updateEntry,
  deleteEntry,
  employees,
  sites,
  mileageLogs,
  otherExpenses,
  allEntries,
  invoices,
  deleteSite,
  settings,
}: ManagerDashboardProps) {
  return (
    <div className="space-y-6">
      {/* HERO HEADER */}
      <Card className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
        {/* background glow */}
        <div className="pointer-events-none absolute inset-0 opacity-70">
          <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-gradient-to-br from-primary/35 to-accent/20 blur-2xl" />
          <div className="absolute -bottom-28 -left-28 h-72 w-72 rounded-full bg-gradient-to-br from-accent/25 to-primary/20 blur-2xl" />
        </div>

        <CardHeader className="relative">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Manager Dashboard</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Monitor active shifts, review events, and track site performance.
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge className="bg-primary text-primary-foreground">Live Ops</Badge>
                <Badge variant="secondary">
                  {activeShifts.length} active shift{activeShifts.length === 1 ? "" : "s"}
                </Badge>
                <Badge variant="outline">
                  {filteredSessions.length} session{filteredSessions.length === 1 ? "" : "s"} in range
                </Badge>
              </div>
            </div>

            {/* brand tile */}
            <div className="hidden md:block">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-accent shadow-sm" />
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* FILTERS */}
      <Card className="rounded-2xl border bg-card shadow-sm">
        <CardContent className="p-4">
          <DashboardFilters
            fromDate={fromDate}
            setFromDate={setFromDate}
            toDate={toDate}
            setToDate={setToDate}
            search={search}
            setSearch={setSearch}
            exportCSV={exportCSV}
            exportSessionsCSV={exportSessionsCSV}
            onGenerateSummary={onGenerateSummary}
            isGenerating={isGenerating}
          />
        </CardContent>
      </Card>

      {/* KPI GRID */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="rounded-2xl border bg-gradient-to-b from-card to-card/60 shadow-sm">
          <CardContent className="p-4">
            <ActiveShifts activeShifts={activeShifts} />
          </CardContent>
        </Card>

        <Card className="rounded-2xl border bg-gradient-to-b from-card to-card/60 shadow-sm">
          <CardContent className="p-4">
            <EmployeeTotals totals={totalsByEmployee} />
          </CardContent>
        </Card>
      </div>

      {/* ALL EVENTS */}
      <Card className="rounded-2xl border bg-card shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-base font-semibold">All Events</h2>
          <p className="text-sm text-muted-foreground">
            Review, correct, and audit timeclock entries, mileage, and expenses.
          </p>
        </div>
        <CardContent className="p-4">
          <AllEventsTable
            sessions={filteredSessions}
            updateEntry={updateEntry}
            deleteEntry={deleteEntry}
            employees={employees}
            sites={sites}
            mileageLogs={mileageLogs}
            otherExpenses={otherExpenses}
            settings={settings}
          />
        </CardContent>
      </Card>

      {/* SITE REPORT */}
      <Card className="rounded-2xl border bg-card shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-base font-semibold">Monthly Site Report</h2>
          <p className="text-sm text-muted-foreground">
            Revenue vs labor, mileage, expenses, and net profitability by site.
          </p>
        </div>
        <CardContent className="p-4">
          <SiteMonthlyReport
            fromDate={fromDate}
            entries={allEntries}
            employees={employees}
            mileageLogs={mileageLogs}
            otherExpenses={otherExpenses}
            invoices={invoices}
            settings={settings}
            deleteSiteAction={deleteSite}
          />
        </CardContent>
      </Card>
    </div>
  );
}
