

"use client";

import React, { useState, useMemo } from 'react';
import { EmployeeView } from '../employee-view';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Entry, Settings, CleaningSchedule, Employee, PayrollPeriod, PayrollConfirmation, SiteStatus } from '@/shared/types/domain';
import { Button } from '@/components/ui/button';
import { User } from 'lucide-react';
import { EmployeeProfileDialog } from '../employee-profile';

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

export function EmployeeViewer({ allEntries, allSchedules, allEmployees, settings, updateEmployee, updateSchedule, payrollPeriods, payrollConfirmations, getSiteStatuses }: EmployeeViewerProps) {
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
    const [isProfileOpen, setIsProfileOpen] = useState(false);

    const selectedEmployee = useMemo(() => {
        return allEmployees.find(e => e.id === selectedEmployeeId);
    }, [selectedEmployeeId, allEmployees]);
    
    const isClockedInGlobal = (employeeName?: string, siteName?: string): boolean => {
        if (!employeeName) return false;

        const employeeEntries = allEntries.filter(e => 
            e.employee.toLowerCase() === employeeName.trim().toLowerCase()
        );

        const activeByEmployeeSite = new Map<string, Set<string>>();
        // Ensure entries are sorted by timestamp to correctly determine state
        for (const e of employeeEntries.sort((a,b) => a.ts - b.ts)) {
            const key = e.employee.toLowerCase();
            if (!activeByEmployeeSite.has(key)) activeByEmployeeSite.set(key, new Set());
            const set = activeByEmployeeSite.get(key)!;
            const site = (e.site || "__ANY__").toLowerCase();
            if (e.action === "in") set.add(site);
            else set.delete(site);
        }
        const set = activeByEmployeeSite.get(employeeName.toLowerCase().trim());
        if (!set) return false;
        if (siteName === undefined) return set.size > 0; // check for any active shift
        return set.has(siteName.toLowerCase());
    }


    const noOp = () => {};
    const noOpPromise = async () => {};

    return (
      <>
        <Card>
            <CardHeader>
                <CardTitle>Employee App View</CardTitle>
                <CardDescription>
                    Select an employee to see a read-only preview of what they see in the app.
                    This is useful for verifying schedules and troubleshooting.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col sm:flex-row sm:items-end gap-4 mb-6">
                    <div className="flex-grow space-y-2">
                        <Label htmlFor="employee-select">Select Employee</Label>
                        <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                            <SelectTrigger id="employee-select">
                                <SelectValue placeholder="Choose an employee..." />
                            </SelectTrigger>
                            <SelectContent>
                                {allEmployees.map(emp => (
                                    <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {selectedEmployee && (
                        <Button variant="outline" onClick={() => setIsProfileOpen(true)}>
                            <User className="mr-2" /> View/Edit Profile
                        </Button>
                    )}
                </div>


                {selectedEmployee ? (
                    <div className="p-4 border rounded-lg bg-muted/20">
                       <EmployeeView
                            employee={selectedEmployee}
                            onLogout={noOp}
                            settings={settings}
                            recordEntry={noOpPromise as any}
                            requestLocation={noOp}
                            coord={null}
                            entries={allEntries}
                            schedules={allSchedules}
                            updateSchedule={updateSchedule}
                            isManagerPreview={true}
                            isClockedIn={(siteName?: string, employeeId?: string) => isClockedInGlobal(selectedEmployee.name, siteName)}
                            updateEmployee={updateEmployee}
                            payrollPeriods={payrollPeriods}
                            confirmPayroll={noOpPromise}
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
            />
        )}
      </>
    );
}

    
