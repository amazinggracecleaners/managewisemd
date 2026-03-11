"use client";

import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
} from "react";
import mitt from "mitt";

import { db } from "@/firebase/client";
import {
  FirestoreInvoicesRepo,
  LocalInvoicesRepo,
} from "@/features/invoices/repositories/FirestoreInvoicesRepo";
import type { InvoicesRepo } from "@/features/invoices/repositories/types";

type Engine = "cloud" | "local";

type RepoFactory = {
  invoices: () => InvoicesRepo;
};

type Events = {
  "permission-error": any;
};

const bus = mitt<Events>();

type EngineCtx = {
  engine: Engine;
  setEngine: (e: Engine) => void;
  repo: RepoFactory;
  bus: typeof bus;

  // ✅ NEW: lets the rest of the app know engine/localStorage has been read
  hydrated: boolean;
};

const Ctx = createContext<EngineCtx | null>(null);

function readSavedEngine(): Engine | null {
  // ✅ must guard window for Next runtime safety
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem("ops_engine");
  return v === "cloud" || v === "local" ? v : null;
}

export function EngineProvider({ children }: { children: React.ReactNode }) {
  // ✅ init synchronously so first render uses correct engine
  const [engine, setEngine] = useState<Engine>(() => readSavedEngine() ?? "cloud");
  const [hydrated, setHydrated] = useState(false);

  // ✅ mark hydration after mount (meaning localStorage is available)
  useEffect(() => {
    setHydrated(true);
  }, []);

  // ✅ persist engine changes (only after mount)
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("ops_engine", engine);
  }, [engine]);

  const repo = useMemo<RepoFactory>(() => {
    return {
      invoices: () =>
        engine === "cloud"
          ? new FirestoreInvoicesRepo(db)
          : new LocalInvoicesRepo(),
    };
  }, [engine]);

  return (
    <Ctx.Provider value={{ engine, setEngine, repo, bus, hydrated }}>
      {children}
    </Ctx.Provider>
  );
}

export function useEngine() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useEngine must be used within an EngineProvider");
  return v;
}