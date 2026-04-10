"use client";

import { Clock } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface HeaderProps {
  tab: string;
  onTabChange: (tab: string) => void;
  isManager: boolean;
  isLoggedIn: boolean;
}

export function Header({
  tab,
  onTabChange,
  isManager,
  isLoggedIn,
}: HeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex items-center gap-3">
        <Clock className="h-8 w-8 shrink-0 text-primary" />
        <h1 className="truncate text-2xl font-bold text-foreground font-headline sm:text-3xl">
          ManageWise
        </h1>
      </div>

      {!isLoggedIn && (
        <div className="w-full sm:w-auto overflow-x-auto">
          <Tabs
            value={tab}
            onValueChange={onTabChange}
            className="w-full sm:w-auto"
          >
            <TabsList className="grid w-full min-w-[220px] grid-cols-2 sm:w-auto">
              <TabsTrigger value="employee">Employee</TabsTrigger>
              <TabsTrigger value="manager">Manager</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}
    </header>
  );
}