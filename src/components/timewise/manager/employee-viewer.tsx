"use client";

import React, { useMemo, useState } from "react";
import type {
  CleaningSchedule,
  Employee,
  Entry,
  PayrollConfirmation,
  PayrollPeriod,
  Settings,
  SiteStatus,
} from "@/shared/types/domain";

import { EmployeeView } from "../employee-view";
import { EmployeeProfileDialog } from "../employee-profile";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { User } from "lucide-react";

interface EmployeeViewerProps {
  allEntries: Entry[];
  allSchedules: CleaningSchedule[];
  allEmployees: Employee[];
  settings: Settings;

  updateEmployee: (id: string, updates: Partial<Employee>) => Promise<void>;
  updateSchedule: (id: string, updates: Partial<CleaningSchedule>) => void;

  payrollPeriods: PayrollPeriod[];
  payrollConfirmations: PayrollConfirmation[];
  getSiteStatuses: (forDate: Date) => Map<string, SiteStatus>;
}

/**
 * Manager-only "preview what the employee sees" screen.
 * This stays read-only (isManagerPreview=true).
 */
export function EmployeeViewer({
  allEntries,
  allSchedules,
  allEmployees,
  settings,
  updateEmployee,
  updateSchedule,
  payrollPeriods,
  payrollConfirmations,
  getSiteStatuses,
}: EmployeeViewerProps) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const selectedEmployee = useMemo(() => {
    return allEmployees.find((e) => e.id === selectedEmployeeId) ?? null;
  }, [selectedEmployeeId, allEmployees]);

  /**
   * Compute active shift state for a given employeeId.
   * Uses entries sorted by time to determine "open" sites.
   */
  const isClockedInForEmployee = useMemo(() => {
    // Pre-group by employeeId for speed and correctness
    const byEmployee = new Map<string, Entry[]>();
    for (const e of allEntries) {
      const id = e.employeeId ?? "";
      if (!id) continue;
      if (!byEmployee.has(id)) byEmployee.set(id, []);
      byEmployee.get(id)!.push(e);
    }

    // Sort each employee's entries once
    for (const [id, arr] of byEmployee.entries()) {
      arr.sort((a, b) => a.ts - b.ts);
      byEmployee.set(id, arr);
    }

    return (siteName?: string, employeeId?: string) => {
      const id = employeeId ?? selectedEmployee?.id ?? "";
      if (!id) return false;

      const entries = byEmployee.get(id);
      if (!entries || entries.length === 0) return false;

      // Track active sites
      const activeSites = new Set<string>();

      for (const e of entries) {
        const site = (e.site || "__ANY__").toLowerCase();

        if (e.action === "in") activeSites.add(site);
        else activeSites.delete(site);
      }

      if (siteName === undefined) return activeSites.size > 0;
      return activeSites.has(siteName.toLowerCase());
    };
  }, [allEntries, selectedEmployee?.id]);

  // typed no-ops (manager preview should not write entries)
  const noOp = () => {};
  const recordEntryNoOp = async () => {};

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Employee App View</CardTitle>
          <CardDescription>
            Select an employee to preview what they see (read-only). Useful for
            verifying schedules and troubleshooting.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 mb-6">
            <div className="flex-grow space-y-2">
              <Label htmlFor="employee-select">Select Employee</Label>

              <Select
                value={selectedEmployeeId}
                onValueChange={setSelectedEmployeeId}
              >
                <SelectTrigger id="employee-select">
                  <SelectValue placeholder="Choose an employee..." />
                </SelectTrigger>
                <SelectContent>
                  {allEmployees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedEmployee && (
              <Button
                variant="outline"
                onClick={() => setIsProfileOpen(true)}
              >
                <User className="mr-2" />
                View/Edit Profile
              </Button>
            )}
          </div>

          {selectedEmployee ? (
            <div className="p-4 border rounded-lg bg-muted/20">
              <EmployeeView
                employee={selectedEmployee}
                onLogout={noOp}
                settings={settings}
                recordEntry={recordEntryNoOp as any} // EmployeeView prop type differs in your versions; safe no-op
                requestLocation={noOp}
                coord={null}
                entries={allEntries}
                schedules={allSchedules}
                updateSchedule={updateSchedule}
                isManagerPreview={true}
                isGettingLocation={false}
                isClockedIn={(siteName?: string, employeeId?: string) =>
                  isClockedInForEmployee(siteName, employeeId ?? selectedEmployee.id)
                }
                updateEmployee={updateEmployee}
                payrollPeriods={payrollPeriods}
                confirmPayroll={async () => {}}
                payrollConfirmations={payrollConfirmations}
                getSiteStatuses={getSiteStatuses}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 text-muted-foreground border rounded-lg">
              Please select an employee to see their view.
            </div>
          )}
        </CardContent>
      </Card>

      {selectedEmployee && (
        <EmployeeProfileDialog
          isOpen={isProfileOpen}
          onOpenChange={setIsProfileOpen}
          employee={selectedEmployee}
          updateEmployee={updateEmployee}
          mode="manager"
           teams={settings.teams ?? []}
        />
      )}
    </>
  );
}
