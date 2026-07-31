"use client";

import React, { useMemo, useState } from "react";
import type { Employee } from "@/shared/types/domain";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  PlusCircle,
  Trash2,
  Edit,
  UsersRound,
  UserCheck,
  UserX,
  Search,
  Phone,
  BadgeDollarSign,
  BriefcaseBusiness,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
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
  const [employeeFilter, setEmployeeFilter] = useState<
    "active" | "inactive" | "all"
  >("active");
  const [searchTerm, setSearchTerm] = useState("");

const activeEmployees = useMemo(
  () =>
    (employees ?? []).filter(
      (emp) => (emp.status || "active").toLowerCase() !== "inactive"
    ),
  [employees]
);

const inactiveEmployeesCount = useMemo(
  () =>
    (employees ?? []).filter(
      (emp) => (emp.status || "active").toLowerCase() === "inactive"
    ).length,
  [employees]
);

const activeEmployeesCount = activeEmployees.length;
const allEmployeesCount = employees.length;

  const employeesSorted = useMemo(() => {
    let baseEmployees = employees ?? [];

    if (employeeFilter === "active") {
      baseEmployees = activeEmployees;
    } else if (employeeFilter === "inactive") {
      baseEmployees = baseEmployees.filter(
        (emp) => (emp.status || "active").toLowerCase() === "inactive"
      );
    }

    const query = searchTerm.trim().toLowerCase();

    if (query) {
      baseEmployees = baseEmployees.filter((emp) => {
        const teamName = ((emp as any).teamName as string | undefined) ?? "";
        return [
          emp.name,
          emp.firstName,
          emp.lastName,
          emp.title,
          emp.phone,
          teamName,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      });
    }

    return baseEmployees
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employees, activeEmployees, employeeFilter, searchTerm]);

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
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-blue-200/60 bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 p-6 text-white shadow-2xl dark:border-blue-900/60">
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-violet-500/15 blur-3xl" />

        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-blue-100 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              Workforce Management
            </div>

            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 p-3.5 shadow-lg shadow-cyan-500/20">
                <UsersRound className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Manage Employees
                </h1>
                <p className="mt-2 max-w-xl text-sm leading-6 text-blue-100/85">
                  Add employees, assign teams, review status, update pay rates,
                  and manage workforce records from one place.
                </p>
              </div>
            </div>
          </div>

          <Button
            onClick={() => openDialog(null)}
            className="h-12 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-6 font-semibold text-slate-950 shadow-xl shadow-cyan-500/20 hover:from-cyan-300 hover:to-blue-400"
          >
            <PlusCircle className="mr-2 h-5 w-5" />
            Add Employee
          </Button>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="overflow-hidden border-emerald-200 bg-gradient-to-br from-white to-emerald-50 shadow-sm dark:border-emerald-900 dark:from-slate-950 dark:to-emerald-950/20">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                Active Employees
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                {activeEmployeesCount}
              </p>
            </div>
            <div className="rounded-2xl bg-emerald-500 p-3 text-white shadow-lg shadow-emerald-500/20">
              <UserCheck className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-rose-200 bg-gradient-to-br from-white to-rose-50 shadow-sm dark:border-rose-900 dark:from-slate-950 dark:to-rose-950/20">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-700 dark:text-rose-300">
                Inactive Employees
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                {inactiveEmployeesCount}
              </p>
            </div>
            <div className="rounded-2xl bg-rose-500 p-3 text-white shadow-lg shadow-rose-500/20">
              <UserX className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-blue-200 bg-gradient-to-br from-white to-blue-50 shadow-sm dark:border-blue-900 dark:from-slate-950 dark:to-blue-950/20">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">
                Total Workforce
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                {allEmployeesCount}
              </p>
            </div>
            <div className="rounded-2xl bg-blue-500 p-3 text-white shadow-lg shadow-blue-500/20">
              <ShieldCheck className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden rounded-3xl border-slate-200 shadow-xl dark:border-slate-800">
        <CardHeader className="border-b bg-gradient-to-r from-white via-slate-50 to-blue-50/60 p-5 dark:from-slate-950 dark:via-slate-950 dark:to-blue-950/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-xl">Employee Directory</CardTitle>
              <CardDescription className="mt-1">
                Search employees, filter by status, and manage team assignments.
              </CardDescription>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative min-w-[240px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search employees..."
                  className="h-11 rounded-xl border-slate-200 bg-white pl-9 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                />
              </div>

              <Select
                value={employeeFilter}
                onValueChange={(value: "active" | "inactive" | "all") =>
                  setEmployeeFilter(value)
                }
              >
                <SelectTrigger className="h-11 w-full rounded-xl border-slate-200 bg-white shadow-sm sm:w-44 dark:border-slate-800 dark:bg-slate-900">
                  <SelectValue placeholder="Employee filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active Employees</SelectItem>
                  <SelectItem value="inactive">Inactive Employees</SelectItem>
                  <SelectItem value="all">All Employees</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <ScrollArea className="h-[520px]">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur dark:bg-slate-900/95">
                <TableRow className="border-slate-200 hover:bg-transparent dark:border-slate-800">
                  <TableHead className="min-w-[220px] py-4 font-semibold text-slate-700 dark:text-slate-200">
                    Employee
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">
                    Phone
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">
                    Default Rate
                  </TableHead>
                  <TableHead className="min-w-[260px] font-semibold text-slate-700 dark:text-slate-200">
                    Team
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">
                    Status
                  </TableHead>
                  <TableHead className="text-right font-semibold text-slate-700 dark:text-slate-200">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {employeesSorted.length > 0 ? (
                  employeesSorted.map((emp) => {
                    const teamValue = getTeamValue(emp);
                    const payRate = Number.isFinite(emp.payRate) ? emp.payRate : 0;
                    const initials =
                      `${emp.firstName?.charAt(0) ?? ""}${emp.lastName?.charAt(0) ?? ""}`.toUpperCase() ||
                      emp.name
                        .split(" ")
                        .map((part) => part.charAt(0))
                        .slice(0, 2)
                        .join("")
                        .toUpperCase();

                    return (
                      <TableRow
                        key={emp.id}
                        className="group border-slate-100 transition-colors hover:bg-blue-50/50 dark:border-slate-900 dark:hover:bg-blue-950/15"
                      >
                        <TableCell className="py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-bold text-white shadow-md"
                              style={{
                                background: `linear-gradient(135deg, ${emp.color || "#2563eb"}, #4338ca)`,
                              }}
                            >
                              {initials}
                            </div>

                            <div className="min-w-0">
                              <div className="truncate font-semibold text-slate-900 dark:text-white">
                                {emp.name}
                              </div>
                              <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                                <BriefcaseBusiness className="h-3.5 w-3.5" />
                                {emp.title || "No title assigned"}
                              </div>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                            <Phone className="h-4 w-4 text-blue-500" />
                            {emp.phone || "—"}
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                            <BadgeDollarSign className="h-4 w-4" />
                            ${payRate.toFixed(2)}
                          </div>
                        </TableCell>

                        <TableCell className="min-w-[260px]">
                          <div className="space-y-2">
                            <Select
                              value={teamValue}
                              onValueChange={(value) =>
                                handleTeamChange(emp, value)
                              }
                            >
                              <SelectTrigger className="h-10 rounded-xl border-violet-200 bg-violet-50/60 dark:border-violet-900 dark:bg-violet-950/20">
                                <SelectValue placeholder="Assign a team..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unassigned">
                                  Unassigned
                                </SelectItem>
                                {teamOptions.length === 0 ? (
                                  <SelectItem value="__none__" disabled>
                                    No teams yet
                                  </SelectItem>
                                ) : (
                                  teamOptions.map((team) => (
                                    <SelectItem key={team.id} value={team.id}>
                                      {team.name}
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>

                            {teamValue !== "unassigned" && (
                              <div className="grid gap-1">
                                <Label className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                                  Display name override
                                </Label>
                                <Input
                                  value={getTeamNameValue(emp)}
                                  placeholder="e.g., Night Crew"
                                  onChange={(event) =>
                                    setTeamNameDrafts((previous) => ({
                                      ...previous,
                                      [emp.id]: event.target.value,
                                    }))
                                  }
                                  onBlur={() => saveTeamName(emp)}
                                  className="h-9 rounded-lg border-slate-200 bg-white text-sm dark:border-slate-800 dark:bg-slate-900"
                                />
                              </div>
                            )}
                          </div>
                        </TableCell>

                        <TableCell>
                          <Badge
                            className={
                              emp.status === "inactive"
                                ? "rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
                                : "rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
                            }
                          >
                            <span
                              className={`mr-1.5 h-2 w-2 rounded-full ${
                                emp.status === "inactive"
                                  ? "bg-rose-500"
                                  : "bg-emerald-500"
                              }`}
                            />
                            {emp.status === "inactive" ? "Inactive" : "Active"}
                          </Badge>
                        </TableCell>

                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => openDialog(emp)}
                              className="h-9 w-9 rounded-xl border-blue-200 text-blue-600 shadow-sm hover:bg-blue-50 hover:text-blue-700 dark:border-blue-900 dark:hover:bg-blue-950/30"
                              aria-label={`Edit ${emp.name}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>

                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => deleteEmployee(emp.id)}
                              className="h-9 w-9 rounded-xl border-rose-200 text-rose-600 shadow-sm hover:bg-rose-50 hover:text-rose-700 dark:border-rose-900 dark:hover:bg-rose-950/30"
                              aria-label={`Delete ${emp.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-64 text-center">
                      <div className="mx-auto flex max-w-sm flex-col items-center">
                        <div className="mb-4 rounded-3xl bg-gradient-to-br from-blue-100 to-violet-100 p-5 text-blue-600 dark:from-blue-950/40 dark:to-violet-950/40 dark:text-blue-300">
                          <UsersRound className="h-8 w-8" />
                        </div>
                        <h3 className="font-semibold text-slate-900 dark:text-white">
                          No employees found
                        </h3>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          Try another filter or add a new employee to get started.
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

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
          teams={teams}
        />
      )}
    </div>
  );
}