"use client";

import React, { useState, useEffect, useMemo } from "react";
import type { Employee } from "@/shared/types/domain";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_PIN } from "@/lib/constants";
import { cleanForFirestore } from "@/lib/firestore-utils";

// ✅ add these imports
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  UserRound,
  BriefcaseBusiness,
  ShieldAlert,
  Landmark,
  Phone,
  MapPin,
  CalendarDays,
  BadgeDollarSign,
  UsersRound,
  KeyRound,
  Palette,
  Save,
  UserPlus,
  Sparkles,
  CheckCircle2,
  XCircle,
} from "lucide-react";

type DialogMode = "manager" | "employeeSelf";

type Team = { id: string; name: string };

interface EmployeeProfileDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  employee: Employee | null;

  // Manager: direct update. Self: creates an update request in your TimeWisePage logic.
  updateEmployee: (id: string, updates: Partial<Employee>) => Promise<void>;

  // Manager-only: used when creating a brand new employee.
  addEmployee?: (employee: Omit<Employee, "id">) => Promise<void>;

  mode: DialogMode;

  // kept for compatibility, not needed here
  onRequestUpdate?: (updates: Partial<Employee>) => Promise<void>;

  // ✅ NEW: pass settings.teams from ManagerView
  teams?: Team[];
}

