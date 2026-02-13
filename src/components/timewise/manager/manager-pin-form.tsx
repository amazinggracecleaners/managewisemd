"use client";

import { useState } from "react";
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
import { ShieldCheck } from "lucide-react";

interface ManagerPinFormProps {
  managerPIN: string;
  setUnlocked: (unlocked: boolean) => void;
}

export function ManagerPinForm({
  managerPIN,
  setUnlocked,
}: ManagerPinFormProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const handleUnlock = () => {
    if (pin === managerPIN) {
      setUnlocked(true);
      setError(false);
    } else {
      setError(true);
    }
  };

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Manager Sign-In</CardTitle>
        <CardDescription>
          Enter your manager PIN to access the manager dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Label htmlFor="pin">Manager PIN</Label>
          <Input
            id="pin"
            type="password"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
              setError(false);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
            placeholder="****"
          />
        </div>
        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>Incorrect PIN. Please try again.</AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter>
        <Button onClick={handleUnlock} className="w-full bg-accent hover:bg-accent/90">
          <ShieldCheck />
          Unlock
        </Button>
      </CardFooter>
    </Card>
  );
}
