"use client";

import {CompanyProvider }from "@/providers/CompanyProvider";
import { EngineProvider } from "@/providers/EngineProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <EngineProvider>
      <CompanyProvider>{children}</CompanyProvider>
    </EngineProvider>
  );
}
