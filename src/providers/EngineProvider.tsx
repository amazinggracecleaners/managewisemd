
"use client";

import React, { createContext, useContext, useMemo, useState, useEffect } from "react";
import { FirestoreInvoicesRepo, LocalInvoicesRepo } from "@/features/invoices/repositories/FirestoreInvoicesRepo";
import type { InvoicesRepo } from "@/features/invoices/repositories/types";
import mitt from "mitt";

import { db } from "@/firebase/client"; // <-- the ONE firebase file
type Engine = "cloud" | "local";
type RepoFactory = { 
    invoices: () => InvoicesRepo;
    /* expenses: () => ExpensesRepo; */
};

type Events = {
  'permission-error': any;
};
const bus = mitt<Events>();

const Ctx = createContext<{ engine: Engine; setEngine: (e:Engine)=>void; repo: RepoFactory; bus: typeof bus }|null>(null);

export function EngineProvider({ children }: { children: React.ReactNode }) {
  const [engine, setEngine] = useState<Engine>("cloud");

  useEffect(() => {
    const savedEngine = localStorage.getItem("ops_engine");
    if (savedEngine === "cloud" || savedEngine === "local") {
      setEngine(savedEngine as Engine);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("ops_engine", engine);
  }, [engine]);


  const repo = useMemo(() => ({
    invoices: () => engine === "cloud" ? new FirestoreInvoicesRepo(db) : new LocalInvoicesRepo(),
    // expenses: () => engine === 'cloud' ? new FirestoreExpensesRepo() : new LocalExpensesRepo(),
  }), [engine]);

  return <Ctx.Provider value={{ engine, setEngine, repo, bus }}>{children}</Ctx.Provider>;
}

export const useEngine = () => {
  const v = useContext(Ctx); if (!v) throw new Error("useEngine must be used within an EngineProvider");
  return v;
};
