"use client";

import Image from "next/image";
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
      <div className="flex items-center gap-3">
  <Image
    src="/managewisemd-logo.png"
    alt="ManageWiseMD"
    width={180}
    height={50}
    priority
    className="h-auto w-auto max-h-12 object-contain"
  />
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