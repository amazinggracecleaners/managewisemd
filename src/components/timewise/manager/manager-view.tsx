"use client";

import React, { useMemo, useState } from "react";
import type {
  Session,
  Settings,
  Entry,
  Site,
  CleaningSchedule,
  MileageLog,
  Employee,
  Invoice,
  SiteStatus,
  OtherExpense,
  PayrollPeriod,
  PayrollConfirmation,
  EmployeeUpdateRequest,
} from "@/shared/types/domain";

import { ManagerPinForm } from "./manager-pin-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ScheduleView } from "./schedule-view";
import { MileageView } from "./mileage-view";
import { EmployeeManagerView } from "./employee-view";
import { PayrollView } from "./payroll-view";
import { EmployeeViewer } from "./employee-viewer";
import { InvoiceView } from "./invoice-view";
import { FinancialsView } from "./financials-view";
import { OtherExpensesView } from "./other-expenses-view";
import { ManagerDashboard } from "./manager-dashboard";
import { SiteListView } from "./site-list-view";
import { ManagerSettingsView } from "./manager-settings-view";

import type { JobProfitRow } from "@/lib/job-profitability";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ManagerViewProps {
  unlocked: boolean;
  setUnlocked: (unlocked: boolean) => void;

  settings: Settings;
  setSettings: (updater: (s: Settings) => Settings) => void;

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

  setSiteLocationFromHere: (siteKey: string) => void;
  onGenerateSummary: () => void;
  isGenerating: boolean;

  updateEntry: (id: string, updates: Partial<Entry>) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;

  // Schedule + sites
  sites: Site[];
  schedules: CleaningSchedule[];
  addSchedule: (schedule: Omit<CleaningSchedule, "id">) => void;
  updateSchedule: (id: string, updates: Partial<CleaningSchedule>) => void;
  deleteSchedule: (id: string) => void;
  deleteSite: (siteName: string) => Promise<void>;

  // Mileage
  mileageLogs: MileageLog[];
  addMileageLog: (log: Omit<MileageLog, "id">) => void;
  updateMileageLog: (id: string, updates: Partial<MileageLog>) => void;
  deleteMileageLog: (id: string) => void;

  // Expenses
  otherExpenses: OtherExpense[];
  addOtherExpense: (expense: Omit<OtherExpense, "id">, receiptFile?: File) => Promise<void>;
  updateOtherExpense: (id: string, updates: Partial<OtherExpense>, receiptFile?: File) => Promise<void>;
  deleteOtherExpense: (id: string) => Promise<void>;

  // Employees
  employees: Employee[];
  employeeNames: string[];
  addEmployee: (employee: Omit<Employee, "id">) => void;
  updateEmployee: (id: string, updates: Partial<Employee>) => void; // NOTE: void in props
  deleteEmployee: (id: string) => void; // NOTE: void in props

  // Full data
  allEntries: Entry[];

  // Invoices
  invoices: Invoice[];
  addInvoice: (invoice: Omit<Invoice, "id">) => void;
  updateInvoice: (id: string, updates: Partial<Invoice>) => void;
  deleteInvoice: (id: string) => void;

  // Payroll
  payrollPeriods: PayrollPeriod[];
  savePayrollPeriod: (period: PayrollPeriod) => Promise<void>;
  deletePayrollPeriod: (periodId: string) => Promise<void>;
  payrollConfirmations: PayrollConfirmation[];

  // Helpers
  getSiteStatuses: (forDate: Date) => Map<string, SiteStatus>;
  recordEntry: (
    action: "in" | "out",
    site: Site,
    forDate: Date,
    note?: string,
    employeeId?: string,
    isManagerOverride?: boolean
  ) => Promise<void>;
  isClockedIn: (siteName?: string, employeeId?: string) => boolean;
  testGeofence: (site: Site) => Promise<void>;

  profitabilityBySite: Map<string, JobProfitRow>;
  getDurationsBySite: (forDate: Date) => Map<string, { minutes: number; byEmployee: Record<string, number> }>;

  employeeUpdateRequests: EmployeeUpdateRequest[];
  approveEmployeeUpdate: (requestId: string) => Promise<void> | void;
  rejectEmployeeUpdate: (requestId: string, reason?: string) => Promise<void> | void;

  engine: "local" | "cloud";
  setEngine: (engine: "local" | "cloud") => void;
}

