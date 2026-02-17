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
import { cleanForFirestore } from "@/lib/utils";

// ✅ add these imports
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

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

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isManager
              ? isNewEmployee
                ? "Add New Employee"
                : `Edit Profile for ${employee?.name ?? "Employee"}`
              : "My Profile"}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] p-1">
          <div className="space-y-6 py-4 px-4">
            {/* PERSONAL INFO */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Personal Information</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    disabled={isSelf}
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
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dob">Date of Birth</Label>
                  <Input
                    id="dob"
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
            </div>

            {/* JOB DETAILS */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Job Details</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  {isSelf ? (
                    <>
                      <Input
                        id="title"
                        value={title}
                        readOnly
                        disabled
                        className="bg-muted cursor-not-allowed"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Only managers can change your title.
                      </p>
                    </>
                  ) : (
                    <Input
                      id="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g., Team Lead"
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pin">PIN</Label>
                  {isSelf ? (
                    <>
                      <Input
                        id="pin"
                        type="password"
                        value={employee?.pin ? "••••" : ""}
                        readOnly
                        disabled
                        className="bg-muted cursor-not-allowed"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Ask your manager if you need a PIN change.
                      </p>
                    </>
                  ) : (
                    <Input
                      id="pin"
                      type="text"
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      required
                    />
                  )}
                </div>
              </div>

              {/* ✅ NEW: TEAM PICKER (manager-only) */}
              {isManager && (
                <div className="space-y-2">
                  <Label>Team</Label>
                  {sortedTeams.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No teams yet. Add teams in Manager Settings → Teams.
                    </p>
                  ) : (
                    <Select value={teamId} onValueChange={setTeamId}>
                      <SelectTrigger>
                        <SelectValue placeholder="No team" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">No team</SelectItem>
                        {sortedTeams.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Teams are manager-only. Employees won’t see this field.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="payRate">Default Pay Rate ($/hour)</Label>
                  {isSelf ? (
                    <>
                      <Input
                        id="payRate"
                        type="text"
                        value={
                          employee?.payRate !== undefined &&
                          employee?.payRate !== null
                            ? employee.payRate.toFixed(2)
                            : ""
                        }
                        readOnly
                        disabled
                        className="bg-muted cursor-not-allowed"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Pay rate can only be updated by a manager.
                      </p>
                    </>
                  ) : (
                    <Input
                      id="payRate"
                      type="number"
                      value={payRate}
                      onChange={(e) => setPayRate(e.target.value)}
                      placeholder="e.g., 18.50"
                      required={isNewEmployee}
                      min="0"
                      step="0.01"
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="color">Color Tag</Label>
                  {isSelf ? (
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-full border"
                        style={{ backgroundColor: color || "#000000" }}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Badge color is assigned by a manager.
                      </p>
                    </div>
                  ) : (
                    <Input
                      id="color"
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="p-1 h-10"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* EMERGENCY CONTACT */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Emergency Contact</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="emergencyContactName">Contact Name</Label>
                  <Input
                    id="emergencyContactName"
                    value={emergencyContactName}
                    onChange={(e) => setEmergencyContactName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emergencyContactPhone">Contact Phone</Label>
                  <Input
                    id="emergencyContactPhone"
                    value={emergencyContactPhone}
                    onChange={(e) => setEmergencyContactPhone(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* DIRECT DEPOSIT */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Direct Deposit</h3>
              <div className="space-y-2">
                <Label htmlFor="bankName">Bank Name</Label>
                <Input
                  id="bankName"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="accountNumber">Account Number</Label>
                  <Input
                    id="accountNumber"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="routingNumber">Routing Number</Label>
                  <Input
                    id="routingNumber"
                    value={routingNumber}
                    onChange={(e) => setRoutingNumber(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSubmit}>
            {isSelf ? "Submit Update Request" : isNewEmployee ? "Add Employee" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
