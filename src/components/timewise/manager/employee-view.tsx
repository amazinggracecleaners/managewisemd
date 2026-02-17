"use client";

import React, { useMemo, useState } from "react";
import type { Employee } from "@/shared/types/domain";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PlusCircle, Trash2, Edit } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmployeeProfileDialog } from "../employee-profile";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Team = { id: string; name: string };

interface EmployeeManagerViewProps {
  employees: Employee[];
  teams: Team[]; // ✅ single definition
  addEmployee: (employee: Omit<Employee, "id">) => void;
  updateEmployee: (id: string, updates: Partial<Employee>) => Promise<void>;
  deleteEmployee: (id: string) => Promise<void>;
}

/**
 * NOTE: Ensure Employee includes:
 *   teamId?: string;
 *   teamName?: string;
 */

export function EmployeeManagerView({
  employees,
  teams,
  addEmployee,
  updateEmployee,
  deleteEmployee,
}: EmployeeManagerViewProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  // local edit buffer for team display names (so we don't write on every keystroke)
  const [teamNameDrafts, setTeamNameDrafts] = useState<Record<string, string>>(
    {}
  );

  const employeesSorted = useMemo(() => {
    return (employees || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [employees]);

  const teamById = useMemo(() => {
    return new Map((teams || []).map((t) => [t.id, t]));
  }, [teams]);

  const openDialog = (employee: Employee | null = null) => {
    setEditingEmployee(employee);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingEmployee(null);
  };

  const handleTeamChange = async (emp: Employee, teamId: string) => {
    if (!teamId || teamId === "unassigned") {
      await updateEmployee(emp.id, { teamId: "", teamName: "" } as any);
      return;
    }

    const team = teamById.get(teamId);
    await updateEmployee(emp.id, { teamId, teamName: team?.name ?? "" } as any);

    // also reset draft to match saved value
    setTeamNameDrafts((prev) => ({
      ...prev,
      [emp.id]: team?.name ?? "",
    }));
  };

  const getTeamValue = (emp: Employee) => {
    const teamId = (emp as any).teamId as string | undefined;
    return teamId && teamId.trim().length > 0 ? teamId : "unassigned";
  };

  const getTeamNameValue = (emp: Employee) => {
    const draft = teamNameDrafts[emp.id];
    if (draft !== undefined) return draft;
    return ((emp as any).teamName as string | undefined) ?? "";
  };

  const saveTeamName = async (emp: Employee) => {
    const next = (teamNameDrafts[emp.id] ?? "").trim();
    const current = (((emp as any).teamName as string | undefined) ?? "").trim();
    if (next === current) return;
    await updateEmployee(emp.id, { teamName: next } as any);
  };

  const teamOptions: Team[] = useMemo(() => teams ?? [], [teams]);

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Manage Employees</CardTitle>
            <CardDescription>
              Add, edit, or remove employees. Assign teams (manager-only).
            </CardDescription>
          </div>

          <Button onClick={() => openDialog(null)}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add Employee
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <ScrollArea className="h-96">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Default Rate</TableHead>
                <TableHead>Team</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {employeesSorted.length > 0 ? (
                employeesSorted.map((emp) => {
                  const teamValue = getTeamValue(emp);
                  const payRate = Number.isFinite(emp.payRate) ? emp.payRate : 0;

                  return (
                    <TableRow key={emp.id}>
                      <TableCell>
                        <span className="flex items-center gap-2 font-medium">
                          {emp.color && (
                            <span
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: emp.color }}
                            />
                          )}
                          {emp.name}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {emp.title || ""}
                        </span>
                      </TableCell>

                      <TableCell>{emp.phone || "-"}</TableCell>

                      <TableCell>${payRate.toFixed(2)}</TableCell>

                      <TableCell className="min-w-[220px]">
                        <div className="space-y-2">
                          <Select
                            value={teamValue}
                            onValueChange={(val) => handleTeamChange(emp, val)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Assign a team..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">Unassigned</SelectItem>
                              {teamOptions.length === 0 ? (
                                <SelectItem value="__none__" disabled>
                                  No teams yet (create in Settings)
                                </SelectItem>
                              ) : (
                                teamOptions.map((t) => (
                                  <SelectItem key={t.id} value={t.id}>
                                    {t.name}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>

                          {teamValue !== "unassigned" && (
                            <div className="grid gap-1">
                              <Label className="text-xs text-muted-foreground">
                                Team display name (optional override)
                              </Label>
                              <Input
                                value={getTeamNameValue(emp)}
                                placeholder="e.g., Night Crew"
                                onChange={(e) =>
                                  setTeamNameDrafts((prev) => ({
                                    ...prev,
                                    [emp.id]: e.target.value,
                                  }))
                                }
                                onBlur={() => saveTeamName(emp)}
                              />
                            </div>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDialog(emp)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteEmployee(emp.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    No employees yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>

        {isDialogOpen && (
          <EmployeeProfileDialog
            isOpen={isDialogOpen}
            onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) closeDialog();
            }}
            employee={editingEmployee}
            updateEmployee={updateEmployee}
            addEmployee={async (employee) => addEmployee(employee)}
            mode="manager"
          />
        )}
      </CardContent>
    </Card>
  );
}