export function ManagerView(props: ManagerViewProps) {
  const [managerTab, setManagerTab] = useState<
    | "dashboard"
    | "requests"
    | "schedule"
    | "sites"
    | "invoices"
    | "financials"
    | "mileage"
    | "otherExpenses"
    | "employees"
    | "payroll"
    | "employeeView"
    | "settings"
  >("dashboard");

  const employeeById = useMemo(() => new Map(props.employees.map((e) => [e.id, e])), [props.employees]);

  const pendingRequests = useMemo(
    () => props.employeeUpdateRequests.filter((r) => r.status === "pending"),
    [props.employeeUpdateRequests]
  );

  // --- Settings helpers ---
  const onRecoverSites = async () => {
    // placeholder: your actual implementation should live in page.tsx and be passed down
    console.log("Recovering sites...");
  };

  const onExportSettings = () => {
    const blob = new Blob([JSON.stringify(props.settings, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `timewise-settings-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  };

  const onImportSettings = (data: Settings) => {
    props.setSettings(() => data);
  };

  // --- Auth gate ---
  if (!props.unlocked) {
    return <ManagerPinForm managerPIN={props.settings.managerPIN} setUnlocked={props.setUnlocked} />;
  }

  // --- Manager clock-in/out wrapper ---
  const recordEntryAsManager = (
    action: "in" | "out",
    site: Site,
    forDate: Date,
    note?: string,
    employeeId?: string
  ) => {
    return props.recordEntry(action, site, forDate, note, employeeId, true);
  };

  const FIELD_LABELS: Partial<Record<keyof Employee, string>> = {
    payRate: "Pay Rate",
    title: "Title",
    color: "Color",
    pin: "PIN",
    name: "Name",
    firstName: "First Name",
    lastName: "Last Name",
    phone: "Phone",
    address: "Address",
    dob: "Date of Birth",
    emergencyContact: "Emergency Contact",
    bankInfo: "Bank Info",
  };

  return (
    <section>
      <Tabs value={managerTab} onValueChange={(v) => setManagerTab(v as any)}>
        <TabsList className="grid w-full grid-cols-1 md:grid-cols-6 lg:grid-cols-12 mb-4 h-auto flex-wrap">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>

          <TabsTrigger value="requests" className="relative">
            Profile Requests
            {pendingRequests.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-destructive text-[10px] text-white px-1.5 py-0.5">
                {pendingRequests.length}
              </span>
            )}
          </TabsTrigger>

          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="sites">Sites</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="financials">Financials</TabsTrigger>
          <TabsTrigger value="mileage">Mileage</TabsTrigger>
          <TabsTrigger value="otherExpenses">Expenses</TabsTrigger>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="employeeView">Employee View</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* DASHBOARD */}
        <TabsContent value="dashboard">
          <ManagerDashboard
            activeShifts={props.activeShifts}
            totalsByEmployee={props.totalsByEmployee}
            filteredSessions={props.filteredSessions}
            fromDate={props.fromDate}
            setFromDate={props.setFromDate}
            toDate={props.toDate}
            setToDate={props.setToDate}
            setSearch={props.setSearch}
            search={props.search}
            exportCSV={props.exportCSV}
            exportSessionsCSV={props.exportSessionsCSV}
            onGenerateSummary={props.onGenerateSummary}
            isGenerating={props.isGenerating}
            updateEntry={props.updateEntry}
            deleteEntry={props.deleteEntry}
            employees={props.employees}
            sites={props.sites}
            mileageLogs={props.mileageLogs}
            otherExpenses={props.otherExpenses}
            allEntries={props.allEntries}
            invoices={props.invoices}
            durationsBySite={props.getDurationsBySite(new Date())}
            deleteSite={props.deleteSite}
            settings={props.settings}
          />
        </TabsContent>

        {/* REQUESTS */}
        <TabsContent value="requests">
          <Card>
            <CardHeader>
              <CardTitle>Profile Change Requests</CardTitle>
              <CardDescription>Employees’ self-updates waiting for your approval.</CardDescription>
            </CardHeader>

            <CardContent>
              {pendingRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending profile change requests.</p>
              ) : (
                <div className="space-y-3">
                  {pendingRequests.map((req) => {
                    const employee = employeeById.get(req.employeeId);

                    const changedEntries = Object.entries(req.updates || {}).filter(([field, value]) => {
                      if (!employee) return true;
                      const key = field as keyof Employee;
                      const current = employee[key];

                      if (
                        typeof current === "object" &&
                        current !== null &&
                        typeof value === "object" &&
                        value !== null
                      ) {
                        return JSON.stringify(current) !== JSON.stringify(value);
                      }
                      return current !== value;
                    });

                    return (
                      <div
                        key={req.id}
                        className="border rounded-md p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
                      >
                        <div>
                          <p className="font-medium text-sm">
                            {req.employeeName}{" "}
                            <span className="text-xs text-muted-foreground">({req.employeeId})</span>
                          </p>

                          {changedEntries.length === 0 ? (
                            <p className="text-xs text-muted-foreground mt-1">
                              No actual differences from current profile.
                            </p>
                          ) : (
                            <>
                              <p className="text-xs text-muted-foreground mb-1">Requested changes:</p>
                              <ul className="text-xs list-disc list-inside space-y-0.5">
                                {changedEntries.flatMap(([field, value]) => {
                                  const key = field as keyof Employee;
                                  const label = FIELD_LABELS[key] ?? field;
                                  const currentValue = employee ? (employee as any)[key] : undefined;

                                  if (
                                    typeof currentValue === "object" &&
                                    currentValue !== null &&
                                    typeof value === "object" &&
                                    value !== null
                                  ) {
                                    return Object.entries(value)
                                      .map(([nestedKey, nestedValue]) => {
                                        const oldNestedValue = (currentValue as any)[nestedKey];
                                        if (oldNestedValue === nestedValue) return null;

                                        return (
                                          <li key={`${field}.${nestedKey}`}>
                                            <span className="font-semibold">
                                              {label}.{nestedKey}
                                            </span>
                                            :{" "}
                                            <span className="line-through text-muted-foreground">
                                              {String(oldNestedValue ?? "N/A")}
                                            </span>{" "}
                                            →{" "}
                                            <span className="text-primary font-medium">{String(nestedValue)}</span>
                                          </li>
                                        );
                                      })
                                      .filter(Boolean) as any;
                                  }

                                  return (
                                    <li key={field}>
                                      <span className="font-semibold">{label}</span>:{" "}
                                      <span className="line-through text-muted-foreground">
                                        {String(currentValue ?? "N/A")}
                                      </span>{" "}
                                      → <span className="text-primary font-medium">{String(value ?? "")}</span>
                                    </li>
                                  );
                                })}
                              </ul>
                            </>
                          )}
                        </div>

                        <div className="flex gap-2 mt-2 md:mt-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const reason = window.prompt("Optional: Reason for rejecting this change?");
                              props.rejectEmployeeUpdate(req.id, reason || undefined);
                            }}
                          >
                            Reject
                          </Button>

                          <Button size="sm" variant="default" onClick={() => props.approveEmployeeUpdate(req.id)}>
                            Approve
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SCHEDULE */}
        <TabsContent value="schedule">
          <ScheduleView
            sites={props.sites}
            employees={props.employees}
            schedules={props.schedules}
            addSchedule={props.addSchedule}
            updateSchedule={props.updateSchedule}
            deleteSchedule={props.deleteSchedule}
            weekStartsOn={props.settings.weekStartsOn as any}
            getSiteStatuses={props.getSiteStatuses}
            recordEntry={recordEntryAsManager}
            isClockedIn={props.isClockedIn}
            getDurationsBySite={props.getDurationsBySite}
            teams={props.settings.teams ?? []}
          />
        </TabsContent>

        {/* SITES */}
        <TabsContent value="sites">
          <SiteListView
            sites={props.sites}
            settings={props.settings}
            setSettings={props.setSettings}
            deleteSite={props.deleteSite}
            setSiteLocationFromHere={props.setSiteLocationFromHere}
            testGeofence={props.testGeofence}
          />
        </TabsContent>

        {/* INVOICES */}
        <TabsContent value="invoices">
          <InvoiceView sites={props.sites} />
        </TabsContent>

        {/* FINANCIALS */}
        <TabsContent value="financials">
          <FinancialsView
            invoices={props.invoices}
            otherExpenses={props.otherExpenses}
            mileageLogs={props.mileageLogs}
            payrollPeriods={props.payrollPeriods}
            entries={props.allEntries}
            settings={props.settings}
            fromDate={props.fromDate}
            toDate={props.toDate}
            mileageRate={props.settings.mileageRate}
          />
        </TabsContent>

        {/* MILEAGE */}
        <TabsContent value="mileage">
          <MileageView
            mileageLogs={props.mileageLogs}
            sites={props.sites}
            addMileageLog={props.addMileageLog}
            updateMileageLog={props.updateMileageLog}
            deleteMileageLog={props.deleteMileageLog}
            fromDate={props.fromDate}
            toDate={props.toDate}
          />
        </TabsContent>

        {/* EXPENSES */}
        <TabsContent value="otherExpenses">
          <OtherExpensesView
            otherExpenses={props.otherExpenses}
            sites={props.sites}
            addOtherExpense={props.addOtherExpense}
            updateOtherExpense={props.updateOtherExpense}
            deleteOtherExpense={props.deleteOtherExpense}
            fromDate={props.fromDate}
            toDate={props.toDate}
          />
        </TabsContent>

        {/* EMPLOYEES */}
        <TabsContent value="employees">
  <EmployeeManagerView
    employees={props.employees}
    teams={props.settings.teams ?? []}
    addEmployee={props.addEmployee}
    updateEmployee={async (id, updates) => {
      props.updateEmployee(id, updates);
    }}
    deleteEmployee={async (id) => {
      props.deleteEmployee(id);
    }}
    
  />
</TabsContent>


        {/* PAYROLL */}
        <TabsContent value="payroll">
          <PayrollView
            employees={props.employees}
            timeEntries={props.allEntries}
            sites={props.sites}
            payrollPeriods={props.payrollPeriods}
            savePayrollPeriod={props.savePayrollPeriod}
            deletePayrollPeriod={props.deletePayrollPeriod}
            payrollConfirmations={props.payrollConfirmations}
          />
        </TabsContent>

        {/* EMPLOYEE VIEWER */}
        <TabsContent value="employeeView">
          <EmployeeViewer
            allEntries={props.allEntries}
            allSchedules={props.schedules}
            allEmployees={props.employees}
            settings={props.settings}
            updateEmployee={async (id, updates) => {
              props.updateEmployee(id, updates);
            }}
            updateSchedule={props.updateSchedule}
            payrollPeriods={props.payrollPeriods}
            payrollConfirmations={props.payrollConfirmations}
            getSiteStatuses={props.getSiteStatuses}
          />
        </TabsContent>

        {/* SETTINGS */}
        <TabsContent value="settings">
          <ManagerSettingsView
            settings={props.settings}
            setSettings={props.setSettings}
            engine={props.engine}
            setEngine={props.setEngine}
            onRecoverSites={onRecoverSites}
            onExportSettings={onExportSettings}
            onImportSettings={onImportSettings}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}
