"use client";

import { EngineProvider } from "@/providers/EngineProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <EngineProvider>{children}</EngineProvider>;
}