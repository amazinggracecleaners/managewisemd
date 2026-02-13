"use client";

import { Clock } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface HeaderProps {
  tab: string;
  onTabChange: (tab: string) => void;
  isManager: boolean;
  isLoggedIn: boolean;
}

export function Header({ tab, onTabChange, isManager, isLoggedIn }: HeaderProps) {
  return (
    <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-3">
        <Clock className="w-8 h-8 text-primary" />
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground font-headline">
          TimeWise
        </h1>
      </div>
      {!isLoggedIn && (
        <Tabs value={tab} onValueChange={onTabChange} className="w-full sm:w-auto">
          <TabsList className="grid w-full grid-cols-2 sm:w-auto">
            <TabsTrigger value="employee">Employee</TabsTrigger>
            <TabsTrigger value="manager">Manager</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
    </header>
  );
}