export function EmployeeProfileDialog({
  isOpen,
  onOpenChange,
  employee,
  updateEmployee,
  addEmployee,
  mode,
  teams = [],
}: EmployeeProfileDialogProps) {
  const { toast } = useToast();
  const isManager = mode === "manager";
  const isSelf = mode === "employeeSelf";
  const isNewEmployee = isManager && !employee;

  const sortedTeams = useMemo(
    () => teams.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [teams]
  );

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [title, setTitle] = useState("");
  const [pin, setPin] = useState("");
  const [payRate, setPayRate] = useState("");
  const [color, setColor] = useState("#000000");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");

  // ✅ NEW: team state (manager-only editable)
  const [teamId, setTeamId] = useState<string>("");
const [status, setStatus] = useState<"active" | "inactive">("active");
  useEffect(() => {
    if (employee) {
      setFirstName(employee.firstName || "");
      setLastName(employee.lastName || "");
      setDob(employee.dob || "");
      setTitle(employee.title || "");
      setPin(employee.pin || "");
      setPayRate(
        employee.payRate !== undefined && employee.payRate !== null
          ? String(employee.payRate)
          : ""
      );
      setColor(employee.color || "#000000");
      setAddress(employee.address || "");
      setPhone(employee.phone || "");
      setEmergencyContactName(employee.emergencyContact?.name || "");
      setEmergencyContactPhone(employee.emergencyContact?.phone || "");
      setBankName(employee.bankInfo?.bankName || "");
      setAccountNumber(employee.bankInfo?.accountNumber || "");
      setRoutingNumber(employee.bankInfo?.routingNumber || "");

      // ✅ NEW: load teamId
      setTeamId((employee as any).teamId || "");
      setStatus(employee.status || "active");
    } else {
      setFirstName("");
      setLastName("");
      setDob("");
      setTitle("");
      setPin(DEFAULT_PIN);
      setPayRate("");
      setColor("#000000");
      setAddress("");
      setPhone("");
      setEmergencyContactName("");
      setEmergencyContactPhone("");
      setBankName("");
      setAccountNumber("");
      setRoutingNumber("");

      // ✅ NEW: default to no team
      setTeamId("");
      setStatus("active");
    }
  }, [employee]);

  const handleSubmit = async () => {
    // ✅ EMPLOYEE SELF MODE (restricted fields)
    if (isSelf) {
      if (!employee) {
        toast({
          variant: "destructive",
          title: "No employee found",
          description: "Cannot update profile without an employee record.",
        });
        return;
      }

      const requestUpdates: Partial<Employee> = {
        dob: dob || undefined,
        address: address || undefined,
        phone: phone || undefined,
        emergencyContact:
          emergencyContactName || emergencyContactPhone
            ? { name: emergencyContactName, phone: emergencyContactPhone }
            : undefined,
        bankInfo:
          bankName || accountNumber || routingNumber
            ? { bankName, accountNumber, routingNumber }
            : undefined,
      };

      const cleaned = cleanForFirestore(requestUpdates);

      try {
        await updateEmployee(employee.id, cleaned);
        onOpenChange(false);
      } catch (e: any) {
        toast({
          variant: "destructive",
          title: "Could not submit update",
          description: e?.message || "Please try again.",
        });
      }
      return;
    }

    // ✅ MANAGER MODE
    const fn = firstName.trim();
    const ln = lastName.trim();
    const fullName = `${fn} ${ln}`.trim();
    const pinTrim = pin.trim();
    const rate = parseFloat(payRate);

    if (!fn || !ln || !pinTrim || (isNewEmployee && !payRate)) {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description:
          "First Name, Last Name, PIN, and Pay Rate are required for new employees.",
      });
      return;
    }

    if (isNewEmployee && (Number.isNaN(rate) || rate <= 0)) {
      toast({
        variant: "destructive",
        title: "Invalid Pay Rate",
        description: "Please enter a valid pay rate greater than 0.",
      });
      return;
    }

    try {
      // ✅ CREATE NEW EMPLOYEE
      if (isNewEmployee) {
        if (!addEmployee) {
          toast({
            variant: "destructive",
            title: "Missing addEmployee()",
            description:
              "This dialog is in manager mode, but addEmployee was not provided.",
          });
          return;
        }

        const newEmployee: Omit<Employee, "id"> = {
          name: fullName,
          firstName: fn,
          lastName: ln,
          dob: dob || undefined,
          title: title || undefined,
          pin: pinTrim,
          payRate: rate,
          color: color || "#000000",
          address: address || undefined,
          phone: phone || undefined,
          emergencyContact:
            emergencyContactName || emergencyContactPhone
              ? { name: emergencyContactName, phone: emergencyContactPhone }
              : undefined,
          bankInfo:
            bankName || accountNumber || routingNumber
              ? { bankName, accountNumber, routingNumber }
              : undefined,

          // ✅ NEW: teamId on create
          ...(teamId ? ({ teamId } as any) : {}),
          status,
        };

        const cleanedNew = cleanForFirestore(newEmployee) as Omit<Employee, "id">;

        await addEmployee(cleanedNew);

        toast({
          title: "Employee added",
          description: `${fullName} has been created.`,
        });

        onOpenChange(false);
        return;
      }

      // ✅ UPDATE EXISTING EMPLOYEE
      if (!employee) return;

      const updatedEmployee: Partial<Employee> = {
        name: fullName,
        firstName: fn,
        lastName: ln,
        dob: dob || undefined,
        title: title || undefined,
        pin: pinTrim,
        payRate: Number.isNaN(rate) ? employee.payRate : rate,
        color,
        address: address || undefined,
        phone: phone || undefined,
        emergencyContact:
          emergencyContactName || emergencyContactPhone
            ? { name: emergencyContactName, phone: emergencyContactPhone }
            : undefined,
        bankInfo:
          bankName || accountNumber || routingNumber
            ? { bankName, accountNumber, routingNumber }
            : undefined,

        // ✅ NEW: teamId on update
        ...(teamId ? ({ teamId } as any) : ({ teamId: "" } as any)),
        status,
      };

      const cleanedUpdates = cleanForFirestore(updatedEmployee);

      await updateEmployee(employee.id, cleanedUpdates);

      toast({
        title: "Employee updated",
        description: `${fullName}'s profile has been updated.`,
      });

      onOpenChange(false);
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: e?.message || "Please try again.",
      });
    }
  };

  const displayName =
    `${firstName.trim()} ${lastName.trim()}`.trim() ||
    employee?.name ||
    (isNewEmployee ? "New Employee" : "Employee");

  const initials =
    `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`.toUpperCase() ||
    "MW";

  const selectedTeamName =
    sortedTeams.find((team) => team.id === teamId)?.name || "No team";

  const sectionCard =
    "overflow-hidden rounded-2xl border bg-white shadow-sm transition-shadow hover:shadow-md dark:bg-slate-950";

  const fieldClass =
    "h-11 rounded-xl border-slate-200 bg-white shadow-sm transition focus-visible:border-blue-500 focus-visible:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-900";

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl gap-0 overflow-hidden border-0 bg-slate-50 p-0 shadow-2xl dark:bg-slate-950">
        <DialogHeader className="relative overflow-hidden bg-gradient-to-r from-blue-700 via-indigo-700 to-violet-700 px-6 py-6 text-white">
          <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-20 left-1/3 h-44 w-44 rounded-full bg-cyan-300/10 blur-2xl" />

          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-4 border-white/25 text-xl font-bold text-white shadow-lg"
                style={{ backgroundColor: color || "#2563eb" }}
              >
                {initials}
              </div>

              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <DialogTitle className="truncate text-2xl font-bold tracking-tight text-white">
                    {isManager
                      ? isNewEmployee
                        ? "Add New Employee"
                        : displayName
                      : "My Profile"}
                  </DialogTitle>

                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                      status === "active"
                        ? "border-emerald-300/50 bg-emerald-400/20 text-emerald-50"
                        : "border-rose-300/50 bg-rose-400/20 text-rose-50"
                    }`}
                  >
                    {status === "active" ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5" />
                    )}
                    {status === "active" ? "Active" : "Inactive"}
                  </span>
                </div>

                <p className="truncate text-sm text-blue-100">
                  {title || "Employee profile"}
                  {isManager && !isNewEmployee ? ` • ${selectedTeamName}` : ""}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-blue-50 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              {isSelf ? "Employee Self-Service" : "Manager Access"}
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[68vh]">
          <div className="space-y-5 p-5 sm:p-6">
            {isSelf && (
              <div className="rounded-2xl border border-cyan-200 bg-gradient-to-r from-cyan-50 to-blue-50 p-4 text-sm text-cyan-950 shadow-sm dark:border-cyan-900 dark:from-cyan-950/40 dark:to-blue-950/40 dark:text-cyan-100">
                You can update your contact, emergency contact, and banking information.
                Job title, pay rate, PIN, team, and status remain manager-controlled.
              </div>
            )}

            {/* PERSONAL INFORMATION */}
            <section className={`${sectionCard} border-blue-100 dark:border-blue-950`}>
              <div className="flex items-center gap-3 border-b border-blue-100 bg-gradient-to-r from-blue-50 to-cyan-50 px-5 py-4 dark:border-blue-950 dark:from-blue-950/50 dark:to-cyan-950/40">
                <div className="rounded-xl bg-blue-600 p-2.5 text-white shadow-md shadow-blue-600/20">
                  <UserRound className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    Personal Information
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Basic identity and contact details
                  </p>
                </div>
              </div>

              <div className="space-y-4 p-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                      disabled={isSelf}
                      className={fieldClass}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                      disabled={isSelf}
                      className={fieldClass}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="dob" className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-blue-600" />
                      Date of Birth
                    </Label>
                    <Input
                      id="dob"
                      type="date"
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      className={fieldClass}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone" className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-blue-600" />
                      Phone Number
                    </Label>
                    <Input
                      id="phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(859) 555-0123"
                      className={fieldClass}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address" className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-blue-600" />
                    Address
                  </Label>
                  <Input
                    id="address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Street, city, state, ZIP"
                    className={fieldClass}
                  />
                </div>
              </div>
            </section>

            {/* EMPLOYMENT */}
            <section className={`${sectionCard} border-violet-100 dark:border-violet-950`}>
              <div className="flex items-center gap-3 border-b border-violet-100 bg-gradient-to-r from-violet-50 to-fuchsia-50 px-5 py-4 dark:border-violet-950 dark:from-violet-950/50 dark:to-fuchsia-950/40">
                <div className="rounded-xl bg-violet-600 p-2.5 text-white shadow-md shadow-violet-600/20">
                  <BriefcaseBusiness className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    Employment Details
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Role, team, access, status, and compensation
                  </p>
                </div>
              </div>

              <div className="space-y-4 p-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="title">Job Title</Label>
                    <Input
                      id="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g., Team Lead"
                      readOnly={isSelf}
                      disabled={isSelf}
                      className={`${fieldClass} ${isSelf ? "cursor-not-allowed bg-slate-100 dark:bg-slate-900" : ""}`}
                    />
                    {isSelf && (
                      <p className="text-[11px] text-muted-foreground">
                        Only managers can change your title.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pin" className="flex items-center gap-2">
                      <KeyRound className="h-4 w-4 text-violet-600" />
                      Employee PIN
                    </Label>
                    <Input
                      id="pin"
                      type={isSelf ? "password" : "text"}
                      value={isSelf ? (employee?.pin ? "••••" : "") : pin}
                      onChange={(e) => setPin(e.target.value)}
                      readOnly={isSelf}
                      disabled={isSelf}
                      required={!isSelf}
                      className={`${fieldClass} ${isSelf ? "cursor-not-allowed bg-slate-100 dark:bg-slate-900" : ""}`}
                    />
                    {isSelf && (
                      <p className="text-[11px] text-muted-foreground">
                        Ask your manager if you need a PIN change.
                      </p>
                    )}
                  </div>
                </div>

                {isManager && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <UsersRound className="h-4 w-4 text-violet-600" />
                        Team
                      </Label>

                      {sortedTeams.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-violet-200 bg-violet-50/60 p-3 text-xs text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300">
                          No teams yet. Add teams in Manager Settings → Teams.
                        </div>
                      ) : (
                        <Select value={teamId} onValueChange={setTeamId}>
                          <SelectTrigger className={fieldClass}>
                            <SelectValue placeholder="Select a team" />
                          </SelectTrigger>
                          <SelectContent>
                            {sortedTeams.map((team) => (
                              <SelectItem key={team.id} value={team.id}>
                                {team.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Employee Status</Label>
                      <Select
                        value={status}
                        onValueChange={(value) =>
                          setStatus(value as "active" | "inactive")
                        }
                      >
                        <SelectTrigger
                          className={`${fieldClass} ${
                            status === "active"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
                              : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
                          }`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="payRate" className="flex items-center gap-2">
                      <BadgeDollarSign className="h-4 w-4 text-emerald-600" />
                      Default Pay Rate ($/hour)
                    </Label>
                    <Input
                      id="payRate"
                      type={isSelf ? "text" : "number"}
                      value={
                        isSelf
                          ? employee?.payRate !== undefined &&
                            employee?.payRate !== null
                            ? employee.payRate.toFixed(2)
                            : ""
                          : payRate
                      }
                      onChange={(e) => setPayRate(e.target.value)}
                      readOnly={isSelf}
                      disabled={isSelf}
                      placeholder="e.g., 18.50"
                      required={isNewEmployee}
                      min="0"
                      step="0.01"
                      className={`${fieldClass} ${
                        isSelf
                          ? "cursor-not-allowed bg-slate-100 dark:bg-slate-900"
                          : "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20"
                      }`}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="color" className="flex items-center gap-2">
                      <Palette className="h-4 w-4 text-fuchsia-600" />
                      Employee Color
                    </Label>

                    {isSelf ? (
                      <div className="flex h-11 items-center gap-3 rounded-xl border bg-slate-50 px-3 dark:bg-slate-900">
                        <div
                          className="h-7 w-7 rounded-full border-2 border-white shadow"
                          style={{ backgroundColor: color || "#000000" }}
                        />
                        <span className="text-sm text-muted-foreground">
                          Assigned by manager
                        </span>
                      </div>
                    ) : (
                      <div className="flex h-11 items-center gap-3 rounded-xl border border-fuchsia-200 bg-fuchsia-50/60 px-3 dark:border-fuchsia-900 dark:bg-fuchsia-950/20">
                        <Input
                          id="color"
                          type="color"
                          value={color}
                          onChange={(e) => setColor(e.target.value)}
                          className="h-8 w-12 cursor-pointer border-0 bg-transparent p-0"
                        />
                        <span className="font-mono text-xs font-medium uppercase text-fuchsia-700 dark:text-fuchsia-300">
                          {color}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* EMERGENCY CONTACT */}
            <section className={`${sectionCard} border-amber-100 dark:border-amber-950`}>
              <div className="flex items-center gap-3 border-b border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-4 dark:border-amber-950 dark:from-amber-950/50 dark:to-orange-950/40">
                <div className="rounded-xl bg-amber-500 p-2.5 text-white shadow-md shadow-amber-500/20">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    Emergency Contact
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Person to contact in an urgent situation
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="emergencyContactName">Contact Name</Label>
                  <Input
                    id="emergencyContactName"
                    value={emergencyContactName}
                    onChange={(e) => setEmergencyContactName(e.target.value)}
                    className={fieldClass}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="emergencyContactPhone">Contact Phone</Label>
                  <Input
                    id="emergencyContactPhone"
                    value={emergencyContactPhone}
                    onChange={(e) => setEmergencyContactPhone(e.target.value)}
                    className={fieldClass}
                  />
                </div>
              </div>
            </section>

            {/* DIRECT DEPOSIT */}
            <section className={`${sectionCard} border-emerald-100 dark:border-emerald-950`}>
              <div className="flex items-center gap-3 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-teal-50 px-5 py-4 dark:border-emerald-950 dark:from-emerald-950/50 dark:to-teal-950/40">
                <div className="rounded-xl bg-emerald-600 p-2.5 text-white shadow-md shadow-emerald-600/20">
                  <Landmark className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    Direct Deposit
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Secure payroll banking information
                  </p>
                </div>
              </div>

              <div className="space-y-4 p-5">
                <div className="space-y-2">
                  <Label htmlFor="bankName">Bank Name</Label>
                  <Input
                    id="bankName"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="Financial institution"
                    className={fieldClass}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="routingNumber">Routing Number</Label>
                    <Input
                      id="routingNumber"
                      value={routingNumber}
                      onChange={(e) => setRoutingNumber(e.target.value)}
                      inputMode="numeric"
                      autoComplete="off"
                      className={fieldClass}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="accountNumber">Account Number</Label>
                    <Input
                      id="accountNumber"
                      type="password"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      inputMode="numeric"
                      autoComplete="off"
                      className={fieldClass}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                  Banking information is sensitive. Limit access to authorized payroll administrators.
                </div>
              </div>
            </section>
          </div>
        </ScrollArea>

        <DialogFooter className="border-t bg-white px-5 py-4 shadow-[0_-6px_20px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-950">
          <DialogClose asChild>
            <Button variant="outline" className="h-11 rounded-xl px-5">
              Cancel
            </Button>
          </DialogClose>

          <Button
            onClick={handleSubmit}
            className="h-11 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 font-semibold text-white shadow-lg shadow-blue-600/20 hover:from-blue-700 hover:to-indigo-700"
          >
            {isNewEmployee ? (
              <UserPlus className="mr-2 h-4 w-4" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {isSelf
              ? "Submit Update Request"
              : isNewEmployee
                ? "Add Employee"
                : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}