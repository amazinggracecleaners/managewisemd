"use client";

import { useState } from "react";
import type { Employee } from "@/shared/types/domain";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LogIn } from "lucide-react";

interface EmployeeLoginProps {
  employees: Employee[];
  onLogin: (employee: Employee) => void;
}

export function EmployeeLogin({ employees, onLogin }: EmployeeLoginProps) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const handleLogin = () => {
    setError("");
    const trimmedName = name.trim().toLowerCase();
    if (!trimmedName) {
      setError("Please enter your name.");
      return;
    }
    
    const employee = employees.find(e => {
        const fullName = e.name.toLowerCase();
        const firstName = e.firstName?.toLowerCase() || '';
        const lastName = e.lastName?.toLowerCase() || '';

        return fullName === trimmedName ||
               `${firstName} ${lastName}` === trimmedName ||
               firstName === trimmedName ||
               lastName === trimmedName;
    });

    if (!employee) {
      setError("Employee not found. Please check your name.");
      return;
    }

    if (employee.pin === pin) {
      onLogin(employee);
    } else {
      setError("Incorrect PIN. Please try again.");
    }
  };

  return (
    <div className="flex justify-center items-center py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Employee Login</CardTitle>
          <CardDescription>Enter your full name and PIN to clock in or out.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="employee-name">Your Full Name</Label>
            <Input
              id="employee-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., John Doe"
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pin">PIN</Label>
            <Input
              id="pin"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="****"
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Login Failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={handleLogin} className="w-full">
            <LogIn className="mr-2" /> Login
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
